import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  BOSS,
  ELITES,
  ENEMY_TYPES,
  PICKUPS,
  PLAYER,
  RUN_DURATION_S,
  VISUAL,
  difficultyScalar,
  type WeaponId,
} from './config';
import { KeyboardInput } from './input';
import { Player } from './player';
import { EnemySystem, type DeathInfo } from './enemies';
import { EnemyProjectiles } from './enemy-projectiles';
import { WeaponManager, type CombatCtx } from './weapons';
import { defaultStats, applyArmor, dodgeChance, rollHit, type PlayerStats } from './stats';
import { Progression, emptyWeaponLevels, rollUpgradeChoices, type UpgradeCard, type WeaponLevels } from './upgrades';
import { PickupSystem, type PickupReward } from './pickups';
import { XpOrbSystem } from './xp-orbs';
import { DamageNumbers } from './damage-numbers';
import { BossSystem } from './boss';
import { VoxelBurst } from './particles';
import { Hud } from './hud';
import { createRenderer, createScene, createCamera, updateCamera, type Obstacle } from './world';
import { applyWindowSettings, loadSettings, saveSettings, type GameSettings } from './settings';

type GameState = 'menu' | 'playing' | 'paused' | 'levelup' | 'chest' | 'ended';

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer | null = null;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly clock = new THREE.Clock();
  private readonly obstacles: Obstacle[];

  private readonly input = new KeyboardInput();
  private readonly player: Player;
  private readonly enemies: EnemySystem;
  private readonly enemyShots: EnemyProjectiles;
  private readonly weapons: WeaponManager;
  private readonly progression = new Progression();
  private readonly pickups: PickupSystem;
  private readonly orbs: XpOrbSystem;
  private readonly damageNumbers: DamageNumbers;
  private readonly boss: BossSystem;
  private readonly burst: VoxelBurst;
  /** Camera shake amplitude, decays exponentially (config.VISUAL.screenShake). */
  private shakeAmp = 0;
  private readonly hud: Hud;

  private settings: GameSettings = loadSettings();
  private stats: PlayerStats = defaultStats();
  private weaponLevels: WeaponLevels = emptyWeaponLevels();
  private state: GameState = 'menu';
  private elapsedS = 0;
  /** Remaining seconds on temporary crate buffs. */
  private frenzyS = 0;
  private hasteS = 0;
  private regenTimer = 0;
  /** Level-up card screens still owed to the player (can be >1 when a
   *  single merged XP orb crosses several thresholds at once). */
  private pendingLevelUps = 0;
  private lifestealCooldown = 0;
  /** Shield charges currently up, and the regen accumulator for the next one. */
  private shieldCur = 0;
  private shieldRegen = 0;
  // FPS instrument (config.VISUAL.showFps).
  private fpsFrames = 0;
  private fpsTime = 0;

  constructor(container: HTMLElement) {
    this.renderer = createRenderer(container);
    const world = createScene();
    this.scene = world.scene;
    this.obstacles = world.obstacles;
    this.camera = createCamera();
    if (VISUAL.bloom.enabled || VISUAL.vignette.enabled) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      if (VISUAL.bloom.enabled) {
        this.composer.addPass(
          new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            VISUAL.bloom.strength,
            VISUAL.bloom.radius,
            VISUAL.bloom.threshold,
          ),
        );
      }
      if (VISUAL.vignette.enabled) {
        this.composer.addPass(
          new ShaderPass({
            uniforms: {
              tDiffuse: { value: null },
              offset: { value: VISUAL.vignette.offset },
              darkness: { value: VISUAL.vignette.darkness },
            },
            vertexShader: `
              varying vec2 vUv;
              void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              }`,
            fragmentShader: `
              uniform sampler2D tDiffuse;
              uniform float offset;
              uniform float darkness;
              varying vec2 vUv;
              void main() {
                vec4 color = texture2D(tDiffuse, vUv);
                vec2 centered = (vUv - 0.5) * 2.0;
                // 1.0 at the center, dips toward (1.0 - darkness) at corners.
                float dim = 1.0 - darkness * smoothstep(offset - 0.6, offset, length(centered));
                gl_FragColor = vec4(color.rgb * dim, color.a);
              }`,
          }),
        );
      }
      // Converts back to sRGB for the screen; without it every pass after
      // bloom displays raw linear values and the whole frame goes dark.
      this.composer.addPass(new OutputPass());
    }
    this.player = new Player(this.scene);
    this.enemies = new EnemySystem(this.scene);
    this.enemyShots = new EnemyProjectiles(this.scene);
    this.weapons = new WeaponManager(this.scene);
    this.pickups = new PickupSystem(this.scene);
    this.orbs = new XpOrbSystem(this.scene);
    this.damageNumbers = new DamageNumbers(container);
    this.boss = new BossSystem(this.scene);
    this.burst = new VoxelBurst(this.scene);
    this.hud = new Hud(
      container,
      (weapon) => this.startRun(weapon),
      (card) => this.applyUpgrade(card),
      () => this.resumeRun(),
      () => this.quitToMenu(),
      (settings) => this.updateSettings(settings),
    );
    this.hud.syncSettings(this.settings);
    applyWindowSettings(this.settings);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.composer?.setSize(window.innerWidth, window.innerHeight);
    });
    window.addEventListener('blur', () => this.pauseFromBlur());

    this.renderer.setAnimationLoop(() => this.frame());

    // Dev-only hook so automated smoke/performance tests can inspect state.
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>)['__voltswarm'] = this;
    }
  }

  private startRun(startingWeapon: WeaponId): void {
    this.resetRunWorld();
    this.stats = defaultStats();
    this.weaponLevels = emptyWeaponLevels();
    this.weaponLevels[startingWeapon] = 1;
    this.boss.startRun();
    this.elapsedS = 0;
    this.frenzyS = 0;
    this.hasteS = 0;
    this.regenTimer = 0;
    this.pendingLevelUps = 0;
    this.shieldCur = 0;
    this.shieldRegen = 0;
    this.lifestealCooldown = 0;
    this.state = 'playing';
    this.hud.updateBuild(this.stats, this.weaponLevels);
    this.clock.getDelta(); // Discard time spent in menus.
  }

  private applyUpgrade(card: UpgradeCard): void {
    card.apply(this.stats, this.player, this.weaponLevels);
    this.hud.updateBuild(this.stats, this.weaponLevels);
    this.state = 'playing';
    this.clock.getDelta(); // Discard time spent choosing.
    this.maybeShowLevelUp(); // Chains the next card if more levels are owed.
  }

  private frame(): void {
    // Raw delta feeds the FPS instrument (the clamp would hide slow frames).
    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.05);
    if (this.input.consumePress('Escape')) this.handleEscape();
    if (this.state === 'playing') this.update(dt);
    updateCamera(this.camera, this.player.position);
    if (VISUAL.screenShake.enabled && this.shakeAmp > 0.005) {
      this.camera.position.x += (Math.random() - 0.5) * 2 * this.shakeAmp;
      this.camera.position.z += (Math.random() - 0.5) * 2 * this.shakeAmp;
      this.shakeAmp *= Math.max(0, 1 - VISUAL.screenShake.decayPerS * rawDt);
    }
    this.damageNumbers.update(dt, this.camera);
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);

    if (VISUAL.showFps) {
      this.fpsFrames++;
      this.fpsTime += rawDt;
      if (this.fpsTime >= 0.5) {
        this.hud.updateFps(Math.round(this.fpsFrames / this.fpsTime));
        this.fpsFrames = 0;
        this.fpsTime = 0;
      }
    }
  }

  private handleEscape(): void {
    if (this.hud.isSettingsOpen()) {
      this.hud.closeSettings();
      return;
    }
    if (this.state === 'playing') {
      this.pauseRun();
      return;
    }
    if (this.state === 'paused') this.resumeRun();
  }

  private pauseFromBlur(): void {
    if (this.state === 'playing') this.pauseRun();
  }

  private pauseRun(): void {
    this.state = 'paused';
    this.hud.showPause(true);
  }

  private resumeRun(): void {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.hud.showPause(false);
    this.clock.getDelta(); // Discard time spent paused.
  }

  private quitToMenu(): void {
    this.resetRunWorld();
    this.state = 'menu';
    this.hud.showPause(false);
    this.hud.updateTotemIndicator(false, 0, 0, 0);
    this.hud.showSummonPrompt(false, BOSS.summonKeyLabel);
    this.hud.showMainMenu();
    this.clock.getDelta();
  }

  private updateSettings(settings: GameSettings): void {
    this.settings = settings;
    saveSettings(settings);
    this.hud.syncSettings(settings);
    this.hud.toast('Settings saved');
  }

  private resetRunWorld(): void {
    this.progression.reset();
    this.player.reset();
    this.enemies.reset();
    this.enemyShots.reset();
    this.weapons.reset();
    this.pickups.reset();
    this.orbs.reset();
    this.damageNumbers.reset();
    this.boss.reset();
    this.burst.reset();
  }

  private update(dt: number): void {
    this.elapsedS += dt;
    const remaining = RUN_DURATION_S - this.elapsedS;
    if (remaining <= 0) {
      this.endRun('You Survived');
      return;
    }

    if (this.frenzyS > 0) this.frenzyS -= dt;
    if (this.hasteS > 0) this.hasteS -= dt;
    if (this.lifestealCooldown > 0) this.lifestealCooldown -= dt;

    this.regenTimer += dt;
    if (this.regenTimer >= PLAYER.regenTickS) {
      this.regenTimer -= PLAYER.regenTickS;
      if (this.stats.regen > 0) {
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.stats.regen);
      }
    }

    const speedMult =
      this.stats.moveSpeed * (this.hasteS > 0 ? PICKUPS.hasteSpeedMultiplier : 1);
    this.player.update(dt, this.input, speedMult, this.obstacles);

    const px = this.player.position.x;
    const pz = this.player.position.z;
    const difficulty = difficultyScalar(this.elapsedS, this.stats.cursedDifficulty);

    this.enemies.update(dt, this.elapsedS, difficulty, px, pz, this.obstacles, this.enemyShots);

    const ctx: CombatCtx = {
      stats: this.stats,
      enemies: this.enemies,
      dealDamage: (index, base) => this.dealDamage(index, base),
    };
    this.weapons.update(dt, px, pz, this.weaponLevels, ctx);
    this.tickDots(dt);
    this.tickShield(dt);

    const summoned = this.boss.update(
      dt,
      px,
      pz,
      this.input.isDown(BOSS.summonKey),
      this.enemies,
      this.enemyShots,
    );
    if (summoned) this.hud.toast(`${summoned} awakens!`);
    this.hud.showSummonPrompt(this.boss.playerInSummonZone, BOSS.summonKeyLabel);

    this.enemyShots.update(dt, px, pz, PLAYER.radius, (damage) => {
      this.damagePlayer(damage);
    });

    this.orbs.update(dt, px, pz, this.stats.pickupRange, (value) => {
      this.pendingLevelUps += this.progression.grantXp(Math.round(value * this.stats.xpGain));
    });

    this.pickups.update(dt, px, pz, (reward) => this.openChest(reward));
    this.burst.update(dt);

    this.resolvePlayerContact();

    this.player.setShieldCharges(this.shieldCur);
    this.hud.updateBars(
      this.player.hp,
      this.player.maxHp,
      this.progression.xp,
      this.progression.xpToNext,
    );
    this.hud.updateTimer(remaining);
    this.hud.updateLevel(this.progression.level, this.progression.kills);
    this.hud.updateBoss(this.boss.status(this.enemies));
    this.updateTotemIndicator();

    if (this.player.isDead) {
      this.endRun('Overloaded');
      return;
    }
    this.maybeShowLevelUp();
  }

  /** Level-ups wait politely: they only fire while actually playing, so a
   *  chest spin in progress finishes first and the pending level-ups follow.
   *  One card screen per level gained — applyUpgrade() calls back in here so
   *  a triple level-up queues three separate choices, never collapsed. */
  private maybeShowLevelUp(): void {
    if (this.pendingLevelUps <= 0 || this.state !== 'playing') return;
    this.pendingLevelUps--;
    this.state = 'levelup';
    this.hud.showLevelUp(rollUpgradeChoices(this.stats, this.weaponLevels));
  }

  /** Pauses the run and plays the crate slot-machine before applying. */
  private openChest(reward: PickupReward): void {
    this.state = 'chest';
    this.hud.showChestSpin(reward, () => {
      this.applyChestReward(reward);
      this.hud.updateBuild(this.stats, this.weaponLevels);
      this.state = 'playing';
      this.clock.getDelta(); // Discard time spent watching the spin.
      this.maybeShowLevelUp();
    });
  }

  /** Points an edge-of-screen arrow at the totem whenever it is not in view —
   *  distance fog hides it long before the player gets close.
   *
   *  Direction comes from WORLD space, not projection: with the fixed
   *  isometric camera, world +X is screen-right and world +Z screen-down.
   *  Projecting through the camera flipped the arrow whenever the totem fell
   *  behind the camera plane (far south of the player). */
  private updateTotemIndicator(): void {
    const target = this.boss.totemTarget();
    if (!target) {
      this.hud.updateTotemIndicator(false, 0, 0, 0);
      return;
    }
    const wx = target.x - this.player.position.x;
    const wz = target.z - this.player.position.z;
    // Close enough to be on screen (and past the fog): hide the arrow.
    if (Math.hypot(wx, wz) < 24) {
      this.hud.updateTotemIndicator(false, 0, 0, 0);
      return;
    }
    const len = Math.hypot(wx, wz) || 1;
    const dx = wx / len;
    const dy = wz / len;
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Clamp onto the screen-edge rectangle with a margin.
    const t = Math.min(
      (w / 2 - 70) / Math.max(Math.abs(dx), 0.0001),
      (h / 2 - 70) / Math.max(Math.abs(dy), 0.0001),
    );
    const x = w / 2 + dx * t;
    const y = h / 2 + dy * t;
    this.hud.updateTotemIndicator(true, x, y, Math.atan2(dy, dx) + Math.PI / 2);
  }

  /** Single damage funnel: crit roll, frenzy buff, lifesteal, numbers, death rewards. */
  private dealDamage(index: number, baseDamage: number): void {
    const enemy = this.enemies.pool[index];
    if (!enemy || !enemy.active) return;
    const hit = rollHit(baseDamage, this.stats);
    const amount = hit.amount * (this.frenzyS > 0 ? PICKUPS.frenzyDamageMultiplier : 1);
    this.damageNumbers.show(enemy.x, enemy.z, amount, hit.crit);
    if (
      this.lifestealCooldown <= 0 &&
      this.stats.lifesteal > 0 &&
      Math.random() < this.stats.lifesteal / 100
    ) {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1);
      this.lifestealCooldown = PLAYER.lifestealCooldownS;
    }
    const death = this.enemies.damage(index, amount);
    if (death) this.onEnemyDeath(death);
  }

  /** Ticks active damage-over-time effects through the normal damage funnel. */
  private tickDots(dt: number): void {
    for (let i = 0; i < this.enemies.pool.length; i++) {
      const e = this.enemies.pool[i];
      if (!e || !e.active || e.dotTimer <= 0) continue;
      e.dotTimer -= dt;
      e.dotTick -= dt;
      if (e.dotTick <= 0) {
        e.dotTick = 0.5;
        this.dealDamage(i, e.dotDps * 0.5);
      }
      if (e.dotTimer <= 0) e.dotDps = 0;
    }
  }

  /** One shield charge regenerates every PLAYER.shieldRegenS seconds. */
  private tickShield(dt: number): void {
    const max = this.stats.shield;
    if (max <= 0 || this.shieldCur >= max) {
      this.shieldRegen = 0;
      return;
    }
    this.shieldRegen += dt;
    if (this.shieldRegen >= PLAYER.shieldRegenS) {
      this.shieldRegen = 0;
      this.shieldCur = Math.min(max, this.shieldCur + 1);
    }
  }

  /** Single intake funnel for player damage: evasion, armor, shield, thorns. */
  private damagePlayer(rawDamage: number, attackerIndex = -1): void {
    if (this.player.isDead || this.player.invulnerable) return;

    if (Math.random() < dodgeChance(this.stats.evasion)) {
      this.damageNumbers.show(this.player.position.x, this.player.position.z, 'MISS', false);
      this.player.takeHit(0); // Grace window so contact can't re-roll every frame.
      return;
    }

    // A shield charge blocks the entire hit (before armor even matters).
    if (this.shieldCur > 0) {
      this.shieldCur -= 1;
      this.damageNumbers.show(this.player.position.x, this.player.position.z, 'BLOCK', false);
      this.player.takeHit(0); // Invuln window, no damage.
      if (attackerIndex >= 0 && this.stats.thorns > 0) {
        this.dealDamage(attackerIndex, this.stats.thorns);
      }
      return;
    }

    const amount = applyArmor(rawDamage, this.stats.armor);
    this.player.takeHit(amount);
    this.shakeAmp = Math.max(this.shakeAmp, VISUAL.screenShake.hitAmp);

    if (attackerIndex >= 0 && this.stats.thorns > 0) {
      this.dealDamage(attackerIndex, this.stats.thorns);
    }
  }

  private onEnemyDeath(death: DeathInfo): void {
    this.progression.addKill();
    const isBoss = this.boss.isBossType(death.typeIndex);
    this.burst.spawn(
      death.x,
      death.z,
      ENEMY_TYPES[death.typeIndex]?.color ?? 0xffb400,
      isBoss ? VISUAL.deathBurst.particlesPerBossKill : VISUAL.deathBurst.particlesPerKill,
    );
    this.orbs.spawn(death.x, death.z, death.xp);
    if (death.elite) {
      this.pickups.spawnAt(death.x, death.z);
      this.hud.toast('Elite down! It dropped a crate.');
    }
    if (this.boss.isBossType(death.typeIndex)) {
      // Boss kills reward and continue the run: loot shower now, and a
      // tougher totem rises shortly — the loop that later becomes new maps.
      const name = ENEMY_TYPES[death.typeIndex]?.name ?? 'The boss';
      this.hud.toast(`${name} destroyed! A stronger totem will rise...`);
      this.shakeAmp = Math.max(this.shakeAmp, VISUAL.screenShake.bossKillAmp);
      for (let i = 0; i < BOSS.chestsOnKill; i++) {
        const a = (i / BOSS.chestsOnKill) * Math.PI * 2;
        this.pickups.spawnAt(death.x + Math.cos(a) * 3, death.z + Math.sin(a) * 3);
      }
      this.boss.onBossDefeated();
    }
  }

  /** Applies a crate reward (called after the slot-machine lands). */
  private applyChestReward(reward: PickupReward): void {
    switch (reward) {
      case 'repair': {
        const healed = Math.round(this.player.maxHp * PICKUPS.healFraction);
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + healed);
        this.hud.toast(`Repair Kit: +${healed} HP`);
        break;
      }
      case 'scrap-cache': {
        const xp = Math.ceil(this.progression.xpToNext * PICKUPS.xpCacheFraction);
        this.hud.toast(`Volt Cache: +${xp} XP`);
        this.pendingLevelUps += this.progression.grantXp(xp);
        break;
      }
      case 'frenzy':
        this.frenzyS = PICKUPS.frenzyDurationS * this.stats.duration;
        this.hud.toast(`Frenzy: x${PICKUPS.frenzyDamageMultiplier} damage for ${Math.round(this.frenzyS)}s`);
        break;
      case 'haste':
        this.hasteS = PICKUPS.hasteDurationS * this.stats.duration;
        this.hud.toast(`Overdrive: +50% speed for ${Math.round(this.hasteS)}s`);
        break;
      case 'luck':
        this.stats.luck += PICKUPS.luckPerChest;
        this.hud.toast(`Lucky Gear: +${PICKUPS.luckPerChest} Luck`);
        break;
      case 'area':
        this.stats.area += PICKUPS.areaPerChest;
        this.hud.toast(`Expansion Core: +${Math.round(PICKUPS.areaPerChest * 100)}% Area`);
        break;
      case 'cursed':
        this.stats.cursedDifficulty += PICKUPS.cursedDifficultyPerChest;
        this.stats.xpGain += PICKUPS.cursedXpPerChest;
        this.hud.toast('Cursed Core: harder waves, more XP');
        break;
    }
    this.hud.updateBuild(this.stats, this.weaponLevels);
  }

  /** Circle-vs-circle contact between the swarm and the player on the XZ plane. */
  private resolvePlayerContact(): void {
    const px = this.player.position.x;
    const pz = this.player.position.z;
    for (let i = 0; i < this.enemies.pool.length; i++) {
      const e = this.enemies.pool[i];
      if (!e || !e.active) continue;
      const reach = PLAYER.radius + e.radius;
      const dSq = (e.x - px) * (e.x - px) + (e.z - pz) * (e.z - pz);
      if (dSq <= reach * reach) {
        const base = this.boss.isBossType(e.typeIndex)
          ? BOSS.contactDamage
          : PLAYER.contactDamage * (e.elite ? ELITES.scaleMultiplier : 1);
        this.damagePlayer(base, i);
        if (this.player.invulnerable) break;
      }
    }
  }

  private endRun(title: string): void {
    this.state = 'ended';
    this.hud.updateTotemIndicator(false, 0, 0, 0);
    this.hud.showEnd(
      title,
      this.progression.level,
      this.progression.kills,
      this.elapsedS,
      this.boss.bossesDefeated,
    );
  }
}
