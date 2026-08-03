export type DisplayMode = 'windowed' | 'fullscreen';

/** Rebindable game actions. Escape (pause/cancel) and the gamepad left
 *  stick (movement) are reserved and never rebindable. */
export type ActionId = 'moveUp' | 'moveDown' | 'moveLeft' | 'moveRight' | 'interact';

export const ACTION_IDS: ActionId[] = ['moveUp', 'moveDown', 'moveLeft', 'moveRight', 'interact'];

export const ACTION_LABELS: Record<ActionId, string> = {
  moveUp: 'Move Up',
  moveDown: 'Move Down',
  moveLeft: 'Move Left',
  moveRight: 'Move Right',
  interact: 'Interact',
};

export interface ControlBindings {
  /** KeyboardEvent.code values per action (max 2 slots). */
  keyboard: Record<ActionId, string[]>;
  /** Standard-mapping gamepad button indexes per action (max 2 slots). */
  gamepad: Record<ActionId, number[]>;
}

export const DEFAULT_BINDINGS: ControlBindings = {
  keyboard: {
    moveUp: ['KeyW', 'ArrowUp'],
    moveDown: ['KeyS', 'ArrowDown'],
    moveLeft: ['KeyA', 'ArrowLeft'],
    moveRight: ['KeyD', 'ArrowRight'],
    interact: ['KeyE'],
  },
  gamepad: {
    // Standard mapping: 12-15 = d-pad up/down/left/right, 0 = A/Cross.
    moveUp: [12],
    moveDown: [13],
    moveLeft: [14],
    moveRight: [15],
    interact: [0],
  },
};

export interface GameSettings {
  displayMode: DisplayMode;
  resolution: string;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  bindings: ControlBindings;
}

export const RESOLUTIONS = [
  { id: '1280x720', label: '1280×720', width: 1280, height: 720 },
  { id: '1600x900', label: '1600×900', width: 1600, height: 900 },
  { id: '1920x1080', label: '1920×1080', width: 1920, height: 1080 },
] as const;

export const DEFAULT_SETTINGS: GameSettings = {
  displayMode: 'fullscreen',
  resolution: '1280x720',
  masterVolume: 0.8,
  musicVolume: 0.7,
  sfxVolume: 1,
  bindings: cloneBindings(DEFAULT_BINDINGS),
};

export function cloneBindings(bindings: ControlBindings): ControlBindings {
  const keyboard = {} as Record<ActionId, string[]>;
  const gamepad = {} as Record<ActionId, number[]>;
  for (const action of ACTION_IDS) {
    keyboard[action] = [...bindings.keyboard[action]];
    gamepad[action] = [...bindings.gamepad[action]];
  }
  return { keyboard, gamepad };
}

/** Short human label for a KeyboardEvent.code ('KeyE' → 'E', 'ArrowUp' → '↑'). */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  // Plain text, not arrow glyphs: Press Start 2P covers ↑↓▲▼ but NOT the
  // left/right variants, which fall back to a thin system font — mixed
  // weights read as a typo. ASCII always renders in the pixel font.
  const arrows: Record<string, string> = {
    ArrowUp: 'UP',
    ArrowDown: 'DOWN',
    ArrowLeft: 'LEFT',
    ArrowRight: 'RIGHT',
  };
  if (arrows[code]) return arrows[code];
  return code.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();
}

/** Human label for a standard-mapping gamepad button index. */
export function gamepadButtonLabel(index: number): string {
  const names: Record<number, string> = {
    0: 'A',
    1: 'B',
    2: 'X',
    3: 'Y',
    4: 'LB',
    5: 'RB',
    6: 'LT',
    7: 'RT',
    8: 'BACK',
    9: 'START',
    10: 'LS',
    11: 'RS',
    12: 'D-UP',
    13: 'D-DOWN',
    14: 'D-LEFT',
    15: 'D-RIGHT',
  };
  return names[index] ?? `BTN ${index}`;
}

const STORAGE_KEY = 'voltswarm:settings';

export function loadSettings(): GameSettings {
  const raw = window.electronAPI?.loadSettings() ?? window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    return normalizeSettings(JSON.parse(raw) as Partial<GameSettings>);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Persists only. Window mode/resolution are applied by the caller WHEN
 *  they actually change — re-applying on every save made the screen blink
 *  on each auto-applied volume tick (2026-07-13). */
export function saveSettings(settings: GameSettings): void {
  const normalized = normalizeSettings(settings);
  const raw = JSON.stringify(normalized);
  window.electronAPI?.saveSettings(raw);
  window.localStorage.setItem(STORAGE_KEY, raw);
}

export function applyWindowSettings(settings: GameSettings): void {
  const resolution = RESOLUTIONS.find((item) => item.id === settings.resolution) ?? RESOLUTIONS[0];
  window.electronAPI?.setWindowMode(
    settings.displayMode,
    resolution.width,
    resolution.height,
  );
}

function normalizeSettings(value: Partial<GameSettings>): GameSettings {
  const resolution =
    typeof value.resolution === 'string' &&
    RESOLUTIONS.some((item) => item.id === value.resolution)
      ? value.resolution
      : DEFAULT_SETTINGS.resolution;
  return {
    displayMode:
      value.displayMode === 'windowed' || value.displayMode === 'fullscreen'
        ? value.displayMode
        : DEFAULT_SETTINGS.displayMode,
    resolution,
    masterVolume: clamp01(value.masterVolume, DEFAULT_SETTINGS.masterVolume),
    musicVolume: clamp01(value.musicVolume, DEFAULT_SETTINGS.musicVolume),
    sfxVolume: clamp01(value.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
    bindings: normalizeBindings(value.bindings),
  };
}

/** Per-action validation with per-slot fallback to defaults — the same
 *  forgiving strategy as the rest of the settings (old saves without
 *  bindings just get the defaults; no schema version needed). */
function normalizeBindings(value: Partial<ControlBindings> | undefined): ControlBindings {
  const result = cloneBindings(DEFAULT_BINDINGS);
  if (!value) return result;
  for (const action of ACTION_IDS) {
    const keys = value.keyboard?.[action];
    if (Array.isArray(keys)) {
      const valid = keys.filter((k) => typeof k === 'string' && k.length > 0).slice(0, 2);
      if (valid.length > 0) result.keyboard[action] = valid;
    }
    const buttons = value.gamepad?.[action];
    if (Array.isArray(buttons)) {
      const valid = buttons
        .filter((b) => typeof b === 'number' && Number.isInteger(b) && b >= 0 && b <= 31)
        .slice(0, 2);
      if (valid.length > 0) result.gamepad[action] = valid;
    }
  }
  return result;
}

function clamp01(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}
