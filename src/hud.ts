import { ACCOUNT, DEV_TOOLS, WEAPON_INFO, describeWeaponBranches, type WeaponId } from './config';
import { resetAccount, saveAccount } from './account';
import { defaultStats, type PlayerStats } from './stats';
import { CORE_TITLES, weaponIdFromUpgradeCard, type CoreLevels, type Rarity, type UpgradeCard, type WeaponBranchLevels, type WeaponLevels } from './upgrades';
import { MOD_IDS, MOD_REGISTRY, UNLOCKED_MOD_IDS, describeMod, modsOfTier, refreshUnlockedMods, type ModCounts, type ModId } from './mods';
import { coreOrbIcon, warmCoreOrbs } from './core-orbs';
import {
  ACTION_IDS,
  ACTION_LABELS,
  cloneBindings,
  DEFAULT_BINDINGS,
  gamepadButtonLabel,
  keyLabel,
  RESOLUTIONS,
  type ActionId,
  type ControlBindings,
  type GameSettings,
} from './settings';
import type { PlayerInput } from './input';
import { RUN_OUTCOME_TITLES, type RunMapRef, type RunOutcome } from './run-history';

// All UI is plain DOM layered over the canvas. Fast to build, trivially
// styleable, and it never touches the render loop.

const RARITY_LABEL: Record<string, string> = {
  gray: 'Common',
  green: 'Uncommon',
  blue: 'Rare',
  purple: 'Epic',
  gold: 'Legendary',
};

// Mod display data (icons, labels, descriptions) lives in mods.ts — the
// unified registry feeds the chest reel, the shop and the items panel alike.

/** Boss bar mini-portraits: the flat reference sheets double as face art. */
const BOSS_PORTRAITS: Record<string, string> = {
  'crusher king': 'assets/2d/ref-crusher-king-front-v2.png',
  'tesla titan': 'assets/2d/ref-tesla-titan-front.png',
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
  { key: 'armor', icon: '🛡️', label: 'Armor', format: asPoints },
  { key: 'regen', icon: '❤️', label: 'Regen', format: (v) => `${asPoints(v)}/5s` },
  { key: 'evasion', icon: '👻', label: 'Evasion', format: asPoints },
  { key: 'thorns', icon: '🌵', label: 'Thorns', format: asPoints },
  { key: 'lifesteal', icon: '🩸', label: 'Lifesteal', format: (v) => `${asPoints(v)}%` },
  { key: 'duration', icon: '⏳', label: 'Duration', format: asMult },
  { key: 'luck', icon: '🍀', label: 'Luck', format: asPoints },
  { key: 'xpGain', icon: '📖', label: 'XP Gain', format: asMult },
  { key: 'cursedDifficulty', icon: '💀', label: 'Cursed', format: (v) => `+${asPct(v)}` },
];

export class Hud {
  private readonly xpFill: HTMLElement;
  private readonly hpFill: HTMLElement;
  private readonly timer: HTMLElement;
  private readonly levelBadge: HTMLElement;
  private readonly fpsCounter: HTMLElement;

  private readonly startOverlay: HTMLElement;
  private readonly draftCards: HTMLElement;
  private readonly levelUpOverlay: HTMLElement;
  private readonly levelUpFlash: HTMLElement;
  private readonly upgradeCards: HTMLElement;
  private readonly endOverlay: HTMLElement;
  private readonly endTitle: HTMLElement;
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
  private readonly masterVolume: HTMLInputElement;
  private readonly musicVolume: HTMLInputElement;
  private readonly sfxVolume: HTMLInputElement;
  private settingsReturnOverlay: 'menu' | 'pause' = 'menu';

  constructor(
    root: HTMLElement,
    private readonly onStart: (weapon: WeaponId) => void,
    private readonly onUpgradeChosen: (card: UpgradeCard) => void,
    private readonly onResume: () => void,
    private readonly onQuitToMenu: () => void,
    private readonly onSettingsChanged: (settings: GameSettings) => void,
    private readonly onUiConfirm: () => void,
  ) {
    root.insertAdjacentHTML(
      'beforeend',
      `
      <div id="hud">
        <div id="xp-bar"><div id="xp-bar-fill"></div><div id="level-badge">LV 1</div></div>
        <div id="timer">10:00</div>
        <div id="kills"><img class="ui-glyph" src="${SKULL_ICON}" alt="" /><span id="kills-amount">0</span></div>
        <div id="boss-bar" class="hidden">
          <div id="boss-title"><img id="boss-portrait" alt="" /><div id="boss-name"></div></div>
          <div id="boss-bar-track"><div id="boss-bar-fill"></div><span id="boss-hp-text"></span></div>
        </div>
        <div id="summon-prompt" class="hidden"></div>
        <div id="interact-prompt" class="hidden"></div>
        <div id="event-banner" class="hidden">
          <div class="banner-stripe"></div>
          <div id="event-banner-text"></div>
          <div class="banner-stripe"></div>
        </div>
        <div id="totem-indicator" class="hidden"><span class="arrow">▲</span><span class="label">TOTEM</span></div>
        <div id="merchant-indicator" class="hidden"><span class="arrow">▲</span><span class="label">SHOP</span></div>
        <div id="gold-counter" class="hidden"><img class="ui-glyph" src="${COIN_ICON}" alt="" /><span id="gold-amount">0</span></div>
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
          ${DEV_TOOLS.unlockPanel ? '<button id="unlocks-button">Unlocks</button>' : ''}
          <button id="menu-settings-button">Settings</button>
          <button id="exit-button">Exit</button>
        </div>
        <div id="version-tag">v${__APP_VERSION__}</div>
      </div>
      ${DEV_TOOLS.unlockPanel ? `
      <div id="unlocks-overlay" class="overlay menu-view hidden">
        <div id="unlocks-panel" class="overlay-panel">
          <div class="panel-header">Unlocks</div>
          <p class="overlay-panel-sub">Dev tool — unlock content for the playtest. Contracts will replace this.</p>
          <div id="unlocks-columns"></div>
          <div id="unlocks-actions">
            <button id="unlock-all-button">Unlock everything</button>
            <button id="unlocks-reset-button">Reset progress</button>
            <button id="unlocks-back-button">Back</button>
          </div>
        </div>
      </div>` : ''}
      <div id="start-overlay" class="overlay menu-view hidden">
        <h2>Choose your starting weapon</h2>
        <p class="stats-line">More weapons, cores and sockets unlock through contracts</p>
        <div id="draft-cards"></div>
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
      <div id="end-overlay" class="overlay hidden">
        <h1 id="end-title"></h1>
        <p id="end-stats" class="stats-line"></p>
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
        <button id="restart-button">Main Menu</button>
      </div>
      <div id="pause-overlay" class="overlay hidden">
        <h1>Paused</h1>
        <p class="stats-line">Take your time. The run is safely frozen.</p>
        <button id="resume-button">Resume</button>
        <button id="pause-settings-button">Settings</button>
        <button id="quit-run-button">Quit to Menu</button>
      </div>
      <div id="settings-overlay" class="overlay menu-view hidden">
        <h1>Settings</h1>
        <div id="settings-panel">
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
                <span>Resolution</span>
                <select id="settings-resolution">
                  ${RESOLUTIONS.map((item) => `<option value="${item.id}">${item.label}</option>`).join('')}
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
          <div id="settings-footer">
            <button id="settings-back-button">Back</button>
            <button id="settings-reset-bindings" class="hidden">Reset to Defaults</button>
          </div>
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
    this.masterVolume = mustGet('settings-master-volume') as HTMLInputElement;
    this.musicVolume = mustGet('settings-music-volume') as HTMLInputElement;
    this.sfxVolume = mustGet('settings-sfx-volume') as HTMLInputElement;

    // Universal click feedback (user rule 2026-07-18): ANY interactive element
    // clicked anywhere — menus, shop, level-up cards, settings, unlocks —
    // plays the UI confirm. Delegated in capture phase so no individual
    // handler (present or future) needs to remember it.
    document.addEventListener(
      'click',
      (e) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest('button, select, .upgrade-card, .unlock-row')) this.onUiConfirm();
      },
      { capture: true },
    );
    mustGet('play-button').addEventListener('click', () => {
      mustGet('menu-overlay').classList.add('hidden');
      this.showDraft();
    });
    mustGet('restart-button').addEventListener('click', () => {
      this.endOverlay.classList.add('hidden');
      // Resets the run world AND the game state back to 'menu' (so the 3D stops
      // rendering behind the menu view); onQuitToMenu re-shows the main menu.
      this.onQuitToMenu();
    });
    mustGet('menu-settings-button').addEventListener('click', () => {
      this.openSettings('menu');
    });
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
        for (const id of Object.keys(WEAPON_INFO) as WeaponId[]) this.unlock('weapon', id);
        for (const id of Object.keys(CORE_TITLES)) this.unlock('core', id);
        for (const id of MOD_IDS) this.unlock('mod', id);
        // Also open every socket slot (dev testing; contracts drive these later).
        ACCOUNT.weaponSockets = ACCOUNT.maxWeaponSockets;
        ACCOUNT.coreSockets = ACCOUNT.maxCoreSockets;
        // One write for the whole sweep instead of one per unlocked item.
        saveAccount();
        this.renderUnlocks();
      });
      mustGet('unlocks-reset-button').addEventListener('click', () => {
        resetAccount();
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
    // button, user rule 2026-07-13). Selects/sliders on 'change' so sliders
    // save once on release, not per pixel dragged.
    for (const id of [
      'settings-mode',
      'settings-resolution',
      'settings-master-volume',
      'settings-music-volume',
      'settings-sfx-volume',
    ]) {
      mustGet(id).addEventListener('change', () => this.applySettingsNow());
    }
    // Live value readout while dragging (the row commits on 'change' above).
    for (const id of ['settings-master-volume', 'settings-music-volume', 'settings-sfx-volume']) {
      const slider = mustGet(id) as HTMLInputElement;
      slider.addEventListener('input', () => {
        mustGet(`${id}-value`).textContent = slider.value;
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
   *  into ACCOUNT so the pools pick it up on the NEXT run. */
  private showUnlocks(): void {
    this.renderUnlocks();
    mustGet('unlocks-overlay').classList.remove('hidden');
  }

  private renderUnlocks(): void {
    const weapons = (Object.keys(WEAPON_INFO) as WeaponId[]).map((id) => ({
      kind: 'weapon' as const,
      id,
      name: WEAPON_INFO[id].title,
      icon: cardIconHtml(`weapon-${id}`),
      unlocked: ACCOUNT.unlockedWeapons.includes(id),
    }));
    const cores = Object.keys(CORE_TITLES).map((id) => ({
      kind: 'core' as const,
      id,
      name: CORE_TITLES[id] ?? id,
      icon: cardIconHtml(id),
      unlocked: ACCOUNT.unlockedCores.includes(id),
    }));
    const mods = MOD_IDS.map((id) => ({
      kind: 'mod' as const,
      id,
      name: MOD_REGISTRY[id].label,
      icon: `<img class="card-icon" src="${MOD_REGISTRY[id].image}" alt="" />`,
      unlocked: ACCOUNT.unlockedMods.includes(id),
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
            saveAccount();
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
      ...Array.from({ length: ACCOUNT.maxWeaponSockets }, (_, i) => ({ label: `Weapon Socket ${i + 1}`, index: i + 1, kind: 'weapon' as const })),
      ...Array.from({ length: ACCOUNT.maxCoreSockets }, (_, i) => ({ label: `Core Socket ${i + 1}`, index: i + 1, kind: 'core' as const })),
    ];
    const socketOpen = (s: { index: number; kind: 'weapon' | 'core' }): boolean =>
      s.index <= (s.kind === 'weapon' ? ACCOUNT.weaponSockets : ACCOUNT.coreSockets);
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
          saveAccount();
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
      ACCOUNT.weaponSockets = Math.min(ACCOUNT.maxWeaponSockets, Math.max(ACCOUNT.weaponSockets, index));
    } else {
      ACCOUNT.coreSockets = Math.min(ACCOUNT.maxCoreSockets, Math.max(ACCOUNT.coreSockets, index));
    }
  }

  private unlock(kind: 'weapon' | 'core' | 'mod', id: string): void {
    if (kind === 'weapon') {
      if (!ACCOUNT.unlockedWeapons.includes(id as WeaponId)) {
        ACCOUNT.unlockedWeapons.push(id as WeaponId);
      }
    } else if (kind === 'core') {
      if (!ACCOUNT.unlockedCores.includes(id)) ACCOUNT.unlockedCores.push(id);
    } else {
      if (!ACCOUNT.unlockedMods.includes(id as ModId)) ACCOUNT.unlockedMods.push(id as ModId);
      // UNLOCKED_MOD_IDS is a cached snapshot — rebuild it so the reel/shop
      // pick up the newly unlocked mod on the next run.
      refreshUnlockedMods();
    }
  }

  showPause(visible: boolean): void {
    this.pauseOverlay.classList.toggle('hidden', !visible);
  }

  syncSettings(settings: GameSettings): void {
    this.settingsMode.value = settings.displayMode;
    this.settingsResolution.value = settings.resolution;
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

  isSettingsOpen(): boolean {
    return !this.settingsOverlay.classList.contains('hidden');
  }

  private readSettingsForm(): GameSettings {
    return {
      displayMode: this.settingsMode.value === 'fullscreen' ? 'fullscreen' : 'windowed',
      resolution: this.settingsResolution.value,
      masterVolume: Number(this.masterVolume.value) / 100,
      musicVolume: Number(this.musicVolume.value) / 100,
      sfxVolume: Number(this.sfxVolume.value) / 100,
      bindings: cloneBindings(this.draftBindings),
    };
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
        'assets/2d/ref-scrapper-front-v2.png',
        'assets/2d/logo-mascot-v3.png',
        'assets/2d/logo-letras-v3.png',
        ...Object.values(WEAPON_ICON_IMAGES),
        ...Object.values(STAT_ICON_IMAGES),
        ...Object.values(CARD_ICON_IMAGES),
        ...Object.values(BOSS_PORTRAITS),
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
    const items = Array.from(
      container.querySelectorAll<HTMLElement>(
        'button, select, input[type="range"], .upgrade-card:not(#chest-card), .unlock-row',
      ),
    ).filter(
      (el) =>
        el.offsetParent !== null &&
        !el.classList.contains('hidden') &&
        !(el as HTMLButtonElement).disabled,
    );
    if (items.length === 0) return;
    if (this.padNavContainer !== container) {
      this.padNavContainer = container;
      this.padNavIndex = 0;
      this.setPadFocus(items[0] ?? null);
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
    if (vertical !== 0) {
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
        '#settings-back-button, #unlocks-back-button, #shop-leave-button, ' +
          '#chest-continue, #resume-button, #restart-button',
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

  private setPadFocus(el: HTMLElement | null): void {
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
  }

  /** Start-of-run weapon draft: 3 random distinct options out of the
   *  account's UNLOCKED weapons (contract-locked ones never appear). */
  private showDraft(): void {
    const all = (Object.keys(WEAPON_INFO) as WeaponId[]).filter((id) =>
      ACCOUNT.unlockedWeapons.includes(id),
    );
    const options: WeaponId[] = [];
    while (options.length < 3 && all.length > 0) {
      const index = Math.floor(Math.random() * all.length);
      options.push(...all.splice(index, 1));
    }

    this.draftCards.innerHTML = '';
    for (const weaponId of options) {
      const info = WEAPON_INFO[weaponId];
      const card = document.createElement('div');
      card.className = 'upgrade-card blue';
      const title = document.createElement('h3');
      title.textContent = info.title;
      const desc = document.createElement('p');
      desc.textContent = info.description;
      card.insertAdjacentHTML('beforeend', cardIconHtml(`weapon-${weaponId}`));
      card.append(title, desc);
      card.addEventListener('click', () => {
        this.startOverlay.classList.add('hidden');
        this.onStart(weaponId);
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
   *  FULL 20-stat sheet renders into #stat-sheet inside the level-up
   *  overlay, where the player actually compares values against the offered
   *  cards. Raised stats highlight in gold. */
  updateBuild(
    stats: PlayerStats,
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
    for (let i = ownedWeapons; i < ACCOUNT.weaponSockets; i++) weaponTiles += emptyTile;
    for (let i = ACCOUNT.weaponSockets; i < ACCOUNT.maxWeaponSockets; i++) weaponTiles += lockedTile;
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
    for (let i = installedCores.length; i < ACCOUNT.coreSockets; i++) coreTiles += emptyTile;
    for (let i = ACCOUNT.coreSockets; i < ACCOUNT.maxCoreSockets; i++) coreTiles += lockedTile;
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
    // the always-on panel: 20 stat rows overflowed the screen in-run
    // (2026-07-08 user report), and the moment the sheet actually matters is
    // while comparing upgrade cards.
    const sheet = mustGet('stat-sheet');
    sheet.innerHTML = '<div class="panel-header">STATS</div>';
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
    // — so locked content is teased (a padlock badge marks it). The reel still
    // only LANDS on the unlocked finalMod. Falls back to the whole unlocked
    // pool only if the tier is somehow empty. Tier is capped to a populated
    // one at spawn, so cross-tier teasing never happens.
    const tierPool = modsOfTier(tier);
    const spinPool = tierPool.length > 0 ? tierPool : UNLOCKED_MOD_IDS;
    const cellHtml = (id: ModId | undefined): string => {
      const entry = id ? MOD_REGISTRY[id] : undefined;
      const locked = id ? !UNLOCKED_MOD_IDS.includes(id) : false;
      const lock = locked
        ? '<img class="chest-cell-lock" src="assets/2d/icon-ui-lock-v2.png" alt="" />'
        : '';
      return `<div class="chest-cell${locked ? ' locked' : ''}">${iconHtml(entry)}${lock}</div>`;
    };
    const startIdx = Math.floor(Math.random() * spinPool.length);
    let cells = '';
    for (let i = 0; i < cellCount; i++) {
      cells += cellHtml(spinPool[(startIdx + i) % spinPool.length]);
    }
    const final = MOD_REGISTRY[finalMod];
    cells += cellHtml(finalMod); // always unlocked → never padlocked
    reel.innerHTML = cells;

    const land = (): void => {
      icon.innerHTML = iconHtml(final);
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
  ): void {
    this.endTitle.textContent = RUN_OUTCOME_TITLES[outcome];
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
      `<span>${m}:${s.toString().padStart(2, '0')} survived</span>`,
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
}

function mustGet(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing HUD element #${id}`);
  return el;
}
