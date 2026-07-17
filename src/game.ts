import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  ACCOUNT,
  BOSS,
  CHEST,
  ELITES,
  ENEMY_TYPES,
  GOLD,
  MERCHANT,
  MODS,
  PICKUPS,
  PLAYER,
  RECORDING,
  RUN_DURATION_S,
  VISUAL,
  XP_ORBS,
  difficultyScalar,
  type WeaponId,
} from './config';
import { PlayerInput } from './input';
import { Player } from './player';
import { EnemySystem, type DeathInfo } from './enemies';
import { EnemyProjectiles } from './enemy-projectiles';
import { WeaponManager, type CombatCtx } from './weapons';
import { defaultStats, applyArmor, dodgeChance, rollHit, type PlayerStats } from './stats';
import { Progression, emptyWeaponLevels, rollUpgradeChoices, type CoreLevels, type Rarity, type UpgradeCard, type WeaponLevels } from './upgrades';
import { PickupSystem } from './pickups';
import { XpOrbSystem } from './xp-orbs';
import { GoldSystem } from './gold';
import { MerchantSystem } from './merchant';
import { MOD_REGISTRY, modPrice, rollModOfTier, rollShopStock, tierPrice, type ModCounts, type ModId } from './mods';
import { DamageNumbers } from './damage-numbers';
import { BossSystem } from './boss';
import { VoxelBurst } from './particles';
import { Hud, coinHtml } from './hud';
import {
  createRenderer,
  createScene,
  createCamera,
  updateCamera,
  placeRandomProps,
  clearProps,
  findClearSpot,
  type Obstacle,
} from './world';
import { CONTAINER_PROP } from './config';
import {
  applyWindowSettings,
  gamepadButtonLabel,
  keyLabel,
  loadSettings,
  saveSettings,
  type GameSettings,
} from './settings';

type GameState =
  | 'menu'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'levelup-intro'
  | 'levelup'
  | 'chest'
  | 'shop'
  | 'ended';

// Warmup frames rendered behind the loading screen after the world is built,
// so first-render shader compiles / GPU uploads happen HIDDEN — the reveal is
// then smooth instead of the old hitch when everything loaded on the first
// visible frame (user request 2026-07-12). A future load animation extends this.
const LOADING_WARMUP_FRAMES = 8;

const tmpProject = new THREE.Vector3();

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer | null = null;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly clock = new THREE.Clock();
  private readonly obstacles: Obstacle[];
  /** Meshes from the last placeRandomProps() call, so startRun() can clear
   *  them before generating a fresh layout (user request 2026-07-06: a
   *  different container/barrel layout every playthrough). */
  private propMeshes: THREE.Object3D[];

  private readonly input = new PlayerInput();
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
  private readonly goldSys: GoldSystem;
  private readonly merchant: MerchantSystem;
  /** Camera shake amplitude, decays exponentially (config.VISUAL.screenShake). */
  private shakeAmp = 0;
  private readonly hud: Hud;

  private settings: GameSettings = loadSettings();
  private stats: PlayerStats = defaultStats();
  private weaponLevels: WeaponLevels = emptyWeaponLevels();
  /** Installed cores (stat-card id → level) — the chassis sockets. */
  private coreLevels: CoreLevels = {};
  private state: GameState = 'menu';
  /** Loading handoff: the picked weapon, whether the world is built yet, and
   *  the warmup countdown (see LOADING_WARMUP_FRAMES). */
  private pendingWeapon: WeaponId | null = null;
  private runReady = false;
  private warmupFrames = 0;
  /** Frames to wait so the loading screen PAINTS before the world-build hitch
   *  runs (rAF fires before paint, so the first loading frame is just shown). */
  private loadingDelay = 0;
  private elapsedS = 0;
  /** Remaining seconds on temporary crate buffs. */
  private frenzyS = 0;
  private hasteS = 0;
  /** Chest rewards collected this run, for the ITEMS list on level-up. */
  private modCounts: ModCounts = {};
  /** Draft skips left this run (ACCOUNT.levelupDiscards, contract-raisable). */
  private discardsLeft = 0;
  /** Ticker for the stunned-enemy crackle (VISUAL.modVfx.stunBumper). */
  private stunSparkTimer = 0;
  /** Ticker for the denser player-state aura (VISUAL.modVfx.playerAura). */
  private playerAuraTimer = 0;
  /** In-run currency (icon-only; name TBD 2026-07-09). */
  private gold = 0;
  // Permanent-mod runtime state (all reset per run).
  private stunBumperCdS = 0;
  private detonatorKills = 0;
  private stompDistance = 0;
  private overloadS = 0;
  private phaseS = 0;
  private magnetronCycleS = MODS.magnetronHeart.cycleS;
  private magnetronPullS = 0;
  /** Guards Chain Relay from re-chaining off its own arcs. */
  private chaining = false;
  private prevPx = 0;
  private prevPz = 0;
  private regenTimer = 0;
  /** Level-up card screens still owed to the player (can be >1 when a
   *  single merged XP orb crosses several thresholds at once). */
  private pendingLevelUps = 0;
  private levelUpIntroRemainingS = 0;
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
    this.propMeshes = world.propMeshes;
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
    this.goldSys = new GoldSystem(this.scene);
    this.merchant = new MerchantSystem(this.scene);
    this.hud = new Hud(
      container,
      (weapon) => this.enterLoading(weapon),
      (card) => this.applyUpgrade(card),
      () => this.resumeRun(),
      () => this.quitToMenu(),
      (settings) => this.updateSettings(settings),
    );
    this.hud.syncSettings(this.settings);
    applyWindowSettings(this.settings);
    this.input.setBindings(this.settings.bindings);

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

  /** Play → weapon pick lands here: raise the loading screen, then the world
   *  is built and warmed on the next frames (tickLoading) so the reveal is
   *  smooth. Keeps the heavy setup OFF the click frame. */
  private enterLoading(startingWeapon: WeaponId): void {
    this.pendingWeapon = startingWeapon;
    this.runReady = false;
    this.loadingDelay = 1;
    this.state = 'loading';
    this.hud.showLoading();
    // UI art decodes behind the loading screen too — the reveal waits for
    // it so the first level-up/chest/shop never hitches (2026-07-13).
    this.uiAssetsReady = false;
    void this.hud.preloadUiAssets().then(() => {
      this.uiAssetsReady = true;
    });
  }

  private uiAssetsReady = false;

  /** Advances the loading handoff: build the world on the first loading frame,
   *  then count down warmup renders (behind the loading screen) before the
   *  reveal. */
  private tickLoading(): void {
    if (this.loadingDelay > 0) {
      this.loadingDelay--; // Let the loading screen paint before we build.
      return;
    }
    if (!this.runReady) {
      if (this.pendingWeapon) this.buildRun(this.pendingWeapon);
      this.runReady = true;
      this.warmupFrames = LOADING_WARMUP_FRAMES;
      return;
    }
    if (--this.warmupFrames <= 0 && this.uiAssetsReady) {
      this.hud.hideLoading();
      this.state = 'playing';
      this.clock.getDelta(); // Discard the time spent building + warming up.
    }
  }

  private buildRun(startingWeapon: WeaponId): void {
    this.resetRunWorld();
    this.stats = defaultStats();
    this.weaponLevels = emptyWeaponLevels();
    this.weaponLevels[startingWeapon] = 1;
    this.coreLevels = {};
    // Totem first: container/barrel placement below reads its position so
    // the layout never walls it off (user request 2026-07-06).
    this.boss.startRun();
    this.regenerateProps();
    this.elapsedS = 0;
    this.frenzyS = 0;
    this.hasteS = 0;
    this.modCounts = {};
    this.regenTimer = 0;
    this.pendingLevelUps = 0;
    this.shieldCur = 0;
    this.shieldRegen = 0;
    this.lifestealCooldown = 0;
    this.gold = GOLD.startingGold;
    this.discardsLeft = ACCOUNT.levelupDiscards;
    this.stunBumperCdS = 0;
    this.detonatorKills = 0;
    this.stompDistance = 0;
    this.overloadS = 0;
    this.phaseS = 0;
    this.magnetronCycleS = MODS.magnetronHeart.cycleS;
    this.magnetronPullS = 0;
    this.prevPx = this.player.position.x;
    this.prevPz = this.player.position.z;
    this.hud.updateGold(this.gold);
    this.hud.updateBuild(this.stats, this.weaponLevels, this.modCounts, this.coreLevels);
    // state → 'playing' and the clock reset happen at the reveal (tickLoading),
    // after the warmup frames render behind the loading screen.
  }

  private applyUpgrade(card: UpgradeCard): void {
    card.apply(this.stats, this.player, this.weaponLevels, this.coreLevels);
    this.hud.updateBuild(this.stats, this.weaponLevels, this.modCounts, this.coreLevels);
    // First copy = a socket just filled → stronger pop than a plain level-up.
    const installed = card.id.startsWith('weapon-')
      ? this.weaponLevels[card.id.slice('weapon-'.length) as WeaponId] === 1
      : (this.coreLevels[card.id] ?? 0) === 1;
    this.hud.flashBuildRow(card.id, installed);
    this.state = 'playing';
    this.clock.getDelta(); // Discard time spent choosing.
    this.maybeShowLevelUp(); // Chains the next card if more levels are owed.
  }

  private frame(): void {
    // Raw delta feeds the FPS instrument (the clamp would hide slow frames).
    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.05);
    this.input.poll();
    if (this.hud.tickBindingCapture(this.input)) {
      // A rebind capture is in progress: it swallows all input this frame.
    } else {
      if (this.input.consumePausePress()) this.handleEscape();
      this.hud.tickMenuNav(this.input);
    }
    if (this.state === 'loading') this.tickLoading();
    else if (this.state === 'playing') this.update(dt);
    updateCamera(this.camera, this.player.position);
    if (VISUAL.screenShake.enabled && this.shakeAmp > 0.005) {
      this.camera.position.x += (Math.random() - 0.5) * 2 * this.shakeAmp;
      this.camera.position.z += (Math.random() - 0.5) * 2 * this.shakeAmp;
      this.shakeAmp *= Math.max(0, 1 - VISUAL.screenShake.decayPerS * rawDt);
    }
    if (this.state === 'levelup-intro') this.tickLevelUpIntro(dt);
    this.damageNumbers.update(dt, this.camera);
    // The menu is a view OUTSIDE the game: skip the 3D render entirely so no
    // scene runs behind it (the opaque menu backdrop covers the canvas). Every
    // other state — including 'loading' warmup — renders normally.
    if (this.state !== 'menu') {
      if (this.composer) this.composer.render();
      else this.renderer.render(this.scene, this.camera);
    }

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
    this.hud.updateMerchantIndicator(false, 0, 0, 0, 0);
    this.hud.showInteractPrompt(null, this.interactLabel());
    this.hud.hideGold();
    this.hud.showSummonPrompt(false, this.interactLabel());
    this.hud.showMainMenu();
    this.clock.getDelta();
  }

  /** Auto-applied on every settings change — silent by design (a toast per
   *  slider tick would be noise). Window mode only re-applies when display
   *  settings actually changed (re-applying per tick blinked the screen). */
  private updateSettings(settings: GameSettings): void {
    const displayChanged =
      settings.displayMode !== this.settings.displayMode ||
      settings.resolution !== this.settings.resolution;
    this.settings = settings;
    saveSettings(settings);
    if (displayChanged) applyWindowSettings(settings);
    this.input.setBindings(settings.bindings);
    this.hud.syncSettings(settings);
  }

  /** Label for the Interact prompt: reflects the live binding and the
   *  device actually in hand (gamepad label once a pad is connected). */
  private interactLabel(): string {
    const bindings = this.settings.bindings;
    if (this.input.gamepadConnected() && bindings.gamepad.interact.length > 0) {
      return gamepadButtonLabel(bindings.gamepad.interact[0] ?? 0);
    }
    return keyLabel(bindings.keyboard.interact[0] ?? 'KeyE');
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
    this.goldSys.reset();
    this.merchant.reset();
    this.levelUpIntroRemainingS = 0;
    this.hud.hideLevelUpIntro();
  }

  /** Clears the previous container/barrel layout and rolls a fresh one,
   *  avoiding the boss totem (must be placed via boss.startRun() first) —
   *  user request 2026-07-06: different count/position every playthrough,
   *  not just every app launch. */
  private regenerateProps(): void {
    clearProps(this.scene, this.propMeshes);
    const totem = this.boss.totemTarget();
    const avoid = totem
      ? [{ x: totem.x, z: totem.z, radius: CONTAINER_PROP.totemClearance }]
      : [];
    const props = placeRandomProps(this.scene, avoid);
    this.obstacles.length = 0;
    this.obstacles.push(...props.obstacles);
    this.propMeshes = props.meshes;
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
    if (this.overloadS > 0) this.overloadS -= dt;
    if (this.phaseS > 0) this.phaseS -= dt;
    if (this.stunBumperCdS > 0) this.stunBumperCdS -= dt;

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
    this.tickStompers(px, pz);
    this.tickMagnetron(dt, px, pz);
    this.tickModAuras(dt);
    this.tickPlayerAura(dt);

    // Overload Trigger: elite/boss kills temporarily overcharge attack speed.
    const combatStats =
      this.overloadS > 0
        ? {
            ...this.stats,
            attackSpeed: this.stats.attackSpeed * MODS.overloadTrigger.attackSpeedMult,
          }
        : this.stats;
    const ctx: CombatCtx = {
      stats: combatStats,
      enemies: this.enemies,
      dealDamage: (index, base, hitColor) => this.dealDamage(index, base, hitColor),
      spawnBurst: (x, z, color, count) => this.burst.spawn(x, z, color, count),
    };
    this.weapons.update(dt, px, pz, this.weaponLevels, ctx);
    this.tickDots(dt);
    this.tickShield(dt);

    const summoned = this.boss.update(
      dt,
      px,
      pz,
      this.input.isActionDown('interact'),
      this.enemies,
      this.enemyShots,
    );
    if (summoned) {
      this.hud.banner(`${summoned.toUpperCase()} AWAKENS`);
      // Materialization beat: red danger eruption + white-hot core + ground
      // shock ring. This is the boss trailer moment, distinct from death bursts.
      const vfx = VISUAL.bossSummonVfx;
      const sx = this.boss.lastSummonAt.x;
      const sz = this.boss.lastSummonAt.z;
      this.burst.spawn(sx, sz, vfx.eruptionColor, vfx.eruptionCount);
      this.burst.spawn(sx, sz, vfx.hotColor, vfx.hotCount);
      this.spawnBurstRing(sx, sz, vfx.ringColor, vfx.ringCubes, vfx.ringRadius);
      this.shakeAmp = Math.max(this.shakeAmp, vfx.shakeAmp);
    }
    this.hud.showSummonPrompt(this.boss.playerInSummonZone, this.interactLabel());

    this.enemyShots.update(
      dt,
      px,
      pz,
      PLAYER.radius,
      (damage) => this.damagePlayer(damage),
      // Impact pop in the shot's own color — the hit on YOU is seen too.
      (x, z, color) => this.burst.spawn(x, z, color, 4),
    );

    this.orbs.update(dt, px, pz, this.stats.pickupRange, (value) => {
      this.pendingLevelUps += this.progression.grantXp(Math.round(value * this.stats.xpGain));
    });

    this.pickups.update(dt, px, pz, this.stats.luck);
    this.goldSys.update(dt, px, pz, this.stats.pickupRange, (value) => {
      this.gold += value;
      this.hud.updateGold(this.gold);
    });
    this.merchant.update(dt);
    this.scheduleMerchant(px, pz);
    this.resolveInteractions(px, pz);
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
    this.updateMerchantIndicator();

    if (this.player.isDead) {
      this.endRun('Overloaded');
      return;
    }
    this.maybeShowLevelUp();
  }

  private spawnBurstRing(x: number, z: number, color: number, count: number, radius: number): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      this.burst.spawn(x + Math.cos(a) * radius, z + Math.sin(a) * radius, color, 1);
    }
  }

  /** Level-ups wait politely: they only fire while actually playing, so a
   *  chest spin in progress finishes first and the pending level-ups follow.
   *  One card screen per level gained — applyUpgrade() calls back in here so
   *  a triple level-up queues three separate choices, never collapsed. */
  private maybeShowLevelUp(): void {
    if (this.pendingLevelUps <= 0 || this.state !== 'playing') return;
    this.pendingLevelUps--;
    if (VISUAL.levelUpIntro.enabled) {
      this.state = 'levelup-intro';
      this.levelUpIntroRemainingS = VISUAL.levelUpIntro.durationS;
      this.moveLevelUpIntro();
      const pos = this.levelUpIntroScreenPos();
      this.hud.showLevelUpIntro(pos.x, pos.y);
      return;
    }
    this.openLevelUpDraft();
  }

  private tickLevelUpIntro(dt: number): void {
    this.moveLevelUpIntro();
    this.levelUpIntroRemainingS -= dt;
    if (this.levelUpIntroRemainingS > 0) return;
    this.hud.hideLevelUpIntro();
    this.openLevelUpDraft();
  }

  private openLevelUpDraft(): void {
    this.state = 'levelup';
    this.hud.showLevelUp(
      rollUpgradeChoices(this.stats, this.weaponLevels, this.coreLevels),
      this.discardsLeft,
      () => this.discardUpgrade(),
    );
  }

  private levelUpIntroScreenPos(): { x: number; y: number } {
    const pos = this.worldToScreen(this.player.position.x, 2.25, this.player.position.z);
    return { x: pos.x, y: pos.y - VISUAL.levelUpIntro.screenOffsetY };
  }

  private moveLevelUpIntro(): void {
    const pos = this.levelUpIntroScreenPos();
    this.hud.moveLevelUpIntro(pos.x, pos.y);
  }

  /** Skip a draft without picking (max ACCOUNT.levelupDiscards per run) —
   *  the level is still consumed, only the choice is passed up. */
  private discardUpgrade(): void {
    this.discardsLeft--;
    this.hud.toast(
      this.discardsLeft > 0
        ? `Upgrade discarded (${this.discardsLeft} left)`
        : 'Upgrade discarded (none left)',
    );
    this.state = 'playing';
    this.clock.getDelta(); // Discard time spent choosing.
    this.maybeShowLevelUp();
  }

  /** Projects a world point to screen pixels (for prompts pinned to objects). */
  private worldToScreen(x: number, y: number, z: number): { x: number; y: number } {
    tmpProject.set(x, y, z).project(this.camera);
    return {
      x: (tmpProject.x * 0.5 + 0.5) * window.innerWidth,
      y: (-tmpProject.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  /** One Interact press resolves whichever interactable the player is
   *  standing at: the merchant takes priority over a chest (rarely both at
   *  once). Each frame this also drives the floating prompt above the
   *  nearest one (diegetic placement, 2026-07-10 — you look at the chest,
   *  not at the screen edge). */
  private resolveInteractions(px: number, pz: number): void {
    const pressed = this.input.consumeActionPress('interact');

    if (this.merchant.active) {
      const dSq = (this.merchant.x - px) ** 2 + (this.merchant.z - pz) ** 2;
      if (dSq <= MERCHANT.interactRadius * MERCHANT.interactRadius) {
        const p = this.worldToScreen(this.merchant.x, 3.6, this.merchant.z);
        this.hud.showInteractPrompt('to shop', this.interactLabel(), true, p.x, p.y);
        if (pressed) this.openShop();
        return;
      }
    }

    const chest = this.pickups.nearestOpenable(px, pz);
    if (chest) {
      const price = this.chestPrice(chest.tier);
      const affordable = this.gold >= price;
      const p = this.worldToScreen(chest.x, 2.1, chest.z);
      this.hud.showInteractPrompt(
        `to open · ${coinHtml(price)}`,
        this.interactLabel(),
        affordable,
        p.x,
        p.y,
      );
      if (pressed && affordable) this.openChest(chest.index, chest.tier, price, chest.x, chest.z);
      return;
    }

    this.hud.showInteractPrompt(null, this.interactLabel());
  }

  private chestPrice(tier: Rarity): number {
    return Math.round(tierPrice(tier, this.elapsedS / 60, 0) * CHEST.priceMult);
  }

  /** Charges gold, then plays the reel and applies a mod OF THE CHEST'S TIER. */
  private openChest(
    index: number,
    tier: Rarity,
    price: number,
    chestX = this.player.position.x,
    chestZ = this.player.position.z,
  ): void {
    this.gold -= price;
    this.hud.updateGold(this.gold);
    this.pickups.open(index);
    this.burst.spawn(chestX, chestZ, VISUAL.chestVfx.openColor, VISUAL.chestVfx.openCount);
    this.burst.spawn(chestX, chestZ, VISUAL.chestVfx.hotColor, VISUAL.chestVfx.hotCount);
    this.shakeAmp = Math.max(this.shakeAmp, VISUAL.chestVfx.shakeAmp);

    // Orb Siphon: the chest vacuums the map's XP before the reel spins.
    const siphonCopies = this.modCounts['orb-siphon'] ?? 0;
    if (siphonCopies > 0) {
      // Two-layer signal: the chest cracks open, then the player's magnet field
      // flares as the map-wide XP wave starts moving.
      this.burst.spawn(
        this.player.position.x,
        this.player.position.z,
        VISUAL.modVfx.orbSiphon.color,
        VISUAL.modVfx.orbSiphon.count,
      );
      this.burst.spawn(
        this.player.position.x,
        this.player.position.z,
        VISUAL.modVfx.orbSiphon.hotColor,
        VISUAL.modVfx.orbSiphon.hotCount,
      );
      this.shakeAmp = Math.max(this.shakeAmp, VISUAL.chestVfx.siphonShakeAmp);
      this.orbs.pullAll();
      const extraHaste = (siphonCopies - 1) * MODS.orbSiphon.hastePerExtraCopyS;
      if (extraHaste > 0) this.hasteS = Math.max(this.hasteS, extraHaste);
    }
    const mod: ModId = RECORDING.chestTesting.forceOrbSiphonReward ? 'orb-siphon' : rollModOfTier(tier);
    this.state = 'chest';
    this.hud.showInteractPrompt(null, this.interactLabel());
    this.hud.showChestSpin(
      mod,
      tier,
      // Landing: apply right away so the revealed stat sheet / items list
      // already show what the reward changed.
      () => this.applyMod(mod),
      // Continue clicked: resume the run.
      () => {
        this.state = 'playing';
        this.clock.getDelta(); // Discard time spent reading the reward.
        this.maybeShowLevelUp();
      },
    );
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
  private dealDamage(index: number, baseDamage: number, hitColor?: number): void {
    const enemy = this.enemies.pool[index];
    if (!enemy || !enemy.active) return;
    const hit = rollHit(baseDamage, this.stats);
    const amount = hit.amount * (this.frenzyS > 0 ? PICKUPS.frenzyDamageMultiplier : 1);
    // Hit spark in the weapon's icon accent — every landed hit is SEEN at
    // the victim (two-halves rule; crits pop bigger).
    if (hitColor !== undefined && VISUAL.hitSparks.enabled) {
      this.burst.spawn(
        enemy.x,
        enemy.z,
        hitColor,
        hit.crit ? VISUAL.hitSparks.critCount : VISUAL.hitSparks.count,
      );
    }
    this.damageNumbers.show(enemy.x, enemy.z, amount, hit.crit);
    // Chain Relay: crits arc lightning to nearby enemies (arcs never re-chain).
    if (hit.crit && !this.chaining && (this.modCounts['chain-relay'] ?? 0) > 0) {
      this.chaining = true;
      const copies = this.modCounts['chain-relay'] ?? 1;
      const jumps = MODS.chainRelay.jumps + (copies - 1) * MODS.chainRelay.jumpsPerCopy;
      const radiusSq = MODS.chainRelay.radius * MODS.chainRelay.radius;
      let arcs = 0;
      for (let i = 0; i < this.enemies.pool.length && arcs < jumps; i++) {
        const other = this.enemies.pool[i];
        if (!other || !other.active || i === index) continue;
        const dSq = (other.x - enemy.x) ** 2 + (other.z - enemy.z) ** 2;
        if (dSq <= radiusSq) {
          // The arc is SEEN: a lightning-white cube trail from source to
          // victim plus a signal-red pop on the victim (crit family —
          // two-halves rule).
          const vfx = VISUAL.modVfx.chainRelay;
          for (let t = 1; t <= vfx.trailCubes; t++) {
            const f = t / (vfx.trailCubes + 1);
            this.burst.spawn(
              enemy.x + (other.x - enemy.x) * f,
              enemy.z + (other.z - enemy.z) * f,
              vfx.color,
              1,
            );
          }
          this.burst.spawn(other.x, other.z, vfx.hitColor, vfx.hitCount);
          this.dealDamage(i, baseDamage * MODS.chainRelay.damageFraction);
          arcs++;
        }
      }
      this.chaining = false;
    }
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
      // Coolant Burst: the breaking charge flash-freezes the surroundings.
      const coolantCopies = this.modCounts['coolant-burst'] ?? 0;
      if (coolantCopies > 0) {
        const radius =
          MODS.coolantBurst.radius + (coolantCopies - 1) * MODS.coolantBurst.radiusPerCopy;
        // Two halves: frost nova with a white-cold core OFF the player…
        const vfx = VISUAL.modVfx.coolantBurst;
        const px = this.player.position.x;
        const pz = this.player.position.z;
        this.burst.spawn(px, pz, vfx.color, vfx.count);
        this.burst.spawn(px, pz, vfx.hotColor, vfx.hotCount);
        // …and an ice pop per victim (they also wear the frost tint).
        this.freezeNearby(radius, MODS.coolantBurst.freezeS * this.stats.duration, (x, z) => {
          this.burst.spawn(x, z, vfx.color, vfx.hitCount);
        });
      }
      if (attackerIndex >= 0 && this.stats.thorns > 0) {
        this.dealDamage(attackerIndex, this.stats.thorns);
      }
      return;
    }

    const amount = applyArmor(rawDamage, this.stats.armor);
    this.player.takeHit(amount);
    this.shakeAmp = Math.max(this.shakeAmp, VISUAL.screenShake.hitAmp);
    this.hud.flashHp();

    // Loose Bolts: taking a real hit scatters damaging bolts around you.
    const boltCopies = this.modCounts['loose-bolts'] ?? 0;
    if (boltCopies > 0) {
      const bolts = MODS.looseBolts.bolts + (boltCopies - 1) * MODS.looseBolts.boltsPerCopy;
      // Two halves: steel bolts scatter OFF the player (origin)…
      const vfx = VISUAL.modVfx.looseBolts;
      this.burst.spawn(this.player.position.x, this.player.position.z, vfx.boltColor, vfx.boltCount);
      // …and every victim pops an amber hit (destination).
      this.damageNearby(bolts, MODS.looseBolts.radius, MODS.looseBolts.damage, (x, z) => {
        this.burst.spawn(x, z, vfx.hitColor, vfx.hitCount);
      });
    }
    // Phase Chassis: the hit that lands phases you out for a beat.
    const phaseCopies = this.modCounts['phase-chassis'] ?? 0;
    if (phaseCopies > 0) {
      this.phaseS =
        MODS.phaseChassis.durationS + (phaseCopies - 1) * MODS.phaseChassis.durationPerCopyS;
      // Phasing out is SEEN: violet burst at the player (sustained shimmer
      // while intangible lives in tickModAuras).
      this.burst.spawn(
        this.player.position.x,
        this.player.position.z,
        VISUAL.modVfx.phaseChassis.color,
        VISUAL.modVfx.phaseChassis.count,
      );
    }

    if (attackerIndex >= 0 && this.stats.thorns > 0) {
      this.dealDamage(attackerIndex, this.stats.thorns);
    }
  }

  private onEnemyDeath(death: DeathInfo): void {
    this.progression.addKill();
    const isBoss = this.boss.isBossType(death.typeIndex);
    // Currency + XP drop offset in OPPOSITE directions from the death point so
    // the two pickups never spawn on top of each other (2026-07-09 user note).
    const dropA = Math.random() * Math.PI * 2;
    const ox = Math.cos(dropA) * GOLD.dropSeparation;
    const oz = Math.sin(dropA) * GOLD.dropSeparation;
    let goldValue = 0;
    if (isBoss) goldValue = GOLD.bossBonus;
    else if (death.elite) goldValue = GOLD.eliteBonus;
    else if (Math.random() < GOLD.dropChance) goldValue = GOLD.dropAmount;
    if (goldValue > 0) this.goldSys.spawn(death.x + ox, death.z + oz, goldValue);
    // Detonator Rig: every N kills, the next one blows up.
    const rigCopies = this.modCounts['detonator-rig'] ?? 0;
    if (rigCopies > 0) {
      const needed = Math.max(
        MODS.detonatorRig.killsFloor,
        MODS.detonatorRig.kills - (rigCopies - 1) * MODS.detonatorRig.killsReduxPerCopy,
      );
      this.detonatorKills++;
      if (this.detonatorKills >= needed) {
        this.detonatorKills = 0;
        this.explodeAt(
          death.x,
          death.z,
          MODS.detonatorRig.radius * this.stats.area,
          MODS.detonatorRig.damage,
          VISUAL.modVfx.detonatorRig.color,
          VISUAL.modVfx.detonatorRig.hotColor,
          VISUAL.modVfx.detonatorRig.hotCount,
        );
      }
    }
    // Overload Trigger: elite/boss kills overcharge attack speed.
    const overloadCopies = this.modCounts['overload-trigger'] ?? 0;
    if ((death.elite || isBoss) && overloadCopies > 0) {
      this.overloadS = Math.max(
        this.overloadS,
        MODS.overloadTrigger.durationS +
          (overloadCopies - 1) * MODS.overloadTrigger.durationPerCopyS,
      );
      // The overcharge lands ON YOU: signal-red burst at the player (the
      // sustained crackle while it lasts lives in tickModAuras).
      this.burst.spawn(
        this.player.position.x,
        this.player.position.z,
        VISUAL.modVfx.overloadTrigger.color,
        VISUAL.modVfx.overloadTrigger.count,
      );
    }
    this.burst.spawn(
      death.x,
      death.z,
      ENEMY_TYPES[death.typeIndex]?.color ?? 0xffb400,
      isBoss ? VISUAL.deathBurst.particlesPerBossKill : VISUAL.deathBurst.particlesPerKill,
    );
    this.orbs.spawn(death.x - ox, death.z - oz, death.xp * XP_ORBS.valueMult);
    if (death.elite) {
      const spot = findClearSpot(death.x, death.z, this.obstacles, BOSS.chestClearMargin);
      this.pickups.spawnAt(spot.x, spot.z, this.stats.luck);
      this.hud.toast('Elite down! It dropped a crate.');
    }
    if (this.boss.isBossType(death.typeIndex)) {
      // Boss kills reward and continue the run: loot shower now, and a
      // tougher totem rises shortly — the loop that later becomes new maps.
      const name = ENEMY_TYPES[death.typeIndex]?.name ?? 'The boss';
      this.hud.banner(`${name.toUpperCase()} DESTROYED`);
      this.shakeAmp = Math.max(this.shakeAmp, VISUAL.screenShake.bossKillAmp);
      for (let i = 0; i < BOSS.chestsOnKill; i++) {
        const a = (i / BOSS.chestsOnKill) * Math.PI * 2;
        // Chests spawn wherever the boss happened to die — unlike
        // containers/barrels/the totem, that position can't be known ahead
        // of time, so nudge each chest clear of anything it lands inside of
        // instead (user request 2026-07-06).
        const spot = findClearSpot(
          death.x + Math.cos(a) * 3,
          death.z + Math.sin(a) * 3,
          this.obstacles,
          BOSS.chestClearMargin,
        );
        this.pickups.spawnAt(spot.x, spot.z, this.stats.luck);
      }
      this.boss.onBossDefeated();
    }
  }

  /** Applies a mod from either door — chest reel or merchant purchase.
   *  Consumables fire instantly; permanents just stack (their effects hook
   *  into combat/movement/economy reading modCounts). */
  private applyMod(id: ModId): void {
    this.modCounts[id] = (this.modCounts[id] ?? 0) + 1;
    switch (id) {
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
      default:
        this.hud.toast(`${MOD_REGISTRY[id].label} installed!`);
    }
    this.hud.updateBuild(this.stats, this.weaponLevels, this.modCounts, this.coreLevels);
  }

  /** Circle-vs-circle contact between the swarm and the player on the XZ plane. */
  private resolvePlayerContact(): void {
    if (this.phaseS > 0) return; // Phase Chassis: enemies pass right through.
    const px = this.player.position.x;
    const pz = this.player.position.z;
    for (let i = 0; i < this.enemies.pool.length; i++) {
      const e = this.enemies.pool[i];
      if (!e || !e.active) continue;
      const reach = PLAYER.radius + e.radius;
      const dSq = (e.x - px) * (e.x - px) + (e.z - pz) * (e.z - pz);
      if (dSq <= reach * reach) {
        // Stun Bumper: a ready charge zaps the toucher instead of it hitting you.
        const bumperCopies = this.modCounts['stun-bumper'] ?? 0;
        if (bumperCopies > 0 && this.stunBumperCdS <= 0) {
          this.stunBumperCdS = Math.max(
            MODS.stunBumper.cooldownFloorS,
            MODS.stunBumper.cooldownS - (bumperCopies - 1) * MODS.stunBumper.cooldownReduxPerCopyS,
          );
          e.slowTimer = Math.max(e.slowTimer, MODS.stunBumper.stunS * this.stats.duration);
          e.slowFactor = 0;
          e.iceStun = false; // zap flavor: electric tint, not frost
          // The zap is SEEN: cyan spark burst at the stunned toucher (the
          // icon's accent — mod VFX coherence rule).
          this.burst.spawn(e.x, e.z, VISUAL.modVfx.stunBumper.color, VISUAL.modVfx.stunBumper.count);
          continue;
        }
        const base = this.boss.isBossType(e.typeIndex)
          ? BOSS.contactDamage
          : PLAYER.contactDamage * (e.elite ? ELITES.scaleMultiplier : 1);
        this.damagePlayer(base, i);
        // Kick Plate: shove whoever just hit you.
        const kickCopies = this.modCounts['kick-plate'] ?? 0;
        if (kickCopies > 0) {
          const force = MODS.kickPlate.force + (kickCopies - 1) * MODS.kickPlate.forcePerCopy;
          const d = Math.sqrt(dSq) || 1;
          e.kbX += ((e.x - px) / d) * force;
          e.kbZ += ((e.z - pz) / d) * force;
          // Amber impact burst + white-hot core on the shoved enemy (icon
          // accent + the white-hot-core recipe, reads on yellow bodies too).
          this.burst.spawn(e.x, e.z, VISUAL.modVfx.kickPlate.color, VISUAL.modVfx.kickPlate.count);
          this.burst.spawn(e.x, e.z, VISUAL.modVfx.kickPlate.hotColor, VISUAL.modVfx.kickPlate.hotCount);
        }
        if (this.player.invulnerable) break;
      }
    }
  }

  /** Damages up to `count` active enemies within `radius` of the player.
   *  `onHit` fires per victim at its position — the VFX hook for marking
   *  WHO got hit (two-halves rule, 2026-07-11). */
  private damageNearby(
    count: number,
    radius: number,
    damage: number,
    onHit?: (x: number, z: number) => void,
  ): void {
    const px = this.player.position.x;
    const pz = this.player.position.z;
    const rSq = radius * radius;
    let hits = 0;
    for (let i = 0; i < this.enemies.pool.length && hits < count; i++) {
      const e = this.enemies.pool[i];
      if (!e || !e.active) continue;
      if ((e.x - px) ** 2 + (e.z - pz) ** 2 <= rSq) {
        onHit?.(e.x, e.z);
        this.dealDamage(i, damage);
        hits++;
      }
    }
  }

  /** Full stop (slowFactor 0) for every enemy within `radius` of the player.
   *  Frost-flavored: victims wear the FROST tint, and `onHit` fires per
   *  victim for impact VFX (two-halves rule). */
  private freezeNearby(
    radius: number,
    seconds: number,
    onHit?: (x: number, z: number) => void,
  ): void {
    const px = this.player.position.x;
    const pz = this.player.position.z;
    const rSq = radius * radius;
    for (const e of this.enemies.pool) {
      if (!e.active) continue;
      if ((e.x - px) ** 2 + (e.z - pz) ** 2 <= rSq) {
        e.slowTimer = Math.max(e.slowTimer, seconds);
        e.slowFactor = 0;
        e.iceStun = true;
        onHit?.(e.x, e.z);
      }
    }
  }

  /** AoE damage burst with a particle pop (Detonator Rig, novas). Blast
   *  color + hot-core accent per owner (icon coherence rule). */
  private explodeAt(
    x: number,
    z: number,
    radius: number,
    damage: number,
    color = 0xffb400,
    hotColor?: number,
    hotCount = 0,
  ): void {
    this.burst.spawn(x, z, color, VISUAL.deathBurst.particlesPerKill * 2);
    if (hotColor !== undefined && hotCount > 0) this.burst.spawn(x, z, hotColor, hotCount);
    const rSq = radius * radius;
    for (let i = 0; i < this.enemies.pool.length; i++) {
      const e = this.enemies.pool[i];
      if (!e || !e.active) continue;
      if ((e.x - x) ** 2 + (e.z - z) ** 2 <= rSq) this.dealDamage(i, damage);
    }
  }

  /** Piston Stompers: distance-based step counter → periodic ground slam. */
  /** Sustained state auras (two-halves rule): continuous crackle on every
   *  FULL-stopped enemy (zap cyan / frost ice by flavor) and on the player
   *  while overcharged (red) or phased out (violet) — active states stay
   *  readable for their whole duration. */
  private tickModAuras(dt: number): void {
    this.stunSparkTimer -= dt;
    if (this.stunSparkTimer > 0) return;
    const stun = VISUAL.modVfx.stunBumper;
    this.stunSparkTimer = stun.sparkIntervalS;
    if ((this.modCounts['stun-bumper'] ?? 0) > 0 || (this.modCounts['coolant-burst'] ?? 0) > 0) {
      for (let i = 0; i < this.enemies.pool.length; i++) {
        const e = this.enemies.pool[i];
        if (e && e.active && e.slowTimer > 0 && e.slowFactor === 0) {
          this.burst.spawn(
            e.x,
            e.z,
            e.iceStun ? VISUAL.modVfx.coolantBurst.color : stun.color,
            stun.sparksPerTick,
          );
        }
      }
    }
  }

  /** Denser pulse on the PLAYER while a mod state is active on them. */
  private tickPlayerAura(dt: number): void {
    if (this.overloadS <= 0 && this.phaseS <= 0 && this.magnetronPullS <= 0) return;
    this.playerAuraTimer -= dt;
    if (this.playerAuraTimer > 0) return;
    const aura = VISUAL.modVfx.playerAura;
    this.playerAuraTimer = aura.sparkIntervalS;
    const px = this.player.position.x;
    const pz = this.player.position.z;
    if (this.overloadS > 0) {
      this.burst.spawn(px, pz, VISUAL.modVfx.overloadTrigger.color, aura.sparksPerTick);
    }
    if (this.phaseS > 0) {
      this.burst.spawn(px, pz, VISUAL.modVfx.phaseChassis.color, aura.sparksPerTick);
    }
    if (this.magnetronPullS > 0) {
      // The vacuum's origin: gold crackle on YOU while the horde is dragged.
      this.burst.spawn(px, pz, VISUAL.modVfx.magnetronHeart.color, aura.sparksPerTick);
    }
  }

  private tickStompers(px: number, pz: number): void {
    const moved = Math.hypot(px - this.prevPx, pz - this.prevPz);
    this.prevPx = px;
    this.prevPz = pz;
    const copies = this.modCounts['piston-stompers'] ?? 0;
    if (copies <= 0) return;
    this.stompDistance += moved;
    const steps = Math.max(
      MODS.pistonStompers.stepsFloor,
      MODS.pistonStompers.steps - (copies - 1) * MODS.pistonStompers.stepsReduxPerCopy,
    );
    const triggerDist = steps * MODS.pistonStompers.strideU;
    if (this.stompDistance >= triggerDist) {
      this.stompDistance -= triggerDist;
      const damage = MODS.pistonStompers.damage * this.stats.moveSpeed;
      const radius = MODS.pistonStompers.radius * this.stats.area;
      // Shockwave RING at the damage edge — the only ring-shaped effect,
      // and it shows the real AoE (de-collided from Kick's amber point pop).
      const vfx = VISUAL.modVfx.pistonStompers;
      for (let i = 0; i < vfx.ringCubes; i++) {
        const a = (i / vfx.ringCubes) * Math.PI * 2;
        this.burst.spawn(px + Math.cos(a) * radius, pz + Math.sin(a) * radius, vfx.color, 1);
      }
      const rSq = radius ** 2;
      for (let i = 0; i < this.enemies.pool.length; i++) {
        const e = this.enemies.pool[i];
        if (!e || !e.active) continue;
        if ((e.x - px) ** 2 + (e.z - pz) ** 2 <= rSq) this.dealDamage(i, damage);
      }
    }
  }

  /** Magnetron Heart: cyclical full-horde drag, then a nova paid per enemy. */
  private tickMagnetron(dt: number, px: number, pz: number): void {
    const copies = this.modCounts['magnetron-heart'] ?? 0;
    if (copies <= 0) return;
    if (this.magnetronPullS > 0) {
      this.magnetronPullS -= dt;
      for (const e of this.enemies.pool) {
        if (!e.active) continue;
        const d = Math.hypot(px - e.x, pz - e.z) || 1;
        e.kbX = ((px - e.x) / d) * MODS.magnetronHeart.pullForce;
        e.kbZ = ((pz - e.z) / d) * MODS.magnetronHeart.pullForce;
      }
      if (this.magnetronPullS <= 0) {
        const rSq = MODS.magnetronHeart.novaRadius ** 2;
        let dragged = 0;
        for (const e of this.enemies.pool) {
          if (e.active && (e.x - px) ** 2 + (e.z - pz) ** 2 <= rSq) dragged++;
        }
        if (dragged > 0) {
          const perEnemy =
            MODS.magnetronHeart.damagePerEnemy +
            (copies - 1) * MODS.magnetronHeart.damagePerEnemyPerCopy;
          this.shakeAmp = Math.max(this.shakeAmp, VISUAL.screenShake.hitAmp);
          // GOLD nova + red core — the legendary's icon colors (the old
          // blue predated the icon↔VFX coherence rule).
          const vfx = VISUAL.modVfx.magnetronHeart;
          this.burst.spawn(px, pz, vfx.color, VISUAL.deathBurst.particlesPerBossKill);
          this.explodeAt(
            px,
            pz,
            MODS.magnetronHeart.novaRadius,
            dragged * perEnemy,
            vfx.color,
            vfx.hotColor,
            vfx.hotCount,
          );
        }
      }
      return;
    }
    this.magnetronCycleS -= dt;
    if (this.magnetronCycleS <= 0) {
      this.magnetronPullS = MODS.magnetronHeart.pullS;
      this.magnetronCycleS = Math.max(
        MODS.magnetronHeart.cycleFloorS,
        MODS.magnetronHeart.cycleS - (copies - 1) * MODS.magnetronHeart.cycleReduxPerCopyS,
      );
      this.hud.toast('Magnetron Heart charges up!');
    }
  }

  /** Drives the scrapper's arrival and departure (opening the shop is now an
   *  explicit E interaction, handled in resolveInteractions). */
  private scheduleMerchant(px: number, pz: number): void {
    const whistle = (this.modCounts['foremans-whistle'] ?? 0) > 0;
    if (!this.merchant.active) {
      if (this.elapsedS >= this.merchant.nextVisitS) {
        const angle = Math.random() * Math.PI * 2;
        const dist = MERCHANT.distMin + Math.random() * (MERCHANT.distMax - MERCHANT.distMin);
        const spot = findClearSpot(
          px + Math.cos(angle) * dist,
          pz + Math.sin(angle) * dist,
          this.obstacles,
          BOSS.chestClearMargin,
        );
        const stock = rollShopStock(this.stats.luck, MERCHANT.stock + (whistle ? 1 : 0));
        this.merchant.arrive(spot.x, spot.z, stock, this.elapsedS);
        this.hud.banner('THE SCRAPPER HAS ARRIVED');
        // Arrival beat: warm trade burst at the vendor's real location, so the
        // GIF reads "go here" before the shop UI ever opens.
        const vfx = VISUAL.merchantVfx;
        this.burst.spawn(spot.x, spot.z, vfx.arrivalColor, vfx.arrivalCount);
        this.burst.spawn(spot.x, spot.z, vfx.hotColor, vfx.hotCount);
        this.spawnBurstRing(spot.x, spot.z, vfx.ringColor, vfx.ringCubes, vfx.ringRadius);
        this.shakeAmp = Math.max(this.shakeAmp, vfx.shakeAmp);
        // Foreman's Whistle: the toot that summoned him — brass puff at you.
        if (whistle) {
          this.burst.spawn(
            this.player.position.x,
            this.player.position.z,
            VISUAL.modVfx.foremansWhistle.color,
            VISUAL.modVfx.foremansWhistle.count,
          );
        }
      }
      return;
    }
    if (this.elapsedS >= this.merchant.leaveAtS) {
      this.merchant.depart(this.elapsedS, whistle ? 0.5 : 1);
      this.hud.toast('The scrapper packed up and left.');
    }
  }

  private openShop(): void {
    this.state = 'shop';
    this.hud.showInteractPrompt(null, this.interactLabel());
    this.renderShop();
  }

  /** (Re)draws the shop — called again after every purchase so prices and
   *  afford-states stay current. */
  private renderShop(): void {
    const whistleCopies = this.modCounts['foremans-whistle'] ?? 0;
    const discount = Math.min(
      MODS.foremansWhistle.discountCap,
      Math.max(0, whistleCopies - 1) * MODS.foremansWhistle.discountPerExtraCopy,
    );
    const entries = this.merchant.stock.map((id) => ({
      id,
      price: modPrice(id, this.elapsedS / 60, discount),
    }));
    this.hud.showShop(
      entries,
      this.gold,
      (index) => {
        const entry = entries[index];
        if (!entry || this.gold < entry.price) return;
        this.gold -= entry.price;
        this.hud.updateGold(this.gold);
        this.merchant.stock.splice(index, 1);
        this.applyMod(entry.id);
        // Refresh the RIG so the bought mod shows, then flash its tile.
        this.hud.updateBuild(this.stats, this.weaponLevels, this.modCounts, this.coreLevels);
        this.hud.flashBuildRow(entry.id);
        this.renderShop();
      },
      () => {
        this.state = 'playing';
        this.clock.getDelta(); // Discard time spent shopping.
      },
      { copies: whistleCopies, discount },
    );
  }

  /** Off-screen arrow toward the visiting merchant, with his countdown. */
  private updateMerchantIndicator(): void {
    if (!this.merchant.active) {
      this.hud.updateMerchantIndicator(false, 0, 0, 0, 0);
      return;
    }
    const wx = this.merchant.x - this.player.position.x;
    const wz = this.merchant.z - this.player.position.z;
    const len = Math.hypot(wx, wz);
    if (len < 24) {
      this.hud.updateMerchantIndicator(false, 0, 0, 0, 0);
      return;
    }
    const dx = wx / len;
    const dy = wz / len;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const t = Math.min(
      (w / 2 - 70) / Math.max(Math.abs(dx), 0.0001),
      (h / 2 - 110) / Math.max(Math.abs(dy), 0.0001),
    );
    this.hud.updateMerchantIndicator(
      true,
      w / 2 + dx * t,
      h / 2 + dy * t,
      Math.atan2(dy, dx) + Math.PI / 2,
      this.merchant.remainingS(this.elapsedS),
    );
  }

  private endRun(title: string): void {
    this.state = 'ended';
    this.hud.updateTotemIndicator(false, 0, 0, 0);
    this.hud.updateMerchantIndicator(false, 0, 0, 0, 0);
    this.hud.showInteractPrompt(null, this.interactLabel());
    this.hud.showEnd(
      title,
      this.progression.level,
      this.progression.kills,
      this.elapsedS,
      this.boss.bossesDefeated,
    );
  }
}
