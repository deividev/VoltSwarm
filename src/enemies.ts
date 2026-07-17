import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  ARENA_HALF_SIZE,
  BOSS_TYPE_INDEXES,
  ELITES,
  ENEMIES,
  ENEMY_TYPES,
  FLYER,
  GUNNER,
  ROLLER,
  STATUS,
  VISUAL,
  type EnemyTypeDef,
  type WeaponId,
} from './config';
import type { EnemyProjectiles } from './enemy-projectiles';
import { findClearSpot, findRandomClearSpot, type Obstacle } from './world';
import { buildGridGeometry } from './models/voxel-builder';
import { buildModelGrid, modelKeyForTypeName, VOXEL_MODELS } from './models/registry';
import { litMaterial } from './toon';

// Each enemy type has its own voxel-style bot silhouette and renders through
// its own InstancedMesh (one draw call per type). This is the non-negotiable
// performance guardrail: hundreds of chasers, six draw calls total.

export interface Enemy {
  active: boolean;
  typeIndex: number;
  /** Instance slot inside this type's InstancedMesh. */
  slot: number;
  /** Bumped every time this pool slot is (re)occupied by spawnAt — lets
   *  weapons detect a stale index that now points at a different enemy. */
  gen: number;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  speed: number;
  scale: number;
  radius: number;
  xp: number;
  elite: boolean;
  /** Roller: committed heading (radians). Flyer/others unused. */
  heading: number;
  /** Roller: accumulated rolling rotation. Gunner: shoot cooldown. */
  phase: number;
  /** Per-enemy immunity timer for orbital blade / tire contact damage. */
  bladeHitTimer: number;
  hitFlash: number;
  // Status effects.
  slowTimer: number;
  slowFactor: number;
  /** Current state-tint index (see TINTS) — edge-detected each frame. */
  tintState: number;
  /** Flavor of the current full stop: true = frost (Coolant), false = zap. */
  iceStun: boolean;
  dotTimer: number;
  dotDps: number;
  dotTick: number;
  /** Weapon that owns the active DoT, for end-of-run damage attribution. */
  dotWeaponId: WeaponId | null;
  kbX: number;
  kbZ: number;
}

export interface DeathInfo {
  xp: number;
  x: number;
  z: number;
  elite: boolean;
  typeIndex: number;
}

const DARK = 0x232830;
const tmpMatrix = new THREE.Matrix4();
const tmpRot = new THREE.Matrix4();
const tmpColor = new THREE.Color();
const tmpScale = new THREE.Vector3();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const BASE_TINT = new THREE.Color(1, 1, 1);
// Values above 1 brighten the vertex colors — used as the damage flash.
const FLASH_TINT = new THREE.Color(2.5, 2.5, 2.5);
const ELITE_TINT = new THREE.Color(1.6, 0.45, 2.1);
// State tints, multiplicative over the voxel vertex colors (values past 1
// brighten). Index = the enemy's tintState: 0 base, 1 electric stun (Stun
// Bumper), 2 frost stop (Coolant), 3 acid DoT (corroding), 4 elite.
const STUN_TINT = new THREE.Color(0.35, 2.2, 2.4);
const FROST_TINT = new THREE.Color(1.3, 1.9, 2.6);
const ACID_TINT = new THREE.Color(0.45, 2.0, 0.55);
// Oil slow (index 5): a DARK, cool oily slick. The energy states own the bright
// hues (cyan/blue/green/purple) and a multiplicative hue-tint can't converge
// warm anyway (it preserves each body's base ratio), so Oil instead DARKENS
// every slowed enemy uniformly — they read as heavy, gunked, sluggish, the same
// on any body colour. It does NOT blink (a coating, not an energy pulse), so it
// adds no strobe (which the user dislikes). Gives Oil the missing "something is
// happening" signal (user feedback).
const OIL_TINT = new THREE.Color(0.4, 0.42, 0.55);

const TINTS = [BASE_TINT, STUN_TINT, FROST_TINT, ACID_TINT, ELITE_TINT, OIL_TINT];

const ELITE_AURA_CAPACITY = 64;

export class EnemySystem {
  readonly pool: Enemy[] = [];
  activeCount = 0;

  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly eliteAura: THREE.InstancedMesh;
  private readonly bossAura: THREE.InstancedMesh;
  private readonly blobShadows: THREE.InstancedMesh | null = null;
  private spawnTimer = 0;
  private readonly grid = new Map<number, number[]>();

  constructor(scene: THREE.Scene) {
    // Uniform elite marker: a rotating SEGMENTED magenta ring under every
    // elite. The body tint alone shifts with each type's base color, so the
    // ring is the one signal that always reads the same; the segmented spin
    // keeps it distinct from the boss's solid double ring.
    const auraCfg = ELITES.aura;
    const arcParts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < auraCfg.arcs; i++) {
      const start = (i / auraCfg.arcs) * Math.PI * 2;
      const length = ((Math.PI * 2) / auraCfg.arcs) * auraCfg.arcFill;
      arcParts.push(
        new THREE.RingGeometry(auraCfg.innerRadius, auraCfg.outerRadius, 10, 1, start, length)
          .toNonIndexed(),
      );
    }
    const auraGeometry = mergeGeometries(arcParts);
    auraGeometry.rotateX(-Math.PI / 2);
    this.eliteAura = new THREE.InstancedMesh(
      auraGeometry,
      new THREE.MeshBasicMaterial({
        color: auraCfg.color,
        transparent: true,
        opacity: auraCfg.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      ELITE_AURA_CAPACITY,
    );
    this.eliteAura.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.eliteAura.frustumCulled = false;
    this.eliteAura.count = 0;
    scene.add(this.eliteAura);

    // Boss-exclusive marker: a wide double red ring, matching the totem and
    // the boss bar. Color language: magenta = elite, red = boss.
    const bossRingGeometry = mergeGeometries([
      new THREE.RingGeometry(0.85, 1.0, 32).toNonIndexed(),
      new THREE.RingGeometry(1.12, 1.2, 32).toNonIndexed(),
    ]);
    bossRingGeometry?.rotateX(-Math.PI / 2);
    this.bossAura = new THREE.InstancedMesh(
      bossRingGeometry ?? new THREE.RingGeometry(0.85, 1.2, 32),
      new THREE.MeshBasicMaterial({
        color: 0xff3355,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      BOSS_TYPE_INDEXES.length,
    );
    this.bossAura.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bossAura.frustumCulled = false;
    this.bossAura.count = 0;
    scene.add(this.bossAura);

    // Blob shadows: one dark disc per active enemy, anchoring everything to
    // the ground (flyers included — their disc stays down while they hover).
    if (VISUAL.blobShadow.enabled) {
      const totalCapacity = ENEMY_TYPES.reduce((sum, type) => sum + type.capacity, 0);
      const shadowGeometry = new THREE.CircleGeometry(1, 20);
      shadowGeometry.rotateX(-Math.PI / 2);
      this.blobShadows = new THREE.InstancedMesh(
        shadowGeometry,
        new THREE.MeshBasicMaterial({
          color: 0x000000,
          transparent: true,
          opacity: VISUAL.blobShadow.opacity,
          depthWrite: false,
        }),
        totalCapacity,
      );
      this.blobShadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.blobShadows.frustumCulled = false;
      this.blobShadows.count = 0;
      scene.add(this.blobShadows);
    }

    const material = litMaterial({ vertexColors: true });
    // High-detail voxel models load async (image-derived) and swap in over
    // the primitive bots; on failure the primitives simply stay.
    void this.upgradeVoxelModels();
    ENEMY_TYPES.forEach((type, typeIndex) => {
      const mesh = new THREE.InstancedMesh(buildBotGeometry(typeIndex, type), material, type.capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.meshes.push(mesh);

      for (let slot = 0; slot < type.capacity; slot++) {
        mesh.setMatrixAt(slot, HIDDEN);
        mesh.setColorAt(slot, BASE_TINT);
        this.pool.push({
          active: false,
          typeIndex,
          slot,
          gen: 0,
          x: 0,
          z: 0,
          hp: 0,
          maxHp: 0,
          speed: 0,
          scale: 1,
          radius: 0.5,
          xp: 0,
          elite: false,
          heading: 0,
          phase: 0,
          bladeHitTimer: 0,
          hitFlash: 0,
          slowTimer: 0,
          slowFactor: 1,
          tintState: 0,
          iceStun: false,
          dotTimer: 0,
          dotDps: 0,
          dotTick: 0,
          dotWeaponId: null,
          kbX: 0,
          kbZ: 0,
        });
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }

  /**
   * Swaps primitive bots for their image-derived voxel models — every enemy
   * type (bosses included) whose kebab-cased name has a registry entry.
   */
  private async upgradeVoxelModels(): Promise<void> {
    await Promise.all(
      ENEMY_TYPES.map(async (type, typeIndex) => {
        const key = modelKeyForTypeName(type.name);
        const def = VOXEL_MODELS[key];
        if (!def) return;
        try {
          const grid = await buildModelGrid(key);
          const geometry = buildGridGeometry(grid, def.voxelSize);
          // Types that spin around their center (Roller) need the origin
          // there; everyone else rests on the ground at y=0.
          if (def.originAtCenter) {
            geometry.translate(0, (-grid.length * def.voxelSize) / 2, 0);
          }
          const mesh = this.meshes[typeIndex];
          if (!mesh) return;
          mesh.geometry.dispose();
          mesh.geometry = geometry;
        } catch (error) {
          console.warn(`Voxel model '${key}' unavailable, keeping primitive bot:`, error);
        }
      }),
    );
  }

  /**
   * Advances spawning, per-behavior AI, separation and instance transforms.
   * `difficulty` is the unified scalar from config.difficultyScalar.
   */
  update(
    dt: number,
    elapsedS: number,
    difficulty: number,
    playerX: number,
    playerZ: number,
    obstacles: Obstacle[],
    projectiles: EnemyProjectiles,
  ): void {
    this.updateSpawner(dt, elapsedS, difficulty, playerX, playerZ, obstacles);

    for (const e of this.pool) {
      if (!e.active) continue;
      const type = ENEMY_TYPES[e.typeIndex];
      if (!type) continue;

      // Slow: temporarily scale the base speed for this frame's movement.
      const baseSpeed = e.speed;
      if (e.slowTimer > 0) {
        e.slowTimer -= dt;
        e.speed = baseSpeed * e.slowFactor;
      }
      // State tint (two-halves rule): full stop wears electric/frost, an
      // active DoT wears acid green, elites keep their purple — the victim
      // of every sustained effect is unmistakable for its whole duration.
      // Status tints BLINK (~5Hz between tint and natural body) so a state
      // never camouflages on a same-hue enemy (green Gunner vs acid, teal
      // Sparkrunner vs electric stun); the brightened frames also cross the
      // bloom threshold, so blinking = glowing. Elite purple stays steady —
      // identity, not status.
      const stunned = e.slowTimer > 0 && e.slowFactor === 0;
      // Oil slow = a partial slow (0 < factor < 1); a full stop is a stun.
      const slowed = e.slowTimer > 0 && e.slowFactor > 0 && e.slowFactor < 1;
      const stateTint = stunned
        ? e.iceStun
          ? 2
          : 1
        : e.dotTimer > 0
          ? 3
          : slowed
            ? 5
            : 0;
      const restTint = e.elite ? 4 : 0;
      const blinkOn = Math.floor(elapsedS * 10) % 2 === 0;
      // Energy states (stun/frost/acid) blink to avoid same-hue camouflage and
      // to glow; the Oil slow shows STEADILY (a coating, not an energy pulse).
      const desiredTint =
        stateTint === 5 ? 5 : stateTint !== 0 && blinkOn ? stateTint : restTint;
      if (desiredTint !== e.tintState) {
        e.tintState = desiredTint;
        if (e.hitFlash <= 0) {
          this.meshes[e.typeIndex]?.setColorAt(e.slot, TINTS[desiredTint] ?? BASE_TINT);
        }
      }

      switch (type.behavior) {
        case 'chase':
          this.moveChase(e, dt, playerX, playerZ, obstacles);
          break;
        case 'roller':
          this.moveRoller(e, dt, playerX, playerZ, obstacles);
          break;
        case 'gunner':
          this.moveGunner(e, dt, playerX, playerZ, projectiles, obstacles);
          break;
        case 'flyer':
          this.moveChase(e, dt, playerX, playerZ, obstacles);
          break;
      }
      e.speed = baseSpeed;

      // Knockback: decaying displacement on top of the behavior movement.
      if (e.kbX !== 0 || e.kbZ !== 0) {
        e.x += e.kbX * dt;
        e.z += e.kbZ * dt;
        const decay = Math.max(0, 1 - STATUS.knockbackDecay * dt);
        e.kbX *= decay;
        e.kbZ *= decay;
        if (Math.abs(e.kbX) + Math.abs(e.kbZ) < 0.05) {
          e.kbX = 0;
          e.kbZ = 0;
        }
      }

      // Arena bounds apply to ALL movement, not just knockback — rollers
      // overshoot and gunners retreat, and both can otherwise walk off the floor.
      const arenaLimit = ARENA_HALF_SIZE - e.radius;
      e.x = THREE.MathUtils.clamp(e.x, -arenaLimit, arenaLimit);
      e.z = THREE.MathUtils.clamp(e.z, -arenaLimit, arenaLimit);

      if (e.bladeHitTimer > 0) e.bladeHitTimer -= dt;
      if (e.hitFlash > 0) {
        e.hitFlash -= dt;
        if (e.hitFlash <= 0) {
          this.meshes[e.typeIndex]?.setColorAt(e.slot, TINTS[e.tintState] ?? BASE_TINT);
        }
      }
    }

    this.separate();
    this.resolveObstacles(obstacles);
    this.writeTransforms(elapsedS);
  }

  private moveChase(
    e: Enemy,
    dt: number,
    px: number,
    pz: number,
    obstacles: Obstacle[],
  ): void {
    let dx = px - e.x;
    let dz = pz - e.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.001) {
      dx /= dist;
      dz /= dist;
      ({ x: dx, z: dz } = this.steerAroundObstacles(e, dx, dz, obstacles));
      e.x += dx * e.speed * dt;
      e.z += dz * e.speed * dt;
      e.heading = Math.atan2(dx, dz);
    }
  }

  /** Rollers steer slowly toward the player, so they charge past — the
   *  counterplay is sidestepping, not outrunning. */
  private moveRoller(
    e: Enemy,
    dt: number,
    px: number,
    pz: number,
    obstacles: Obstacle[],
  ): void {
    const toPlayerX = px - e.x;
    const toPlayerZ = pz - e.z;
    const distance = Math.hypot(toPlayerX, toPlayerZ) || 1;
    const desired = this.steerAroundObstacles(
      e,
      toPlayerX / distance,
      toPlayerZ / distance,
      obstacles,
    );
    const target = Math.atan2(desired.x, desired.z);
    let delta = target - e.heading;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const maxTurn = ROLLER.turnRate * dt;
    e.heading += THREE.MathUtils.clamp(delta, -maxTurn, maxTurn);
    const speed = e.speed * ROLLER.chargeSpeedMultiplier;
    e.x += Math.sin(e.heading) * speed * dt;
    e.z += Math.cos(e.heading) * speed * dt;
    e.phase += (speed * dt) / (0.55 * e.scale); // rolling rotation
  }

  /** Gunners hold a firing distance and shoot slow, dodgeable projectiles. */
  private moveGunner(
    e: Enemy,
    dt: number,
    px: number,
    pz: number,
    projectiles: EnemyProjectiles,
    obstacles: Obstacle[],
  ): void {
    let dx = px - e.x;
    let dz = pz - e.z;
    const dist = Math.hypot(dx, dz) || 1;
    dx /= dist;
    dz /= dist;
    e.heading = Math.atan2(dx, dz);

    if (dist > GUNNER.preferredDist) {
      const movement = this.steerAroundObstacles(e, dx, dz, obstacles);
      e.x += movement.x * e.speed * dt;
      e.z += movement.z * e.speed * dt;
    } else if (dist < GUNNER.retreatDist) {
      const movement = this.steerAroundObstacles(e, -dx, -dz, obstacles);
      e.x += movement.x * e.speed * 0.8 * dt;
      e.z += movement.z * e.speed * 0.8 * dt;
    }

    e.phase -= dt;
    if (e.phase <= 0 && dist <= GUNNER.preferredDist + 4) {
      e.phase = GUNNER.shootCooldownS;
      projectiles.fire(e.x, e.z, dx, dz, GUNNER.projectileSpeed, GUNNER.projectileDamage);
    }
  }

  /** Spatial-hash separation so the swarm spreads instead of stacking.
   *  Flyers are exempt — they come in over the crowd. */
  private separate(): void {
    this.grid.clear();
    const cell = ENEMIES.separationCellSize;
    for (let i = 0; i < this.pool.length; i++) {
      const e = this.pool[i];
      if (!e || !e.active) continue;
      if (ENEMY_TYPES[e.typeIndex]?.behavior === 'flyer') continue;
      const key = gridKey(Math.floor(e.x / cell), Math.floor(e.z / cell));
      const bucket = this.grid.get(key);
      if (bucket) bucket.push(i);
      else this.grid.set(key, [i]);
    }

    for (const [key, bucket] of this.grid) {
      const cx = Math.floor(key / 4096) - 1024;
      const cz = (key % 4096) - 1024;
      for (let ox = -1; ox <= 1; ox++) {
        for (let oz = -1; oz <= 1; oz++) {
          const other = this.grid.get(gridKey(cx + ox, cz + oz));
          if (!other) continue;
          for (const i of bucket) {
            for (const j of other) {
              if (j <= i) continue;
              this.pushApart(i, j);
            }
          }
        }
      }
    }
  }

  private pushApart(i: number, j: number): void {
    const a = this.pool[i];
    const b = this.pool[j];
    if (!a || !b) return;
    const minDist = a.radius + b.radius;
    let dx = b.x - a.x;
    let dz = b.z - a.z;
    const dSq = dx * dx + dz * dz;
    if (dSq >= minDist * minDist || dSq < 0.0001) return;
    const dist = Math.sqrt(dSq);
    const push = (minDist - dist) * 0.5;
    dx /= dist;
    dz /= dist;
    a.x -= dx * push;
    a.z -= dz * push;
    b.x += dx * push;
    b.z += dz * push;
  }

  private resolveObstacles(obstacles: Obstacle[]): void {
    for (const e of this.pool) {
      if (!e.active) continue;
      const isFlyer = ENEMY_TYPES[e.typeIndex]?.behavior === 'flyer';
      for (let pass = 0; pass < ENEMIES.obstacleAvoidance.resolvePasses; pass++) {
        for (const o of obstacles) {
          if (isFlyer && !o.blocksFlyers) continue;
          const minDist = o.radius + e.radius;
          let dx = e.x - o.x;
          let dz = e.z - o.z;
          const dSq = dx * dx + dz * dz;
          if (dSq >= minDist * minDist) continue;
          if (dSq < 0.0001) {
            const angle = (e.slot * 2.399963229728653) % (Math.PI * 2);
            dx = Math.cos(angle);
            dz = Math.sin(angle);
          } else {
            const inverseDistance = 1 / Math.sqrt(dSq);
            dx *= inverseDistance;
            dz *= inverseDistance;
          }
          e.x = o.x + dx * minDist;
          e.z = o.z + dz * minDist;
        }
      }
      const arenaLimit = ARENA_HALF_SIZE - e.radius;
      e.x = THREE.MathUtils.clamp(e.x, -arenaLimit, arenaLimit);
      e.z = THREE.MathUtils.clamp(e.z, -arenaLimit, arenaLimit);
    }
  }

  private writeTransforms(elapsedS: number): void {
    let auraCount = 0;
    let bossAuraCount = 0;
    let shadowCount = 0;
    const auraPulse = 1 + Math.sin(elapsedS * 5) * 0.12;
    const bossPulse = 1 + Math.sin(elapsedS * 3.2) * 0.18;

    for (const e of this.pool) {
      if (!e.active) continue;
      const mesh = this.meshes[e.typeIndex];
      const type = ENEMY_TYPES[e.typeIndex];
      if (!mesh || !type) continue;

      if (this.blobShadows) {
        const r = e.radius * VISUAL.blobShadow.radiusScale;
        tmpMatrix.makeScale(r, 1, r);
        tmpMatrix.setPosition(e.x, VISUAL.blobShadow.y, e.z);
        this.blobShadows.setMatrixAt(shadowCount, tmpMatrix);
        shadowCount++;
      }

      if (BOSS_TYPE_INDEXES.includes(e.typeIndex)) {
        const r = e.radius * 1.7 * bossPulse;
        tmpMatrix.makeScale(r, 1, r);
        tmpMatrix.setPosition(e.x, 0.08, e.z);
        this.bossAura.setMatrixAt(bossAuraCount, tmpMatrix);
        bossAuraCount++;
      } else if (e.elite && auraCount < ELITE_AURA_CAPACITY) {
        const r = e.radius * ELITES.aura.scale * auraPulse;
        tmpMatrix.makeRotationY(elapsedS * Math.PI * 2 * ELITES.aura.rotateHz);
        tmpMatrix.scale(tmpScale.set(r, 1, r));
        tmpMatrix.setPosition(e.x, 0.07, e.z);
        this.eliteAura.setMatrixAt(auraCount, tmpMatrix);
        auraCount++;
      }

      tmpMatrix.makeRotationY(e.heading);
      if (type.behavior === 'roller') {
        tmpRot.makeRotationX(e.phase);
        tmpMatrix.multiply(tmpRot);
      } else if (VISUAL.enemyWobble.enabled && !BOSS_TYPE_INDEXES.includes(e.typeIndex)) {
        // Walk rock: per-slot phase so the swarm never marches in sync.
        // Bosses are exempt — a waddling king loses its menace.
        tmpRot.makeRotationZ(
          Math.sin(elapsedS * Math.PI * 2 * VISUAL.enemyWobble.hz + e.slot * 1.7) *
            VISUAL.enemyWobble.rockRad,
        );
        tmpMatrix.multiply(tmpRot);
      }
      tmpMatrix.scale(tmpScale.set(e.scale, e.scale, e.scale));
      const y =
        type.behavior === 'flyer'
          ? FLYER.hoverHeight + Math.sin(elapsedS * 3 + e.slot) * FLYER.bobAmplitude
          : type.behavior === 'roller'
            ? 0.55 * e.scale
            : 0;
      tmpMatrix.setPosition(e.x, y, e.z);
      mesh.setMatrixAt(e.slot, tmpMatrix);
    }
    this.eliteAura.count = auraCount;
    this.eliteAura.instanceMatrix.needsUpdate = true;
    this.bossAura.count = bossAuraCount;
    this.bossAura.instanceMatrix.needsUpdate = true;
    if (this.blobShadows) {
      this.blobShadows.count = shadowCount;
      this.blobShadows.instanceMatrix.needsUpdate = true;
    }

    for (const mesh of this.meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  private updateSpawner(
    dt: number,
    elapsedS: number,
    difficulty: number,
    playerX: number,
    playerZ: number,
    obstacles: Obstacle[],
  ): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;

    const t = Math.min(difficulty, 1);
    const interval = THREE.MathUtils.lerp(ENEMIES.waveIntervalStartS, ENEMIES.waveIntervalEndS, t);
    const maxActive = Math.round(
      THREE.MathUtils.lerp(ENEMIES.maxActiveStart, ENEMIES.maxActiveEnd, t) *
        Math.max(1, difficulty),
    );
    const waveSize = Math.min(
      Math.round(
        THREE.MathUtils.lerp(ENEMIES.waveSizeStart, ENEMIES.waveSizeEnd, t) *
          Math.max(1, difficulty),
      ),
      Math.max(0, maxActive - this.activeCount),
    );
    const hpMultiplier = (1 + (elapsedS / 60) * ENEMIES.hpRampPerMinute) * Math.max(1, difficulty);
    this.spawnTimer = interval;

    for (let n = 0; n < waveSize; n++) {
      const type = pickEnemyType(elapsedS);
      const elite =
        elapsedS >= ELITES.minRunTimeS &&
        ELITES.behaviors.includes(type.behavior) &&
        Math.random() < ELITES.chanceAtMaxDifficulty * difficulty;
      this.spawn(type, hpMultiplier, playerX, playerZ, elite, obstacles);
    }
  }

  private spawn(
    type: EnemyTypeDef,
    hpMultiplier: number,
    playerX: number,
    playerZ: number,
    elite: boolean,
    obstacles: Obstacle[],
  ): void {
    const scaleMultiplier = elite ? ELITES.scaleMultiplier : 1;
    const radius = type.radius * scaleMultiplier;
    const spot = findRandomClearSpot(
      playerX,
      playerZ,
      ENEMIES.spawnRingMin,
      ENEMIES.spawnRingMax,
      radius,
      obstacles,
    );
    if (!spot) return;
    this.spawnAt(
      ENEMY_TYPES.indexOf(type),
      spot.x,
      spot.z,
      hpMultiplier,
      elite,
      obstacles,
    );
  }

  /** Spawns a specific type at an exact position (bosses, boss minions).
   *  Returns the pool index, or -1 when the type's budget is exhausted. */
  spawnAt(
    typeIndex: number,
    x: number,
    z: number,
    hpMultiplier = 1,
    elite = false,
    obstacles: Obstacle[] = [],
  ): number {
    const type = ENEMY_TYPES[typeIndex];
    if (!type) return -1;
    const index = this.pool.findIndex((c) => !c.active && c.typeIndex === typeIndex);
    if (index === -1) return -1; // This type's instance budget is exhausted.
    const e = this.pool[index];
    if (!e) return -1;

    const scaleMultiplier = elite ? ELITES.scaleMultiplier : 1;
    const radius = type.radius * scaleMultiplier;
    const spot = findClearSpot(x, z, obstacles, radius);
    if (!spot) return -1;

    e.gen++;
    e.active = true;
    e.x = spot.x;
    e.z = spot.z;
    e.elite = elite;
    e.maxHp = Math.round(type.hp * hpMultiplier * (elite ? ELITES.hpMultiplier : 1));
    e.hp = e.maxHp;
    e.speed = type.speed;
    e.scale = type.scale * scaleMultiplier;
    e.radius = radius;
    e.xp = type.xp * (elite ? ELITES.xpMultiplier : 1);
    e.heading = Math.random() * Math.PI * 2;
    e.phase = type.behavior === 'gunner' ? Math.random() * GUNNER.shootCooldownS : 0;
    e.bladeHitTimer = 0;
    e.hitFlash = 0;
    e.slowTimer = 0;
    e.slowFactor = 1;
    e.tintState = elite ? 4 : 0;
    e.iceStun = false;
    e.dotTimer = 0;
    e.dotDps = 0;
    e.dotTick = 0;
    e.dotWeaponId = null;
    e.kbX = 0;
    e.kbZ = 0;
    this.activeCount++;
    this.meshes[typeIndex]?.setColorAt(e.slot, elite ? ELITE_TINT : BASE_TINT);
    return index;
  }

  // --- Status effect API ----------------------------------------------------

  /** Slows the enemy to `factor` of its speed for `durationS` (refreshes). */
  applySlow(index: number, factor: number, durationS: number): void {
    const e = this.pool[index];
    if (!e || !e.active) return;
    e.slowFactor = e.slowTimer > 0 ? Math.min(e.slowFactor, factor) : factor;
    e.slowTimer = Math.max(e.slowTimer, durationS);
  }

  /** Applies damage-over-time; keeps the strongest dps and longest duration. */
  applyDot(index: number, dps: number, durationS: number, weaponId: WeaponId): void {
    const e = this.pool[index];
    if (!e || !e.active) return;
    if (dps >= e.dotDps) {
      e.dotDps = dps;
      e.dotWeaponId = weaponId;
    }
    e.dotTimer = Math.max(e.dotTimer, durationS);
    if (e.dotTick <= 0) e.dotTick = STATUS.dotTickS * 0.5;
  }

  /** Preserve each behavior's desired direction while adding a stable tangent
   *  before it reaches a blocking obstacle. */
  private steerAroundObstacles(
    e: Enemy,
    desiredX: number,
    desiredZ: number,
    obstacles: Obstacle[],
  ): { x: number; z: number } {
    const isFlyer = ENEMY_TYPES[e.typeIndex]?.behavior === 'flyer';
    const cfg = ENEMIES.obstacleAvoidance;
    const bossMultiplier = BOSS_TYPE_INDEXES.includes(e.typeIndex)
      ? cfg.bossLookAheadMultiplier
      : 1;
    const lookAhead = cfg.lookAhead * bossMultiplier + e.radius;
    let steerX = desiredX;
    let steerZ = desiredZ;

    for (const obstacle of obstacles) {
      if (isFlyer && !obstacle.blocksFlyers) continue;
      const relX = obstacle.x - e.x;
      const relZ = obstacle.z - e.z;
      const forward = relX * desiredX + relZ * desiredZ;
      if (forward <= 0 || forward > lookAhead) continue;

      const lateralX = relX - desiredX * forward;
      const lateralZ = relZ - desiredZ * forward;
      const lateralSq = lateralX * lateralX + lateralZ * lateralZ;
      const clearance = obstacle.radius + e.radius + cfg.clearance;
      if (lateralSq >= clearance * clearance) continue;

      const leftX = -desiredZ;
      const leftZ = desiredX;
      const lateralSide = relX * leftX + relZ * leftZ;
      const side = Math.abs(lateralSide) > 0.001
        ? lateralSide > 0 ? -1 : 1
        : e.slot % 2 === 0 ? 1 : -1;
      const proximity = 1 - Math.sqrt(lateralSq) / clearance;
      const urgency = 1 - forward / lookAhead;
      const strength = cfg.steerStrength * (0.35 + proximity + urgency);
      steerX += leftX * side * strength;
      steerZ += leftZ * side * strength;
    }

    const length = Math.hypot(steerX, steerZ) || 1;
    return { x: steerX / length, z: steerZ / length };
  }

  /** Shoves the enemy along a direction. Bosses are immune. */
  applyKnockback(index: number, dirX: number, dirZ: number, force: number): void {
    const e = this.pool[index];
    if (!e || !e.active || BOSS_TYPE_INDEXES.includes(e.typeIndex)) return;
    e.kbX += dirX * force;
    e.kbZ += dirZ * force;
  }

  /** Whether this pool index belongs to a boss (execute immunity, etc.). */
  isBossIndex(index: number): boolean {
    const e = this.pool[index];
    return !!e && BOSS_TYPE_INDEXES.includes(e.typeIndex);
  }

  /** Deals damage; returns death info when the enemy dies, null otherwise. */
  damage(index: number, amount: number): DeathInfo | null {
    const e = this.pool[index];
    if (!e || !e.active) return null;
    const mesh = this.meshes[e.typeIndex];
    e.hp -= amount;
    if (e.hp <= 0) {
      e.active = false;
      this.activeCount--;
      mesh?.setMatrixAt(e.slot, HIDDEN);
      return { xp: e.xp, x: e.x, z: e.z, elite: e.elite, typeIndex: e.typeIndex };
    }
    e.hitFlash = 0.08;
    mesh?.setColorAt(e.slot, FLASH_TINT);
    return null;
  }

  /** Index of the closest active enemy within `maxDist` of (x, z), or -1. */
  findNearest(x: number, z: number, maxDist: number): number {
    let best = -1;
    let bestSq = maxDist * maxDist;
    for (let i = 0; i < this.pool.length; i++) {
      const e = this.pool[i];
      if (!e || !e.active) continue;
      const dSq = (e.x - x) * (e.x - x) + (e.z - z) * (e.z - z);
      if (dSq < bestSq) {
        bestSq = dSq;
        best = i;
      }
    }
    return best;
  }

  reset(): void {
    for (const e of this.pool) {
      if (!e.active) continue;
      e.active = false;
      this.meshes[e.typeIndex]?.setMatrixAt(e.slot, HIDDEN);
    }
    this.activeCount = 0;
    this.spawnTimer = 0;
    this.eliteAura.count = 0;
    this.bossAura.count = 0;
    for (const mesh of this.meshes) mesh.instanceMatrix.needsUpdate = true;
  }
}

function gridKey(cx: number, cz: number): number {
  return (cx + 1024) * 4096 + (cz + 1024);
}

function pickEnemyType(elapsedS: number): EnemyTypeDef {
  const available = ENEMY_TYPES.filter((t) => t.weight > 0 && elapsedS >= t.unlockAtS);
  const totalWeight = available.reduce((sum, t) => sum + t.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const type of available) {
    roll -= type.weight;
    if (roll <= 0) return type;
  }
  return available[available.length - 1] ?? ENEMY_TYPES[0]!;
}

// --- Voxel bot silhouettes -------------------------------------------------
// Painted-machine look: saturated primary per type, dark joints/treads, and a
// bright "eye" on the +Z face (the facing direction). Every type gets its own
// silhouette — a colorblind player must still read the screen.

interface BotPart {
  geometry: THREE.BufferGeometry;
  color: number;
}

function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  color: number,
): BotPart {
  const geometry = new THREE.BoxGeometry(w, h, d);
  geometry.translate(x, y, z);
  return { geometry, color };
}

function buildBotGeometry(typeIndex: number, type: EnemyTypeDef): THREE.BufferGeometry {
  const primary = type.color;
  let parts: BotPart[];
  switch (typeIndex) {
    case 0: // Voltling: squat worker bot on treads, cyan eye strip.
      parts = [
        box(0.85, 0.25, 0.7, 0, 0.13, 0, DARK),
        box(0.75, 0.55, 0.65, 0, 0.55, 0, primary),
        box(0.5, 0.32, 0.5, 0, 1.0, 0, DARK),
        box(0.34, 0.1, 0.08, 0, 1.02, 0.26, 0x7ee0ff),
      ];
      break;
    case 1: // Sparkrunner: tall thin chassis with an antenna, amber eye.
      parts = [
        box(0.5, 0.2, 0.6, 0, 0.1, 0, DARK),
        box(0.42, 1.0, 0.38, 0, 0.7, 0, primary),
        box(0.4, 0.28, 0.4, 0, 1.36, 0, DARK),
        box(0.26, 0.08, 0.08, 0, 1.38, 0.21, 0xffd24a),
        box(0.06, 0.45, 0.06, 0, 1.72, 0, primary),
      ];
      break;
    case 2: // Rustbrute: wide crusher on heavy treads, broad shoulders, amber visor.
      parts = [
        box(1.15, 0.3, 0.85, 0, 0.15, 0, DARK),
        box(0.95, 0.75, 0.75, 0, 0.72, 0, primary),
        box(0.3, 0.5, 0.55, -0.63, 0.9, 0, DARK),
        box(0.3, 0.5, 0.55, 0.63, 0.9, 0, DARK),
        box(0.5, 0.3, 0.5, 0, 1.25, 0, DARK),
        box(0.4, 0.1, 0.08, 0, 1.27, 0.26, 0xffd24a),
      ];
      break;
    case 3: {
      // Roller: chunky ball with a dark equator band. Origin at the center so
      // the rolling rotation looks right (position sets the height).
      const ball = new THREE.IcosahedronGeometry(0.55, 0);
      const band = new THREE.BoxGeometry(0.2, 1.16, 1.16);
      parts = [
        { geometry: ball, color: primary },
        { geometry: band, color: DARK },
      ];
      break;
    }
    case 4: // Gunner: legged base, boxy body, forward barrel.
      parts = [
        box(0.7, 0.3, 0.6, 0, 0.15, 0, DARK),
        box(0.62, 0.55, 0.55, 0, 0.6, 0, primary),
        box(0.16, 0.16, 0.7, 0, 0.72, 0.5, DARK),
        box(0.3, 0.1, 0.08, 0, 0.95, 0.28, 0xff5533),
        box(0.5, 0.18, 0.45, 0, 0.98, 0, DARK),
      ];
      break;
    case 5: // Drone: flat flyer with a wide dark rotor on top.
      parts = [
        box(0.6, 0.35, 0.6, 0, 0.2, 0, primary),
        box(1.3, 0.08, 0.3, 0, 0.5, 0, DARK),
        box(0.3, 0.08, 1.3, 0, 0.5, 0, DARK),
        box(0.3, 0.12, 0.08, 0, 0.22, 0.31, 0xffd24a),
      ];
      break;
    case 6: // Crusher King: an oversized brute with a golden crown.
      parts = [
        box(1.2, 0.35, 0.9, 0, 0.18, 0, DARK),
        box(1.0, 0.8, 0.8, 0, 0.75, 0, primary),
        box(0.35, 0.6, 0.6, -0.68, 0.95, 0, DARK),
        box(0.35, 0.6, 0.6, 0.68, 0.95, 0, DARK),
        box(0.55, 0.35, 0.55, 0, 1.35, 0, DARK),
        box(0.45, 0.12, 0.1, 0, 1.38, 0.28, 0xffd24a),
        box(0.6, 0.12, 0.6, 0, 1.58, 0, 0xf2b632),
        box(0.12, 0.22, 0.12, -0.2, 1.72, 0, 0xf2b632),
        box(0.12, 0.28, 0.12, 0, 1.75, 0, 0xf2b632),
        box(0.12, 0.22, 0.12, 0.2, 1.72, 0, 0xf2b632),
      ];
      break;
    default: // Tesla Titan: tall coil tower with glowing rings.
      parts = [
        box(0.9, 0.3, 0.9, 0, 0.15, 0, DARK),
        box(0.55, 1.2, 0.55, 0, 0.9, 0, primary),
        box(0.75, 0.12, 0.75, 0, 0.7, 0, 0x7ee0ff),
        box(0.68, 0.12, 0.68, 0, 1.1, 0, 0x7ee0ff),
        box(0.45, 0.3, 0.45, 0, 1.6, 0, DARK),
        box(0.32, 0.1, 0.08, 0, 1.62, 0.24, 0xffd24a),
        box(0.2, 0.3, 0.2, 0, 1.85, 0, 0x7ee0ff),
      ];
      break;
  }

  const merged = mergeGeometries(parts.map(colorize));
  if (!merged) throw new Error(`Failed to build bot geometry for ${type.name}`);
  return merged;
}

function colorize(part: BotPart): THREE.BufferGeometry {
  // mergeGeometries refuses to mix indexed and non-indexed buffers, so
  // normalize everything to non-indexed before painting vertex colors.
  const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry;
  tmpColor.setHex(part.color);
  const count = geometry.attributes['position']?.count ?? 0;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}
