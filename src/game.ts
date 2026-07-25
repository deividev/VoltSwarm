import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  PROFILE,
  AUDIO,
  BOSS,
  CHEST,
  DEV_TOOLS,
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
import { Progression, emptyWeaponBranches, emptyWeaponLevels, emptyWeaponPower, rollUpgradeChoices, weaponIdFromUpgradeCard, type CoreLevels, type Rarity, type UpgradeCard, type WeaponBranchLevels, type WeaponLevels, type WeaponPower } from './upgrades';
import { PickupSystem } from './pickups';
import { XpOrbSystem } from './xp-orbs';
import { GoldSystem } from './gold';
import { MerchantSystem } from './merchant';
import { MOD_REGISTRY, barrierCellCapacity, barrierCellRegenS, describeMod, isModAtCopyCap, modPrice, rollModOfTier, rollShopStock, tierPrice, type ModCounts, type ModId } from './mods';
import { DamageNumbers } from './damage-numbers';
import { BossSystem } from './boss';
import { AudioDirector, type AudioEventId } from './audio';
import { VoxelBurst } from './particles';

/** Per-weapon fire sound. Weapons without a dedicated asset yet fall back to
 *  the (silent-by-default) generic 'weapon-activation' via the ?? in the hook. */
const WEAPON_FIRE_SFX: Partial<Record<WeaponId, AudioEventId>> = {
  bolt: 'bolt-cannon-fire',
  pulse: 'pulse-fire',
  blades: 'blades-spin',
  // welder is NOT here: its weaponActivated fires PER TICK, which would
  // machine-gun a one-shot. The beam is a sustained loop (WEAPON_LOOP_SFX).
  press: 'press-slam',
  tire: 'tire-launch',
  oil: 'oil-drop',
  acid: 'acid-throw',
  turbine: 'turbine-launch',
  ricochet: 'ricochet-throw',
  dismantler: 'dismantler-swipe',
};

/** Continuous per-weapon audio loops (sustained hum while active), distinct
 *  from the one-shot fire SFX above. Only weapons that are ALWAYS-on while
 *  owned belong here — the loop starts on the spin-up edge and stops when the
 *  weapon deactivates. Extend for welder (per-frame beam) once refactored. */
const WEAPON_LOOP_SFX: Partial<Record<WeaponId, { id: AudioEventId; volume: number }>> = {
  // Per-weapon loop level: blades is a quiet ambient hum (user wanted it low),
  // welder is the present "epic beam" — they must NOT share one volume.
  blades: { id: 'blades-loop', volume: 0.22 },
  welder: { id: 'welder-beam', volume: 0.55 },
  // Acid starts SILENT — its volume is driven each frame by the player's
  // distance to the nearest pool (AcidWeapon.setWeaponLoopVolume), so it fades
  // in to the right level instead of blipping at full when a distant pool spawns.
  acid: { id: 'acid-loop', volume: 0 },
  // Turbine tornado travel-roar — same distance-driven pattern (starts silent).
  turbine: { id: 'turbine-loop', volume: 0 },
};

/** Per-weapon impact ticks — a hit sound that associates the strike with the
 *  weapon. Throttled by the audio cooldown so a swarm of contacts reads as a
 *  steady tick, not a machine-gun. Only weapons that benefit belong here. */
const WEAPON_HIT_SFX: Partial<Record<WeaponId, AudioEventId>> = {
  blades: 'blades-hit',
};
import { Hud, coinHtml } from './hud';
import {
  createRenderer,
  createScene,
  createCamera,
  updateCamera,
  placeRandomProps,
  clearProps,
  findRandomClearSpot,
  hasLineOfSight,
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
import { saveRunRecord, type RunMapRef, type RunOutcome } from './run-history';
import { recordRunInLifetime, saveProfile } from './profile';
import { settleContracts } from './contracts';

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

const SCRAPYARD_MAP: RunMapRef = {
  id: 'scrapyard',
  number: 1,
  title: 'Scrapyard',
};

/** The single difficulty that exists today. Stamped on every run record so a
 *  future selector does not leave this era's runs unlabelled — leaderboards
 *  that mix difficulties rank nothing, and a finished run cannot be relabelled. */
const DIFFICULTY_ID = 'standard';

const tmpProject = new THREE.Vector3();

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer | null = null;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly clock = new THREE.Clock();
  private readonly obstacles: Obstacle[];
  /** Static props plus currently active merchant/chests/totem. Reused every
   *  frame so every mover and every placement query sees the same world. */
  private readonly collisionObstacles: Obstacle[] = [];
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
  private readonly audio: AudioDirector;
  private benchmarkActive = false;
  private benchmarkRandom: (() => number) | null = null;
  private benchmarkOriginalRandom: (() => number) | null = null;
  private benchmarkSacrificeS = 0;
  private benchmarkKills = 0;
  private benchmarkXpPickups = 0;
  private benchmarkGoldPickups = 0;

  private settings: GameSettings = loadSettings();
  private stats: PlayerStats = defaultStats();
  private weaponLevels: WeaponLevels = emptyWeaponLevels();
  private weaponPower: WeaponPower = emptyWeaponPower();
  private weaponBranches: WeaponBranchLevels = emptyWeaponBranches();
  /** Actual enemy HP removed per weapon this run; overkill is excluded. */
  private weaponDamage: Record<WeaponId, number> = emptyWeaponLevels();
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
  /** The weapon this run was drafted with. Recorded on the run record because
   *  contracts ask questions like "finish runs with N different starting
   *  weapons", which weaponLevels alone cannot answer once others are picked up. */
  private startingWeapon: WeaponId | null = null;
  /** Per-run counters written onto the run record. Contract objectives ask
   *  about all four, and none can be reconstructed from a finished run. */
  private runDamageTaken = 0;
  private runGoldEarned = 0;
  private runChestsByTier: Record<string, number> = {};
  private runShopPurchases = 0;
  /** Remaining seconds on temporary crate buffs. */
  private frenzyS = 0;
  private hasteS = 0;
  /** Chest rewards collected this run, for the ITEMS list on level-up. */
  private modCounts: ModCounts = {};
  /** Draft skips left this run (PROFILE.levelupDiscards, contract-raisable). */
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
      () => this.playUiConfirm(),
    );
    this.audio = new AudioDirector(this.settings);
    void this.audio.preloadEnabled();
    if (DEV_TOOLS.auditionKeys) this.installAuditionKeys();
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
    const benchmarkMode = new URLSearchParams(window.location.search).has('audioBenchmark');
    if (import.meta.env.DEV || benchmarkMode) {
      (window as unknown as Record<string, unknown>)['__voltswarm'] = this;
      (window as unknown as Record<string, unknown>)['__voltswarmAudio'] = {
        diagnostics: () => this.audio.diagnostics(),
        gains: () => this.audio.debugBusGains(),
        burst: () => this.audio.diagnosticBurst(),
      };
    }
    if (benchmarkMode) {
      (window as unknown as Record<string, unknown>)['__voltswarmAudioBenchmark'] = {
        start: () => this.startAudioBenchmark(),
        snapshot: () => ({ enemies: this.enemies.activeCount, kills: this.benchmarkKills, xpPickups: this.benchmarkXpPickups, goldPickups: this.benchmarkGoldPickups, audio: this.audio.diagnostics() }),
        cleanup: () => { this.benchmarkActive = false; this.restoreBenchmarkRandom(); this.state = 'paused'; this.enemies.reset(); this.audio.reset(); return this.audio.diagnostics(); },
      };
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
      this.audio.setMenu(false);
      this.audio.setPaused(false);
      this.audio.stopLoop('menu-music-loop'); // menu theme hands over to the run bed
      this.audio.emit({ id: 'run-start' });
      this.audio.emit({ id: 'foundation-music', key: 'foundation-run-loop', loop: true, priority: 2, volume: AUDIO.music.runLoopVolume });
      this.clock.getDelta(); // Discard the time spent building + warming up.
    }
  }

  private buildRun(startingWeapon: WeaponId): void {
    this.resetRunWorld();
    this.startingWeapon = startingWeapon;
    this.runDamageTaken = 0;
    this.runGoldEarned = 0;
    this.runChestsByTier = {};
    this.runShopPurchases = 0;
    this.stats = defaultStats();
    this.weaponLevels = emptyWeaponLevels();
    this.weaponPower = emptyWeaponPower();
    this.weaponBranches = emptyWeaponBranches();
    this.weaponLevels[startingWeapon] = 1;
    this.weaponDamage = emptyWeaponLevels();
    this.coreLevels = {};
    // Totem first: container/barrel placement below reads its position so
    // the layout never walls it off (user request 2026-07-06).
    if (!this.boss.startRun()) throw new Error('Unable to place the boss totem inside the arena.');
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
    this.discardsLeft = PROFILE.levelupDiscards;
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
    this.hud.updateBuild(this.stats, this.weaponLevels, this.modCounts, this.coreLevels, this.weaponBranches);
    // state → 'playing' and the clock reset happen at the reveal (tickLoading),
    // after the warmup frames render behind the loading screen.
  }

  /** TEMP style-search audition: cycle the pinned candidate for an event and preview it. */
  private installAuditionKeys(): void {
    const map: Partial<Record<string, AudioEventId>> = {
      F2: 'ui-confirm', F3: 'levelup-intro', F4: 'levelup-open',
      F6: 'bolt-cannon-fire', F7: 'enemy-death', F8: 'chest-reveal', F9: 'chest-open',
    };
    // Deterministic default for RARE events only: pinned to candidate 1 so a
    // reward never plays a different sound each time. Frequent combat events
    // (bolt, enemy death) stay UNPINNED on purpose — their entries are
    // micro-variants of one sound, and rotating them prevents the exact-waveform
    // repetition that drills into the player's head on long runs.
    for (const id of Object.values(map)) {
      if (id && id !== 'bolt-cannon-fire' && id !== 'enemy-death') {
        this.audio.debugPinVariant(id, 0);
      }
    }
    window.addEventListener('keydown', (e) => {
      const id = map[e.code];
      if (!id) return;
      e.preventDefault();
      void this.audio.activateFromUserGesture().then(() => {
        const path = this.audio.debugCycleVariant(id);
        const name = path ? path.split('/').pop() : 'no candidates loaded';
        this.hud.toast(`${id}: ${name}`);
        this.audio.emit({ id, priority: 5 });
      });
    });
  }

  private playUiConfirm(): void {
    void this.audio.activateFromUserGesture().then(() => {
      this.audio.emit({ id: 'ui-confirm' });
      // Autoplay policy: the boot menu cannot start its theme until the first
      // user gesture — so the first menu click starts it. The keyed loop
      // dedupes repeats, and by the time this runs after a Play click the
      // state has already left 'menu', so runs never double-start it.
      if (this.state === 'menu') {
        this.audio.emit({ id: 'menu-music', key: 'menu-music-loop', loop: true, priority: 2, volume: AUDIO.music.menuLoopVolume });
      }
    });
  }

  /** Packaged benchmark-only deterministic swarm; never reachable in normal builds. */
  private startAudioBenchmark(): { scenario: string; seed: number; enemies: number; digest: string } {
    this.installBenchmarkRandom(AUDIO.benchmark.seed);
    this.buildRun('bolt');
    (Object.keys(this.weaponLevels) as WeaponId[]).forEach((id) => { this.weaponLevels[id] = 1; });
    this.weaponDamage = emptyWeaponLevels();
    const voltlingCount = AUDIO.benchmark.typeCounts[0] ?? 0;
    const sparkrunnerCount = AUDIO.benchmark.typeCounts[1] ?? 0;
    for (let index = 0; index < AUDIO.benchmark.enemyCount; index++) {
      const typeIndex = index < voltlingCount ? 0 : index < voltlingCount + sparkrunnerCount ? 1 : 2;
      const angle = (index * 2.399963229728653 + AUDIO.benchmark.seed) % (Math.PI * 2);
      const radius = AUDIO.benchmark.spawnRadius + (index % 8) * 1.4;
      const spawned = this.enemies.spawnAt(typeIndex, Math.cos(angle) * radius, Math.sin(angle) * radius, 1000);
      const enemy = this.enemies.pool[spawned];
      if (enemy) enemy.speed = 0;
    }
    this.hud.updateBuild(this.stats, this.weaponLevels, this.modCounts, this.coreLevels, this.weaponBranches);
    this.state = 'playing';
    this.audio.resetDiagnostics();
    this.benchmarkActive = true;
    this.benchmarkSacrificeS = 0;
    this.benchmarkKills = 0;
    this.benchmarkXpPickups = 0;
    this.benchmarkGoldPickups = 0;
    this.audio.setMenu(false);
    this.audio.setPaused(false);
    this.audio.emit({ id: 'foundation-music', key: 'foundation-run-loop', loop: true, priority: 2, volume: AUDIO.music.runLoopVolume });
    this.clock.getDelta();
    return { scenario: AUDIO.benchmark.scenario, seed: AUDIO.benchmark.seed, enemies: this.enemies.activeCount, digest: `${AUDIO.benchmark.seed}:${AUDIO.benchmark.typeCounts.join('-')}:${AUDIO.benchmark.sacrificeIntervalS}:${AUDIO.benchmark.sacrificeBatch}` };
  }

  private installBenchmarkRandom(seed: number): void {
    this.restoreBenchmarkRandom();
    let state = seed >>> 0;
    this.benchmarkOriginalRandom = Math.random;
    this.benchmarkRandom = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0x100000000; };
    Math.random = this.benchmarkRandom;
  }

  private restoreBenchmarkRandom(): void {
    if (this.benchmarkOriginalRandom) Math.random = this.benchmarkOriginalRandom;
    this.benchmarkOriginalRandom = null;
    this.benchmarkRandom = null;
  }

  private tickAudioBenchmark(dt: number): void {
    if (!this.benchmarkActive) return;
    this.benchmarkSacrificeS -= dt;
    if (this.benchmarkSacrificeS > 0) return;
    this.benchmarkSacrificeS = AUDIO.benchmark.sacrificeIntervalS;
    for (let i = 0; i < AUDIO.benchmark.sacrificeBatch; i++) {
      const angle = (this.benchmarkKills + i) * 1.7;
      const index = this.enemies.spawnAt(0, Math.cos(angle) * 4, Math.sin(angle) * 4);
      if (index !== -1) this.goldSys.spawn(Math.cos(angle) * 1.5, Math.sin(angle) * 1.5, GOLD.dropAmount);
    }
  }

  private applyUpgrade(card: UpgradeCard): void {
    card.apply(
      this.stats,
      this.player,
      this.weaponLevels,
      this.coreLevels,
      this.weaponPower,
      this.weaponBranches,
      this.modCounts,
      {
        addGold: (amount) => {
          this.gold += amount;
          this.runGoldEarned += amount;
          this.hud.updateGold(this.gold);
          this.audio.emit({ id: 'gold-pickup' });
        },
      },
    );
    this.hud.updateBuild(this.stats, this.weaponLevels, this.modCounts, this.coreLevels, this.weaponBranches);
    // First copy = a socket just filled → stronger pop than a plain level-up.
    const weaponId = weaponIdFromUpgradeCard(card.id);
    const installed = weaponId
      ? this.weaponLevels[weaponId] === 1
      : (this.coreLevels[card.id] ?? 0) === 1;
    this.hud.flashBuildRow(weaponId ? `weapon-${weaponId}` : card.id, installed);
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
    // Weapon hums (sfx loops) only belong to live play — silence them under any
    // modal overlay (pause, level-up, chest, shop, game over) so they don't
    // drone behind the UI. Single choke point; self-heals every frame.
    this.audio.setSfxLoopsSuspended(this.state !== 'playing');
    // Duck the run music under any in-game modal overlay — the same treatment
    // pause already gave it, now for level-up/chest/shop/game-over too. Menu and
    // loading keep their own music handling (setMenu), so they're excluded.
    this.audio.setPaused(
      this.state === 'paused' || this.state === 'levelup' || this.state === 'levelup-intro' ||
      this.state === 'chest' || this.state === 'shop' || this.state === 'ended',
    );
    if (this.state === 'loading') this.tickLoading();
    else if (this.state === 'playing') this.update(dt);
    updateCamera(this.camera, this.player.position);
    if (VISUAL.screenShake.enabled && this.shakeAmp > 0.005) {
      this.camera.position.x += (Math.random() - 0.5) * 2 * this.shakeAmp;
      this.camera.position.z += (Math.random() - 0.5) * 2 * this.shakeAmp;
      this.shakeAmp *= Math.max(0, 1 - VISUAL.screenShake.decayPerS * rawDt);
    }
    if (this.state === 'levelup-intro') this.tickLevelUpIntro(dt);
    this.damageNumbers.update(dt, this.camera, this.player.position.x, this.player.position.z);
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
    this.audio.emit({ id: 'pause' });
    this.audio.setPaused(true);
    this.hud.showPause(true);
  }

  private resumeRun(): void {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.audio.emit({ id: 'resume' });
    this.audio.setPaused(false);
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
    this.audio.reset();
    // reset() dropped every decoded buffer; re-warm during the menu so the next
    // run's first sounds fire frame-exact (rule: audio lands ON the action).
    void this.audio.preloadEnabled();
    this.audio.setMenu(true);
    this.audio.emit({ id: 'menu-enter' });
    this.audio.emit({ id: 'menu-music', key: 'menu-music-loop', loop: true, priority: 2, volume: AUDIO.music.menuLoopVolume });
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
    this.audio.setSettings(settings);
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

  private refreshCollisionObstacles(): Obstacle[] {
    this.collisionObstacles.length = 0;
    this.collisionObstacles.push(...this.obstacles);
    this.boss.appendObstacle(this.collisionObstacles);
    this.merchant.appendObstacle(this.collisionObstacles);
    this.pickups.appendObstacles(this.collisionObstacles);
    return this.collisionObstacles;
  }

  private update(dt: number): void {
    this.elapsedS += dt;
    this.tickAudioBenchmark(dt);
    const remaining = RUN_DURATION_S - this.elapsedS;
    if (remaining <= 0) {
      this.endRun('sector-cleared');
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
    const collisionObstacles = this.refreshCollisionObstacles();
    this.player.update(dt, this.input, speedMult, collisionObstacles);

    const px = this.player.position.x;
    const pz = this.player.position.z;
    // The player is the audio listener — drives distance attenuation of
    // world-positioned sounds (acid pool loop, acid drum, dismantler claw).
    this.audio.setListener(px, pz);
    const difficulty = difficultyScalar(this.elapsedS, this.stats.cursedDifficulty);

    this.enemies.update(
      dt,
      this.elapsedS,
      difficulty,
      px,
      pz,
      collisionObstacles,
      this.enemyShots,
    );
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
      weaponPower: this.weaponPower,
      weaponBranches: this.weaponBranches,
      obstacles: collisionObstacles,
      dealDamage: (index, base, hitColor, weaponId) =>
        this.dealDamage(index, base, hitColor, weaponId),
      spawnBurst: (x, z, color, count) => this.burst.spawn(x, z, color, count),
      weaponActivated: (id, x, z) => this.audio.emit({
        id: WEAPON_FIRE_SFX[id] ?? 'weapon-activation',
        key: `weapon-${id}`,
        priority: 1,
        // World-positioned fires (acid drum, dismantler claw) attenuate by
        // distance; player-centered fires pass no pos → full volume.
        pos: x !== undefined && z !== undefined ? { x, z } : undefined,
      }),
      startWeaponLoop: (id) => {
        const loop = WEAPON_LOOP_SFX[id];
        if (!loop) return;
        // High priority so the sustained loop survives sfx-cap eviction during
        // heavy combat; sfx bus so it obeys the SFX slider, not Music.
        this.audio.emit({
          id: loop.id,
          key: `weapon-loop-${id}`,
          loop: true,
          bus: 'sfx',
          priority: 5,
          volume: loop.volume,
        });
      },
      stopWeaponLoop: (id) => this.audio.stopLoop(`weapon-loop-${id}`),
      setWeaponLoopVolume: (id, volume) => this.audio.setLoopVolume(`weapon-loop-${id}`, volume),
      weaponHit: (id) => {
        const hitId = WEAPON_HIT_SFX[id];
        if (hitId) this.audio.emit({ id: hitId, key: `weapon-hit-${id}`, priority: 1 });
      },
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
      collisionObstacles,
    );
    if (this.boss.summonJustBegan) {
      // Portal charge: the tension layer that fills the 2.5s telegraph, cut
      // precisely when the boss erupts (keyed one-shot → stopLoop below).
      this.audio.emit({ id: 'boss-portal', key: 'boss-portal', priority: 2 });
    }
    if (summoned) {
      this.audio.stopLoop('boss-portal');
      this.hud.banner(`${summoned.toUpperCase()} AWAKENS`);
      this.audio.emit({ id: 'boss-awaken', priority: 3 });
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
      collisionObstacles,
      (damage) => this.damagePlayer(damage),
      // Impact pop in the shot's own color — the hit on YOU is seen too.
      (x, z, color) => this.burst.spawn(x, z, color, 4),
    );

    this.orbs.update(dt, px, pz, this.stats.pickupRange, (value) => {
      const gainedXp = Math.round(value * this.stats.xpGain);
      if (this.benchmarkActive) this.benchmarkXpPickups++;
      this.damageNumbers.showGain(px, pz, gainedXp, 'xp');
      this.pendingLevelUps += this.progression.grantXp(gainedXp);
      this.audio.emit({ id: 'xp-pickup' });
    });

    this.pickups.update(dt, px, pz, this.stats.luck, collisionObstacles);
    this.goldSys.update(dt, px, pz, this.stats.pickupRange, (value) => {
      this.gold += value;
      this.runGoldEarned += value;
      if (this.benchmarkActive) this.benchmarkGoldPickups++;
      this.damageNumbers.showGain(px, pz, value, 'gold');
      this.hud.updateGold(this.gold);
      this.audio.emit({ id: 'gold-pickup' });
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
      this.endRun('defeat');
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
      // Fanfare rides the LEVEL UP text; the draft UI gets its own sound after.
      this.audio.emit({ id: 'levelup-intro', priority: 2 });
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
    this.audio.emit({ id: 'levelup-open', priority: 2 });
    this.hud.showLevelUp(
      rollUpgradeChoices(this.stats, this.weaponLevels, this.coreLevels, this.modCounts),
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

  /** Skip a draft without picking (max PROFILE.levelupDiscards per run) —
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
    this.runChestsByTier[tier] = (this.runChestsByTier[tier] ?? 0) + 1;
    this.audio.emit({ id: 'chest-open', priority: 2 });
    this.hud.updateGold(this.gold);
    this.pickups.open(index);
    this.burst.spawn(chestX, chestZ, VISUAL.chestVfx.openColor, VISUAL.chestVfx.openCount);
    this.burst.spawn(chestX, chestZ, VISUAL.chestVfx.hotColor, VISUAL.chestVfx.hotCount);
    this.shakeAmp = Math.max(this.shakeAmp, VISUAL.chestVfx.shakeAmp);

    const mod: ModId = RECORDING.chestTesting.forceOrbSiphonReward
      ? 'orb-siphon'
      : rollModOfTier(
          tier,
          (id) =>
            (id !== 'repair' || this.player.hp < this.player.maxHp) &&
            !isModAtCopyCap(id, this.modCounts[id] ?? 0),
        );

    // Orb Siphon: the chest vacuums the map's XP before the reel spins. A first
    // copy won by this chest counts immediately, so its defining effect cannot
    // miss the very chest that awarded it.
    const ownedSiphonCopies = this.modCounts['orb-siphon'] ?? 0;
    const siphonCopies = ownedSiphonCopies + (mod === 'orb-siphon' ? 1 : 0);
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
    this.state = 'chest';
    this.hud.showInteractPrompt(null, this.interactLabel());
    // Suspense layer: a one-shot riser cut to the reel's 2.6s deceleration,
    // ending right as transitionend fires the reveal.
    this.audio.emit({ id: 'chest-spin', priority: 2 });
    this.hud.showChestSpin(
      mod,
      tier,
      // Landing: apply right away so the revealed stat sheet / items list
      // already show what the reward changed.
      () => { this.audio.emit({ id: 'chest-reveal', priority: 2 }); this.applyMod(mod); },
      // The reward card states the cumulative result after this copy lands.
      (this.modCounts[mod] ?? 0) + 1,
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
  private dealDamage(
    index: number,
    baseDamage: number,
    hitColor?: number,
    weaponId?: WeaponId,
  ): void {
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
        if (
          dSq <= radiusSq &&
          hasLineOfSight(enemy.x, enemy.z, other.x, other.z, this.collisionObstacles)
        ) {
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
    const appliedDamage = Math.min(amount, enemy.hp);
    const death = this.enemies.damage(index, amount);
    if (weaponId !== undefined) this.weaponDamage[weaponId] += appliedDamage;
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
        this.dealDamage(i, e.dotDps * 0.5, undefined, e.dotWeaponId ?? undefined);
      }
      if (e.dotTimer <= 0) {
        e.dotDps = 0;
        e.dotWeaponId = null;
      }
    }
  }

  /** Barrier Cell restores one charge at its current cumulative interval. */
  private tickShield(dt: number): void {
    const copies = this.modCounts['barrier-cell'] ?? 0;
    const max = barrierCellCapacity(copies);
    if (max <= 0 || this.shieldCur >= max) {
      this.shieldRegen = 0;
      return;
    }
    this.shieldRegen += dt;
    if (this.shieldRegen >= barrierCellRegenS(copies)) {
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
      this.audio.emit({ id: 'shield-block', priority: 3 });
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
    this.runDamageTaken += amount;
    this.audio.emit({ id: 'player-hit', priority: 3 });
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
    if (this.benchmarkActive) this.benchmarkKills++;
    this.progression.addKill();
    this.audio.emit({ id: 'enemy-death' });
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
      const dropped = this.pickups.spawnAt(
        death.x,
        death.z,
        this.stats.luck,
        this.refreshCollisionObstacles(),
      );
      if (dropped) this.hud.toast('Elite down! It dropped a crate.');
    }
    if (this.boss.isBossType(death.typeIndex)) {
      // Boss kills reward and continue the run: loot shower now, and a
      // tougher totem rises shortly — the loop that later becomes new maps.
      const name = ENEMY_TYPES[death.typeIndex]?.name ?? 'The boss';
      this.hud.banner(`${name.toUpperCase()} DESTROYED`);
      this.audio.emit({ id: 'boss-defeat', priority: 4 });
      this.shakeAmp = Math.max(this.shakeAmp, VISUAL.screenShake.bossKillAmp);
      for (let i = 0; i < BOSS.chestsOnKill; i++) {
        const a = (i / BOSS.chestsOnKill) * Math.PI * 2;
        // Chests spawn wherever the boss happened to die — unlike
        // containers/barrels/the totem, that position can't be known ahead
        // of time, so nudge each chest clear of anything it lands inside of
        // instead (user request 2026-07-06).
        this.pickups.spawnAt(
          death.x + Math.cos(a) * 3,
          death.z + Math.sin(a) * 3,
          this.stats.luck,
          this.refreshCollisionObstacles(),
        );
      }
      this.boss.onBossDefeated();
    }
  }

  /** Applies a mod from either door — chest reel or merchant purchase.
   *  Consumables fire instantly; permanents just stack (their effects hook
   *  into combat/movement/economy reading modCounts). */
  private applyMod(id: ModId): void {
    const previousCopies = this.modCounts[id] ?? 0;
    if (isModAtCopyCap(id, previousCopies)) return;
    const copies = previousCopies + 1;
    this.modCounts[id] = copies;
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
        this.damageNumbers.showGain(
          this.player.position.x,
          this.player.position.z,
          xp,
          'xp',
        );
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
      case 'barrier-cell': {
        const addedCapacity = barrierCellCapacity(copies) - barrierCellCapacity(previousCopies);
        this.shieldCur = Math.min(barrierCellCapacity(copies), this.shieldCur + addedCapacity);
        this.hud.toast(`Barrier Cell: ${describeMod(id, copies)}`);
        break;
      }
      default:
        this.hud.toast(`${MOD_REGISTRY[id].label} installed!`);
    }
    this.hud.updateBuild(this.stats, this.weaponLevels, this.modCounts, this.coreLevels, this.weaponBranches);
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
      if (
        (e.x - px) ** 2 + (e.z - pz) ** 2 <= rSq &&
        hasLineOfSight(px, pz, e.x, e.z, this.collisionObstacles)
      ) {
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
      if (
        (e.x - px) ** 2 + (e.z - pz) ** 2 <= rSq &&
        hasLineOfSight(px, pz, e.x, e.z, this.collisionObstacles)
      ) {
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
      if (
        (e.x - x) ** 2 + (e.z - z) ** 2 <= rSq &&
        hasLineOfSight(x, z, e.x, e.z, this.collisionObstacles)
      ) this.dealDamage(i, damage);
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
        if (
          (e.x - px) ** 2 + (e.z - pz) ** 2 <= rSq &&
          hasLineOfSight(px, pz, e.x, e.z, this.collisionObstacles)
        ) this.dealDamage(i, damage);
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
        if (!hasLineOfSight(px, pz, e.x, e.z, this.collisionObstacles)) continue;
        const d = Math.hypot(px - e.x, pz - e.z) || 1;
        e.kbX = ((px - e.x) / d) * MODS.magnetronHeart.pullForce;
        e.kbZ = ((pz - e.z) / d) * MODS.magnetronHeart.pullForce;
      }
      if (this.magnetronPullS <= 0) {
        const rSq = MODS.magnetronHeart.novaRadius ** 2;
        let dragged = 0;
        for (const e of this.enemies.pool) {
          if (
            e.active &&
            (e.x - px) ** 2 + (e.z - pz) ** 2 <= rSq &&
            hasLineOfSight(px, pz, e.x, e.z, this.collisionObstacles)
          ) dragged++;
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
        const spot = findRandomClearSpot(
          px,
          pz,
          MERCHANT.distMin,
          MERCHANT.distMax,
          MERCHANT.colliderRadius,
          this.refreshCollisionObstacles(),
          MERCHANT.spawnClearance,
        );
        if (!spot) {
          this.merchant.nextVisitS = this.elapsedS + MERCHANT.retryDelayS;
          return;
        }
        const stock = rollShopStock(
          this.stats.luck,
          MERCHANT.stock + (whistle ? 1 : 0),
          (id) => !isModAtCopyCap(id, this.modCounts[id] ?? 0),
        );
        this.merchant.arrive(spot.x, spot.z, stock, this.elapsedS);
        this.audio.emit({ id: 'merchant-arrival', priority: 2 });
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
    this.audio.emit({ id: 'panel-open' });
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
        this.runShopPurchases += 1;
        this.audio.emit({ id: 'shop-purchase', priority: 2 });
        this.hud.updateGold(this.gold);
        this.merchant.stock.splice(index, 1);
        this.applyMod(entry.id);
        // Refresh the RIG so the bought mod shows, then flash its tile.
        this.hud.updateBuild(this.stats, this.weaponLevels, this.modCounts, this.coreLevels, this.weaponBranches);
        this.hud.flashBuildRow(entry.id);
        this.renderShop();
      },
      () => {
        this.state = 'playing';
        this.clock.getDelta(); // Discard time spent shopping.
      },
      { copies: whistleCopies, discount, modCounts: this.modCounts },
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

  private endRun(outcome: RunOutcome): void {
    this.state = 'ended';
    this.audio.emit({ id: outcome === 'defeat' ? 'run-defeat' : 'run-victory', priority: 5 });
    this.audio.stopLoop('foundation-run-loop');
    this.audio.setPaused(true);
    this.hud.updateTotemIndicator(false, 0, 0, 0);
    this.hud.updateMerchantIndicator(false, 0, 0, 0, 0);
    this.hud.showInteractPrompt(null, this.interactLabel());
    const record = saveRunRecord({
      outcome,
      map: SCRAPYARD_MAP,
      ...(this.startingWeapon ? { startingWeapon: this.startingWeapon } : {}),
      // No difficulty selector exists yet, so every run is the one and only
      // curve. Labelling it now means the day a selector lands, these records
      // are still rankable instead of being an unlabelled blob.
      difficulty: DIFFICULTY_ID,
      damageTaken: this.runDamageTaken,
      goldEarned: this.runGoldEarned,
      chestsByTier: this.runChestsByTier,
      shopPurchases: this.runShopPurchases,
      durationS: this.elapsedS,
      level: this.progression.level,
      kills: this.progression.kills,
      bossesDefeated: this.boss.bossesDefeated,
      weaponLevels: this.weaponLevels,
      weaponPower: this.weaponPower,
      weaponBranches: this.weaponBranches,
      weaponDamage: this.weaponDamage,
      coreLevels: this.coreLevels,
      modCounts: this.modCounts,
    });
    // Ledger first, then contracts read it. Single evaluation point per run:
    // a contract published later completes retroactively for a player who
    // already met it, and rewards land in exactly one place.
    recordRunInLifetime(record);
    saveProfile();
    const earnedContracts = settleContracts();
    for (const earned of earnedContracts) {
      console.info(`Contract complete: ${earned.contract.title} -> ${earned.label}`);
    }
    this.hud.showEnd(
      outcome,
      SCRAPYARD_MAP,
      this.progression.level,
      this.progression.kills,
      this.elapsedS,
      this.boss.bossesDefeated,
      this.weaponLevels,
      this.weaponBranches,
      this.weaponDamage,
      this.coreLevels,
      this.modCounts,
    );
  }
}
