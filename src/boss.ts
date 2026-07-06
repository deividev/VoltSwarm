import * as THREE from 'three';
import { ARENA_HALF_SIZE, BOSS, BOSS_TYPE_INDEXES, ENEMY_TYPES } from './config';
import type { EnemySystem } from './enemies';
import type { EnemyProjectiles } from './enemy-projectiles';
import { litMaterial } from './toon';

// A totem spawns somewhere far away at run start. Touching it summons one
// random boss. The boss lives inside the enemy pool (so every weapon hits it);
// this system only drives its special attacks on top of the base behavior.

type BossState = 'idle' | 'summoning' | 'active' | 'done';

export interface BossStatus {
  name: string;
  hp: number;
  maxHp: number;
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
  // Run continuity: each defeated boss raises the next one's HP.
  private hpMult = 1;
  private respawnTimer = 0;
  /** Telegraph window between the summon key press and the boss appearing. */
  private summonTimer = 0;
  bossesDefeated = 0;

  constructor(scene: THREE.Scene) {
    this.totem = new THREE.Group();
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.8, 2.4, 6),
      litMaterial({ color: 0x232830 }),
    );
    pillar.position.y = 1.2;
    const skull = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.7, 0),
      new THREE.MeshBasicMaterial({ color: 0xff3355 }),
    );
    skull.position.y = 3;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 18, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xff3355,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    beam.position.y = 9;
    this.totem.add(pillar, skull, beam);
    this.totem.visible = false;
    scene.add(this.totem);
  }

  /** Places the totem for a new run and picks the boss it will summon. */
  startRun(): void {
    const angle = Math.random() * Math.PI * 2;
    const dist = THREE.MathUtils.lerp(BOSS.totemDistMin, BOSS.totemDistMax, Math.random());
    this.totem.position.set(
      THREE.MathUtils.clamp(Math.cos(angle) * dist, -ARENA_HALF_SIZE + 5, ARENA_HALF_SIZE - 5),
      0,
      THREE.MathUtils.clamp(Math.sin(angle) * dist, -ARENA_HALF_SIZE + 5, ARENA_HALF_SIZE - 5),
    );
    this.totem.visible = true;
    this.state = 'idle';
    this.bossIndex = -1;
    this.bossTypeIndex =
      BOSS_TYPE_INDEXES[Math.floor(Math.random() * BOSS_TYPE_INDEXES.length)] ?? 6;
    this.chargePhase = 'cooldown';
    this.chargeTimer = BOSS.crusher.chargeCooldownS;
    this.minionTimer = BOSS.crusher.minionIntervalS;
    this.burstTimer = BOSS.tesla.burstCooldownS;
  }

  /** True while the player stands in the summon zone of the idle totem. */
  playerInSummonZone = false;

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
  ): string | null {
    this.playerInSummonZone = false;
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
        this.summonTimer = BOSS.summonDelayS;
      }
      return null;
    }

    if (this.state === 'summoning') {
      this.totem.rotation.y += dt * 6;
      this.summonTimer -= dt;
      if (this.summonTimer > 0) return null;

      // Materialize at the totem, but never on top of the player: push the
      // spawn point away along the player→totem direction to a safe radius.
      let sx = this.totem.position.x;
      let sz = this.totem.position.z;
      const dx = sx - px;
      const dz = sz - pz;
      const dist = Math.hypot(dx, dz);
      const minDist = BOSS.spawnMinDistFromPlayer;
      if (dist < minDist) {
        const nx = dist > 0.001 ? dx / dist : 1;
        const nz = dist > 0.001 ? dz / dist : 0;
        sx = THREE.MathUtils.clamp(px + nx * minDist, -ARENA_HALF_SIZE + 2, ARENA_HALF_SIZE - 2);
        sz = THREE.MathUtils.clamp(pz + nz * minDist, -ARENA_HALF_SIZE + 2, ARENA_HALF_SIZE - 2);
      }
      this.totem.visible = false;
      this.bossIndex = enemies.spawnAt(this.bossTypeIndex, sx, sz, this.hpMult);
      this.state = this.bossIndex === -1 ? 'done' : 'active';
      this.baseSpeed = ENEMY_TYPES[this.bossTypeIndex]?.speed ?? 3;
      return ENEMY_TYPES[this.bossTypeIndex]?.name ?? null;
    }

    if (this.state === 'done') {
      // Continuity beat: after a kill, a fresh (tougher) totem rises.
      if (this.respawnTimer > 0) {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) this.startRun();
      }
      return null;
    }

    const boss = enemies.pool[this.bossIndex];
    if (!boss || !boss.active) {
      this.state = 'done';
      return null;
    }

    if (this.bossTypeIndex === BOSS_TYPE_INDEXES[0]) {
      this.updateCrusher(dt, boss, enemies);
    } else {
      this.updateTesla(dt, boss, px, pz, projectiles);
    }
    return null;
  }

  /** Crusher King: telegraphed charges plus periodic scrapling reinforcements. */
  private updateCrusher(
    dt: number,
    boss: { x: number; z: number; speed: number },
    enemies: EnemySystem,
  ): void {
    this.chargeTimer -= dt;
    if (this.chargeTimer <= 0) {
      switch (this.chargePhase) {
        case 'cooldown':
          this.chargePhase = 'telegraph';
          this.chargeTimer = BOSS.crusher.chargeTelegraphS;
          boss.speed = 0.5; // Winds up: nearly stops before launching.
          break;
        case 'telegraph':
          this.chargePhase = 'charging';
          this.chargeTimer = BOSS.crusher.chargeDurationS;
          boss.speed = BOSS.crusher.chargeSpeed;
          break;
        case 'charging':
          this.chargePhase = 'cooldown';
          this.chargeTimer = BOSS.crusher.chargeCooldownS;
          boss.speed = this.baseSpeed;
          break;
      }
    }

    this.minionTimer -= dt;
    if (this.minionTimer <= 0) {
      this.minionTimer = BOSS.crusher.minionIntervalS;
      for (let i = 0; i < BOSS.crusher.minionCount; i++) {
        const a = (i / BOSS.crusher.minionCount) * Math.PI * 2;
        enemies.spawnAt(0, boss.x + Math.cos(a) * 3, boss.z + Math.sin(a) * 3);
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
  ): void {
    this.burstTimer -= dt;
    if (this.burstTimer > 0) return;
    this.burstTimer = BOSS.tesla.burstCooldownS;
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
      );
    }
  }

  /** Totem world position while it waits to be activated, else null. Drives
   *  the HUD's off-screen indicator so players can always find it. */
  totemTarget(): THREE.Vector3 | null {
    return this.state === 'idle' ? this.totem.position : null;
  }

  /** For the HUD boss bar; null when no boss is alive. */
  status(enemies: EnemySystem): BossStatus | null {
    if (this.state !== 'active') return null;
    const boss = enemies.pool[this.bossIndex];
    const type = ENEMY_TYPES[this.bossTypeIndex];
    if (!boss || !boss.active || !type) return null;
    return { name: type.name, hp: boss.hp, maxHp: boss.maxHp };
  }

  /** True when this pool index belongs to a boss type. */
  isBossType(typeIndex: number): boolean {
    return BOSS_TYPE_INDEXES.includes(typeIndex);
  }

  /** Called by the game when a boss dies: schedules the next, tougher totem. */
  onBossDefeated(): void {
    this.state = 'done';
    this.bossIndex = -1;
    this.bossesDefeated += 1;
    this.hpMult *= BOSS.respawnHpGrowth;
    this.respawnTimer = BOSS.respawnDelayS;
  }

  reset(): void {
    this.totem.visible = false;
    this.state = 'done';
    this.bossIndex = -1;
    this.hpMult = 1;
    this.respawnTimer = 0;
    this.bossesDefeated = 0;
  }
}
