import { WEAPON_INFO, type WeaponId } from './config';
import { defaultStats, type PlayerStats } from './stats';
import type { UpgradeCard, WeaponLevels } from './upgrades';
import type { PickupReward } from './pickups';
import { RESOLUTIONS, type GameSettings } from './settings';

// All UI is plain DOM layered over the canvas. Fast to build, trivially
// styleable, and it never touches the render loop.

const RARITY_LABEL: Record<string, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
};

/** Display order of the crate slot-machine reel — every possible reward. */
export const REWARD_DISPLAY: [PickupReward, { icon: string; label: string }][] = [
  ['repair', { icon: '🔧', label: 'Repair Kit' }],
  ['scrap-cache', { icon: '🔷', label: 'Volt Cache' }],
  ['frenzy', { icon: '💢', label: 'Frenzy' }],
  ['haste', { icon: '👟', label: 'Overdrive' }],
  ['luck', { icon: '🍀', label: 'Lucky Gear' }],
  ['area', { icon: '⭕', label: 'Expansion Core' }],
  ['cursed', { icon: '💀', label: 'Cursed Core' }],
];

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
  bolt: '/assets/2d/icon-weapon-bolt.png',
  pulse: '/assets/2d/icon-weapon-pulse.png',
  blades: '/assets/2d/icon-weapon-blades.png',
  welder: '/assets/2d/icon-weapon-welder-v2.png',
  press: '/assets/2d/icon-weapon-press-v2.png',
  tire: '/assets/2d/icon-weapon-tire.png',
  oil: '/assets/2d/icon-weapon-oil-v2.png',
  acid: '/assets/2d/icon-weapon-acid-drum.png',
  turbine: '/assets/2d/icon-weapon-turbine-v2.png',
  ricochet: '/assets/2d/icon-weapon-ricochet-v3.png',
  dismantler: '/assets/2d/icon-weapon-dismantler.png',
};

function weaponIconHtml(weaponId: WeaponId): string {
  const image = WEAPON_ICON_IMAGES[weaponId];
  return image
    ? `<img class="build-icon build-icon-img" src="${image}" alt="" />`
    : `<span class="build-icon">${WEAPON_ICONS[weaponId]}</span>`;
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
  { key: 'shield', icon: '🧿', label: 'Shield', format: asPoints },
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
  private readonly kills: HTMLElement;
  private readonly fpsCounter: HTMLElement;

  private readonly startOverlay: HTMLElement;
  private readonly draftCards: HTMLElement;
  private readonly levelUpOverlay: HTMLElement;
  private readonly upgradeCards: HTMLElement;
  private readonly endOverlay: HTMLElement;
  private readonly endTitle: HTMLElement;
  private readonly endStats: HTMLElement;
  private readonly bossBar: HTMLElement;
  private readonly bossFill: HTMLElement;
  private readonly bossName: HTMLElement;
  private readonly pauseOverlay: HTMLElement;
  private readonly settingsOverlay: HTMLElement;
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
  ) {
    root.insertAdjacentHTML(
      'beforeend',
      `
      <div id="hud">
        <div id="xp-bar"><div id="xp-bar-fill"></div></div>
        <div id="timer">10:00</div>
        <div id="level-badge">LV 1</div>
        <div id="kills">0 kills</div>
        <div id="boss-bar" class="hidden">
          <div id="boss-name"></div>
          <div id="boss-bar-track"><div id="boss-bar-fill"></div></div>
        </div>
        <div id="summon-prompt" class="hidden"></div>
        <div id="totem-indicator" class="hidden"><span class="arrow">▲</span><span class="label">TOTEM</span></div>
        <div id="hp-bar"><div id="hp-bar-fill"></div></div>
      </div>
      <div id="fps-counter" class="hidden"></div>
      <div id="build-panel"></div>
      <div id="menu-overlay" class="overlay">
        <h1>Voltswarm</h1>
        <p>Move with WASD. Weapons fire on their own — position is everything.
           Break the Volts, grab XP shards, open crates, and find the red totem if you dare.</p>
        <button id="play-button">Play</button>
        <button id="menu-settings-button">Settings</button>
        <div id="version-tag">v${__APP_VERSION__}</div>
      </div>
      <div id="start-overlay" class="overlay hidden">
        <h2>Choose your starting weapon</h2>
        <p class="stats-line">The rest unlock as you level up</p>
        <div id="draft-cards"></div>
      </div>
      <div id="levelup-overlay" class="overlay hidden">
        <h2>Level Up</h2>
        <p>Choose an upgrade</p>
        <div id="upgrade-cards"></div>
      </div>
      <div id="end-overlay" class="overlay hidden">
        <h1 id="end-title"></h1>
        <p id="end-stats" class="stats-line"></p>
        <button id="restart-button">Main Menu</button>
      </div>
      <div id="pause-overlay" class="overlay hidden">
        <h1>Paused</h1>
        <p class="stats-line">Take your time. The run is safely frozen.</p>
        <button id="resume-button">Resume</button>
        <button id="pause-settings-button">Settings</button>
        <button id="quit-run-button">Quit to Menu</button>
      </div>
      <div id="settings-overlay" class="overlay hidden">
        <h1>Settings</h1>
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
        <label class="settings-row">
          <span>Master Volume</span>
          <input id="settings-master-volume" type="range" min="0" max="100" step="1" />
        </label>
        <label class="settings-row">
          <span>Music Volume</span>
          <input id="settings-music-volume" type="range" min="0" max="100" step="1" />
        </label>
        <label class="settings-row">
          <span>SFX Volume</span>
          <input id="settings-sfx-volume" type="range" min="0" max="100" step="1" />
        </label>
        <button id="settings-apply-button">Apply</button>
        <button id="settings-back-button">Back</button>
      </div>
      <div id="chest-overlay" class="overlay chest hidden">
        <h2>Volt Crate</h2>
        <div id="chest-slot"><span id="chest-icon"></span></div>
        <p id="chest-label"></p>
      </div>
      `,
    );

    this.xpFill = mustGet('xp-bar-fill');
    this.hpFill = mustGet('hp-bar-fill');
    this.timer = mustGet('timer');
    this.levelBadge = mustGet('level-badge');
    this.kills = mustGet('kills');
    this.fpsCounter = mustGet('fps-counter');
    this.startOverlay = mustGet('start-overlay');
    this.draftCards = mustGet('draft-cards');
    this.levelUpOverlay = mustGet('levelup-overlay');
    this.upgradeCards = mustGet('upgrade-cards');
    this.endOverlay = mustGet('end-overlay');
    this.endTitle = mustGet('end-title');
    this.endStats = mustGet('end-stats');
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

    mustGet('play-button').addEventListener('click', () => {
      mustGet('menu-overlay').classList.add('hidden');
      this.showDraft();
    });
    mustGet('restart-button').addEventListener('click', () => {
      this.endOverlay.classList.add('hidden');
      this.showMainMenu();
    });
    mustGet('menu-settings-button').addEventListener('click', () => {
      this.openSettings('menu');
    });
    mustGet('resume-button').addEventListener('click', () => this.onResume());
    mustGet('pause-settings-button').addEventListener('click', () => {
      this.pauseOverlay.classList.add('hidden');
      this.openSettings('pause');
    });
    mustGet('quit-run-button').addEventListener('click', () => this.onQuitToMenu());
    mustGet('settings-apply-button').addEventListener('click', () => {
      this.onSettingsChanged(this.readSettingsForm());
    });
    mustGet('settings-back-button').addEventListener('click', () => this.closeSettings());
  }

  /** Landing screen: title + Play. Runs always start (and end) here. */
  showMainMenu(): void {
    mustGet('menu-overlay').classList.remove('hidden');
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
  }

  private openSettings(returnOverlay: 'menu' | 'pause'): void {
    this.settingsReturnOverlay = returnOverlay;
    mustGet('menu-overlay').classList.add('hidden');
    this.settingsOverlay.classList.remove('hidden');
  }

  closeSettings(): void {
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
    };
  }

  /** Start-of-run weapon draft: 3 random distinct options out of all weapons. */
  private showDraft(): void {
    const all = Object.keys(WEAPON_INFO) as WeaponId[];
    const options: WeaponId[] = [];
    while (options.length < 3 && all.length > 0) {
      const index = Math.floor(Math.random() * all.length);
      options.push(...all.splice(index, 1));
    }

    this.draftCards.innerHTML = '';
    for (const weaponId of options) {
      const info = WEAPON_INFO[weaponId];
      const card = document.createElement('div');
      card.className = 'upgrade-card rare';
      const title = document.createElement('h3');
      title.textContent = info.title;
      const desc = document.createElement('p');
      desc.textContent = info.description;
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
  }

  updateTimer(remainingS: number): void {
    const m = Math.floor(Math.max(0, remainingS) / 60);
    const s = Math.floor(Math.max(0, remainingS) % 60);
    this.timer.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  }

  updateLevel(level: number, kills: number): void {
    this.levelBadge.textContent = `LV ${level}`;
    this.kills.textContent = `${kills} kills`;
  }

  /** Live FPS readout (dev instrument, gated by config.VISUAL.showFps). */
  updateFps(fps: number): void {
    this.fpsCounter.classList.remove('hidden');
    this.fpsCounter.textContent = `${fps} FPS`;
  }

  /** Left-side build panel: owned weapons with levels, then the FULL stat
   *  sheet with current values. Raised stats highlight in gold so the player
   *  can read their state before and after every upgrade — the panel sits
   *  above the level-up overlay on purpose. */
  updateBuild(stats: PlayerStats, weapons: WeaponLevels): void {
    const panel = mustGet('build-panel');
    panel.innerHTML = '';
    const base = defaultStats();

    for (const weaponId of Object.keys(weapons) as WeaponId[]) {
      const level = weapons[weaponId];
      if (level <= 0) continue;
      const row = document.createElement('div');
      row.className = 'build-row weapon';
      row.innerHTML = `${weaponIconHtml(weaponId)}<span>${WEAPON_INFO[weaponId].title}</span><span class="build-value raised">Lv ${level}</span>`;
      panel.appendChild(row);
    }

    for (const def of STAT_ROWS) {
      const value = stats[def.key];
      const raised = Math.abs(value - base[def.key]) >= 0.001;
      const row = document.createElement('div');
      row.className = 'build-row';
      row.innerHTML = `<span class="build-icon">${def.icon}</span><span>${def.label}</span><span class="build-value${raised ? ' raised' : ''}">${def.format(value)}</span>`;
      panel.appendChild(row);
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
  }

  showLevelUp(choices: UpgradeCard[]): void {
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
      el.append(rarity, title, desc);
      el.addEventListener('click', () => {
        this.levelUpOverlay.classList.add('hidden');
        this.onUpgradeChosen(card);
      });
      this.upgradeCards.appendChild(el);
    }
    this.levelUpOverlay.classList.remove('hidden');
  }

  /** Slot-machine crate opening: the reel cycles through every possible
   *  reward, decelerates, and lands on the one actually rolled. `onDone`
   *  fires after the landing beat so the game can apply it and resume. */
  showChestSpin(finalReward: PickupReward, onDone: () => void): void {
    const overlay = mustGet('chest-overlay');
    const slot = mustGet('chest-slot');
    const icon = mustGet('chest-icon');
    const label = mustGet('chest-label');
    overlay.classList.remove('hidden');
    slot.classList.remove('landed');
    label.textContent = ' ';

    let index = Math.floor(Math.random() * REWARD_DISPLAY.length);
    let delay = 55;

    const tick = (): void => {
      if (delay > 240) {
        // Land on the actual reward.
        const final = REWARD_DISPLAY.find(([id]) => id === finalReward)?.[1];
        icon.textContent = final?.icon ?? '❔';
        label.textContent = final?.label ?? '';
        slot.classList.add('landed');
        window.setTimeout(() => {
          overlay.classList.add('hidden');
          onDone();
        }, 950);
        return;
      }
      const entry = REWARD_DISPLAY[index % REWARD_DISPLAY.length];
      icon.textContent = entry ? entry[1].icon : '❔';
      index++;
      delay *= 1.16;
      window.setTimeout(tick, delay);
    };
    tick();
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

  showEnd(title: string, level: number, kills: number, survivedS: number, bosses = 0): void {
    this.endTitle.textContent = title;
    const m = Math.floor(survivedS / 60);
    const s = Math.floor(survivedS % 60);
    const bossPart = bosses > 0 ? ` · ${bosses} boss${bosses > 1 ? 'es' : ''} slain` : '';
    this.endStats.textContent = `Level ${level} · ${kills} kills · ${m}:${s
      .toString()
      .padStart(2, '0')} survived${bossPart}`;
    this.endOverlay.classList.remove('hidden');
  }
}

function mustGet(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing HUD element #${id}`);
  return el;
}
