export type DisplayMode = 'windowed' | 'fullscreen';
export type UiScale = 'auto' | '100' | '125' | '150';

export const UI_SCALE_OPTIONS: readonly { value: UiScale; label: string; factor: number }[] = [
  { value: 'auto', label: 'Auto', factor: 1 },
  { value: '100', label: '100%', factor: 1 },
  { value: '125', label: '125%', factor: 1.25 },
  { value: '150', label: '150%', factor: 1.5 },
];

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
  uiScale: UiScale;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  bindings: ControlBindings;
}

export interface ResolutionOption {
  id: string;
  label: string;
  width: number;
  height: number;
}

export interface DisplayInfo {
  /** Physical pixels — the number a player recognises as "my resolution". */
  width: number;
  height: number;
  /** CSS-pixel scale. Electron sizes windows in DIP, so a stored physical
   *  resolution is divided by this before it reaches setContentSize. */
  scaleFactor: number;
}

/** Common windowed sizes. This is a catalogue, never the list shown to the
 *  player: the effective list is always derived from the actual display, so
 *  the picker can neither offer a window larger than the screen nor hide the
 *  resolution the game is really running at. */
const STANDARD_RESOLUTIONS: readonly ResolutionOption[] = [
  { id: '1280x720', label: '1280×720', width: 1280, height: 720 },
  { id: '1600x900', label: '1600×900', width: 1600, height: 900 },
  { id: '1920x1080', label: '1920×1080', width: 1920, height: 1080 },
  { id: '2560x1440', label: '2560×1440', width: 2560, height: 1440 },
];

export function resolutionId(width: number, height: number): string {
  return `${Math.round(width)}x${Math.round(height)}`;
}

/** The display the game is currently on, in physical pixels. */
export function detectDisplay(): DisplayInfo {
  const native = window.electronAPI?.getDisplayInfo?.();
  if (
    native &&
    Number.isFinite(native.width) && native.width > 0 &&
    Number.isFinite(native.height) && native.height > 0 &&
    Number.isFinite(native.scaleFactor) && native.scaleFactor > 0
  ) {
    return {
      width: Math.round(native.width),
      height: Math.round(native.height),
      scaleFactor: native.scaleFactor,
    };
  }
  const scaleFactor = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
  return {
    width: Math.round(window.screen.width * scaleFactor),
    height: Math.round(window.screen.height * scaleFactor),
    scaleFactor,
  };
}

/** Catalogue entries that fit on the screen, plus the native size, ascending.
 *  The native entry is ALWAYS present — it is the first-launch default, and a
 *  default the picker cannot represent would silently fall back to something
 *  else the moment settings are normalized. */
export function resolutionsForDisplay(display: DisplayInfo): ResolutionOption[] {
  const nativeId = resolutionId(display.width, display.height);
  const options = STANDARD_RESOLUTIONS.filter(
    (item) => item.id !== nativeId && item.width <= display.width && item.height <= display.height,
  ).map((item) => ({ ...item }));
  options.push({
    id: nativeId,
    label: `${display.width}×${display.height} (Native)`,
    width: display.width,
    height: display.height,
  });
  return options.sort((a, b) => a.width * a.height - b.width * b.height);
}

export function resolutionOptions(): ResolutionOption[] {
  return resolutionsForDisplay(detectDisplay());
}

/** Everything except resolution, which has no meaningful value until a display
 *  is known. Fullscreen is the first-launch mode on purpose: a demo should open
 *  filling the screen it was launched on, not in a small window. */
const BASE_DEFAULTS: Omit<GameSettings, 'resolution'> = {
  displayMode: 'fullscreen',
  uiScale: 'auto',
  masterVolume: 0.8,
  musicVolume: 0.7,
  sfxVolume: 1,
  bindings: cloneBindings(DEFAULT_BINDINGS),
};

export function defaultSettingsForDisplay(display: DisplayInfo): GameSettings {
  return {
    ...BASE_DEFAULTS,
    resolution: resolutionId(display.width, display.height),
    bindings: cloneBindings(DEFAULT_BINDINGS),
  };
}

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
  const display = detectDisplay();
  const raw = window.electronAPI?.loadSettings() ?? window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultSettingsForDisplay(display);
  try {
    return normalizeSettings(JSON.parse(raw) as Partial<GameSettings>, display);
  } catch {
    return defaultSettingsForDisplay(display);
  }
}

/** Persists only. Window mode/resolution are applied by the caller WHEN
 *  they actually change — re-applying on every save made the screen blink
 *  on each auto-applied volume tick (2026-07-13). */
export function saveSettings(settings: GameSettings): void {
  const normalized = normalizeSettings(settings, detectDisplay());
  const raw = JSON.stringify(normalized);
  window.electronAPI?.saveSettings(raw);
  window.localStorage.setItem(STORAGE_KEY, raw);
}

export function applyWindowSettings(settings: GameSettings): void {
  const display = detectDisplay();
  const native = { width: display.width, height: display.height };
  const resolution =
    resolutionsForDisplay(display).find((item) => item.id === settings.resolution) ?? native;
  // Stored sizes are physical pixels; Electron sizes windows in DIP. On a
  // scaled display (a 150% laptop) passing the physical number straight through
  // would ask for a window half again bigger than the screen.
  window.electronAPI?.setWindowMode(
    settings.displayMode,
    Math.round(resolution.width / display.scaleFactor),
    Math.round(resolution.height / display.scaleFactor),
  );
}

/** Auto follows physical display resolution, never devicePixelRatio: Electron
 * page zoom changes devicePixelRatio and would otherwise feed back into the
 * next scale calculation. */
export function resolveUiScale(uiScale: UiScale, display: DisplayInfo): number {
  if (uiScale !== 'auto') {
    return UI_SCALE_OPTIONS.find((option) => option.value === uiScale)?.factor ?? 1;
  }
  if (display.height >= 2160) return 1.5;
  if (display.height >= 1440) return 1.25;
  return 1;
}

/** Electron page zoom scales the complete DOM UI while leaving Three.js world
 * geometry untouched. Browser development keeps the existing 100% page scale. */
export function applyUiScale(settings: GameSettings): void {
  window.electronAPI?.setZoomFactor?.(resolveUiScale(settings.uiScale, detectDisplay()));
}

export function normalizeSettings(
  value: Partial<GameSettings>,
  display: DisplayInfo,
): GameSettings {
  const fallback = defaultSettingsForDisplay(display);
  const options = resolutionsForDisplay(display);
  const resolution =
    typeof value.resolution === 'string' && options.some((item) => item.id === value.resolution)
      ? value.resolution
      : fallback.resolution;
  return {
    displayMode:
      value.displayMode === 'windowed' || value.displayMode === 'fullscreen'
        ? value.displayMode
        : fallback.displayMode,
    resolution,
    uiScale:
      typeof value.uiScale === 'string' &&
      UI_SCALE_OPTIONS.some((option) => option.value === value.uiScale)
        ? value.uiScale as UiScale
        : fallback.uiScale,
    masterVolume: clamp01(value.masterVolume, fallback.masterVolume),
    musicVolume: clamp01(value.musicVolume, fallback.musicVolume),
    sfxVolume: clamp01(value.sfxVolume, fallback.sfxVolume),
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
