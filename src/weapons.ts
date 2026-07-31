import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { AUDIO, BOSS_TARGET_BIAS, BOSS_TARGET_BIAS_BASE, BOSS_TYPE_INDEXES, VISUAL, WEAPONS, levelScale, quantityBonus, weaponBranchMultiplier, type BranchWeaponId, type WeaponBranchId, type WeaponId } from './config';
import { litMaterial } from './toon';
import type { EnemySystem } from './enemies';
import type { PlayerStats } from './stats';
import type { WeaponBranchLevels, WeaponLevels, WeaponPower } from './upgrades';
import { hasLineOfSight, segmentHitsObstacle, type Obstacle } from './world';

// Every weapon reads the shared stat sheet plus its own level. Damage is
// routed through CombatCtx.dealDamage, which owns crit rolls, damage numbers,
// orb drops and kill accounting — weapons only decide WHO gets hit and the
// base amount.

export interface CombatCtx {
  stats: PlayerStats;
  enemies: EnemySystem;
  /** Snapshot compatibility only; combat must not read aggregate WeaponPower. */
  weaponPower: WeaponPower;
  /** Sole source of live weapon-upgrade scaling. */
  weaponBranches: WeaponBranchLevels;
  obstacles: Obstacle[];
  /** Rolls crit, applies damage, shows the number, handles death rewards.
   *  `hitColor` sparks a voxel pop in the weapon's icon accent at the victim
   *  (icon↔VFX coherence + two-halves rule, 2026-07-11). */
  dealDamage(
    enemyIndex: number,
    baseDamage: number,
    hitColor: number | undefined,
    weaponId: WeaponId,
  ): void;
  /** Pops voxel cubes from the shared burst pool — weapon trails/impacts. */
  spawnBurst(x: number, z: number, color: number, count: number): void;
  /** Aggregated activity observer; never called from per-enemy hit loops.
   *  `x`/`z` (optional) mark a WORLD position for the fire sound when the effect
   *  lands AWAY from the player (acid drum, dismantler claw) — the audio then
   *  attenuates it by the listener's distance (the world-distance RULE). Omit
   *  for player-centered fires (bolt/pulse/…) so they play at full volume. */
  weaponActivated(id: WeaponId, x?: number, z?: number): void;
  /** Start a continuous per-weapon audio loop (e.g. the orbiting saws' hum).
   *  Idempotent — the audio director dedups by owner key, so re-calling while
   *  the loop is alive is a no-op. */
  startWeaponLoop(id: WeaponId): void;
  /** Stop a weapon's continuous loop when it deactivates. */
  stopWeaponLoop(id: WeaponId): void;
  /** Live-set a weapon loop's volume — e.g. distance attenuation for a
   *  world-positioned zone loop (acid pool). Safe to call every frame. */
  setWeaponLoopVolume(id: WeaponId, volume: number): void;
  /** Per-weapon impact tick, fired on contact. Safe to call from the per-enemy
   *  hit loop — the audio cooldown throttles a swarm of hits to a steady tick. */
  weaponHit(id: WeaponId): void;
}

function branchMultiplier(
  ctx: CombatCtx,
  weaponId: BranchWeaponId,
  branchId: WeaponBranchId,
): number {
  return weaponBranchMultiplier(ctx.weaponBranches, weaponId, branchId);
}

function visibleFrom(
  ctx: CombatCtx,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
): boolean {
  return hasLineOfSight(startX, startZ, endX, endZ, ctx.obstacles);
}

/** Picks a target within `range`.
 *
 *  `bossBias` > 1 makes bosses compete as if they were closer, WITHOUT
 *  extending the weapon's reach: the range gate always tests true distance and
 *  the bias only decides who wins among candidates already in range.
 *
 *  Why it exists: this used to be pure nearest-enemy, and a boss is big and
 *  slow, so with any swarm present it is essentially never the closest thing.
 *  Measured 2026-07-30 — 0 bosses defeated across 11 recorded runs, while Tire
 *  Fire (the one weapon that ignores targeting entirely and just rolls through
 *  everything) accounted for 63% of all career damage. The arsenal could not
 *  shoot the boss, so only the weapon that does not aim ever hurt one. */
function findNearestVisible(
  ctx: CombatCtx,
  x: number,
  z: number,
  range: number,
  excluded: Set<number> | null = null,
  /** Defaults to the floor every weapon gets — see BOSS_TARGET_BIAS_BASE.
   *  Hunters pass BOSS_TARGET_BIAS explicitly. */
  bossBias = BOSS_TARGET_BIAS_BASE,
): number {
  let best = -1;
  let bestScore = Infinity;
  const rangeSq = range * range;
  for (let i = 0; i < ctx.enemies.pool.length; i++) {
    const enemy = ctx.enemies.pool[i];
    if (!enemy || !enemy.active || excluded?.has(enemyKey(i, enemy.gen))) continue;
    const distanceSq = (enemy.x - x) ** 2 + (enemy.z - z) ** 2;
    if (distanceSq >= rangeSq) continue; // Real reach — never widened by bias.
    const score =
      bossBias > 1 && BOSS_TYPE_INDEXES.includes(enemy.typeIndex)
        ? distanceSq / bossBias
        : distanceSq;
    if (score >= bestScore || !visibleFrom(ctx, x, z, enemy.x, enemy.z)) continue;
    bestScore = score;
    best = i;
  }
  return best;
}

function projectileBlocked(
  ctx: CombatCtx,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  radius: number,
): boolean {
  return ctx.obstacles.some((obstacle) =>
    segmentHitsObstacle(startX, startZ, endX, endZ, obstacle, radius),
  );
}

/** Icon accent per weapon (docs/PROMPTS_IMAGENES.md §3) — single source for
 *  projectile tints AND hit sparks, so effect and HUD icon always match.
 *  press/ricochet were re-fixed here 2026-07-11: their icons had been
 *  recolored (v2/v3) after the weapons shipped and the meshes still wore the
 *  old accents. */
export const WEAPON_ACCENT = {
  bolt: 0xffe066,
  pulse: 0x7ee0ff,
  blades: 0xc9d4de,
  welder: 0x9fe8ff,
  press: 0xff5f33,
  tire: 0xff7733,
  oil: 0xffd24a,
  acid: 0x52e858,
  turbine: 0xcfe8f0,
  ricochet: 0xc060ff,
  dismantler: 0xffd24a,
} as const;

interface Projectile {
  active: boolean;
  x: number;
  z: number;
  vx: number;
  vz: number;
  life: number;
}

const tmpMatrix = new THREE.Matrix4();
const tmpMatrixB = new THREE.Matrix4();
const tmpVec = new THREE.Vector3();
const tmpColorW = new THREE.Color();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/** Generation-aware key for a `hit: Set<number>` so a pool slot reused by a
 *  new enemy (same index, bumped gen) doesn't inherit the old enemy's hit
 *  state. */
function enemyKey(index: number, gen: number): number {
  return index * 1000 + (gen % 1000);
}

/** Flat voxel splat (unit-ish radius): a SOLID grid of ground cells clipped to
 *  a disc with a pseudo-random jagged rim — the liquid-puddle footprint in
 *  blocky language (oil/acid zones). The old scattered-lobe version left
 *  see-through holes between lobes (user: "irregular, con partes sin ácido");
 *  a filled grid removes the gaps, and the noisy edge keeps it organic instead
 *  of a plain square. Flat single-face cells (no box side walls) so the
 *  transparent material blends as one clean layer, no double-blended seams. */
function buildVoxelSplat(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const N = 9;
  const cell = 2 / N;
  for (let gx = 0; gx < N; gx++) {
    for (let gz = 0; gz < N; gz++) {
      const cx = -1 + (gx + 0.5) * cell;
      const cz = -1 + (gz + 0.5) * cell;
      const d = Math.hypot(cx, cz);
      // Deterministic per-cell hash → wobble the clip radius so the rim is
      // jagged/organic; the inner core (d < 0.6) is always solid.
      const hash = Math.sin(gx * 12.9898 + gz * 78.233) * 43758.5453;
      const noise = hash - Math.floor(hash); // 0..1
      const threshold = 0.9 + (noise - 0.5) * 0.5; // rim wobbles ~0.65..1.15
      if (d > threshold) continue;
      const quad = new THREE.PlaneGeometry(cell, cell);
      quad.rotateX(-Math.PI / 2); // lie flat, face up
      quad.translate(cx, 0, cz);
      parts.push(quad);
    }
  }
  return mergeGeometries(parts);
}

/** Voxel tire: 10 dark-rubber box segments around an upright ring (XY plane,
 *  same orientation as the old torus) — the FIRE comes from the flame-cube
 *  trail it sheds while rolling, like its icon. */
function buildVoxelTire(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const segments = 10;
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const seg = new THREE.BoxGeometry(0.34, 0.3, 0.36);
    seg.rotateZ(a);
    seg.translate(Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0);
    parts.push(seg);
  }
  return mergeGeometries(parts);
}

/** Irregular voxel scrap chunk (Junk Ricochet): three offset DARK metal boxes
 *  + a bright purple energy shard wedged in — reads as "scrap charged with volt
 *  energy", matching the icon (dark junk + purple zigzag). The old version was
 *  solid purple, so it didn't read as scrap (user 2026-07-12). Vertex colors:
 *  the dark body stays dark; the purple shard crosses the bloom threshold so it
 *  glows. Material uses vertexColors, not a flat colour. */
const SCRAP_DARK = new THREE.Color(0x3c3444);
function paintGeo(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = g.attributes.position?.count ?? 0;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}
function buildScrapChunk(): THREE.BufferGeometry {
  const a = paintGeo(new THREE.BoxGeometry(0.42, 0.3, 0.36), SCRAP_DARK.getHex());
  const b = new THREE.BoxGeometry(0.28, 0.34, 0.3);
  b.rotateY(0.6);
  b.translate(0.16, 0.14, -0.08);
  paintGeo(b, SCRAP_DARK.getHex());
  const c = new THREE.BoxGeometry(0.22, 0.2, 0.26);
  c.rotateZ(0.5);
  c.translate(-0.18, -0.1, 0.12);
  paintGeo(c, SCRAP_DARK.getHex());
  // Purple volt-energy shard wedged into the junk — the accent that ties the
  // chunk to the icon and keeps it visible on the dark floor.
  const shard = new THREE.BoxGeometry(0.2, 0.2, 0.2);
  shard.rotateY(0.8);
  shard.rotateZ(0.4);
  shard.translate(0.05, 0.07, 0.06);
  paintGeo(shard, WEAPON_ACCENT.ricochet);
  return mergeGeometries([a, b, c, shard]);
}

/** Chunky voxel saw blade: square hub + 8 rotated teeth (the icon's saw,
 *  not a flat slab). Spun around Y by the owner. */
function buildSawBlade(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [new THREE.BoxGeometry(0.55, 0.14, 0.55)];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const tooth = new THREE.BoxGeometry(0.2, 0.1, 0.2);
    tooth.rotateY(a);
    tooth.translate(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42);
    parts.push(tooth);
  }
  return mergeGeometries(parts);
}

/** Unit-radius ring of `count` cubes in the XY plane, each tangent-aligned —
 *  the voxel shockwave shape (scaled per frame by the owner). */
function buildVoxelRing(count: number, cubeSize: number): THREE.BufferGeometry {
  const cubes: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const cube = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
    cube.rotateZ(a);
    cube.translate(Math.cos(a), Math.sin(a), 0);
    cubes.push(cube);
  }
  return mergeGeometries(cubes);
}

/** Auto-firing direct projectile: targets the nearest enemies, no manual aim. */
export class BoltWeapon {
  private readonly mesh: THREE.InstancedMesh;
  private readonly pool: Projectile[] = [];
  private cooldown = 0;

  constructor(scene: THREE.Scene) {
    // A literal voxel BOLT flying head-first (was a smooth sphere — the one
    // anti-voxel shape in the game): square shaft + wider hex-nut head,
    // bright accent so the selective bloom picks it up as a tracer.
    const r = WEAPONS.bolt.projectileRadius;
    const shaft = new THREE.BoxGeometry(r * 0.9, r * 0.9, r * 2.6);
    const head = new THREE.BoxGeometry(r * 1.7, r * 1.7, r * 0.9);
    head.translate(0, 0, r * 1.4);
    const geometry = mergeGeometries([shaft, head]);
    const material = new THREE.MeshBasicMaterial({ color: WEAPON_ACCENT.bolt });
    this.mesh = new THREE.InstancedMesh(geometry, material, WEAPONS.bolt.maxProjectiles);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    for (let i = 0; i < WEAPONS.bolt.maxProjectiles; i++) {
      this.pool.push({ active: false, x: 0, z: 0, vx: 0, vz: 0, life: 0 });
      this.mesh.setMatrixAt(i, HIDDEN);
    }
  }

  update(dt: number, px: number, pz: number, level: number, ctx: CombatCtx): void {
    if (level > 0) {
      this.cooldown -= dt;
      if (this.cooldown <= 0 && ctx.enemies.activeCount > 0) {
        this.cooldown = WEAPONS.bolt.cooldownS / (
          ctx.stats.attackSpeed * branchMultiplier(ctx, 'bolt', 'cycle')
        );
        const count = 1 + quantityBonus(level) + ctx.stats.projectileCount;
        if (this.fireVolley(px, pz, ctx, count)) ctx.weaponActivated('bolt');
      }
    }

    const baseDamage = levelScale(
      WEAPONS.bolt.damage,
      WEAPONS.bolt.damagePctPerLevel,
      1 + (ctx.weaponBranches.bolt.damage ?? 0),
    );
    const boltSize = branchMultiplier(ctx, 'bolt', 'size');
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p || !p.active) continue;
      const previousX = p.x;
      const previousZ = p.z;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.life -= dt;
      if (
        projectileBlocked(
          ctx,
          previousX,
          previousZ,
          p.x,
          p.z,
          WEAPONS.bolt.projectileRadius * ctx.stats.area * boltSize,
        )
      ) {
        ctx.spawnBurst(p.x, p.z, WEAPON_ACCENT.bolt, 2);
        this.deactivate(i);
        continue;
      }
      if (p.life <= 0) {
        this.deactivate(i);
        continue;
      }
      const hit = findNearestVisible(
        ctx,
        p.x,
        p.z,
        WEAPONS.bolt.hitRadius * ctx.stats.area * boltSize,
      );
      if (hit !== -1) {
        ctx.dealDamage(hit, baseDamage, WEAPON_ACCENT.bolt, 'bolt');
        this.deactivate(i);
        continue;
      }
      // Head-first flight + thread-roll spin around the travel axis.
      tmpMatrix.makeRotationY(Math.atan2(p.vx, p.vz));
      tmpMatrixB.makeRotationZ(p.life * 14);
      tmpMatrix.multiply(tmpMatrixB);
      tmpMatrix.scale(tmpVec.set(
        ctx.stats.area * boltSize,
        ctx.stats.area * boltSize,
        ctx.stats.area * boltSize,
      ));
      tmpMatrix.setPosition(p.x, 1, p.z);
      this.mesh.setMatrixAt(i, tmpMatrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private fireVolley(px: number, pz: number, ctx: CombatCtx, count: number): boolean {
    const range = WEAPONS.bolt.range * ctx.stats.attackRange;
    const targets: number[] = [];
    const taken = new Set<number>();
    for (let n = 0; n < count; n++) {
      let best = -1;
      let bestSq = range * range;
      for (let i = 0; i < ctx.enemies.pool.length; i++) {
        const e = ctx.enemies.pool[i];
        if (!e || !e.active || taken.has(i)) continue;
        const trueSq = (e.x - px) * (e.x - px) + (e.z - pz) * (e.z - pz);
        if (trueSq >= range * range) continue; // Real reach — bias never widens it.
        // Hunter: same boss weighting as the shared helper. Bolt keeps its own
        // loop because a volley must pick N DISTINCT targets.
        const dSq = BOSS_TYPE_INDEXES.includes(e.typeIndex)
          ? trueSq / BOSS_TARGET_BIAS
          : trueSq;
        if (dSq < bestSq && visibleFrom(ctx, px, pz, e.x, e.z)) {
          bestSq = dSq;
          best = i;
        }
      }
      if (best === -1) break;
      taken.add(best);
      targets.push(best);
    }
    if (targets.length === 0) return false;
    const speed = WEAPONS.bolt.speed * ctx.stats.projectileSpeed;
    for (let n = 0; n < count; n++) {
      const target = targets[n % targets.length];
      if (target === undefined) break;
      const e = ctx.enemies.pool[target];
      if (!e) continue;
      this.launch(px, pz, e.x, e.z, speed);
    }
    return true;
  }

  private launch(px: number, pz: number, tx: number, tz: number, speed: number): void {
    const index = this.pool.findIndex((p) => !p.active);
    if (index === -1) return;
    const p = this.pool[index];
    if (!p) return;
    let dx = tx - px;
    let dz = tz - pz;
    const dist = Math.hypot(dx, dz) || 1;
    dx /= dist;
    dz /= dist;
    p.active = true;
    p.x = px + dx * 0.8;
    p.z = pz + dz * 0.8;
    p.vx = dx * speed;
    p.vz = dz * speed;
    p.life = WEAPONS.bolt.lifetimeS;
  }

  private deactivate(index: number): void {
    const p = this.pool[index];
    if (p) p.active = false;
    this.mesh.setMatrixAt(index, HIDDEN);
  }

  reset(): void {
    for (let i = 0; i < this.pool.length; i++) this.deactivate(i);
    this.cooldown = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Periodic area burst around the player. */
export class PulseWeapon {
  private readonly ring: THREE.Mesh;
  private cooldown = 0;
  private flash = 0;

  constructor(scene: THREE.Scene) {
    this.ring = new THREE.Mesh(
      // Segmented voxel shockwave: a ring of discrete cubes (was a smooth
      // RingGeometry — the icon and the art direction both say CUBES).
      buildVoxelRing(28, 0.13),
      new THREE.MeshBasicMaterial({
        color: WEAPON_ACCENT.pulse,
        transparent: true,
        opacity: 0,
      }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.1;
    scene.add(this.ring);
  }

  update(dt: number, px: number, pz: number, level: number, ctx: CombatCtx): void {
    const material = this.ring.material as THREE.MeshBasicMaterial;
    if (level <= 0) {
      material.opacity = 0;
      return;
    }

    const radius =
      levelScale(WEAPONS.pulse.radius, WEAPONS.pulse.radiusPctPerLevel, 1 + (ctx.weaponBranches.pulse.radius ?? 0)) * ctx.stats.area;
    this.cooldown -= dt;
    if (this.cooldown <= 0) {
      this.cooldown = WEAPONS.pulse.cooldownS / (
        ctx.stats.attackSpeed * branchMultiplier(ctx, 'pulse', 'cycle')
      );
      this.flash = 0.35;
      ctx.weaponActivated('pulse');
      const damage = levelScale(
        WEAPONS.pulse.damage,
        WEAPONS.pulse.damagePctPerLevel,
        1 + (ctx.weaponBranches.pulse.damage ?? 0),
      );
      for (let i = 0; i < ctx.enemies.pool.length; i++) {
        const e = ctx.enemies.pool[i];
        if (!e || !e.active) continue;
        const dSq = (e.x - px) * (e.x - px) + (e.z - pz) * (e.z - pz);
        if (
          dSq <= radius * radius &&
          visibleFrom(ctx, px, pz, e.x, e.z)
        ) ctx.dealDamage(i, damage, WEAPON_ACCENT.pulse, 'pulse');
      }
    }

    if (this.flash > 0) {
      this.flash -= dt;
      const t = 1 - Math.max(this.flash, 0) / 0.35;
      const r = radius * (0.3 + 0.7 * t);
      this.ring.scale.set(r, r, 1);
      // Slight spin while expanding — segmented cubes read as energy, not
      // a static decal.
      this.ring.rotation.z = t * 0.5;
      this.ring.position.set(px, 0.1, pz);
      material.opacity = 0.9 * (1 - t);
    } else {
      material.opacity = 0;
    }
  }

  reset(): void {
    this.cooldown = 0;
    this.flash = 0;
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0;
  }
}

/** Blades orbiting the player, damaging on contact. */
export class BladeWeapon {
  private readonly blades: THREE.Mesh[] = [];
  private angle = 0;
  private wasActive = false;

  constructor(scene: THREE.Scene) {
    // A real voxel SAW (hub + teeth) instead of the flat gray slab.
    const geometry = buildSawBlade();
    const material = litMaterial({ color: WEAPON_ACCENT.blades });
    for (let i = 0; i < WEAPONS.blades.maxBlades; i++) {
      const blade = new THREE.Mesh(geometry, material);
      blade.visible = false;
      scene.add(blade);
      this.blades.push(blade);
    }
  }

  update(dt: number, px: number, pz: number, level: number, ctx: CombatCtx): void {
    this.angle += WEAPONS.blades.rotationSpeed * ctx.stats.attackSpeed *
      branchMultiplier(ctx, 'blades', 'rotation-speed') * dt;
    const count =
      level > 0
        ? Math.min(
            WEAPONS.blades.baseBlades + quantityBonus(level) + ctx.stats.projectileCount,
            this.blades.length,
          )
        : 0;
    // Orbiting saws are continuous: the rev one-shot fires on the spin-up edge,
    // then a sustained hum loops for as long as the blades are up.
    if (count > 0 && !this.wasActive) {
      ctx.weaponActivated('blades');
      ctx.startWeaponLoop('blades');
    } else if (count === 0 && this.wasActive) {
      ctx.stopWeaponLoop('blades');
    }
    this.wasActive = count > 0;
    const damage = levelScale(
      WEAPONS.blades.damage,
      WEAPONS.blades.damagePctPerLevel,
      1 + (ctx.weaponBranches.blades.damage ?? 0),
    );
    const orbit = WEAPONS.blades.orbitRadius * ctx.stats.area *
      branchMultiplier(ctx, 'blades', 'orbit-radius');
    const reachBase = WEAPONS.blades.bladeRadius * ctx.stats.area;

    for (let b = 0; b < this.blades.length; b++) {
      const blade = this.blades[b];
      if (!blade) continue;
      if (b >= count || level <= 0) {
        blade.visible = false;
        continue;
      }
      const a = this.angle + (b / count) * Math.PI * 2;
      const bx = px + Math.cos(a) * orbit;
      const bz = pz + Math.sin(a) * orbit;
      blade.visible = true;
      blade.position.set(bx, 1, bz);
      // Fast self-spin (a circular saw, not a sliding plate) with a phase
      // offset so the pack never spins in sync.
      blade.rotation.y = this.angle * 6 + b;
      blade.scale.setScalar(ctx.stats.area);

      for (let i = 0; i < ctx.enemies.pool.length; i++) {
        const e = ctx.enemies.pool[i];
        if (!e || !e.active || e.bladeHitTimer > 0) continue;
        const reach = reachBase + e.radius;
        const dSq = (e.x - bx) * (e.x - bx) + (e.z - bz) * (e.z - bz);
        if (dSq <= reach * reach && visibleFrom(ctx, bx, bz, e.x, e.z)) {
          e.bladeHitTimer = WEAPONS.blades.hitCooldownS;
          ctx.dealDamage(i, damage, WEAPON_ACCENT.blades, 'blades');
          ctx.weaponHit('blades');
        }
      }
    }
  }

  reset(): void {
    this.angle = 0;
    this.wasActive = false;
    for (const blade of this.blades) blade.visible = false;
  }
}

/** Continuous beam that ramps up damage while locked on the same target. */
const WELDER_ARC_CUBES = 26;

export class WelderWeapon {
  private readonly arc: THREE.InstancedMesh;
  private target = -1;
  private targetGen = -1;
  private lockTime = 0;
  private tickTimer = 0;
  /** Drives the smooth beam undulation (replaces per-frame randomness). */
  private time = 0;
  /** Beam-audio edge tracking: the continuous arc loop starts when the beam
   *  ignites (acquires a target) and stops when it drops it. */
  private wasActive = false;

  /** Reconcile the sustained beam loop with the beam's on/off state. */
  private updateBeamLoop(active: boolean, ctx: CombatCtx): void {
    if (active && !this.wasActive) ctx.startWeaponLoop('welder');
    else if (!active && this.wasActive) ctx.stopWeaponLoop('welder');
    this.wasActive = active;
  }

  constructor(scene: THREE.Scene) {
    // Segmented voxel weld arc (was one stretched translucent box): a chain
    // of bright cubes that jitters every frame like a real arc, with a
    // white-hot cube at the weld point. Bright basic material → bloom.
    this.arc = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.16, 0.16, 0.16),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      WELDER_ARC_CUBES,
    );
    this.arc.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.arc.frustumCulled = false;
    this.arc.count = 0;
    scene.add(this.arc);
  }

  update(dt: number, px: number, pz: number, level: number, ctx: CombatCtx): void {
    if (level <= 0) {
      this.arc.count = 0;
      this.updateBeamLoop(false, ctx);
      return;
    }

    const range = WEAPONS.welder.range * ctx.stats.attackRange *
      branchMultiplier(ctx, 'welder', 'range');
    // Re-validate the lock: dead, out-of-range, or stale (slot reused by a
    // different enemy) targets reset the ramp.
    const current = ctx.enemies.pool[this.target];
    let valid =
      this.target !== -1 && !!current && current.active && current.gen === this.targetGen;
    if (valid && current) {
      const dSq = (current.x - px) * (current.x - px) + (current.z - pz) * (current.z - pz);
      valid = dSq <= range * range && visibleFrom(ctx, px, pz, current.x, current.z);
    }
    if (!valid) {
      // Hunter: the beam ramps damage while locked on one target, so a boss is
      // exactly what it was built for.
      this.target = findNearestVisible(ctx, px, pz, range, null, BOSS_TARGET_BIAS);
      this.targetGen = ctx.enemies.pool[this.target]?.gen ?? -1;
      this.lockTime = 0;
    }

    const e = ctx.enemies.pool[this.target];
    if (this.target === -1 || !e || !e.active) {
      this.arc.count = 0;
      this.updateBeamLoop(false, ctx);
      return;
    }
    // A valid target = the beam is lit: start the sustained arc loop.
    this.updateBeamLoop(true, ctx);

    this.lockTime += dt;
    this.tickTimer -= dt;
    if (this.tickTimer <= 0) {
      this.tickTimer = WEAPONS.welder.tickS / ctx.stats.attackSpeed;
      const rampRate = WEAPONS.welder.rampPerSecond *
        branchMultiplier(ctx, 'welder', 'ramp-stability');
      const ramp = Math.min(1 + this.lockTime * rampRate, WEAPONS.welder.rampCap);
      const damage = levelScale(
        WEAPONS.welder.damage,
        WEAPONS.welder.damagePctPerLevel,
        1 + (ctx.weaponBranches.welder.damage ?? 0),
      ) * ramp;
      ctx.weaponActivated('welder');
      ctx.dealDamage(this.target, damage, WEAPON_ACCENT.welder, 'welder');
    }

    // Lay the arc: cubes along the player→target line. The sideways offset is
    // a smooth traveling SINE wave (peak wobble mid-span), so the beam
    // undulates like a real welding arc instead of boiling with per-frame
    // randomness (which read as a too-fast spin). Cyan body + white-hot tip.
    this.time += dt;
    const wavePhase = this.time * Math.PI * 2 * VISUAL.weaponVfx.welderWaveHz;
    const dx = e.x - px;
    const dz = e.z - pz;
    const dist = Math.hypot(dx, dz) || 1;
    const nx = -dz / dist;
    const nz = dx / dist;
    const count = Math.min(WELDER_ARC_CUBES, Math.max(3, Math.ceil(dist / 0.55)));
    this.arc.count = count;
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const tip = i === count - 1;
      const envelope = Math.sin(t * Math.PI) * VISUAL.weaponVfx.welderWaveAmp;
      const off = Math.sin(wavePhase + i * VISUAL.weaponVfx.welderWavePhase) * envelope;
      const s = tip ? 1.7 : 0.9;
      const yWob = Math.sin(wavePhase * 0.6 + i * 1.3) * 0.06;
      tmpMatrix.makeScale(s, s, s);
      tmpMatrix.setPosition(px + dx * t + nx * off, 1.1 + yWob, pz + dz * t + nz * off);
      this.arc.setMatrixAt(i, tmpMatrix);
      this.arc.setColorAt(i, tmpColorW.setHex(tip ? 0xffffff : WEAPON_ACCENT.welder));
    }
    this.arc.instanceMatrix.needsUpdate = true;
    if (this.arc.instanceColor) this.arc.instanceColor.needsUpdate = true;
  }

  reset(): void {
    this.target = -1;
    this.targetGen = -1;
    this.lockTime = 0;
    this.tickTimer = 0;
    this.arc.count = 0;
    // Run reset stops all loops via audio.reset(); re-arm the edge tracker.
    this.wasActive = false;
  }
}

/** Piston that crushes a lane toward the nearest enemy. Auto-aimed like every
 *  other weapon — the player kites away from the swarm, so a movement-facing
 *  press would hit empty ground most of the time. */
export class PressWeapon {
  private readonly plate: THREE.Mesh;
  private cooldown = 0;
  private flash = 0;

  constructor(scene: THREE.Scene) {
    // A SLAB with real thickness that slams down from above (was a flat
    // opacity-flash decal — a press has to PRESS).
    this.plate = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.45, 1),
      new THREE.MeshBasicMaterial({ color: WEAPON_ACCENT.press, transparent: true, opacity: 0 }),
    );
    this.plate.position.y = 0.25;
    scene.add(this.plate);
  }

  update(dt: number, px: number, pz: number, level: number, ctx: CombatCtx): void {
    const material = this.plate.material as THREE.MeshBasicMaterial;
    if (level <= 0) {
      material.opacity = 0;
      return;
    }

    const length = WEAPONS.press.length * ctx.stats.attackRange;
    const width =
      levelScale(WEAPONS.press.width, WEAPONS.press.widthPctPerLevel, 1 + (ctx.weaponBranches.press.width ?? 0)) * ctx.stats.area;

    this.cooldown -= dt;
    if (this.cooldown <= 0) {
      // Aim the lane at the nearest enemy; hold fire when nothing is in reach.
      const target = findNearestVisible(ctx, px, pz, length);
      const e = ctx.enemies.pool[target];
      if (target !== -1 && e) {
        this.cooldown = WEAPONS.press.cooldownS / (
          ctx.stats.attackSpeed * branchMultiplier(ctx, 'press', 'cycle')
        );
        this.flash = 0.25;
        ctx.weaponActivated('press');
        const dist = Math.hypot(e.x - px, e.z - pz) || 1;
        const dirX = (e.x - px) / dist;
        const dirZ = (e.z - pz) / dist;
        const damage = levelScale(
          WEAPONS.press.damage,
          WEAPONS.press.damagePctPerLevel,
          1 + (ctx.weaponBranches.press.damage ?? 0),
        );
        // Zone check: project each enemy onto the lane axis.
        for (let i = 0; i < ctx.enemies.pool.length; i++) {
          const other = ctx.enemies.pool[i];
          if (!other || !other.active) continue;
          const rx = other.x - px;
          const rz = other.z - pz;
          const along = rx * dirX + rz * dirZ;
          if (along < 0 || along > length) continue;
          const across = Math.abs(rx * -dirZ + rz * dirX);
          if (
            across <= width / 2 + other.radius &&
            visibleFrom(ctx, px, pz, other.x, other.z)
          ) {
            ctx.dealDamage(i, damage, WEAPON_ACCENT.press, 'press');
          }
        }
        this.plate.position.set(px + dirX * (length / 2), 0.25, pz + dirZ * (length / 2));
        this.plate.scale.set(width, 1, length);
        this.plate.rotation.y = Math.atan2(dirX, dirZ);
      }
    }

    if (this.flash > 0) {
      this.flash -= dt;
      const t = 1 - Math.max(this.flash, 0) / 0.25;
      // Slam: drop hard from above in the first third, then rest and fade.
      const drop = Math.min(1, t / 0.3);
      this.plate.position.y = 2.4 - (2.4 - 0.25) * drop * drop;
      material.opacity = t < 0.55 ? 0.95 : 0.95 * (1 - (t - 0.55) / 0.45);
    } else {
      material.opacity = 0;
    }
  }

  reset(): void {
    this.cooldown = 0;
    this.flash = 0;
    (this.plate.material as THREE.MeshBasicMaterial).opacity = 0;
  }
}

interface Tire {
  active: boolean;
  x: number;
  z: number;
  vx: number;
  vz: number;
  life: number;
  roll: number;
  flameTimer: number;
  hit: Set<number>;
  mesh: THREE.Mesh;
}

/** Burning tires that roll in a straight line through the swarm. */
export class TireWeapon {
  private readonly pool: Tire[] = [];
  private cooldown = 0;

  constructor(scene: THREE.Scene) {
    // Dark rubber voxel ring (the icon's tire is BLACK — the orange lives
    // in the flames it sheds, not the rubber).
    const geometry = buildVoxelTire();
    const material = litMaterial({ color: 0x2a2f38 });
    for (let i = 0; i < WEAPONS.tire.maxTires; i++) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({
        active: false,
        x: 0,
        z: 0,
        vx: 0,
        vz: 0,
        life: 0,
        roll: 0,
        flameTimer: 0,
        hit: new Set(),
        mesh,
      });
    }
  }

  update(dt: number, px: number, pz: number, level: number, ctx: CombatCtx): void {
    if (level > 0) {
      this.cooldown -= dt;
      if (this.cooldown <= 0 && ctx.enemies.activeCount > 0) {
        const count = 1 + quantityBonus(level) + ctx.stats.projectileCount;
        const target = findNearestVisible(ctx, px, pz, WEAPONS.tire.targetRange);
        const e = ctx.enemies.pool[target];
        if (e) {
          this.cooldown = WEAPONS.tire.cooldownS / ctx.stats.attackSpeed;
          ctx.weaponActivated('tire');
          const baseAngle = Math.atan2(e.x - px, e.z - pz);
          for (let n = 0; n < count; n++) {
            const angle = baseAngle + (n - (count - 1) / 2) * 0.35;
            this.launch(px, pz, angle, ctx.stats.projectileSpeed, ctx);
          }
        }
      }
    }

    const damage = levelScale(
      WEAPONS.tire.damage,
      WEAPONS.tire.damagePctPerLevel,
      1 + (ctx.weaponBranches.tire.damage ?? 0),
    );
    const tireSize = branchMultiplier(ctx, 'tire', 'size');
    const hitRadius = WEAPONS.tire.radius * ctx.stats.area * tireSize;
    for (const t of this.pool) {
      if (!t.active) continue;
      const previousX = t.x;
      const previousZ = t.z;
      t.x += t.vx * dt;
      t.z += t.vz * dt;
      t.life -= dt;
      t.roll += Math.hypot(t.vx, t.vz) * dt / 0.55;
      if (projectileBlocked(ctx, previousX, previousZ, t.x, t.z, hitRadius)) {
        ctx.spawnBurst(t.x, t.z, WEAPON_ACCENT.tire, 3);
        t.active = false;
        t.mesh.visible = false;
        continue;
      }
      // Flame trail: the rolling tire sheds burning cubes behind it.
      t.flameTimer -= dt;
      if (t.flameTimer <= 0) {
        t.flameTimer = VISUAL.weaponVfx.tireFlameIntervalS;
        ctx.spawnBurst(
          t.x,
          t.z,
          Math.floor(t.roll * 2) % 2 === 0 ? 0xff7733 : 0xffb400,
          1,
        );
      }
      if (t.life <= 0) {
        t.active = false;
        t.mesh.visible = false;
        continue;
      }
      for (let i = 0; i < ctx.enemies.pool.length; i++) {
        const e = ctx.enemies.pool[i];
        if (!e || !e.active) continue;
        const key = enemyKey(i, e.gen);
        if (t.hit.has(key)) continue;
        const reach = hitRadius + e.radius;
        const dSq = (e.x - t.x) * (e.x - t.x) + (e.z - t.z) * (e.z - t.z);
        if (dSq <= reach * reach) {
          t.hit.add(key);
          ctx.dealDamage(i, damage, WEAPON_ACCENT.tire, 'tire');
        }
      }
      t.mesh.position.set(t.x, 0.75 * ctx.stats.area * tireSize, t.z);
      t.mesh.rotation.set(t.roll, Math.atan2(t.vx, t.vz), 0, 'YXZ');
      t.mesh.scale.setScalar(ctx.stats.area * tireSize);
    }
  }

  private launch(
    px: number,
    pz: number,
    angle: number,
    speedMult: number,
    ctxForLaunch: CombatCtx,
  ): void {
    const t = this.pool.find((c) => !c.active);
    if (!t) return;
    const speed = WEAPONS.tire.speed * speedMult;
    t.active = true;
    t.x = px;
    t.z = pz;
    t.vx = Math.sin(angle) * speed;
    t.vz = Math.cos(angle) * speed;
    t.life = WEAPONS.tire.lifetimeS * branchMultiplier(ctxForLaunch, 'tire', 'lifetime');
    t.roll = 0;
    t.flameTimer = 0;
    t.hit.clear();
    t.mesh.visible = true;
  }

  reset(): void {
    this.cooldown = 0;
    for (const t of this.pool) {
      t.active = false;
      t.mesh.visible = false;
    }
  }
}

/** Zero-damage control weapon: oil puddles behind the player slow the swarm. */
export class OilWeapon {
  private readonly mesh: THREE.InstancedMesh;
  private readonly puddles: { active: boolean; x: number; z: number; life: number }[] = [];
  private dropTimer = 0;
  private dripTimer = 0;
  private lastX = 0;
  private lastZ = 0;

  constructor(scene: THREE.Scene) {
    const geometry = buildVoxelSplat();
    const material = new THREE.MeshBasicMaterial({
      color: 0x1a1522,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, WEAPONS.oil.maxPuddles);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    for (let i = 0; i < WEAPONS.oil.maxPuddles; i++) {
      this.puddles.push({ active: false, x: 0, z: 0, life: 0 });
      this.mesh.setMatrixAt(i, HIDDEN);
    }
  }

  update(dt: number, px: number, pz: number, level: number, ctx: CombatCtx): void {
    if (level > 0) {
      this.dropTimer -= dt;
      const moved = Math.hypot(px - this.lastX, pz - this.lastZ);
      if (this.dropTimer <= 0 && moved > 0.6) {
        this.dropTimer = WEAPONS.oil.dropIntervalS;
        this.lastX = px;
        this.lastZ = pz;
        const p = this.puddles.find((c) => !c.active) ?? this.puddles[0];
        if (p) {
          p.active = true;
          p.x = px;
          p.z = pz;
          p.life = WEAPONS.oil.puddleLifeS * ctx.stats.duration *
            branchMultiplier(ctx, 'oil', 'duration');
          ctx.weaponActivated('oil');
          // Splash on drop: dark droplets + one hazard-yellow glint (the
          // icon's label accent) so the drip reads on the dark floor.
          ctx.spawnBurst(px, pz, 0x1a1522, 3);
          ctx.spawnBurst(px, pz, WEAPON_ACCENT.oil, 1);
        }
      }
    }

    const radius = levelScale(
      WEAPONS.oil.puddleRadius,
      WEAPONS.oil.radiusPctPerLevel,
      1 + (ctx.weaponBranches.oil.radius ?? 0),
    ) * ctx.stats.area;
    const slowFactor = Math.max(
      WEAPONS.oil.slowFactorFloor,
      1 - (1 - WEAPONS.oil.slowFactor) * branchMultiplier(ctx, 'oil', 'slow-strength'),
    );
    // One drip event per interval, placed on a uniformly-random slowed enemy
    // (reservoir sampling below) so dark oil cubes keep hopping across the
    // gunked swarm — the debuff's unmistakable "something is happening" cue.
    this.dripTimer -= dt;
    const wantDrip = this.dripTimer <= 0;
    let affected = 0;
    let dripX = 0;
    let dripZ = 0;
    for (let i = 0; i < this.puddles.length; i++) {
      const p = this.puddles[i];
      if (!p || !p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this.mesh.setMatrixAt(i, HIDDEN);
        continue;
      }
      for (let n = 0; n < ctx.enemies.pool.length; n++) {
        const e = ctx.enemies.pool[n];
        if (!e || !e.active) continue;
        const dSq = (e.x - p.x) * (e.x - p.x) + (e.z - p.z) * (e.z - p.z);
        if (dSq <= radius * radius) {
          ctx.enemies.applySlow(n, slowFactor, WEAPONS.oil.slowDurationS * ctx.stats.duration);
          if (wantDrip && Math.random() < 1 / ++affected) {
            dripX = e.x;
            dripZ = e.z;
          }
        }
      }
      // Golden-angle rotation per slot: one splat geometry, no two puddles
      // reading identical on screen.
      tmpMatrix.makeRotationY(i * 2.39996);
      tmpMatrix.scale(tmpVec.set(radius, 1, radius));
      tmpMatrix.setPosition(p.x, 0.03, p.z);
      this.mesh.setMatrixAt(i, tmpMatrix);
    }
    if (wantDrip && affected > 0) {
      this.dripTimer = VISUAL.weaponVfx.oilDripIntervalS;
      // Dark oil globs + one hazard-yellow glint (the icon accent) so the drip
      // reads on any enemy body colour.
      ctx.spawnBurst(dripX, dripZ, 0x1a1522, 2);
      ctx.spawnBurst(dripX, dripZ, WEAPON_ACCENT.oil, 1);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  reset(): void {
    this.dropTimer = 0;
    for (let i = 0; i < this.puddles.length; i++) {
      const p = this.puddles[i];
      if (p) p.active = false;
      this.mesh.setMatrixAt(i, HIDDEN);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Lobbed flasks that leave corrosive zones applying damage-over-time. */
export class AcidWeapon {
  private readonly mesh: THREE.InstancedMesh;
  private readonly zones: { active: boolean; x: number; z: number; life: number; bubbleTimer: number }[] = [];
  private cooldown = 0;
  /** Drives the corrosive-pool opacity breathing. */
  private time = 0;
  /** Zone-loop audio edge tracking (the corrosive sizzle while any pool lives). */
  private loopActive = false;

  constructor(scene: THREE.Scene) {
    // Same voxel-splat language as the oil puddles, acid green.
    const geometry = buildVoxelSplat();
    const material = new THREE.MeshBasicMaterial({
      color: WEAPON_ACCENT.acid,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, WEAPONS.acid.maxZones);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    for (let i = 0; i < WEAPONS.acid.maxZones; i++) {
      this.zones.push({ active: false, x: 0, z: 0, life: 0, bubbleTimer: 0 });
      this.mesh.setMatrixAt(i, HIDDEN);
    }
  }

  update(dt: number, px: number, pz: number, level: number, ctx: CombatCtx): void {
    if (level > 0) {
      this.cooldown -= dt;
      if (this.cooldown <= 0) {
        const target = findNearestVisible(
          ctx,
          px,
          pz,
          WEAPONS.acid.targetRange * ctx.stats.attackRange,
        );
        const e = ctx.enemies.pool[target];
        if (target !== -1 && e) {
          this.cooldown = WEAPONS.acid.cooldownS / (
            ctx.stats.attackSpeed * branchMultiplier(ctx, 'acid', 'cycle')
          );
          const z = this.zones.find((c) => !c.active) ?? this.zones[0];
          if (z) {
            z.active = true;
            z.x = e.x;
            z.z = e.z;
            z.life = WEAPONS.acid.zoneLifeS * ctx.stats.duration;
            z.bubbleTimer = 0;
            // The drum lands AWAY from the player → attenuate by distance.
            ctx.weaponActivated('acid', z.x, z.z);
            // The drum SPLASHES down where it lands.
            ctx.spawnBurst(z.x, z.z, WEAPON_ACCENT.acid, 6);
          }
        }
      }
    }

    // Breathe the shared pool material so the acid looks like a live,
    // bubbling corrosive puddle rather than a flat neon decal (user feedback).
    this.time += dt;
    const vfx = VISUAL.weaponVfx;
    (this.mesh.material as THREE.MeshBasicMaterial).opacity =
      vfx.acidPoolOpacityBase +
      Math.sin(this.time * Math.PI * 2 * vfx.acidPoolPulseHz) * vfx.acidPoolOpacityPulse;

    const radius = levelScale(
      WEAPONS.acid.zoneRadius,
      WEAPONS.acid.radiusPctPerLevel,
      1 + (ctx.weaponBranches.acid.radius ?? 0),
    ) * ctx.stats.area;
    const dps = levelScale(
      WEAPONS.acid.dotDps,
      WEAPONS.acid.dpsPctPerLevel,
      1 + (ctx.weaponBranches.acid.damage ?? 0),
    );
    let anyActive = false;
    let nearestSq = Infinity;
    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i];
      if (!z || !z.active) continue;
      z.life -= dt;
      if (z.life <= 0) {
        z.active = false;
        this.mesh.setMatrixAt(i, HIDDEN);
        continue;
      }
      // A live pool: track it for the distance-attenuated corrosion loop.
      anyActive = true;
      const pdSq = (z.x - px) * (z.x - px) + (z.z - pz) * (z.z - pz);
      if (pdSq < nearestSq) nearestSq = pdSq;
      for (let n = 0; n < ctx.enemies.pool.length; n++) {
        const e = ctx.enemies.pool[n];
        if (!e || !e.active) continue;
        const dSq = (e.x - z.x) * (e.x - z.x) + (e.z - z.z) * (e.z - z.z);
        if (dSq <= radius * radius && visibleFrom(ctx, z.x, z.z, e.x, e.z)) {
          ctx.enemies.applyDot(
            n,
            dps,
            WEAPONS.acid.dotDurationS * ctx.stats.duration,
            'acid',
          );
        }
      }
      // Corrosion is ALIVE: the pool bubbles green cubes while it eats.
      z.bubbleTimer -= dt;
      if (z.bubbleTimer <= 0) {
        z.bubbleTimer = VISUAL.weaponVfx.acidBubbleIntervalS;
        const ba = Math.random() * Math.PI * 2;
        const br = Math.random() * radius * 0.8;
        ctx.spawnBurst(z.x + Math.cos(ba) * br, z.z + Math.sin(ba) * br, WEAPON_ACCENT.acid, 1);
      }
      tmpMatrix.makeRotationY(i * 2.39996);
      tmpMatrix.scale(tmpVec.set(radius, 1, radius));
      tmpMatrix.setPosition(z.x, 0.04, z.z);
      this.mesh.setMatrixAt(i, tmpMatrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    // Corrosion sizzle loop: one shared voice while any pool lives, its volume
    // attenuated by the player's distance to the NEAREST pool (fades as you
    // walk away — the sound lives in the world, not on the player).
    if (anyActive && !this.loopActive) ctx.startWeaponLoop('acid');
    else if (!anyActive && this.loopActive) ctx.stopWeaponLoop('acid');
    if (anyActive) {
      const dist = Math.sqrt(nearestSq);
      const atten = Math.max(0, 1 - dist / AUDIO.acidLoop.maxHearingDistance);
      ctx.setWeaponLoopVolume('acid', AUDIO.acidLoop.baseVolume * atten);
    }
    this.loopActive = anyActive;
  }

  reset(): void {
    this.cooldown = 0;
    this.loopActive = false;
    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i];
      if (z) z.active = false;
      this.mesh.setMatrixAt(i, HIDDEN);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

interface Tornado {
  active: boolean;
  x: number;
  z: number;
  vx: number;
  vz: number;
  life: number;
  debrisTimer: number;
  hit: Set<number>;
  mesh: THREE.Group;
}

/** Launches tornadoes that damage lightly and shove the swarm away. */
export class TurbineWeapon {
  private readonly pool: Tornado[] = [];
  private cooldown = 0;
  /** Travel-roar loop edge tracking (the tornado roars while it flies). */
  private loopActive = false;

  constructor(scene: THREE.Scene) {
    // Voxel tornado: three tilted rings of CUBES widening with height (was
    // smooth toruses), plus a scrap-debris trail spawned while it travels.
    const material = new THREE.MeshBasicMaterial({
      color: WEAPON_ACCENT.turbine,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
    const ringGeometry = buildVoxelRing(10, 0.16);
    for (let i = 0; i < WEAPONS.turbine.maxTornadoes; i++) {
      const group = new THREE.Group();
      const radii = [0.45, 0.8, 1.15];
      radii.forEach((r, level) => {
        const ring = new THREE.Mesh(ringGeometry, material);
        ring.rotation.x = Math.PI / 2 + (level - 1) * 0.18;
        // Phase offset per ring so the stack never aligns while spinning.
        ring.rotation.z = level * 0.7;
        ring.position.y = 0.4 + level * 0.75;
        ring.scale.setScalar(r);
        group.add(ring);
      });
      group.visible = false;
      scene.add(group);
      this.pool.push({ active: false, x: 0, z: 0, vx: 0, vz: 0, life: 0, debrisTimer: 0, hit: new Set(), mesh: group });
    }
  }

  update(dt: number, px: number, pz: number, level: number, ctx: CombatCtx): void {
    if (level > 0) {
      this.cooldown -= dt;
      if (this.cooldown <= 0 && ctx.enemies.activeCount > 0) {
        const target = findNearestVisible(ctx, px, pz, WEAPONS.turbine.targetRange);
        const e = ctx.enemies.pool[target];
        if (target !== -1 && e) {
          this.cooldown = WEAPONS.turbine.cooldownS / ctx.stats.attackSpeed;
          // Milestones launch extra tornadoes fanned out around the target
          // direction — each one shoves a different slice of the swarm.
          const count = 1 + quantityBonus(level) + ctx.stats.projectileCount;
          const baseAngle = Math.atan2(e.x - px, e.z - pz);
          const speed = WEAPONS.turbine.speed * ctx.stats.projectileSpeed;
          let launched = false;
          for (let n = 0; n < count; n++) {
            const t = this.pool.find((c) => !c.active);
            if (!t) break;
            const angle = baseAngle + (n - (count - 1) / 2) * 0.7;
            t.active = true;
            t.x = px;
            t.z = pz;
            t.vx = Math.sin(angle) * speed;
            t.vz = Math.cos(angle) * speed;
            t.life = WEAPONS.turbine.lifetimeS * ctx.stats.duration;
            t.debrisTimer = 0;
            t.hit.clear();
            t.mesh.visible = true;
            launched = true;
          }
          if (launched) ctx.weaponActivated('turbine');
        }
      }
    }

    const damage = levelScale(
      WEAPONS.turbine.damage,
      WEAPONS.turbine.damagePctPerLevel,
      1 + (ctx.weaponBranches.turbine.damage ?? 0),
    );
    const radius = WEAPONS.turbine.radius * ctx.stats.area *
      branchMultiplier(ctx, 'turbine', 'radius');
    const knockback = WEAPONS.turbine.knockbackForce *
      branchMultiplier(ctx, 'turbine', 'knockback');
    let anyActive = false;
    let nearestSq = Infinity;
    for (const t of this.pool) {
      if (!t.active) continue;
      const previousX = t.x;
      const previousZ = t.z;
      t.x += t.vx * dt;
      t.z += t.vz * dt;
      t.life -= dt;
      if (projectileBlocked(ctx, previousX, previousZ, t.x, t.z, radius)) {
        ctx.spawnBurst(t.x, t.z, WEAPON_ACCENT.turbine, 3);
        t.active = false;
        t.mesh.visible = false;
        continue;
      }
      if (t.life <= 0) {
        t.active = false;
        t.mesh.visible = false;
        continue;
      }
      // A flying tornado: track it for the distance-attenuated travel-roar loop.
      anyActive = true;
      const pdSq = (t.x - px) * (t.x - px) + (t.z - pz) * (t.z - pz);
      if (pdSq < nearestSq) nearestSq = pdSq;
      const speed = Math.hypot(t.vx, t.vz) || 1;
      for (let n = 0; n < ctx.enemies.pool.length; n++) {
        const e = ctx.enemies.pool[n];
        if (!e || !e.active) continue;
        const key = enemyKey(n, e.gen);
        if (t.hit.has(key)) continue;
        const reach = radius + e.radius;
        const dSq = (e.x - t.x) * (e.x - t.x) + (e.z - t.z) * (e.z - t.z);
        if (dSq > reach * reach) continue;
        // One shove + one damage tick per enemy per tornado. Re-applying the
        // knockback every frame made high-level turbines a permanent wall
        // where nothing ever reached the player.
        t.hit.add(key);
        ctx.enemies.applyKnockback(n, t.vx / speed, t.vz / speed, knockback);
        ctx.dealDamage(n, damage, WEAPON_ACCENT.turbine, 'turbine');
      }
      // Scrap debris kicked up along the path (the icon's trapped junk).
      t.debrisTimer -= dt;
      if (t.debrisTimer <= 0) {
        t.debrisTimer = VISUAL.weaponVfx.turbineDebrisIntervalS;
        ctx.spawnBurst(t.x, t.z, WEAPON_ACCENT.turbine, 1);
      }
      t.mesh.position.set(t.x, 0, t.z);
      t.mesh.rotation.y += dt * 12;
      t.mesh.scale.setScalar(ctx.stats.area * branchMultiplier(ctx, 'turbine', 'radius'));
    }

    // Travel-roar loop: one shared voice while any tornado flies, attenuated by
    // the player's distance to the NEAREST one (it fades as the tornado spins
    // off across the map — the world-distance rule).
    if (anyActive && !this.loopActive) ctx.startWeaponLoop('turbine');
    else if (!anyActive && this.loopActive) ctx.stopWeaponLoop('turbine');
    if (anyActive) {
      const dist = Math.sqrt(nearestSq);
      const atten = Math.max(0, 1 - dist / AUDIO.turbineLoop.maxHearingDistance);
      ctx.setWeaponLoopVolume('turbine', AUDIO.turbineLoop.baseVolume * atten);
    }
    this.loopActive = anyActive;
  }

  reset(): void {
    this.cooldown = 0;
    this.loopActive = false;
    for (const t of this.pool) {
      t.active = false;
      t.mesh.visible = false;
    }
  }
}

interface RicochetShot {
  active: boolean;
  x: number;
  z: number;
  vx: number;
  vz: number;
  bounces: number;
  hit: Set<number>;
}

/** Scrap chunks that bounce from enemy to enemy. */
export class RicochetWeapon {
  private readonly mesh: THREE.InstancedMesh;
  private readonly pool: RicochetShot[] = [];
  private cooldown = 0;
  private spin = 0;
  private trailTimer = 0;

  constructor(scene: THREE.Scene) {
    // A tumbling voxel scrap chunk: dark junk body + purple energy shard, via
    // baked vertex colors (was solid purple, which didn't read as scrap).
    const geometry = buildScrapChunk();
    const material = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.mesh = new THREE.InstancedMesh(geometry, material, WEAPONS.ricochet.maxProjectiles);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    for (let i = 0; i < WEAPONS.ricochet.maxProjectiles; i++) {
      this.pool.push({ active: false, x: 0, z: 0, vx: 0, vz: 0, bounces: 0, hit: new Set() });
      this.mesh.setMatrixAt(i, HIDDEN);
    }
  }

  update(dt: number, px: number, pz: number, level: number, ctx: CombatCtx): void {
    if (level > 0) {
      this.cooldown -= dt;
      if (this.cooldown <= 0 && ctx.enemies.activeCount > 0) {
        const target = findNearestVisible(
          ctx,
          px,
          pz,
          WEAPONS.ricochet.targetRange * ctx.stats.attackRange,
        );
        const e = ctx.enemies.pool[target];
        if (target !== -1 && e) {
          this.cooldown = WEAPONS.ricochet.cooldownS / (
            ctx.stats.attackSpeed * branchMultiplier(ctx, 'ricochet', 'cycle')
          );
          const s = this.pool.find((c) => !c.active);
          if (s) {
            const dist = Math.hypot(e.x - px, e.z - pz) || 1;
            const speed = WEAPONS.ricochet.speed * ctx.stats.projectileSpeed;
            s.active = true;
            s.x = px;
            s.z = pz;
            s.vx = ((e.x - px) / dist) * speed;
            s.vz = ((e.z - pz) / dist) * speed;
            s.bounces = Math.round(
              WEAPONS.ricochet.bounces * branchMultiplier(ctx, 'ricochet', 'bounce-count'),
            ) + quantityBonus(level);
            s.hit.clear();
            ctx.weaponActivated('ricochet');
          }
        }
      }
    }

    const damage = levelScale(
      WEAPONS.ricochet.damage,
      WEAPONS.ricochet.damagePctPerLevel,
      1 + (ctx.weaponBranches.ricochet.damage ?? 0),
    );
    // Shared tumble + zigzag-trail tick for every airborne chunk (the
    // icon's purple zigzag, drawn by the flight path itself).
    this.spin += dt * 9;
    this.trailTimer -= dt;
    const dropTrail = this.trailTimer <= 0;
    if (dropTrail) this.trailTimer = VISUAL.weaponVfx.ricochetTrailIntervalS;
    for (let i = 0; i < this.pool.length; i++) {
      const s = this.pool[i];
      if (!s || !s.active) continue;
      const previousX = s.x;
      const previousZ = s.z;
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      if (
        projectileBlocked(
          ctx,
          previousX,
          previousZ,
          s.x,
          s.z,
          WEAPONS.ricochet.hitRadius,
        )
      ) {
        ctx.spawnBurst(s.x, s.z, WEAPON_ACCENT.ricochet, 2);
        s.active = false;
        this.mesh.setMatrixAt(i, HIDDEN);
        continue;
      }

      // Hit test against the nearest un-hit enemy along the way.
      let struck = -1;
      const hitR = WEAPONS.ricochet.hitRadius;
      for (let n = 0; n < ctx.enemies.pool.length; n++) {
        const e = ctx.enemies.pool[n];
        if (!e || !e.active || s.hit.has(enemyKey(n, e.gen))) continue;
        const reach = hitR + e.radius * 0.5;
        const dSq = (e.x - s.x) * (e.x - s.x) + (e.z - s.z) * (e.z - s.z);
        if (dSq <= reach * reach) {
          struck = n;
          break;
        }
      }
      if (struck !== -1) {
        const struckEnemy = ctx.enemies.pool[struck];
        if (struckEnemy) s.hit.add(enemyKey(struck, struckEnemy.gen));
        ctx.dealDamage(struck, damage, WEAPON_ACCENT.ricochet, 'ricochet');
        s.bounces--;
        // Redirect to the next nearest un-hit enemy within bounce range.
        let next = -1;
        let bestSq = WEAPONS.ricochet.bounceRange * WEAPONS.ricochet.bounceRange;
        for (let n = 0; n < ctx.enemies.pool.length; n++) {
          const e = ctx.enemies.pool[n];
          if (
            !e ||
            !e.active ||
            s.hit.has(enemyKey(n, e.gen)) ||
            !visibleFrom(ctx, s.x, s.z, e.x, e.z)
          ) continue;
          const dSq = (e.x - s.x) * (e.x - s.x) + (e.z - s.z) * (e.z - s.z);
          if (dSq < bestSq) {
            bestSq = dSq;
            next = n;
          }
        }
        const nextEnemy = ctx.enemies.pool[next];
        if (s.bounces <= 0 || next === -1 || !nextEnemy) {
          s.active = false;
          this.mesh.setMatrixAt(i, HIDDEN);
          continue;
        }
        const dist = Math.hypot(nextEnemy.x - s.x, nextEnemy.z - s.z) || 1;
        const speed = Math.hypot(s.vx, s.vz);
        s.vx = ((nextEnemy.x - s.x) / dist) * speed;
        s.vz = ((nextEnemy.z - s.z) / dist) * speed;
      } else if (
        Math.abs(s.x - px) > WEAPONS.ricochet.despawnDist ||
        Math.abs(s.z - pz) > WEAPONS.ricochet.despawnDist
      ) {
        s.active = false;
        this.mesh.setMatrixAt(i, HIDDEN);
        continue;
      }

      if (dropTrail) ctx.spawnBurst(s.x, s.z, WEAPON_ACCENT.ricochet, 1);
      tmpMatrix.makeRotationY(Math.atan2(s.vx, s.vz));
      tmpMatrixB.makeRotationX(this.spin + i * 1.3);
      tmpMatrix.multiply(tmpMatrixB);
      tmpMatrix.setPosition(s.x, 1, s.z);
      this.mesh.setMatrixAt(i, tmpMatrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  reset(): void {
    this.cooldown = 0;
    for (let i = 0; i < this.pool.length; i++) {
      const s = this.pool[i];
      if (s) s.active = false;
      this.mesh.setMatrixAt(i, HIDDEN);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Heavy claw strike that EXECUTES non-boss enemies below a HP threshold. */
export class DismantlerWeapon {
  private readonly claw: THREE.Mesh;
  private cooldown = 0;
  private flash = 0;
  private strikeScale = 1;

  constructor(scene: THREE.Scene) {
    const geometry = mergeClawGeometry();
    const material = new THREE.MeshBasicMaterial({
      color: 0xffd24a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.claw = new THREE.Mesh(geometry, material);
    scene.add(this.claw);
  }

  update(dt: number, px: number, pz: number, level: number, ctx: CombatCtx): void {
    const material = this.claw.material as THREE.MeshBasicMaterial;
    if (level <= 0) {
      material.opacity = 0;
      return;
    }

    this.cooldown -= dt;
    if (this.cooldown <= 0) {
      const range = WEAPONS.dismantler.range * ctx.stats.attackRange *
        branchMultiplier(ctx, 'dismantler', 'range');
      // Hunter: one heavy committed strike per cooldown belongs on the big
      // target, not on whichever grunt happened to drift closest.
      const target = findNearestVisible(ctx, px, pz, range, null, BOSS_TARGET_BIAS);
      const e = ctx.enemies.pool[target];
      if (target !== -1 && e) {
        this.cooldown = WEAPONS.dismantler.cooldownS / ctx.stats.attackSpeed;
        this.flash = 0.18;
        this.claw.position.set(e.x, 1.2, e.z);
        // Every swipe lands at its own angle — a claw, not a stamp.
        this.claw.rotation.y = Math.random() * Math.PI;
        this.strikeScale = 1 + e.radius;
        // The claw strikes the enemy AWAY from the player → attenuate by distance.
        ctx.weaponActivated('dismantler', e.x, e.z);

        const threshold = Math.min(
          WEAPONS.dismantler.thresholdCap,
          WEAPONS.dismantler.executeThreshold +
            (ctx.weaponBranches.dismantler['execute-threshold'] ?? 0) *
              WEAPONS.dismantler.thresholdPerLevel,
        );
        const isBoss = ctx.enemies.isBossIndex(target);
        if (!isBoss && e.hp / e.maxHp <= threshold) {
          // Execute: guaranteed lethal — and the dismantling is SEEN as an
          // extra amber shred on top of the death burst.
          ctx.spawnBurst(e.x, e.z, WEAPON_ACCENT.dismantler, 6);
          ctx.dealDamage(target, e.maxHp * 100, WEAPON_ACCENT.dismantler, 'dismantler');
        } else {
          const damage = levelScale(
            WEAPONS.dismantler.damage,
            WEAPONS.dismantler.damagePctPerLevel,
            1 + (ctx.weaponBranches.dismantler.damage ?? 0),
          );
          ctx.dealDamage(target, damage, WEAPON_ACCENT.dismantler, 'dismantler');
        }
      }
    }

    if (this.flash > 0) {
      this.flash -= dt;
      const t = Math.max(this.flash, 0) / 0.18;
      // Strike punch: the marks land oversized and settle as they fade.
      this.claw.scale.setScalar(this.strikeScale * (1 + 0.45 * t));
      material.opacity = 0.9 * t;
    } else {
      material.opacity = 0;
    }
  }

  reset(): void {
    this.cooldown = 0;
    this.flash = 0;
    (this.claw.material as THREE.MeshBasicMaterial).opacity = 0;
  }
}

/** Claw SWIPE: three parallel diagonal slash marks (the icon's scratch
 *  marks), flashed on the struck target. */
function mergeClawGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = -1; i <= 1; i++) {
    const slash = new THREE.BoxGeometry(1.7, 0.12, 0.2);
    slash.translate(0, 0, i * 0.42);
    slash.rotateY(Math.PI / 4);
    parts.push(slash.toNonIndexed());
  }
  return mergeGeometries(parts) ?? new THREE.BoxGeometry(1.6, 0.12, 0.25);
}

/** Owns all weapon instances and routes updates by owned level. */
export class WeaponManager {
  private readonly bolt: BoltWeapon;
  private readonly pulse: PulseWeapon;
  private readonly blades: BladeWeapon;
  private readonly welder: WelderWeapon;
  private readonly press: PressWeapon;
  private readonly tire: TireWeapon;
  private readonly oil: OilWeapon;
  private readonly acid: AcidWeapon;
  private readonly turbine: TurbineWeapon;
  private readonly ricochet: RicochetWeapon;
  private readonly dismantler: DismantlerWeapon;

  constructor(scene: THREE.Scene) {
    this.bolt = new BoltWeapon(scene);
    this.pulse = new PulseWeapon(scene);
    this.blades = new BladeWeapon(scene);
    this.welder = new WelderWeapon(scene);
    this.press = new PressWeapon(scene);
    this.tire = new TireWeapon(scene);
    this.oil = new OilWeapon(scene);
    this.acid = new AcidWeapon(scene);
    this.turbine = new TurbineWeapon(scene);
    this.ricochet = new RicochetWeapon(scene);
    this.dismantler = new DismantlerWeapon(scene);
  }

  update(dt: number, px: number, pz: number, levels: WeaponLevels, ctx: CombatCtx): void {
    this.bolt.update(dt, px, pz, levels.bolt, ctx);
    this.pulse.update(dt, px, pz, levels.pulse, ctx);
    this.blades.update(dt, px, pz, levels.blades, ctx);
    this.welder.update(dt, px, pz, levels.welder, ctx);
    this.press.update(dt, px, pz, levels.press, ctx);
    this.tire.update(dt, px, pz, levels.tire, ctx);
    this.oil.update(dt, px, pz, levels.oil, ctx);
    this.acid.update(dt, px, pz, levels.acid, ctx);
    this.turbine.update(dt, px, pz, levels.turbine, ctx);
    this.ricochet.update(dt, px, pz, levels.ricochet, ctx);
    this.dismantler.update(dt, px, pz, levels.dismantler, ctx);
  }

  reset(): void {
    this.bolt.reset();
    this.pulse.reset();
    this.blades.reset();
    this.welder.reset();
    this.press.reset();
    this.tire.reset();
    this.oil.reset();
    this.acid.reset();
    this.turbine.reset();
    this.ricochet.reset();
    this.dismantler.reset();
  }
}
