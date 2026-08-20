import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  PLAY_HALF_SIZE,
  BOSS,
  BOSS_LAB,
  ELITES,
  ENEMIES,
  ENEMY_TYPES,
  FLYER,
  GUNNER,
  ROLLER,
  RUSTBRUTE,
  STATUS,
  VISUAL,
  isBossTypeIndex,
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
  /** Position at the start of the current movement frame, for relative CCD. */
  prevX: number;
  prevZ: number;
  hp: number;
  maxHp: number;
  speed: number;
  scale: number;
  radius: number;
  /** Radius for touching the PLAYER only (see EnemyTypeDef.contactRadius).
   *  Equal to `radius` for everything that does not override it. */
  contactRadius: number;
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
  /** Charger state machine (see CHARGE below). `phase` is its timer and
   *  `heading` holds the committed lunge direction. Unused by other types. */
  chargeState: number;
  /** Flavor of the current full stop: true = frost (Coolant), false = zap. */
  iceStun: boolean;
  dotTimer: number;
  dotDps: number;
  dotTick: number;
  /** Weapon that owns the active DoT, for end-of-run damage attribution. */
  dotWeaponId: WeaponId | null;
  kbX: number;
  kbZ: number;
  /** Obstacle whose avoidance side is currently locked. */
  avoidanceObstacle: Obstacle | null;
  /** Stable tangent side for `avoidanceObstacle`: -1 right, +1 left. */
  avoidanceSide: number;
  /** Stable identity behind a reused dynamic-obstacle slot. */
  avoidanceSourceEnemy: Enemy | null;
  avoidanceSourceGeneration: number;
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
/** Bosses flash GENTLER, and it is not a taste call.
 *
 *  2.5x is tuned for a grunt: a body under a unit tall, flashing once or twice
 *  before it dies. A boss is 9.87 units tall and takes hundreds of hits, often
 *  several per frame from different weapons, so `hitFlash` is effectively never
 *  off — the whole body sits permanently at 2.5x, which is well past the bloom
 *  threshold (0.85) and turns the fight into a white lamp. 1.45 still reads as
 *  a hit register on a body that size without pinning the bloom pass.
 *  (Playtest 2026-08-19: "el bloom al pegarle es demasiado exagerado".) */
const BOSS_FLASH_TINT = new THREE.Color(1.45, 1.45, 1.45);
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

// Charger wind-up (index 6): a white-hot flare so the lunge is READ, not just
// felt — a telegraph the player cannot see is only a delay, which is exactly
// what we are avoiding. Shown STEADILY (it takes the restTint path, like the
// elite purple), not blinking: the wind-up is 0.45s and the user dislikes
// strobe.
//
// Raised 2026-07-30 after playtest ("que se vea perfectamente"). Brightness
// alone was not the fix: these tints MULTIPLY the body colour, and the
// Rustbrute is already red (0xff4433), so scaling red just made a red robot a
// slightly brighter red robot. The green channel is what does the work — it
// pushes the hue to yellow-white, which no enemy body wears, so the wind-up
// cannot be mistaken for the enemy's own colour.
const CHARGE_TINT = new THREE.Color(4.6, 3.4, 1.4);

const TINTS = [BASE_TINT, STUN_TINT, FROST_TINT, ACID_TINT, ELITE_TINT, OIL_TINT, CHARGE_TINT];

/** Charger phases. `phase` counts the current one down. Exported so the boss
 *  system can borrow the telegraph state and inherit the same wind-up flare —
 *  one visual language for "something is about to lunge at you". */
export const CHARGE = { approach: 0, telegraph: 1, lunging: 2, recover: 3 } as const;

const ELITE_AURA_CAPACITY = 64;

/** An obstacle that IS a live enemy. `sourceEnemy` exists purely so a heavy
 *  body can skip its own entry when steering. Declared here rather than in
 *  world.ts to keep Obstacle free of an enemies.ts import cycle. */
interface EnemyObstacle extends Obstacle {
  sourceEnemy?: Enemy;
}

export class EnemySystem {
  readonly pool: Enemy[] = [];
  activeCount = 0;
  /** HP multiplier the last spawned wave used (arc clock + difficulty).
   *
   *  Published because anything else that puts bodies on the field has to match
   *  the wave it joins. The Hazard Marshal's assembly lines spawn directly
   *  through spawnAt, whose default multiplier is 1 — at minute 20 that is a
   *  fifth of what the surrounding swarm is wearing, so its reinforcements
   *  would evaporate on contact and the phase would read as a nothing beat. */
  waveHpMultiplier = 1;
  /** While true the spawner issues no waves. The finale owns this: once the
   *  Hazard Marshal is inbound the arena belongs to the boss and to the
   *  reinforcements IT chooses to call (phase 2), which come through spawnAt
   *  and are deliberately unaffected. Set from the run flow every frame, so it
   *  cannot be left stuck on by a code path that forgot to clear it. */
  wavesPaused = false;
  /** A body drawn by something ELSE this frame — today the final boss's part
   *  rig (see boss-rig.ts). Its instanced slot is hidden so the two do not sit
   *  inside each other. Set from the boss system every frame rather than
   *  latched, so a boss that dies mid-frame cannot leave a body invisible. */
  externallyDrawn: Enemy | null = null;

  /** Reused across frames so the dynamic-obstacle pass allocates nothing. */
  private readonly dynamicObstacles: EnemyObstacle[] = [];
  private readonly combinedObstacles: EnemyObstacle[] = [];
  /** Reused active-boss set for the O(N) hard-separation pass. */
  private readonly activeBosses: Enemy[] = [];

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
        // Opacity baked in: outside the transparent queue material.opacity is
        // ignored. Staying transparent would put this ring after every opaque
        // object, painting it across the body it belongs to.
        color: new THREE.Color(auraCfg.color).multiplyScalar(
          VISUAL.groundMarkersOnTop ? auraCfg.opacity : 1,
        ),
        transparent: !VISUAL.groundMarkersOnTop,
        opacity: auraCfg.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        // "That one is an elite" has to survive walking behind a crate; see
        // VISUAL.groundMarkersOnTop.
        depthTest: !VISUAL.groundMarkersOnTop,
        side: THREE.DoubleSide,
      }),
      ELITE_AURA_CAPACITY,
    );
    this.eliteAura.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.eliteAura.frustumCulled = false;
    this.eliteAura.count = 0;
    if (VISUAL.groundMarkersOnTop) this.eliteAura.renderOrder = VISUAL.renderOrders.groundMarker;
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
        // Opacity baked in: outside the transparent queue material.opacity is
        // ignored, and staying transparent is what let this ring paint itself
        // across the boss's body — the transparent queue always draws last.
        color: new THREE.Color(0xff3355).multiplyScalar(VISUAL.groundMarkersOnTop ? 0.9 : 1),
        transparent: !VISUAL.groundMarkersOnTop,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: !VISUAL.groundMarkersOnTop,
        side: THREE.DoubleSide,
      }),
      ENEMY_TYPES.filter((type) => type.isBoss).length,
    );
    this.bossAura.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bossAura.frustumCulled = false;
    this.bossAura.count = 0;
    if (VISUAL.groundMarkersOnTop) this.bossAura.renderOrder = VISUAL.renderOrders.groundMarker;
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
      // Above the ground markers, so the half of an elite or boss ring that
      // falls behind the body is hidden by it instead of painted across it.
      if (VISUAL.groundMarkersOnTop) mesh.renderOrder = VISUAL.renderOrders.character;
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
          prevX: 0,
          prevZ: 0,
          hp: 0,
          maxHp: 0,
          speed: 0,
          scale: 1,
          radius: 0.5,
          contactRadius: 0.5,
          xp: 0,
          elite: false,
          heading: 0,
          phase: 0,
          bladeHitTimer: 0,
          hitFlash: 0,
          slowTimer: 0,
          slowFactor: 1,
          tintState: 0,
          chargeState: 0,
          iceStun: false,
          dotTimer: 0,
          dotDps: 0,
          dotTick: 0,
          dotWeaponId: null,
          kbX: 0,
          kbZ: 0,
          avoidanceObstacle: null,
          avoidanceSide: 0,
          avoidanceSourceEnemy: null,
          avoidanceSourceGeneration: -1,
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
        const key = type.modelKey ?? modelKeyForTypeName(type.name);
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
   *
   * TWO clocks on purpose, and they diverge from Map 2 onwards:
   * - `elapsedS` is the map's COMBAT clock (difficultyOffsetS + map time). It
   *   drives presentation phases only.
   * - `arcElapsedS` is the RUN's clock, which never rewinds at a crossing. How
   *   STRONG a body is rides this one — enemy HP and the elite ramp — because
   *   the player does not get weaker by walking through a door. Feeding them the
   *   combat clock made the foundry open at a 2.2x HP multiplier right after Map
   *   1 ended at 4.0x: the swarm went soft exactly where the build peaked.
   * - `rosterElapsedS` is the map's own introduction clock, and it DOES restart
   *   at a crossing. WHICH types appear is a matter of staging, not of power: a
   *   new sector earns its own opening, a flood of basics that escalates back to
   *   the full cast on that map's schedule. Strength and staging are separate
   *   questions and were conflated into one clock until this split.
   *
   * `rewardScale` is deliberately NOT `difficulty`: see config.rewardScalar.
   */
  update(
    dt: number,
    elapsedS: number,
    arcElapsedS: number,
    rosterElapsedS: number,
    difficulty: number,
    rewardScale: number,
    playerX: number,
    playerZ: number,
    obstacles: Obstacle[],
    projectiles: EnemyProjectiles,
  ): void {
    this.updateSpawner(
      dt,
      arcElapsedS,
      rosterElapsedS,
      difficulty,
      rewardScale,
      playerX,
      playerZ,
      obstacles,
    );
    // Heavy bodies join the avoidance set for this frame, so the rest of the
    // swarm steers AROUND them instead of damming up behind them.
    const steerObstacles = this.rebuildDynamicObstacles(obstacles);

    for (const e of this.pool) {
      if (!e.active) continue;
      e.prevX = e.x;
      e.prevZ = e.z;
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
      // The wind-up outranks the elite tint: an incoming lunge is the more
      // urgent thing to read, and it only lasts RUSTBRUTE.telegraphS.
      const restTint = e.chargeState === CHARGE.telegraph ? 6 : e.elite ? 4 : 0;
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
          this.moveChase(e, dt, playerX, playerZ, steerObstacles);
          break;
        case 'roller':
          this.moveRoller(e, dt, playerX, playerZ, steerObstacles);
          break;
        case 'charger':
          this.moveCharger(e, dt, playerX, playerZ, steerObstacles);
          break;
        case 'gunner':
          this.moveGunner(e, dt, playerX, playerZ, projectiles, steerObstacles);
          break;
        case 'flyer':
          this.moveChase(e, dt, playerX, playerZ, steerObstacles);
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
      const arenaLimit = PLAY_HALF_SIZE - e.radius;
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

    this.resolveObstacles(obstacles);
    this.separate();
    // Static props and pair separation can both displace a normal enemy after
    // steering. Enforce physical boss contact LAST while leaving clearRadius
    // exclusively to anticipatory navigation.
    this.resolveBossSeparation();
    this.writeTransforms(elapsedS);
  }

  private moveChase(
    e: Enemy,
    dt: number,
    px: number,
    pz: number,
    obstacles: Obstacle[],
  ): void {
    // Crusher King borrows CHARGE.lunging from the shared visual language, but
    // remains a `chase` type. Its ram must lock the heading here; otherwise
    // chasing re-aims the supposedly committed charge every frame.
    if (isBossTypeIndex(e.typeIndex) && e.chargeState === CHARGE.lunging) {
      e.x += Math.sin(e.heading) * e.speed * dt;
      e.z += Math.cos(e.heading) * e.speed * dt;
      return;
    }

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
  /** Charger: walks in slowly, plants itself, flares, then lunges in a
   *  COMMITTED straight line and is rooted while it recovers.
   *
   *  Committed is the whole balance: the lunge is a hair slower than the
   *  player, so running in a line barely saves you, but any sidestep during
   *  the wind-up makes it whiff — it cannot re-aim mid-lunge. The recovery is
   *  the payoff for having read the tell. */
  private moveCharger(
    e: Enemy,
    dt: number,
    px: number,
    pz: number,
    obstacles: Obstacle[],
  ): void {
    e.phase -= dt;

    if (e.chargeState === CHARGE.lunging) {
      const speed = e.speed * RUSTBRUTE.chargeSpeedMultiplier;
      e.x += Math.sin(e.heading) * speed * dt;
      e.z += Math.cos(e.heading) * speed * dt;
      if (e.phase <= 0) {
        e.chargeState = CHARGE.recover;
        e.phase = RUSTBRUTE.recoverS;
      }
      return;
    }

    if (e.chargeState === CHARGE.telegraph) {
      // Rooted and flaring. Direction was locked when the wind-up started, so
      // stepping aside now beats it.
      if (e.phase <= 0) {
        e.chargeState = CHARGE.lunging;
        e.phase = RUSTBRUTE.chargeDurationS;
      }
      return;
    }

    if (e.chargeState === CHARGE.recover) {
      if (e.phase <= 0) {
        e.chargeState = CHARGE.approach;
        e.phase = RUSTBRUTE.cooldownS;
      }
      return; // Rooted: the counterplay window.
    }

    // Approach. `phase` is the cooldown here, so it cannot chain lunges.
    const dx = px - e.x;
    const dz = pz - e.z;
    if (e.phase <= 0 && dx * dx + dz * dz <= RUSTBRUTE.chargeRange * RUSTBRUTE.chargeRange) {
      e.chargeState = CHARGE.telegraph;
      e.phase = RUSTBRUTE.telegraphS;
      e.heading = Math.atan2(dx, dz);
      return;
    }
    this.moveChase(e, dt, px, pz, obstacles);
  }

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

    // A boss gunner uses ITS OWN standoff. BOSS.tesla.preferredDist existed
    // but was never read — the Tesla Titan was silently holding the grunt's
    // 12 units, outside half the arsenal's reach, which is why it read as
    // "never comes close enough to fight" (playtest 2026-07-30).
    const isBoss = isBossTypeIndex(e.typeIndex);
    const preferredDist = isBoss ? BOSS.tesla.preferredDist : GUNNER.preferredDist;
    const retreatDist = isBoss ? BOSS.tesla.retreatDist : GUNNER.retreatDist;

    if (dist > preferredDist) {
      const movement = this.steerAroundObstacles(e, dx, dz, obstacles);
      e.x += movement.x * e.speed * dt;
      e.z += movement.z * e.speed * dt;
    } else if (dist < retreatDist) {
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

  /** Spatial-hash separation so every enemy body spreads instead of stacking,
   *  including mixed flyer/ground pairs. */
  private separate(): void {
    this.grid.clear();
    const cell = ENEMIES.separationCellSize;
    for (let i = 0; i < this.pool.length; i++) {
      const e = this.pool[i];
      if (!e || !e.active) continue;
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
    const aBoss = isBossTypeIndex(a.typeIndex);
    const bBoss = isBossTypeIndex(b.typeIndex);
    // Boss trajectories are authoritative. CCD below handles every boss pair.
    if (aBoss || bBoss) return;
    const minDist = a.radius + b.radius;
    let dx = b.x - a.x;
    let dz = b.z - a.z;
    const dSq = dx * dx + dz * dz;
    if (dSq >= minDist * minDist) return;
    let dist = Math.sqrt(dSq);
    if (dist < ENEMIES.coincidentSeparationEpsilon) {
      // Stable pool indices give exact overlaps a deterministic escape vector;
      // ignoring d=0 left coincident drones stacked forever.
      const angle = ((i + 1) * (j + 1) * ENEMIES.coincidentSeparationAngleStep) % (Math.PI * 2);
      dx = Math.cos(angle);
      dz = Math.sin(angle);
      dist = 0;
    } else {
      dx /= dist;
      dz /= dist;
    }
    const overlap = minDist - dist;
    if (aBoss) {
      b.x += dx * overlap;
      b.z += dz * overlap;
    } else if (bBoss) {
      a.x -= dx * overlap;
      a.z -= dz * overlap;
    } else {
      const push = overlap * 0.5;
      a.x -= dx * push;
      a.z -= dz * push;
      b.x += dx * push;
      b.z += dz * push;
    }
  }

  /** Allocation-free relative swept-circle boss collision. Boss count is
   *  capacity-bounded; only normal enemies move and clearRadius is not used. */
  private resolveBossSeparation(): void {
    this.activeBosses.length = 0;
    for (const e of this.pool) {
      if (e.active && isBossTypeIndex(e.typeIndex)) this.activeBosses.push(e);
    }
    if (this.activeBosses.length === 0) return;

    for (let i = 0; i < this.pool.length; i++) {
      const e = this.pool[i];
      if (!e?.active || isBossTypeIndex(e.typeIndex)) continue;
      for (let bossIndex = 0; bossIndex < this.activeBosses.length; bossIndex++) {
        const boss = this.activeBosses[bossIndex];
        if (!boss) continue;
        const contactRadius = boss.radius + e.radius;
        const contactRadiusSq = contactRadius * contactRadius;
        const epsilonSq = ENEMIES.coincidentSeparationEpsilon ** 2;
        const startX = e.prevX - boss.prevX;
        const startZ = e.prevZ - boss.prevZ;
        const relativeMoveX = (e.x - e.prevX) - (boss.x - boss.prevX);
        const relativeMoveZ = (e.z - e.prevZ) - (boss.z - boss.prevZ);
        const startDistanceSq = startX * startX + startZ * startZ;
        const relativeMoveSq = relativeMoveX * relativeMoveX + relativeMoveZ * relativeMoveZ;
        let toi = -1;
        let normalX = 0;
        let normalZ = 0;

        if (startDistanceSq < contactRadiusSq) {
          toi = 0;
          if (startDistanceSq > epsilonSq) {
            const inverseStartDistance = 1 / Math.sqrt(startDistanceSq);
            normalX = startX * inverseStartDistance;
            normalZ = startZ * inverseStartDistance;
          } else if (relativeMoveSq > epsilonSq) {
            const inverseMove = 1 / Math.sqrt(relativeMoveSq);
            normalX = -relativeMoveX * inverseMove;
            normalZ = -relativeMoveZ * inverseMove;
          } else {
            const angle = ((i + 1) * (bossIndex + 1) * ENEMIES.coincidentSeparationAngleStep) % (Math.PI * 2);
            normalX = Math.cos(angle);
            normalZ = Math.sin(angle);
          }
        } else if (relativeMoveSq > epsilonSq) {
          const halfB = startX * relativeMoveX + startZ * relativeMoveZ;
          const c = startDistanceSq - contactRadiusSq;
          const discriminant = halfB * halfB - relativeMoveSq * c;
          if (discriminant >= 0) {
            const candidate = (-halfB - Math.sqrt(discriminant)) / relativeMoveSq;
            if (candidate >= 0 && candidate <= 1) {
              toi = candidate;
              normalX = startX + relativeMoveX * toi;
              normalZ = startZ + relativeMoveZ * toi;
              const inverseContactDistance = 1 / Math.hypot(normalX, normalZ);
              normalX *= inverseContactDistance;
              normalZ *= inverseContactDistance;
            }
          }
        }
        if (toi < 0) continue;

        const remainingX = relativeMoveX * (1 - toi);
        const remainingZ = relativeMoveZ * (1 - toi);
        const radialRemainder = remainingX * normalX + remainingZ * normalZ;
        let tangentX = remainingX - normalX * radialRemainder;
        let tangentZ = remainingZ - normalZ * radialRemainder;
        const tangentSq = tangentX * tangentX + tangentZ * tangentZ;
        if (tangentSq <= epsilonSq && relativeMoveSq > epsilonSq) {
          const side = e.avoidanceSide !== 0
            ? e.avoidanceSide
            : (e.slot + e.gen + boss.slot + boss.gen) % 2 === 0 ? 1 : -1;
          const redirected = Math.min(
            Math.sqrt(remainingX * remainingX + remainingZ * remainingZ)
              * ENEMIES.bossContact.headOnTangentFraction,
            ENEMIES.bossContact.headOnTangentMax,
          );
          tangentX = -normalZ * side * redirected;
          tangentZ = normalX * side * redirected;
        }

        const arenaLimit = PLAY_HALF_SIZE - e.radius;
        let nextX = THREE.MathUtils.clamp(
          boss.x + normalX * contactRadius + tangentX,
          -arenaLimit,
          arenaLimit,
        );
        let nextZ = THREE.MathUtils.clamp(
          boss.z + normalZ * contactRadius + tangentZ,
          -arenaLimit,
          arenaLimit,
        );
        const clampedX = nextX - boss.x;
        const clampedZ = nextZ - boss.z;
        if (clampedX * clampedX + clampedZ * clampedZ < contactRadiusSq) {
          const centreDistance = Math.hypot(boss.x, boss.z);
          if (centreDistance > ENEMIES.coincidentSeparationEpsilon) {
            normalX = -boss.x / centreDistance;
            normalZ = -boss.z / centreDistance;
          }
          nextX = THREE.MathUtils.clamp(boss.x + normalX * contactRadius, -arenaLimit, arenaLimit);
          nextZ = THREE.MathUtils.clamp(boss.z + normalZ * contactRadius, -arenaLimit, arenaLimit);
        }
        e.x = nextX;
        e.z = nextZ;
      }
    }
  }

  private resolveObstacles(obstacles: Obstacle[]): void {
    for (const e of this.pool) {
      if (!e.active) continue;
      for (let pass = 0; pass < ENEMIES.obstacleAvoidance.resolvePasses; pass++) {
        for (const o of obstacles) {
          const minDist = o.radius + e.radius;
          let dx = e.x - o.x;
          let dz = e.z - o.z;
          const dSq = dx * dx + dz * dz;
          if (dSq >= minDist * minDist) continue;
          if (dSq < ENEMIES.coincidentSeparationEpsilon ** 2) {
            const angle = (e.slot * ENEMIES.coincidentSeparationAngleStep) % (Math.PI * 2);
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
      const arenaLimit = PLAY_HALF_SIZE - e.radius;
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

      if (isBossTypeIndex(e.typeIndex)) {
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

      // Drawn by its own part rig this frame: hide the instanced copy, but only
      // AFTER the shadow and boss ring above — those still belong to the body.
      if (e === this.externallyDrawn) {
        mesh.setMatrixAt(e.slot, HIDDEN);
        continue;
      }

      tmpMatrix.makeRotationY(e.heading);
      if (type.behavior === 'roller') {
        tmpRot.makeRotationX(e.phase);
        tmpMatrix.multiply(tmpRot);
      } else if (VISUAL.enemyWobble.enabled && !isBossTypeIndex(e.typeIndex)) {
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

  /** Wave strength runs on the ARC clock (see `update`), never on the per-map
   *  combat clock: crossing a sector boundary must not rewind the swarm. */
  private updateSpawner(
    dt: number,
    arcElapsedS: number,
    rosterElapsedS: number,
    difficulty: number,
    rewardScale: number,
    playerX: number,
    playerZ: number,
    obstacles: Obstacle[],
  ): void {
    // Checked before the timer, not after: a paused spawner that kept counting
    // down would dump one full wave the instant it resumed.
    if (this.wavesPaused) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;

    const t = Math.min(difficulty, 1);
    // While a boss is up the ambient waves step back so the fight is a PHASE,
    // not the same soup with one bigger body in it. The boss's own minions
    // carry the pressure instead.
    const bossDampen = this.bossAlive()
      ? THREE.MathUtils.lerp(BOSS.spawnDampenEarly, BOSS.spawnDampenLate, t)
      : 1;
    const interval = THREE.MathUtils.lerp(ENEMIES.waveIntervalStartS, ENEMIES.waveIntervalEndS, t);
    const maxActive = Math.round(
      THREE.MathUtils.lerp(ENEMIES.maxActiveStart, ENEMIES.maxActiveEnd, t) *
        Math.max(1, difficulty) *
        bossDampen,
    );
    const waveSize = Math.min(
      Math.round(
        THREE.MathUtils.lerp(ENEMIES.waveSizeStart, ENEMIES.waveSizeEnd, t) *
          Math.max(1, difficulty) *
          bossDampen,
      ),
      Math.max(0, maxActive - this.activeCount),
    );
    const hpMultiplier =
      (1 + (arcElapsedS / 60) * ENEMIES.hpRampPerMinute) * Math.max(1, difficulty);
    this.waveHpMultiplier = hpMultiplier;
    this.spawnTimer = interval;

    for (let n = 0; n < waveSize; n++) {
      // Staging, not strength: this is the ONLY thing the roster clock decides.
      const type = pickEnemyType(rosterElapsedS);
      const elite =
        arcElapsedS >= ELITES.minRunTimeS &&
        ELITES.behaviors.includes(type.behavior) &&
        Math.random() < Math.max(ELITES.chanceFloor, ELITES.chanceAtMaxDifficulty * difficulty);
      this.spawn(type, hpMultiplier, playerX, playerZ, elite, obstacles, arcElapsedS, rewardScale);
    }
  }

  private spawn(
    type: EnemyTypeDef,
    hpMultiplier: number,
    playerX: number,
    playerZ: number,
    elite: boolean,
    obstacles: Obstacle[],
    elapsedS = 0,
    rewardScale = 1,
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
      elapsedS,
      rewardScale,
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
    /** ARC clock. Only used to ramp elite HP and payout — plain spawns ignore both. */
    elapsedS = 0,
    rewardScale = 1,
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
    e.prevX = spot.x;
    e.prevZ = spot.z;
    e.elite = elite;
    // Elite HP ramps with run time: a flat 6x at the 90s gate is a wall, not a
    // fight. Reaches the full multiplier by ELITES.hpFullAtS.
    const eliteRamp = THREE.MathUtils.clamp(
      (elapsedS - ELITES.minRunTimeS) / Math.max(1, ELITES.hpFullAtS - ELITES.minRunTimeS),
      0,
      1,
    );
    const eliteHpMultiplier = elite
      ? THREE.MathUtils.lerp(ELITES.hpMultiplierEarly, ELITES.hpMultiplier, eliteRamp)
      : 1;
    // Payout scales only with pressure the CLOCK did not create — see
    // config.rewardScalar. Surviving into a harder map is not a pay raise;
    // stacking Cursed Core is.
    const rewardMultiplier =
      elite && ELITES.rewardScalesWithDifficulty ? Math.max(1, rewardScale) : 1;
    e.maxHp = Math.round(type.hp * hpMultiplier * eliteHpMultiplier);
    e.hp = e.maxHp;
    e.speed = type.speed;
    e.scale = type.scale * scaleMultiplier;
    e.radius = radius;
    e.contactRadius = (type.contactRadius ?? type.radius) * scaleMultiplier;
    e.xp = type.xp * (elite ? ELITES.xpMultiplier : 1) * rewardMultiplier;
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
    e.avoidanceObstacle = null;
    e.avoidanceSide = 0;
    e.avoidanceSourceEnemy = null;
    e.avoidanceSourceGeneration = -1;
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
  /** Rebuilds the per-frame avoidance set: the static map props plus every
   *  live `blocksOthers` body. Both arrays are reused so this allocates
   *  nothing per frame. Returns the combined list.
   *
   *  A charger mid-lunge is deliberately EXCLUDED — it is moving fast and
   *  committed, and leaving it in makes the swarm flinch away from a body that
   *  will not be there by the time they reach it. */
  /** Shoves every non-boss body out of a radius. Bosses use this to clear the
   *  ground they fight on — the Crusher on each lunge, the Tesla on each burst
   *  — which is what makes standing near one survivable long enough to
   *  actually attack it. */
  shoveAwayFrom(x: number, z: number, radius: number, force: number): number {
    const radiusSq = radius * radius;
    let shoved = 0;
    for (let i = 0; i < this.pool.length; i++) {
      const e = this.pool[i];
      if (!e?.active || isBossTypeIndex(e.typeIndex)) continue;
      const dx = e.x - x;
      const dz = e.z - z;
      const distSq = dx * dx + dz * dz;
      if (distSq > radiusSq || distSq < 0.0001) continue;
      const dist = Math.sqrt(distSq);
      // Falls off with distance so the edge of the sweep is a nudge, not a
      // wall of bodies launched at identical speed.
      const falloff = 1 - dist / radius;
      this.applyKnockback(i, dx / dist, dz / dist, force * falloff);
      shoved++;
    }
    return shoved;
  }

  /** DEV ONLY (boss lab) — runs the real spawner until the field reaches the
   *  population it would have at this point in a played run.
   *
   *  Without it the lab summons a boss onto a nearly empty arena and the first
   *  twenty seconds are unrepresentatively easy — which is exactly the flaw
   *  that makes an isolated boss test worthless. Uses the actual spawner so
   *  the mix of types, the HP ramp and the cap all come out right. */
  devFillToCap(
    arcElapsedS: number,
    rosterElapsedS: number,
    difficulty: number,
    rewardScale: number,
    playerX: number,
    playerZ: number,
    obstacles: Obstacle[],
  ): number {
    const cap = Math.round(
      THREE.MathUtils.lerp(ENEMIES.maxActiveStart, ENEMIES.maxActiveEnd, Math.min(difficulty, 1)) *
        BOSS_LAB.fillFraction,
    );
    let guard = 0;
    let previous = -1;
    // The spawner picks the type mix, unlock times and HP ramp correctly, so
    // it stays in charge of WHAT spawns. Stops early at the target population
    // rather than the hard cap.
    while (guard++ < 400 && this.activeCount !== previous && this.activeCount < cap) {
      previous = this.activeCount;
      this.spawnTimer = 0;
      this.updateSpawner(
        0,
        arcElapsedS,
        rosterElapsedS,
        difficulty,
        rewardScale,
        playerX,
        playerZ,
        obstacles,
      );
    }

    // Then fix WHERE they are. The spawner drops everything into the 32-44
    // spawn ring, which would march inward as one closing shell — a formation
    // the game never produces in play. Scattering across the full approach
    // range reproduces a swarm caught mid-advance instead.
    const { scatterMin, scatterMax } = BOSS_LAB;
    for (const e of this.pool) {
      if (!e.active || isBossTypeIndex(e.typeIndex)) continue;
      const angle = Math.random() * Math.PI * 2;
      // sqrt keeps the distribution even by AREA; a flat radius would crowd
      // everything near the player, which is the bug this is fixing.
      const dist = Math.sqrt(
        scatterMin * scatterMin +
          Math.random() * (scatterMax * scatterMax - scatterMin * scatterMin),
      );
      const spot = findClearSpot(
        playerX + Math.cos(angle) * dist,
        playerZ + Math.sin(angle) * dist,
        obstacles,
        e.radius,
      );
      if (spot) {
        e.x = spot.x;
        e.z = spot.z;
      }
    }
    return this.activeCount;
  }

  /** True while any boss type is alive in the pool. */
  bossAlive(): boolean {
    for (const e of this.pool) {
      if (e.active && isBossTypeIndex(e.typeIndex)) return true;
    }
    return false;
  }

  private rebuildDynamicObstacles(staticObstacles: Obstacle[]): EnemyObstacle[] {
    this.combinedObstacles.length = 0;
    for (const o of staticObstacles) this.combinedObstacles.push(o);

    let slot = 0;
    for (const e of this.pool) {
      if (!e.active) continue;
      const isBoss = isBossTypeIndex(e.typeIndex);
      if (!isBoss && !ENEMY_TYPES[e.typeIndex]?.blocksOthers) continue;
      if (!isBoss && e.chargeState === CHARGE.lunging) continue;
      const entry = (this.dynamicObstacles[slot] ??= { x: 0, z: 0, radius: 0 });
      entry.x = e.x;
      entry.z = e.z;
      // A boss repels the swarm well beyond its body, opening a ring the
      // player can stand in and shoot from. Without it the trash packs against
      // the boss, and even a hunter weapon has something closer to lock onto.
      entry.radius = isBoss ? BOSS.clearRadius : e.radius;
      entry.sourceEnemy = e;
      this.combinedObstacles.push(entry);
      slot++;
    }
    return this.combinedObstacles;
  }

  private steerAroundObstacles(
    e: Enemy,
    desiredX: number,
    desiredZ: number,
    obstacles: EnemyObstacle[],
  ): { x: number; z: number } {
    const cfg = ENEMIES.obstacleAvoidance;
    const bossMultiplier = isBossTypeIndex(e.typeIndex)
      ? cfg.bossLookAheadMultiplier
      : 1;
    const lookAhead = cfg.lookAhead * bossMultiplier + e.radius;
    let chosen: EnemyObstacle | null = null;
    let chosenForward = Infinity;
    let chosenHorizon = lookAhead;
    let chosenLateralSide = 0;
    let lockedSeen = false;

    for (const obstacle of obstacles) {
      // A heavy must not steer around ITSELF — it sits at its own centre, so
      // without this it would permanently swerve away from its own position.
      if (obstacle.sourceEnemy === e) continue;
      const source = obstacle.sourceEnemy ?? null;
      const isLockedObstacle = obstacle === e.avoidanceObstacle
        && source === e.avoidanceSourceEnemy
        && (source === null || source.gen === e.avoidanceSourceGeneration);
      if (obstacle === e.avoidanceObstacle && !isLockedObstacle) {
        // Dynamic obstacle objects are reused. A new source in the same slot is
        // a new obstacle and must choose its own tangent side.
        e.avoidanceObstacle = null;
        e.avoidanceSide = 0;
        e.avoidanceSourceEnemy = null;
        e.avoidanceSourceGeneration = -1;
      }
      if (isLockedObstacle) lockedSeen = true;
      const relX = obstacle.x - e.x;
      const relZ = obstacle.z - e.z;
      const forward = relX * desiredX + relZ * desiredZ;
      // Large boss clearance volumes must be anticipated before their centres
      // enter the base horizon; obstacle radius extends the leading edge.
      const obstacleHorizon = lookAhead + obstacle.radius;
      if (forward <= 0 || forward > obstacleHorizon) continue;

      const lateralX = relX - desiredX * forward;
      const lateralZ = relZ - desiredZ * forward;
      const lateralSq = lateralX * lateralX + lateralZ * lateralZ;
      const clearance = obstacle.radius + e.radius + cfg.clearance;
      if (lateralSq >= clearance * clearance) continue;

      if (isLockedObstacle || forward < chosenForward) {
        const leftX = -desiredZ;
        const leftZ = desiredX;
        chosen = obstacle;
        chosenForward = forward;
        chosenHorizon = obstacleHorizon;
        chosenLateralSide = relX * leftX + relZ * leftZ;
        if (isLockedObstacle) break;
      }
    }

    if (!lockedSeen && e.avoidanceObstacle) {
      e.avoidanceObstacle = null;
      e.avoidanceSide = 0;
      e.avoidanceSourceEnemy = null;
      e.avoidanceSourceGeneration = -1;
    }
    if (!chosen) return { x: desiredX, z: desiredZ };
    if (chosen !== e.avoidanceObstacle) {
      e.avoidanceObstacle = chosen;
      e.avoidanceSourceEnemy = chosen.sourceEnemy ?? null;
      e.avoidanceSourceGeneration = chosen.sourceEnemy?.gen ?? -1;
      e.avoidanceSide = Math.abs(chosenLateralSide) > cfg.sideChoiceEpsilon
        ? chosenLateralSide > 0 ? -1 : 1
        : e.slot % 2 === 0 ? 1 : -1;
    }

    const relX = chosen.x - e.x;
    const relZ = chosen.z - e.z;
    const lateralX = relX - desiredX * chosenForward;
    const lateralZ = relZ - desiredZ * chosenForward;
    const clearance = chosen.radius + e.radius + cfg.clearance;
    const proximity = 1 - Math.hypot(lateralX, lateralZ) / clearance;
    const urgency = 1 - chosenForward / chosenHorizon;
    const strength = cfg.steerStrength * (cfg.minimumSteerWeight + proximity + urgency);
    const leftX = -desiredZ;
    const leftZ = desiredX;
    const steerX = desiredX + leftX * e.avoidanceSide * strength;
    const steerZ = desiredZ + leftZ * e.avoidanceSide * strength;
    const length = Math.hypot(steerX, steerZ) || 1;
    return { x: steerX / length, z: steerZ / length };
  }

  /** Shoves the enemy along a direction. Bosses are immune. */
  applyKnockback(index: number, dirX: number, dirZ: number, force: number): void {
    const e = this.pool[index];
    if (!e || !e.active || isBossTypeIndex(e.typeIndex)) return;
    e.kbX += dirX * force;
    e.kbZ += dirZ * force;
  }

  /** Whether this pool index belongs to a boss (execute immunity, etc.). */
  isBossIndex(index: number): boolean {
    const e = this.pool[index];
    return !!e && isBossTypeIndex(e.typeIndex);
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
    mesh?.setColorAt(e.slot, isBossTypeIndex(e.typeIndex) ? BOSS_FLASH_TINT : FLASH_TINT);
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
