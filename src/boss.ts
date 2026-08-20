import * as THREE from 'three';
import {
  BOSS,
  BOSS_TYPE_INDEXES,
  CRUSHER_KING_TYPE_INDEX,
  TESLA_TITAN_TYPE_INDEX,
  ENEMY_TYPES,
  FINAL_BOSS,
  FINAL_BOSS_TYPE_INDEX,
  isBossTypeIndex,
} from './config';
import { CHARGE } from './enemies';
import type { EnemySystem } from './enemies';
import type { EnemyProjectiles } from './enemy-projectiles';
import { BossRig } from './boss-rig';
import { FinalBossFight, type BossEffects } from './final-boss';
import { litMaterial } from './toon';
import { buildGridGeometry } from './models/voxel-builder';
import { buildModelGrid, VOXEL_MODELS } from './models/registry';
import { findClearSpot, findRandomClearSpot, isClearPosition, type Obstacle } from './world';

/** The voxel size the portal's surrounding primitives — beam, warning ring,
 *  placeholder pillar — were authored against. Their literals below are all
 *  relative to a gate built at this size. */
const PORTAL_AUTHORED_VOXEL_SIZE = 0.12;

/** How much the portal model has grown since those primitives were authored.
 *  BOSS.totemColliderRadius covers the same coupling on the physics side; it
 *  stays in config because it is a gameplay number, not a visual one. */
function portalScale(): number {
  const size = VOXEL_MODELS['portal']?.voxelSize;
  return typeof size === 'number' && size > 0 ? size / PORTAL_AUTHORED_VOXEL_SIZE : 1;
}

// A totem spawns somewhere far away at run start. Touching it summons one
// random boss. The boss lives inside the enemy pool (so every weapon hits it);
// this system only drives its special attacks on top of the base behavior.

type BossState = 'idle' | 'summoning' | 'active' | 'done';

export interface BossStatus {
  name: string;
  hp: number;
  maxHp: number;
  /** 1-based phase, and how many there are. Only the finale has phases; the
   *  Map 1 bosses report undefined and the HUD shows nothing extra. */
  phase?: number;
  phaseCount?: number;
}

/** The live boss's physical presence, for player collision and ram response.
 *  Reported here rather than read off the pool by the caller because only this
 *  system knows which pool slot is the boss and what phase its attack is in. */
export interface BossBody {
  x: number;
  z: number;
  radius: number;
  /** Direction of travel in radians, as moveChase writes it. */
  heading: number;
  /** True only during the Crusher's committed lunge. */
  ramming: boolean;
  /** Bumped once per lunge, so a ram can be billed exactly once no matter how
   *  many frames the bodies overlap. */
  ramSerial: number;
}

export class BossSystem {
  private readonly totem: THREE.Group;
  private state: BossState = 'done';
  private bossIndex = -1;
  private bossTypeIndex = -1;

  // Crusher timers.
  private chargeTimer = 0;
  private chargePhase: 'cooldown' | 'telegraph' | 'charging' = 'cooldown';
  private minionTimer = 0;
  private baseSpeed = 0;
  // Tesla timer.
  private burstTimer = 0;
  /** The Hazard Marshal's three-phase fight. Owns its own telegraphs. */
  private readonly finalFight: FinalBossFight;
  /** Animated part rig for the final boss — the one body on screen that can
   *  afford limbs (docs/ANIMACION_RIG.md). */
  private readonly finalRig: BossRig;
  /** Game-shell hooks the finale needs (damage, VFX, banner, audio). */
  private effects: BossEffects | null = null;
  /** True while the summon telegraph running is the FINALE's, not a totem's. */
  private finalArrival = false;
  /** Phase the rig last reacted to. 0 = no rig running yet, so the first frame
   *  of a fight does not fire a recoil for simply existing. */
  private riggedPhase = 0;
  // Run continuity: each defeated boss raises the next one's HP.
  private hpMult = 1;
  private respawnTimer = 0;
  /** Telegraph window between the summon key press and the boss appearing. */
  private summonTimer = 0;
  bossesDefeated = 0;
  /** Which boss KINDS fell this run, by type name. A plain count cannot answer
   *  "defeat every kind of boss", and the kind is only known here — the run
   *  record would have no way to reconstruct it afterwards. */
  readonly defeatedTypes = new Set<string>();

  /** Pillar+skull primitives, swapped async for the voxel portal gate. */
  private readonly totemBody: THREE.Group;
  /** Portal energy beam — pulses hard while the summon telegraph runs. */
  private readonly beam: THREE.Mesh;
  /** Ground warning ring, expanding in waves during the telegraph. */
  private readonly warnRing: THREE.Mesh;
  private summonElapsed = 0;
  /** Where the boss materialized this frame — the eruption VFX anchor. */
  readonly lastSummonAt = { x: 0, z: 0 };
  private readonly totemObstacle: Obstacle = {
    x: 0,
    z: 0,
    radius: BOSS.totemColliderRadius,
    blocksFlyers: true,
  };
  /** Reused per frame — `body()` runs every frame and must not allocate. */
  private readonly bossBody: BossBody = {
    x: 0,
    z: 0,
    radius: 0,
    heading: 0,
    ramming: false,
    ramSerial: 0,
  };
  private readonly bodyObstacle: Obstacle = { x: 0, z: 0, radius: 0, blocksFlyers: true };
  private ramSerial = 0;

  constructor(scene: THREE.Scene) {
    // Everything drawn around the gate follows the gate. Derived from the model
    // rather than retyped, because growing the portal from 0.12 to 0.16 left
    // the beam and the warning ring at their old size — the landmark got wider
    // while its own light column stayed thin, which reads as a mismatch rather
    // than a bigger portal. Change voxelSize alone and this tracks it.
    const scale = portalScale();
    this.totem = new THREE.Group();
    this.totemBody = new THREE.Group();
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5 * scale, 0.8 * scale, 2.4 * scale, 6),
      litMaterial({ color: 0x232830 }),
    );
    pillar.position.y = 1.2 * scale;
    const skull = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.7 * scale, 0),
      new THREE.MeshBasicMaterial({ color: 0xff3355 }),
    );
    skull.position.y = 3 * scale;
    this.totemBody.add(pillar, skull);
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45 * scale, 0.45 * scale, 18 * scale, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xff3355,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.beam.position.y = 9 * scale;
    // Summon telegraph (2026-07-11): a red warning ring that pulses outward
    // from the portal base while the boss assembles — danger you can SEE
    // growing before it lands (boss red = the exclusive danger language).
    // Its base radius scales too: the ring starts at the gate's footprint, and
    // a wider gate with the old ring reads as the ring starting inside it.
    const warnGeometry = new THREE.RingGeometry(0.85 * scale, 1.0 * scale, 32);
    warnGeometry.rotateX(-Math.PI / 2);
    this.warnRing = new THREE.Mesh(
      warnGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xff3355,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.warnRing.position.y = 0.12;
    this.totem.add(this.totemBody, this.beam, this.warnRing);
    this.totem.visible = false;
    scene.add(this.totem);
    this.finalFight = new FinalBossFight(scene);
    this.finalRig = new BossRig(scene);

    // The voxel portal gate loads async and swaps in over the primitives.
    void this.upgradeVoxelModel();
  }

  private async upgradeVoxelModel(): Promise<void> {
    const def = VOXEL_MODELS['portal'];
    if (!def) return;
    try {
      const geometry = buildGridGeometry(await buildModelGrid('portal'), def.voxelSize);
      const voxelMesh = new THREE.Mesh(geometry, litMaterial({ vertexColors: true }));
      for (const child of [...this.totemBody.children]) {
        this.totemBody.remove(child);
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) child.material.dispose();
        }
      }
      this.totemBody.add(voxelMesh);
    } catch (error) {
      console.warn('Portal voxel model unavailable, keeping totem primitives:', error);
    }
  }

  /** Places the totem and picks the boss it will summon.
   *
   *  Centred on the PLAYER, not the map origin. At run start those are the same
   *  point, so the first portal is unchanged; the difference is every portal
   *  after a kill, which used to be rolled around the world centre and could
   *  therefore land across the arena from whoever just earned it. */
  startRun(obstacles: Obstacle[] = [], playerX = 0, playerZ = 0): boolean {
    const respawn = this.bossesDefeated > 0;
    let spot = findRandomClearSpot(
      playerX,
      playerZ,
      respawn ? BOSS.respawnTotemDistMin : BOSS.totemDistMin,
      respawn ? BOSS.respawnTotemDistMax : BOSS.totemDistMax,
      BOSS.totemColliderRadius,
      obstacles,
    );
    // Against a wall most of a player-centred ring lies outside the arena. The
    // origin is always surrounded by floor, so it is the fallback that keeps a
    // cornered player from stalling the respawn loop entirely.
    if (!spot) {
      spot = findRandomClearSpot(
        0,
        0,
        BOSS.totemDistMin,
        BOSS.totemDistMax,
        BOSS.totemColliderRadius,
        obstacles,
      );
    }
    if (!spot) return false;
    this.totem.position.set(spot.x, 0, spot.z);
    this.totemObstacle.x = spot.x;
    this.totemObstacle.z = spot.z;
    this.totem.visible = true;
    this.state = 'idle';
    this.bossIndex = -1;
    this.bossTypeIndex =
      BOSS_TYPE_INDEXES[Math.floor(Math.random() * BOSS_TYPE_INDEXES.length)] ??
      TESLA_TITAN_TYPE_INDEX;
    this.chargePhase = 'cooldown';
    this.chargeTimer = BOSS.crusher.chargeCooldownS;
    this.minionTimer = BOSS.crusher.minionIntervalS;
    this.burstTimer = BOSS.tesla.burstCooldownS;
    return true;
  }

  /** DEV ONLY (boss lab) — summons right where the player is standing, with no
   *  walk to the portal. Keeps the normal summon telegraph so the fight starts
   *  exactly as it would in a real run. */
  devForceSummon(px: number, pz: number): void {
    if (this.state !== 'idle') return;
    this.totem.position.set(px + 6, 0, pz);
    this.totemObstacle.x = px + 6;
    this.totemObstacle.z = pz;
    this.state = 'summoning';
    this.summonJustBegan = true;
    this.summonTimer = BOSS.summonDelayS;
    this.summonElapsed = 0;
  }

  /** DEV ONLY (boss lab) — forces which boss the next summon produces, so a
   *  fight can be re-tested against the SAME boss instead of a coin flip. */
  devSetBossType(typeIndex: number): void {
    this.bossTypeIndex = typeIndex;
  }

  /** Builds the final boss's part rig AHEAD of time.
   *
   *  It used to be built on the first frame the body existed, and carving eight
   *  parts out of the voxel grid and meshing them is not free — the arrival
   *  landed together with a stall, which is exactly when the player is looking.
   *  Called from behind the arena curtain, it has the whole fade plus the 2.5s
   *  telegraph to finish, and the instanced body still covers for it if it does
   *  not. Safe to call repeatedly; the rig is built once. */
  prepareFinalRig(): void {
    const modelKey = ENEMY_TYPES[FINAL_BOSS_TYPE_INDEX]?.modelKey;
    if (modelKey) this.finalRig.load(modelKey);
  }

  /** Wires the game-shell hooks the finale's attacks need. Called once, from
   *  Game's constructor, because BossSystem is built before the HUD and the
   *  particle pools exist. */
  setEffects(effects: BossEffects): void {
    this.effects = effects;
  }

  /** Opens the Map 2 finale: picks where the Hazard Marshal will land and
   *  starts the SAME arrival telegraph a Map 1 summon gets — strobing beam,
   *  expanding warning rings, then the eruption — minus the portal gate, which
   *  it does not come through. The body itself appears when the telegraph ends
   *  (see `update`), so `startFinale` only has to know whether a spot existed.
   *
   *  Placement obeys three separate constraints, in this order:
   *   - OUT OF REACH: at least `arrival.distMin` from the player, so the boss
   *     cannot land a free touch on arrival.
   *   - IN FRAME: `isVisible` is a real projection through the live camera, not
   *     an angle guess. The camera leaves ~29 units of visible ground above the
   *     player and only ~13 below, so a fixed offset (the old `px + 24`) put
   *     the finale off-screen from most positions.
   *   - ROOM TO FIGHT: clear of every prop, tower and pickup by the boss radius
   *     PLUS `arrival.clearance`, so it does not arrive wedged into scenery.
   *
   *  Returns false when no spot satisfies them; the caller re-arms and retries
   *  on the next frame. */
  beginFinalArrival(
    px: number,
    pz: number,
    obstacles: Obstacle[],
    /** Frame score for a candidate: null when the body would not fit on screen,
     *  otherwise higher is better. Owned by the game because only it has the
     *  camera. */
    frameScore: (x: number, z: number) => number | null,
  ): boolean {
    const spot = this.findArrivalSpot(px, pz, obstacles, frameScore);
    if (!spot) return false;
    this.bossTypeIndex = FINAL_BOSS_TYPE_INDEX;
    this.finalArrival = true;
    this.totem.position.set(spot.x, 0, spot.z);
    this.totemObstacle.x = spot.x;
    this.totemObstacle.z = spot.z;
    // The gate itself stays hidden: the Marshal is not summoned through a
    // portal, so only the danger language (beam + warning rings) shows.
    this.totemBody.visible = false;
    this.totem.visible = true;
    this.state = 'summoning';
    this.summonJustBegan = true;
    this.summonTimer = FINAL_BOSS.arrival.telegraphS;
    this.summonElapsed = 0;
    return true;
  }

  /** Best arrival spot, or null.
   *
   *  Every sample of a pass is scored and the BEST one wins, rather than the
   *  first that merely fits. All the constraints are pass/fail except framing:
   *  a body can be entirely on screen and still land under the boss health bar
   *  or behind the run timer, so the score prefers the band across the middle
   *  of the frame, where no HUD is drawn.
   *
   *  Then it relaxes in two documented steps instead of failing outright: a
   *  player cornered against a wall behind a tower would otherwise stall the
   *  finale forever, and a finale that never arrives is a worse failure than
   *  one that arrives slightly off-centre. */
  private findArrivalSpot(
    px: number,
    pz: number,
    obstacles: Obstacle[],
    frameScore: (x: number, z: number) => number | null,
  ): { x: number; z: number } | null {
    const cfg = FINAL_BOSS.arrival;
    const radius = ENEMY_TYPES[FINAL_BOSS_TYPE_INDEX]?.radius ?? BOSS.totemColliderRadius;
    const passes: { needRoom: boolean; needFrame: boolean }[] = [
      { needRoom: true, needFrame: true },
      { needRoom: false, needFrame: true },
      { needRoom: false, needFrame: false },
    ];
    for (const pass of passes) {
      const spawnRadius = radius + (pass.needRoom ? cfg.clearance : 0);
      let best: { x: number; z: number } | null = null;
      let bestScore = -Infinity;
      for (let attempt = 0; attempt < cfg.placementAttempts; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const distance =
          cfg.distMin + Math.random() * Math.max(0, cfg.distMax - cfg.distMin);
        const x = px + Math.cos(angle) * distance;
        const z = pz + Math.sin(angle) * distance;
        if (!isClearPosition(x, z, spawnRadius, obstacles)) continue;
        const score = frameScore(x, z);
        if (pass.needFrame && score === null) continue;
        if ((score ?? 0) > bestScore) {
          bestScore = score ?? 0;
          best = { x, z };
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** True while the player stands in the summon zone of the idle totem. */
  playerInSummonZone = false;

  /** True only on the frame the telegraph (idle → summoning) begins, so the
   *  caller can start the portal-charge sound in sync with the spin-up. */
  summonJustBegan = false;

  /** Returns the summoned boss's name when the summon triggers this frame.
   *  The summon only fires when the player presses the summon key inside the
   *  zone — walking through the scrapyard never triggers it by accident. */
  update(
    dt: number,
    px: number,
    pz: number,
    summonPressed: boolean,
    enemies: EnemySystem,
    projectiles: EnemyProjectiles,
    obstacles: Obstacle[],
    /** Player level at this moment — read when the boss materializes so its HP
     *  matches the build that summoned it (see BOSS.hpLevelReference). */
    playerLevel = BOSS.hpLevelReference,
  ): string | null {
    this.playerInSummonZone = false;
    this.summonJustBegan = false;
    if (this.state === 'idle') {
      this.totem.rotation.y += dt * 0.8;
      const dx = px - this.totem.position.x;
      const dz = pz - this.totem.position.z;
      const inZone =
        dx * dx + dz * dz <= BOSS.totemActivateRadius * BOSS.totemActivateRadius;
      this.playerInSummonZone = inZone;
      if (inZone && summonPressed) {
        // Telegraph first: the totem spins up while the boss "assembles",
        // giving the player time to reposition before it materializes.
        this.playerInSummonZone = false;
        this.state = 'summoning';
        this.summonJustBegan = true;
        this.summonTimer = BOSS.summonDelayS;
        this.summonElapsed = 0;
      }
      return null;
    }

    if (this.state === 'summoning') {
      this.totem.rotation.y += dt * 6;
      this.summonElapsed += dt;
      // Telegraph: the beam strobes toward full brightness and red warning
      // rings pulse outward from the base — impossible to miss what's coming.
      const beamMat = this.beam.material as THREE.MeshBasicMaterial;
      beamMat.opacity = 0.3 + 0.35 * (0.5 + 0.5 * Math.sin(this.summonElapsed * 18));
      const ringPhase = (this.summonElapsed * 1.6) % 1;
      const ringMat = this.warnRing.material as THREE.MeshBasicMaterial;
      this.warnRing.scale.setScalar(1 + ringPhase * 9);
      ringMat.opacity = 0.85 * (1 - ringPhase);
      this.summonTimer -= dt;
      if (this.summonTimer > 0) return null;
      // Telegraph over: restore the idle look before the portal hides.
      beamMat.opacity = 0.22;
      ringMat.opacity = 0;

      // The finale's landing spot was already validated against distance, frame
      // and room to move when the arrival opened, so it lands exactly there.
      // A totem summon instead materializes AT the gate, and only then is
      // pushed away from the player to a safe radius.
      let sx = this.totem.position.x;
      let sz = this.totem.position.z;
      const spawnObstacles = obstacles.filter((obstacle) => obstacle !== this.totemObstacle);
      const bossRadius = ENEMY_TYPES[this.bossTypeIndex]?.radius ?? BOSS.totemColliderRadius;
      if (!this.finalArrival) {
        const dx = sx - px;
        const dz = sz - pz;
        const dist = Math.hypot(dx, dz);
        const minDist = BOSS.spawnMinDistFromPlayer;
        if (dist < minDist) {
          const nx = dist > 0.001 ? dx / dist : 1;
          const nz = dist > 0.001 ? dz / dist : 0;
          sx = px + nx * minDist;
          sz = pz + nz * minDist;
        }
        const clearSpot = findClearSpot(sx, sz, spawnObstacles, bossRadius);
        if (!clearSpot) {
          this.state = 'idle';
          return null;
        }
        sx = clearSpot.x;
        sz = clearSpot.z;
      }
      this.totem.visible = false;
      this.totemBody.visible = true;
      this.lastSummonAt.x = sx;
      this.lastSummonAt.z = sz;
      // Level scaling is folded into the HP multiplier the pool already takes,
      // so nothing downstream needs to know about it. The finale reads its OWN
      // reference and clamps, and deliberately ignores `hpMult`: the Marshal is
      // a fixed encounter, not the next rung of Map 1's respawn ladder.
      const isFinale = this.finalArrival;
      const scaling = isFinale ? FINAL_BOSS : BOSS;
      const levelScale = Math.min(
        scaling.hpLevelMax,
        Math.max(scaling.hpLevelMin, playerLevel / scaling.hpLevelReference),
      );
      this.bossIndex = enemies.spawnAt(
        this.bossTypeIndex,
        sx,
        sz,
        (isFinale ? 1 : this.hpMult) * levelScale,
        false,
        spawnObstacles,
      );
      this.state = this.bossIndex === -1 ? 'done' : 'active';
      this.baseSpeed = ENEMY_TYPES[this.bossTypeIndex]?.speed ?? 3;
      if (isFinale) {
        this.finalArrival = false;
        if (this.state === 'done') return null;
        this.finalFight.begin(this.baseSpeed);
      }
      return ENEMY_TYPES[this.bossTypeIndex]?.name ?? null;
    }

    if (this.state === 'done') {
      // Continuity beat: after a kill, a fresh (tougher) totem rises.
      if (this.respawnTimer > 0) {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0 && !this.startRun(obstacles, px, pz)) {
          this.respawnTimer = BOSS.respawnRetryS;
        }
      }
      return null;
    }

    const boss = enemies.pool[this.bossIndex];
    if (!boss || !boss.active) {
      this.state = 'done';
      return null;
    }

    if (this.bossTypeIndex === FINAL_BOSS_TYPE_INDEX) {
      // Silently skipping the fight would leave a Marshal that only walks, and
      // the omission would look like a balance choice instead of missing wiring.
      if (!this.effects) throw new Error('BossSystem.setEffects must run before the finale.');
      this.finalFight.update(dt, boss, px, pz, projectiles, enemies, obstacles, this.effects);
      this.tickFinalRig(dt, boss, enemies);
    } else if (this.bossTypeIndex === CRUSHER_KING_TYPE_INDEX) {
      this.updateCrusher(dt, boss, enemies, obstacles);
    } else {
      this.updateTesla(dt, boss, px, pz, projectiles, enemies);
    }
    return null;
  }

  /** Swaps the Marshal's instanced body for its animated part rig, and picks
   *  the clip from what the fight is actually doing: it walks while it moves,
   *  breathes while a telegraph roots it, and recoils once per phase change.
   *
   *  The rig loads async; until it is ready `update` reports false and the
   *  instanced body keeps drawing, so a slow model decode degrades to the old
   *  behaviour rather than to an invisible boss. */
  private tickFinalRig(
    dt: number,
    boss: { x: number; z: number; heading: number; scale: number; speed: number },
    enemies: EnemySystem,
  ): void {
    const modelKey = ENEMY_TYPES[FINAL_BOSS_TYPE_INDEX]?.modelKey;
    if (!modelKey) return;
    this.finalRig.load(modelKey);
    // Watched rather than plumbed through the effects hooks: the phase number
    // IS the event, and a second channel for it could disagree with the bar.
    const phase = this.finalFight.phaseNumber;
    if (phase !== this.riggedPhase) {
      if (this.riggedPhase !== 0) this.finalRig.playHit();
      this.riggedPhase = phase;
    }
    const drew = this.finalRig.update(
      dt,
      boss.x,
      boss.z,
      boss.heading,
      boss.scale,
      boss.speed > 0.01,
    );
    enemies.externallyDrawn = drew ? (enemies.pool[this.bossIndex] ?? null) : null;
  }

  /** Crusher King: telegraphed charges plus periodic scrapling reinforcements. */
  private updateCrusher(
    dt: number,
    /** `chargeState` drives the shared wind-up flare (see CHARGE). */
    boss: { x: number; z: number; speed: number; chargeState: number },
    enemies: EnemySystem,
    obstacles: Obstacle[],
  ): void {
    // Mid-lunge it plows a lane: bodies in its path get flung aside every
    // frame of the charge. This is what makes a late-run boss fight possible
    // at all — the player has to stand still to commit damage, and before this
    // the swarm simply refilled the space the boss was crossing.
    if (this.chargePhase === 'charging') {
      enemies.shoveAwayFrom(
        boss.x,
        boss.z,
        BOSS.chargeShoveRadius,
        BOSS.chargeShoveForce,
      );
    }

    this.chargeTimer -= dt;
    if (this.chargeTimer <= 0) {
      switch (this.chargePhase) {
        case 'cooldown':
          this.chargePhase = 'telegraph';
          this.chargeTimer = BOSS.crusher.chargeTelegraphS;
          boss.speed = 0.5; // Winds up: nearly stops before launching.
          // The wind-up used to be INVISIBLE — it only slowed the boss, which
          // reads as nothing on a body that was already slow. It then launched
          // at 22 against a player who moves 11, landing up to three 25-damage
          // hits through the 0.4s i-frame: ~75 HP with no tell. Borrowing the
          // charger's white-hot flare makes it the same readable contract as
          // the Rustbrute (playtest 2026-07-30: "me ha atropellado sin ver
          // dónde está").
          boss.chargeState = CHARGE.telegraph;
          break;
        case 'telegraph':
          this.chargePhase = 'charging';
          this.chargeTimer = BOSS.crusher.chargeDurationS;
          boss.speed = BOSS.crusher.chargeSpeed;
          boss.chargeState = CHARGE.lunging;
          // A new ram: the game bills the next connecting hit once against
          // this serial, however long the bodies stay overlapped.
          this.ramSerial++;
          break;
        case 'charging':
          this.chargePhase = 'cooldown';
          this.chargeTimer = BOSS.crusher.chargeCooldownS;
          boss.speed = this.baseSpeed;
          boss.chargeState = CHARGE.approach;
          break;
      }
    }

    this.minionTimer -= dt;
    if (this.minionTimer <= 0) {
      this.minionTimer = BOSS.crusher.minionIntervalS;
      for (let i = 0; i < BOSS.crusher.minionCount; i++) {
        const a = (i / BOSS.crusher.minionCount) * Math.PI * 2;
        enemies.spawnAt(
          0,
          boss.x + Math.cos(a) * 3,
          boss.z + Math.sin(a) * 3,
          1,
          false,
          obstacles,
        );
      }
    }
  }

  /** Tesla Titan: radial projectile bursts on top of its gunner behavior. */
  private updateTesla(
    dt: number,
    boss: { x: number; z: number },
    px: number,
    pz: number,
    projectiles: EnemyProjectiles,
    enemies: EnemySystem,
  ): void {
    this.burstTimer -= dt;
    if (this.burstTimer > 0) return;
    this.burstTimer = BOSS.tesla.burstCooldownS;
    // Same contract as the Crusher's lunge: the biggest thing on the field
    // shoves everything else aside. The Tesla holds its ground instead of
    // charging, so its discharge is what clears the ground around it.
    enemies.shoveAwayFrom(boss.x, boss.z, BOSS.burstShoveRadius, BOSS.burstShoveForce);
    // Aim one shot of the ring straight at the player so it always threatens.
    const offset = Math.atan2(px - boss.x, pz - boss.z);
    for (let i = 0; i < BOSS.tesla.burstProjectiles; i++) {
      const a = offset + (i / BOSS.tesla.burstProjectiles) * Math.PI * 2;
      projectiles.fire(
        boss.x,
        boss.z,
        Math.sin(a),
        Math.cos(a),
        BOSS.tesla.projectileSpeed,
        BOSS.tesla.projectileDamage,
        'tesla',
      );
    }
  }

  /** Totem world position while it waits to be activated, else null. Drives
   *  the HUD's off-screen indicator so players can always find it. */
  totemTarget(): THREE.Vector3 | null {
    return this.state === 'idle' ? this.totem.position : null;
  }

  appendObstacle(target: Obstacle[]): void {
    // Not during the finale's arrival: there is no gate standing there, only a
    // warning on the floor, and an invisible wall the player can walk into is
    // worse than no reservation at all. The spot was validated when the
    // arrival opened, and the spawn nudges clear of anything that drifted in.
    if (this.totem.visible && !this.finalArrival) target.push(this.totemObstacle);
  }

  /** The live boss body, or null when none is on the field. */
  body(enemies: EnemySystem): BossBody | null {
    if (this.state !== 'active') return null;
    const boss = enemies.pool[this.bossIndex];
    if (!boss || !boss.active) return null;
    this.bossBody.x = boss.x;
    this.bossBody.z = boss.z;
    // The body the PLAYER meets — see EnemyTypeDef.contactRadius. Using the
    // steering radius here is what put an invisible wall (and a hit) almost two
    // units in front of the Marshal's face.
    this.bossBody.radius = boss.contactRadius;
    this.bossBody.heading = boss.heading;
    this.bossBody.ramming =
      this.chargePhase === 'charging' && this.bossTypeIndex === CRUSHER_KING_TYPE_INDEX;
    this.bossBody.ramSerial = this.ramSerial;
    return this.bossBody;
  }

  /** Adds the live boss body to a PLAYER collision list. Deliberately separate
   *  from appendObstacle: that list also feeds enemy steering, where the boss
   *  already has its own wider entry (BOSS.clearRadius), and adding the body
   *  there would quietly change how the swarm paths around it. */
  appendBodyObstacle(target: Obstacle[], enemies: EnemySystem): void {
    const body = this.body(enemies);
    if (!body) return;
    this.bodyObstacle.x = body.x;
    this.bodyObstacle.z = body.z;
    this.bodyObstacle.radius = body.radius;
    target.push(this.bodyObstacle);
  }

  /** For the HUD boss bar; null when no boss is alive. */
  status(enemies: EnemySystem): BossStatus | null {
    if (this.state !== 'active') return null;
    const boss = enemies.pool[this.bossIndex];
    const type = ENEMY_TYPES[this.bossTypeIndex];
    if (!boss || !boss.active || !type) return null;
    if (this.bossTypeIndex === FINAL_BOSS_TYPE_INDEX) {
      return {
        name: type.name,
        hp: boss.hp,
        maxHp: boss.maxHp,
        phase: this.finalFight.phaseNumber,
        phaseCount: FINAL_BOSS.phaseThresholds.length + 1,
      };
    }
    return { name: type.name, hp: boss.hp, maxHp: boss.maxHp };
  }

  /** True when this pool index belongs to a boss type. */
  isBossType(typeIndex: number): boolean {
    return isBossTypeIndex(typeIndex);
  }

  isFinalBossType(typeIndex: number): boolean {
    return typeIndex === FINAL_BOSS_TYPE_INDEX;
  }

  /** Called by the game when a boss dies: schedules the next, tougher totem. */
  onBossDefeated(): void {
    this.state = 'done';
    const name = ENEMY_TYPES[this.bossTypeIndex]?.name;
    if (name) this.defeatedTypes.add(name);
    this.bossIndex = -1;
    this.bossesDefeated += 1;
    if (this.bossTypeIndex === FINAL_BOSS_TYPE_INDEX) {
      this.respawnTimer = 0;
      // A telegraph outliving its owner is a lie painted on the floor, and a
      // rig outliving it is a corpse standing up.
      this.finalFight.reset();
      this.finalRig.hide();
      this.riggedPhase = 0;
    } else {
      this.hpMult *= BOSS.respawnHpGrowth;
      this.respawnTimer = BOSS.respawnDelayS;
    }
  }

  /** Clears map-local actors while preserving run-wide boss history. */
  clearForMapTransition(): void {
    this.totem.visible = false;
    this.totemBody.visible = true;
    this.state = 'done';
    this.bossIndex = -1;
    this.respawnTimer = 0;
    this.summonTimer = 0;
    this.playerInSummonZone = false;
    this.finalArrival = false;
    this.finalFight.reset();
    this.finalRig.hide();
    this.riggedPhase = 0;
  }

  reset(): void {
    this.totem.visible = false;
    this.totemBody.visible = true;
    this.state = 'done';
    this.bossIndex = -1;
    this.hpMult = 1;
    this.respawnTimer = 0;
    this.bossesDefeated = 0;
    this.defeatedTypes.clear();
    this.finalArrival = false;
    this.finalFight.reset();
    this.finalRig.hide();
    this.riggedPhase = 0;
  }
}
