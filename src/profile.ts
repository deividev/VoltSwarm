import {
  PROFILE,
  PROFILE_CAPACITY,
  PROFILE_CAPACITY_CONTRACT_REWARDS,
  CONTRACTS,
  WEAPON_INFO,
  isWeaponAvailable,
  isPlayableWeaponId,
  type WeaponId,
} from './config';
import { CORE_TITLES, isCoreId } from './upgrades';
import {
  MOD_IDS,
  PERMANENT_MOD_IDS,
  isPermanentModId,
  isModId,
  refreshUnlockedMods,
  type ModId,
} from './mods';
import {
  clearRunHistory,
  isRunComplete,
  loadRunHistory,
  mapsReachedOf,
  sectorsClearedOf,
  type RunRecordV1,
} from './run-history';
// Type-only: erased at compile time, so this cannot create a runtime cycle with
// contracts.ts, which imports LIFETIME from here.
import type { Reward } from './contracts';
import { CHARACTER_REGISTRY, isCharacterId } from './characters';
import { canonicalSocketReward, completedSocketFloor, type SocketSlot } from './socket-rewards';

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
const VERSION = 5;

/** Monotonic career totals, the fact base every contract objective reads.
 *
 *  Kept as its own accumulator rather than derived from run history on demand,
 *  because history is capped at MAX_STORED_RUNS: a "10,000 lifetime kills"
 *  objective would silently lose ground once old runs age out. History stays
 *  the raw record for balance analysis; this stays the career ledger. */
export interface LifetimeStats {
  runsFinished: number;
  runsSurvived: number;
  runsCompleted: number;
  totalSectorsCleared: number;
  bestSectorsCleared: number;
  maxMapsReached: number;
  totalKills: number;
  totalPlayS: number;
  bestKillsInRun: number;
  bestLevel: number;
  bestDurationS: number;
  bossesDefeated: number;
  /** Union of every boss KIND ever defeated. A count cannot answer "defeat
   *  every kind", and the set only grows, so it survives the history cap. */
  bossTypesDefeated: string[];
  damageTaken: number;
  goldEarned: number;
  shopPurchases: number;
  /** Per weapon id / per chest tier. Plain maps so new content needs no migration. */
  damageByWeapon: Record<string, number>;
  runsByStartingWeapon: Record<string, number>;
  weaponMaxLevel: Record<string, number>;
  chestsByTier: Record<string, number>;
  bestModsHeld: number;
  /** Most distinct valid Cores carried when a terminal run record was written. */
  bestDistinctCoresHeld: number;
  /** Most distinct permanent Mods carried when a terminal run record was written. */
  bestDistinctPermanentModsHeld: number;
  bestGoldEarnedInRun: number;
  /** Longest finished run carrying ONE weapon and ZERO mods. */
  bestMinimalRunS: number;
  /** Full sectors credited by a structurally complete run carrying exactly one
   * playable weapon and no installed permanent Mods. */
  bestPuristSectors: number;
  /** Longest finished run that took no damage at all. */
  bestFlawlessRunS: number;
  /** Character ids that have each completed the full current arc. Monotonic and
   * independent of capped run history. */
  completedCharacterIds: string[];
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
    runsFinished: 0, runsSurvived: 0, runsCompleted: 0,
    totalSectorsCleared: 0, bestSectorsCleared: 0, maxMapsReached: 0,
    totalKills: 0, totalPlayS: 0,
    bestKillsInRun: 0, bestLevel: 0, bestDurationS: 0, bossesDefeated: 0, bossTypesDefeated: [],
    damageTaken: 0, goldEarned: 0, shopPurchases: 0,
    damageByWeapon: {}, runsByStartingWeapon: {}, weaponMaxLevel: {},
    chestsByTier: {}, bestModsHeld: 0, bestDistinctCoresHeld: 0,
    bestDistinctPermanentModsHeld: 0,
    bestGoldEarnedInRun: 0,
    bestMinimalRunS: 0, bestPuristSectors: 0, bestFlawlessRunS: 0,
    completedCharacterIds: [],
    completedContracts: [], grantedRewards: {},
    countedRunIds: [],
  };
}

/** Progress only. Design ceilings (maxWeaponSockets/maxCoreSockets/maxLevelupDiscards) are
 *  deliberately NOT persisted: they are balance constants, so raising one later
 *  must reach existing players instead of being frozen into their save. */
interface ProfileSave {
  version: number;
  unlockedCharacters: string[];
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
  unlockedCharacters: [...PROFILE.unlockedCharacters] as string[],
  weaponSockets: PROFILE.weaponSockets,
  coreSockets: PROFILE.coreSockets,
  levelupDiscards: PROFILE.levelupDiscards,
  unlockedWeapons: [...PROFILE.unlockedWeapons] as string[],
  unlockedCores: [...PROFILE.unlockedCores],
  unlockedMods: [...PROFILE.unlockedMods] as string[],
};

// Benched weapons are not valid unlocks, so a profile saved while one was
// still live drops it on the next load instead of carrying it forever.
const VALID_WEAPONS = new Set(Object.keys(WEAPON_INFO).filter((id) => isWeaponAvailable(id as WeaponId)));
const VALID_CORES = new Set(Object.keys(CORE_TITLES));
const VALID_MODS = new Set<string>(MOD_IDS);
const VALID_CHARACTERS = new Set<string>(Object.keys(CHARACTER_REGISTRY));

/** Reads the stored profile and applies it to PROFILE. Safe to call once at
 *  boot; a missing, corrupt or partial save leaves the fresh-profile defaults. */
export function loadProfile(): void {
  const raw = window.electronAPI?.loadProfile() ?? window.localStorage.getItem(STORAGE_KEY);
  let profileNeedsRewrite = false;
  if (raw) {
    try {
      profileNeedsRewrite = applyProfile(JSON.parse(raw) as Partial<ProfileSave>);
    } catch {
      // Corrupt save: keep the defaults rather than refusing to start.
    }
  }
  // UNLOCKED_MOD_IDS is computed at module init from the DEFAULTS, so it must be
  // rebuilt whenever a save widens the unlocked set.
  refreshUnlockedMods();
  // Do not leave rejected weapon progress dormant in durable storage. A later
  // registry change must not turn an old unknown/disabled fabricated entry
  // into retroactive achievement evidence.
  if (profileNeedsRewrite) saveProfile();
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
  if (isRunComplete(record)) {
    LIFETIME.runsCompleted += 1;
    if (isCharacterId(record.characterId) && !LIFETIME.completedCharacterIds.includes(record.characterId)) {
      LIFETIME.completedCharacterIds.push(record.characterId);
    }
  }
  const sectorsCleared = sectorsClearedOf(record);
  LIFETIME.totalSectorsCleared += sectorsCleared;
  LIFETIME.bestSectorsCleared = Math.max(LIFETIME.bestSectorsCleared, sectorsCleared);
  LIFETIME.maxMapsReached = Math.max(LIFETIME.maxMapsReached, mapsReachedOf(record));
  LIFETIME.totalKills += record.kills;
  LIFETIME.totalPlayS += record.durationS;
  LIFETIME.bossesDefeated += record.bossesDefeated;
  for (const kind of record.bossTypesDefeated ?? []) {
    if (!LIFETIME.bossTypesDefeated.includes(kind)) LIFETIME.bossTypesDefeated.push(kind);
  }
  const terminalKills = terminalKillCountOf(record);
  if (terminalKills > 0) {
    LIFETIME.bestKillsInRun = Math.max(LIFETIME.bestKillsInRun, terminalKills);
  }
  LIFETIME.bestLevel = Math.max(LIFETIME.bestLevel, record.level);
  LIFETIME.bestDurationS = Math.max(LIFETIME.bestDurationS, record.durationS);
  LIFETIME.bestModsHeld = Math.max(
    LIFETIME.bestModsHeld,
    Object.values(record.modCounts).reduce((total, n) => total + Math.max(0, n), 0),
  );
  if (isTerminalRunOutcome(record.outcome)) {
    LIFETIME.bestDistinctCoresHeld = Math.max(
      LIFETIME.bestDistinctCoresHeld,
      distinctValidCoresHeld(record.coreLevels),
    );
    LIFETIME.bestDistinctPermanentModsHeld = Math.max(
      LIFETIME.bestDistinctPermanentModsHeld,
      distinctValidPermanentModsHeld(record.modCounts),
    );
  }
  // Style feats, derived from the record rather than tracked live: a run counts
  // as minimal when exactly one weapon was carried and no mod was taken, and as
  // flawless when it recorded zero damage taken. Records written before the
  // damageTaken counter existed cannot claim flawless — unknown is not zero.
  const weaponsCarried = Object.values(record.weaponLevels).filter((level) => level > 0).length;
  const modsTaken = Object.values(record.modCounts).reduce((total, n) => total + Math.max(0, n), 0);
  if (weaponsCarried === 1 && modsTaken === 0) {
    LIFETIME.bestMinimalRunS = Math.max(LIFETIME.bestMinimalRunS, record.durationS);
  }
  const puristSectors = puristSectorsOf(record);
  if (puristSectors > 0) {
    LIFETIME.bestPuristSectors = Math.max(LIFETIME.bestPuristSectors, puristSectors);
  }
  const flawlessDurationS = flawlessDurationOf(record);
  if (flawlessDurationS > 0) {
    LIFETIME.bestFlawlessRunS = Math.max(LIFETIME.bestFlawlessRunS, flawlessDurationS);
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
    if (isPlayableWeaponId(id) && typeof damage === 'number' && Number.isFinite(damage) && damage > 0) {
      LIFETIME.damageByWeapon[id] = (LIFETIME.damageByWeapon[id] ?? 0) + damage;
    }
  }
  for (const [id, level] of Object.entries(record.weaponLevels)) {
    if (isPlayableWeaponId(id) && Number.isInteger(level) && level > 0) {
      LIFETIME.weaponMaxLevel[id] = Math.max(LIFETIME.weaponMaxLevel[id] ?? 0, level);
    }
  }
}

/** Replays history oldest-first so "best" values land in a sensible order. */
function backfillLifetime(history: RunRecordV1[]): void {
  for (const record of [...history].reverse()) recordRunInLifetime(record);
  if (history.length > 0) saveProfile();
}

/** Writes the current PROFILE. Call after any progression change.
 * Returns whether the canonical persistence seam confirmed the write, so a
 * downstream achievement can never outrun the career fact that earned it. */
export function saveProfile(): boolean {
  const save: ProfileSave = {
    version: VERSION,
    unlockedCharacters: [...PROFILE.unlockedCharacters],
    weaponSockets: PROFILE.weaponSockets,
    coreSockets: PROFILE.coreSockets,
    levelupDiscards: PROFILE.levelupDiscards,
    unlockedWeapons: [...PROFILE.unlockedWeapons],
    unlockedCores: [...PROFILE.unlockedCores],
    unlockedMods: [...PROFILE.unlockedMods],
    lifetime: LIFETIME,
  };
  const raw = JSON.stringify(save, null, 2);
  if (window.electronAPI) {
    const saved = window.electronAPI.saveProfile(raw);
    // Keep the legacy browser copy current for migration/debugging, but it is
    // not authoritative while Electron has a native profile file.
    try {
      window.localStorage.setItem(STORAGE_KEY, raw);
    } catch {
      // Native persistence already decided the truthful result.
    }
    return saved;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, raw);
    return true;
  } catch {
    return false;
  }
}

/** Wipes stored progress and restores the fresh-profile state. */
export function resetProfile(): void {
  normalizeCharacterUnlocks(undefined);
  PROFILE.weaponSockets = DEFAULTS.weaponSockets;
  PROFILE.coreSockets = DEFAULTS.coreSockets;
  PROFILE.levelupDiscards = DEFAULTS.levelupDiscards;
  PROFILE.unlockedWeapons = [...DEFAULTS.unlockedWeapons] as WeaponId[];
  PROFILE.unlockedCores = [...DEFAULTS.unlockedCores];
  PROFILE.unlockedMods = [...DEFAULTS.unlockedMods] as ModId[];
  Object.assign(LIFETIME, emptyLifetime());
  // Run history too, or the boot-time backfill rebuilds the ledger from the
  // surviving records and every "reset" total is back on the next launch.
  clearRunHistory();
  refreshUnlockedMods();
  saveProfile();
}

function applyProfile(value: Partial<ProfileSave>): boolean {
  normalizeCharacterUnlocks(value.unlockedCharacters);
  const completedContracts = contractIds(value.lifetime?.completedContracts);
  PROFILE.weaponSockets = normalizeSocketCount(
    value.weaponSockets,
    DEFAULTS.weaponSockets,
    PROFILE.maxWeaponSockets,
    completedContracts,
    'weapon',
  );
  PROFILE.coreSockets = normalizeSocketCount(
    value.coreSockets,
    DEFAULTS.coreSockets,
    PROFILE.maxCoreSockets,
    completedContracts,
    'core',
  );
  const discardReward = PROFILE_CAPACITY_CONTRACT_REWARDS.extraLevelupDiscard;
  const earnedDiscardFloor = completedContracts.includes(discardReward.contractId)
    ? Math.min(PROFILE.maxLevelupDiscards, DEFAULTS.levelupDiscards + discardReward.amount)
    : DEFAULTS.levelupDiscards;
  PROFILE.levelupDiscards = clampSockets(
    value.levelupDiscards,
    earnedDiscardFloor,
    PROFILE.maxLevelupDiscards,
  );
  PROFILE.unlockedWeapons = mergeUnlocks(DEFAULTS.unlockedWeapons, value.unlockedWeapons, VALID_WEAPONS) as WeaponId[];
  PROFILE.unlockedCores = mergeUnlocks(DEFAULTS.unlockedCores, value.unlockedCores, VALID_CORES);
  PROFILE.unlockedMods = mergeUnlocks(DEFAULTS.unlockedMods, value.unlockedMods, VALID_MODS) as ModId[];
  return applyLifetime(value.lifetime);
}

/** Load, migration and reset all preserve the live array identity held by
 * character-gating consumers. Unknown ids are filtered by the registry. */
export function normalizeCharacterUnlocks(saved: unknown): void {
  const normalized = mergeUnlocks(
    DEFAULTS.unlockedCharacters,
    saved,
    VALID_CHARACTERS,
  );
  PROFILE.unlockedCharacters.splice(0, PROFILE.unlockedCharacters.length, ...normalized);
}

/** Field-by-field so a truncated or hand-edited ledger degrades to zeros
 *  instead of poisoning contract progress with NaN. */
function applyLifetime(saved: LifetimeStats | undefined): boolean {
  const fresh = emptyLifetime();
  if (!saved || typeof saved !== 'object') { Object.assign(LIFETIME, fresh); return false; }
  const hasInterimDistinctModsKey = Object.prototype.hasOwnProperty.call(
    saved,
    'bestDistinctModsHeld',
  );
  const hasLegacyMinimalSectorsKey = Object.prototype.hasOwnProperty.call(
    saved,
    'bestMinimalSectors',
  );
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
  const weaponMaxLevel = sanitizeWeaponMaxLevel(saved.weaponMaxLevel);
  const damageByWeapon = sanitizeDamageByWeapon(saved.damageByWeapon);
  const bestDistinctCoresHeld = normalizeBestDistinctCoresHeld(saved.bestDistinctCoresHeld);
  const bestDistinctPermanentModsHeld = normalizeBestDistinctPermanentModsHeld(
    saved.bestDistinctPermanentModsHeld,
  );
  const bestPuristSectors = normalizeBestPuristSectors(saved.bestPuristSectors);
  const bestFlawlessRunS = normalizeBestFlawlessRunS(saved.bestFlawlessRunS);
  const bestKillsInRun = normalizeBestKillsInRun(saved.bestKillsInRun);
  Object.assign(LIFETIME, {
    runsFinished: num(saved.runsFinished),
    runsSurvived: num(saved.runsSurvived),
    runsCompleted: num(saved.runsCompleted),
    totalSectorsCleared: num(saved.totalSectorsCleared),
    bestSectorsCleared: num(saved.bestSectorsCleared),
    maxMapsReached: num(saved.maxMapsReached),
    totalKills: num(saved.totalKills),
    totalPlayS: num(saved.totalPlayS),
    bestKillsInRun: bestKillsInRun.value,
    bestLevel: num(saved.bestLevel),
    bestDurationS: num(saved.bestDurationS),
    bossesDefeated: num(saved.bossesDefeated),
    bossTypesDefeated: Array.isArray(saved.bossTypesDefeated)
      ? saved.bossTypesDefeated.filter((k): k is string => typeof k === 'string')
      : [],
    damageTaken: num(saved.damageTaken),
    goldEarned: num(saved.goldEarned),
    shopPurchases: num(saved.shopPurchases),
    bestModsHeld: num(saved.bestModsHeld),
    bestDistinctCoresHeld: bestDistinctCoresHeld.value,
    bestDistinctPermanentModsHeld: bestDistinctPermanentModsHeld.value,
    bestGoldEarnedInRun: num(saved.bestGoldEarnedInRun),
    bestMinimalRunS: num(saved.bestMinimalRunS),
    bestPuristSectors: bestPuristSectors.value,
    bestFlawlessRunS: bestFlawlessRunS.value,
    completedCharacterIds: Array.isArray(saved.completedCharacterIds)
      ? [...new Set(saved.completedCharacterIds.filter((id): id is string => isCharacterId(id)))]
      : [],
    completedContracts: contractIds(saved.completedContracts),
    grantedRewards: rewardMap(saved.grantedRewards),
    damageByWeapon: damageByWeapon.value,
    runsByStartingWeapon: map(saved.runsByStartingWeapon),
    weaponMaxLevel: weaponMaxLevel.value,
    chestsByTier: map(saved.chestsByTier),
    countedRunIds: Array.isArray(saved.countedRunIds)
      ? saved.countedRunIds.filter((id): id is string => typeof id === 'string')
      : [],
  } satisfies LifetimeStats);
  // v2 ledgers already counted their run ids, so the normal idempotent backfill
  // cannot populate the structural v3 fields. Derive only the new fields from
  // surviving history; never replay kills/currency or revoke granted rewards.
  if (saved.totalSectorsCleared === undefined) {
    const history = loadRunHistory();
    LIFETIME.runsCompleted = history.filter(isRunComplete).length;
    LIFETIME.totalSectorsCleared = history.reduce((sum, record) => sum + sectorsClearedOf(record), 0);
    LIFETIME.bestSectorsCleared = history.reduce(
      (best, record) => Math.max(best, sectorsClearedOf(record)),
      0,
    );
    LIFETIME.maxMapsReached = history.reduce(
      (best, record) => Math.max(best, mapsReachedOf(record)),
      0,
    );
  }
  // Legacy ledgers predate the monotonic character-completion union. A
  // one-time best-effort migration can recover surviving records; after this
  // save, capped history is never used as the ongoing source of truth.
  if (saved.completedCharacterIds === undefined) {
    for (const record of loadRunHistory()) {
      if (
        isRunComplete(record) &&
        isCharacterId(record.characterId) &&
        !LIFETIME.completedCharacterIds.includes(record.characterId)
      ) {
        LIFETIME.completedCharacterIds.push(record.characterId);
      }
    }
  }
  if (bestDistinctCoresHeld.needsBackfill) {
    LIFETIME.bestDistinctCoresHeld = loadRunHistory().reduce(
      (best, record) => Math.max(best, distinctValidCoresHeld(record.coreLevels)),
      0,
    );
  }
  if (bestDistinctPermanentModsHeld.needsBackfill) {
    LIFETIME.bestDistinctPermanentModsHeld = loadRunHistory().reduce(
      (best, record) => Math.max(best, distinctValidPermanentModsHeld(record.modCounts)),
      0,
    );
  }
  if (bestPuristSectors.needsBackfill) {
    LIFETIME.bestPuristSectors = loadRunHistory().reduce(
      (best, record) => Math.max(best, puristSectorsOf(record)),
      0,
    );
  }
  if (bestFlawlessRunS.needsBackfill) {
    LIFETIME.bestFlawlessRunS = loadRunHistory().reduce(
      (best, record) => Math.max(best, flawlessDurationOf(record)),
      0,
    );
  }
  if (bestKillsInRun.needsBackfill) {
    LIFETIME.bestKillsInRun = loadRunHistory().reduce(
      (best, record) => Math.max(best, terminalKillCountOf(record)),
      0,
    );
  }
  return weaponMaxLevel.changed
    || damageByWeapon.changed
    || bestDistinctCoresHeld.changed
    || bestDistinctPermanentModsHeld.changed
    || bestPuristSectors.changed
    || bestFlawlessRunS.changed
    || bestKillsInRun.changed
    || hasInterimDistinctModsKey
    || hasLegacyMinimalSectorsKey;
}

function isTerminalRunOutcome(value: unknown): boolean {
  return value === 'defeat' || value === 'sector-cleared' || value === 'run-complete';
}

function distinctValidCoresHeld(value: unknown): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
  const count = Object.entries(value as Record<string, unknown>).filter(([id, level]) =>
    isCoreId(id)
    && typeof level === 'number'
    && Number.isFinite(level)
    && Number.isInteger(level)
    && level > 0).length;
  return count <= PROFILE_CAPACITY.coreSockets ? count : 0;
}

function normalizeBestDistinctCoresHeld(value: unknown): {
  value: number;
  changed: boolean;
  needsBackfill: boolean;
} {
  if (
    typeof value === 'number'
    && Number.isFinite(value)
    && Number.isInteger(value)
    && value >= 0
    && value <= PROFILE_CAPACITY.coreSockets
  ) {
    return { value, changed: false, needsBackfill: false };
  }
  return { value: 0, changed: true, needsBackfill: true };
}

function distinctValidPermanentModsHeld(value: unknown): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
  return Object.entries(value as Record<string, unknown>).filter(([id, count]) =>
    isPermanentModId(id)
    && typeof count === 'number'
    && Number.isFinite(count)
    && Number.isInteger(count)
    && count > 0).length;
}

function normalizeBestDistinctPermanentModsHeld(value: unknown): {
  value: number;
  changed: boolean;
  needsBackfill: boolean;
} {
  if (
    typeof value === 'number'
    && Number.isFinite(value)
    && Number.isInteger(value)
    && value >= 0
    && value <= PERMANENT_MOD_IDS.length
  ) {
    return { value, changed: false, needsBackfill: false };
  }
  return { value: 0, changed: true, needsBackfill: true };
}

function puristSectorsOf(record: RunRecordV1): number {
  if (!isTerminalRunOutcome(record.outcome) || !isRunComplete(record)) return 0;
  if (!hasExactlyOneTrustworthyPlayableWeapon(record.weaponLevels)) return 0;
  if (!hasTrustworthyNoPermanentMods(record.modCounts)) return 0;
  const sectors = sectorsClearedOf(record);
  return sectors >= CONTRACTS.puristSectors
    ? CONTRACTS.puristSectors
    : 0;
}

function hasExactlyOneTrustworthyPlayableWeapon(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  let carried = 0;
  for (const [id, level] of Object.entries(value as Record<string, unknown>)) {
    if (
      !Object.prototype.hasOwnProperty.call(WEAPON_INFO, id)
      || typeof level !== 'number'
      || !Number.isFinite(level)
      || !Number.isInteger(level)
      || level < 0
    ) return false;
    if (level === 0) continue;
    if (!isPlayableWeaponId(id)) return false;
    carried += 1;
  }
  return carried === 1;
}

function hasTrustworthyNoPermanentMods(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  for (const [id, count] of Object.entries(value as Record<string, unknown>)) {
    if (
      !isModId(id)
      || typeof count !== 'number'
      || !Number.isFinite(count)
      || !Number.isInteger(count)
      || count < 0
    ) return false;
    if (isPermanentModId(id) && count > 0) return false;
  }
  return true;
}

function normalizeBestPuristSectors(value: unknown): {
  value: number;
  changed: boolean;
  needsBackfill: boolean;
} {
  if (
    typeof value === 'number'
    && Number.isFinite(value)
    && Number.isInteger(value)
    && (value === 0 || value === CONTRACTS.puristSectors)
  ) {
    return { value, changed: false, needsBackfill: false };
  }
  return { value: 0, changed: true, needsBackfill: true };
}

function flawlessDurationOf(record: RunRecordV1): number {
  if (!isTerminalRunOutcome(record.outcome) || record.damageTaken !== 0) return 0;
  return typeof record.durationS === 'number'
    && Number.isFinite(record.durationS)
    && record.durationS >= 0
    ? record.durationS
    : 0;
}

function normalizeBestFlawlessRunS(value: unknown): {
  value: number;
  changed: boolean;
  needsBackfill: boolean;
} {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return { value, changed: false, needsBackfill: false };
  }
  return { value: 0, changed: true, needsBackfill: true };
}

function terminalKillCountOf(record: RunRecordV1): number {
  if (!isTerminalRunOutcome(record.outcome)) return 0;
  return typeof record.kills === 'number'
    && Number.isFinite(record.kills)
    && Number.isInteger(record.kills)
    && record.kills >= 0
    ? record.kills
    : 0;
}

function normalizeBestKillsInRun(value: unknown): {
  value: number;
  changed: boolean;
  needsBackfill: boolean;
} {
  if (
    typeof value === 'number'
    && Number.isFinite(value)
    && Number.isInteger(value)
    && value >= 0
  ) {
    return { value, changed: false, needsBackfill: false };
  }
  return { value: 0, changed: true, needsBackfill: true };
}

function sanitizeWeaponMaxLevel(value: unknown): {
  value: Record<string, number>;
  changed: boolean;
} {
  const sanitized: Record<string, number> = {};
  if (value === undefined) return { value: sanitized, changed: false };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { value: sanitized, changed: true };
  }
  let changed = false;
  for (const [id, level] of Object.entries(value as Record<string, unknown>)) {
    if (isPlayableWeaponId(id) && typeof level === 'number' && Number.isInteger(level) && level > 0) {
      sanitized[id] = level;
    } else {
      changed = true;
    }
  }
  return { value: sanitized, changed };
}

function sanitizeDamageByWeapon(value: unknown): {
  value: Record<string, number>;
  changed: boolean;
} {
  const sanitized: Record<string, number> = {};
  if (value === undefined) return { value: sanitized, changed: false };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { value: sanitized, changed: true };
  }
  let changed = false;
  for (const [id, damage] of Object.entries(value as Record<string, unknown>)) {
    if (
      isPlayableWeaponId(id)
      && typeof damage === 'number'
      && Number.isFinite(damage)
      && damage >= 0
    ) {
      sanitized[id] = damage;
    } else {
      changed = true;
    }
  }
  return { value: sanitized, changed };
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
        out[id] = canonicalSocketReward(id, reward as Reward);
      }
    }
  }
  return out;
}

function clampSockets(value: unknown, fallback: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < fallback || value > max) return fallback;
  return value;
}

/** Migrates the raised fresh-profile floor without making existing Boss Hunter
 * winners re-earn its socket. Old saves recorded slot 2; under the new 2 -> 3
 * progression that same completed contract must imply slot 3. */
export function normalizeWeaponSockets(
  saved: unknown,
  defaultSockets: number,
  maxSockets: number,
  bossHunterCompleted: boolean,
): number {
  const earnedFloor = Math.min(maxSockets, defaultSockets + (bossHunterCompleted ? 1 : 0));
  return clampSockets(saved, earnedFloor, maxSockets);
}

function contractIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}

/** Completed ids are durable proof of socket ownership. The saved counter can
 * be stale, but it may never lower a contract reward already paid. */
function normalizeSocketCount(
  saved: unknown,
  defaultSockets: number,
  maxSockets: number,
  completedContracts: readonly string[],
  slot: SocketSlot,
): number {
  const floor = completedSocketFloor(completedContracts, slot) ?? defaultSockets;
  return clampSockets(saved, Math.min(maxSockets, Math.max(defaultSockets, floor)), maxSockets);
}
