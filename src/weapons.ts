import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WEAPONS } from './config';
import { litMaterial } from './toon';
import type { EnemySystem } from './enemies';
import type { PlayerStats } from './stats';
import type { WeaponLevels } from './upgrades';

// Every weapon reads the shared stat sheet plus its own level. Damage is
// routed through CombatCtx.dealDamage, which owns crit rolls, damage numbers,
// orb drops and kill accounting — weapons only decide WHO gets hit and the
// base amount.

export interface CombatCtx {
  stats: PlayerStats;
  enemies: EnemySystem;
  /** Rolls crit, applies damage, shows the number, handles death rewards. */
  dealDamage(enemyIndex: number, baseDamage: number): void;
}

interface Projectile {
  active: boolean;
  x: number;
  z: number;
  vx: number;
  vz: number;
  life: number;
}

const tmpMatrix = new THREE.Matrix4();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/** Generation-aware key for a `hit: Set<number>` so a pool slot reused by a
 *  new enemy (same index, bumped gen) doesn't inherit the old enemy's hit
 *  state. */
function enemyKey(index: number, gen: number): number {
  return index * 1000 + (gen % 1000);
}

/** Auto-firing direct projectile: targets the nearest enemies, no manual aim. */
export class BoltWeapon {
  private readonly mesh: THREE.InstancedMesh;
  private readonly pool: Projectile[] = [];
  private cooldown = 0;

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.SphereGeometry(WEAPONS.bolt.projectileRadius, 6, 4);
    const material = new THREE.MeshBasicMaterial({ color: 0xffe066 });
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
        this.cooldown = WEAPONS.bolt.cooldownS / ctx.stats.attackSpeed;
        const count =
          1 +
          Math.floor((level - 1) / WEAPONS.bolt.projectilePerLevels) +
          ctx.stats.projectileCount;
        this.fireVolley(px, pz, ctx, count);
      }
    }

    const baseDamage = WEAPONS.bolt.damage + (level - 1) * WEAPONS.bolt.damagePerLevel;
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p || !p.active) continue;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.life -= dt;
      if (p.life <= 0) {
        this.deactivate(i);
        continue;
      }
      const hit = ctx.enemies.findNearest(p.x, p.z, WEAPONS.bolt.hitRadius * ctx.stats.area);
      if (hit !== -1) {
        ctx.dealDamage(hit, baseDamage);
        this.deactivate(i);
        continue;
      }
      tmpMatrix.makeScale(ctx.stats.area, ctx.stats.area, ctx.stats.area);
      tmpMatrix.setPosition(p.x, 1, p.z);
      this.mesh.setMatrixAt(i, tmpMatrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private fireVolley(px: number, pz: number, ctx: CombatCtx, count: number): void {
    const range = WEAPONS.bolt.range * ctx.stats.attackRange;
    const targets: number[] = [];
    const taken = new Set<number>();
    for (let n = 0; n < count; n++) {
      let best = -1;
      let bestSq = range * range;
      for (let i = 0; i < ctx.enemies.pool.length; i++) {
        const e = ctx.enemies.pool[i];
        if (!e || !e.active || taken.has(i)) continue;
        const dSq = (e.x - px) * (e.x - px) + (e.z - pz) * (e.z - pz);
        if (dSq < bestSq) {
          bestSq = dSq;
          best = i;
        }
      }
      if (best === -1) break;
      taken.add(best);
      targets.push(best);
    }
    if (targets.length === 0) return;
    const speed = WEAPONS.bolt.speed * ctx.stats.projectileSpeed;
    for (let n = 0; n < count; n++) {
      const target = targets[n % targets.length];
      if (target === undefined) break;
      const e = ctx.enemies.pool[target];
      if (!e) continue;
      this.launch(px, pz, e.x, e.z, speed);
    }
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
      new THREE.RingGeometry(0.9, 1, 40),
      new THREE.MeshBasicMaterial({
        color: 0x7ee0ff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
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
      (WEAPONS.pulse.radius + (level - 1) * WEAPONS.pulse.radiusPerLevel) * ctx.stats.area;
    this.cooldown -= dt;
    if (this.cooldown <= 0) {
      this.cooldown = WEAPONS.pulse.cooldownS / ctx.stats.attackSpeed;
      this.flash = 0.35;
      const damage = WEAPONS.pulse.damage + (level - 1) * WEAPONS.pulse.damagePerLevel;
      for (let i = 0; i < ctx.enemies.pool.length; i++) {
        const e = ctx.enemies.pool[i];
        if (!e || !e.active) continue;
        const dSq = (e.x - px) * (e.x - px) + (e.z - pz) * (e.z - pz);
        if (dSq <= radius * radius) ctx.dealDamage(i, damage);
      }
    }

    if (this.flash > 0) {
      this.flash -= dt;
      const t = 1 - Math.max(this.flash, 0) / 0.35;
      const r = radius * (0.3 + 0.7 * t);
      this.ring.scale.set(r, r, 1);
      this.ring.position.set(px, 0.1, pz);
      material.opacity = 0.8 * (1 - t);
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

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.BoxGeometry(0.9, 0.15, 0.35);
    const material = litMaterial({ color: 0xc9d4de });
    for (let i = 0; i < WEAPONS.blades.maxBlades; i++) {
      const blade = new THREE.Mesh(geometry, material);
      blade.visible = false;
      scene.add(blade);
      this.blades.push(blade);
    }
  }

  update(dt: number, px: number, pz: number, level: number, ctx: CombatCtx): void {
    this.angle += WEAPONS.blades.rotationSpeed * ctx.stats.attackSpeed * dt;
    const count = Math.min(level, this.blades.length);
    const damage = WEAPONS.blades.damage + (level - 1) * WEAPONS.blades.damagePerLevel;
    const orbit = WEAPONS.blades.orbitRadius * ctx.stats.area;
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
      blade.rotation.y = -a;
      blade.scale.setScalar(ctx.stats.area);

      for (let i = 0; i < ctx.enemies.pool.length; i++) {
        const e = ctx.enemies.pool[i];
        if (!e || !e.active || e.bladeHitTimer > 0) continue;
        const reach = reachBase + e.radius;
        const dSq = (e.x - bx) * (e.x - bx) + (e.z - bz) * (e.z - bz);
        if (dSq <= reach * reach) {
          e.bladeHitTimer = WEAPONS.blades.hitCooldownS;
          ctx.dealDamage(i, damage);
        }
      }
    }
  }

  reset(): void {
    this.angle = 0;
    for (const blade of this.blades) blade.visible = false;
  }
}

/** Continuous beam that ramps up damage while locked on the same target. */
export class WelderWeapon {
  private readonly beam: THREE.Mesh;
  private target = -1;
  private targetGen = -1;
  private lockTime = 0;
  private tickTimer = 0;

  constructor(scene: THREE.Scene) {
    this.beam = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.14, 1),
      new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.9 }),
    );
    this.beam.visible = false;
    scene.add(this.beam);
  }

  update(dt: number, px: number, pz: number, level: number, ctx: CombatCtx): void {
    if (level <= 0) {
      this.beam.visible = false;
      return;
    }

    const range = WEAPONS.welder.range * ctx.stats.attackRange;
    // Re-validate the lock: dead, out-of-range, or stale (slot reused by a
    // different enemy) targets reset the ramp.
    const current = ctx.enemies.pool[this.target];
    let valid =
      this.target !== -1 && !!current && current.active && current.gen === this.targetGen;
    if (valid && current) {
      const dSq = (current.x - px) * (current.x - px) + (current.z - pz) * (current.z - pz);
      valid = dSq <= range * range;
    }
    if (!valid) {
      this.target = ctx.enemies.findNearest(px, pz, range);
      this.targetGen = ctx.enemies.pool[this.target]?.gen ?? -1;
      this.lockTime = 0;
    }

    const e = ctx.enemies.pool[this.target];
    if (this.target === -1 || !e || !e.active) {
      this.beam.visible = false;
      return;
    }

    this.lockTime += dt;
    this.tickTimer -= dt;
    if (this.tickTimer <= 0) {
      this.tickTimer = WEAPONS.welder.tickS / ctx.stats.attackSpeed;
      const rampRate =
        WEAPONS.welder.rampPerSecond * (1 + (level - 1) * WEAPONS.welder.rampPerLevel);
      const ramp = Math.min(1 + this.lockTime * rampRate, WEAPONS.welder.rampCap);
      const damage =
        (WEAPONS.welder.damage + (level - 1) * WEAPONS.welder.damagePerLevel) * ramp;
      ctx.dealDamage(this.target, damage);
    }

    // Stretch the beam between player and target.
    const dx = e.x - px;
    const dz = e.z - pz;
    const dist = Math.hypot(dx, dz) || 1;
    this.beam.visible = true;
    this.beam.position.set(px + dx / 2, 1.1, pz + dz / 2);
    this.beam.scale.set(1, 1, dist);
    this.beam.rotation.y = Math.atan2(dx, dz);
  }

  reset(): void {
    this.target = -1;
    this.targetGen = -1;
    this.lockTime = 0;
    this.tickTimer = 0;
    this.beam.visible = false;
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
    this.plate = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.15, 1),
      new THREE.MeshBasicMaterial({ color: 0xffc44d, transparent: true, opacity: 0 }),
    );
    this.plate.position.y = 0.15;
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
      (WEAPONS.press.width + (level - 1) * WEAPONS.press.widthPerLevel) * ctx.stats.area;

    this.cooldown -= dt;
    if (this.cooldown <= 0) {
      // Aim the lane at the nearest enemy; hold fire when nothing is in reach.
      const target = ctx.enemies.findNearest(px, pz, length);
      const e = ctx.enemies.pool[target];
      if (target !== -1 && e) {
        this.cooldown = WEAPONS.press.cooldownS / ctx.stats.attackSpeed;
        this.flash = 0.25;
        const dist = Math.hypot(e.x - px, e.z - pz) || 1;
        const dirX = (e.x - px) / dist;
        const dirZ = (e.z - pz) / dist;
        const damage = WEAPONS.press.damage + (level - 1) * WEAPONS.press.damagePerLevel;
        // Zone check: project each enemy onto the lane axis.
        for (let i = 0; i < ctx.enemies.pool.length; i++) {
          const other = ctx.enemies.pool[i];
          if (!other || !other.active) continue;
          const rx = other.x - px;
          const rz = other.z - pz;
          const along = rx * dirX + rz * dirZ;
          if (along < 0 || along > length) continue;
          const across = Math.abs(rx * -dirZ + rz * dirX);
          if (across <= width / 2 + other.radius) ctx.dealDamage(i, damage);
        }
        this.plate.position.set(px + dirX * (length / 2), 0.15, pz + dirZ * (length / 2));
        this.plate.scale.set(width, 1, length);
        this.plate.rotation.y = Math.atan2(dirX, dirZ);
      }
    }

    if (this.flash > 0) {
      this.flash -= dt;
      material.opacity = 0.5 * (this.flash / 0.25);
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
  hit: Set<number>;
  mesh: THREE.Mesh;
}

/** Burning tires that roll in a straight line through the swarm. */
export class TireWeapon {
  private readonly pool: Tire[] = [];
  private cooldown = 0;

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.TorusGeometry(0.55, 0.22, 6, 10);
    const material = litMaterial({ color: 0xff7733 });
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
        hit: new Set(),
        mesh,
      });
    }
  }

  update(dt: number, px: number, pz: number, level: number, ctx: CombatCtx): void {
    if (level > 0) {
      this.cooldown -= dt;
      if (this.cooldown <= 0 && ctx.enemies.activeCount > 0) {
        this.cooldown = WEAPONS.tire.cooldownS / ctx.stats.attackSpeed;
        const count = 1 + Math.floor((level - 1) / WEAPONS.tire.tirePerLevels);
        const target = ctx.enemies.findNearest(px, pz, WEAPONS.tire.targetRange);
        const e = ctx.enemies.pool[target];
        const baseAngle = e ? Math.atan2(e.x - px, e.z - pz) : Math.random() * Math.PI * 2;
        for (let n = 0; n < count; n++) {
          const angle = baseAngle + (n - (count - 1) / 2) * 0.35;
          this.launch(px, pz, angle, ctx.stats.projectileSpeed);
        }
      }
    }

    const damage = WEAPONS.tire.damage + (level - 1) * WEAPONS.tire.damagePerLevel;
    const hitRadius = WEAPONS.tire.radius * ctx.stats.area;
    for (const t of this.pool) {
      if (!t.active) continue;
      t.x += t.vx * dt;
      t.z += t.vz * dt;
      t.life -= dt;
      t.roll += Math.hypot(t.vx, t.vz) * dt / 0.55;
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
          ctx.dealDamage(i, damage);
        }
      }
      t.mesh.position.set(t.x, 0.75 * ctx.stats.area, t.z);
      t.mesh.rotation.set(t.roll, Math.atan2(t.vx, t.vz), 0, 'YXZ');
      t.mesh.scale.setScalar(ctx.stats.area);
    }
  }

  private launch(px: number, pz: number, angle: number, speedMult: number): void {
    const t = this.pool.find((c) => !c.active);
    if (!t) return;
    const speed = WEAPONS.tire.speed * speedMult;
    t.active = true;
    t.x = px;
    t.z = pz;
    t.vx = Math.sin(angle) * speed;
    t.vz = Math.cos(angle) * speed;
    t.life = WEAPONS.tire.lifetimeS;
    t.roll = 0;
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
  private lastX = 0;
  private lastZ = 0;

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.CircleGeometry(1, 14);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      color: 0x1a1522,
      transparent: true,
      opacity: 0.6,
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
          p.life = WEAPONS.oil.puddleLifeS * ctx.stats.duration;
        }
      }
    }

    const radius =
      (WEAPONS.oil.puddleRadius + (level - 1) * WEAPONS.oil.radiusPerLevel) * ctx.stats.area;
    const slowFactor = Math.max(
      0.2,
      WEAPONS.oil.slowFactor + (level - 1) * WEAPONS.oil.slowFactorPerLevel,
    );
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
        }
      }
      tmpMatrix.makeScale(radius, 1, radius);
      tmpMatrix.setPosition(p.x, 0.03, p.z);
      this.mesh.setMatrixAt(i, tmpMatrix);
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
  private readonly zones: { active: boolean; x: number; z: number; life: number }[] = [];
  private cooldown = 0;

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.CircleGeometry(1, 18);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      color: 0x52e858,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, WEAPONS.acid.maxZones);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    for (let i = 0; i < WEAPONS.acid.maxZones; i++) {
      this.zones.push({ active: false, x: 0, z: 0, life: 0 });
      this.mesh.setMatrixAt(i, HIDDEN);
    }
  }

  update(dt: number, px: number, pz: number, level: number, ctx: CombatCtx): void {
    if (level > 0) {
      this.cooldown -= dt;
      if (this.cooldown <= 0) {
        const target = ctx.enemies.findNearest(px, pz, WEAPONS.acid.targetRange * ctx.stats.attackRange);
        const e = ctx.enemies.pool[target];
        if (target !== -1 && e) {
          this.cooldown = WEAPONS.acid.cooldownS / ctx.stats.attackSpeed;
          const z = this.zones.find((c) => !c.active) ?? this.zones[0];
          if (z) {
            z.active = true;
            z.x = e.x;
            z.z = e.z;
            z.life = WEAPONS.acid.zoneLifeS * ctx.stats.duration;
          }
        }
      }
    }

    const radius =
      (WEAPONS.acid.zoneRadius + (level - 1) * WEAPONS.acid.radiusPerLevel) * ctx.stats.area;
    const dps = WEAPONS.acid.dotDps + (level - 1) * WEAPONS.acid.dpsPerLevel;
    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i];
      if (!z || !z.active) continue;
      z.life -= dt;
      if (z.life <= 0) {
        z.active = false;
        this.mesh.setMatrixAt(i, HIDDEN);
        continue;
      }
      for (let n = 0; n < ctx.enemies.pool.length; n++) {
        const e = ctx.enemies.pool[n];
        if (!e || !e.active) continue;
        const dSq = (e.x - z.x) * (e.x - z.x) + (e.z - z.z) * (e.z - z.z);
        if (dSq <= radius * radius) {
          ctx.enemies.applyDot(n, dps, WEAPONS.acid.dotDurationS * ctx.stats.duration);
        }
      }
      tmpMatrix.makeScale(radius, 1, radius);
      tmpMatrix.setPosition(z.x, 0.04, z.z);
      this.mesh.setMatrixAt(i, tmpMatrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  reset(): void {
    this.cooldown = 0;
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
  hit: Set<number>;
  mesh: THREE.Group;
}

/** Launches tornadoes that damage lightly and shove the swarm away. */
export class TurbineWeapon {
  private readonly pool: Tornado[] = [];
  private cooldown = 0;

  constructor(scene: THREE.Scene) {
    // Tornado look: three tilted debris rings widening with height, spun fast.
    const material = new THREE.MeshBasicMaterial({
      color: 0xcfe8f0,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    for (let i = 0; i < WEAPONS.turbine.maxTornadoes; i++) {
      const group = new THREE.Group();
      const radii = [0.45, 0.8, 1.15];
      radii.forEach((r, level) => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.09, 5, 12), material);
        ring.rotation.x = Math.PI / 2 + (level - 1) * 0.18;
        ring.position.y = 0.4 + level * 0.75;
        group.add(ring);
      });
      group.visible = false;
      scene.add(group);
      this.pool.push({ active: false, x: 0, z: 0, vx: 0, vz: 0, life: 0, hit: new Set(), mesh: group });
    }
  }

  update(dt: number, px: number, pz: number, level: number, ctx: CombatCtx): void {
    if (level > 0) {
      this.cooldown -= dt;
      if (this.cooldown <= 0 && ctx.enemies.activeCount > 0) {
        const target = ctx.enemies.findNearest(px, pz, WEAPONS.turbine.targetRange);
        const e = ctx.enemies.pool[target];
        if (target !== -1 && e) {
          this.cooldown = WEAPONS.turbine.cooldownS / ctx.stats.attackSpeed;
          const t = this.pool.find((c) => !c.active);
          if (t) {
            const dist = Math.hypot(e.x - px, e.z - pz) || 1;
            t.active = true;
            t.x = px;
            t.z = pz;
            t.vx = ((e.x - px) / dist) * WEAPONS.turbine.speed * ctx.stats.projectileSpeed;
            t.vz = ((e.z - pz) / dist) * WEAPONS.turbine.speed * ctx.stats.projectileSpeed;
            t.life = WEAPONS.turbine.lifetimeS * ctx.stats.duration;
            t.hit.clear();
            t.mesh.visible = true;
          }
        }
      }
    }

    const damage = WEAPONS.turbine.damage + (level - 1) * WEAPONS.turbine.damagePerLevel;
    const radius = WEAPONS.turbine.radius * ctx.stats.area;
    for (const t of this.pool) {
      if (!t.active) continue;
      t.x += t.vx * dt;
      t.z += t.vz * dt;
      t.life -= dt;
      if (t.life <= 0) {
        t.active = false;
        t.mesh.visible = false;
        continue;
      }
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
        ctx.enemies.applyKnockback(n, t.vx / speed, t.vz / speed, WEAPONS.turbine.knockbackForce);
        ctx.dealDamage(n, damage);
      }
      t.mesh.position.set(t.x, 0, t.z);
      t.mesh.rotation.y += dt * 12;
      t.mesh.scale.setScalar(ctx.stats.area);
    }
  }

  reset(): void {
    this.cooldown = 0;
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

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.OctahedronGeometry(0.32, 0);
    const material = new THREE.MeshBasicMaterial({ color: 0xb9c8d4 });
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
        const target = ctx.enemies.findNearest(px, pz, WEAPONS.ricochet.targetRange * ctx.stats.attackRange);
        const e = ctx.enemies.pool[target];
        if (target !== -1 && e) {
          this.cooldown = WEAPONS.ricochet.cooldownS / ctx.stats.attackSpeed;
          const s = this.pool.find((c) => !c.active);
          if (s) {
            const dist = Math.hypot(e.x - px, e.z - pz) || 1;
            const speed = WEAPONS.ricochet.speed * ctx.stats.projectileSpeed;
            s.active = true;
            s.x = px;
            s.z = pz;
            s.vx = ((e.x - px) / dist) * speed;
            s.vz = ((e.z - pz) / dist) * speed;
            s.bounces =
              WEAPONS.ricochet.bounces +
              Math.floor((level - 1) / WEAPONS.ricochet.bouncePerLevels);
            s.hit.clear();
          }
        }
      }
    }

    const damage = WEAPONS.ricochet.damage + (level - 1) * WEAPONS.ricochet.damagePerLevel;
    for (let i = 0; i < this.pool.length; i++) {
      const s = this.pool[i];
      if (!s || !s.active) continue;
      s.x += s.vx * dt;
      s.z += s.vz * dt;

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
        ctx.dealDamage(struck, damage);
        s.bounces--;
        // Redirect to the next nearest un-hit enemy within bounce range.
        let next = -1;
        let bestSq = WEAPONS.ricochet.bounceRange * WEAPONS.ricochet.bounceRange;
        for (let n = 0; n < ctx.enemies.pool.length; n++) {
          const e = ctx.enemies.pool[n];
          if (!e || !e.active || s.hit.has(enemyKey(n, e.gen))) continue;
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

      tmpMatrix.makeRotationY(Math.atan2(s.vx, s.vz));
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
      const range = WEAPONS.dismantler.range * ctx.stats.attackRange;
      const target = ctx.enemies.findNearest(px, pz, range);
      const e = ctx.enemies.pool[target];
      if (target !== -1 && e) {
        this.cooldown = WEAPONS.dismantler.cooldownS / ctx.stats.attackSpeed;
        this.flash = 0.18;
        this.claw.position.set(e.x, 1.2, e.z);
        this.claw.scale.setScalar(1 + e.radius);

        const threshold =
          WEAPONS.dismantler.executeThreshold +
          (level - 1) * WEAPONS.dismantler.thresholdPerLevel;
        const isBoss = ctx.enemies.isBossIndex(target);
        if (!isBoss && e.hp / e.maxHp <= threshold) {
          // Execute: guaranteed lethal regardless of multipliers.
          ctx.dealDamage(target, e.maxHp * 100);
        } else {
          const damage =
            WEAPONS.dismantler.damage + (level - 1) * WEAPONS.dismantler.damagePerLevel;
          ctx.dealDamage(target, damage);
        }
      }
    }

    if (this.flash > 0) {
      this.flash -= dt;
      material.opacity = 0.9 * (this.flash / 0.18);
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

/** X-shaped claw mark flashed on the executed target. */
function mergeClawGeometry(): THREE.BufferGeometry {
  const a = new THREE.BoxGeometry(1.6, 0.12, 0.25);
  a.rotateY(Math.PI / 4);
  const b = new THREE.BoxGeometry(1.6, 0.12, 0.25);
  b.rotateY(-Math.PI / 4);
  return mergeGeometries([a.toNonIndexed(), b.toNonIndexed()]) ?? a;
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
