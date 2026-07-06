export type DisplayMode = 'windowed' | 'fullscreen';

export interface GameSettings {
  displayMode: DisplayMode;
  resolution: string;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
}

export const RESOLUTIONS = [
  { id: '1280x720', label: '1280×720', width: 1280, height: 720 },
  { id: '1600x900', label: '1600×900', width: 1600, height: 900 },
  { id: '1920x1080', label: '1920×1080', width: 1920, height: 1080 },
] as const;

export const DEFAULT_SETTINGS: GameSettings = {
  displayMode: 'windowed',
  resolution: '1280x720',
  masterVolume: 0.8,
  musicVolume: 0.7,
  sfxVolume: 1,
};

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

export function saveSettings(settings: GameSettings): void {
  const normalized = normalizeSettings(settings);
  const raw = JSON.stringify(normalized);
  window.electronAPI?.saveSettings(raw);
  window.localStorage.setItem(STORAGE_KEY, raw);
  applyWindowSettings(normalized);
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
    displayMode: value.displayMode === 'fullscreen' ? 'fullscreen' : 'windowed',
    resolution,
    masterVolume: clamp01(value.masterVolume, DEFAULT_SETTINGS.masterVolume),
    musicVolume: clamp01(value.musicVolume, DEFAULT_SETTINGS.musicVolume),
    sfxVolume: clamp01(value.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
  };
}

function clamp01(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}
