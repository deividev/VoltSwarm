import { PROFILE, WEAPON_INFO, type WeaponId } from './config';
import { CORE_TITLES } from './upgrades';
import { MOD_IDS, refreshUnlockedMods, type ModId } from './mods';
import { loadRunHistory, type RunRecordV1 } from './run-history';
// Type-only: erased at compile time, so this cannot create a runtime cycle with
// contracts.ts, which imports LIFETIME from here.
import type { Reward } from './contracts';

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
const VERSION = 2;

/** Monotonic career totals, the fact base every contract objective reads.
 *
 *  Kept as its own accumulator rather than derived from run history on demand,
 *  because history is capped at MAX_STORED_RUNS: a "10,000 lifetime kills"
 *  objective would silently lose ground once old runs age out. History stays
 *  the raw record for balance analysis; this stays the career ledger. */
export interface LifetimeStats {
  runsFinished: number;
  runsSurvived: number;
  totalKills: number;
  totalPlayS: number;
  bestKillsInRun: number;
  bestLevel: number;
  bestDurationS: number;
  bossesDefeated: number;
  damageTaken: number;
  goldEarned: number;
  shopPurchases: number;
  /** Per weapon id / per chest tier. Plain maps so new content needs no migration. */
  damageByWeapon: Record<string, number>;
  runsByStartingWeapon: Record<string, number>;
  weaponMaxLevel: Record<string, number>;
  chestsByTier: Record<string, number>;
  bestModsHeld: number;
  bestGoldEarnedInRun: number;
  /** Longest finished run carrying ONE weapon and ZERO mods. */
  bestMinimalRunS: number;
  /** Longest finished run that took no damage at all. */
  bestFlawlessRunS: number;
  /** Contract ids already paid out. Rewards are never revoked, so raising a
   *  threshold later cannot take back what a player already earned. */
  completedContracts: string[];
  /** What each contract actually handed over, keyed by contract id. A ladder
   *  rung's reward is "the next queue entry", which is meaningless once it has
   *  been claimed — without this the screen would show a settled rung as
   *  "Next mod" with no icon instead of naming the mod it gave. */
  grantedRewards: Record<string, Reward>;
  /** Ids already folded in, so a backfill can never double-count a run. */
  countedRunIds: string[];
}

export const LIFETIME: LifetimeStats = emptyLifetime();

function emptyLifetime(): LifetimeStats {
  return {
    runsFinished: 0, runsSurvived: 0, totalKills: 0, totalPlayS: 0,
    bestKillsInRun: 0, bestLevel: 0, bestDurationS: 0, bossesDefeated: 0,
    damageTaken: 0, goldEarned: 0, shopPurchases: 0,
    damageByWeapon: {}, runsByStartingWeapon: {}, weaponMaxLevel: {},
    chestsByTier: {}, bestModsHeld: 0, bestGoldEarnedInRun: 0,
    bestMinimalRunS: 0, bestFlawlessRunS: 0, completedContracts: [], grantedRewards: {},
    countedRunIds: [],
  };
}

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
  /** Absent in v1 saves; rebuilt from run history on first load. */
  lifetime?: LifetimeStats;
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
  // A v1 save has no career ledger. Rebuild it from whatever run history
  // survives so playtests recorded before contracts existed still count, and
  // the player is not asked to re-earn what they already did.
  if (LIFETIME.runsFinished === 0) backfillLifetime(loadRunHistory());
}

/** Folds a finished run into the career ledger. Idempotent per run id, so a
 *  backfill that overlaps runs already counted cannot inflate the totals. */
export function recordRunInLifetime(record: RunRecordV1): void {
  if (LIFETIME.countedRunIds.includes(record.id)) return;
  LIFETIME.countedRunIds.push(record.id);
  // Bounded so the ledger cannot grow without limit; only recent ids matter,
  // because a backfill only ever replays runs still present in history.
  if (LIFETIME.countedRunIds.length > 400) LIFETIME.countedRunIds.splice(0, LIFETIME.countedRunIds.length - 400);

  LIFETIME.runsFinished += 1;
  if (record.outcome !== 'defeat') LIFETIME.runsSurvived += 1;
  LIFETIME.totalKills += record.kills;
  LIFETIME.totalPlayS += record.durationS;
  LIFETIME.bossesDefeated += record.bossesDefeated;
  LIFETIME.bestKillsInRun = Math.max(LIFETIME.bestKillsInRun, record.kills);
  LIFETIME.bestLevel = Math.max(LIFETIME.bestLevel, record.level);
  LIFETIME.bestDurationS = Math.max(LIFETIME.bestDurationS, record.durationS);
  LIFETIME.bestModsHeld = Math.max(
    LIFETIME.bestModsHeld,
    Object.values(record.modCounts).reduce((total, n) => total + Math.max(0, n), 0),
  );
  // Style feats, derived from the record rather than tracked live: a run counts
  // as minimal when exactly one weapon was carried and no mod was taken, and as
  // flawless when it recorded zero damage taken. Records written before the
  // damageTaken counter existed cannot claim flawless — unknown is not zero.
  const weaponsCarried = Object.values(record.weaponLevels).filter((level) => level > 0).length;
  const modsTaken = Object.values(record.modCounts).reduce((total, n) => total + Math.max(0, n), 0);
  if (weaponsCarried <= 1 && modsTaken === 0) {
    LIFETIME.bestMinimalRunS = Math.max(LIFETIME.bestMinimalRunS, record.durationS);
  }
  if (record.damageTaken === 0) {
    LIFETIME.bestFlawlessRunS = Math.max(LIFETIME.bestFlawlessRunS, record.durationS);
  }

  LIFETIME.damageTaken += record.damageTaken ?? 0;
  LIFETIME.goldEarned += record.goldEarned ?? 0;
  LIFETIME.shopPurchases += record.shopPurchases ?? 0;
  LIFETIME.bestGoldEarnedInRun = Math.max(LIFETIME.bestGoldEarnedInRun, record.goldEarned ?? 0);
  for (const [tier, n] of Object.entries(record.chestsByTier ?? {})) {
    if (n > 0) LIFETIME.chestsByTier[tier] = (LIFETIME.chestsByTier[tier] ?? 0) + n;
  }
  if (record.startingWeapon) {
    LIFETIME.runsByStartingWeapon[record.startingWeapon] =
      (LIFETIME.runsByStartingWeapon[record.startingWeapon] ?? 0) + 1;
  }
  for (const [id, damage] of Object.entries(record.weaponDamage)) {
    if (damage > 0) LIFETIME.damageByWeapon[id] = (LIFETIME.damageByWeapon[id] ?? 0) + damage;
  }
  for (const [id, level] of Object.entries(record.weaponLevels)) {
    if (level > 0) LIFETIME.weaponMaxLevel[id] = Math.max(LIFETIME.weaponMaxLevel[id] ?? 0, level);
  }
}

/** Replays history oldest-first so "best" values land in a sensible order. */
function backfillLifetime(history: RunRecordV1[]): void {
  for (const record of [...history].reverse()) recordRunInLifetime(record);
  if (history.length > 0) saveProfile();
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
    lifetime: LIFETIME,
  };
  const raw = JSON.stringify(save, null, 2);
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
  Object.assign(LIFETIME, emptyLifetime());
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
  applyLifetime(value.lifetime);
}

/** Field-by-field so a truncated or hand-edited ledger degrades to zeros
 *  instead of poisoning contract progress with NaN. */
function applyLifetime(saved: LifetimeStats | undefined): void {
  const fresh = emptyLifetime();
  if (!saved || typeof saved !== 'object') { Object.assign(LIFETIME, fresh); return; }
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
  const map = (v: unknown): Record<string, number> => {
    const out: Record<string, number> = {};
    if (v && typeof v === 'object') {
      for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
        if (typeof n === 'number' && Number.isFinite(n) && n > 0) out[k] = n;
      }
    }
    return out;
  };
  Object.assign(LIFETIME, {
    runsFinished: num(saved.runsFinished),
    runsSurvived: num(saved.runsSurvived),
    totalKills: num(saved.totalKills),
    totalPlayS: num(saved.totalPlayS),
    bestKillsInRun: num(saved.bestKillsInRun),
    bestLevel: num(saved.bestLevel),
    bestDurationS: num(saved.bestDurationS),
    bossesDefeated: num(saved.bossesDefeated),
    damageTaken: num(saved.damageTaken),
    goldEarned: num(saved.goldEarned),
    shopPurchases: num(saved.shopPurchases),
    bestModsHeld: num(saved.bestModsHeld),
    bestGoldEarnedInRun: num(saved.bestGoldEarnedInRun),
    bestMinimalRunS: num(saved.bestMinimalRunS),
    bestFlawlessRunS: num(saved.bestFlawlessRunS),
    completedContracts: Array.isArray(saved.completedContracts)
      ? saved.completedContracts.filter((id): id is string => typeof id === 'string')
      : [],
    grantedRewards: rewardMap(saved.grantedRewards),
    damageByWeapon: map(saved.damageByWeapon),
    runsByStartingWeapon: map(saved.runsByStartingWeapon),
    weaponMaxLevel: map(saved.weaponMaxLevel),
    chestsByTier: map(saved.chestsByTier),
    countedRunIds: Array.isArray(saved.countedRunIds)
      ? saved.countedRunIds.filter((id): id is string => typeof id === 'string')
      : [],
  } satisfies LifetimeStats);
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

/** Keeps only entries that still look like a reward, so a hand-edited or
 *  partially-written save degrades to 'unknown' rather than crashing a render. */
function rewardMap(value: unknown): Record<string, Reward> {
  const out: Record<string, Reward> = {};
  if (value && typeof value === 'object') {
    for (const [id, reward] of Object.entries(value as Record<string, unknown>)) {
      if (reward && typeof reward === 'object' && typeof (reward as Reward).kind === 'string') {
        out[id] = reward as Reward;
      }
    }
  }
  return out;
}

function clampSockets(value: unknown, fallback: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(fallback, Math.floor(value)));
}
