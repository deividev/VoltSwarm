import { ACCOUNT, WEAPON_INFO, type WeaponId } from './config';
import { CORE_TITLES } from './upgrades';
import { MOD_IDS, refreshUnlockedMods, type ModId } from './mods';

// Cross-run account progress. Mirrors the settings persistence seam
// (src/settings.ts): Electron writes a JSON file under userData, the browser
// falls back to localStorage, and a forgiving normalize step doubles as the
// migration path for older saves.
//
// ACCOUNT is mutated IN PLACE rather than replaced, because every gating
// consumer (draft pool, start draft, sockets, mod pool) holds a live reference
// to that object. Keeping the single seam intact is the whole point of the
// design note in config.ts.

const STORAGE_KEY = 'voltswarm:account';
const VERSION = 1;

/** Progress only. Design ceilings (maxWeaponSockets/maxCoreSockets) are
 *  deliberately NOT persisted: they are balance constants, so raising one later
 *  must reach existing players instead of being frozen into their save. */
interface AccountSave {
  version: number;
  weaponSockets: number;
  coreSockets: number;
  levelupDiscards: number;
  unlockedWeapons: string[];
  unlockedCores: string[];
  unlockedMods: string[];
}

/** Fresh-account baseline, captured before anything can mutate ACCOUNT. A save
 *  may only ADD to these lists, so promoting a new item to default-unlocked
 *  later reaches players who already have a save. */
const DEFAULTS = {
  weaponSockets: ACCOUNT.weaponSockets,
  coreSockets: ACCOUNT.coreSockets,
  levelupDiscards: ACCOUNT.levelupDiscards,
  unlockedWeapons: [...ACCOUNT.unlockedWeapons] as string[],
  unlockedCores: [...ACCOUNT.unlockedCores],
  unlockedMods: [...ACCOUNT.unlockedMods] as string[],
};

const VALID_WEAPONS = new Set(Object.keys(WEAPON_INFO));
const VALID_CORES = new Set(Object.keys(CORE_TITLES));
const VALID_MODS = new Set<string>(MOD_IDS);

/** Reads the stored account and applies it to ACCOUNT. Safe to call once at
 *  boot; a missing, corrupt or partial save leaves the fresh-account defaults. */
export function loadAccount(): void {
  const raw = window.electronAPI?.loadAccount() ?? window.localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      applyAccount(JSON.parse(raw) as Partial<AccountSave>);
    } catch {
      // Corrupt save: keep the defaults rather than refusing to start.
    }
  }
  // UNLOCKED_MOD_IDS is computed at module init from the DEFAULTS, so it must be
  // rebuilt whenever a save widens the unlocked set.
  refreshUnlockedMods();
}

/** Writes the current ACCOUNT. Call after any progression change. */
export function saveAccount(): void {
  const save: AccountSave = {
    version: VERSION,
    weaponSockets: ACCOUNT.weaponSockets,
    coreSockets: ACCOUNT.coreSockets,
    levelupDiscards: ACCOUNT.levelupDiscards,
    unlockedWeapons: [...ACCOUNT.unlockedWeapons],
    unlockedCores: [...ACCOUNT.unlockedCores],
    unlockedMods: [...ACCOUNT.unlockedMods],
  };
  const raw = JSON.stringify(save);
  window.electronAPI?.saveAccount(raw);
  window.localStorage.setItem(STORAGE_KEY, raw);
}

/** Wipes stored progress and restores the fresh-account state. */
export function resetAccount(): void {
  ACCOUNT.weaponSockets = DEFAULTS.weaponSockets;
  ACCOUNT.coreSockets = DEFAULTS.coreSockets;
  ACCOUNT.levelupDiscards = DEFAULTS.levelupDiscards;
  ACCOUNT.unlockedWeapons = [...DEFAULTS.unlockedWeapons] as WeaponId[];
  ACCOUNT.unlockedCores = [...DEFAULTS.unlockedCores];
  ACCOUNT.unlockedMods = [...DEFAULTS.unlockedMods] as ModId[];
  refreshUnlockedMods();
  saveAccount();
}

function applyAccount(value: Partial<AccountSave>): void {
  ACCOUNT.weaponSockets = clampSockets(value.weaponSockets, DEFAULTS.weaponSockets, ACCOUNT.maxWeaponSockets);
  ACCOUNT.coreSockets = clampSockets(value.coreSockets, DEFAULTS.coreSockets, ACCOUNT.maxCoreSockets);
  ACCOUNT.levelupDiscards = clampSockets(value.levelupDiscards, DEFAULTS.levelupDiscards, 99);
  ACCOUNT.unlockedWeapons = mergeUnlocks(DEFAULTS.unlockedWeapons, value.unlockedWeapons, VALID_WEAPONS) as WeaponId[];
  ACCOUNT.unlockedCores = mergeUnlocks(DEFAULTS.unlockedCores, value.unlockedCores, VALID_CORES);
  ACCOUNT.unlockedMods = mergeUnlocks(DEFAULTS.unlockedMods, value.unlockedMods, VALID_MODS) as ModId[];
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
