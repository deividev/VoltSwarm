import * as THREE from 'three';
import { FINAL_BOSS, PLAY_HALF_SIZE, VISUAL } from './config';
import type { AudioEventId } from './audio';
import type { Enemy, EnemySystem } from './enemies';
import type { EnemyProjectiles } from './enemy-projectiles';
import type { Obstacle } from './world';

/** Everything the fight needs from the game shell. Passed in rather than
 *  reached for, because the boss system is built before the HUD and the
 *  particle pools exist (see Game's constructor order). */
export interface BossEffects {
  damagePlayer(amount: number): void;
  burst(x: number, z: number, color: number, count: number): void;
  ring(x: number, z: number, color: number, cubes: number, radius: number): void;
  shake(amp: number): void;
  banner(text: string): void;
  sound(id: AudioEventId, priority?: number): void;
}

/** The subset of a pooled enemy the fight reads and writes. */
type BossActor = Pick<Enemy, 'x' | 'z' | 'speed' | 'hp' | 'maxHp'>;

/** Ground telegraphs follow the marker rules that already bit this project:
 *  they live in the OPAQUE queue (a transparent marker is drawn after every
 *  opaque mesh, so scenery chops it), their opacity is BAKED INTO THE COLOUR
 *  (material.opacity is ignored outside the transparent queue), and the render
 *  order is set per mesh because it is not inherited from a Group. */
function markerMaterial(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    vertexColors: true,
    transparent: !VISUAL.groundMarkersOnTop,
    depthWrite: false,
    depthTest: !VISUAL.groundMarkersOnTop,
    blending: THREE.AdditiveBlending,
  });
}

/** Bakes a per-vertex intensity so the marker fades toward its rim instead of
 *  ending in the hard grey plate a flat circle reads as. Under additive
 *  blending black contributes nothing, which is a real falloff without a
 *  texture or a second pass. */
function bakeRadialFalloff(geometry: THREE.BufferGeometry, radius: number, rimBoost: number): void {
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const dist = Math.hypot(position.getX(i), position.getZ(i));
    const t = radius > 0 ? Math.min(1, dist / radius) : 0;
    // Bright rim, dimmer middle: the EDGE is the information (where the hit
    // stops), so it is the part that must survive a crowded floor.
    const strength = 0.35 + rimBoost * t * t;
    colors[i * 3] = strength;
    colors[i * 3 + 1] = strength;
    colors[i * 3 + 2] = strength;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/** One reusable circular ground telegraph. */
class ZoneMarker {
  readonly mesh: THREE.Mesh;
  private readonly base = new THREE.Color();

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.CircleGeometry(1, 28);
    geometry.rotateX(-Math.PI / 2);
    bakeRadialFalloff(geometry, 1, 0.9);
    this.mesh = new THREE.Mesh(geometry, markerMaterial(0xffffff));
    this.mesh.position.y = FINAL_BOSS.markerY;
    this.mesh.visible = false;
    this.mesh.renderOrder = VISUAL.renderOrders.groundMarker;
    scene.add(this.mesh);
  }

  show(x: number, z: number, radius: number, color: number): void {
    this.mesh.position.x = x;
    this.mesh.position.z = z;
    this.mesh.scale.set(radius, 1, radius);
    this.base.setHex(color);
    this.mesh.visible = true;
  }

  /** `charge` 0..1 — how far into its telegraph the zone is. */
  setCharge(charge: number): void {
    const material = this.mesh.material as THREE.MeshBasicMaterial;
    // Ramp plus a pulse: a marker that only brightens can be mistaken for
    // scenery lighting, a marker that only blinks hides its own deadline.
    const pulse = 0.82 + 0.18 * Math.sin(charge * Math.PI * 12);
    material.color.copy(this.base).multiplyScalar((0.3 + 0.7 * charge) * pulse);
  }

  hide(): void {
    this.mesh.visible = false;
  }
}

/** The angle a wedge marker must be rotated by to point along (dx, dz).
 *
 *  Exported because it is the one piece of this file that is pure geometry and
 *  silently wrong-by-90-degrees is exactly the kind of bug a screenshot hides:
 *  RingGeometry is authored in XY and rotated into XZ, which flips the sign of
 *  the Z term. Verified against real THREE math in tools/final-boss.test.mjs. */
export function wedgeRotationY(dx: number, dz: number): number {
  return Math.atan2(-dz, dx);
}

/** True when (px, pz) is inside the wedge centred at (bx, bz) aiming along
 *  (dx, dz). Pure, so the hit rule can be tested without a renderer. */
export function isInsideWedge(
  px: number,
  pz: number,
  bx: number,
  bz: number,
  dx: number,
  dz: number,
  radius: number,
  halfAngleDeg: number,
): boolean {
  const toX = px - bx;
  const toZ = pz - bz;
  const dist = Math.hypot(toX, toZ);
  if (dist > radius || dist < 0.0001) return dist <= radius;
  const cos = (toX * dx + toZ * dz) / dist;
  return cos >= Math.cos((halfAngleDeg * Math.PI) / 180);
}

type AttackPhase = 'cooldown' | 'telegraph';

interface PendingBay {
  x: number;
  z: number;
  timer: number;
  marker: ZoneMarker;
  typeIndex: number;
  count: number;
}

interface PendingZone {
  x: number;
  z: number;
  timer: number;
  marker: ZoneMarker;
}

/**
 * The Hazard Marshal's three-phase fight (docs/PLAN_MAPA2.md §3.B).
 *
 * Phases are cumulative and gated by LIFE, never by the clock:
 *   1. Sector sweep      — a telegraphed wedge of floor discharges.
 *   2. + Assembly lines  — intake bays on the perimeter feed reinforcements.
 *   3. + Core overload   — a chain of hazard zones erupts outward from the boss.
 *
 * One attack telegraphs at a time. That is a hard rule, not tuning: the one
 * ground-zone attack this project rejected on sight (Crusher stage C) failed
 * because four events shared a single frame, so the zone was born outside the
 * focus the rest of the frame had already grabbed.
 */
export class FinalBossFight {
  /** 0-based phase index; FINAL_BOSS.phaseThresholds has one entry per step up. */
  private phase = 0;
  private staggerS = 0;
  private baseSpeed = 0;

  private dischargePhase: AttackPhase = 'cooldown';
  private dischargeTimer = 0;

  private sweepPhase: AttackPhase = 'cooldown';
  private sweepTimer = 0;
  private sweepAimX = 1;
  private sweepAimZ = 0;

  private assemblyTimer = 0;
  private readonly bays: PendingBay[] = [];

  private overloadTimer = 0;
  private readonly zones: PendingZone[] = [];

  private readonly wedge: THREE.Mesh;
  private readonly wedgeBase = new THREE.Color(FINAL_BOSS.sweep.color);
  private readonly markerPool: ZoneMarker[] = [];

  constructor(scene: THREE.Scene) {
    const { halfAngleDeg, radius, color } = FINAL_BOSS.sweep;
    const half = (halfAngleDeg * Math.PI) / 180;
    // Authored centred on +X so wedgeRotationY() is the only place the
    // XY-to-XZ sign flip has to be reasoned about.
    const geometry = new THREE.RingGeometry(2.4, radius, 36, 1, -half, half * 2);
    geometry.rotateX(-Math.PI / 2);
    bakeRadialFalloff(geometry, radius, 0.85);
    this.wedge = new THREE.Mesh(geometry, markerMaterial(color));
    this.wedge.position.y = FINAL_BOSS.markerY + 0.01;
    this.wedge.visible = false;
    this.wedge.renderOrder = VISUAL.renderOrders.groundMarker;
    scene.add(this.wedge);

    const markerCount = FINAL_BOSS.overload.zones + FINAL_BOSS.assembly.bays;
    for (let i = 0; i < markerCount; i++) this.markerPool.push(new ZoneMarker(scene));
  }

  /** Arms the fight for a freshly spawned Marshal. */
  begin(baseSpeed: number): void {
    this.reset();
    this.baseSpeed = baseSpeed;
    this.dischargeTimer = FINAL_BOSS.discharge.cooldownS[0] ?? 6.5;
    this.sweepTimer = FINAL_BOSS.sweep.firstDelayS;
    this.assemblyTimer = FINAL_BOSS.assembly.cooldownS;
    this.overloadTimer = FINAL_BOSS.overload.cooldownS;
  }

  /** Clears every live telegraph. Called when the boss dies, the run ends or
   *  the map changes — a marker outliving its owner is a lie on the floor. */
  reset(): void {
    this.phase = 0;
    this.staggerS = 0;
    this.dischargePhase = 'cooldown';
    this.sweepPhase = 'cooldown';
    this.bays.length = 0;
    this.zones.length = 0;
    this.wedge.visible = false;
    for (const marker of this.markerPool) marker.hide();
  }

  /** Current phase as a 1-based number, for the HUD and telemetry. */
  get phaseNumber(): number {
    return this.phase + 1;
  }

  update(
    dt: number,
    boss: BossActor,
    px: number,
    pz: number,
    projectiles: EnemyProjectiles,
    enemies: EnemySystem,
    obstacles: Obstacle[],
    effects: BossEffects,
  ): void {
    // Bays and zones run on their own clocks: once telegraphed they land even
    // if the boss is staggered, so a phase change can never eat a promise the
    // floor already made to the player.
    this.tickBays(dt, enemies, obstacles, effects);
    this.tickZones(dt, px, pz, effects);

    if (this.advancePhase(boss, effects)) return;
    if (this.staggerS > 0) {
      this.staggerS -= dt;
      boss.speed = 0;
      if (this.staggerS <= 0) boss.speed = this.currentSpeed();
      return;
    }

    const busy =
      this.dischargePhase !== 'cooldown' ||
      this.sweepPhase !== 'cooldown' ||
      this.zones.length > 0 ||
      this.bays.length > 0;

    this.tickSweep(dt, boss, px, pz, busy, effects);
    this.tickDischarge(dt, boss, px, pz, busy, projectiles, enemies, effects);
    if (this.phase >= 1) this.tickAssembly(dt, boss, px, pz, busy, effects);
    if (this.phase >= 2) this.tickOverload(dt, boss, px, pz, busy, effects);
  }

  private currentSpeed(): number {
    return this.phase >= 2 ? this.baseSpeed * FINAL_BOSS.overload.speedMult : this.baseSpeed;
  }

  /** Returns true when a phase change fired this frame (the fight yields the
   *  rest of the frame to the stagger). */
  private advancePhase(boss: BossActor, effects: BossEffects): boolean {
    const threshold = FINAL_BOSS.phaseThresholds[this.phase];
    if (threshold === undefined || boss.maxHp <= 0) return false;
    if (boss.hp / boss.maxHp > threshold) return false;

    this.phase += 1;
    this.staggerS = FINAL_BOSS.phaseChange.staggerS;
    boss.speed = 0;
    // Every live telegraph is cancelled: the floor must not keep a promise the
    // boss just interrupted to roar.
    this.sweepPhase = 'cooldown';
    this.dischargePhase = 'cooldown';
    this.wedge.visible = false;
    this.sweepTimer = FINAL_BOSS.sweep.cooldownS[this.phase] ?? 6;
    this.dischargeTimer = FINAL_BOSS.discharge.cooldownS[this.phase] ?? 5.5;

    const change = FINAL_BOSS.phaseChange;
    effects.burst(boss.x, boss.z, change.burstColor, change.burstCount);
    effects.burst(boss.x, boss.z, change.hotColor, change.hotCount);
    effects.ring(boss.x, boss.z, change.ringColor, change.ringCubes, change.ringRadius);
    effects.shake(change.shakeAmp);
    effects.banner(this.phase === 1 ? 'ASSEMBLY LINES ONLINE' : 'CORE OVERLOAD');
    // Reuses the awakening cue on purpose: a phase change IS the boss waking up
    // angrier, and it is the only boss stinger with an authored asset today.
    effects.sound('boss-awaken', 3);
    return true;
  }

  // --- Phase 1: sector sweep ------------------------------------------------

  private tickSweep(
    dt: number,
    boss: BossActor,
    px: number,
    pz: number,
    busy: boolean,
    effects: BossEffects,
  ): void {
    const cfg = FINAL_BOSS.sweep;
    if (this.sweepPhase === 'cooldown') {
      this.sweepTimer -= dt;
      if (this.sweepTimer > 0 || busy) return;
      // Aim is LOCKED when the telegraph starts, not when it fires: a wedge
      // that tracked the player would be an unavoidable hit wearing a warning.
      const dx = px - boss.x;
      const dz = pz - boss.z;
      const dist = Math.hypot(dx, dz) || 1;
      this.sweepAimX = dx / dist;
      this.sweepAimZ = dz / dist;
      this.sweepPhase = 'telegraph';
      this.sweepTimer = cfg.telegraphS;
      // The visible stop is the ORIGIN half of the attack.
      boss.speed = 0;
      this.wedge.position.x = boss.x;
      this.wedge.position.z = boss.z;
      this.wedge.rotation.y = wedgeRotationY(this.sweepAimX, this.sweepAimZ);
      this.wedge.visible = true;
      return;
    }

    this.sweepTimer -= dt;
    // The wedge follows the rooted body so it cannot drift off its own origin.
    this.wedge.position.x = boss.x;
    this.wedge.position.z = boss.z;
    const charge = 1 - Math.max(0, this.sweepTimer) / cfg.telegraphS;
    const material = this.wedge.material as THREE.MeshBasicMaterial;
    const pulse = 0.8 + 0.2 * Math.sin(charge * Math.PI * 14);
    material.color.copy(this.wedgeBase).multiplyScalar((0.32 + 0.68 * charge) * pulse);
    if (this.sweepTimer > 0) return;

    this.sweepPhase = 'cooldown';
    this.sweepTimer = cfg.cooldownS[this.phase] ?? 6;
    this.wedge.visible = false;
    boss.speed = this.currentSpeed();

    // Cube fan along the arc: the DESTINATION half, drawn where the damage is.
    const half = (cfg.halfAngleDeg * Math.PI) / 180;
    const aim = Math.atan2(this.sweepAimZ, this.sweepAimX);
    for (let step = 0; step < cfg.arcSteps; step++) {
      const t = cfg.arcSteps > 1 ? step / (cfg.arcSteps - 1) : 0.5;
      const angle = aim - half + t * half * 2;
      const reach = cfg.radius * 0.78;
      effects.burst(
        boss.x + Math.cos(angle) * reach,
        boss.z + Math.sin(angle) * reach,
        cfg.color,
        cfg.burstPerStep,
      );
    }
    effects.burst(boss.x, boss.z, cfg.hotColor, 8);
    effects.sound('boss-attack', 2);
    if (
      isInsideWedge(px, pz, boss.x, boss.z, this.sweepAimX, this.sweepAimZ, cfg.radius, cfg.halfAngleDeg)
    ) {
      effects.damagePlayer(cfg.damage);
    }
  }

  // --- Baseline discharge ---------------------------------------------------

  private tickDischarge(
    dt: number,
    boss: BossActor,
    px: number,
    pz: number,
    busy: boolean,
    projectiles: EnemyProjectiles,
    enemies: EnemySystem,
    effects: BossEffects,
  ): void {
    const cfg = FINAL_BOSS.discharge;
    this.dischargeTimer -= dt;
    if (this.dischargeTimer > 0) return;
    if (this.dischargePhase === 'cooldown') {
      if (busy) return;
      this.dischargePhase = 'telegraph';
      this.dischargeTimer = cfg.telegraphS;
      boss.speed = 0;
      return;
    }

    this.dischargePhase = 'cooldown';
    this.dischargeTimer = cfg.cooldownS[this.phase] ?? 5.5;
    boss.speed = this.currentSpeed();
    enemies.shoveAwayFrom(boss.x, boss.z, cfg.shoveRadius, cfg.shoveForce);
    effects.sound('boss-attack', 2);
    const aimedOffset = Math.atan2(px - boss.x, pz - boss.z);
    for (let index = 0; index < cfg.projectiles; index++) {
      const angle = aimedOffset + (index / cfg.projectiles) * Math.PI * 2;
      projectiles.fire(
        boss.x,
        boss.z,
        Math.sin(angle),
        Math.cos(angle),
        cfg.projectileSpeed,
        cfg.projectileDamage,
        'tesla',
      );
    }
  }

  // --- Phase 2: assembly lines ---------------------------------------------

  private tickAssembly(
    dt: number,
    boss: BossActor,
    px: number,
    pz: number,
    busy: boolean,
    effects: BossEffects,
  ): void {
    const cfg = FINAL_BOSS.assembly;
    this.assemblyTimer -= dt;
    if (this.assemblyTimer > 0 || busy) return;
    this.assemblyTimer = cfg.cooldownS;

    // Bays open on the perimeter, on the side of the arena the player is
    // playing on: a bay behind the far wall is a spawn the player never sees.
    const bearing = Math.atan2(pz, px);
    const limit = PLAY_HALF_SIZE - 6;
    for (let i = 0; i < cfg.bays; i++) {
      const spread = cfg.bays > 1 ? (i / (cfg.bays - 1) - 0.5) * 1.6 : 0;
      const angle = bearing + spread;
      const marker = this.takeMarker();
      if (!marker) break;
      const x = THREE.MathUtils.clamp(Math.cos(angle) * cfg.bayDistance, -limit, limit);
      const z = THREE.MathUtils.clamp(Math.sin(angle) * cfg.bayDistance, -limit, limit);
      marker.show(x, z, 3.6, cfg.color);
      marker.setCharge(0);
      this.bays.push({
        x,
        z,
        timer: cfg.telegraphS,
        marker,
        typeIndex: cfg.typeIndexes[i % cfg.typeIndexes.length] ?? 0,
        count: cfg.perBay,
      });
    }
    if (this.bays.length > 0) {
      effects.burst(boss.x, boss.z, cfg.color, 10);
      effects.sound('boss-attack', 2);
    }
  }

  private tickBays(
    dt: number,
    enemies: EnemySystem,
    obstacles: Obstacle[],
    effects: BossEffects,
  ): void {
    const cfg = FINAL_BOSS.assembly;
    for (let i = this.bays.length - 1; i >= 0; i--) {
      const bay = this.bays[i];
      if (!bay) continue;
      bay.timer -= dt;
      bay.marker.setCharge(1 - Math.max(0, bay.timer) / cfg.telegraphS);
      if (bay.timer > 0) continue;
      bay.marker.hide();
      this.bays.splice(i, 1);
      // The spawner is already refilling toward its own cap; the finale must
      // not double-fill the field on top of it.
      if (enemies.activeCount >= cfg.maxActiveBodies) continue;
      for (let n = 0; n < bay.count; n++) {
        const angle = (n / bay.count) * Math.PI * 2;
        enemies.spawnAt(
          bay.typeIndex,
          bay.x + Math.cos(angle) * 2.4,
          bay.z + Math.sin(angle) * 2.4,
          // The wave's OWN multiplier, not spawnAt's default of 1: reinforcements
          // have to be as tough as the swarm they walk into, or the phase is a
          // free lane of paper enemies at the hardest minute of the run.
          enemies.waveHpMultiplier,
          false,
          obstacles,
        );
      }
      effects.burst(bay.x, bay.z, cfg.color, 14);
    }
  }

  // --- Phase 3: core overload ----------------------------------------------

  private tickOverload(
    dt: number,
    boss: BossActor,
    px: number,
    pz: number,
    busy: boolean,
    effects: BossEffects,
  ): void {
    const cfg = FINAL_BOSS.overload;
    this.overloadTimer -= dt;
    if (this.overloadTimer > 0 || busy) return;
    this.overloadTimer = cfg.cooldownS;

    const dx = px - boss.x;
    const dz = pz - boss.z;
    const dist = Math.hypot(dx, dz) || 1;
    const nx = dx / dist;
    const nz = dz / dist;
    const limit = PLAY_HALF_SIZE - cfg.zoneRadius;
    for (let i = 0; i < cfg.zones; i++) {
      const marker = this.takeMarker();
      if (!marker) break;
      const reach = cfg.firstDistance + i * cfg.stepDistance;
      const x = THREE.MathUtils.clamp(boss.x + nx * reach, -limit, limit);
      const z = THREE.MathUtils.clamp(boss.z + nz * reach, -limit, limit);
      marker.show(x, z, cfg.zoneRadius, cfg.color);
      marker.setCharge(0);
      // The chain is SEQUENTIAL: each link erupts one step after the last, so
      // the attack is read as a line travelling outward rather than as four
      // discs appearing at once.
      this.zones.push({ x, z, timer: cfg.telegraphS + i * cfg.zoneStepS, marker });
    }
    if (this.zones.length > 0) {
      effects.burst(boss.x, boss.z, cfg.hotColor, 10);
      effects.sound('boss-attack', 2);
    }
  }

  private tickZones(dt: number, px: number, pz: number, effects: BossEffects): void {
    const cfg = FINAL_BOSS.overload;
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const zone = this.zones[i];
      if (!zone) continue;
      zone.timer -= dt;
      zone.marker.setCharge(1 - Math.max(0, zone.timer) / cfg.telegraphS);
      if (zone.timer > 0) continue;
      zone.marker.hide();
      this.zones.splice(i, 1);
      effects.burst(zone.x, zone.z, cfg.color, 16);
      effects.burst(zone.x, zone.z, cfg.hotColor, 5);
      const dx = px - zone.x;
      const dz = pz - zone.z;
      if (dx * dx + dz * dz <= cfg.zoneRadius * cfg.zoneRadius) effects.damagePlayer(cfg.damage);
    }
  }

  private takeMarker(): ZoneMarker | null {
    for (const marker of this.markerPool) {
      if (!marker.mesh.visible) return marker;
    }
    return null;
  }
}
