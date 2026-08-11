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
  BOSS_LAB,
  BOSS_TYPE_INDEXES,
  CHEST,
  DEV_TOOLS,
  DEFEAT_TRANSITION,
  ELITES,
  ENEMY_TYPES,
  GOLD,
  MERCHANT,
  MODS,
  PICKUPS,
  PLAYER,
  PRESSURE_METRICS,
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
import { Progression, emptyWeaponBranches, replayCoresOntoStats, emptyWeaponLevels, emptyWeaponPower, rollUpgradeChoices, weaponIdFromUpgradeCard, type CoreLevels, type Rarity, type UpgradeCard, type WeaponBranchLevels, type WeaponLevels, type WeaponPower } from './upgrades';
import { PickupSystem } from './pickups';
import { XpOrbSystem } from './xp-orbs';
import { GoldSystem } from './gold';
import { MerchantSystem } from './merchant';
import { MOD_REGISTRY, barrierCellCapacity, barrierCellRegenS, describeMod, isModAtCopyCap, isModEligibleForChest, modPrice, rollModOfTier, rollShopStock, tierPrice, type ModCounts, type ModId } from './mods';
import { DamageNumbers } from './damage-numbers';
import { BossSystem, type BossBody } from './boss';
import { AudioDirector, type AudioEventId } from './audio';
import { DefeatSparks, VoxelBurst } from './particles';
import {
  DEFAULT_CHARACTER_ID,
  CHARACTER_REGISTRY,
  characterStats,
  fieldRepairHp,
  registeredCharacterId,
  resolveCharacterId,
  type CharacterId,
} from './characters';

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
import { Hud, coinHtml, type ChestMarkerView } from './hud';
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
  applyUiScale,
  applyWindowSettings,
  gamepadButtonLabel,
  keyLabel,
  loadSettings,
  saveSettings,
  type GameSettings,
} from './settings';
import { createRunId, loadRunHistory, saveRunRecord, type RunMapRef, type RunOutcome, type RunRecordV1 } from './run-history';
import { recordRunInLifetime, saveProfile } from './profile';
import { settleContracts } from './contracts';
import { telemetry } from './telemetry';
import {
  actionsAcceptInput,
  advanceDefeat,
  createDefeatState,
  disarmDefeatGate,
  overloadPressure,
  type DefeatState,
} from './defeat-transition';
import type { EarnedContract } from './contracts';

type GameState =
  | 'menu'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'levelup-intro'
  | 'levelup'
  | 'chest'
  | 'shop'
  /** Staged defeat beat. The run is already durably recorded here; only the
   *  presentation is still running. Terminal, and never advances to a map. */
  | 'defeat-transition'
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
  /** The world list PLUS the live boss body. Only the player walks against
   *  this one: the swarm keeps steering by collisionObstacles, where the boss
   *  already has its own wider clear-ring entry. */
  private readonly playerObstacles: Obstacle[] = [];
  /** Ram serial of the last boss charge that was billed against the player, so
   *  one lunge costs one hit however many frames the bodies overlap. */
  private billedRamSerial = -1;
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
  /** Defeat-only spark pool. Separate from `burst` so the defeat beat can
   *  animate while every combat particle stays frozen with the battle. */
  private readonly defeatSparks: DefeatSparks;
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
  private pendingCharacterId: CharacterId = DEFAULT_CHARACTER_ID;
  private currentCharacterId: CharacterId = DEFAULT_CHARACTER_ID;
  private runReady = false;
  private warmupFrames = 0;
  /** Frames to wait so the loading screen PAINTS before the world-build hitch
   *  runs (rAF fires before paint, so the first loading frame is just shown). */
  private loadingDelay = 0;
  private elapsedS = 0;
  /** Shared identity for packaged telemetry and the terminal-only local record. */
  private currentRunId: string | null = null;
  /** Terminal side effects (history, telemetry, contracts and HUD) may run once
   *  per run. Without it, overlapping lethal callbacks record the run twice. */
  private runFinalized = false;
  /** Live defeat presentation, or null when no defeat beat is running. */
  private defeat: DefeatState | null = null;
  /** Summary data captured at the fatal instant and replayed at the reveal, so
   *  persistence never waits for the animation. */
  private defeatSummary: { record: RunRecordV1; earnedContracts: EarnedContract[] } | null = null;
  /** Fractional spark budget carried between presentation frames. */
  private defeatSparkCarry = 0;
  /** The exact cards visible in the active draft, retained until pick/discard. */
  private currentUpgradeOffer: string[] = [];
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
  /** Pressure instrumentation — see config.PRESSURE_METRICS for why enclosure
   *  is measured by angular coverage rather than by a nearby-enemy count. */
  /** Hitstop (VISUAL.hitstop): remaining freeze, and the cooldown that keeps a
   *  wide AoE build from triggering it every frame. */
  private hitstopS = 0;
  private hitstopCooldownS = 0;
  /** Rolling kill-burst window feeding the hitstop trigger. */
  private killWindowS = 0;
  private killWindowCount = 0;
  /** Integral of cursedDifficulty over run time — divided by duration at the
   *  end it gives the time-weighted mean, which is what a leaderboard needs. */
  /** This frame's difficulty scalar, kept so death handlers can scale elite
   *  payout without recomputing it. */
  private currentDifficulty = 1;
  private runCursedIntegral = 0;
  private runContactS = 0;
  private runEnclosedS = 0;
  private runEnclosedLowHpS = 0;
  private runPeakEnclosedSectors = 0;
  /** Reused across frames so the per-frame pass allocates nothing. */
  private readonly sectorOccupied = new Uint8Array(PRESSURE_METRICS.sectors);
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
    // Page zoom must land before renderer/camera construction: all DOM UI is
    // born at the selected scale while Three.js world geometry remains intact.
    applyUiScale(this.settings);
    // Game owns the renderer for the lifetime of this page, so this listener
    // shares that lifecycle. Explicit scales never react to monitor changes.
    const removeDisplayInfoListener = window.electronAPI?.onDisplayInfoChanged?.(() => {
      if (this.settings.uiScale === 'auto') applyUiScale(this.settings);
    });
    if (removeDisplayInfoListener) {
      window.addEventListener('beforeunload', () => removeDisplayInfoListener(), { once: true });
    }
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
    this.defeatSparks = new DefeatSparks(this.scene);
    this.goldSys = new GoldSystem(this.scene);
    this.merchant = new MerchantSystem(this.scene);
    this.hud = new Hud(
      container,
      (character, weapon) => this.enterLoading(character, weapon),
      (card) => this.applyUpgrade(card),
      () => this.resumeRun(),
      () => this.quitToMenu(),
      () => this.startNewRunFromDefeat(),
      (settings) => this.updateSettings(settings),
      () => this.playUiConfirm(),
      async (feedback) => {
        if (!this.currentRunId) return false;
        return telemetry.feedback(this.currentRunId, feedback);
      },
      telemetry.isAvailable(),
    );
    this.audio = new AudioDirector(this.settings);
    void this.audio.preloadEnabled();
    if (DEV_TOOLS.auditionKeys) this.installAuditionKeys();
    if (DEV_TOOLS.bossLab) this.installBossLab();
    if (DEV_TOOLS.fatalHitKey) this.installFatalHitKey();
    this.hud.syncSettings(this.settings);
    applyWindowSettings(this.settings);
    this.input.setBindings(this.settings.bindings);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      // Electron page zoom changes devicePixelRatio. Refresh it together with
      // size or the WebGL canvas is resampled and becomes visibly soft.
      const pixelRatio = Math.min(window.devicePixelRatio, 1.5);
      this.renderer.setPixelRatio(pixelRatio);
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.composer?.setPixelRatio(pixelRatio);
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
  private enterLoading(characterId: CharacterId, startingWeapon: WeaponId): void {
    this.pendingCharacterId = resolveCharacterId(characterId, PROFILE);
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
      if (this.pendingWeapon) this.buildRun(this.pendingCharacterId, this.pendingWeapon);
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
      if (this.currentRunId && this.startingWeapon) {
        telemetry.startRun(this.currentRunId, {
          mapId: SCRAPYARD_MAP.id,
          mapNumber: SCRAPYARD_MAP.number,
          difficulty: DIFFICULTY_ID,
          startingWeaponId: this.startingWeapon,
        });
      }
      this.clock.getDelta(); // Discard the time spent building + warming up.
    }
  }

  private buildRun(requestedCharacterId: CharacterId, startingWeapon: WeaponId): void {
    this.currentCharacterId = resolveCharacterId(requestedCharacterId, PROFILE);
    this.resetRunWorld();
    this.currentRunId = createRunId();
    this.runFinalized = false;
    this.startingWeapon = startingWeapon;
    this.runDamageTaken = 0;
    this.runGoldEarned = 0;
    this.runChestsByTier = {};
    this.runShopPurchases = 0;
    this.runCursedIntegral = 0;
    this.runContactS = 0;
    this.runEnclosedS = 0;
    this.runEnclosedLowHpS = 0;
    this.runPeakEnclosedSectors = 0;
    const character = CHARACTER_REGISTRY[this.currentCharacterId];
    this.stats = characterStats(this.currentCharacterId);
    this.player.maxHp = character.maxHp;
    this.player.hp = character.maxHp;
    this.player.moveSpeed = character.moveSpeed;
    this.player.setCharacterModelKey(character.modelKey);
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
    this.hud.updateBuild(this.stats, this.weaponLevels, this.modCounts, this.coreLevels, this.weaponBranches, this.player.maxHp);
    // state → 'playing' and the clock reset happen at the reveal (tickLoading),
    // after the warmup frames render behind the loading screen.
  }

  /** TEMP style-search audition: cycle the pinned candidate for an event and preview it. */
  /** DEV ONLY — the boss lab (see config.BOSS_LAB).
   *
   *  B  jumps to BOSS_LAB.atMinute with a real recorded build loaded and a
   *     boss summoned on you.
   *  N  cycles which boss the next summon produces, so the same fight can be
   *     re-tested instead of re-rolled.
   */
  private installBossLab(): void {
    let bossPick = 0;
    window.addEventListener('keydown', (event) => {
      if (this.state !== 'playing') return;
      if (event.code === 'KeyN') {
        bossPick = (bossPick + 1) % BOSS_TYPE_INDEXES.length;
        const index = BOSS_TYPE_INDEXES[bossPick] ?? BOSS_TYPE_INDEXES[0]!;
        this.boss.devSetBossType(index);
        this.hud.toast(`Boss lab: next = ${ENEMY_TYPES[index]?.name ?? '?'}`);
        return;
      }
      if (event.code !== 'KeyB') return;
      this.enterBossLab();
    });
  }

  private enterBossLab(): void {
    const history = loadRunHistory()
      .slice()
      .sort((a: RunRecordV1, b: RunRecordV1) => Date.parse(b.endedAt) - Date.parse(a.endedAt));
    const record = history[BOSS_LAB.buildFromRunIndex];
    if (!record) {
      this.hud.toast('Boss lab: no recorded run to load a build from');
      return;
    }

    // Load the recorded build. Stats are REPLAYED from core picks rather than
    // restored, because the record stores how many times each core was taken
    // and never which rarity rolled — see replayCoresOntoStats.
    // Preserve the recorded identity even if it is no longer unlocked. Unknown
    // legacy ids resolve to the default character, not a currently unlocked one.
    this.currentCharacterId = registeredCharacterId(record.characterId);
    const character = CHARACTER_REGISTRY[this.currentCharacterId];
    this.stats = characterStats(this.currentCharacterId);
    this.player.maxHp = character.maxHp;
    this.player.hp = character.maxHp;
    this.player.moveSpeed = character.moveSpeed;
    this.player.setCharacterModelKey(character.modelKey);
    this.weaponLevels = { ...emptyWeaponLevels(), ...record.weaponLevels };
    this.weaponBranches = record.weaponBranches
      ? structuredClone(record.weaponBranches)
      : emptyWeaponBranches();
    this.modCounts = { ...record.modCounts };
    this.coreLevels = { ...record.coreLevels };
    replayCoresOntoStats(this.stats, this.player, this.coreLevels);
    this.progression.level = record.level;
    // HP cores act on the player object directly (the `_p` arg the stat cards
    // take), so replayCoresOntoStats above already applied them — just top up.
    this.player.hp = this.player.maxHp;

    // Jumping the CLOCK is what reproduces the real fight: density, enemy
    // types and the HP ramp are all derived from it. The lab never empties the
    // arena — the whole difficulty is killing a boss while the wave is on you.
    this.elapsedS = BOSS_LAB.atMinute * 60;
    this.hud.updateBuild(
      this.stats,
      this.weaponLevels,
      this.modCounts,
      this.coreLevels,
      this.weaponBranches,
      this.player.maxHp,
    );
    // Fill the arena to its minute-8 population BEFORE the boss lands. A boss
    // dropped onto an empty field tests nothing — the whole difficulty is
    // fighting it while the wave is already on you.
    const filled = this.enemies.devFillToCap(
      this.elapsedS,
      difficultyScalar(this.elapsedS, this.stats.cursedDifficulty),
      this.player.position.x,
      this.player.position.z,
      this.refreshCollisionObstacles(),
    );
    this.boss.devForceSummon(this.player.position.x, this.player.position.z);
    const weapons = Object.entries(record.weaponLevels)
      .filter(([, level]) => (level as number) > 0)
      .map(([id, level]) => `${id}:${level}`)
      .join(' ');
    this.hud.toast(`Boss lab: min ${BOSS_LAB.atMinute}, lv ${record.level}, ${filled} enemies [${weapons}]`);
  }

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

  /** Dev harness (DEV_TOOLS.fatalHitKey): K applies a guaranteed lethal hit
   *  through the real damage funnel, so the defeat beat can be measured on
   *  demand instead of waited for. Armor/shield/dodge still apply — pressing it
   *  behind a shield charge burns the charge, which is exactly the behavior the
   *  acceptance checklist wants to confirm. */
  private installFatalHitKey(): void {
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyK' || e.repeat || this.state !== 'playing') return;
      e.preventDefault();
      this.player.clearInvulnerability();
      this.damagePlayer(this.player.maxHp * 100);
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
    this.buildRun(DEFAULT_CHARACTER_ID, 'bolt');
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
    this.hud.updateBuild(this.stats, this.weaponLevels, this.modCounts, this.coreLevels, this.weaponBranches, this.player.maxHp);
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

  /** Accumulates the pressure counters written onto the run record.
   *
   *  Enclosure is angular coverage, not a headcount: a wall of 30 enemies on
   *  one side leaves an obvious way out, while 10 spread evenly around leaves
   *  none. Squared distance gates the pass so the trig only runs for the
   *  handful of enemies actually close enough to block a route. */
  private tickPressureMetrics(dt: number, px: number, pz: number): void {
    const { radius, sectors, enclosedSectors, lowHpFraction } = PRESSURE_METRICS;
    const radiusSq = radius * radius;
    this.sectorOccupied.fill(0);
    let occupied = 0;
    let touching = false;
    const playerRadius = PLAYER.radius;

    for (const enemy of this.enemies.pool) {
      if (!enemy.active) continue;
      const dx = enemy.x - px;
      const dz = enemy.z - pz;
      const distSq = dx * dx + dz * dz;
      if (distSq > radiusSq) continue;
      const reach = playerRadius + enemy.radius;
      if (distSq <= reach * reach) touching = true;
      // atan2 → [-PI, PI]; shift to [0, 1) before bucketing.
      const turn = (Math.atan2(dz, dx) / (Math.PI * 2) + 1) % 1;
      const sector = Math.min(sectors - 1, (turn * sectors) | 0);
      if (this.sectorOccupied[sector] === 0) {
        this.sectorOccupied[sector] = 1;
        occupied++;
      }
    }

    if (touching) this.runContactS += dt;
    if (occupied > this.runPeakEnclosedSectors) this.runPeakEnclosedSectors = occupied;
    if (occupied >= enclosedSectors) {
      this.runEnclosedS += dt;
      if (this.player.hp <= this.player.maxHp * lowHpFraction) this.runEnclosedLowHpS += dt;
    }
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
    telemetry.choice('level_up', {
      action: 'selected',
      selectedId: card.id,
      rarity: card.rarity,
      offeredIds: [...this.currentUpgradeOffer],
      level: this.progression.level,
      discardsRemaining: this.discardsLeft,
    });
    this.currentUpgradeOffer = [];
    const coreLevelBefore = card.draftKind === 'core' ? (this.coreLevels[card.id] ?? 0) : null;
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
    if (
      coreLevelBefore !== null
      && card.id !== 'max-hp'
      && (this.coreLevels[card.id] ?? 0) > coreLevelBefore
    ) {
      this.player.hp = fieldRepairHp(
        this.currentCharacterId,
        this.player.hp,
        this.player.maxHp,
        'gameplay',
      );
    }
    this.hud.updateBuild(this.stats, this.weaponLevels, this.modCounts, this.coreLevels, this.weaponBranches, this.player.maxHp);
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
    // 'defeat-transition' is deliberately ABSENT: the duck would fight the exact
    // music fade the defeat beat schedules, and its ramp would win.
    this.audio.setPaused(
      this.state === 'paused' || this.state === 'levelup' || this.state === 'levelup-intro' ||
      this.state === 'chest' || this.state === 'shop' || this.state === 'ended',
    );
    if (this.state === 'loading') this.tickLoading();
    else if (this.state === 'defeat-transition') this.tickDefeatTransition(rawDt);
    else if (this.state === 'playing') {
      telemetry.samplePerformance(rawDt, this.enemies.activeCount);
      // Hitstop: the world is frozen, but the frame still renders and the
      // camera still shakes (it decays on rawDt), which is what turns the
      // freeze into impact rather than a dropped frame.
      if (this.hitstopS > 0) this.hitstopS -= rawDt;
      else this.update(dt);
    }
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
    this.updateChestMarkers();

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
    // Losing focus mid-defeat drops every held key silently (PlayerInput clears
    // on blur), which would otherwise look like a release and arm the gate. Drop
    // the gate instead, so returning to the window requires a real fresh press.
    if (this.state === 'defeat-transition' && this.defeat) disarmDefeatGate(this.defeat);
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
    // 'defeat-transition' and 'ended' are absent on purpose: those runs were
    // already terminally persisted, so logging an abandonment would double-count
    // one run as both finished and quit.
    const abandonedStates: readonly GameState[] = [
      'playing',
      'paused',
      'levelup-intro',
      'levelup',
      'chest',
      'shop',
    ];
    if (this.currentRunId && abandonedStates.includes(this.state)) {
      telemetry.abandonRun(this.currentRunId, {
        reason: 'quit_to_menu',
        map: SCRAPYARD_MAP,
        durationS: Math.round(this.elapsedS * 1_000) / 1_000,
        level: this.progression.level,
        kills: this.progression.kills,
        bossesDefeated: this.boss.bossesDefeated,
        startingWeaponId: this.startingWeapon,
      });
    }
    this.currentRunId = null;
    this.currentUpgradeOffer = [];
    this.resetRunWorld();
    this.state = 'menu';
    this.hud.hideEnd();
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
    const uiScaleChanged = settings.uiScale !== this.settings.uiScale;
    this.settings = settings;
    saveSettings(settings);
    if (displayChanged) applyWindowSettings(settings);
    if (uiScaleChanged) applyUiScale(settings);
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
    // First: stale defeat presentation state (materials, sparks, overlay,
    // action guard) must not survive into the next run or the menu.
    this.endDefeatPresentation();
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
    this.hud.clearChestMarkers();
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

  /** Refresh refreshCollisionObstacles() first — this reads its result. */
  private refreshPlayerObstacles(): Obstacle[] {
    this.playerObstacles.length = 0;
    for (const obstacle of this.collisionObstacles) this.playerObstacles.push(obstacle);
    this.boss.appendBodyObstacle(this.playerObstacles, this.enemies);
    return this.playerObstacles;
  }

  private update(dt: number): void {
    if (this.hitstopCooldownS > 0) this.hitstopCooldownS -= dt;
    if (this.killWindowS > 0) this.killWindowS -= dt;
    this.elapsedS += dt;
    // Integrated per frame, not sampled at the end: the card can be picked at
    // any minute, and a run that ran +60% for its last 30 seconds is not the
    // same run as one that ran +60% throughout.
    this.runCursedIntegral += this.stats.cursedDifficulty * dt;
    this.tickAudioBenchmark(dt);
    const remaining = RUN_DURATION_S - this.elapsedS;
    if (remaining <= 0) {
      // The BOSS clears the sector, not the clock (2026-08-06). Lasting the ten
      // minutes is still an ending the player earned — it reads Sector Held —
      // but the clear belongs to whoever walked to the portal. Before this the
      // clock handed out the same title either way, which is why zero of six
      // recorded human runs ever bothered to summon a boss.
      this.endRun(this.boss.bossesDefeated > 0 ? 'sector-cleared' : 'survived');
      return;
    }

    if (this.frenzyS > 0) this.frenzyS -= dt;
    if (this.hasteS > 0) this.hasteS -= dt;
    this.hud.updateBuffs([
      ...(this.frenzyS > 0
        ? [{
            id: 'frenzy' as const,
            remainingS: this.frenzyS,
            totalS: PICKUPS.frenzyDurationS * this.stats.duration,
          }]
        : []),
      ...(this.hasteS > 0
        ? [{
            id: 'haste' as const,
            remainingS: this.hasteS,
            totalS: PICKUPS.hasteDurationS * this.stats.duration,
          }]
        : []),
      // Overload Trigger: x2 attack speed after an elite/boss kill. It had no
      // indicator at all, same defect as the crate buffs — and it is the
      // biggest of the three, so not showing it was the worst of the set.
      ...(this.overloadS > 0
        ? [{
            id: 'overload' as const,
            remainingS: this.overloadS,
            totalS:
              MODS.overloadTrigger.durationS +
              Math.max(0, (this.modCounts['overload-trigger'] ?? 1) - 1) *
                MODS.overloadTrigger.durationPerCopyS,
          }]
        : []),
    ]);
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
    // A boss body is solid to the player (and only to the player): walking
    // into one used to put the player INSIDE it, which is how a single ram
    // billed three contact hits.
    this.player.update(dt, this.input, speedMult, this.refreshPlayerObstacles());

    const px = this.player.position.x;
    const pz = this.player.position.z;
    // The player is the audio listener — drives distance attenuation of
    // world-positioned sounds (acid pool loop, acid drum, dismantler claw).
    this.audio.setListener(px, pz);
    const difficulty = difficultyScalar(this.elapsedS, this.stats.cursedDifficulty);
    this.currentDifficulty = difficulty;

    this.enemies.update(
      dt,
      this.elapsedS,
      difficulty,
      px,
      pz,
      collisionObstacles,
      this.enemyShots,
    );
    this.tickPressureMetrics(dt, px, pz);
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
      this.progression.level,
    );
    if (this.boss.summonJustBegan) {
      // Portal charge: the tension layer that fills the 2.5s telegraph, cut
      // precisely when the boss erupts (keyed one-shot → stopLoop below).
      this.audio.emit({ id: 'boss-portal', key: 'boss-portal', priority: 2 });
    }
    if (summoned) {
      telemetry.choice('boss_summon', {
        bossId: summoned,
        elapsedS: Math.round(this.elapsedS * 1_000) / 1_000,
        playerLevel: this.progression.level,
      });
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
    // A projectile just killed the player: the defeat latch already fired, and
    // nothing below (pickups, interactions, level-ups) may run on a dead run.
    if (this.state !== 'playing') return;

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
    // Contact damage is the usual killer. Same rule as above: the HUD refresh,
    // indicators and the level-up check below belong to a live run only.
    if (this.state !== 'playing') return;

    this.player.setShieldCharges(this.shieldCur);
    this.hud.updateBars(
      this.player.hp,
      this.player.maxHp,
      this.progression.xp,
      this.progression.xpToNext,
    );
    this.hud.updateTimer(remaining);
    this.hud.updateMission(this.boss.bossesDefeated > 0);
    this.hud.updateLevel(this.progression.level, this.progression.kills);
    this.hud.updateBoss(this.boss.status(this.enemies));
    this.updateTotemIndicator();
    this.updateMerchantIndicator();

    // Safety net for any future death source outside the damage funnel.
    // Idempotent: the funnel normally latched this several statements ago.
    if (this.player.isDead) {
      this.beginDefeatTransition();
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
    const choices = rollUpgradeChoices(this.stats, this.weaponLevels, this.coreLevels, this.modCounts);
    this.currentUpgradeOffer = choices.map((choice) => choice.id);
    this.hud.showLevelUp(
      choices,
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
    telemetry.choice('level_up', {
      action: 'discarded',
      offeredIds: [...this.currentUpgradeOffer],
      level: this.progression.level,
      discardsRemainingBefore: this.discardsLeft,
    });
    this.currentUpgradeOffer = [];
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
  private worldToScreen(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    tmpProject.set(x, y, z).project(this.camera);
    return {
      x: (tmpProject.x * 0.5 + 0.5) * window.innerWidth,
      y: (-tmpProject.y * 0.5 + 0.5) * window.innerHeight,
      visible:
        tmpProject.x >= -1 && tmpProject.x <= 1 &&
        tmpProject.y >= -1 && tmpProject.y <= 1 &&
        tmpProject.z >= -1 && tmpProject.z <= 1,
    };
  }

  /** Price/state labels stay pinned to every on-screen chest at any distance.
   *  This is presentation only: nearestOpenable remains the purchase gate. */
  private updateChestMarkers(): void {
    const show =
      this.state === 'playing' || this.state === 'paused' ||
      this.state === 'levelup-intro' || this.state === 'levelup' ||
      this.state === 'chest' || this.state === 'shop';
    if (!show) {
      this.hud.clearChestMarkers();
      return;
    }

    const markers: ChestMarkerView[] = [];
    for (const chest of this.pickups.activeChests()) {
      const screen = this.worldToScreen(chest.x, 2.1, chest.z);
      if (!screen.visible) continue;
      const price = this.chestPrice(chest.tier);
      markers.push({
        index: chest.index,
        tier: chest.tier,
        price,
        affordable: this.gold >= price,
        x: screen.x,
        y: screen.y,
      });
    }
    this.hud.updateChestMarkers(markers);
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

    const ownedSiphonCopies = this.modCounts['orb-siphon'] ?? 0;
    const forceOrbSiphon =
      RECORDING.chestTesting.forceOrbSiphonReward &&
      isModEligibleForChest('orb-siphon', ownedSiphonCopies);
    const mod: ModId = forceOrbSiphon
      ? 'orb-siphon'
      : rollModOfTier(
          tier,
          (id) =>
            (id !== 'repair' || this.player.hp < this.player.maxHp) &&
            isModEligibleForChest(id, this.modCounts[id] ?? 0),
        );
    telemetry.choice('chest_purchase', {
      tier,
      price,
      rewardId: mod,
      rewardCopiesBefore: this.modCounts[mod] ?? 0,
      elapsedS: Math.round(this.elapsedS * 1_000) / 1_000,
    });

    // Orb Siphon: the chest vacuums the map's XP before the reel spins. A first
    // copy won by this chest counts immediately, so its defining effect cannot
    // miss the very chest that awarded it.
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
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + PLAYER.lifestealHealHp);
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
    this.player.takeHit(amount);
    // Lethality is read from the ACTUAL post-armor result, never inferred from
    // raw damage — and the audio branches on it, because a hit cannot be both
    // an ordinary clang and the sound of the chassis going down.
    if (this.player.isDead) {
      this.beginDefeatTransition();
      return;
    }
    this.audio.emit({ id: 'player-hit', priority: 3 });
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
    // Hitstop trigger: a burst of deaths inside a short window. Fired here
    // rather than at the end of update() so the freeze starts on the exact
    // frame the kill lands.
    if (this.killWindowS <= 0) this.killWindowCount = 0;
    this.killWindowS = VISUAL.hitstop.windowS;
    this.killWindowCount++;
    if (
      VISUAL.hitstop.enabled &&
      this.hitstopCooldownS <= 0 &&
      this.killWindowCount >= VISUAL.hitstop.killsThreshold
    ) {
      this.hitstopS = VISUAL.hitstop.durationS;
      this.hitstopCooldownS = VISUAL.hitstop.cooldownS;
      this.killWindowCount = 0;
    }
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
    // Same rule as elite XP: only difficulty ABOVE 1 pays, and the clock alone
    // tops out at exactly 1, so this bonus tracks stacked Cursed Core.
    else if (death.elite) {
      goldValue = Math.round(
        GOLD.eliteBonus *
          (ELITES.rewardScalesWithDifficulty ? Math.max(1, this.currentDifficulty) : 1),
      );
    }
    // Per-type payout: a 7:00 heavy is worth more than a minute-one grunt.
    // The CHANCE stays global on purpose — varying rate and amount together
    // makes income impossible to reason about when tuning the shop.
    else if (Math.random() < GOLD.dropChance) {
      goldValue = ENEMY_TYPES[death.typeIndex]?.gold ?? GOLD.dropAmount;
    }
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
    this.hud.updateBuild(this.stats, this.weaponLevels, this.modCounts, this.coreLevels, this.weaponBranches, this.player.maxHp);
  }

  /** Throws the player clear of a charging boss, ACROSS its lane rather than
   *  along it. Shoving them down the charge line would only hand a body moving
   *  at 22 a player moving at 11 — bulldozed for the rest of the lunge. Sideways
   *  is the only direction that actually ends the contact.
   *
   *  The side chosen is the one the player is already on, so the shove reads as
   *  being clipped by a shoulder. Dead centre has no such side; it falls back to
   *  the boss's left, which is arbitrary but never zero. */
  private flingFromRam(ram: BossBody, px: number, pz: number): void {
    const leftX = -Math.cos(ram.heading);
    const leftZ = Math.sin(ram.heading);
    const lateral = (px - ram.x) * leftX + (pz - ram.z) * leftZ;
    const side = lateral < 0 ? -1 : 1;
    this.player.applyKnockback(
      leftX * side,
      leftZ * side,
      BOSS.ramKnockbackForce,
      BOSS.ramKnockbackDecayPerS,
    );
    // The camera carries the impact. Displacement alone reads as sliding; the
    // jolt is what makes it land as being HIT by something with mass.
    this.shakeAmp = Math.max(this.shakeAmp, BOSS.ramShakeAmp);
  }

  /** Circle-vs-circle contact between the swarm and the player on the XZ plane. */
  private resolvePlayerContact(): void {
    if (this.phaseS > 0) return; // Phase Chassis: enemies pass right through.
    const px = this.player.position.x;
    const pz = this.player.position.z;
    const body = this.boss.body(this.enemies);
    const ram = body?.ramming ? body : null;
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
        // A ram is ONE hit and a shove, not a per-i-frame toll. Billed against
        // the charge's serial rather than a timer, so it holds however long
        // the bodies stay overlapped — and it suppresses only THIS boss's
        // contact, leaving the swarm free to keep hurting the player.
        if (ram && this.boss.isBossType(e.typeIndex)) {
          if (this.billedRamSerial === ram.ramSerial) continue;
          this.billedRamSerial = ram.ramSerial;
          this.damagePlayer(BOSS.contactDamage, i);
          this.flingFromRam(ram, px, pz);
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
        telemetry.choice('shop_purchase', {
          modId: entry.id,
          price: entry.price,
          goldBefore: this.gold,
          stockIds: entries.map((candidate) => candidate.id),
          elapsedS: Math.round(this.elapsedS * 1_000) / 1_000,
        });
        this.gold -= entry.price;
        this.runShopPurchases += 1;
        this.audio.emit({ id: 'shop-purchase', priority: 2 });
        this.hud.updateGold(this.gold);
        this.merchant.stock.splice(index, 1);
        this.applyMod(entry.id);
        // Refresh the RIG so the bought mod shows, then flash its tile.
        this.hud.updateBuild(this.stats, this.weaponLevels, this.modCounts, this.coreLevels, this.weaponBranches, this.player.maxHp);
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
    const summary = this.finalizeRun(outcome);
    if (!summary) return;
    this.state = 'ended';
    this.audio.emit({ id: outcome === 'defeat' ? 'run-defeat' : 'run-victory', priority: 5 });
    this.audio.stopLoop('foundation-run-loop');
    this.audio.setPaused(true);
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
      summary.earnedContracts,
    );
  }

  /**
   * Durable end-of-run side effects, separated from the reveal.
   *
   * This runs SYNCHRONOUSLY at the fatal instant, never at the end of an
   * animation: a player who alt-F4s during the death beat must still find the
   * run in their history. Returns null when the run was already finalized, which
   * is what makes repeated collision callbacks, skips and action clicks safe.
   */
  private finalizeRun(
    outcome: RunOutcome,
  ): { record: RunRecordV1; earnedContracts: EarnedContract[] } | null {
    if (this.runFinalized) return null;
    this.runFinalized = true;
    this.hud.updateTotemIndicator(false, 0, 0, 0);
    this.hud.updateMerchantIndicator(false, 0, 0, 0, 0);
    this.hud.showInteractPrompt(null, this.interactLabel());
    this.hud.clearChestMarkers();
    const runId = this.currentRunId ?? createRunId();
    this.currentRunId = runId;
    const record = saveRunRecord({
      id: runId,
      outcome,
      map: SCRAPYARD_MAP,
      characterId: this.currentCharacterId,
      ...(this.startingWeapon ? { startingWeapon: this.startingWeapon } : {}),
      // No difficulty selector exists yet, so every run is the one and only
      // curve. Labelling it now means the day a selector lands, these records
      // are still rankable instead of being an unlabelled blob.
      difficulty: DIFFICULTY_ID,
      damageTaken: this.runDamageTaken,
      goldEarned: this.runGoldEarned,
      bossTypesDefeated: [...this.boss.defeatedTypes],
      chestsByTier: this.runChestsByTier,
      shopPurchases: this.runShopPurchases,
      // Rounded: these are seconds of exposure, and sub-millisecond precision
      // would only make the JSON noisy.
      contactS: Math.round(this.runContactS * 10) / 10,
      enclosedS: Math.round(this.runEnclosedS * 10) / 10,
      enclosedLowHpS: Math.round(this.runEnclosedLowHpS * 10) / 10,
      peakEnclosedSectors: this.runPeakEnclosedSectors,
      cursedFinal: Math.round(this.stats.cursedDifficulty * 1000) / 1000,
      cursedTimeAvg:
        this.elapsedS > 0
          ? Math.round((this.runCursedIntegral / this.elapsedS) * 1000) / 1000
          : 0,
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
    telemetry.endRun(record);
    // Ledger first, then contracts read it. Single evaluation point per run:
    // a contract published later completes retroactively for a player who
    // already met it, and rewards land in exactly one place.
    recordRunInLifetime(record);
    saveProfile();
    const earnedContracts = settleContracts();
    return { record, earnedContracts };
  }

  /**
   * Fatal hit accepted. Records the run immediately, freezes the battle, and
   * hands the screen to the defeat presenter.
   *
   * Idempotent by way of `runFinalized`: contact overlap, several attackers in
   * one frame and repeated callbacks all collapse into one transition.
   */
  private beginDefeatTransition(): void {
    const summary = this.finalizeRun('defeat');
    if (!summary) return;
    this.defeatSummary = summary;
    this.defeat = createDefeatState();
    this.defeatSparkCarry = 0;
    this.state = 'defeat-transition';

    // Pending gameplay UI dies with the run: an unclaimed level-up is not
    // auto-picked, it simply never opens. What was already earned is in the
    // record above.
    this.pendingLevelUps = 0;
    this.currentUpgradeOffer = [];
    this.hud.hideLevelUpIntro();
    this.levelUpIntroRemainingS = 0;
    this.hud.showSummonPrompt(false, this.interactLabel());

    // Fatal audio: the dedicated cue REPLACES player-hit (one physical hit, one
    // audio path), sustained weapon loops stop now rather than on the next
    // playing-state update, and the music gets its exact measured fade instead
    // of the pause duck, which only lowers it.
    this.audio.emit({ id: 'player-fatal', priority: 5 });
    this.audio.setSfxLoopsSuspended(true);
    this.audio.fadeOutLoop('foundation-run-loop', DEFEAT_TRANSITION.musicFadeS);

    // One bounded impulse, replacing (not stacking with) the ordinary hit shake.
    this.shakeAmp = DEFEAT_TRANSITION.fatalShakeAmp;

    this.player.beginDefeatPresentation();
    // A confirm already held when the hit landed must not skip anything, so the
    // pending edges are dropped and the controller's gate arms only on release.
    this.input.clearTransientPresses();
    this.hud.armDefeatSkipSurface();
  }

  /**
   * Presentation-only tick. Runs on clamped RAW frame time because the world is
   * frozen: nothing here may touch run time, gameplay counters or telemetry.
   */
  private tickDefeatTransition(rawDt: number): void {
    const defeat = this.defeat;
    if (!defeat) return;
    const dt = Math.min(rawDt, 0.05);

    // A skip needs the live Interact binding or the gamepad confirm, and only
    // as a FRESH press — the same read feeds the release gate.
    const confirmHeld =
      this.input.isActionDown('interact') ||
      this.settings.bindings.gamepad.interact.some((index) => this.input.isGamepadDown(index)) ||
      this.hud.isDefeatPointerHeld();
    // Pointer is read unconditionally so its edge is consumed either way and
    // cannot survive into the next frame as a stale press.
    const pointerSkip = this.hud.consumeDefeatPointerSkip();
    const confirmPressed = this.input.consumeActionPress('interact') || pointerSkip;

    const commands = advanceDefeat(defeat, dt, DEFEAT_TRANSITION, { confirmPressed, confirmHeld });

    const pressure = overloadPressure(defeat, DEFEAT_TRANSITION);
    if (defeat.elapsedS >= DEFEAT_TRANSITION.fatalHitstopS && !defeat.titleRevealed) {
      this.tickOverloadSparks(dt, pressure);
    }
    if (!defeat.titleRevealed) {
      this.player.tickDefeatPresentation(defeat.elapsedS, pressure);
    }
    this.defeatSparks.update(dt);

    if (commands.revealTitle) {
      // The chassis blows out and powers down as the title lands.
      const bounds = this.player.defeatChassisBounds;
      const colors = DEFEAT_TRANSITION.overload.flashColors;
      for (let i = 0; i < colors.length; i++) {
        this.defeatSparks.emit(
          this.player.position.x,
          this.player.position.z,
          bounds.halfWidth,
          bounds.height,
          colors[i] ?? 0xffffff,
          Math.round(DEFEAT_TRANSITION.overload.blowoutSparks / colors.length),
        );
      }
      this.player.powerDownForDefeat();
      this.hud.showDefeatBeat();
      // The sting belongs to the TITLE, not to the physical contact frame.
      this.audio.emit({ id: 'run-defeat', priority: 5 });
    }

    if (commands.revealSummary && this.defeatSummary) {
      this.hud.showEnd(
        'defeat',
        // The map comes from the RECORD, not from a live getter: it is the map
        // that was actually persisted, and it keeps this whole tick free of
        // `currentMap`, which only exists on the multi-map branch.
        this.defeatSummary.record.map,
        this.progression.level,
        this.progression.kills,
        this.elapsedS,
        this.boss.bossesDefeated,
        this.weaponLevels,
        this.weaponBranches,
        this.weaponDamage,
        this.coreLevels,
        this.modCounts,
        this.defeatSummary.earnedContracts,
        false, // actions stay disabled until the release gate arms
      );
      // The catcher's job is over: from here the buttons own the pointer.
      this.hud.disarmDefeatSkipSurface();
    }

    // Actions become live only once they are visible AND the gate is armed, so
    // the press that skipped can never also select one.
    if (defeat.summaryRevealed) {
      const accepting = actionsAcceptInput(defeat);
      this.hud.setEndActionsEnabled(accepting);
      if (accepting && defeat.phase === 'ready' && !this.defeatActionsFocused) {
        this.defeatActionsFocused = true;
        this.hud.focusPrimaryEndAction();
      }
    }
  }

  /** Voxel cubes venting from the chassis volume, back-loaded across the
   *  overload so the beat builds towards the blowout. */
  private tickOverloadSparks(dt: number, pressure: number): void {
    const cfg = DEFEAT_TRANSITION.overload;
    const bounds = this.player.defeatChassisBounds;
    this.defeatSparkCarry += cfg.sparksPerS * Math.pow(pressure, cfg.rampPower) * dt;
    const count = Math.floor(this.defeatSparkCarry);
    if (count <= 0) return;
    this.defeatSparkCarry -= count;
    const colors = cfg.flashColors;
    this.defeatSparks.emit(
      this.player.position.x,
      this.player.position.z,
      bounds.halfWidth,
      bounds.height,
      colors[Math.floor(Math.random() * colors.length)] ?? 0xffffff,
      count,
    );
  }

  /** Defeat action: abandon the dead run and enter the normal selection flow.
   *  Never reuses the finished run and never advances a map. */
  private startNewRunFromDefeat(): void {
    this.endDefeatPresentation();
    this.currentRunId = null;
    this.currentUpgradeOffer = [];
    this.resetRunWorld();
    this.state = 'menu';
    this.hud.hideGold();
    this.audio.reset();
    void this.audio.preloadEnabled();
    this.audio.setMenu(true);
    this.hud.showCharacterSelect();
    this.clock.getDelta();
  }

  /** Tears the defeat presenter down. Safe when no defeat ran. */
  private endDefeatPresentation(): void {
    this.defeat = null;
    this.defeatSummary = null;
    this.defeatSparkCarry = 0;
    this.defeatActionsFocused = false;
    this.defeatSparks.reset();
    this.player.resetDefeatPresentation();
    this.hud.hideEnd();
    this.hud.disarmDefeatSkipSurface();
    this.hud.resetEndActions();
  }

  private defeatActionsFocused = false;
}
