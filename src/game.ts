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
  ENEMIES,
  ENEMY_TYPES,
  FINAL_BOSS,
  FINAL_BOSS_TYPE_INDEX,
  GOLD,
  MAPS,
  POWERCELL_PROP,
  PROP_STRUCTURE_CLEARANCE,
  FOUNDRY_CONTAINER_PROP,
  FOUNDRY_PILLAR_PROP,
  MAP_TRANSITION,
  MERCHANT,
  MODS,
  PICKUPS,
  PLAYER,
  PRESSURE_METRICS,
  RECORDING,
  VISUAL,
  XP_ORBS,
  difficultyScalar,
  rewardScalar,
  type MapId,
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
import type { UiAudioEventId } from './ui-audio';
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
  updateArenaWalls,
  updateCamera,
  placeRandomProps,
  clearProps,
  findRandomClearSpot,
  hasLineOfSight,
  type Obstacle,
  type WorldMapController,
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
  advanceRunFlow,
  completeFinale,
  markMapBossDefeated,
  createRunFlowState,
  enterMap,
  type RunFlowState,
} from './run-flow';
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
  | 'boot'
  | 'menu'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'levelup-intro'
  | 'levelup'
  | 'chest'
  | 'shop'
  /** Animated sector-to-sector transition. Gameplay is frozen while the curtain
   *  fades out, the world swaps at full black, and it fades back in. */
  | 'map-transition'
  /** Staged defeat beat. The run is already durably recorded here; only the
   *  presentation is still running. Terminal, and never advances to a map. */
  | 'defeat-transition'
  | 'ended';

// Warmup frames rendered behind the loading screen after the world is built,
// so first-render shader compiles / GPU uploads happen HIDDEN — the reveal is
// then smooth instead of the old hitch when everything loaded on the first
// visible frame (user request 2026-07-12). A future load animation extends this.
const LOADING_WARMUP_FRAMES = 8;

/** The single difficulty that exists today. Stamped on every run record so a
 *  future selector does not leave this era's runs unlabelled — leaderboards
 *  that mix difficulties rank nothing, and a finished run cannot be relabelled. */
const DIFFICULTY_ID = 'standard';

const tmpProject = new THREE.Vector3();

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer | null = null;
  private readonly scene: THREE.Scene;
  private readonly worldMaps: WorldMapController;
  private readonly camera: THREE.PerspectiveCamera;
  /** Timer, not the deprecated Clock. reset() discards the time an overlay or
   *  a load ate; update() advances one simulation step. Deliberately NOT
   *  connect()ed to the document: the Page Visibility path would zero the delta
   *  on its own, and every pause already discards its own time explicitly. */
  private readonly timer = new THREE.Timer();
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
  /** Collision the ACTIVE MAP owns (Map 2's perimeter towers). Kept apart from
   *  prop collision because props regenerate per run while these do not. */
  private mapObstacles: Obstacle[] = [];

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
  private state: GameState = 'boot';
  /** Loading handoff: the picked weapon, whether the world is built yet, and
   *  the warmup countdown (see LOADING_WARMUP_FRAMES). */
  private pendingWeapon: WeaponId | null = null;
  private pendingCharacterId: CharacterId = DEFAULT_CHARACTER_ID;
  private currentCharacterId: CharacterId = DEFAULT_CHARACTER_ID;
  private pendingMapId: MapId = MAPS[0].id;
  private runReady = false;
  private warmupFrames = 0;
  /** Frames to wait so the loading screen PAINTS before the world-build hitch
   *  runs (rAF fires before paint, so the first loading frame is just shown). */
  private loadingDelay = 0;
  private elapsedS = 0;
  private runFlow: RunFlowState = createRunFlowState();
  /** Non-null only during the 'map-transition' state: the animated curtain's
   *  progress and the map it swaps to at full black. */
  private mapTransition: {
    elapsedS: number;
    nextMapIndex: number;
    swapped: boolean;
    /** DEV shortcut only: overlay a recorded build at full black, so the jump
     *  lands in the next map equipped instead of with the current one. */
    simulateBuild: boolean;
    /** The finale's arena reset rather than a sector crossing: same curtain,
     *  same map, no sector credited and no build overlay. */
    finale: boolean;
    /** The spawn cue fires once, just before the curtain finishes lifting. */
    spawnCued: boolean;
    /** DEV: overlay the recorded build even over live progress (SHIFT). */
    forceRecordedBuild: boolean;
  } | null = null;
  /** The Marshal's death beat: the explosion plays out and the results screen
   *  opens when it ends. Non-null only during that hold. */
  private finaleVictory: {
    elapsedS: number;
    step: number;
    x: number;
    z: number;
    outcome: RunOutcome;
  } | null = null;
  /** Set when the finale's curtain lifts: the arrival is attempted every frame
   *  until a spot exists. A failed placement must NOT replay the curtain — the
   *  sector would reset twice for one finale. */
  private pendingFinaleArrival = false;
  /** Shared identity for packaged telemetry and the terminal-only local record. */
  private currentRunId: string | null = null;
  /** Terminal side effects (history, telemetry, contracts and HUD) may run once per run. */
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
  /** Elite payout multiplier: the share of this frame's difficulty the clock
   *  did NOT produce. See config.rewardScalar. */
  private currentRewardScale = 1;
  /** Latest difficulty scalar, kept for the dev readout (DEV_TOOLS.difficultyReadout). */
  private currentDifficulty = 1;
  /** Latest roster clock — which enemy introductions this map has reached. */
  private currentRosterElapsedS = 0;
  /** Throttles the dev readout to 4 Hz; a per-frame DOM write is not free. */
  private readoutTimer = 0;
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

  private get currentMap(): RunMapRef {
    const map = MAPS[this.runFlow.mapIndex] ?? MAPS[0];
    return { id: map.id, number: map.number, title: map.title };
  }

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
      // The braces matter. `() => removeDisplayInfoListener()` RETURNS the value
      // of ipcRenderer.removeListener, which is ipcRenderer itself, and Electron
      // reads any non-undefined return from beforeunload as "cancel the unload"
      // -- the opposite of a browser, which would only prompt. Swallow it, so a
      // teardown detail can never argue with the window trying to close.
      window.addEventListener('beforeunload', () => { removeDisplayInfoListener(); }, { once: true });
    }
    this.renderer = createRenderer(container);
    const world = createScene();
    this.scene = world.scene;
    this.worldMaps = world.maps;
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
      (character, weapon, mapId) => this.enterLoading(character, weapon, mapId),
      (card) => this.applyUpgrade(card),
      () => this.resumeRun(),
      () => this.quitToMenu(),
      () => this.startNewRunFromDefeat(),
      (settings) => this.updateSettings(settings),
      (event) => this.playUiEvent(event),
      async (feedback) => {
        if (!this.currentRunId) return false;
        return telemetry.feedback(this.currentRunId, feedback);
      },
      telemetry.isAvailable(),
    );
    this.audio = new AudioDirector(this.settings);
    void this.audio.preloadEnabled();
    // The finale's attacks need the HUD, the particle pools and the audio
    // director, all of which are born AFTER the boss system. Wiring them here
    // rather than in BossSystem's constructor keeps that order honest instead
    // of reshuffling construction to hide it.
    this.boss.setEffects({
      // Telegraphed by definition: everything routed through here is a boss
      // attack the player was shown before it fired, so it pierces the i-frame.
      damagePlayer: (amount) => this.damagePlayer(amount, -1, true),
      // Live, not captured: Max HP cores can land between two attacks.
      playerMaxHp: () => this.player.maxHp,
      burst: (x, z, color, count, y) => this.burst.spawn(x, z, color, count, y),
      ring: (x, z, color, cubes, radius) => this.spawnBurstRing(x, z, color, cubes, radius),
      shake: (amp) => {
        this.shakeAmp = Math.max(this.shakeAmp, amp);
      },
      banner: (text) => this.hud.banner(text),
      sound: (id, priority, x, z) =>
        this.audio.emit({
          id,
          priority,
          ...(x === undefined || z === undefined ? {} : { pos: { x, z } }),
        }),
    });
    if (DEV_TOOLS.auditionKeys) this.installAuditionKeys();
    if (DEV_TOOLS.bossLab) this.installBossLab();
    if (DEV_TOOLS.mapTransitionKey) this.installMapTransitionKey();
    if (DEV_TOOLS.finaleKey) this.installFinaleKey();
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
  private enterLoading(
    characterId: CharacterId,
    startingWeapon: WeaponId,
    mapId: MapId = MAPS[0].id,
  ): void {
    this.pendingCharacterId = resolveCharacterId(characterId, PROFILE);
    this.pendingWeapon = startingWeapon;
    this.pendingMapId = mapId;
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
      if (this.pendingWeapon) {
        this.buildRun(this.pendingCharacterId, this.pendingWeapon, this.pendingMapId);
      }
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
          mapId: this.currentMap.id,
          mapNumber: this.currentMap.number,
          difficulty: DIFFICULTY_ID,
          startingWeaponId: this.startingWeapon,
        });
      }
      this.timer.reset(); // Discard the time spent building + warming up.
    }
  }

  private buildRun(
    requestedCharacterId: CharacterId,
    startingWeapon: WeaponId,
    selectedMapId: MapId = MAPS[0].id,
  ): void {
    this.currentCharacterId = resolveCharacterId(requestedCharacterId, PROFILE);
    this.resetRunWorld();
    clearProps(this.scene, this.propMeshes);
    this.propMeshes = [];
    this.obstacles.length = 0;
    // DEV: jump straight into Map 2 so the second sector can be playtested
    // without clearing Map 1 first (DEV_TOOLS.simulateMap1Handoff); the recorded
    // build is overlaid once the fresh run state is in place, below.
    const effectiveMapId = DEV_TOOLS.simulateMap1Handoff
      ? (MAPS[1]?.id ?? selectedMapId)
      : selectedMapId;
    const selectedMapIndex = MAPS.findIndex((map) => map.id === effectiveMapId);
    const startMapIndex = selectedMapIndex >= 0 ? selectedMapIndex : 0;
    const startMap = MAPS[startMapIndex] ?? MAPS[0];
    this.runFlow = createRunFlowState(startMapIndex);
    this.elapsedS = 0;
    this.mapTransition = null;
    this.pendingFinaleArrival = false;
    this.finaleVictory = null;
    this.mapObstacles = [...this.worldMaps.setMap(startMap.id)];
    this.obstacles.push(...this.mapObstacles);
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
    if (startMapIndex === 0) {
      // Map 1 owns the totem. Totem first: prop placement reads its position
      // so the randomized layout never walls it off.
      if (!this.boss.startRun()) throw new Error('Unable to place the boss totem inside the arena.');
    }
    // Props are placed for WHICHEVER map the run starts on. Gating this behind
    // map 1 meant a run that opened on Map 2 (dev handoff, or any later map
    // select) got a bare floor.
    this.regenerateProps(startMap.id);
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
    this.hud.updateBuild(this.stats, this.player.maxHp, this.weaponLevels, this.modCounts, this.coreLevels, this.weaponBranches);
    // "As if we had played Map 1 and crossed": overlay a full Map 1 run's build
    // so Map 2 is playtested with a realistic loadout, not a fresh one — and
    // advance the arc clock with it, since the swarm's HP, type mix and elite
    // ramp all read that clock. Build without clock would pit a finished build
    // against a minute-zero swarm and call the map easy.
    if (DEV_TOOLS.simulateMap1Handoff) {
      this.fastForwardArcClockPastMap1();
      this.overlayLatestRecordedBuild('Map 2 sim');
    }
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

  /** Overlays a recorded run's build (character, stats, weapons, mods, cores,
   *  level) onto the LIVE run without walking the upgrade path. Shared by the
   *  boss lab and the Map 2 dev-start (DEV_TOOLS.simulateMap1Handoff). Stats are
   *  REPLAYED from core picks rather than restored: the record stores how many
   *  times each core was taken, never which rarity rolled — see
   *  replayCoresOntoStats. Callers refresh the build HUD after any further setup. */
  private applyRecordedBuild(record: RunRecordV1): void {
    // Preserve the registered character recorded with the build. Older or
    // unknown ids fall back to the default, but current unlocks cannot rewrite
    // the identity of an existing run record.
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
    // Direct replay mutates stats/player only; it never enters the gameplay
    // upgrade path that triggers Field Repair.
    replayCoresOntoStats(this.stats, this.player, this.coreLevels);
    this.progression.level = record.level;
    // HP cores act on the player object directly (the `_p` arg the stat cards
    // take), so replayCoresOntoStats above already applied them — just top up.
    this.player.hp = this.player.maxHp;
  }

  /** A recorded run that actually SURVIVED all of Map 1.
   *
   *  Duration is the ONLY signal here, and that is the point: `sectorsCleared`
   *  and `mapsReached` look authoritative but a dev shortcut fakes both, because
   *  the T key goes through the same `enterMap` a real crossing does. Trusting
   *  them made a 90-second level-2 run — two weapons at level 1, no cores —
   *  outrank every genuine Map 1 clear in the history purely by being newest,
   *  which is exactly the build the shortcut then loaded. A time-on-the-clock
   *  test cannot be forged by a key press. */
  private static completedMap1(record: RunRecordV1): boolean {
    return record.durationS >= (MAPS[0]?.durationS ?? 0);
  }

  /** One-line description of what a record's build actually contains, so the
   *  toast proves what got loaded instead of asserting it. */
  private static describeRecord(record: RunRecordV1): string {
    const weapons = Object.entries(record.weaponLevels ?? {})
      .filter(([, level]) => (level as number) > 0)
      .map(([id, level]) => `${id} ${level}`)
      .join(', ');
    const cores = Object.values(record.coreLevels ?? {}).filter((level) => (level ?? 0) > 0).length;
    const mods = Object.values(record.modCounts ?? {}).filter((count) => (count ?? 0) > 0).length;
    return `lv ${record.level}, ${cores} cores, ${mods} mods — ${weapons || 'no weapons'}`;
  }

  /** What a boss's BODY costs to touch on the current map. Covers the ram and
   *  plain contact alike — one number, so the two can never drift apart.
   *
   *  Boss PROJECTILES are deliberately excluded: they are dodgeable telegraphed
   *  attacks with their own tuning, and the finale's are part of an encounter
   *  nobody has balanced yet. */
  private bossContactDamage(): number {
    return BOSS.contactDamage * (MAPS[this.runFlow.mapIndex]?.bossContactDamageMult ?? 1);
  }

  /** Has this run actually built something worth carrying across?
   *
   *  Anything the player earned in play beats any recording: a recorded build is
   *  a STAND-IN for a Map 1 nobody played, never a replacement for one they did. */
  private hasLiveProgress(): boolean {
    if (this.progression.level > 1) return true;
    if (Object.values(this.modCounts).some((count) => (count ?? 0) > 0)) return true;
    if (Object.values(this.coreLevels).some((level) => (level ?? 0) > 0)) return true;
    return Object.values(this.weaponLevels).some((level) => (level ?? 0) > 1);
  }

  /** DEV: overlays a recorded run's build onto the live run, so a development
   *  shortcut lands with a realistic loadout instead of a stub one.
   *
   *  Does NOTHING when the live run already has progress. Overwriting a build the
   *  player just earned in Map 1 with some older recording is the opposite of
   *  what the shortcut is for: you press T to test the crossing WITH your run,
   *  and the overlay exists only to cover the case where there is no run to carry.
   *
   *  Otherwise prefers the newest run that finished Map 1, falls back to the
   *  newest run of any kind and SAYS SO — a half-run build silently standing in
   *  for a full one is exactly how a difficulty test lies. */
  private overlayLatestRecordedBuild(label: string, force = false): void {
    // `force` is the dev shortcut's SHIFT variant: load the recorded test build
    // over whatever this run has earned. The default still refuses, and that is
    // still right — you press the key to test the crossing WITH your run — but
    // testing the boss needs a build the recorded run actually reached, and a
    // half-played Map 1 is not it.
    if (!force && this.hasLiveProgress()) {
      const weapons = Object.entries(this.weaponLevels)
        .filter(([, level]) => (level as number) > 0)
        .map(([id, level]) => `${id} ${level}`)
        .join(', ');
      this.hud.toast(`${label}: carrying THIS run's build (lv ${this.progression.level} — ${weapons})`);
      return;
    }
    const history = loadRunHistory()
      .slice()
      .sort((a: RunRecordV1, b: RunRecordV1) => Date.parse(b.endedAt) - Date.parse(a.endedAt));
    const full = history.find((entry) => Game.completedMap1(entry));
    // No genuine Map 1 clear on record: take the most ADVANCED run instead of
    // the most recent one. Recency is worthless here — the newest run is usually
    // the last thing that died in twenty seconds, and a stub build would make the
    // foundry look impossible for reasons that have nothing to do with the map.
    const best = history
      .slice()
      .sort((a: RunRecordV1, b: RunRecordV1) => b.level - a.level)[0];
    const record = full ?? best;
    if (!record) {
      this.hud.toast(`${label}: no recorded run yet — keeping the fresh build`);
      return;
    }
    this.applyRecordedBuild(record);
    this.hud.updateBuild(this.stats, this.player.maxHp, this.weaponLevels, this.modCounts, this.coreLevels, this.weaponBranches);
    this.hud.toast(
      full
        ? `${label}: full Map 1 build (${Math.round(record.durationS)}s) — ${Game.describeRecord(record)}`
        : `${label}: NO full Map 1 clear on record. Loaded the most advanced run instead (${Math.round(record.durationS)}s) — ${Game.describeRecord(record)}`,
    );
  }

  /** DEV: pretend a whole Map 1 was played, for the shortcuts that skip it.
   *
   *  The arc clock is not cosmetic any more. Enemy HP, the type mix and the
   *  elite ramp all read it (see EnemySystem.update), so a T pressed at 0:30
   *  would drop the player into a Swarm Foundry whose swarm is at a 1.15x HP
   *  multiplier instead of the 4.0x a real crossing hands over — the shortcut
   *  would report the map as trivial and the report would be pure artifact.
   *
   *  Never rewinds: pressing T late in a long Map 1 keeps the real clock.
   *  Returns the seconds it had to invent, so the caller can say how much of
   *  Map 1 the build actually lived through. */
  private fastForwardArcClockPastMap1(): number {
    const map1Duration = MAPS[0]?.durationS ?? 0;
    const skipped = Math.max(0, map1Duration - this.runFlow.totalElapsedS);
    if (skipped <= 0) return 0;
    this.runFlow.totalElapsedS = map1Duration;
    this.elapsedS = map1Duration;
    return skipped;
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

    this.applyRecordedBuild(record);

    // Jumping the CLOCK is what reproduces the real fight: density, enemy
    // types and the HP ramp are all derived from it. The lab never empties the
    // arena — the whole difficulty is killing a boss while the wave is on you.
    this.elapsedS = BOSS_LAB.atMinute * 60;
    this.runFlow.totalElapsedS = this.elapsedS;
    this.runFlow.mapElapsedS = this.elapsedS;
    this.hud.updateBuild(
      this.stats,
      this.player.maxHp,
      this.weaponLevels,
      this.modCounts,
      this.coreLevels,
      this.weaponBranches,
    );
    // Fill the arena to its minute-8 population BEFORE the boss lands. A boss
    // dropped onto an empty field tests nothing — the whole difficulty is
    // fighting it while the wave is already on you.
    // The lab jumps the clock, so it fills against the CURRENT map's curve —
    // a hardcoded global one would populate the arena for a map the boss is
    // not standing in.
    const labCurve = MAPS[this.runFlow.mapIndex]?.difficulty ?? MAPS[0].difficulty;
    const labDifficulty = difficultyScalar(
      this.runFlow.mapElapsedS,
      this.stats.cursedDifficulty,
      labCurve,
    );
    const filled = this.enemies.devFillToCap(
      this.elapsedS,
      this.runFlow.mapElapsedS * (MAPS[this.runFlow.mapIndex]?.rosterSpeed ?? 1),
      labDifficulty,
      rewardScalar(labDifficulty, labCurve),
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
  /** DEV (DEV_TOOLS.mapTransitionKey): T jumps straight to the sector
   *  transition, so its animation can be iterated without playing a full map and
   *  killing a boss first. It advances the arc through run-flow's own enterMap
   *  and then runs the REAL transition, so what you see is what players get. */
  private installMapTransitionKey(): void {
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyT' || e.repeat || this.state !== 'playing') return;
      const nextMapIndex = this.runFlow.mapIndex + 1;
      if (nextMapIndex >= MAPS.length) {
        // On the LAST map the same key jumps to the finale instead of refusing.
        // It does it by winding the map clock to its end, so the finale still
        // arrives through advanceRunFlow's real 'start-finale' action — a hand
        // rolled call would test a path players never take.
        e.preventDefault();
        this.windClockToFinale();
        return;
      }
      e.preventDefault();
      // Order matters: the arc clock is advanced BEFORE enterMap, which resets
      // only the per-map clock. Skipping this leaves Map 2 running a swarm built
      // for whatever second of Map 1 the key was pressed on.
      const playedS = this.runFlow.totalElapsedS;
      const skipped = this.fastForwardArcClockPastMap1();
      // The swarm can be told Map 1 is over; a build cannot. Say so, or the
      // reading gets blamed on the map instead of on the shortcut.
      if (skipped > 60 && this.hasLiveProgress()) {
        this.hud.toast(
          `Map transition: swarm set to a FULL Map 1, but this build only lived ${Math.round(playedS)}s of it — it will bite harder than a real crossing`,
        );
      }
      enterMap(this.runFlow, nextMapIndex);
      this.beginMapTransition(nextMapIndex, true);
    });
  }

  /** Winds the CURRENT map's clock to its last second, so `advanceRunFlow`
   *  issues its own `start-finale` on the next frame. Shared by both dev keys
   *  because the alternative — calling startFinale() directly — would test a
   *  path no player can take, and would drift from the real one the day the
   *  trigger changes. Safe while a curtain is up: update() does not run in the
   *  'map-transition' state, so the wound clock simply waits for it to lift. */
  private windClockToFinale(): boolean {
    if (this.runFlow.finaleStarted) {
      this.hud.toast('Finale: the Hazard Marshal is already inbound');
      return false;
    }
    const map = MAPS[this.runFlow.mapIndex];
    if (map) this.runFlow.mapElapsedS = map.durationS;
    return true;
  }

  /** DEV (DEV_TOOLS.finaleKey): Y goes straight to the finale from ANYWHERE in
   *  the arc, carrying the live run exactly as T does.
   *
   *  T only reaches it from inside the foundry, so from a fresh run the finale
   *  still costs a full Map 1, a boss kill and ten more minutes. Y crosses
   *  whatever is left of the arc through run-flow's own `enterMap` — the same
   *  call a real crossing makes, sector credit included — and then winds the
   *  foundry's clock, so the encounter still arrives through the structural
   *  `start-finale` rather than through a private back door. */
  private installFinaleKey(): void {
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyY' || e.repeat || this.state !== 'playing') return;
      e.preventDefault();
      // SHIFT+Y loads the recorded TEST build over whatever this run earned.
      // Plain Y carries the live run, which is the right default — but a boss
      // pass needs a build a real run actually reached, and half a played Map 1
      // is not that. Both are one key press, so neither needs a rebuild.
      const force = e.shiftKey;
      const lastMapIndex = MAPS.length - 1;
      if (this.runFlow.mapIndex === lastMapIndex) {
        // Already in the foundry: there is no crossing curtain to hide the swap
        // behind, so the overlay happens here, before the clock is wound.
        if (force) this.overlayLatestRecordedBuild('Finale', true);
        if (this.windClockToFinale()) {
          this.hud.toast('Finale: winding the foundry clock to its last second');
        }
        return;
      }
      // Same order as the T key, and for the same reason: the arc clock has to
      // be advanced BEFORE enterMap, which only resets the per-map one.
      const playedS = this.runFlow.totalElapsedS;
      const skipped = this.fastForwardArcClockPastMap1();
      if (skipped > 60 && this.hasLiveProgress()) {
        this.hud.toast(
          `Finale: swarm set to a FULL Map 1, but this build only lived ${Math.round(playedS)}s of it — the Marshal will bite harder than in a real arc`,
        );
      }
      enterMap(this.runFlow, lastMapIndex);
      // The crossing curtain first, then the finale: the clock is wound now and
      // fires the moment the curtain lifts, because update() is frozen while a
      // transition runs. Two curtains back to back is what a real arc does too.
      this.beginMapTransition(lastMapIndex, true, force);
      this.windClockToFinale();
    });
  }

  private installFatalHitKey(): void {
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyK' || e.repeat || this.state !== 'playing') return;
      e.preventDefault();
      this.player.clearInvulnerability();
      this.damagePlayer(this.player.maxHp * 100);
    });
  }

  private playUiEvent(id: UiAudioEventId): void {
    void this.audio.activateFromUserGesture().then(() => {
      const volume = id === 'ui-focus' ? AUDIO.ui.focusVolume : id === 'ui-back' ? AUDIO.ui.backVolume : 1;
      this.audio.emit({ id, volume });
    });
  }

  /** Turns the first input edge into Web Audio activation before exposing any
   *  interactive menu controls. consumeAnyPress() drains every pending edge,
   *  so the initiating key/button cannot also navigate the revealed menu. */
  private dismissBoot(): void {
    if (this.state !== 'boot') return;
    this.state = 'menu';
    this.audio.setMenu(true);
    this.hud.showMainMenu();
    void this.audio.activateFromUserGesture().then(() => {
      if (this.state !== 'menu' || !this.hud.isMainMenuVisible()) return;
      this.audio.emit({ id: 'menu-music', key: 'menu-music-loop', loop: true, priority: 2, volume: AUDIO.music.menuLoopVolume });
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
    this.hud.updateBuild(this.stats, this.player.maxHp, this.weaponLevels, this.modCounts, this.coreLevels, this.weaponBranches);
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
    this.timer.reset();
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
    this.hud.updateBuild(this.stats, this.player.maxHp, this.weaponLevels, this.modCounts, this.coreLevels, this.weaponBranches);
    // First copy = a socket just filled → stronger pop than a plain level-up.
    const weaponId = weaponIdFromUpgradeCard(card.id);
    const installed = weaponId
      ? this.weaponLevels[weaponId] === 1
      : (this.coreLevels[card.id] ?? 0) === 1;
    this.hud.flashBuildRow(weaponId ? `weapon-${weaponId}` : card.id, installed);
    this.state = 'playing';
    this.timer.reset(); // Discard time spent choosing.
    this.maybeShowLevelUp(); // Chains the next card if more levels are owed.
  }

  private frame(): void {
    // Raw delta feeds the FPS instrument (the clamp would hide slow frames).
    // Timer splits advancing from reading: update() once per simulation step,
    // then getDelta() as often as needed without the value shifting.
    this.timer.update();
    const rawDt = this.timer.getDelta();
    const dt = Math.min(rawDt, 0.05);
    this.input.poll();
    if (this.state === 'boot') {
      if (this.input.consumeAnyPress()) this.dismissBoot();
      return;
    }
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
    else if (this.state === 'map-transition') this.tickMapTransition(rawDt);
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
    // After the camera moves, not before: the fade depends on where it ended up.
    updateArenaWalls(this.camera);
    if (VISUAL.screenShake.enabled && this.shakeAmp > 0.005) {
      this.camera.position.x += (Math.random() - 0.5) * 2 * this.shakeAmp;
      this.camera.position.z += (Math.random() - 0.5) * 2 * this.shakeAmp;
      this.shakeAmp *= Math.max(0, 1 - VISUAL.screenShake.decayPerS * rawDt);
    }
    if (this.state === 'levelup-intro') this.tickLevelUpIntro(dt);
    this.damageNumbers.update(dt, this.camera, this.player.position.x, this.player.position.z);
    // The menu is a view OUTSIDE the game: skip the 3D render entirely so no
    // scene runs behind it (the opaque menu backdrop covers the canvas). The
    // boot state returned earlier in this frame; every remaining non-menu
    // state — including 'loading' warmup — renders normally.
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
    if (DEV_TOOLS.difficultyReadout && this.state === 'playing') this.tickDifficultyReadout(rawDt);
  }

  /** DEV: the live difficulty state, refreshed a few times a second.
   *
   *  Every number here is READ from the same values the systems use, never
   *  recomputed from the config by hand — a readout that derives its own answer
   *  can agree with the design document while the game does something else. */
  private tickDifficultyReadout(rawDt: number): void {
    this.readoutTimer -= rawDt;
    if (this.readoutTimer > 0) return;
    this.readoutTimer = 0.25;
    const map = this.currentMap;
    const config = MAPS[this.runFlow.mapIndex] ?? MAPS[0];
    const curve = config.difficulty;
    const clock = (seconds: number): string =>
      `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
    const hpMult =
      (1 + (this.elapsedS / 60) * ENEMIES.hpRampPerMinute) * Math.max(1, this.currentDifficulty);
    const contact = PLAYER.contactDamage * config.contactDamageMult;
    this.hud.updateDevReadout([
      `MAP ${map.number} ${map.title}`,
      `map ${clock(this.runFlow.mapElapsedS)}  arc ${clock(this.elapsedS)}`,
      `diff ${this.currentDifficulty.toFixed(2)} (${curve.floor}-${curve.peak})`,
      `enemy hp x${hpMult.toFixed(2)}  contact ${contact.toFixed(1)}`,
      `roster ${clock(this.currentRosterElapsedS)} (x${config.rosterSpeed})`,
      `alive ${this.enemies.activeCount}`,
    ]);
  }

  private handleEscape(): void {
    if (this.hud.isSettingsOpen()) {
      this.hud.closeSettingsFromBack();
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
    this.timer.reset(); // Discard time spent paused.
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
        map: this.currentMap,
        durationS: Math.round(this.elapsedS * 1_000) / 1_000,
        sectorsCleared: this.runFlow.sectorsCleared,
        mapsReached: this.runFlow.mapIndex + 1,
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
    this.timer.reset();
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

  /** Clears only map-local/transient actors. Build, XP progression, currency,
   * discards and all run-wide counters deliberately survive the boundary. */
  private resetForMapTransition(): void {
    this.player.enterMap();
    this.enemies.reset();
    this.enemyShots.reset();
    this.weapons.reset();
    this.pickups.reset();
    this.orbs.reset();
    this.damageNumbers.reset();
    this.boss.clearForMapTransition();
    this.burst.reset();
    this.goldSys.reset();
    this.merchant.reset(this.elapsedS);
    this.hud.clearChestMarkers();
    this.frenzyS = 0;
    this.hasteS = 0;
    this.overloadS = 0;
    this.phaseS = 0;
    this.hitstopS = 0;
    this.killWindowS = 0;
    this.hud.updateBuffs([]);
    this.hud.showSummonPrompt(false, this.interactLabel());
    this.hud.updateTotemIndicator(false, 0, 0, 0);
    this.hud.updateMerchantIndicator(false, 0, 0, 0, 0);
    this.hud.showInteractPrompt(null, this.interactLabel());
  }

  /** Starts the animated sector transition instead of swapping the world in one
   *  frame. Gameplay freezes (state leaves 'playing'); the real swap happens at
   *  full black inside tickMapTransition, which is what removes the dry cut. */
  private beginMapTransition(
    nextMapIndex: number,
    simulateBuild = false,
    forceRecordedBuild = false,
  ): void {
    const nextMap = MAPS[nextMapIndex] ?? MAPS[MAPS.length - 1] ?? MAPS[0];
    this.mapTransition = {
      elapsedS: 0,
      nextMapIndex,
      swapped: false,
      simulateBuild,
      finale: false,
      spawnCued: false,
      forceRecordedBuild,
    };
    this.state = 'map-transition';
    this.hud.showMapFade(0, `ENTERING ${nextMap.title.toUpperCase()}`);
  }

  /** The finale's arena reset: the SAME curtain a sector crossing uses, on the
   *  same map. Behind the black the field is wiped, the player returns to the
   *  centre and the props are rolled again with the middle left empty, so the
   *  boss fight opens on clean ground instead of wherever ten minutes of run
   *  happened to leave things. */
  private beginFinaleArena(): void {
    this.mapTransition = {
      elapsedS: 0,
      nextMapIndex: this.runFlow.mapIndex,
      swapped: false,
      simulateBuild: false,
      finale: true,
      spawnCued: false,
      forceRecordedBuild: false,
    };
    this.state = 'map-transition';
    // Says WHAT is starting, not what just ended: "SECTOR SEALED" described the
    // door closing behind the player and left the actual event — a boss fight —
    // to be inferred. UI copy stays English (guardrail 3) even though the call
    // came in Spanish; there is no Spanish string anywhere in the shipped game.
    this.hud.showMapFade(0, 'FINAL BOSS PHASE');
  }

  /** Advances the fade curtain: fade out -> swap the world at full black (once)
   *  -> hold on the sector name -> fade back in -> resume play. */
  private tickMapTransition(rawDt: number): void {
    const mt = this.mapTransition;
    if (!mt) {
      this.state = 'playing';
      return;
    }
    const dt = Math.min(rawDt, 0.05);
    mt.elapsedS += dt;
    const { fadeOutS, holdS, fadeInS } = MAP_TRANSITION;
    const fadeInStart = fadeOutS + holdS;
    const total = fadeInStart + fadeInS;

    // The swap is hidden at full black so the cut is never seen. Doing it here,
    // not in beginMapTransition, is what removes the dry one-frame jump.
    if (!mt.swapped && mt.elapsedS >= fadeOutS) {
      if (mt.finale) this.openFinaleArena();
      else this.transitionToMap(mt.nextMapIndex);
      // DEV jump only: equip the recorded build behind the black, so the shortcut
      // arrives the way a real crossing would rather than with a stub loadout.
      if (mt.simulateBuild) this.overlayLatestRecordedBuild('Map transition', mt.forceRecordedBuild);
      // Announce the sector at the same instant, so the name lands on the black
      // rather than riding in over the map it is replacing.
      this.hud.playMapFadeLabel();
      mt.swapped = true;
    }

    let opacity: number;
    if (mt.elapsedS < fadeOutS) opacity = mt.elapsedS / fadeOutS;
    else if (mt.elapsedS < fadeInStart) opacity = 1;
    else opacity = Math.max(0, 1 - (mt.elapsedS - fadeInStart) / fadeInS);
    this.hud.showMapFade(opacity);
    // The music rides the SAME curve as the curtain, so the sector change reads
    // as one event: silent at full black, back up as the new map appears. A cut
    // that only faded the picture left the old map's bed playing over the new one.
    this.audio.setLoopVolume('foundation-run-loop', AUDIO.music.runLoopVolume * (1 - opacity));

    // The spawn cue lands just UNDER the reveal, not at the swap: at the swap
    // the screen is still fully black and the sound is over before the map
    // exists. Both a sector crossing and the finale arena get it — each one
    // puts the player down on a floor, which is the same event as a run start.
    if (!mt.spawnCued && mt.elapsedS >= total - MAP_TRANSITION.spawnCueLeadS) {
      mt.spawnCued = true;
      this.audio.emit({ id: 'run-start', priority: 3 });
    }

    if (mt.elapsedS >= total) {
      this.hud.hideMapFade();
      // Land exactly on the run level: the per-frame ramp only ever approaches it.
      this.audio.setLoopVolume('foundation-run-loop', AUDIO.music.runLoopVolume);
      // The arrival telegraph starts once the curtain is OFF: its whole job is
      // to be seen, and a beam strobing behind full black is a beat spent on
      // nobody. update() retries it until a spot exists.
      if (mt.finale) this.pendingFinaleArrival = true;
      this.mapTransition = null;
      this.state = 'playing';
    }
  }

  private transitionToMap(nextMapIndex: number): void {
    const nextMap = MAPS[nextMapIndex];
    if (!nextMap) throw new Error(`Missing map configuration at index ${nextMapIndex}.`);
    this.resetForMapTransition();
    // Crossing is a reward, not a punishment for surviving on the wire: the arc
    // decision (docs/PLAN_MAPA2.md, 0.3) heals to full and restarts the economy
    // from zero. Build (weapons/cores/mods/sockets) and level carry over intact.
    this.player.hp = this.player.maxHp;
    this.gold = 0;
    this.hud.updateGold(this.gold);
    clearProps(this.scene, this.propMeshes);
    this.propMeshes = [];
    this.obstacles.length = 0;
    this.mapObstacles = [...this.worldMaps.setMap(nextMap.id)];
    this.obstacles.push(...this.mapObstacles);
    // The sector swap used to clear props and never rebuild them, so Map 2 was
    // played on an empty floor no matter what its prop set contained.
    this.regenerateProps(nextMap.id);
    telemetry.choice('map_transition', {
      mapId: nextMap.id,
      mapNumber: nextMap.number,
      totalElapsedS: Math.round(this.elapsedS * 1_000) / 1_000,
      sectorsCleared: this.runFlow.sectorsCleared,
    });
    this.hud.banner(`MAP ${nextMap.number}: ${nextMap.title.toUpperCase()}`);
    this.hud.updateBuild(this.stats, this.player.maxHp, this.weaponLevels, this.modCounts, this.coreLevels, this.weaponBranches);
  }

  /** True when the world point (x, y, z) is inside the frame, with a margin.
   *
   *  A real projection through the live camera, because the visible ground is
   *  NOT a circle: the camera sits at (0, 24, 19) with a 50 degree vertical
   *  fov, so it sees ~29 units of floor above the player and only ~13 below,
   *  and the horizontal reach moves with the window's aspect ratio. Any
   *  hardcoded radius would be wrong on one axis and wrong again on a resize. */
  private projectToScreen(x: number, y: number, z: number): THREE.Vector3 {
    return new THREE.Vector3(x, y, z).project(this.camera);
  }

  /** A body fits the frame only if its whole BOX does: head, feet and both
   *  flanks. The camera looks down, so head and feet are far apart on screen —
   *  measured at 16:9, a Marshal 15 units up-screen has its feet at ndc.y 0.63
   *  and its head at 1.00, perfectly "visible" by the ground point and beheaded
   *  by the top edge. The flanks are the same mistake sideways: the first pass
   *  that only checked the centre put a shoulder off the right edge. */
  private arrivalFrameScore(x: number, z: number): number | null {
    const { screenMargin, bodyHeight, bodyHalfWidth } = FINAL_BOSS.arrival;
    let worstY = 0;
    for (const offset of [-bodyHalfWidth, 0, bodyHalfWidth]) {
      for (const y of [0, bodyHeight]) {
        const point = this.projectToScreen(x + offset, y, z);
        const limit = 1 - screenMargin;
        if (Math.abs(point.x) > limit || Math.abs(point.y) > limit || point.z >= 1) return null;
        worstY = Math.max(worstY, Math.abs(point.y));
      }
    }
    // Among the spots that FIT, prefer the ones nearest the middle band of the
    // frame. Fitting is not the same as being readable: the top strip carries
    // the run timer and the health bar, the bottom carries the boss bar, and a
    // Marshal that lands behind either is technically on screen and practically
    // half hidden.
    return 1 - worstY;
  }

  private startFinale(): void {
    telemetry.choice('finale_started', {
      bossId: ENEMY_TYPES[FINAL_BOSS_TYPE_INDEX]?.name ?? 'final-boss',
      mapId: this.currentMap.id,
      totalElapsedS: Math.round(this.elapsedS * 1_000) / 1_000,
    });
    this.beginFinaleArena();
  }

  /** Runs at full black, inside the finale's curtain. Deliberately NOT
   *  transitionToMap: no sector is credited, no map is swapped and the arc
   *  state is untouched — this is the same sector reopening as an arena. */
  private openFinaleArena(): void {
    this.resetForMapTransition();
    // Behind the black: the rig gets the rest of the curtain plus the arrival
    // telegraph to build, instead of stalling the frame the boss lands on.
    this.boss.prepareFinalRig();
    if (FINAL_BOSS.arena.healToFull) this.player.hp = this.player.maxHp;
    // Gold is NOT zeroed, unlike a sector crossing: the run is not starting a
    // new economy, it is finishing this one, and the scrapper is already gone.
    this.regenerateProps(
      this.currentMap.id,
      FINAL_BOSS.arena.clearRadius,
      FINAL_BOSS.arena.propDensity,
    );
    telemetry.choice('finale_arena', {
      mapId: this.currentMap.id,
      clearRadius: FINAL_BOSS.arena.clearRadius,
      totalElapsedS: Math.round(this.elapsedS * 1_000) / 1_000,
    });
  }

  /** Opens the arrival once the arena is up. The telegraph, the AWAKENS banner,
   *  the eruption and the shake all come from the shared summon path — this
   *  only has to decide WHERE, and keep trying until it can. */
  private tickPendingFinaleArrival(): void {
    if (!this.pendingFinaleArrival) return;
    const opened = this.boss.beginFinalArrival(
      this.player.position.x,
      this.player.position.z,
      this.refreshCollisionObstacles(),
      (x, z) => this.arrivalFrameScore(x, z),
    );
    if (opened) this.pendingFinaleArrival = false;
  }

  /** Clears the previous container/barrel layout and rolls a fresh one,
   *  avoiding the boss totem (must be placed via boss.startRun() first) —
   *  user request 2026-07-06: different count/position every playthrough,
   *  not just every app launch. */
  private regenerateProps(mapId: string, centreClearRadius = 0, densityScale = 1): void {
    clearProps(this.scene, this.propMeshes);
    const totem = this.boss.totemTarget();
    // Each map's scatter props declare their own totem clearance; using Map 1's
    // for both would either crowd or over-clear the foundry's summon zone.
    // Map 2 scatters two prop types around one shared avoid list, so it takes
    // the LARGER of the two: the pillar stands 7.3 units tall against the power
    // cell's 1.6, and letting it sit at the cell's clearance would plant a
    // sight-blocker on the edge of the boss summon zone.
    const clearance = mapId === MAPS[1].id
      ? Math.max(
          POWERCELL_PROP.totemClearance,
          FOUNDRY_PILLAR_PROP.totemClearance,
          FOUNDRY_CONTAINER_PROP.totemClearance,
        )
      : CONTAINER_PROP.totemClearance;
    // Scatter props also have to dodge the map's OWN structures. Without this
    // the perimeter towers were invisible to placement: Map 2's power cells
    // scatter out to ARENA_HALF_SIZE - 4 = 86, straight through a tower ring at
    // 82, so cells could be planted inside solid geometry. The towers carry a
    // placement radius of their collider plus the widest prop half-width.
    const avoid: { x: number; z: number; radius: number }[] = totem
      ? [{ x: totem.x, z: totem.z, radius: clearance }]
      : [];
    for (const structure of this.mapObstacles) {
      avoid.push({ x: structure.x, z: structure.z, radius: structure.radius + PROP_STRUCTURE_CLEARANCE });
    }
    // The finale's arena empties the middle of the map. The radius is applied
    // per prop family inside placeRandomProps, inflated by each family's own
    // reach: a gate avoids by its CENTRE, so one shared radius left container
    // ends inside the supposedly clear circle (measured at 26.6 of 28).
    const props = placeRandomProps(this.scene, avoid, mapId, centreClearRadius, densityScale);
    // Rebuild from the map's OWN structural collision (Map 2's perimeter
    // towers) plus the fresh props. Resetting to props alone silently deleted
    // the towers' colliders, which only showed up as enemies walking through
    // solid geometry — the map returns them once, at setMap time, so they
    // have to be kept rather than re-fetched.
    this.obstacles.length = 0;
    this.obstacles.push(...this.mapObstacles, ...props.obstacles);
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
    const flowAction = advanceRunFlow(this.runFlow, dt, MAPS);
    this.elapsedS = this.runFlow.totalElapsedS;
    // Integrated per frame, not sampled at the end: the card can be picked at
    // any minute, and a run that ran +60% for its last 30 seconds is not the
    // same run as one that ran +60% throughout.
    this.runCursedIntegral += this.stats.cursedDifficulty * dt;
    this.tickAudioBenchmark(dt);
    if (flowAction.type === 'transition') {
      this.beginMapTransition(flowAction.nextMapIndex);
      return;
    }
    if (flowAction.type === 'end-run') {
      this.endRun(flowAction.outcome, flowAction.reason);
      return;
    }
    if (flowAction.type === 'start-finale') {
      // The arena reset takes over the frame: it leaves 'playing', so nothing
      // below this line may run on a world that is being torn down.
      this.startFinale();
      return;
    }
    this.tickPendingFinaleArrival();
    this.tickFinaleVictory(dt);
    // Once the finale is inbound the ambient waves STOP. The arena reset would
    // otherwise be a twenty-second effect: at the foundry's peak the spawner
    // refills toward ~437 bodies, so the clean floor the boss lands on would be
    // gone before it finished arriving. The Marshal's own phase-2 reinforcements
    // are unaffected — they spawn directly, not through the spawner.
    this.enemies.wavesPaused = this.runFlow.finaleStarted;
    const activeMap = MAPS[this.runFlow.mapIndex] ?? MAPS[0];
    const remaining = Math.max(0, activeMap.durationS - this.runFlow.mapElapsedS);

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
    // Each map sweeps its OWN curve over its OWN clock now, so the combat clock
    // and the map clock are the same number — the offset that used to separate
    // them was the thing flattening Map 2's back half.
    const combatElapsedS = this.runFlow.mapElapsedS;
    const difficulty = difficultyScalar(
      combatElapsedS,
      this.stats.cursedDifficulty,
      activeMap.difficulty,
    );
    this.currentDifficulty = difficulty;
    this.currentRewardScale = rewardScalar(difficulty, activeMap.difficulty);

    // The roster clock runs on the MAP's time, sped up by that map's own factor:
    // a new sector replays the enemy introductions instead of inheriting the
    // finished cast of the one before it.
    this.currentRosterElapsedS = this.runFlow.mapElapsedS * activeMap.rosterSpeed;

    this.enemies.update(
      dt,
      combatElapsedS,
      this.elapsedS,
      this.currentRosterElapsedS,
      difficulty,
      this.currentRewardScale,
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
    if (this.state !== 'playing') return;
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
      // MEASURED 2026-08-19: the volley connected 6 times in 40 seconds and
      // landed 0 of them — with the swarm touching the player constantly the
      // 0.4s i-frame was open almost permanently, so a shot the player was
      // asked to weave cost nothing. A boss attack pierces it; a Gunner's
      // shard does not.
      (damage, kind) => this.damagePlayer(damage, -1, kind === 'marshal'),
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
    this.hud.updateMission(
      this.runFlow.mapIndex,
      this.runFlow.mapBossDefeated,
      this.runFlow.finaleStarted,
    );
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


  /** The Marshal coming apart, staged. Runs while the world is still live, so
   *  the debris, the chests it dropped and the last cubes of the swarm all keep
   *  moving — a frozen frame would read as a crash, not as a finish. */
  private tickFinaleVictory(dt: number): void {
    const victory = this.finaleVictory;
    if (!victory) return;
    const cfg = FINAL_BOSS.victory;
    victory.elapsedS += dt;
    while (victory.step < cfg.burstSteps && victory.elapsedS >= victory.step * cfg.burstStepS) {
      // Walks DOWN the body: the head goes first and the machine collapses into
      // its own footprint, which is what tells a nine-unit boss apart from a
      // grunt popping.
      const k = cfg.burstSteps > 1 ? victory.step / (cfg.burstSteps - 1) : 0;
      const height = cfg.topHeight * (1 - k);
      const spread = cfg.spread * (0.4 + 0.6 * k);
      for (let i = 0; i < 3; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * spread;
        this.burst.spawn(
          victory.x + Math.cos(angle) * distance,
          victory.z + Math.sin(angle) * distance,
          cfg.color,
          Math.round(cfg.burstPerStep / 3),
          height,
        );
      }
      this.burst.spawn(victory.x, victory.z, cfg.hotColor, cfg.hotPerStep, height);
      this.shakeAmp = Math.max(this.shakeAmp, cfg.shakeAmp * (1 - k * 0.5));
      victory.step++;
    }
    if (victory.elapsedS >= cfg.holdS) {
      // The ground ring lands with the last of it, then the results open.
      this.spawnBurstRing(victory.x, victory.z, cfg.ringColor, cfg.ringCubes, cfg.ringRadius);
      this.finaleVictory = null;
      this.endRun(victory.outcome);
    }
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
    // Not during the Marshal's death beat. The run is decided, so a card screen
    // has nothing left to buy — and it would freeze the explosion mid-air,
    // which is the one thing that beat exists to show. Same call the defeat
    // transition already makes: an unclaimed level-up simply never opens.
    if (this.finaleVictory) return;
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
    this.timer.reset(); // Discard time spent choosing.
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
        this.timer.reset(); // Discard time spent reading the reward.
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
      const boss = this.boss.isBossType(enemy.typeIndex);
      this.burst.spawn(
        enemy.x,
        enemy.z,
        hitColor,
        hit.crit
          ? (boss ? VISUAL.hitSparks.bossCritCount : VISUAL.hitSparks.critCount)
          : (boss ? VISUAL.hitSparks.bossCount : VISUAL.hitSparks.count),
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
  /** @param pierceIframe A TELEGRAPHED attack that must land regardless of the
   *  contact i-frame. Measured 2026-08-19: the Marshal's sweep asked for damage
   *  five times in forty seconds and landed ZERO — every single one arrived
   *  inside the 0.4s window opened by a Voltling touching the player, and
   *  damagePlayer drops a hit whole rather than reducing it. The i-frame exists
   *  to cap SWARM dps (it is the difficulty dial for diving into a crowd); a
   *  boss attack you were shown 1.3 seconds in advance is not swarm chip
   *  damage, and swallowing it made the boss's signature move do nothing. */
  private damagePlayer(rawDamage: number, attackerIndex = -1, pierceIframe = false): void {
    if (this.player.isDead) return;
    // The run is already won: a leftover Voltling landing a hit during the
    // Marshal's death beat must not turn a completed arc into a defeat.
    if (this.finaleVictory) return;
    if (this.player.invulnerable) {
      if (!pierceIframe) return;
      // Cleared rather than ignored, so everything downstream — evasion, the
      // shield, armor, thorns — still runs exactly once on the real funnel.
      this.player.clearInvulnerability();
    }

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
    // Every hit reads the SAME, whatever threw it (user call 2026-08-19): flash,
    // shake and the player-hit cue. A damage number only for boss attacks was
    // tried and rejected — it made one source of damage speak a language the
    // rest of the game does not, and the player has to learn one contract for
    // "I am being hurt", not two.

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
    // Same rule as elite XP: only pressure the clock did NOT create pays, so
    // this bonus tracks stacked Cursed Core and never a harder map.
    else if (death.elite) {
      goldValue = Math.round(
        GOLD.eliteBonus *
          (ELITES.rewardScalesWithDifficulty ? Math.max(1, this.currentRewardScale) : 1),
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
      // The kill, not the clock, is what clears this sector (2026-08-06).
      markMapBossDefeated(this.runFlow);
      if (this.boss.isFinalBossType(death.typeIndex)) {
        const fullArcCompleted = completeFinale(this.runFlow, MAPS);
        // NOT endRun on this frame: the results screen used to cover the
        // explosion it was celebrating, so the payoff of the whole arc lasted
        // one frame. The run is already decided — this only buys the time to
        // watch the Marshal come apart.
        // Nothing may interrupt the beat: the boss pays a lot of XP and the
        // level-up it triggers would otherwise open on top of the explosion.
        this.pendingLevelUps = 0;
        this.finaleVictory = {
          elapsedS: 0,
          step: 0,
          x: death.x,
          z: death.z,
          outcome: fullArcCompleted ? 'run-complete' : 'sector-cleared',
        };
      }
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
    this.hud.updateBuild(this.stats, this.player.maxHp, this.weaponLevels, this.modCounts, this.coreLevels, this.weaponBranches);
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
      // contactRadius, not radius: for most bodies they are the same number,
      // but a boss's steering radius is not the shape the player can touch.
      const reach = PLAYER.radius + e.contactRadius;
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
          this.damagePlayer(this.bossContactDamage(), i);
          this.flingFromRam(ram, px, pz);
          continue;
        }
        // The map's contact multiplier is the only thing that can raise the
        // swarm's damage CEILING: PLAYER.invulnAfterHitS caps it at
        // contactDamage / 0.4 regardless of how many bodies are touching, so
        // density alone can never hurt more. Bosses keep their own number.
        const base = this.boss.isBossType(e.typeIndex)
          ? this.bossContactDamage()
          : PLAYER.contactDamage *
            (e.elite ? ELITES.scaleMultiplier : 1) *
            (MAPS[this.runFlow.mapIndex]?.contactDamageMult ?? 1);
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
        this.hud.updateBuild(this.stats, this.player.maxHp, this.weaponLevels, this.modCounts, this.coreLevels, this.weaponBranches);
        this.hud.flashBuildRow(entry.id);
        this.renderShop();
      },
      () => {
        this.state = 'playing';
        this.timer.reset(); // Discard time spent shopping.
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

  private endRun(outcome: RunOutcome, reason?: 'boss-required'): void {
    const summary = this.finalizeRun(outcome);
    if (!summary) return;
    this.state = 'ended';
    this.audio.emit({ id: outcome === 'defeat' ? 'run-defeat' : 'run-victory', priority: 5 });
    this.audio.stopLoop('foundation-run-loop');
    this.audio.setPaused(true);
    this.hud.showEnd(
      outcome,
      this.currentMap,
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
      true,
      reason === 'boss-required',
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
      map: this.currentMap,
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
      sectorsCleared: this.runFlow.sectorsCleared,
      mapsReached: this.runFlow.mapIndex + 1,
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

    // The bar has to SHOW the killing blow. updateBars only runs while the run
    // is `playing`, and the line above already left that state, so without this
    // the HUD keeps the health the player had before the hit and the overload
    // plays under a bar reading 15/100. Same flash as any other hit, because a
    // hit reads the same whatever threw it — this one just empties the bar.
    this.hud.updateBars(
      this.player.hp,
      this.player.maxHp,
      this.progression.xp,
      this.progression.xpToNext,
    );
    this.hud.flashHp();

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
    this.timer.reset();
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
