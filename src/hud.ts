import { PROFILE, PLAYER, SECONDS_PER_MINUTE, DEV_TOOLS, MAPS, MENU_NAVIGATION, PICKUPS, WEAPON_INFO, availableWeaponIds, describeWeaponBranches, type MapId, type WeaponId } from './config';
import { LIFETIME, resetProfile, saveProfile } from './profile';
import {
  ACTIVE_CONTRACTS,
  describeObjective,
  describeReward,
  devCompleteAllContracts,
  progressOf,
  previewContractRewards,
  rewardCategory,
  rewardName,
  type Contract,
  type EarnedContract,
  type Reward,
  type RewardCategory,
} from './contracts';
import { defaultStats, type PlayerStats } from './stats';
import { CORE_TITLES, weaponIdFromUpgradeCard, type CoreLevels, type Rarity, type UpgradeCard, type WeaponBranchLevels, type WeaponLevels } from './upgrades';
import { MOD_IDS, MOD_REGISTRY, UNLOCKED_MOD_IDS, describeMod, modsOfTier, refreshUnlockedMods, type ModCounts, type ModId } from './mods';
import { coreOrbIcon, warmCoreOrbs } from './core-orbs';
import {
  CHARACTER_REGISTRY,
  DEFAULT_CHARACTER_ID,
  characterStatRows,
  labelWeaponOptions,
  resolveCharacterId,
  type CharacterDef,
  type CharacterId,
} from './characters';
import {
  ACTION_IDS,
  ACTION_LABELS,
  cloneBindings,
  DEFAULT_BINDINGS,
  gamepadButtonLabel,
  keyLabel,
  resolutionOptions,
  UI_SCALE_OPTIONS,
  type ActionId,
  type ControlBindings,
  type GameSettings,
  type UiScale,
} from './settings';
import type { PlayerInput } from './input';
import { RUN_OUTCOME_TITLES, type RunMapRef, type RunOutcome } from './run-history';
import type { FeedbackDifficulty, FeedbackReason, StructuredFeedback } from './telemetry';
import { UI_ACTION_CUES, UI_INTERACTIVE_SELECTOR, UiFocusTracker, isMouseHover, type UiActionCue, type UiAudioEventId, uiActionCue } from './ui-audio';

// All UI is plain DOM layered over the canvas. Fast to build, trivially
// styleable, and it never touches the render loop.

const RARITY_LABEL: Record<string, string> = {
  gray: 'Common',
  green: 'Uncommon',
  blue: 'Rare',
  purple: 'Epic',
  gold: 'Legendary',
};

type ContractViewCategory = 'all' | RewardCategory;
type ContractViewStatus = 'active' | 'completed';

interface ContractViewRow {
  contract: Contract;
  current: number;
  target: number;
  done: boolean;
  asTime: boolean;
  ratio: number;
  resolved: Reward | null;
}

const CONTRACT_CATEGORIES: ReadonlyArray<{ key: ContractViewCategory; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'character', label: 'Characters' },
  { key: 'weapon', label: 'Weapons' },
  { key: 'core', label: 'Cores' },
  { key: 'mod', label: 'Mods' },
  { key: 'socket', label: 'Sockets' },
  { key: 'other', label: 'Perks' },
];

export type ChestReelCell =
  | { kind: 'mod'; id: ModId }
  | { kind: 'anticipation'; tier: Rarity; variant: number };

export interface ChestMarkerView {
  index: number;
  tier: Rarity;
  price: number;
  affordable: boolean;
  x: number;
  y: number;
}

interface ChestMarkerSlot {
  root: HTMLElement;
  priceAmount: HTMLElement;
}

/** Build the deterministic reel sequence while keeping the rolled prize last. */
export function buildChestReelStrip(
  finalMod: ModId,
  tier: Rarity,
  startIndex: number,
  sceneryCellCount = 18,
): ChestReelCell[] {
  const tierPool = modsOfTier(tier);
  const spinPool = tierPool.length > 0 ? [...tierPool] : [...UNLOCKED_MOD_IDS];
  if (spinPool.length < 3) {
    const anticipation: ChestReelCell[] = [];
    for (let i = 0; i < sceneryCellCount; i++) {
      anticipation.push({ kind: 'anticipation', tier, variant: (startIndex + i) % 4 });
    }
    anticipation.push({ kind: 'mod', id: finalMod });
    return anticipation;
  }

  const normalizedStart = ((startIndex % spinPool.length) + spinPool.length) % spinPool.length;
  const itemIds: ModId[] = [];
  for (let i = 0; i < sceneryCellCount; i++) {
    itemIds.push(spinPool[(normalizedStart + i) % spinPool.length]!);
  }
  itemIds.push(finalMod);

  if (spinPool.length > 1) {
    const fix = (index: number): void => {
      const replacement = spinPool.find(
        (id) => id !== itemIds[index - 1] && id !== itemIds[index + 1],
      );
      if (replacement) itemIds[index] = replacement;
    };
    for (let i = 1; i < itemIds.length - 1; i++) {
      if (itemIds[i] === itemIds[i - 1]) fix(i);
    }
    const last = itemIds.length - 1;
    if (itemIds[last] === itemIds[last - 1]) fix(last - 1);
  }

  return itemIds.map((id) => ({ kind: 'mod', id }));
}

// Mod display data (icons, labels, descriptions) lives in mods.ts — the
// unified registry feeds the chest reel, the shop and the items panel alike.

/** Boss bar mini-portraits: the flat reference sheets double as face art. */
const BOSS_PORTRAITS: Record<string, string> = {
  'crusher king': 'assets/2d/ref-crusher-king-front-v2.png',
  'tesla titan': 'assets/2d/ref-tesla-titan-front-v2.png',
  'volt warden': 'assets/2d/ref-volt-warden-front.png',
};

const WEAPON_ICONS: Record<WeaponId, string> = {
  bolt: '🔫',
  pulse: '💠',
  blades: '🌀',
  welder: '🔆',
  press: '🔨',
  tire: '🔥',
  oil: '🛢️',
  acid: '🧪',
  turbine: '💨',
  ricochet: '🔀',
  dismantler: '🦾',
};

// Approved voxel icon art replacing the emoji placeholder above, one weapon
// at a time as each is generated and validated (docs/PROMPTS_IMAGENES.md §3).
const WEAPON_ICON_IMAGES: Partial<Record<WeaponId, string>> = {
  bolt: 'assets/2d/icon-weapon-bolt.png',
  pulse: 'assets/2d/icon-weapon-pulse.png',
  blades: 'assets/2d/icon-weapon-blades.png',
  welder: 'assets/2d/icon-weapon-welder-v2.png',
  press: 'assets/2d/icon-weapon-press-v2.png',
  tire: 'assets/2d/icon-weapon-tire.png',
  oil: 'assets/2d/icon-weapon-oil-v2.png',
  acid: 'assets/2d/icon-weapon-acid-drum.png',
  turbine: 'assets/2d/icon-weapon-turbine-v2.png',
  ricochet: 'assets/2d/icon-weapon-ricochet-v3.png',
  dismantler: 'assets/2d/icon-weapon-dismantler.png',
};

// UI glyph icons replacing the old text glyphs (docs/PROMPTS_IMAGENES.md
// §4b-bis): hex coin for gold amounts, padlock for locked sockets, robot
// skull for the kill counter.
const COIN_ICON = 'assets/2d/icon-ui-coin-v2.png';
const SKULL_ICON = 'assets/2d/icon-ui-skull-v2.png';

/** Coin glyph + amount markup for any innerHTML slot that shows gold. */
export function coinHtml(amount: number | string): string {
  return `<img class="ui-glyph" src="${COIN_ICON}" alt="" />${amount}`;
}

// Approved voxel icon art replacing the stat emoji placeholders, one stat
// at a time as each is generated and validated (docs/PROMPTS_IMAGENES.md §4).
/** Timed player states that show a countdown chip in the HUD. */
export type TimedBuffId = 'frenzy' | 'haste' | 'overload';

/** Buff chips borrow the stat icon that matches what the buff DOES, so the
 *  player reads 'damage', 'move speed' and 'attack speed' from art they
 *  already know.
 *
 *  LABELS MUST MATCH WHAT THE PLAYER WAS ALREADY TOLD. The pickup toast says
 *  "Overdrive: +50% speed", so the chip says OVERDRIVE — calling it "Haste"
 *  here (its internal name) would invent a second word for one thing. Overload
 *  takes its label from MOD_REGISTRY['overload-trigger'] for the same reason.
 *
 *  ASCII only: PS2P has real glyph gaps and silently falls back to a thin
 *  system face on anything it lacks. */
const BUFF_INFO: Record<TimedBuffId, { icon: string; label: string }> = {
  frenzy: { icon: 'assets/2d/icon-stat-damage.png', label: 'FRENZY' },
  haste: { icon: 'assets/2d/icon-stat-move-speed.png', label: 'OVERDRIVE' },
  overload: { icon: 'assets/2d/icon-stat-attack-speed.png', label: 'OVERLOAD' },
};

const STAT_ICON_IMAGES: Partial<Record<keyof PlayerStats, string>> = {
  damage: 'assets/2d/icon-stat-damage.png',
  attackSpeed: 'assets/2d/icon-stat-attack-speed.png',
  critChance: 'assets/2d/icon-stat-crit.png',
  critDamage: 'assets/2d/icon-stat-crit-damage.png',
  moveSpeed: 'assets/2d/icon-stat-move-speed.png',
  attackRange: 'assets/2d/icon-stat-range.png',
  pickupRange: 'assets/2d/icon-stat-pickup.png',
  projectileCount: 'assets/2d/icon-stat-projectiles-v2.png',
  projectileSpeed: 'assets/2d/icon-stat-proj-speed.png',
  area: 'assets/2d/icon-stat-area.png',
  armor: 'assets/2d/icon-stat-armor-v2.png',
  regen: 'assets/2d/icon-stat-regen.png',
  evasion: 'assets/2d/icon-stat-evasion.png',
  thorns: 'assets/2d/icon-stat-thorns.png',
  lifesteal: 'assets/2d/icon-stat-lifesteal.png',
  duration: 'assets/2d/icon-stat-duration.png',
  luck: 'assets/2d/icon-stat-luck.png',
  xpGain: 'assets/2d/icon-stat-xp-gain-v2.png',
  cursedDifficulty: 'assets/2d/icon-stat-cursed.png',
};

function statIconHtml(key: keyof PlayerStats, emoji: string): string {
  const image = STAT_ICON_IMAGES[key];
  return image
    ? `<img class="build-icon build-icon-img" src="${image}" alt="" />`
    : `<span class="build-icon">${emoji}</span>`;
}

// Upgrade-card id (upgrades.ts) → the stat it modifies, so every level-up
// card shows the same icon as its stat-sheet row (2026-07-08 user request).
// 'max-hp' and 'chaos' have dedicated card art instead (CARD_ICON_IMAGES).
const CARD_STAT_KEYS: Record<string, keyof PlayerStats> = {
  damage: 'damage',
  'attack-speed': 'attackSpeed',
  'crit-chance': 'critChance',
  'crit-damage': 'critDamage',
  'move-speed': 'moveSpeed',
  'attack-range': 'attackRange',
  'pickup-range': 'pickupRange',
  'projectile-speed': 'projectileSpeed',
  'projectile-count': 'projectileCount',
  area: 'area',
  armor: 'armor',
  regen: 'regen',
  evasion: 'evasion',
  thorns: 'thorns',
  lifesteal: 'lifesteal',
  duration: 'duration',
  luck: 'luck',
  cursed: 'cursedDifficulty',
};

// Cards without a 1:1 stat icon get dedicated card art (PROMPTS §4b) —
// keyed by card id, warmed into the orb-shell cache alongside the stats.
const CARD_ICON_IMAGES: Record<string, string> = {
  'max-hp': 'assets/2d/icon-card-max-hp.png',
  chaos: 'assets/2d/icon-card-chaos.png',
  'fallback-salvage-dividend': 'assets/2d/icon-ui-coin-v2.png',
};

/** Orb-shell cache key for a core card: its stat key, or its own card id
 *  when it has dedicated card art (Hull Plates). */
function coreOrbKey(cardId: string): string | undefined {
  if (cardId.startsWith('fallback-')) return undefined;
  return CARD_STAT_KEYS[cardId] ?? (CARD_ICON_IMAGES[cardId] ? cardId : undefined);
}

function cardIconHtml(cardId: string): string {
  let image: string | undefined;
  const weaponId = weaponIdFromUpgradeCard(cardId);
  if (weaponId) {
    image = WEAPON_ICON_IMAGES[weaponId];
  } else {
    const key = CARD_STAT_KEYS[cardId];
    image = (key ? STAT_ICON_IMAGES[key] : undefined) ?? CARD_ICON_IMAGES[cardId];
  }
  return image ? `<img class="card-icon" src="${image}" alt="" />` : '';
}

interface RigTileOptions {
  src?: string;
  emoji?: string;
  badge?: string;
  cls?: string;
  card?: string;
  label?: string;
}

/** Shared RIG tile renderer. The live build panel, end-of-run build summary,
 *  and damage report all use this exact markup so icons never drift apart. */
function rigTileHtml(options: RigTileOptions): string {
  const inner = options.src
    ? `<img class="rig-icon" src="${options.src}" alt="" />`
    : `<span class="rig-icon rig-icon-emoji">${options.emoji ?? '◆'}</span>`;
  const badge = options.badge ? `<span class="rig-badge">${options.badge}</span>` : '';
  const data = options.card ? ` data-card="${options.card}"` : '';
  const label = options.label ? ` title="${options.label}" aria-label="${options.label}"` : '';
  return `<div class="rig-tile${options.cls ? ` ${options.cls}` : ''}"${data}${label}>${inner}${badge}</div>`;
}

/** Bare core icon used by the RIG: orb shells belong to draft cards only. */
function rigCoreIconSrc(id: string): string | undefined {
  const key = CARD_STAT_KEYS[id];
  return (key ? STAT_ICON_IMAGES[key] : undefined) ?? CARD_ICON_IMAGES[id];
}

// Build-panel rows: icon, label, and how to render the stat's current
// absolute value. Every stat is always listed so the player can compare
// their sheet before and after each upgrade choice.
interface StatRow {
  key: keyof PlayerStats;
  icon: string;
  label: string;
  format(value: number): string;
}

const asMult = (value: number): string => `x${value.toFixed(2).replace(/0$/, '')}`;
const asPct = (value: number): string => `${Math.round(value * 100)}%`;
const asPoints = (value: number): string => `${Math.round(value)}`;
export const formatPercentPoints = (value: number): string => `${Number(value.toFixed(2))}%`;

const STAT_ROWS: StatRow[] = [
  { key: 'damage', icon: '💥', label: 'Damage', format: asMult },
  { key: 'attackSpeed', icon: '⚡', label: 'Atk Speed', format: asMult },
  { key: 'critChance', icon: '🎯', label: 'Crit', format: asPct },
  { key: 'critDamage', icon: '💢', label: 'Crit Dmg', format: (v) => `+${asPct(v)}` },
  { key: 'moveSpeed', icon: '👟', label: 'Move Speed', format: asMult },
  { key: 'attackRange', icon: '📏', label: 'Range', format: asMult },
  { key: 'pickupRange', icon: '🧲', label: 'Pickup', format: (v) => `${v.toFixed(1)}m` },
  { key: 'projectileCount', icon: '🔩', label: 'Projectiles', format: (v) => `+${asPoints(v)}` },
  { key: 'projectileSpeed', icon: '🚀', label: 'Proj Speed', format: asMult },
  { key: 'area', icon: '⭕', label: 'Area', format: asMult },
  { key: 'armor', icon: '🛡️', label: 'Armor', format: asPct },
  { key: 'regen', icon: '❤️', label: 'Regen', format: (v) => `${asPoints((v * SECONDS_PER_MINUTE) / PLAYER.regenTickS)} HP/min` },
  { key: 'evasion', icon: '👻', label: 'Evasion', format: asPoints },
  { key: 'thorns', icon: '🌵', label: 'Thorns', format: asPoints },
  { key: 'lifesteal', icon: '🩸', label: 'Lifesteal', format: formatPercentPoints },
  { key: 'duration', icon: '⏳', label: 'Duration', format: asMult },
  { key: 'luck', icon: '🍀', label: 'Luck', format: asPct },
  { key: 'xpGain', icon: '📖', label: 'XP Gain', format: asMult },
  { key: 'cursedDifficulty', icon: '💀', label: 'Cursed', format: (v) => `+${asPct(v)}` },
];

export class Hud {
  private readonly xpFill: HTMLElement;
  private readonly hpFill: HTMLElement;
  private readonly timer: HTMLElement;
  private readonly levelBadge: HTMLElement;
  private readonly fpsCounter: HTMLElement;
  private readonly chestMarkers: ChestMarkerSlot[] = [];

  private readonly startOverlay: HTMLElement;
  private readonly draftCards: HTMLElement;
  private readonly levelUpOverlay: HTMLElement;
  private readonly levelUpFlash: HTMLElement;
  private readonly upgradeCards: HTMLElement;
  private readonly endOverlay: HTMLElement;
  private readonly endTitle: HTMLElement;
  private readonly endSubtitle: HTMLElement;
  private readonly endActions: HTMLElement;
  private readonly endStats: HTMLElement;
  private readonly endRunBuild: HTMLElement;
  private readonly endDamageList: HTMLElement;
  private readonly bossBar: HTMLElement;
  private readonly bossFill: HTMLElement;
  private readonly bossName: HTMLElement;
  private readonly pauseOverlay: HTMLElement;
  private readonly settingsOverlay: HTMLElement;
  /** Working copy of the control bindings while the overlay is open;
   *  committed into GameSettings only on Apply. */
  private draftBindings: ControlBindings = cloneBindings(DEFAULT_BINDINGS);
  /** Armed rebind capture: device-agnostic — the next key OR pad button
   *  pressed wins and lands on its own device's binding (a device-scoped
   *  capture silently ate presses from the other device, 2026-07-13). */
  private captureTarget: { action: ActionId; button: HTMLButtonElement } | null = null;
  /** Device shown on the Controls tab: gamepad bindings while one is
   *  connected, keyboard otherwise (user rule 2026-07-13). */
  private gamepadActive = false;
  private readonly settingsMode: HTMLSelectElement;
  private readonly settingsResolution: HTMLSelectElement;
  private readonly settingsUiScale: HTMLSelectElement;
  private readonly masterVolume: HTMLInputElement;
  private readonly musicVolume: HTMLInputElement;
  private readonly sfxVolume: HTMLInputElement;
  private settingsReturnOverlay: 'menu' | 'pause' = 'menu';
  private feedbackFun: StructuredFeedback['fun'] | null = null;
  private feedbackDifficulty: FeedbackDifficulty | null = null;
  private readonly feedbackReasons = new Set<FeedbackReason>();
  private selectedCharacterId: CharacterId = DEFAULT_CHARACTER_ID;
  private contractCategory: ContractViewCategory = 'all';
  private contractStatus: ContractViewStatus = 'active';
  private selectedContractId: string | null = null;
  private readonly uiFocus = new UiFocusTracker<HTMLElement>();
  private suppressedFocusTarget: HTMLElement | null = null;

  constructor(
    root: HTMLElement,
    private readonly onStart: (character: CharacterId, weapon: WeaponId, mapId: MapId) => void,
    private readonly onUpgradeChosen: (card: UpgradeCard) => void,
    private readonly onResume: () => void,
    private readonly onQuitToMenu: () => void,
    /** Defeat screen primary action: drop the dead run and enter the normal
     *  character/start-weapon flow. Never reuses the finished run. */
    private readonly onNewRun: () => void,
    private readonly onSettingsChanged: (settings: GameSettings) => void,
    private readonly onUiAudio: (event: UiAudioEventId) => void,
    private readonly onFeedbackSubmit: (feedback: StructuredFeedback) => Promise<boolean>,
    feedbackAvailable: boolean,
  ) {
    root.insertAdjacentHTML(
      'beforeend',
      `
      <div id="hud">
        <div id="xp-bar"><div id="xp-bar-fill"></div><div id="level-badge">LV 1</div></div>
        <div id="timer">10:00</div>
        <div id="kills"><img class="ui-glyph" src="${SKULL_ICON}" alt="" /><span id="kills-amount">0</span></div>
        <div id="mission" aria-label="Current mission">
          <div class="mission-title">MISSION:</div>
          <div id="mission-survive" class="mission-step"><span class="mission-check">[ ]</span><span>Survive until time expires</span></div>
          <div id="mission-boss" class="mission-step"><span class="mission-check">[ ]</span><span class="mission-copy">Defeat the boss to unlock the next sector</span></div>
        </div>
        <div id="boss-bar" class="hidden">
          <div id="boss-title"><img id="boss-portrait" alt="" /><div id="boss-name"></div></div>
          <div id="boss-bar-track"><div id="boss-bar-fill"></div><span id="boss-hp-text"></span></div>
        </div>
        <div id="summon-prompt" class="hidden"></div>
        <div id="chest-markers" aria-label="Active chests"></div>
        <div id="interact-prompt" class="hidden"></div>
        <div id="event-banner" class="hidden">
          <div class="banner-stripe"></div>
          <div id="event-banner-text"></div>
          <div class="banner-stripe"></div>
        </div>
        <!-- Defeat title beat. Its own transparent layer, NOT the results
             overlay: that one carries an 82% scrim which would bury the frozen
             battle exactly when the sequence still wants it visible. Lives
             inside #hud so it disappears with the HUD when the summary opens. -->
        <div id="defeat-beat" class="hidden">
          <div class="banner-stripe"></div>
          <div id="defeat-beat-title">SYSTEM OVERLOAD</div>
          <div id="defeat-beat-subtitle">Chassis integrity lost</div>
          <div class="banner-stripe"></div>
        </div>
        <!-- Label says BOSS, not TOTEM: 6 recorded human runs summoned zero
             bosses while this arrow was on screen pointing straight at the
             portal. "Totem" names our prop; "BOSS" names the reason to walk
             there, and it is the word every player in the genre already knows. -->
        <div id="totem-indicator" class="hidden"><span class="arrow" aria-hidden="true"></span><span class="label">BOSS</span></div>
        <div id="merchant-indicator" class="hidden"><span class="arrow" aria-hidden="true"></span><span class="label">SHOP</span></div>
        <div id="gold-counter" class="hidden"><img class="ui-glyph" src="${COIN_ICON}" alt="" /><span id="gold-amount">0</span></div>
        <div id="buff-row"></div>
        <div id="hp-bar"><div id="hp-bar-fill"></div><span id="hp-text"></span></div>
      </div>
      <div id="fps-counter" class="hidden"></div>
      <div id="build-panel"></div>
      <div id="menu-overlay" class="overlay menu-view">
        <div id="menu-lockup">
          <img id="menu-logo-mascot" src="assets/2d/logo-mascot-v3.png" alt="Voltswarm" />
          <img id="menu-logo-wordmark" src="assets/2d/logo-letras-v3.png" alt="Voltswarm" />
        </div>
        <div id="menu-buttons">
          <button id="play-button">Play</button>
          <button id="characters-button">Characters</button>
          <button id="contracts-button">Contracts</button>
          ${DEV_TOOLS.unlockPanel ? '<button id="unlocks-button">Unlocks</button>' : ''}
          <button id="menu-settings-button">Settings</button>
          <button id="exit-button">Exit</button>
        </div>
        <div id="version-tag">${__APP_DISPLAY_VERSION__}</div>
      </div>
      <div id="characters-overlay" class="overlay menu-view hidden">
        <div class="character-screen overlay-panel">
          <div class="panel-header">Characters</div>
          <div id="characters-roster" class="character-layout"></div>
          <div class="character-actions"><button id="characters-back-button">Back</button></div>
        </div>
      </div>
      <div id="character-select-overlay" class="overlay menu-view hidden">
        <div class="character-screen overlay-panel">
          <div class="panel-header">Choose Your Character</div>
          <div id="character-select-roster" class="character-layout"></div>
          <div class="character-actions">
            <button id="character-select-back-button">Back</button>
            <button id="character-confirm-button">Confirm</button>
          </div>
        </div>
      </div>
      <div id="contracts-overlay" class="overlay menu-view hidden">
        <div id="contracts-panel" class="overlay-panel">
          <div class="contracts-header">
            <div class="panel-header">Contracts</div>
            <div id="contracts-status-filters" class="contracts-status-control" role="group" aria-label="Contract status"></div>
          </div>
          <p class="overlay-panel-sub" id="contracts-summary"></p>
          <div id="contracts-category-filters" class="contracts-category-tabs" role="tablist" aria-label="Contract category"></div>
          <div id="contracts-browser">
            <div id="contracts-list" role="tabpanel" aria-label="Contracts"></div>
            <article id="contract-detail" aria-live="polite"></article>
          </div>
          <div id="contracts-actions">
            <button id="contracts-back-button">Back</button>
          </div>
        </div>
      </div>
      ${DEV_TOOLS.unlockPanel ? `
      <div id="unlocks-overlay" class="overlay menu-view hidden">
        <div id="unlocks-panel" class="overlay-panel">
          <div class="panel-header">Unlocks</div>
          <p class="overlay-panel-sub">Dev tool — unlock content for the playtest. Contracts will replace this.</p>
          <div id="unlocks-columns"></div>
          <div id="unlocks-actions">
            <button id="unlock-all-button">Unlock everything</button>
            <button id="complete-contracts-button">Complete all contracts</button>
            <button id="unlocks-reset-button">Reset progress</button>
            <button id="unlocks-back-button">Back</button>
          </div>
        </div>
      </div>` : ''}
      <div id="start-overlay" class="overlay menu-view hidden">
        <h2>Choose your starting weapon</h2>
        <p class="stats-line">More weapons, cores and sockets unlock through contracts</p>
        ${DEV_TOOLS.startingMapSelector ? `
        <label class="settings-row" for="start-map-select">
          <span>Development map</span>
          <select id="start-map-select">
            ${MAPS.map((map) => `<option value="${map.id}">Map ${map.number}: ${map.title}</option>`).join('')}
          </select>
        </label>` : ''}
        <div id="draft-cards"></div>
        <button id="draft-back-button">Back</button>
      </div>
      <!-- Loading screen: covers world build + warmup renders so the reveal is
           smooth. Placeholder animation for now; a richer one drops in here. -->
      <div id="loading-overlay" class="overlay menu-view hidden">
        <img id="loading-mascot" src="assets/2d/logo-mascot-v3.png" alt="" />
        <div id="loading-bar"><i></i><i></i><i></i><i></i><i></i></div>
        <div id="loading-text">Loading</div>
      </div>
      <div id="levelup-overlay" class="overlay hidden">
        <div id="levelup-panel" class="overlay-panel">
          <div class="panel-header">Level Up</div>
          <p class="overlay-panel-sub">Choose an upgrade</p>
          <div id="upgrade-cards"></div>
          <button id="levelup-discard" class="hidden">Discard</button>
        </div>
      </div>
      <div id="levelup-flash" class="hidden" aria-hidden="true">
        <div class="levelup-flash-ring"></div>
        <div class="levelup-flash-text">LEVEL UP!</div>
      </div>
      <!-- Fixed-positioned sheet, shown while the level-up overlay is open OR
           a chest reel has landed (CSS :has() gates) — lives outside both
           overlays so either one can reveal it. -->
      <div id="stat-sheet"></div>
      <!-- Skip surface for the defeat beat. A full-viewport catcher is safe here
           precisely because it only exists BEFORE the summary: there is nothing
           on screen it could steal a click from. It is removed the moment the
           actions appear, so it can never swallow a press meant for a button. -->
      <div id="defeat-skip-surface" class="hidden" aria-hidden="true"></div>
      <div id="end-overlay" class="overlay hidden">
        <h1 id="end-title"></h1>
        <p id="end-subtitle" class="stats-line hidden"></p>
        <p id="end-stats" class="stats-line"></p>
        <div id="end-contracts" class="hidden"></div>
        <div id="end-run-summary">
          <section id="end-run-build">
            <h2 class="panel-header">Run Build</h2>
            <div id="end-run-build-content"></div>
          </section>
          <section id="end-damage-report">
            <h2 class="panel-header">Damage Report</h2>
            <div id="end-damage-list"></div>
          </section>
        </div>
        <section id="end-feedback"${feedbackAvailable ? '' : ' hidden'}>
          <h2 class="panel-header">Playtest Feedback</h2>
          <p>No account details or free text. Nothing is sent until you submit.</p>
          <div class="feedback-question">
            <span>How much fun was this run?</span>
            <div id="feedback-fun" class="feedback-options" aria-label="Fun rating">
              <button type="button" data-value="1">1</button>
              <button type="button" data-value="2">2</button>
              <button type="button" data-value="3">3</button>
              <button type="button" data-value="4">4</button>
              <button type="button" data-value="5">5</button>
            </div>
          </div>
          <div class="feedback-question">
            <span>How did the difficulty feel?</span>
            <div id="feedback-difficulty" class="feedback-options">
              <button type="button" data-value="too_easy">Too easy</button>
              <button type="button" data-value="about_right">About right</button>
              <button type="button" data-value="too_hard">Too hard</button>
            </div>
          </div>
          <div class="feedback-question">
            <span>What most shaped your rating? <em>Optional</em></span>
            <div id="feedback-reasons" class="feedback-options feedback-tags">
              <button type="button" data-value="combat_feel">Combat feel</button>
              <button type="button" data-value="build_choices">Build choices</button>
              <button type="button" data-value="enemy_pressure">Enemy pressure</button>
              <button type="button" data-value="bosses">Bosses</button>
              <button type="button" data-value="economy">Economy</button>
              <button type="button" data-value="clarity">Clarity</button>
              <button type="button" data-value="performance">Performance</button>
            </div>
          </div>
          <button id="feedback-submit" type="button" disabled>Submit Feedback</button>
          <p id="feedback-status" role="status"></p>
        </section>
        <!-- The primary action carries a BRANCH-NEUTRAL id: the full game calls
             it New Run, the Demo calls it Play Again, and the Demo also keeps
             its Wishlist button in this row. Keeping the id stable means the
             handler, the focus logic, the gamepad nav and the runtime check are
             all shared code — only this label differs between branches. -->
        <div id="end-actions">
          <button id="end-primary-button">New Run</button>
          <button id="restart-button">Main Menu</button>
        </div>
      </div>
      <div id="pause-overlay" class="overlay hidden">
        <h1>Paused</h1>
        <p class="stats-line">Take your time. The run is safely frozen.</p>
        <button id="resume-button">Resume</button>
        <button id="pause-settings-button">Settings</button>
        <button id="quit-run-button">Quit to Menu</button>
      </div>
      <div id="settings-overlay" class="overlay menu-view hidden">
        <div id="settings-panel" class="overlay-panel">
          <div class="panel-header">Settings</div>
          <div id="settings-sidebar">
            <button id="settings-tab-general" class="settings-tab active">General</button>
            <button id="settings-tab-controls" class="settings-tab">Controls</button>
          </div>
          <div id="settings-frame">
          <div id="settings-content">
            <div id="settings-page-general">
              <label class="settings-row">
                <span>Display</span>
                <select id="settings-mode">
                  <option value="windowed">Windowed</option>
                  <option value="fullscreen">Fullscreen</option>
                </select>
              </label>
              <label class="settings-row">
                <span>Window Resolution</span>
                <select id="settings-resolution">
                  ${resolutionOptions().map((item) => `<option value="${item.id}">${item.label}</option>`).join('')}
                </select>
              </label>
              <label class="settings-row">
                <span>UI Scale</span>
                <select id="settings-ui-scale">
                  ${UI_SCALE_OPTIONS.map((option) => `<option value="${option.value}">${option.label}</option>`).join('')}
                </select>
              </label>
              <label class="settings-row slider-row">
                <span>Master Volume</span>
                <span class="slider-group">
                  <span class="slider-bound">0</span>
                  <input id="settings-master-volume" type="range" min="0" max="100" step="1" />
                  <span class="slider-bound">100</span>
                  <span class="slider-value" id="settings-master-volume-value">--</span>
                </span>
              </label>
              <label class="settings-row slider-row">
                <span>Music Volume</span>
                <span class="slider-group">
                  <span class="slider-bound">0</span>
                  <input id="settings-music-volume" type="range" min="0" max="100" step="1" />
                  <span class="slider-bound">100</span>
                  <span class="slider-value" id="settings-music-volume-value">--</span>
                </span>
              </label>
              <label class="settings-row slider-row">
                <span>SFX Volume</span>
                <span class="slider-group">
                  <span class="slider-bound">0</span>
                  <input id="settings-sfx-volume" type="range" min="0" max="100" step="1" />
                  <span class="slider-bound">100</span>
                  <span class="slider-value" id="settings-sfx-volume-value">--</span>
                </span>
              </label>
            </div>
            <div id="settings-page-controls" class="hidden">
              ${ACTION_IDS.map(
                (action) => `
              <div class="settings-row binding-row" data-action="${action}">
                <span>${ACTION_LABELS[action]}</span>
                <button class="binding-button">–</button>
              </div>`,
              ).join('')}
              <p id="settings-controls-hint" class="stats-line">
                Click a binding, then press the new key or button. Escape cancels.
              </p>
            </div>
          </div>
          </div>
          <div id="settings-footer">
            <button id="settings-back-button">Back</button>
            <button id="settings-reset-bindings" class="hidden">Reset to Defaults</button>
          </div>
        </div>
      </div>
      <div id="chest-overlay" class="overlay chest hidden">
        <div id="chest-panel" class="overlay-panel">
          <div class="panel-header">Volt Crate</div>
          <!-- Same card language as the shop/level-up cards: tier border+glow,
               rarity tag, notched corners — the reel is just a card being
               revealed (2026-07-10 user request). -->
          <div id="chest-card" class="upgrade-card">
            <span id="chest-rarity" class="rarity-tag"></span>
            <!-- Reveal stage: rotating tier-colored god-rays behind the icon,
                 continuous spark rain while landed — all CSS, no JS state. -->
            <div id="chest-slot">
              <div id="chest-rays"></div>
              <div id="chest-reel"></div>
              <span id="chest-icon"></span>
              <i class="spark"></i><i class="spark"></i><i class="spark"></i><i class="spark"></i><i class="spark"></i>
              <i class="spark"></i><i class="spark"></i><i class="spark"></i><i class="spark"></i><i class="spark"></i>
            </div>
            <h3 id="chest-label"></h3>
            <p id="chest-desc"></p>
          </div>
          <button id="chest-continue" class="hidden">Continue</button>
        </div>
      </div>
      <div id="shop-overlay" class="overlay hidden">
        <div id="shop-panel" class="overlay-panel">
          <div class="shop-header">
            <img class="shop-portrait" src="assets/2d/ref-scrapper-front-v2.png" alt="" />
            <div class="shop-header-text">
              <div class="shop-name">The Scrapper</div>
              <div class="shop-flavor">Salvaged, not stolen. Mostly.</div>
            </div>
          </div>
          <p class="stats-line" id="shop-gold"></p>
          <div id="shop-perks" class="hidden"></div>
          <div id="shop-cards"></div>
          <button id="shop-leave-button">Leave</button>
        </div>
      </div>
      `,
    );

    this.xpFill = mustGet('xp-bar-fill');
    this.hpFill = mustGet('hp-bar-fill');
    this.timer = mustGet('timer');
    this.levelBadge = mustGet('level-badge');
    this.fpsCounter = mustGet('fps-counter');
    this.startOverlay = mustGet('start-overlay');
    this.draftCards = mustGet('draft-cards');
    this.levelUpOverlay = mustGet('levelup-overlay');
    this.levelUpFlash = mustGet('levelup-flash');
    this.upgradeCards = mustGet('upgrade-cards');
    this.endOverlay = mustGet('end-overlay');
    this.endTitle = mustGet('end-title');
    this.endSubtitle = mustGet('end-subtitle');
    this.endActions = mustGet('end-actions');
    this.endStats = mustGet('end-stats');
    this.endRunBuild = mustGet('end-run-build-content');
    this.endDamageList = mustGet('end-damage-list');
    this.bossBar = mustGet('boss-bar');
    this.bossFill = mustGet('boss-bar-fill');
    this.bossName = mustGet('boss-name');
    this.pauseOverlay = mustGet('pause-overlay');
    this.settingsOverlay = mustGet('settings-overlay');
    this.settingsMode = mustGet('settings-mode') as HTMLSelectElement;
    this.settingsResolution = mustGet('settings-resolution') as HTMLSelectElement;
    this.settingsUiScale = mustGet('settings-ui-scale') as HTMLSelectElement;
    this.masterVolume = mustGet('settings-master-volume') as HTMLInputElement;
    this.musicVolume = mustGet('settings-music-volume') as HTMLInputElement;
    this.sfxVolume = mustGet('settings-sfx-volume') as HTMLInputElement;

    const chestMarkerLayer = mustGet('chest-markers');
    for (let index = 0; index < PICKUPS.maxActive; index++) {
      const marker = document.createElement('div');
      marker.className = 'chest-marker hidden';
      marker.dataset['chestIndex'] = `${index}`;
      marker.innerHTML =
        `<img class="ui-glyph" src="${COIN_ICON}" alt="" />` +
        '<span class="chest-marker-price-amount"></span>';
      chestMarkerLayer.appendChild(marker);
      this.chestMarkers.push({
        root: marker,
        priceAmount: marker.querySelector<HTMLElement>('.chest-marker-price-amount')!,
      });
    }

    this.installUiAudioRouting();

    // Universal click feedback (user rule 2026-07-18): ANY interactive element
    // clicked anywhere — menus, shop, level-up cards, settings, unlocks —
    // plays the UI confirm. Delegated in capture phase so no individual
    // handler (present or future) needs to remember it.
    document.addEventListener(
      'click',
      (e) => {
        const target = this.uiTarget(e.target);
        if (target) this.emitUi(uiActionCue(target));
      },
      { capture: true },
    );
    mustGet('play-button').addEventListener('click', () => {
      mustGet('menu-overlay').classList.add('hidden');
      this.showCharacterSelection();
    });
    mustGet('characters-button').addEventListener('click', () => {
      mustGet('menu-overlay').classList.add('hidden');
      this.renderCharacterRoster('characters-roster', false);
      mustGet('characters-overlay').classList.remove('hidden');
    });
    mustGet('characters-back-button').addEventListener('click', () => {
      mustGet('characters-overlay').classList.add('hidden');
      mustGet('menu-overlay').classList.remove('hidden');
    });
    mustGet('character-select-back-button').addEventListener('click', () => {
      mustGet('character-select-overlay').classList.add('hidden');
      mustGet('menu-overlay').classList.remove('hidden');
    });
    mustGet('character-confirm-button').addEventListener('click', () => {
      this.selectedCharacterId = resolveCharacterId(this.selectedCharacterId, PROFILE);
      mustGet('character-select-overlay').classList.add('hidden');
      this.showDraft(this.selectedCharacterId);
    });
    mustGet('draft-back-button').addEventListener('click', () => {
      this.startOverlay.classList.add('hidden');
      this.showCharacterSelection();
    });
    {
      const surface = mustGet('defeat-skip-surface');
      surface.addEventListener('pointerdown', () => {
        this.defeatPointerHeld = true;
        this.defeatPointerSkip = true;
      });
      // Listened on the window, not the surface: a press released outside it
      // would otherwise leave the gate believing the button is still down.
      window.addEventListener('pointerup', () => { this.defeatPointerHeld = false; });
      window.addEventListener('pointercancel', () => { this.defeatPointerHeld = false; });
    }
    mustGet('end-primary-button').addEventListener('click', () => {
      if (this.endActionAccepted) return;
      this.endActionAccepted = true;
      this.hideEnd();
      this.onNewRun();
    });
    mustGet('restart-button').addEventListener('click', () => {
      if (this.endActionAccepted) return;
      this.endActionAccepted = true;
      this.endOverlay.classList.add('hidden');
      this.hideDefeatBeat();
      // Resets the run world AND the game state back to 'menu' (so the 3D stops
      // rendering behind the menu view); onQuitToMenu re-shows the main menu.
      this.onQuitToMenu();
    });
    for (const button of mustGet('feedback-fun').querySelectorAll<HTMLButtonElement>('button')) {
      button.addEventListener('click', () => {
        this.feedbackFun = Number(button.dataset['value']) as StructuredFeedback['fun'];
        selectSingleFeedbackButton('feedback-fun', button);
        this.updateFeedbackSubmitState();
      });
    }
    for (const button of mustGet('feedback-difficulty').querySelectorAll<HTMLButtonElement>('button')) {
      button.addEventListener('click', () => {
        this.feedbackDifficulty = button.dataset['value'] as FeedbackDifficulty;
        selectSingleFeedbackButton('feedback-difficulty', button);
        this.updateFeedbackSubmitState();
      });
    }
    for (const button of mustGet('feedback-reasons').querySelectorAll<HTMLButtonElement>('button')) {
      button.addEventListener('click', () => {
        const reason = button.dataset['value'] as FeedbackReason;
        if (this.feedbackReasons.has(reason)) this.feedbackReasons.delete(reason);
        else this.feedbackReasons.add(reason);
        button.classList.toggle('selected', this.feedbackReasons.has(reason));
        button.setAttribute('aria-pressed', `${this.feedbackReasons.has(reason)}`);
      });
    }
    mustGet('feedback-submit').addEventListener('click', async () => {
      if (!this.feedbackFun || !this.feedbackDifficulty) return;
      const submit = mustGet('feedback-submit') as HTMLButtonElement;
      submit.disabled = true;
      mustGet('feedback-status').textContent = 'Submitting feedback...';
      const accepted = await this.onFeedbackSubmit({
        fun: this.feedbackFun,
        difficulty: this.feedbackDifficulty,
        reasons: [...this.feedbackReasons],
      });
      if (!accepted) {
        submit.disabled = false;
        mustGet('feedback-status').textContent = 'Could not save feedback. Please try again.';
        return;
      }
      for (const button of mustGet('end-feedback').querySelectorAll<HTMLButtonElement>('button')) {
        button.disabled = true;
      }
      mustGet('feedback-status').textContent = 'Thank you. Feedback submitted.';
    });
    mustGet('menu-settings-button').addEventListener('click', () => {
      this.openSettings('menu');
    });
    mustGet('contracts-button').addEventListener('click', () => {
      mustGet('menu-overlay').classList.add('hidden');
      this.contractCategory = 'all';
      this.contractStatus = 'active';
      this.selectedContractId = null;
      this.renderContracts();
      mustGet('contracts-overlay').classList.remove('hidden');
      queueMicrotask(() => {
        const initial = mustGet('contracts-status-filters').querySelector<HTMLButtonElement>('[data-contract-status="active"]');
        if (initial) { this.suppressedFocusTarget = initial; initial.focus({ preventScroll: true }); this.noteUiFocus(initial, true); }
      });
    });
    mustGet('contracts-back-button').addEventListener('click', () => {
      mustGet('contracts-overlay').classList.add('hidden');
      mustGet('menu-overlay').classList.remove('hidden');
      mustGet('contracts-button').focus();
    });
    mustGet('contracts-overlay').addEventListener('keydown', (event) => this.handleContractsKeyDown(event));
    if (DEV_TOOLS.unlockPanel) {
      mustGet('unlocks-button').addEventListener('click', () => {
        mustGet('menu-overlay').classList.add('hidden');
        this.showUnlocks();
      });
      mustGet('unlocks-back-button').addEventListener('click', () => {
        mustGet('unlocks-overlay').classList.add('hidden');
        mustGet('menu-overlay').classList.remove('hidden');
      });
      mustGet('unlock-all-button').addEventListener('click', () => {
        for (const id of availableWeaponIds()) this.unlock('weapon', id);
        for (const id of Object.keys(CORE_TITLES)) this.unlock('core', id);
        for (const id of MOD_IDS) this.unlock('mod', id);
        // Also open every socket slot (dev testing; contracts drive these later).
        PROFILE.weaponSockets = PROFILE.maxWeaponSockets;
        PROFILE.coreSockets = PROFILE.maxCoreSockets;
        // One write for the whole sweep instead of one per unlocked item.
        saveProfile();
        this.renderUnlocks();
      });
      // Settles every contract through the real payout path, so the Contracts
      // screen shows each row with the item it granted. "Unlock everything"
      // above bypasses contracts entirely and leaves that screen empty.
      mustGet('complete-contracts-button').addEventListener('click', () => {
        devCompleteAllContracts();
        this.renderUnlocks();
      });
      mustGet('unlocks-reset-button').addEventListener('click', () => {
        resetProfile();
        this.renderUnlocks();
      });
    }
    mustGet('exit-button').addEventListener('click', () => {
      const api = (window as unknown as { electronAPI?: { quit?: () => void } }).electronAPI;
      if (api?.quit) api.quit();
      else window.close();
    });
    mustGet('resume-button').addEventListener('click', () => {
      this.onResume();
    });
    mustGet('pause-settings-button').addEventListener('click', () => {
      this.pauseOverlay.classList.add('hidden');
      this.openSettings('pause');
    });
    mustGet('quit-run-button').addEventListener('click', () => this.onQuitToMenu());
    // Auto-apply: every settings change commits immediately (no Apply
    // button, user rule 2026-07-13). Selects and gamepad-adjusted sliders
    // commit on change; pointer-adjusted volume sliders also commit on input so
    // the audible mix follows the handle while it moves.
    this.settingsMode.addEventListener('change', () => {
      this.syncResolutionAvailability();
      this.applySettingsNow();
    });
    for (const id of [
      'settings-resolution',
      'settings-ui-scale',
      'settings-master-volume',
      'settings-music-volume',
      'settings-sfx-volume',
    ]) {
      mustGet(id).addEventListener('change', () => this.applySettingsNow());
    }
    // Live readout and live audio preview while dragging.
    for (const id of ['settings-master-volume', 'settings-music-volume', 'settings-sfx-volume']) {
      const slider = mustGet(id) as HTMLInputElement;
      slider.addEventListener('input', () => {
        mustGet(`${id}-value`).textContent = slider.value;
        this.applySettingsNow();
      });
    }
    mustGet('settings-back-button').addEventListener('click', () => this.closeSettings());

    mustGet('settings-tab-general').addEventListener('click', () => this.showSettingsTab('general'));
    mustGet('settings-tab-controls').addEventListener('click', () =>
      this.showSettingsTab('controls'),
    );
    mustGet('settings-reset-bindings').addEventListener('click', () => {
      this.cancelBindingCapture();
      this.draftBindings = cloneBindings(DEFAULT_BINDINGS);
      this.renderBindings();
      this.applySettingsNow();
    });
    // The Controls tab shows ONE binding per action, for the device actually
    // in hand: gamepad bindings while a pad is connected, keyboard otherwise.
    for (const button of this.settingsOverlay.querySelectorAll<HTMLButtonElement>(
      '.binding-button',
    )) {
      button.addEventListener('click', () => {
        const row = button.closest<HTMLElement>('.binding-row');
        const action = row?.dataset.action as ActionId | undefined;
        if (!action) return;
        this.startBindingCapture(action, button);
      });
    }
    window.addEventListener('gamepadconnected', () => {
      this.gamepadActive = true;
      if (!this.captureTarget) this.renderBindings();
      this.notice('Gamepad detected');
    });
    window.addEventListener('gamepaddisconnected', () => {
      this.gamepadActive = Array.from(navigator.getGamepads?.() ?? []).some((p) => p !== null);
      if (!this.gamepadActive) {
        this.cancelBindingCapture();
        this.renderBindings();
        this.notice('Gamepad disconnected');
      }
    });
    // Keyboard capture runs at window capture-phase so the pressed key never
    // leaks into gameplay input or the Escape pause handler.
    window.addEventListener(
      'keydown',
      (e) => {
        if (!this.captureTarget) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.code === 'Escape') {
          this.cancelBindingCapture();
          return;
        }
        this.draftBindings.keyboard[this.captureTarget.action] = [e.code];
        this.captureTarget = null;
        this.renderBindings();
        this.applySettingsNow();
      },
      { capture: true },
    );
    window.addEventListener('keydown', (event) => this.handleCharacterDetailKeyDown(event));
    window.addEventListener('resize', () => {
      for (const section of document.querySelectorAll<HTMLElement>('[data-character-section-scroll]')) {
        this.syncCharacterSectionFocus(section);
      }
    });

    // Pre-composites every core icon inside the tier-tinted orb shell;
    // cards/panel fall back to bare icons until this resolves.
    this.coreOrbsReady = warmCoreOrbs({ ...STAT_ICON_IMAGES, ...CARD_ICON_IMAGES });
    // Start decoding UI art immediately; the loading screen AWAITS this too
    // (game.tickLoading), so the first level-up/chest/shop never pays a
    // first-decode hitch mid-run (Electron repro 2026-07-13).
    void this.preloadUiAssets();
  }

  /** Landing screen: title + Play. Runs always start (and end) here. */
  showMainMenu(): void {
    mustGet('menu-overlay').classList.remove('hidden');
  }

  /** The normal start flow, entered without passing through the main menu.
   *  Same seam the Play button uses, so New Run cannot drift from it. */
  showCharacterSelect(): void {
    mustGet('menu-overlay').classList.add('hidden');
    this.showCharacterSelection();
  }

  /** Loading view shown while the world builds + warms up (game.ts drives it). */
  showLoading(): void {
    this.startOverlay.classList.add('hidden');
    mustGet('loading-overlay').classList.remove('hidden');
  }

  hideLoading(): void {
    mustGet('loading-overlay').classList.add('hidden');
  }

  /** Dev unlock panel (TEMPORARY — the Contracts system will replace it). Lists
   *  every weapon, core and mod with its lock state; unlocking one pushes it
   *  into PROFILE so the pools pick it up on the NEXT run. */
  private showUnlocks(): void {
    this.renderUnlocks();
    mustGet('unlocks-overlay').classList.remove('hidden');
  }

  private renderUnlocks(): void {
    const weapons = availableWeaponIds().map((id) => ({
      kind: 'weapon' as const,
      id,
      name: WEAPON_INFO[id].title,
      icon: cardIconHtml(`weapon-${id}`),
      unlocked: PROFILE.unlockedWeapons.includes(id),
    }));
    const cores = Object.keys(CORE_TITLES).map((id) => ({
      kind: 'core' as const,
      id,
      name: CORE_TITLES[id] ?? id,
      icon: cardIconHtml(id),
      unlocked: PROFILE.unlockedCores.includes(id),
    }));
    const mods = MOD_IDS.map((id) => ({
      kind: 'mod' as const,
      id,
      name: MOD_REGISTRY[id].label,
      icon: `<img class="card-icon" src="${MOD_REGISTRY[id].image}" alt="" />`,
      unlocked: PROFILE.unlockedMods.includes(id),
    }));

    const columns = mustGet('unlocks-columns');
    columns.innerHTML = '';
    for (const [title, items] of [
      ['Weapons', weapons],
      ['Orbs', cores],
      ['Mods', mods],
    ] as const) {
      const col = document.createElement('div');
      col.className = 'unlocks-column';
      const unlockedCount = items.filter((it) => it.unlocked).length;
      const head = document.createElement('div');
      head.className = 'unlocks-column-head';
      head.textContent = `${title} (${unlockedCount}/${items.length})`;
      col.appendChild(head);
      for (const item of items) {
        const row = document.createElement('button');
        row.className = `unlock-row${item.unlocked ? ' unlocked' : ''}`;
        row.disabled = item.unlocked;
        row.innerHTML =
          `${item.icon}<span class="unlock-name">${item.name}</span>` +
          (item.unlocked
            ? '<span class="unlock-state">✓</span>'
            : '<img class="unlock-state-lock" src="assets/2d/icon-ui-lock-v2.png" alt="locked" />');
        if (!item.unlocked) {
          row.addEventListener('click', () => {
            this.unlock(item.kind, item.id);
            saveProfile();
            this.renderUnlocks();
          });
        }
        col.appendChild(row);
      }
      columns.appendChild(col);
    }

    // Sockets column (dev: locked slots the "Unlock everything" button opens;
    // contracts will drive these later — this UI is a testing stand-in).
    const socketCol = document.createElement('div');
    socketCol.className = 'unlocks-column';
    const socketDefs: { label: string; index: number; kind: 'weapon' | 'core' }[] = [
      ...Array.from({ length: PROFILE.maxWeaponSockets }, (_, i) => ({ label: `Weapon Socket ${i + 1}`, index: i + 1, kind: 'weapon' as const })),
      ...Array.from({ length: PROFILE.maxCoreSockets }, (_, i) => ({ label: `Core Socket ${i + 1}`, index: i + 1, kind: 'core' as const })),
    ];
    const socketOpen = (s: { index: number; kind: 'weapon' | 'core' }): boolean =>
      s.index <= (s.kind === 'weapon' ? PROFILE.weaponSockets : PROFILE.coreSockets);
    const socketsUnlocked = socketDefs.filter(socketOpen).length;
    const socketHead = document.createElement('div');
    socketHead.className = 'unlocks-column-head';
    socketHead.textContent = `Sockets (${socketsUnlocked}/${socketDefs.length})`;
    socketCol.appendChild(socketHead);
    for (const s of socketDefs) {
      const open = socketOpen(s);
      const row = document.createElement('button');
      row.className = `unlock-row${open ? ' unlocked' : ''}`;
      row.disabled = open;
      row.innerHTML =
        `<span class="unlock-name">${s.label}</span>` +
        (open
          ? '<span class="unlock-state">✓</span>'
          : '<img class="unlock-state-lock" src="assets/2d/icon-ui-lock-v2.png" alt="locked" />');
      if (!open) {
        row.addEventListener('click', () => {
          this.unlockSocket(s.kind, s.index);
          saveProfile();
          this.renderUnlocks();
        });
      }
      socketCol.appendChild(row);
    }
    columns.appendChild(socketCol);
  }

  /** Dev: raise a socket count so its slot is usable in the next run. */
  private unlockSocket(kind: 'weapon' | 'core', index: number): void {
    if (kind === 'weapon') {
      PROFILE.weaponSockets = Math.min(PROFILE.maxWeaponSockets, Math.max(PROFILE.weaponSockets, index));
    } else {
      PROFILE.coreSockets = Math.min(PROFILE.maxCoreSockets, Math.max(PROFILE.coreSockets, index));
    }
  }

  private unlock(kind: 'weapon' | 'core' | 'mod', id: string): void {
    if (kind === 'weapon') {
      if (!PROFILE.unlockedWeapons.includes(id as WeaponId)) {
        PROFILE.unlockedWeapons.push(id as WeaponId);
      }
    } else if (kind === 'core') {
      if (!PROFILE.unlockedCores.includes(id)) PROFILE.unlockedCores.push(id);
    } else {
      if (!PROFILE.unlockedMods.includes(id as ModId)) PROFILE.unlockedMods.push(id as ModId);
      // UNLOCKED_MOD_IDS is a cached snapshot — rebuild it so the reel/shop
      // pick up the newly unlocked mod on the next run.
      refreshUnlockedMods();
    }
  }

  /** Master-detail goal browser. Pending dry queue rungs stay hidden, while
   *  previews retain the canonical settlement order supplied by contracts.ts. */
  private renderContracts(): void {
    const rewardPreviews = previewContractRewards();
    const rows: ContractViewRow[] = ACTIVE_CONTRACTS.map((contract) => {
      const { current, target } = progressOf(contract.objective);
      // "Done" means SETTLED, not merely "objective met". Settling declines a
      // spare ladder rung whose queue has run dry, so treating the objective as
      // the source of truth would paint that rung complete with no reward.
      const done = LIFETIME.completedContracts.includes(contract.id);
      return {
        contract,
        current: Math.min(current, target),
        target,
        done,
        asTime: 'seconds' in contract.objective,
        ratio: target > 0 ? current / target : 0,
        resolved: rewardPreviews[contract.id] ?? null,
      };
    });

    // A spare ladder rung with nothing left in its queue is not offered. A
    // settled legacy row remains visible even if its attribution is missing.
    const visibleRows = rows.filter((row) => row.done || row.resolved !== null);
    const completedCount = visibleRows.filter((row) => row.done).length;
    mustGet('contracts-summary').textContent =
      `${visibleRows.length - completedCount} active / ${completedCount} completed — select a contract for full details`;

    const categoryHost = mustGet('contracts-category-filters');
    categoryHost.innerHTML = '';
    for (const category of CONTRACT_CATEGORIES) {
      const count = visibleRows.filter((row) =>
        (category.key === 'all' || rewardCategory(row.contract.reward) === category.key),
      ).length;
      if (category.key === 'character' && count === 0) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'contracts-filter contracts-category-tab';
      button.id = `contracts-category-${category.key}`;
      button.dataset.contractCategory = category.key;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', 'contracts-list');
      button.setAttribute('aria-selected', `${this.contractCategory === category.key}`);
      button.tabIndex = this.contractCategory === category.key ? 0 : -1;
      button.innerHTML = `<span class="contracts-filter-label">${category.label}</span><span class="contracts-filter-count">${count}</span>`;
      button.addEventListener('click', () => {
        this.contractCategory = category.key;
        this.renderContracts();
        mustGet('contracts-category-filters').querySelector<HTMLButtonElement>(`[data-contract-category="${category.key}"]`)?.focus();
      });
      categoryHost.appendChild(button);
    }
    mustGet('contracts-list').setAttribute('aria-labelledby', `contracts-category-${this.contractCategory}`);

    const statusHost = mustGet('contracts-status-filters');
    statusHost.innerHTML = '';
    for (const status of ['active', 'completed'] as const) {
      const count = visibleRows.filter((row) => row.done === (status === 'completed')).length;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'contracts-filter contracts-status-filter contracts-status-segment';
      button.dataset.contractStatus = status;
      button.setAttribute('aria-controls', 'contracts-list');
      button.setAttribute('aria-pressed', `${this.contractStatus === status}`);
      button.disabled = status === 'completed' && count === 0;
      button.innerHTML = `<span class="contracts-filter-label">${status === 'active' ? 'Active' : 'Completed'}</span><span class="contracts-filter-count">${count}</span>`;
      button.addEventListener('click', () => {
        this.contractStatus = status;
        this.renderContracts();
        mustGet('contracts-status-filters').querySelector<HTMLButtonElement>(`[data-contract-status="${status}"]`)?.focus();
      });
      statusHost.appendChild(button);
    }

    const filteredRows = visibleRows.filter((row) =>
      row.done === (this.contractStatus === 'completed') &&
      (this.contractCategory === 'all' || rewardCategory(row.contract.reward) === this.contractCategory),
    );
    // The All tab is a category index, not a progress ranking. Keep each
    // category's ACTIVE_CONTRACTS declaration order while putting categories in
    // the same order as their visible tabs.
    const categoryOrder = new Map(
      CONTRACT_CATEGORIES
        .filter(({ key }) => key !== 'all')
        .map(({ key }, index) => [key, index]),
    );
    const displayRows = this.contractCategory === 'all'
      ? [...filteredRows].sort((a, b) =>
        (categoryOrder.get(rewardCategory(a.contract.reward)) ?? Number.MAX_SAFE_INTEGER) -
        (categoryOrder.get(rewardCategory(b.contract.reward)) ?? Number.MAX_SAFE_INTEGER))
      : filteredRows;
    // A filter may hide the prior selection. Choose the closest visible row by
    // progress from the ungrouped result, so presentation order never changes
    // the documented nearest-completion fallback.
    const selected = displayRows.find((row) => row.contract.id === this.selectedContractId) ??
      filteredRows.reduce<ContractViewRow | null>(
        (nearest, row) => nearest === null || row.ratio > nearest.ratio ? row : nearest,
        null,
      );
    this.selectedContractId = selected?.contract.id ?? null;

    const list = mustGet('contracts-list');
    list.innerHTML = '';
    if (filteredRows.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'contracts-empty';
      empty.textContent = this.contractStatus === 'active'
        ? 'No active contracts in this category.'
        : 'No completed contracts in this category yet.';
      list.appendChild(empty);
    } else {
      for (const row of displayRows) list.appendChild(this.contractRow(row));
    }
    this.renderContractDetail(selected);
  }

  private installUiAudioRouting(): void {
    for (const [id, cue] of Object.entries(UI_ACTION_CUES)) { const control = document.getElementById(id); if (control) control.dataset.uiCue = cue; }
    document.addEventListener('pointerover', (event) => {
      if (isMouseHover(event)) this.noteUiFocus(this.uiTarget(event.target));
    });
    document.addEventListener('pointerout', (event) => {
      const from = this.uiTarget(event.target); const to = this.uiTarget(event.relatedTarget);
      if (from && from !== to) this.uiFocus.clear(from);
    });
    document.addEventListener('focusin', (event) => {
      const target = this.uiTarget(event.target);
      if (target === this.suppressedFocusTarget) { this.suppressedFocusTarget = null; return; }
      this.noteUiFocus(target);
    });
    document.addEventListener('focusout', (event) => {
      const from = this.uiTarget(event.target); const to = this.uiTarget(event.relatedTarget);
      if (from && from !== to) this.uiFocus.clear(from);
    });
  }
  private uiTarget(raw: EventTarget | null): HTMLElement | null {
    if (!(raw instanceof Element)) return null;
    const target = raw.closest<HTMLElement>(UI_INTERACTIVE_SELECTOR);
    return !target || target.offsetParent === null || target.matches(':disabled, [aria-disabled="true"]') ? null : target;
  }
  private emitUi(cue: UiActionCue): void { if (cue !== 'none') this.onUiAudio(cue); }
  private noteUiFocus(target: HTMLElement | null, silent = false): void { if (this.uiFocus.move(target, silent)) this.onUiAudio('ui-focus'); }

  private contractRow(row: ContractViewRow): HTMLButtonElement {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `contract-row${row.done ? ' done' : ''}`;
    item.dataset.contractId = row.contract.id;
    item.setAttribute('aria-controls', 'contract-detail');
    item.setAttribute('aria-current', `${row.contract.id === this.selectedContractId}`);
    item.setAttribute('aria-label', `${row.contract.title}, ${fmtProgress(row.current, row.asTime)} of ${fmtProgress(row.target, row.asTime)}, ${row.done ? 'completed' : 'active'}`);

    item.innerHTML =
      `<div class="contract-icon">${rewardIconHtml(row.resolved, row.done)}</div>` +
      '<div class="contract-body">' +
        '<div class="contract-head">' +
          '<span class="contract-title"></span>' +
          `<span class="contract-count">${fmtProgress(row.current, row.asTime)} / ${fmtProgress(row.target, row.asTime)}${row.done ? ' COMPLETE' : ''}</span>` +
        '</div>' +
        segmentedContractBarHtml(row.current, row.target, `${row.contract.title} progress`, row.asTime) +
      '</div>';
    const title = item.querySelector<HTMLElement>('.contract-title');
    if (title) title.textContent = row.contract.title;
    item.addEventListener('click', () => {
      this.selectedContractId = row.contract.id;
      for (const button of mustGet('contracts-list').querySelectorAll<HTMLButtonElement>('.contract-row')) {
        button.setAttribute('aria-current', `${button.dataset.contractId === this.selectedContractId}`);
      }
      this.renderContractDetail(row);
    });
    return item;
  }

  private renderContractDetail(row: ContractViewRow | null): void {
    const detail = mustGet('contract-detail');
    detail.innerHTML = '';
    if (!row) {
      detail.className = 'contract-detail contract-detail-empty';
      detail.textContent = 'Choose another category or status to browse its contracts.';
      return;
    }

    detail.className = `contract-detail${row.done ? ' done' : ''}`;
    const category = CONTRACT_CATEGORIES.find(({ key }) => key === rewardCategory(row.contract.reward))?.label ?? 'Reward';
    detail.innerHTML =
      '<div class="contract-detail-hero">' +
        `<div class="contract-detail-icon">${rewardIconHtml(row.resolved, row.done)}</div>` +
        '<div class="contract-detail-heading">' +
          `<div class="contract-detail-meta">${category} / ${row.done ? 'COMPLETED' : 'ACTIVE'}</div>` +
          '<h2 class="contract-detail-title"></h2>' +
        '</div>' +
      '</div>' +
      '<p class="contract-detail-objective"></p>' +
      '<div class="contract-detail-progress">' +
        `<strong>${fmtProgress(row.current, row.asTime)} / ${fmtProgress(row.target, row.asTime)}${row.done ? ' - SETTLED' : ''}</strong>` +
        segmentedContractBarHtml(row.current, row.target, `${row.contract.title} progress`, row.asTime) +
      '</div>' +
      `<div class="contract-detail-reward"><span>${row.done ? 'OWNED' : 'REWARD'}</span>${rewardLabelHtml(row.contract.reward, row.resolved, row.done)}</div>`;
    const title = detail.querySelector<HTMLElement>('.contract-detail-title');
    if (title) title.textContent = row.contract.title;
    const objective = detail.querySelector<HTMLElement>('.contract-detail-objective');
    if (objective) objective.textContent = describeObjective(row.contract.objective);
  }

  /** The payout beat. Rendered only when something was earned: an empty
   *  "0 contracts" box would turn most deaths into a reminder of failure.
   *  Rows reveal one after another instead of all at once — a player returning
   *  after a backlog can settle many at the same time, and nine lines landing
   *  together read as a log dump, not a reward. */
  private renderEarnedContracts(earned: EarnedContract[]): void {
    const host = mustGet('end-contracts');
    host.classList.toggle('hidden', earned.length === 0);
    host.innerHTML = '';
    if (earned.length === 0) return;

    const header = document.createElement('div');
    header.className = 'end-contracts-header';
    header.textContent = earned.length > 1 ? `${earned.length} Contracts Complete` : 'Contract Complete';
    host.appendChild(header);

    const list = document.createElement('div');
    list.className = 'end-contracts-list';
    host.appendChild(list);

    // Cap the rows rather than let the block scroll. A scrollbar inside a
    // reward moment reads as a log, and a tall block pushes the run title off
    // the top of the screen. The overflow is summarised; the Contracts screen
    // holds the full record.
    const MAX_ROWS = 5;
    for (const [index, item] of earned.slice(0, MAX_ROWS).entries()) {
      const row = document.createElement('div');
      row.className = 'end-contract-row';
      row.style.animationDelay = `${index * 0.14}s`;
      row.innerHTML =
        `<span class="end-contract-name">${item.contract.title}</span>` +
        '<span class="end-contract-arrow" aria-hidden="true">&gt;&gt;</span>' +
        `<span class="end-contract-reward">${item.label}</span>`;
      list.appendChild(row);
    }

    if (earned.length > MAX_ROWS) {
      const more = document.createElement('div');
      more.className = 'end-contracts-more';
      more.style.animationDelay = `${MAX_ROWS * 0.14}s`;
      more.textContent = `+${earned.length - MAX_ROWS} more — see Contracts`;
      list.appendChild(more);
    }
  }

  showPause(visible: boolean): void {
    this.pauseOverlay.classList.toggle('hidden', !visible);
  }

  syncSettings(settings: GameSettings): void {
    this.settingsMode.value = settings.displayMode;
    this.settingsResolution.value = settings.resolution;
    this.syncResolutionAvailability();
    this.settingsUiScale.value = settings.uiScale;
    this.masterVolume.value = Math.round(settings.masterVolume * 100).toString();
    this.musicVolume.value = Math.round(settings.musicVolume * 100).toString();
    this.sfxVolume.value = Math.round(settings.sfxVolume * 100).toString();
    for (const slider of [this.masterVolume, this.musicVolume, this.sfxVolume]) {
      mustGet(`${slider.id}-value`).textContent = slider.value;
    }
    this.draftBindings = cloneBindings(settings.bindings);
    this.renderBindings();
  }

  private openSettings(returnOverlay: 'menu' | 'pause'): void {
    this.settingsReturnOverlay = returnOverlay;
    this.syncResolutionAvailability();
    mustGet('menu-overlay').classList.add('hidden');
    this.settingsOverlay.classList.remove('hidden');
    this.showSettingsTab('general');
  }

  closeSettings(): void {
    this.cancelBindingCapture();
    this.settingsOverlay.classList.add('hidden');
    if (this.settingsReturnOverlay === 'pause') {
      this.pauseOverlay.classList.remove('hidden');
      return;
    }
    mustGet('menu-overlay').classList.remove('hidden');
  }

  closeSettingsFromBack(): void { this.emitUi('ui-back'); this.closeSettings(); }

  isSettingsOpen(): boolean {
    return !this.settingsOverlay.classList.contains('hidden');
  }

  private readSettingsForm(): GameSettings {
    return {
      displayMode: this.settingsMode.value === 'fullscreen' ? 'fullscreen' : 'windowed',
      resolution: this.settingsResolution.value,
      uiScale: this.settingsUiScale.value as UiScale,
      masterVolume: Number(this.masterVolume.value) / 100,
      musicVolume: Number(this.musicVolume.value) / 100,
      sfxVolume: Number(this.sfxVolume.value) / 100,
      bindings: cloneBindings(this.draftBindings),
    };
  }

  /** Fullscreen always uses the current display's native resolution. Keep the
   * stored windowed choice intact, but make it clear that it applies only after
   * switching Display back to Windowed. */
  private syncResolutionAvailability(): void {
    const disabled = this.settingsMode.value === 'fullscreen';
    this.settingsResolution.disabled = disabled;
    this.settingsResolution.setAttribute('aria-disabled', String(disabled));
  }

  private showSettingsTab(tab: 'general' | 'controls'): void {
    this.cancelBindingCapture();
    mustGet('settings-page-general').classList.toggle('hidden', tab !== 'general');
    mustGet('settings-page-controls').classList.toggle('hidden', tab !== 'controls');
    mustGet('settings-tab-general').classList.toggle('active', tab === 'general');
    mustGet('settings-tab-controls').classList.toggle('active', tab === 'controls');
    mustGet('settings-reset-bindings').classList.toggle('hidden', tab !== 'controls');
  }

  private renderBindings(): void {
    for (const row of this.settingsOverlay.querySelectorAll<HTMLElement>('.binding-row')) {
      const action = row.dataset.action as ActionId;
      const button = row.querySelector<HTMLButtonElement>('.binding-button');
      if (!button) continue;
      button.textContent = this.gamepadActive
        ? this.draftBindings.gamepad[action].map(gamepadButtonLabel).join(' / ')
        : this.draftBindings.keyboard[action].map(keyLabel).join(' / ');
      button.classList.remove('capturing');
    }
    const hint = document.getElementById('settings-controls-hint');
    if (hint) {
      hint.textContent = this.gamepadActive
        ? 'Gamepad mode. Click a binding, then press the new button. Left stick always moves · Start pauses.'
        : 'Click a binding, then press the new key. Escape cancels.';
    }
  }

  /** Small corner notice, bottom-right (device events, non-headline info).
   *  Lives on document.body — the #hud layer hides under menu views, and
   *  gamepad connections happen in menus more than anywhere. */
  private notice(message: string): void {
    const el = document.createElement('div');
    el.className = 'corner-notice';
    el.textContent = message;
    document.body.appendChild(el);
    window.setTimeout(() => el.remove(), 3200);
  }

  private startBindingCapture(action: ActionId, button: HTMLButtonElement): void {
    this.cancelBindingCapture();
    this.captureTarget = { action, button };
    button.textContent = 'PRESS KEY / BUTTON…';
    button.classList.add('capturing');
  }

  private cancelBindingCapture(): void {
    if (!this.captureTarget) return;
    this.captureTarget = null;
    this.renderBindings();
  }

  /** Called once per frame by the game loop. While a gamepad capture is
   *  armed it samples the pad; returns true whenever ANY capture is in
   *  progress so the frame swallows pause/gameplay input. */
  tickBindingCapture(input: PlayerInput): boolean {
    if (!this.captureTarget) return false;
    const pressed = input.captureGamepadButton();
    if (pressed !== null) {
      this.draftBindings.gamepad[this.captureTarget.action] = [pressed];
      this.captureTarget = null;
      this.renderBindings();
      this.applySettingsNow();
    }
    return true;
  }

  /** Commits the current form + bindings immediately (auto-apply). */
  private applySettingsNow(): void {
    this.onSettingsChanged(this.readSettingsForm());
  }

  private coreOrbsReady: Promise<unknown> = Promise.resolve();
  private uiAssetsPromise: Promise<void> | null = null;
  private uiWarmupHost: HTMLElement | null = null;

  /** Decodes and pre-paints gameplay UI images (weapon/stat/card/mod icons,
   *  glyphs, portraits) plus orb-shell composites. `decode()` alone only pays
   *  the CPU decode; the first actual paint can still upload big PNGs to the
   *  compositor/GPU. The hidden warmup host forces that cost behind loading. */
  preloadUiAssets(): Promise<void> {
    if (this.uiAssetsPromise) return this.uiAssetsPromise;
    this.uiAssetsPromise = (async () => {
      await this.coreOrbsReady.catch(() => {});

      const sources = new Set<string>([
        COIN_ICON,
        SKULL_ICON,
        'assets/2d/icon-ui-lock-v2.png',
        'assets/2d/icon-item-repair.png',
        'assets/2d/ref-scrapper-front-v2.png',
        'assets/2d/logo-mascot-v3.png',
        'assets/2d/logo-letras-v3.png',
        ...Object.values(WEAPON_ICON_IMAGES),
        ...Object.values(STAT_ICON_IMAGES),
        ...Object.values(CARD_ICON_IMAGES),
        ...Object.values(BOSS_PORTRAITS),
        ...Object.values(CHARACTER_REGISTRY)
          .map((character) => character.portrait)
          .filter((src): src is string => typeof src === 'string'),
        ...Object.values(MOD_REGISTRY)
          .map((mod) => mod.image)
          .filter((src): src is string => typeof src === 'string'),
      ]);

      const coreKeys = [...Object.keys(STAT_ICON_IMAGES), ...Object.keys(CARD_ICON_IMAGES)];
      const tiers: Rarity[] = ['gray', 'green', 'blue', 'purple', 'gold'];
      for (const key of coreKeys) {
        for (const tier of tiers) {
          const orb = coreOrbIcon(key, tier);
          if (orb) sources.add(orb);
        }
      }

      const imgs = [...sources].map((src) => {
        const img = new Image();
        img.decoding = 'async';
        img.loading = 'eager';
        img.src = src;
        return img;
      });
      await Promise.all(imgs.map((img) => img.decode?.().catch(() => {}) ?? Promise.resolve()));
      this.mountUiWarmupImages(imgs);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    })();
    return this.uiAssetsPromise;
  }

  private mountUiWarmupImages(imgs: HTMLImageElement[]): void {
    if (this.uiWarmupHost) return;
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    Object.assign(host.style, {
      position: 'fixed',
      left: '-10000px',
      top: '0',
      width: '8px',
      height: '8px',
      overflow: 'hidden',
      opacity: '0.01',
      pointerEvents: 'none',
      zIndex: '-1',
    });
    for (const img of imgs) {
      img.alt = '';
      img.width = 1;
      img.height = 1;
      host.appendChild(img);
    }
    document.body.appendChild(host);
    this.uiWarmupHost = host;
  }

  // ── Gamepad menu navigation ──────────────────────────────────────────
  // D-pad/left stick moves a visible focus over the active overlay's
  // interactive elements, A activates, B triggers the overlay's back/resume
  // action. Overlay priority: topmost-first (settings sits over pause).
  private static readonly NAV_OVERLAYS = [
    'settings-overlay',
    'character-select-overlay',
    'characters-overlay',
    'contracts-overlay',
    'unlocks-overlay',
    'shop-overlay',
    'chest-overlay',
    'levelup-overlay',
    'pause-overlay',
    'end-overlay',
    'start-overlay',
    'menu-overlay',
  ];
  private padNavContainer: HTMLElement | null = null;
  private padNavIndex = 0;
  private padEditingSelect: HTMLSelectElement | null = null;
  private padEditingSelectOriginalIndex = 0;

  /** Called once per frame (outside binding captures). */
  tickMenuNav(input: PlayerInput): void {
    if (!input.gamepadConnected()) return;
    let container: HTMLElement | null = null;
    for (const id of Hud.NAV_OVERLAYS) {
      const el = document.getElementById(id);
      if (el && !el.classList.contains('hidden')) {
        container = el;
        break;
      }
    }
    if (!container) {
      this.setPadFocus(null);
      this.padNavContainer = null;
      this.closePadSelectEditor(false);
      return;
    }
    // The chest reel card (#chest-card) is a display, not a choice — the
    // only action after opening a chest is Continue, so focus lands there.
    const items = this.menuNavItems(container);
    if (items.length === 0) return;
    if (this.padNavContainer !== container) {
      this.padNavContainer = container;
      this.padNavIndex = 0;
      this.setPadFocus(items[0] ?? null, true);
      this.closePadSelectEditor(false);
    }
    if (this.padNavIndex >= items.length) this.padNavIndex = items.length - 1;

    // Vertical moves focus. Horizontal nudges sliders; closed selects swallow
    // horizontal input and only change after Interact opens edit mode.
    let vertical = 0;
    if (input.consumeGamepadPress(13)) vertical = 1;
    else if (input.consumeGamepadPress(12)) vertical = -1;
    else vertical = input.consumeStickStep();
    let horizontal = 0;
    if (input.consumeGamepadPress(15)) horizontal = 1;
    else if (input.consumeGamepadPress(14)) horizontal = -1;
    else horizontal = input.consumeStickStepX();

    let current = items[this.padNavIndex] ?? null;

    // Selects are two-step with a pad: closed = navigation only; open = choose
    // an option, then Interact confirms. Left/right on a closed select must not
    // auto-apply, because that makes mere navigation mutate settings.
    if (this.padEditingSelect) {
      if (!items.includes(this.padEditingSelect) || this.padEditingSelect !== current) {
        this.closePadSelectEditor(false);
      } else {
        const delta = vertical !== 0 ? vertical : horizontal;
        if (delta !== 0) this.movePadSelectDraft(delta);

        let acceptEdit = false;
        for (const buttonIndex of this.draftBindings.gamepad.interact) {
          if (input.consumeGamepadPress(buttonIndex)) acceptEdit = true;
        }
        if (acceptEdit) this.closePadSelectEditor(true);
        if (input.consumeGamepadPress(1)) this.closePadSelectEditor(false);
        return;
      }
    }

    if (horizontal !== 0 && current instanceof HTMLSelectElement) {
      // Closed selects swallow horizontal input; Interact opens edit mode.
    } else if (horizontal !== 0 && current && this.adjustControl(current, horizontal)) {
      // consumed as a value change
    } else if (horizontal !== 0 && vertical === 0) {
      vertical = horizontal;
    }
    if (vertical !== 0 && current?.matches('[data-character-section-scroll]') && this.scrollCharacterSection(current, vertical)) {
      // Keep focus in the Characters section until the requested direction reaches
      // its boundary. The next press then resumes ordinary menu traversal.
    } else if (vertical !== 0) {
      this.padNavIndex = (this.padNavIndex + vertical + items.length) % items.length;
      this.setPadFocus(items[this.padNavIndex] ?? null);
    } else if (!items[this.padNavIndex]?.classList.contains('pad-focus')) {
      this.setPadFocus(items[this.padNavIndex] ?? null);
    }
    current = items[this.padNavIndex] ?? null;

    // Accept = the player's Interact binding, and ONLY that (no hardcoded
    // A fallback ? one action button everywhere, 2026-07-13 user rule).
    let accept = false;
    for (const buttonIndex of this.draftBindings.gamepad.interact) {
      if (input.consumeGamepadPress(buttonIndex)) accept = true;
    }
    if (accept && current) {
      if (current instanceof HTMLSelectElement) this.openPadSelectEditor(current);
      else current.click();
    }
    if (input.consumeGamepadPress(1)) {
      const back = container.querySelector<HTMLElement>(
        '#settings-back-button, #character-select-back-button, #characters-back-button, #draft-back-button, ' +
          '#contracts-back-button, #unlocks-back-button, #shop-leave-button, #chest-continue, #resume-button, #restart-button',
      );
      if (back && back.offsetParent !== null) back.click();
    }
  }

  /** Adjusts a focused settings control with the d-pad. Sliders nudge by 5
   *  and fire 'change' so auto-apply runs. Selects are intentionally excluded:
   *  they use explicit open/confirm edit mode instead. */
  private adjustControl(el: HTMLElement, dir: number): boolean {
    if (el instanceof HTMLInputElement && el.type === 'range') {
      const min = Number(el.min || 0);
      const max = Number(el.max || 100);
      el.value = String(Math.min(max, Math.max(min, Number(el.value) + dir * 5)));
      el.dispatchEvent(new Event('input')); // keep the value readout live
      el.dispatchEvent(new Event('change'));
      return true;
    }
    return false;
  }

  private openPadSelectEditor(select: HTMLSelectElement): void {
    if (this.padEditingSelect === select) return;
    this.closePadSelectEditor(false);
    this.padEditingSelect = select;
    this.padEditingSelectOriginalIndex = select.selectedIndex;
    select.classList.add('pad-select-open');
    select.size = Math.min(Math.max(select.options.length, 2), 8);
    select.focus({ preventScroll: true });
  }

  private movePadSelectDraft(dir: number): void {
    const select = this.padEditingSelect;
    if (!select) return;
    const count = select.options.length;
    if (count === 0) return;
    select.selectedIndex = (select.selectedIndex + dir + count) % count;
  }

  private closePadSelectEditor(confirm: boolean): void {
    const select = this.padEditingSelect;
    if (!select) return;
    if (!confirm) select.selectedIndex = this.padEditingSelectOriginalIndex;
    select.size = 0;
    select.classList.remove('pad-select-open');
    select.blur();
    this.padEditingSelect = null;
    if (confirm) select.dispatchEvent(new Event('change'));
  }

  private setPadFocus(el: HTMLElement | null, silent = false): void {
    // Drop any native DOM focus so a previously clicked select/slider can't
    // keep eating keyboard arrows while the pad focus is elsewhere.
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) active.blur();
    for (const focused of document.querySelectorAll('.pad-focus')) {
      focused.classList.remove('pad-focus');
    }
    if (el) {
      el.classList.add('pad-focus');
      el.scrollIntoView({ block: 'nearest' });
    }
    this.noteUiFocus(el, silent);
  }

  private menuNavItems(container: HTMLElement): HTMLElement[] {
    const items = Array.from(
      container.querySelectorAll<HTMLElement>(
        'button, select, input[type="range"], .upgrade-card:not(#chest-card), .unlock-row, [data-character-section-scroll]',
      ),
    ).filter(
      (el) =>
        el.offsetParent !== null &&
        !el.classList.contains('hidden') &&
        !(el as HTMLButtonElement).disabled &&
        (!el.matches('[data-character-section-scroll]') || this.syncCharacterSectionFocus(el)),
    );
    // The scroll owner wraps the roster buttons in DOM order, but it is a
    // deliberate navigation stop after those buttons, not before them.
    const sectionIndex = items.findIndex((item) => item.matches('[data-character-section-scroll]'));
    if (sectionIndex >= 0) {
      const section = items[sectionIndex];
      items.splice(sectionIndex, 1);
      let insertionIndex = 0;
      for (let index = 0; index < items.length; index++) {
        if (items[index]?.matches('[data-character-id]')) insertionIndex = index + 1;
      }
      if (section) items.splice(insertionIndex, 0, section);
    }
    return items;
  }

  private syncCharacterSectionFocus(section: HTMLElement): boolean {
    const scrollable = section.scrollHeight - section.clientHeight > 1;
    section.tabIndex = scrollable ? 0 : -1;
    return scrollable;
  }

  private handleContractsKeyDown(event: KeyboardEvent): void {
    const overlay = mustGet('contracts-overlay');
    if (overlay.classList.contains('hidden') || !(event.target instanceof HTMLButtonElement)) return;
    const current = event.target;
    let selector = '';
    let direction = 0;
    if (current.matches('.contracts-filter')) {
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') direction = 1;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') direction = -1;
      selector = current.matches('.contracts-status-filter')
        ? '#contracts-status-filters .contracts-filter'
        : '#contracts-category-filters .contracts-filter';
    } else if (current.matches('.contract-row')) {
      if (event.key === 'ArrowDown') direction = 1;
      else if (event.key === 'ArrowUp') direction = -1;
      selector = '#contracts-list .contract-row';
    }
    if (!selector || direction === 0) return;

    const items = Array.from(overlay.querySelectorAll<HTMLButtonElement>(selector)).filter((button) => !button.disabled);
    const currentIndex = items.indexOf(current);
    if (currentIndex < 0 || items.length < 2) return;
    event.preventDefault();
    const nextIndex = (currentIndex + direction + items.length) % items.length;
    if (selector.includes('contract-row')) {
      items[nextIndex]?.focus({ preventScroll: true });
      items[nextIndex]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      return;
    }
    const identity = items[nextIndex]?.dataset.contractCategory ?? items[nextIndex]?.dataset.contractStatus;
    const next = items[nextIndex];
    if (next) {
      next.dataset.uiCue = 'none';
      next.click();
    }
    const updated = Array.from(overlay.querySelectorAll<HTMLButtonElement>(selector)).find((button) =>
      button.dataset.contractCategory === identity || button.dataset.contractStatus === identity,
    );
    updated?.focus({ preventScroll: true });
    updated?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  private scrollCharacterSection(section: HTMLElement, direction: number): boolean {
    const before = section.scrollTop;
    const max = Math.max(0, section.scrollHeight - section.clientHeight);
    section.scrollTop = Math.min(max, Math.max(0, before + direction * MENU_NAVIGATION.characterSectionScrollPx));
    return section.scrollTop !== before;
  }

  private handleCharacterDetailKeyDown(event: KeyboardEvent): void {
    const direction = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (direction === 0 || !(event.target instanceof HTMLElement)) return;
    const target = event.target;
    const container = target.closest<HTMLElement>('#character-select-overlay, #characters-overlay');
    if (!container || container.classList.contains('hidden')) return;

    if (target.matches('[data-character-section-scroll]') && this.scrollCharacterSection(target, direction)) {
      event.preventDefault();
      return;
    }

    const items = this.menuNavItems(container);
    const index = items.indexOf(target);
    const nextIndex = index + direction;
    const next = nextIndex >= 0 && nextIndex < items.length ? items[nextIndex] : null;
    if (index < 0 || !next) return;
    const crossesSection = target.matches('[data-character-section-scroll]') || next.matches('[data-character-section-scroll]');
    const leavesRoster = direction > 0 && target.matches('[data-character-id]');
    const returnsFromActions = direction < 0 && target.closest('.character-actions') !== null;
    if (!crossesSection && !leavesRoster && !returnsFromActions) return;
    event.preventDefault();
    this.padNavContainer = container;
    this.padNavIndex = nextIndex;
    this.setPadFocus(next);
    next.focus({ preventScroll: true });
  }

  private showCharacterSelection(): void {
    this.selectedCharacterId = resolveCharacterId(this.selectedCharacterId, PROFILE);
    this.renderCharacterRoster('character-select-roster', true);
    mustGet('character-select-overlay').classList.remove('hidden');
  }

  /** One registry drives both the start selector and the main-menu roster. */
  private renderCharacterRoster(hostId: string, selectable: boolean): void {
    const host = mustGet(hostId);
    if (selectable) host.dataset.defaultCharacterId = DEFAULT_CHARACTER_ID;
    const characters = Object.values(CHARACTER_REGISTRY);
    const selected = CHARACTER_REGISTRY[this.selectedCharacterId] ?? CHARACTER_REGISTRY[DEFAULT_CHARACTER_ID];
    const selectedUnlocked = PROFILE.unlockedCharacters.includes(selected.id);
    host.innerHTML = '<div class="character-grid"></div><article class="character-detail"></article>';
    const grid = host.querySelector<HTMLElement>('.character-grid')!;
    const detail = host.querySelector<HTMLElement>('.character-detail')!;
    host.tabIndex = -1;
    host.dataset.characterSectionScroll = 'true';
    host.setAttribute('role', 'region');
    host.setAttribute('aria-label', `${selected.name} character profile`);

    for (const character of characters) {
      const unlocked = PROFILE.unlockedCharacters.includes(character.id);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `character-card${character.id === selected.id ? ' selected' : ''}${unlocked ? '' : ' locked'}`;
      card.dataset.characterId = character.id;
      card.dataset.characterUnlocked = `${unlocked}`;
      card.setAttribute('aria-pressed', `${character.id === selected.id}`);
      card.innerHTML = this.characterPortraitHtml(character);
      const name = document.createElement('strong');
      name.textContent = character.name;
      const status = document.createElement('span');
      status.className = `character-card-status ${unlocked ? 'unlocked' : 'locked'}`;
      if (!unlocked) {
        const lockIcon = document.createElement('img');
        lockIcon.src = 'assets/2d/icon-ui-lock-v2.png';
        lockIcon.alt = '';
        status.append(lockIcon);
      }
      status.append(unlocked ? 'Unlocked' : 'Locked');
      card.append(name, status);
      card.addEventListener('click', () => {
        this.selectedCharacterId = character.id;
        this.renderCharacterRoster(hostId, selectable);
      });
      grid.appendChild(card);
    }

    const statRows = characterStatRows(selected);
    const damageTradeoff = statRows.find((row) => row.id === 'damage');
    const recommendedWeapon = WEAPON_INFO[selected.recommendedWeapon];
    const recommendedWeaponIcon = WEAPON_ICON_IMAGES[selected.recommendedWeapon];
    detail.innerHTML = `
      <section class="character-identity" aria-label="Character identity">
        <div class="character-portrait-stage">${this.characterPortraitHtml(selected, true)}</div>
        <header class="character-detail-header">
          <span>Character Profile</span>
          <h2>${selected.name}</h2>
          <p>${selected.shortDescription}</p>
        </header>
      </section>
      <section class="character-rules" aria-label="Gameplay identity">
        <div class="character-column-heading">Gameplay Identity</div>
        <div class="character-module-grid">
        <section class="character-module signature" data-character-module="signature">
          ${rigTileHtml({ src: 'assets/2d/icon-item-repair.png', label: selected.signature.name, cls: 'character-module-tile' })}
          <div class="character-module-copy">
            <span class="character-module-kicker">Signature</span>
            <h3>${selected.signature.name}</h3>
            <p>${selected.signature.description}</p>
            <span class="character-rule-badge">${selected.signature.badge}</span>
          </div>
        </section>
        <section class="character-module tradeoff" data-character-module="tradeoff">
          ${rigTileHtml({ src: 'assets/2d/icon-stat-damage.png', label: 'Damage tradeoff', cls: 'character-module-tile' })}
          <div class="character-module-copy">
            <span class="character-module-kicker">Tradeoff</span>
            <h3>${damageTradeoff?.value ?? ''} Damage</h3>
            <p>${selected.tradeoff}</p>
          </div>
        </section>
        <section class="character-module suggested-start" data-character-module="recommended-weapon">
          ${rigTileHtml({ src: recommendedWeaponIcon, label: recommendedWeapon.title, cls: 'character-module-tile' })}
          <div class="character-module-copy">
            <span class="character-module-kicker">Suggested Start</span>
            <h3>${recommendedWeapon.title}</h3>
            <p>Shown as a suggested start when offered. It is not guaranteed and its draft odds do not change.</p>
          </div>
        </section>
        </div>
      </section>
      <section class="character-stat-sheet" aria-label="Character stats">
        <div class="character-column-heading">Stats</div>
        <div class="character-stat-grid">
        ${statRows.map((row) => `
          <div class="character-stat-row build-row ${row.changed ? 'changed' : 'baseline'}" data-character-stat="${row.id}" data-character-stat-changed="${row.changed}">
            <img class="build-icon build-icon-img" src="${row.icon}" alt="" />
            <span>${row.label}</span>
            <strong class="build-value">${row.value}</strong>
          </div>`).join('')}
        </div>
      </section>
      ${this.characterUnlockHtml(selected, selectedUnlocked)}
    `;
    requestAnimationFrame(() => this.syncCharacterSectionFocus(host));
    if (selectable) {
      const confirm = mustGet('character-confirm-button') as HTMLButtonElement;
      confirm.disabled = !selectedUnlocked;
    }
  }

  private characterPortraitHtml(character: CharacterDef, large = false): string {
    const cls = `character-portrait${large ? ' large' : ''}`;
    const initials = character.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
    return character.portrait
      ? `<img class="${cls}" src="${character.portrait}" alt="${large ? '' : `${character.name} portrait`}" />`
      : `<div class="${cls} fallback"${large ? ' aria-hidden="true"' : ` role="img" aria-label="${character.name} portrait"`}>${initials}</div>`;
  }

  private characterUnlockHtml(character: CharacterDef, unlocked: boolean): string {
    if (unlocked || character.unlock.kind === 'default') {
      return '';
    }
    const contractId = character.unlock.contractId;
    const contract = ACTIVE_CONTRACTS.find((item) => item.id === contractId);
    if (!contract) return `<footer class="character-unlock-footer locked">
      <div class="character-unlock-head"><img src="assets/2d/icon-ui-lock-v2.png" alt="" /><span>Locked</span></div>
      <span>Requirement unavailable</span>
    </footer>`;
    const progress = progressOf(contract.objective);
    return `<footer class="character-unlock-footer locked">
      <div class="character-unlock-head"><img src="assets/2d/icon-ui-lock-v2.png" alt="" /><span>Locked</span></div>
      <div class="character-unlock-requirement">
        <strong>${contract.title}</strong>
        <span>${progress.current} / ${progress.target}</span>
      </div>
      ${segmentedContractBarHtml(progress.current, progress.target, `${contract.title} progress`)}
    </footer>`;
  }

  /** Start-of-run weapon draft: 3 random distinct options out of the
   *  profile's UNLOCKED weapons (contract-locked ones never appear). */
  private showDraft(characterId: CharacterId): void {
    const all = (Object.keys(WEAPON_INFO) as WeaponId[]).filter((id) =>
      PROFILE.unlockedWeapons.includes(id),
    );
    const options: WeaponId[] = [];
    while (options.length < 3 && all.length > 0) {
      const index = Math.floor(Math.random() * all.length);
      options.push(...all.splice(index, 1));
    }

    this.draftCards.innerHTML = '';
    if (DEV_TOOLS.startingMapSelector) {
      (mustGet('start-map-select') as HTMLSelectElement).value = MAPS[0].id;
    }
    for (const option of labelWeaponOptions(characterId, options)) {
      const weaponId = option.id;
      const info = WEAPON_INFO[weaponId];
      const card = document.createElement('div');
      card.className = 'upgrade-card blue';
      const title = document.createElement('h3');
      title.textContent = info.title;
      const desc = document.createElement('p');
      desc.textContent = info.description;
      if (option.recommended) {
        const recommended = document.createElement('span');
        recommended.className = 'recommended-tag';
        recommended.textContent = 'Suggested Start';
        card.appendChild(recommended);
      }
      card.insertAdjacentHTML('beforeend', cardIconHtml(`weapon-${weaponId}`));
      card.append(title, desc);
      card.addEventListener('click', () => {
        this.startOverlay.classList.add('hidden');
        const selectedId = DEV_TOOLS.startingMapSelector
          ? (mustGet('start-map-select') as HTMLSelectElement).value
          : MAPS[0].id;
        const mapId = MAPS.some((map) => map.id === selectedId)
          ? selectedId as MapId
          : MAPS[0].id;
        this.onStart(characterId, weaponId, mapId);
      });
      this.draftCards.appendChild(card);
    }
    this.startOverlay.classList.remove('hidden');
  }

  updateBars(hp: number, maxHp: number, xp: number, xpToNext: number): void {
    this.hpFill.style.width = `${Math.max(0, (hp / maxHp) * 100)}%`;
    this.xpFill.style.width = `${Math.min(100, (xp / xpToNext) * 100)}%`;
    mustGet('hp-text').textContent = `${Math.max(0, Math.round(hp))}/${Math.round(maxHp)}`;
    // Below a quarter HP the whole bar pulses red — the "you are dying"
    // signal that screen shake alone never carried.
    mustGet('hp-bar').classList.toggle('low', hp / maxHp < 0.25);
  }

  /** Feedback on the build-panel row a just-picked card affected: gold flash
   *  for level-ups, a stronger pop-in when a socket JUST got filled. */
  flashBuildRow(cardId: string, installed = false): void {
    const row = mustGet('build-panel').querySelector<HTMLElement>(`[data-card="${cardId}"]`);
    if (!row) return;
    const cls = installed ? 'installed' : 'flash';
    row.classList.add(cls);
    window.setTimeout(() => row.classList.remove(cls), 700);
  }

  /** White cell-flash on the HP bar — one per real hit taken. */
  flashHp(): void {
    const bar = mustGet('hp-bar');
    bar.classList.remove('hit');
    void bar.offsetWidth; // restart the animation
    bar.classList.add('hit');
  }

  /** Big arcade event banner (boss awakens, scrapper arrives): PS2P center
   *  text framed by hazard stripes, ~1.8s in-hold-out. Replaces toasts for
   *  headline moments; toasts stay for minor pickups. */
  /** Arms the pointer/touch skip surface for the defeat beat and clears any
   *  press left over from the run (a mouse button held when you died must not
   *  count — same release rule the keyboard and pad follow). */
  armDefeatSkipSurface(): void {
    this.defeatPointerSkip = false;
    this.defeatPointerHeld = false;
    mustGet('defeat-skip-surface').classList.remove('hidden');
  }

  disarmDefeatSkipSurface(): void {
    this.defeatPointerSkip = false;
    this.defeatPointerHeld = false;
    mustGet('defeat-skip-surface').classList.add('hidden');
  }

  /** True once per intentional press on the transition surface. */
  consumeDefeatPointerSkip(): boolean {
    const hit = this.defeatPointerSkip;
    this.defeatPointerSkip = false;
    return hit;
  }

  /** Feeds the controller's release gate from the pointer device. */
  isDefeatPointerHeld(): boolean {
    return this.defeatPointerHeld;
  }

  private defeatPointerSkip = false;
  private defeatPointerHeld = false;

  /** Title beat of the defeat sequence: SYSTEM OVERLOAD over the frozen battle,
   *  on its own transparent layer so the fatal context stays readable until the
   *  results overlay takes the screen. */
  showDefeatBeat(): void {
    const el = mustGet('defeat-beat');
    el.classList.remove('hidden', 'play');
    void el.offsetWidth; // restart the entry animation on a repeated run
    el.classList.add('play');
  }

  hideDefeatBeat(): void {
    const el = mustGet('defeat-beat');
    el.classList.add('hidden');
    el.classList.remove('play');
  }

  /** Enables/disables BOTH end actions at once. Disabled is the real gate:
   *  clicks do nothing and menuNavItems already skips disabled buttons, so a
   *  gamepad cannot reach them either. */
  setEndActionsEnabled(enabled: boolean): void {
    for (const button of this.endActions.querySelectorAll('button')) {
      button.disabled = !enabled;
    }
  }

  /** Keyboard/gamepad entry point for the results screen. */
  focusPrimaryEndAction(): void {
    const primary = this.endActions.querySelector<HTMLButtonElement>('button:not([disabled])');
    primary?.focus({ preventScroll: true });
  }

  /** Full teardown of the end screen, used by both actions and by run reset so
   *  a stale overlay can never survive into the next run. */
  hideEnd(): void {
    this.endOverlay.classList.add('hidden');
    this.hideDefeatBeat();
  }

  /** Re-arms the one-shot action guard. Called when a new run is built, so the
   *  next defeat can accept an action again. */
  resetEndActions(): void {
    this.endActionAccepted = false;
    this.setEndActionsEnabled(true);
  }

  /** Terminal-action guard: a double click or a repeated gamepad edge cannot
   *  run New Run and Main Menu, or the same one twice. */
  private endActionAccepted = false;

  banner(message: string): void {
    const el = mustGet('event-banner');
    mustGet('event-banner-text').textContent = message;
    el.classList.remove('hidden', 'play');
    void el.offsetWidth;
    el.classList.add('play');
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => el.classList.add('hidden'), 1900);
  }
  private bannerTimer = 0;

  updateTimer(remainingS: number): void {
    const m = Math.floor(Math.max(0, remainingS) / 60);
    const s = Math.floor(Math.max(0, remainingS) % 60);
    this.timer.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  }

  updateMission(mapIndex: number, bossDefeated: boolean, finaleStarted: boolean): void {
    const survive = mustGet('mission-survive');
    const boss = mustGet('mission-boss');
    const setComplete = (step: HTMLElement, complete: boolean): void => {
      step.classList.toggle('complete', complete);
      const check = step.querySelector<HTMLElement>('.mission-check');
      if (check) check.textContent = complete ? '[X]' : '[ ]';
    };
    setComplete(survive, finaleStarted);
    setComplete(boss, bossDefeated);
    const copy = boss.querySelector<HTMLElement>('.mission-copy');
    if (copy) {
      copy.textContent = mapIndex === 0
        ? 'Defeat the boss to unlock the next sector'
        : 'Defeat the final boss to complete the run';
    }
  }

  private lastLevel = 0;

  updateLevel(level: number, kills: number): void {
    this.levelBadge.textContent = `LV ${level}`;
    // Blaze the XP strip on every level gained (run restarts reset silently).
    if (level < this.lastLevel) this.lastLevel = level;
    if (level > this.lastLevel && this.lastLevel > 0) {
      const bar = mustGet('xp-bar');
      bar.classList.remove('level-flash');
      void bar.offsetWidth;
      bar.classList.add('level-flash');
    }
    this.lastLevel = level;
    mustGet('kills-amount').textContent = `${kills}`;
  }

  /** Live FPS readout (dev instrument, gated by config.VISUAL.showFps). */
  updateFps(fps: number): void {
    this.fpsCounter.classList.remove('hidden');
    this.fpsCounter.textContent = `${fps} FPS`;
  }

  /** Build UI, split in two: the always-on left panel shows owned weapons
   *  with levels (the build caps at 2, so it stays tiny in-run), and the
   *  FULL 21-stat sheet renders into #stat-sheet inside the level-up
   *  overlay, where the player actually compares values against the offered
   *  cards. Raised stats highlight in gold. */
  updateBuild(
    stats: PlayerStats,
    maxHp: number,
    weapons: WeaponLevels,
    items: ModCounts = {},
    cores: CoreLevels = {},
    weaponBranches?: WeaponBranchLevels,
  ): void {
    const panel = mustGet('build-panel');
    panel.innerHTML = '';
    const base = defaultStats();

    // Encapsulated inventory (2026-07-11 user rework, Megabonk-style): a framed
    // panel shown ONLY in the overlays (level-up / chest / shop). Each section
    // is a row of icon-only TILES with the level/count stuck to the icon's
    // bottom-right — no names. Locked slots show just the padlock centered at
    // icon size; empty slots show a dim diamond.
    const emptyTile = '<div class="rig-tile empty"><span class="rig-empty">◇</span></div>';
    const lockedTile = rigTileHtml({ src: 'assets/2d/icon-ui-lock-v2.png', cls: 'locked' });

    panel.insertAdjacentHTML('beforeend', '<div class="panel-header">RIG</div>');

    panel.insertAdjacentHTML('beforeend', '<div class="panel-title">Weapons</div>');
    let weaponTiles = '';
    let ownedWeapons = 0;
    for (const weaponId of Object.keys(weapons) as WeaponId[]) {
      const level = weapons[weaponId];
      if (level <= 0) continue;
      ownedWeapons++;
      weaponTiles += rigTileHtml({
        src: WEAPON_ICON_IMAGES[weaponId],
        emoji: WEAPON_ICONS[weaponId],
        badge: `Lv${level}`,
        cls: 'weapon',
        card: `weapon-${weaponId}`,
        label: `${WEAPON_INFO[weaponId].title}, level ${level}${describeWeaponBranches(weaponId, weaponBranches) ? `; ${describeWeaponBranches(weaponId, weaponBranches)}` : ''}`,
      });
    }
    for (let i = ownedWeapons; i < PROFILE.weaponSockets; i++) weaponTiles += emptyTile;
    for (let i = PROFILE.weaponSockets; i < PROFILE.maxWeaponSockets; i++) weaponTiles += lockedTile;
    panel.insertAdjacentHTML('beforeend', `<div class="rig-section">${weaponTiles}</div>`);

    panel.insertAdjacentHTML('beforeend', '<div class="panel-title">Cores</div>');
    let coreTiles = '';
    const installedCores = Object.keys(cores).filter((id) => (cores[id] ?? 0) > 0);
    for (const id of installedCores) {
      coreTiles += rigTileHtml({
        src: rigCoreIconSrc(id),
        badge: `Lv${cores[id]}`,
        cls: 'core',
        card: id,
        label: `${CORE_TITLES[id] ?? id}, level ${cores[id]}`,
      });
    }
    for (let i = installedCores.length; i < PROFILE.coreSockets; i++) coreTiles += emptyTile;
    for (let i = PROFILE.coreSockets; i < PROFILE.maxCoreSockets; i++) coreTiles += lockedTile;
    panel.insertAdjacentHTML('beforeend', `<div class="rig-section">${coreTiles}</div>`);

    // The Mods section (class `mods`) is hidden in-run and revealed only in the
    // overlays — in-run the panel stays weapons + cores so the map shows behind.
    panel.insertAdjacentHTML('beforeend', '<div class="panel-title mods">Mods</div>');
    const collected = UNLOCKED_MOD_IDS.filter((id) => (items[id] ?? 0) > 0);
    if (collected.length === 0) {
      panel.insertAdjacentHTML('beforeend', '<div class="build-empty mods">None yet</div>');
    } else {
      let modTiles = '';
      for (const id of collected) {
        const info = MOD_REGISTRY[id];
        // Tile tinted by the mod's tier (2026-07-11 user request) — instant
        // tier read in the inventory.
        modTiles += rigTileHtml({
          src: info.image,
          emoji: info.icon,
          badge: `x${items[id]}`,
          cls: `mod ${info.tier}`,
          card: id,
          label: `${info.label}, ${describeMod(id, items[id] ?? 0)}`,
        });
      }
      panel.insertAdjacentHTML('beforeend', `<div class="rig-section mods">${modTiles}</div>`);
    }

    // Full stat sheet lives inside the level-up overlay (right side), not in
    // the always-on panel: 21 stat rows overflowed the screen in-run
    // (2026-07-08 user report), and the moment the sheet actually matters is
    // while comparing upgrade cards.
    const sheet = mustGet('stat-sheet');
    sheet.innerHTML = '<div class="panel-header">STATS</div>';
    const maxHpRaised = Math.abs(maxHp - PLAYER.maxHp) >= 0.001;
    const maxHpRow = document.createElement('div');
    maxHpRow.className = 'build-row';
    maxHpRow.innerHTML = `<img class="build-icon build-icon-img" src="${CARD_ICON_IMAGES['max-hp']}" alt="" /><span>Max HP</span><span class="build-value${maxHpRaised ? ' raised' : ''}">${asPoints(maxHp)}</span>`;
    sheet.appendChild(maxHpRow);
    for (const def of STAT_ROWS) {
      const value = stats[def.key];
      const raised = Math.abs(value - base[def.key]) >= 0.001;
      const row = document.createElement('div');
      row.className = 'build-row';
      row.innerHTML = `${statIconHtml(def.key, def.icon)}<span>${def.label}</span><span class="build-value${raised ? ' raised' : ''}">${def.format(value)}</span>`;
      sheet.appendChild(row);
    }
  }

  /** Edge-of-screen arrow pointing toward the off-screen totem. */
  updateTotemIndicator(visible: boolean, x: number, y: number, angleRad: number): void {
    const el = mustGet('totem-indicator');
    if (!visible) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%, -50%)`;
    const arrow = el.querySelector('.arrow') as HTMLElement | null;
    if (arrow) arrow.style.transform = `rotate(${angleRad}rad)`;
  }

  /** Off-screen arrow toward the visiting merchant, with his countdown. */
  updateMerchantIndicator(
    visible: boolean,
    x: number,
    y: number,
    angleRad: number,
    secondsLeft: number,
  ): void {
    const el = mustGet('merchant-indicator');
    if (!visible) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%, -50%)`;
    const arrow = el.querySelector('.arrow') as HTMLElement | null;
    if (arrow) arrow.style.transform = `rotate(${angleRad}rad)`;
    const label = el.querySelector('.label') as HTMLElement | null;
    if (label) label.textContent = `SHOP ${Math.ceil(secondsLeft)}s`;
  }

  /** In-run currency counter (icon-only until the currency gets its name).
   *  The displayed number TICKS toward the real value with a little bump —
   *  the classic coin-counter juice (2026-07-10). */
  private goldShown = 0;
  private goldTarget = 0;
  private goldTicker = 0;

  /** Timed buffs, with the REMAINING time visible.
   *
   *  Frenzy and Haste used to be invisible timers — no HUD, no VFX, nothing.
   *  Haste in particular actively hurt play: the player could not tell it was
   *  on, and more importantly could not tell when it would drop, so movement
   *  got misjudged at the exact moment the speed changed under them
   *  (2026-08-01 report).
   *
   *  The bar is the point. Knowing a buff is active is nice; knowing it is
   *  about to END is what the player actually needs to plan around. */
  updateBuffs(buffs: readonly { id: TimedBuffId; remainingS: number; totalS: number }[]): void {
    const row = mustGet('buff-row');
    if (buffs.length === 0) {
      if (row.childElementCount > 0) row.replaceChildren();
      return;
    }
    for (const buff of buffs) {
      let chip = row.querySelector<HTMLElement>(`[data-buff="${buff.id}"]`);
      if (!chip) {
        chip = document.createElement('div');
        chip.className = 'buff-chip';
        chip.dataset['buff'] = buff.id;
        const info = BUFF_INFO[buff.id];
        chip.innerHTML =
          `<img class="ui-glyph" src="${info.icon}" alt="" />` +
          `<div class="buff-body">` +
          `<span class="buff-name">${info.label}</span>` +
          `<div class="buff-track"><div class="buff-fill"></div></div>` +
          `</div>`;
        row.appendChild(chip);
      }
      const fill = chip.querySelector<HTMLElement>('.buff-fill');
      if (fill) fill.style.width = `${Math.max(0, (buff.remainingS / buff.totalS) * 100)}%`;
      // Last second flashes: the drop-off is the moment that catches people out.
      chip.classList.toggle('expiring', buff.remainingS <= 1);
    }
    // Drop chips whose buff ended.
    for (const chip of [...row.children]) {
      const id = (chip as HTMLElement).dataset['buff'];
      if (!buffs.some((buff) => buff.id === id)) chip.remove();
    }
  }

  updateGold(gold: number): void {
    const el = mustGet('gold-counter');
    el.classList.remove('hidden');
    if (gold > this.goldTarget) {
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    }
    this.goldTarget = gold;
    if (gold === 0) {
      // Run start / full spend: snap, never tick down from a stale value.
      this.goldShown = 0;
      window.clearInterval(this.goldTicker);
      this.goldTicker = 0;
      mustGet('gold-amount').textContent = '0';
      return;
    }
    if (this.goldTicker !== 0) return; // ticker already running toward target
    this.goldTicker = window.setInterval(() => {
      const diff = this.goldTarget - this.goldShown;
      if (diff === 0) {
        window.clearInterval(this.goldTicker);
        this.goldTicker = 0;
        return;
      }
      const step = Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) / 6));
      this.goldShown += step;
      mustGet('gold-amount').textContent = `${this.goldShown}`;
    }, 40);
  }

  hideGold(): void {
    mustGet('gold-counter').classList.add('hidden');
    window.clearInterval(this.goldTicker);
    this.goldTicker = 0;
    this.goldShown = 0;
    this.goldTarget = 0;
  }

  /** The scrapper's shop: stock cards with prices, buy on click. Re-called
   *  after every purchase so prices/afford states stay current. */
  showShop(
    entries: { id: ModId; price: number }[],
    gold: number,
    onBuy: (index: number) => void,
    onLeave: () => void,
    whistle: { copies: number; discount: number; modCounts?: Readonly<ModCounts> } = { copies: 0, discount: 0 },
  ): void {
    const overlay = mustGet('shop-overlay');
    const cards = mustGet('shop-cards');
    mustGet('shop-gold').innerHTML = coinHtml(gold);
    // Foreman's Whistle perk badge — makes the +1 stock / discount visible.
    const perks = mustGet('shop-perks');
    if (whistle.copies > 0) {
      const disc = whistle.discount > 0 ? ` · −${Math.round(whistle.discount * 100)}%` : '';
      perks.textContent = `Foreman's Whistle: +1 stock${disc}`;
      perks.classList.remove('hidden');
    } else {
      perks.textContent = '';
      perks.classList.add('hidden');
    }
    overlay.classList.remove('hidden');
    cards.innerHTML = '';
    if (entries.length === 0) {
      cards.insertAdjacentHTML('beforeend', '<p class="shop-soldout">Sold out. Come back next visit!</p>');
    }
    // Vertical cards in a row (2026-07-11 user request: same look as the
    // level-up draft) — reuse the upgrade-card shell (tier border/glow) with a
    // tinted icon chip + price; they wrap inside the framed panel at any count.
    entries.forEach((entry, index) => {
      const info = MOD_REGISTRY[entry.id];
      const affordable = gold >= entry.price;
      const el = document.createElement('div');
      el.className = `upgrade-card ${info.tier} shop-vcard${affordable ? '' : ' unaffordable'}`;
      el.dataset.uiCue = 'none';
      const icon = info.image
        ? `<img class="shop-card-img" src="${info.image}" alt="" />`
        : `<span class="shop-card-emoji">${info.icon}</span>`;
      el.innerHTML =
        `<span class="rarity-tag">${RARITY_LABEL[info.tier] ?? info.tier}</span>` +
        `<div class="shop-card-icon ${info.tier}">${icon}</div>` +
        `<h3>${info.label}</h3>` +
        `<p>${describeMod(entry.id, (whistle.modCounts?.[entry.id] ?? 0) + 1)}</p>` +
        `<div class="shop-price">${coinHtml(entry.price)}</div>`;
      if (affordable) {
        el.addEventListener('click', () => {
          // Gold pop on the bought card, then re-render (which removes it).
          el.classList.add('buying');
          window.setTimeout(() => onBuy(index), 180);
        });
      }
      cards.appendChild(el);
    });
    const leave = mustGet('shop-leave-button');
    leave.onclick = () => {
      overlay.classList.add('hidden');
      onLeave();
    };
  }

  hideShop(): void {
    mustGet('shop-overlay').classList.add('hidden');
  }

  /** Floating prompt pinned above the chest/merchant (screen coords from the
   *  game's projection). `affordable` dims it when the player can't pay. */
  showInteractPrompt(
    html: string | null,
    keyLabel: string,
    affordable = true,
    x?: number,
    y?: number,
  ): void {
    const prompt = mustGet('interact-prompt');
    if (html === null) {
      prompt.classList.add('hidden');
      return;
    }
    prompt.innerHTML = `Press <span class="key">${keyLabel}</span> ${html}`;
    prompt.classList.toggle('cant-afford', !affordable);
    if (x !== undefined && y !== undefined) {
      prompt.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%, -100%)`;
    }
    prompt.classList.remove('hidden');
  }

  /** Reconciles fixed chest-marker slots without recreating DOM each frame. */
  updateChestMarkers(markers: readonly ChestMarkerView[]): void {
    for (const slot of this.chestMarkers) slot.root.classList.add('hidden');
    for (const marker of markers) {
      const slot = this.chestMarkers[marker.index];
      if (!slot) continue;
      const state = marker.affordable ? 'affordable' : 'unaffordable';
      slot.root.className = `chest-marker ${state}`;
      slot.root.dataset['price'] = `${marker.price}`;
      slot.root.dataset['state'] = state;
      slot.root.style.transform =
        `translate(${marker.x.toFixed(0)}px, ${marker.y.toFixed(0)}px) translate(-50%, -100%)`;
      slot.priceAmount.textContent = `${marker.price}`;
    }
  }

  clearChestMarkers(): void {
    for (const slot of this.chestMarkers) slot.root.classList.add('hidden');
  }

  /** Prompt shown while standing in the totem's summon zone. */
  showSummonPrompt(visible: boolean, keyLabel: string): void {
    const prompt = mustGet('summon-prompt');
    if (!visible) {
      prompt.classList.add('hidden');
      return;
    }
    prompt.innerHTML = `Press <span class="key">${keyLabel}</span> to summon the boss`;
    prompt.classList.remove('hidden');
  }

  updateBoss(status: { name: string; hp: number; maxHp: number } | null): void {
    if (!status) {
      this.bossBar.classList.add('hidden');
      return;
    }
    this.bossBar.classList.remove('hidden');
    this.bossName.textContent = status.name;
    this.bossFill.style.width = `${Math.max(0, (status.hp / status.maxHp) * 100)}%`;
    mustGet('boss-hp-text').textContent =
      `${Math.max(0, Math.round(status.hp))}/${Math.round(status.maxHp)}`;
    // Mini portrait straight from the boss's flat reference sheet.
    const portrait = mustGet('boss-portrait') as HTMLImageElement;
    const src = BOSS_PORTRAITS[status.name.toLowerCase()];
    portrait.style.display = src ? 'block' : 'none';
    if (src && !portrait.src.endsWith(src)) portrait.src = src;
  }

  showLevelUp(choices: UpgradeCard[], discardsLeft: number, onDiscard: () => void): void {
    // Discard option (2026-07-10): skip the draft, capped per run — the
    // button only exists while charges remain.
    const discardBtn = mustGet('levelup-discard');
    if (discardsLeft > 0) {
      discardBtn.textContent = `Discard (${discardsLeft} left)`;
      discardBtn.classList.remove('hidden');
      (discardBtn as HTMLButtonElement).onclick = () => {
        (discardBtn as HTMLButtonElement).onclick = null;
        this.levelUpOverlay.classList.add('hidden');
        onDiscard();
      };
    } else {
      discardBtn.classList.add('hidden');
      (discardBtn as HTMLButtonElement).onclick = null;
    }
    this.upgradeCards.innerHTML = '';
    for (const card of choices) {
      const el = document.createElement('div');
      el.className = `upgrade-card ${card.rarity}`;
      const rarity = document.createElement('span');
      rarity.className = 'rarity-tag';
      rarity.textContent = RARITY_LABEL[card.rarity] ?? card.rarity;
      const title = document.createElement('h3');
      title.textContent = card.title;
      const desc = document.createElement('p');
      desc.textContent = card.description;
      el.append(rarity);
      // Core cards show their icon INSIDE the tier-tinted orb shell (2026-07-10);
      // weapon cards (and un-warmed frames) keep the bare icon.
      const orbKey = coreOrbKey(card.id);
      const orb = orbKey ? coreOrbIcon(orbKey, card.rarity) : null;
      el.insertAdjacentHTML(
        'beforeend',
        orb ? `<img class="card-icon" src="${orb}" alt="" />` : cardIconHtml(card.id),
      );
      el.append(title, desc);
      el.addEventListener('click', () => {
        this.levelUpOverlay.classList.add('hidden');
        this.onUpgradeChosen(card);
      });
      this.upgradeCards.appendChild(el);
    }
    this.levelUpOverlay.classList.remove('hidden');
  }

  showLevelUpIntro(x: number, y: number): void {
    this.moveLevelUpIntro(x, y);
    this.levelUpFlash.classList.remove('hidden', 'play');
    void this.levelUpFlash.offsetWidth;
    this.levelUpFlash.classList.add('play');
  }

  moveLevelUpIntro(x: number, y: number): void {
    this.levelUpFlash.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
  }

  hideLevelUpIntro(): void {
    this.levelUpFlash.classList.add('hidden');
    this.levelUpFlash.classList.remove('play');
  }

  /** Slot-machine crate opening: the reel cycles through every possible
   *  reward, decelerates, and lands on the one actually rolled. `onLanded`
   *  fires at landing (apply the mod there so the revealed panels already
   *  count it); the run stays frozen until the player clicks Continue, which
   *  fires `onDone` — reading time is theirs (2026-07-10 user request). */
  showChestSpin(
    finalMod: ModId,
    tier: Rarity,
    onLanded: () => void,
    nextCopies: number,
    onDone: () => void,
  ): void {
    const overlay = mustGet('chest-overlay');
    const card = mustGet('chest-card');
    const slot = mustGet('chest-slot');
    const icon = mustGet('chest-icon');
    const label = mustGet('chest-label');
    const desc = mustGet('chest-desc');
    const continueBtn = mustGet('chest-continue');
    desc.textContent = '';
    overlay.classList.remove('hidden', 'landed');
    // The card wears the chest's tier from the first frame (the beam already
    // announced it) and rattles while the reel spins.
    card.className = `upgrade-card ${tier} spinning`;
    mustGet('chest-rarity').textContent = RARITY_LABEL[tier] ?? tier;
    slot.classList.remove('landed');
    continueBtn.classList.add('hidden');
    label.textContent = ' ';

    const iconHtml = (entry?: { icon: string; image?: string }): string =>
      entry?.image
        ? `<img class="chest-icon-img" src="${entry.image}" alt="" />`
        : `<span class="chest-cell-emoji">${entry?.icon ?? '❔'}</span>`;

    // Vertical slot-machine reel (2026-07-10 user direction — OUR identity
    // piece, distinct from Megabonk's straight reveal): a strip of icons
    // scrolls DOWN through the window and decelerates until the prize cell
    // lands centered.
    const reel = mustGet('chest-reel');
    icon.innerHTML = '';
    const cellCount = 18;
    // Spin through ALL mods OF THE CHEST'S TIER — unlocked AND contract-locked
    // — so locked content is teased (a padlock badge marks it). A populated
    // tier with fewer than three items uses neutral tier anticipation cells,
    // never objects from a lower rarity. The reel only lands on finalMod.
    const tierPool = modsOfTier(tier);
    const spinPool = tierPool.length > 0 ? [...tierPool] : [...UNLOCKED_MOD_IDS];
    const cellHtml = (cell: ChestReelCell): string => {
      if (cell.kind === 'anticipation') {
        return `<div class="chest-cell chest-cell-anticipation" data-anticipation-tier="${cell.tier}" style="--anticipation-phase:${cell.variant}" aria-hidden="true"><span class="chest-anticipation-mark"><i></i><i></i><i></i><i></i></span></div>`;
      }
      const entry = MOD_REGISTRY[cell.id];
      const locked = !UNLOCKED_MOD_IDS.includes(cell.id);
      const lock = locked
        ? '<img class="chest-cell-lock" src="assets/2d/icon-ui-lock-v2.png" alt="" />'
        : '';
      return `<div class="chest-cell${locked ? ' locked' : ''}" data-mod-id="${cell.id}">${iconHtml(entry)}${lock}</div>`;
    };
    const startIdx = Math.floor(Math.random() * spinPool.length);
    const strip = buildChestReelStrip(finalMod, tier, startIdx, cellCount);

    const final = MOD_REGISTRY[finalMod];
    reel.innerHTML = strip.map(cellHtml).join('');
    const prizeCell = reel.lastElementChild;
    const landedReward = prizeCell?.querySelector<HTMLElement>('.chest-icon-img, .chest-cell-emoji');
    if (!landedReward) throw new Error(`Chest prize cell has no reward visual: ${finalMod}`);

    const land = (): void => {
      // Promote the exact landed node: hiding then recreating the same reward
      // reads as a temporal duplicate even when spatial adjacency is correct.
      icon.replaceChildren(landedReward);
      label.textContent = final.label;
      // What the reward actually does (2026-07-08 user request).
      desc.textContent = describeMod(finalMod, nextCopies);
      // Reveal: screen flash (overlay) + icon rise + god-rays + spark rain
      // (card.landed); the reel strip hides via the same class.
      card.classList.remove('spinning');
      card.classList.add('landed');
      overlay.classList.add('landed');
      slot.classList.add('landed');
      onLanded();
      continueBtn.classList.remove('hidden');
      continueBtn.onclick = () => {
        continueBtn.onclick = null;
        overlay.classList.add('hidden');
        overlay.classList.remove('landed');
        card.classList.remove('landed');
        onDone();
      };
    };

    // One decelerating transition from the top cell down to the prize cell.
    // transitionend fires the reveal; the timeout is a backup for hidden
    // tabs, where transitions can be skipped entirely.
    const cellH = slot.clientHeight;
    reel.style.setProperty('--cell-h', `${cellH}px`);
    reel.style.transition = 'none';
    reel.style.transform = 'translateY(0)';
    void reel.offsetHeight;
    let landedOnce = false;
    const fireLand = (): void => {
      if (landedOnce) return;
      landedOnce = true;
      land();
    };
    reel.addEventListener('transitionend', fireLand, { once: true });
    window.setTimeout(fireLand, 3400);
    reel.style.transition = 'transform 2.6s cubic-bezier(0.12, 0.82, 0.2, 1)';
    reel.style.transform = `translateY(-${cellCount * cellH}px)`;
  }

  /** Transient pickup/reward notification above the HP bar. */
  toast(message: string): void {
    const hud = mustGet('hud');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    hud.appendChild(el);
    window.setTimeout(() => el.remove(), 2400);
  }

  showEnd(
    outcome: RunOutcome,
    map: RunMapRef,
    level: number,
    kills: number,
    survivedS: number,
    bosses: number,
    weaponLevels: WeaponLevels,
    weaponBranches: WeaponBranchLevels | undefined,
    weaponDamage: Readonly<Record<WeaponId, number>>,
    coreLevels: CoreLevels,
    modCounts: ModCounts,
    earnedContracts: EarnedContract[] = [],
    /** Defeat stages its reveal, so the actions arrive disabled and the defeat
     *  controller enables them once its release gate is armed. */
    actionsEnabled = true,
  ): void {
    this.resetFeedback();
    this.endTitle.textContent = RUN_OUTCOME_TITLES[outcome];
    const defeated = outcome === 'defeat';
    this.endSubtitle.textContent = defeated ? 'Chassis integrity lost' : '';
    this.endSubtitle.classList.toggle('hidden', !defeated);
    this.setEndActionsEnabled(actionsEnabled);
    this.renderEarnedContracts(earnedContracts);
    const m = Math.floor(survivedS / 60);
    const s = Math.floor(survivedS % 60);
    const separator = '<span class="end-stat-separator" aria-hidden="true">·</span>';
    const bossPart =
      bosses > 0
        ? `${separator}<span>${bosses} boss${bosses > 1 ? 'es' : ''} slain</span>`
        : '';
    this.endStats.innerHTML = [
      `<span>${map.title} · Map ${map.number}</span>`,
      separator,
      `<span>Level ${level}</span>`,
      separator,
      `<span class="end-kills"><img class="ui-glyph" src="${SKULL_ICON}" alt="" /><span>${kills} kills</span></span>`,
      separator,
      // Defeat states the run clock as an instrument reading, not as a boast:
      // "survived" is the wrong register for the screen that says the chassis
      // is gone. Other outcomes keep their existing wording.
      defeated
        ? `<span>Operational Time ${m}:${s.toString().padStart(2, '0')}</span>`
        : `<span>${m}:${s.toString().padStart(2, '0')} survived</span>`,
      bossPart,
    ].join('');
    const ownedWeapons = (Object.keys(weaponLevels) as WeaponId[])
      .filter((id) => weaponLevels[id] > 0)
      .sort((a, b) => weaponDamage[b] - weaponDamage[a]);
    const installedCores = Object.keys(coreLevels).filter((id) => (coreLevels[id] ?? 0) > 0);
    const collectedMods = MOD_IDS.filter((id) => (modCounts[id] ?? 0) > 0);

    const section = (title: string, tiles: string, emptyLabel: string): string => `
      <div class="end-build-section">
        <div class="panel-title">${title}</div>
        ${tiles
          ? `<div class="rig-section">${tiles}</div>`
          : `<div class="build-empty">${emptyLabel}</div>`}
      </div>`;
    const weaponTiles = ownedWeapons
      .map((id) =>
        rigTileHtml({
          src: WEAPON_ICON_IMAGES[id],
          emoji: WEAPON_ICONS[id],
          badge: `Lv${weaponLevels[id]}`,
          cls: 'weapon',
          label: `${WEAPON_INFO[id].title}, level ${weaponLevels[id]}${describeWeaponBranches(id, weaponBranches) ? `; ${describeWeaponBranches(id, weaponBranches)}` : ''}`,
        }),
      )
      .join('');
    const coreTiles = installedCores
      .map((id) =>
        rigTileHtml({
          src: rigCoreIconSrc(id),
          badge: `Lv${coreLevels[id]}`,
          cls: 'core',
          label: `${CORE_TITLES[id] ?? id}, level ${coreLevels[id]}`,
        }),
      )
      .join('');
    const modTiles = collectedMods
      .map((id) => {
        const info = MOD_REGISTRY[id];
        return rigTileHtml({
          src: info.image,
          emoji: info.icon,
          badge: `x${modCounts[id]}`,
          cls: `mod ${info.tier}`,
          label: `${info.label}, ${describeMod(id, modCounts[id] ?? 0)}`,
        });
      })
      .join('');
    this.endRunBuild.innerHTML =
      section('Weapons', weaponTiles, 'None') +
      section('Cores', coreTiles, 'None') +
      section('Mods', modTiles, 'None');

    const totalDamage = ownedWeapons.reduce((sum, id) => sum + weaponDamage[id], 0);
    this.endDamageList.replaceChildren(
      ...ownedWeapons.map((id) => {
        const damage = weaponDamage[id];
        const share = totalDamage > 0 ? (damage / totalDamage) * 100 : 0;
        const row = document.createElement('div');
        row.className = 'end-damage-row';
        const icon = rigTileHtml({
          src: WEAPON_ICON_IMAGES[id],
          emoji: WEAPON_ICONS[id],
          badge: `Lv${weaponLevels[id]}`,
          cls: 'weapon',
          label: `${WEAPON_INFO[id].title}, level ${weaponLevels[id]}${describeWeaponBranches(id, weaponBranches) ? `; ${describeWeaponBranches(id, weaponBranches)}` : ''}`,
        });
        row.innerHTML = `
          ${icon}
          <div class="end-damage-info">
            <div class="end-damage-heading">
              <span>${WEAPON_INFO[id].title}</span>
              <strong>${Math.round(damage).toLocaleString('en-US')}</strong>
            </div>
            <div class="end-damage-track"><i style="width:${share.toFixed(1)}%"></i></div>
          </div>
          <span class="end-damage-share">${share.toFixed(1)}%</span>
        `;
        return row;
      }),
    );
    this.endOverlay.classList.remove('hidden');
  }

  private resetFeedback(): void {
    this.feedbackFun = null;
    this.feedbackDifficulty = null;
    this.feedbackReasons.clear();
    for (const button of mustGet('end-feedback').querySelectorAll<HTMLButtonElement>('button')) {
      button.disabled = false;
      button.classList.remove('selected');
      button.setAttribute('aria-pressed', 'false');
    }
    (mustGet('feedback-submit') as HTMLButtonElement).disabled = true;
    mustGet('feedback-status').textContent = '';
  }

  private updateFeedbackSubmitState(): void {
    (mustGet('feedback-submit') as HTMLButtonElement).disabled =
      this.feedbackFun === null || this.feedbackDifficulty === null;
  }
}

function selectSingleFeedbackButton(containerId: string, selected: HTMLButtonElement): void {
  for (const button of mustGet(containerId).querySelectorAll<HTMLButtonElement>('button')) {
    const active = button === selected;
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', `${active}`);
  }
}

/** The reward's own art, so the screen shows WHAT you get, not just its name.
 *  Weapons, cores and mods each already have an icon pipeline; sockets have no
 *  art at all, so they get a diagram instead (see socketPipsHtml). */
function rewardIconHtml(reward: Reward | null, done: boolean): string {
  if (!reward) return '';
  switch (reward.kind) {
    case 'character': {
      const character = CHARACTER_REGISTRY[reward.id];
      return character?.portrait
        ? `<img class="card-icon" src="${character.portrait}" alt="" />`
        : `<span class="reward-icon-text">${character?.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() ?? '??'}</span>`;
    }
    case 'weapon': return cardIconHtml(`weapon-${reward.id}`);
    case 'core': return cardIconHtml(reward.id);
    case 'mod': {
      const image = MOD_REGISTRY[reward.id]?.image;
      return image ? `<img class="card-icon" src="${image}" alt="" />` : '';
    }
    case 'socket': return socketPipsHtml(reward.slot, reward.index, done);
    case 'discards': return '<img class="card-icon" src="assets/2d/icon-ui-discard.png" alt="" />';
    default: return '';
  }
}

/** A socket reward is a capacity change, which no single icon conveys. Drawing
 *  the whole row — filled, the one this opens, and the ones still locked —
 *  answers "what does this actually give me" at a glance. */
function socketPipsHtml(slot: 'weapon' | 'core', target: number | undefined, done: boolean): string {
  const open = slot === 'weapon' ? PROFILE.weaponSockets : PROFILE.coreSockets;
  const max = slot === 'weapon' ? PROFILE.maxWeaponSockets : PROFILE.maxCoreSockets;
  const pips = Array.from({ length: max }, (_, i) => {
    if (i < open) return '<i class="filled"></i>';
    // Only a PENDING contract highlights the slot it would open. Marking one
    // on an already-paid contract would advertise the next socket as if this
    // one still granted it.
    if (i + 1 === target && !done) return '<i class="next"></i>';
    return '<i></i>';
  }).join('');
  return `<div class="socket-pips">${pips}</div>`;
}

/** Names the reward, and for a socket says what the extra slot lets you DO —
 *  "New core socket" describes the mechanism, not the benefit. */
function rewardLabelHtml(original: Reward, resolved: Reward | null, done: boolean): string {
  // A settled contract states plainly what the player now OWNS. The category is
  // already the column header, so the bare name reads best. Naming it matters
  // more than the icon: an icon is recognisable only once you know the item.
  if (done) {
    // A queue reward surviving to here belongs to a contract settled before its
    // payout was recorded and the backfill could not attribute it.
    if (!resolved || resolved.kind.startsWith('next-')) return 'Unlocked';
    return `Unlocked: ${rewardName(resolved)}`;
  }

  if (original.kind === 'socket') {
    // Pending sockets state the BENEFIT, not the mechanism: "carry another
    // weapon" is what the extra slot actually buys you.
    const target = resolved?.kind === 'socket' ? resolved.index : original.index;
    return original.slot === 'weapon'
      ? `Weapon slot ${target ?? '?'} &mdash; carry another weapon`
      : `Core slot ${target ?? '?'} &mdash; install another core`;
  }
  if (!resolved) return 'Nothing left to unlock';
  return describeReward(resolved);
}

/** Shared segmented progress grammar for Contracts and future locked character
 * requirements. The data stays exact while the cells provide quick shape. */
const CONTRACT_PROGRESS_MAX_CELLS = 12;

/** Maps exact Contract progress to a compact visual grammar without rounding it. */
export function contractProgressCells(current: number, target: number): {
  cellCount: number;
  target: number;
  current: number;
  fills: number[];
} {
  const safeTarget = Number.isFinite(target) ? Math.max(0, Math.floor(target)) : 0;
  const safeCurrent = Number.isFinite(current) ? Math.max(0, Math.min(current, safeTarget)) : 0;
  const cellCount = safeTarget > 0 && safeTarget <= CONTRACT_PROGRESS_MAX_CELLS
    ? safeTarget
    : safeTarget > CONTRACT_PROGRESS_MAX_CELLS
      ? CONTRACT_PROGRESS_MAX_CELLS
      : 1;
  const scaledFill = safeTarget > 0 ? (safeCurrent / safeTarget) * cellCount : 0;
  const fills = Array.from(
    { length: cellCount },
    (_, index) => Number(Math.max(0, Math.min(1, scaledFill - index)).toFixed(6)),
  );
  return { cellCount, target: safeTarget, current: safeCurrent, fills };
}

function segmentedContractBarHtml(current: number, target: number, label?: string, asTime = false): string {
  const progress = contractProgressCells(current, target);
  const cells = progress.fills.map((fill) => {
    const state = fill === 1 ? 'on' : fill > 0 ? 'partial' : '';
    return `<i class="${state}" data-fill="${fill}" style="--cell-fill:${fill * 100}%"></i>`;
  }).join('');
  const valueText = `${fmtProgress(progress.current, asTime)} / ${fmtProgress(progress.target, asTime)}`;
  const aria = label
    ? ` role="progressbar" aria-label="${label}" aria-valuetext="${valueText}" aria-valuemin="0" aria-valuemax="${progress.target}" aria-valuenow="${progress.current}"`
    : '';
  return `<div class="contract-bar"${aria}>${cells}</div>`;
}

/** Objectives measured in seconds read as time; everything else stays a count.
 *  The distinction has to come from the objective TYPE, never from the size of
 *  the number — "300 kills" formatted as a duration would say 5:00. */
function fmtProgress(value: number, asTime: boolean): string {
  const total = Math.floor(value);
  if (!asTime) return String(total);
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
}

function mustGet(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing HUD element #${id}`);
  return el;
}
