import { PROFILE, WEAPON_INFO, type WeaponId } from './config';
import { CORE_TITLES } from './upgrades';
import { MOD_IDS, refreshUnlockedMods, type ModId } from './mods';

// Cross-run player profile. Mirrors the settings persistence seam
// (src/settings.ts): Electron writes a JSON file under userData, the browser
// falls back to localStorage, and a forgiving normalize step doubles as the
// migration path for older saves.
//
// PROFILE is mutated IN PLACE rather than replaced, because every gating
// consumer (draft pool, start draft, sockets, mod pool) holds a live reference
// to that object. Keeping the single seam intact is the whole point of the
// design note in config.ts.

const STORAGE_KEY = 'voltswarm:profile';
const VERSION = 1;

/** Progress only. Design ceilings (maxWeaponSockets/maxCoreSockets) are
 *  deliberately NOT persisted: they are balance constants, so raising one later
 *  must reach existing players instead of being frozen into their save. */
interface ProfileSave {
  version: number;
  weaponSockets: number;
  coreSockets: number;
  levelupDiscards: number;
  unlockedWeapons: string[];
  unlockedCores: string[];
  unlockedMods: string[];
}

/** Fresh-profile baseline, captured before anything can mutate PROFILE. A save
 *  may only ADD to these lists, so promoting a new item to default-unlocked
 *  later reaches players who already have a save. */
const DEFAULTS = {
  weaponSockets: PROFILE.weaponSockets,
  coreSockets: PROFILE.coreSockets,
  levelupDiscards: PROFILE.levelupDiscards,
  unlockedWeapons: [...PROFILE.unlockedWeapons] as string[],
  unlockedCores: [...PROFILE.unlockedCores],
  unlockedMods: [...PROFILE.unlockedMods] as string[],
};

const VALID_WEAPONS = new Set(Object.keys(WEAPON_INFO));
const VALID_CORES = new Set(Object.keys(CORE_TITLES));
const VALID_MODS = new Set<string>(MOD_IDS);

/** Reads the stored profile and applies it to PROFILE. Safe to call once at
 *  boot; a missing, corrupt or partial save leaves the fresh-profile defaults. */
export function loadProfile(): void {
  const raw = window.electronAPI?.loadProfile() ?? window.localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      applyProfile(JSON.parse(raw) as Partial<ProfileSave>);
    } catch {
      // Corrupt save: keep the defaults rather than refusing to start.
    }
  }
  // UNLOCKED_MOD_IDS is computed at module init from the DEFAULTS, so it must be
  // rebuilt whenever a save widens the unlocked set.
  refreshUnlockedMods();
}

/** Writes the current PROFILE. Call after any progression change. */
export function saveProfile(): void {
  const save: ProfileSave = {
    version: VERSION,
    weaponSockets: PROFILE.weaponSockets,
    coreSockets: PROFILE.coreSockets,
    levelupDiscards: PROFILE.levelupDiscards,
    unlockedWeapons: [...PROFILE.unlockedWeapons],
    unlockedCores: [...PROFILE.unlockedCores],
    unlockedMods: [...PROFILE.unlockedMods],
  };
  const raw = JSON.stringify(save);
  window.electronAPI?.saveProfile(raw);
  window.localStorage.setItem(STORAGE_KEY, raw);
}

/** Wipes stored progress and restores the fresh-profile state. */
export function resetProfile(): void {
  PROFILE.weaponSockets = DEFAULTS.weaponSockets;
  PROFILE.coreSockets = DEFAULTS.coreSockets;
  PROFILE.levelupDiscards = DEFAULTS.levelupDiscards;
  PROFILE.unlockedWeapons = [...DEFAULTS.unlockedWeapons] as WeaponId[];
  PROFILE.unlockedCores = [...DEFAULTS.unlockedCores];
  PROFILE.unlockedMods = [...DEFAULTS.unlockedMods] as ModId[];
  refreshUnlockedMods();
  saveProfile();
}

function applyProfile(value: Partial<ProfileSave>): void {
  PROFILE.weaponSockets = clampSockets(value.weaponSockets, DEFAULTS.weaponSockets, PROFILE.maxWeaponSockets);
  PROFILE.coreSockets = clampSockets(value.coreSockets, DEFAULTS.coreSockets, PROFILE.maxCoreSockets);
  PROFILE.levelupDiscards = clampSockets(value.levelupDiscards, DEFAULTS.levelupDiscards, 99);
  PROFILE.unlockedWeapons = mergeUnlocks(DEFAULTS.unlockedWeapons, value.unlockedWeapons, VALID_WEAPONS) as WeaponId[];
  PROFILE.unlockedCores = mergeUnlocks(DEFAULTS.unlockedCores, value.unlockedCores, VALID_CORES);
  PROFILE.unlockedMods = mergeUnlocks(DEFAULTS.unlockedMods, value.unlockedMods, VALID_MODS) as ModId[];
}

/** Defaults first, then any saved extras. Unknown ids are dropped so a stale or
 *  hand-edited save cannot inject a phantom entry into the draft/chest pools. */
function mergeUnlocks(defaults: string[], saved: unknown, valid: Set<string>): string[] {
  const result = [...defaults];
  if (!Array.isArray(saved)) return result;
  for (const id of saved) {
    if (typeof id === 'string' && valid.has(id) && !result.includes(id)) result.push(id);
  }
  return result;
}

function clampSockets(value: unknown, fallback: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(fallback, Math.floor(value)));
}
