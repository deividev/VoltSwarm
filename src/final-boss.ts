import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
  /** The player's CURRENT max HP. Every attack in this fight asks for a
   *  fraction of it (user 2026-08-19) rather than a flat number, so the boss
   *  keeps the same weight against a level-10 build and a level-45 one. Read
   *  per hit, never cached: Max HP cores land mid-fight. */
  playerMaxHp(): number;
  /** `y` lifts the cubes off the ground — for effects that leave the BODY. */
  burst(x: number, z: number, color: number, count: number, y?: number): void;
  ring(x: number, z: number, color: number, cubes: number, radius: number): void;
  shake(amp: number): void;
  banner(text: string): void;
  /** `x`/`z` make it a WORLD sound: attenuated by distance to the listener,
   *  per the standing rule. Omit them for anything centred on the player. */
  sound(id: AudioEventId, priority?: number, x?: number, z?: number): void;
}

/** Damage as a fraction of the player's max HP, floored at 1 so a percentage
 *  can never round down into a free hit. Armor, evasion and the shield all
 *  still apply afterwards — this is what the attack ASKS for, and the player's
 *  defences answer it exactly like they answer a Voltling. */
function pctDamage(effects: BossEffects, fraction: number): number {
  return Math.max(1, Math.round(effects.playerMaxHp() * fraction));
}

/** The subset of a pooled enemy the fight reads and writes. */
type BossActor = Pick<Enemy, 'x' | 'z' | 'speed' | 'hp' | 'maxHp' | 'heading'>;

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
    // Depth-tested even while other markers are not: scenery has to occlude a
    // telegraph this size or it reads as a sheet hovering over the foundry.
    // Still in the OPAQUE queue and still under the characters, so nothing of
    // the 2026-07-26 marker fix is given back.
    depthTest: VISUAL.bossTelegraphsUnderScenery || !VISUAL.groundMarkersOnTop,
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
  /** Seconds into the blow-up flash, or null when not blowing up. A marker that
   *  disappears on the damage frame reads as being switched off; one that whites
   *  out and expands reads as detonating. */
  private flashS: number | null = null;
  private flashRadius = 1;

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
    this.flashRadius = radius;
    this.flashS = null;
    this.base.setHex(color);
    this.mesh.visible = true;
  }

  /** Starts the blow-up flash. The marker stays on screen until it finishes. */
  detonate(): void {
    this.flashS = 0;
  }

  /** Advances the flash; returns true while it still owns the marker. */
  tickFlash(dt: number, durationS: number, scale: number): boolean {
    if (this.flashS === null) return false;
    this.flashS += dt;
    const k = Math.min(1, this.flashS / durationS);
    const material = this.mesh.material as THREE.MeshBasicMaterial;
    // White out, then to black: under additive blending black adds nothing, so
    // it fades rather than popping off.
    material.color.setScalar((1 - k) * 1.9);
    const radius = this.flashRadius * (1 + (scale - 1) * k);
    this.mesh.scale.set(radius, 1, radius);
    if (this.flashS < durationS) return true;
    this.flashS = null;
    this.hide();
    return false;
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

/**
 * One overload missile in flight, from the Marshal's back racks to its zone.
 *
 * It exists to make the attack's ORIGIN a body rather than the floor: the zone
 * was already telegraphed, but nothing said WHO was doing it. Flight time is
 * never chosen — it is the zone's own remaining telegraph, so the missile lands
 * on the eruption by construction and can never drift out of sync with it.
 */
class Missile {
  readonly mesh: THREE.Mesh;
  private fromX = 0;
  private fromY = 0;
  private fromZ = 0;
  private toX = 0;
  private toZ = 0;
  private elapsed = 0;
  private durationS = 1;
  private arc = 0;
  private trailDebt = 0;
  private trailCount = 0;
  live = false;

  constructor(scene: THREE.Scene, geometry: THREE.BufferGeometry, material: THREE.Material) {
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.visible = false;
    // Same layer as a character: a missile in the air must not be painted over
    // by the very ground markers it is flying toward.
    if (VISUAL.groundMarkersOnTop) this.mesh.renderOrder = VISUAL.renderOrders.character;
    scene.add(this.mesh);
  }

  launch(
    fromX: number,
    fromY: number,
    fromZ: number,
    toX: number,
    toZ: number,
    durationS: number,
  ): void {
    this.fromX = fromX;
    this.fromY = fromY;
    this.fromZ = fromZ;
    this.toX = toX;
    this.toZ = toZ;
    this.durationS = Math.max(0.08, durationS);
    this.arc = Math.hypot(toX - fromX, toZ - fromZ) * FINAL_BOSS.overload.missile.arcHeight;
    this.elapsed = 0;
    this.trailDebt = 0;
    this.live = true;
    this.mesh.visible = true;
    this.mesh.position.set(fromX, fromY, fromZ);
  }

  /** Advances the flight. Returns false once it has landed. */
  update(dt: number, trail: (x: number, y: number, z: number, hot: boolean) => void): boolean {
    if (!this.live) return false;
    this.elapsed += dt;
    const k = Math.min(1, this.elapsed / this.durationS);
    const x = this.fromX + (this.toX - this.fromX) * k;
    const z = this.fromZ + (this.toZ - this.fromZ) * k;
    // Straight line in the ground plane, parabola in height: it leaves upward
    // and comes down onto the mark, which is what reads as "launched".
    const y = this.fromY * (1 - k) + this.arc * 4 * k * (1 - k);
    this.mesh.position.set(x, y, z);
    // Nose follows the path, so the body is never seen flying sideways.
    this.mesh.rotation.y = Math.atan2(this.toX - this.fromX, this.toZ - this.fromZ);
    this.mesh.rotation.x = -Math.atan2(this.arc * 4 * (1 - 2 * k) - this.fromY, Math.hypot(this.toX - this.fromX, this.toZ - this.fromZ));
    // Roll in flight. Applied after the aim rotations so it spins about its own
    // long axis rather than wobbling the heading.
    this.mesh.rotateZ(this.elapsed * Math.PI * 2 * FINAL_BOSS.overload.missile.spinHz);
    // Exhaust comes off the TAIL, not the centre: a plume behind the body reads
    // as thrust, cubes falling off the middle read as damage.
    const m = FINAL_BOSS.overload.missile;
    const dirX = this.toX - this.fromX;
    const dirZ = this.toZ - this.fromZ;
    const length = Math.hypot(dirX, dirZ) || 1;
    const tailX = x - (dirX / length) * m.size * 1.2;
    const tailZ = z - (dirZ / length) * m.size * 1.2;
    this.trailDebt += dt * m.trailPerSecond;
    while (this.trailDebt >= 1) {
      this.trailDebt -= 1;
      this.trailCount++;
      trail(tailX, y, tailZ, this.trailCount % m.trailHotEvery === 0);
    }
    if (k < 1) return true;
    this.live = false;
    this.mesh.visible = false;
    return false;
  }

  stop(): void {
    this.live = false;
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
  /** Per-zone: the chain grows as it travels, so the damage circle and the
   *  marker have to come from the same number rather than from a constant. */
  radius: number;
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
  /** True once the "about to fire" cue has played for THIS telegraph, so it
   *  fires once per attack rather than once per frame of its last 0.4s. */
  private sweepWarned = false;
  /** Seconds since the discharge while the blast is still travelling, or null.
   *  The attack keeps drawing after it has already dealt its damage — that gap
   *  is the explosion. */
  private blastS: number | null = null;
  private blastStep = 0;
  private blastX = 0;
  private blastZ = 0;

  private assemblyTimer = 0;
  private readonly bays: PendingBay[] = [];
  /** Player position last frame, so the fight can lead a moving target. Tracked
   *  here rather than passed in: nothing else needs it, and a velocity computed
   *  from the same numbers the fight already receives cannot drift from them. */
  private lastPlayerX = 0;
  private lastPlayerZ = 0;
  private playerVelX = 0;
  private playerVelZ = 0;
  private hasPlayerVelocity = false;

  private overloadTimer = 0;
  private readonly zones: PendingZone[] = [];
  /** Markers mid-detonation. They no longer belong to a zone — the damage is
   *  already dealt — but they still own their marker until the flash ends, so
   *  takeMarker() cannot hand one out from under a live explosion. */
  private readonly flashing: ZoneMarker[] = [];

  private readonly missiles: Missile[] = [];
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

    // Three lines of zones can be in the air at once, and a drop ring can still
    // be counting down beside them. Two spare so a marker is never handed out
    // from under a live telegraph.
    const markerCount =
      FINAL_BOSS.overload.zones * FINAL_BOSS.overload.lines +
      Math.max(...FINAL_BOSS.assembly.dropPoints) +
      2;
    for (let i = 0; i < markerCount; i++) this.markerPool.push(new ZoneMarker(scene));

    // One missile per zone of a chain — they are all in the air at once.
    //
    // Built from voxel-sized blocks like the rest of the cast rather than as a
    // single stretched box: at this camera height a smooth capsule reads as a
    // dot, and the fins are what make its heading legible while it arcs.
    const missile = FINAL_BOSS.overload.missile;
    const unit = missile.size;
    const parts: THREE.BufferGeometry[] = [];
    const push = (
      geometry: THREE.BufferGeometry,
      x: number,
      y: number,
      z: number,
      color: number,
    ) => {
      geometry.translate(x, y, z);
      const count = geometry.getAttribute('position').count;
      const colors = new Float32Array(count * 3);
      const tint = new THREE.Color(color);
      for (let i = 0; i < count; i++) {
        colors[i * 3] = tint.r;
        colors[i * 3 + 1] = tint.g;
        colors[i * 3 + 2] = tint.b;
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      parts.push(geometry);
    };
    // Body, then a stepped nose (two shrinking blocks — a voxel cone), then
    // four fins at the tail and a white-hot exhaust block behind them.
    push(new THREE.BoxGeometry(unit, unit, unit * 1.6), 0, 0, 0, missile.color);
    push(new THREE.BoxGeometry(unit * 0.72, unit * 0.72, unit * 0.5), 0, 0, unit * 1.05, missile.noseColor);
    push(new THREE.BoxGeometry(unit * 0.4, unit * 0.4, unit * 0.4), 0, 0, unit * 1.45, missile.hotColor);
    for (const [fx, fy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      push(
        new THREE.BoxGeometry(fx === 0 ? unit * 0.28 : unit * 0.9, fy === 0 ? unit * 0.28 : unit * 0.9, unit * 0.5),
        fx * unit * 0.55,
        fy * unit * 0.55,
        -unit * 0.6,
        missile.color,
      );
    }
    push(new THREE.BoxGeometry(unit * 0.6, unit * 0.6, unit * 0.3), 0, 0, -unit * 1.0, missile.hotColor);
    const missileGeometry = mergeGeometries(parts) ?? new THREE.BoxGeometry(unit, unit, unit * 2);
    // Unlit and vertex-coloured: it is a hot object seen against a dark floor,
    // and bloom picks the white blocks out without touching the red body.
    const missileMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
    const missileCount = FINAL_BOSS.overload.zones * FINAL_BOSS.overload.lines;
    for (let i = 0; i < missileCount; i++) {
      this.missiles.push(new Missile(scene, missileGeometry, missileMaterial));
    }
  }

  /** Arms the fight for a freshly spawned Marshal. */
  begin(baseSpeed: number): void {
    this.reset();
    this.baseSpeed = baseSpeed;
    this.dischargeTimer = FINAL_BOSS.discharge.cooldownS[0] ?? 6.5;
    this.sweepTimer = FINAL_BOSS.sweep.firstDelayS;
    // Deliberately shorter than its cooldown: the first call should land while
    // the player is still learning the fight, not forty seconds in.
    this.assemblyTimer = FINAL_BOSS.assembly.firstDelayS;
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
    this.flashing.length = 0;
    for (const missile of this.missiles) missile.stop();
    this.blastS = null;
    this.sweepWarned = false;
    this.wedge.visible = false;
    this.wedge.scale.setScalar(1);
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
    this.trackPlayer(dt, px, pz);
    // Run before the phase/stagger gates: an explosion already paid for must
    // finish drawing even if the boss changes phase on the very next frame.
    this.tickBlast(dt, effects);
    for (const missile of this.missiles) {
      const m = FINAL_BOSS.overload.missile;
      missile.update(dt, (x, y, z, hot) =>
        effects.burst(x, z, hot ? m.hotColor : m.color, 1, y),
      );
    }
    for (let i = this.flashing.length - 1; i >= 0; i--) {
      const marker = this.flashing[i];
      if (!marker) continue;
      const cfg = FINAL_BOSS.overload;
      if (!marker.tickFlash(dt, cfg.flashS, cfg.flashScale)) this.flashing.splice(i, 1);
    }
    // Bays and zones run on their own clocks: once telegraphed they land even
    // if the boss is staggered, so a phase change can never eat a promise the
    // floor already made to the player.
    this.tickBays(dt, px, pz, enemies, obstacles, effects);
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
    // Reinforcements run in EVERY phase — with the ambient waves paused they
    // are the only thing that can take a moving player's space away, and
    // without that the rest of the kit has nothing to punish. The phase decides
    // how many lines open, not whether any do.
    this.tickAssembly(dt, boss, px, pz, busy, effects);
    if (this.phase >= 2) this.tickOverload(dt, boss, px, pz, busy, effects);
  }

  /** Smoothed player velocity. Smoothed because a raw per-frame delta is noisy
   *  enough that a lead built on it would jitter around the target instead of
   *  pointing at it. */
  private trackPlayer(dt: number, px: number, pz: number): void {
    if (dt <= 0) return;
    if (this.hasPlayerVelocity) {
      const blend = Math.min(1, dt * 6);
      this.playerVelX += ((px - this.lastPlayerX) / dt - this.playerVelX) * blend;
      this.playerVelZ += ((pz - this.lastPlayerZ) / dt - this.playerVelZ) * blend;
    }
    this.lastPlayerX = px;
    this.lastPlayerZ = pz;
    this.hasPlayerVelocity = true;
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
      this.sweepWarned = false;
      // The visible stop is the ORIGIN half of the attack.
      boss.speed = 0;
      this.wedge.position.x = boss.x;
      this.wedge.position.z = boss.z;
      this.wedge.rotation.y = wedgeRotationY(this.sweepAimX, this.sweepAimZ);
      this.wedge.scale.setScalar(1);
      this.wedge.visible = true;
      // Beat 1 of 3: the plates go live. Spatial, per the world-distance rule.
      effects.sound('boss-sweep-charge', 4, boss.x, boss.z);
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
    // Beat 2 of 3: the deadline. Emitted exactly warnLeadS before the discharge
    // and authored to be exactly that long, so its last sample IS the hit.
    if (!this.sweepWarned && this.sweepTimer <= cfg.warnLeadS) {
      this.sweepWarned = true;
      effects.sound('boss-sweep-warn', 5, boss.x, boss.z);
    }
    if (this.sweepTimer > 0) return;

    this.sweepPhase = 'cooldown';
    this.sweepTimer = cfg.cooldownS[this.phase] ?? 6;
    boss.speed = this.currentSpeed();

    // The wedge does NOT switch off here — it whites out and expands while the
    // blast travels down it (see tickBlast). Switching it off on the damage
    // frame is what made the attack look like it had been cancelled.
    this.blastS = 0;
    this.blastStep = 0;
    this.blastX = boss.x;
    this.blastZ = boss.z;

    // ORIGIN, on the body: the discharge tears out of the Marshal's chest…
    effects.burst(boss.x, boss.z, cfg.color, cfg.dischargeCount, cfg.dischargeHeight);
    effects.burst(boss.x, boss.z, cfg.hotColor, cfg.dischargeHotCount, cfg.dischargeHeight);
    // …and only then does the floor answer.
    effects.ring(boss.x, boss.z, cfg.color, cfg.ringCubes, cfg.ringRadius);
    effects.shake(cfg.shakeAmp);
    // Beat 3 of 3.
    effects.sound('boss-sweep-fire', 5, boss.x, boss.z);
    if (
      isInsideWedge(px, pz, boss.x, boss.z, this.sweepAimX, this.sweepAimZ, cfg.radius, cfg.halfAngleDeg)
    ) {
      effects.damagePlayer(pctDamage(effects, cfg.damagePct));
    }
  }

  /** The explosion, after the damage has already been dealt.
   *
   *  It TRAVELS: each step throws an arc of cubes further down the wedge, so
   *  what reads on screen is a wave running the length of the sector rather
   *  than a single puff at the boss's feet. The marker whites out and expands
   *  underneath it, then both end together — the attack finishes, it does not
   *  get switched off. */
  private tickBlast(dt: number, effects: BossEffects): void {
    if (this.blastS === null) return;
    const cfg = FINAL_BOSS.sweep;
    this.blastS += dt;

    while (this.blastStep < cfg.blastSteps && this.blastS >= this.blastStep * cfg.blastStepS) {
      // Steps 1..n of the way out, so the first arc is already clear of the
      // body and the last lands at the wedge's drawn edge.
      const reach = cfg.radius * ((this.blastStep + 1) / cfg.blastSteps);
      const half = (cfg.halfAngleDeg * Math.PI) / 180;
      const aim = Math.atan2(this.sweepAimZ, this.sweepAimX);
      for (let step = 0; step < cfg.arcSteps; step++) {
        const t = cfg.arcSteps > 1 ? step / (cfg.arcSteps - 1) : 0.5;
        const angle = aim - half + t * half * 2;
        effects.burst(
          this.blastX + Math.cos(angle) * reach,
          this.blastZ + Math.sin(angle) * reach,
          // The leading edge is white-hot, the body of the wave is amber.
          this.blastStep === cfg.blastSteps - 1 ? cfg.hotColor : cfg.color,
          cfg.burstPerStep,
        );
      }
      this.blastStep++;
    }

    const k = Math.min(1, this.blastS / cfg.flashS);
    const material = this.wedge.material as THREE.MeshBasicMaterial;
    // White out, then fall to black — under additive blending black contributes
    // nothing, so the marker fades out instead of popping off.
    material.color.setScalar((1 - k) * 1.6);
    this.wedge.scale.setScalar(1 + (cfg.flashScale - 1) * k);
    if (this.blastS >= cfg.flashS) {
      this.blastS = null;
      this.wedge.visible = false;
      this.wedge.scale.setScalar(1);
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
    // The battery firing, at the boss. Lowest priority of the three attacks:
    // MEASURED 2026-08-19 — at priority 4 against weapons at 5, half of the
    // sweep's discharges were dropped by the 14-voice sfx cap, so the fight's
    // biggest tell was silent every other time. The attacks now sit level with
    // weapon fire; the loop-protection above is what keeps that from costing a
    // weapon hum.
    // it is also the most frequent, and the loudness pyramid says the thing
    // that happens most often cannot be the loudest.
    effects.sound('boss-volley', 3, boss.x, boss.z);
    const aimedOffset = Math.atan2(px - boss.x, pz - boss.z);
    for (let index = 0; index < cfg.projectiles; index++) {
      const angle = aimedOffset + (index / cfg.projectiles) * Math.PI * 2;
      projectiles.fire(
        boss.x,
        boss.z,
        Math.sin(angle),
        Math.cos(angle),
        cfg.projectileSpeed,
        pctDamage(effects, cfg.projectileDamagePct),
        'marshal',
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
    this.assemblyTimer = cfg.cooldownS[this.phase] ?? 6.5;

    // Drops open AROUND WHERE THE PLAYER IS GOING, spread evenly with a random
    // offset so the same box never appears twice, and clamped inside the walls.
    const points = cfg.dropPoints[this.phase] ?? 1;
    const perPoint = cfg.perPoint[this.phase] ?? 4;
    const limit = PLAY_HALF_SIZE - 4;
    const offset = Math.random() * Math.PI * 2;
    // The lead is what makes this attack exist at all against a moving player:
    // over the 1.4s telegraph a runner covers 15 units, more than the ring's
    // own radius, so a box drawn around their current position closes on empty
    // floor behind them.
    let leadX = this.playerVelX * cfg.telegraphS * cfg.leadFraction;
    let leadZ = this.playerVelZ * cfg.telegraphS * cfg.leadFraction;
    const lead = Math.hypot(leadX, leadZ);
    if (lead > cfg.leadMax) {
      leadX = (leadX / lead) * cfg.leadMax;
      leadZ = (leadZ / lead) * cfg.leadMax;
    }
    const targetX = px + leadX;
    const targetZ = pz + leadZ;
    let opened = 0;
    for (let i = 0; i < points; i++) {
      const marker = this.takeMarker();
      if (!marker) break;
      const angle = offset + (i / points) * Math.PI * 2;
      // Per phase: the more drops open at once, the further out they sit, so
      // six of them cannot all land inside one reaction (user 2026-08-19).
      const ring = cfg.ringRadius[this.phase] ?? cfg.ringRadius[cfg.ringRadius.length - 1] ?? 9;
      const distance = ring + (Math.random() - 0.5) * 2 * cfg.ringRadiusJitter;
      const x = THREE.MathUtils.clamp(targetX + Math.cos(angle) * distance, -limit, limit);
      const z = THREE.MathUtils.clamp(targetZ + Math.sin(angle) * distance, -limit, limit);
      marker.show(x, z, cfg.markerRadius, cfg.color);
      marker.setCharge(0);
      this.bays.push({
        x,
        z,
        timer: cfg.telegraphS,
        marker,
        typeIndex: cfg.typeIndexes[i % cfg.typeIndexes.length] ?? 0,
        count: perPoint,
      });
      opened++;
    }
    if (opened > 0) {
      // Two halves: the call comes FROM the boss, the bodies land where the
      // markers are. Without the burst at the body it reads as the floor
      // deciding to spawn enemies on its own.
      effects.burst(boss.x, boss.z, cfg.color, 12);
      // The ORDER, at the boss, 1.4s before the bays land their bodies. It used
      // to emit a `boss-attack` placeholder that was never enabled, so it died
      // inside emit() and this telegraph had no sound at all — only its child,
      // `boss-assembly-spawn`, did. Priority above that child: one order, up to
      // six spawns, and the order must not be stolen by its own consequences.
      effects.sound('boss-assembly-open', 4, boss.x, boss.z);
    }
  }

  private tickBays(
    dt: number,
    px: number,
    pz: number,
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
      // Materialising ON someone costs them: the drop was lit for 1.4s, so
      // standing in it is a choice. Paid before the budget check below — the
      // zone went off whether or not the field had room for more bodies.
      if (Math.hypot(px - bay.x, pz - bay.z) <= cfg.markerRadius) {
        effects.damagePlayer(pctDamage(effects, cfg.damagePct));
      }
      // The one electric cue in the fight: matter arriving, not an attack.
      effects.sound('boss-assembly-spawn', 3, bay.x, bay.z);
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
          // free lane of paper enemies at the hardest minute of the run — plus
          // a little more, because these are the boss's and have to survive
          // long enough to actually take space.
          enemies.waveHpMultiplier * cfg.hpMultiplier,
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
    // Perpendicular to the firing line, for the lateral offsets of the outer
    // lines. Parallel lines, not a radial fan: see FINAL_BOSS.overload.lines.
    const px90 = -nz;
    const pz90 = nx;
    const m = cfg.missile;
    const backX = -Math.sin(boss.heading) * m.backOffset;
    const backZ = -Math.cos(boss.heading) * m.backOffset;
    const limit = PLAY_HALF_SIZE - cfg.zoneRadiusEnd;
    const middle = (cfg.lines - 1) / 2;
    let launched = 0;
    for (let i = 0; i < cfg.zones; i++) {
      // The chain is SEQUENTIAL: each step erupts one beat after the last, so
      // the attack reads as a wave travelling outward rather than as a dozen
      // discs appearing at once. All three lines of a step share its beat —
      // that simultaneity is what makes them a wall with lanes.
      const flightS = cfg.telegraphS + i * cfg.zoneStepS;
      const reach = cfg.firstDistance + i * cfg.stepDistance;
      // Every zone is bigger than the one before it: the blast grows as it
      // leaves the boss, and the dodge lanes narrow with it.
      const radius =
        cfg.zones > 1
          ? cfg.zoneRadiusStart + (cfg.zoneRadiusEnd - cfg.zoneRadiusStart) * (i / (cfg.zones - 1))
          : cfg.zoneRadiusStart;
      for (let line = 0; line < cfg.lines; line++) {
        const marker = this.takeMarker();
        if (!marker) break;
        const lateral = (line - middle) * cfg.lineOffset;
        const x = THREE.MathUtils.clamp(boss.x + nx * reach + px90 * lateral, -limit, limit);
        const z = THREE.MathUtils.clamp(boss.z + nz * reach + pz90 * lateral, -limit, limit);
        marker.show(x, z, radius, cfg.color);
        marker.setCharge(0);
        this.zones.push({ x, z, radius, timer: flightS, marker });
        // …and a missile leaves the Marshal's BACK for it, arriving exactly when
        // it blows. One rack per zone, so a wave of three launches together.
        const missile = this.missiles[launched++];
        if (missile) {
          // The model faces +Z rotated by its heading, so its back is the
          // opposite of that — see the enemy matrix write in enemies.ts.
          missile.launch(boss.x + backX, m.launchHeight, boss.z + backZ, x, z, flightS);
        }
      }
      // One flare per WAVE rather than per missile: three at the same point in
      // the same frame is the same picture at triple the particle cost.
      effects.burst(boss.x + backX, boss.z + backZ, m.color, m.launchBurst, m.launchHeight);
      effects.burst(boss.x + backX, boss.z + backZ, m.hotColor, Math.round(m.launchBurst / 2), m.launchHeight);
    }
    if (this.zones.length > 0) {
      effects.burst(boss.x, boss.z, cfg.hotColor, 10);
      // The core unlocking, AT the boss: origin half of the attack. Each link
      // then speaks for itself as it blows (tickZones).
      effects.sound('boss-overload-open', 4, boss.x, boss.z);
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
      // The marker DETONATES rather than switching off; the flash outlives the
      // damage frame and is ticked below until it finishes.
      zone.marker.detonate();
      this.flashing.push(zone.marker);
      this.zones.splice(i, 1);
      // Three layers, same language as every other detonation in the game: the
      // body of the blast, a white-hot core, and a ground ring showing exactly
      // where it stopped.
      effects.burst(zone.x, zone.z, cfg.color, cfg.burstCount);
      effects.burst(zone.x, zone.z, cfg.hotColor, cfg.hotCount);
      // The ring shows where THIS zone stopped, so it scales with it — a fixed
      // radius would sit inside the big far zones and outside the small near
      // ones, which is worse than no ring at all.
      effects.ring(zone.x, zone.z, cfg.color, cfg.ringCubes, zone.radius * cfg.ringRadiusScale);
      effects.shake(cfg.shakeAmp);
      // Each link blows WHERE it blows, so a chain marching away from the player
      // is heard receding — the sequence is the information they dodge on.
      effects.sound('boss-overload-erupt', 4, zone.x, zone.z);
      const dx = px - zone.x;
      const dz = pz - zone.z;
      if (dx * dx + dz * dz <= zone.radius * zone.radius) {
        effects.damagePlayer(pctDamage(effects, cfg.damagePct));
      }
    }
  }

  private takeMarker(): ZoneMarker | null {
    for (const marker of this.markerPool) {
      if (!marker.mesh.visible) return marker;
    }
    return null;
  }
}
