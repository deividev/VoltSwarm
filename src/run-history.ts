import type { WeaponId } from './config';
import type { ModCounts } from './mods';
import type { CoreLevels, WeaponBranchLevels, WeaponLevels, WeaponPower } from './upgrades';

export type RunOutcome = 'defeat' | 'sector-cleared' | 'run-complete';

export const RUN_OUTCOME_TITLES: Record<RunOutcome, string> = {
  defeat: 'System Overload',
  'sector-cleared': 'Sector Cleared',
  'run-complete': 'Run Complete',
};

export interface RunMapRef {
  id: string;
  number: number;
  title: string;
}

export interface RunSnapshot {
  /** Created when the run world is built and reused by local history and
   *  packaged-playtest telemetry. */
  id: string;
  outcome: RunOutcome;
  map: RunMapRef;
  /** Weapon the run was drafted with. Optional so records written before this
   *  field existed stay valid; contracts treat its absence as unknown. */
  startingWeapon?: WeaponId;
  /** Difficulty the run was played on. Recorded BEFORE a difficulty selector
   *  exists on purpose: a run that already happened can never be re-labelled,
   *  and a leaderboard that mixes difficulties ranks nothing. Absent means
   *  "recorded before difficulties existed", which is not the same as normal. */
  difficulty?: string;
  /** Character played. Same impossible-to-backfill argument as difficulty. */
  characterId?: string;
  durationS: number;
  /** Per-run counters that contract objectives ask about. Optional because
   *  older records predate them; absent reads as unknown, never as zero. */
  damageTaken?: number;
  goldEarned?: number;
  /** Boss KINDS defeated, by type name. bossesDefeated is only a count, and
   *  "defeat every kind of boss" cannot be answered from a count. */
  bossTypesDefeated?: string[];
  chestsByTier?: Record<string, number>;
  shopPurchases?: number;
  /** Pressure instrumentation (see config.PRESSURE_METRICS). Recorded from
   *  v0.7.0, BEFORE the density changes, so the frenzy work has a before/after
   *  to compare against — a run already played can never be re-measured.
   *  Absent means "recorded before this existed", which is not zero. */
  contactS?: number;
  /** Seconds with no free escape direction (enough angular sectors blocked). */
  enclosedS?: number;
  /** Seconds enclosed AND below the low-HP fraction — the crisis state. */
  enclosedLowHpS?: number;
  /** Most sectors ever blocked at once. Tells us HOW CLOSE the run got even
   *  when it never crossed the enclosure threshold. */
  peakEnclosedSectors?: number;
  /** Cursed Core stacked by the end of the run. This is the player VOLUNTARILY
   *  raising difficulty, so a leaderboard that ignores it ranks a +60% run
   *  against a +0% run as if they were the same game. Recorded from v0.8.0;
   *  like every other counter here it cannot be backfilled. */
  cursedFinal?: number;
  /** Time-weighted mean cursed over the run. The final value alone overstates
   *  a run where the card was picked at minute 8 — most of that run was played
   *  at +0%. This is the number a leaderboard should segment by. */
  cursedTimeAvg?: number;
  level: number;
  kills: number;
  bossesDefeated: number;
  weaponLevels: WeaponLevels;
  /** Aggregate branch snapshot retained for record compatibility; combat never reads it. */
  weaponPower: WeaponPower;
  /** Optional so records saved before weapon branches remain valid. */
  weaponBranches?: WeaponBranchLevels;
  weaponDamage: Readonly<Record<WeaponId, number>>;
  coreLevels: CoreLevels;
  modCounts: ModCounts;
}

/** Versioned raw run facts. Future leaderboards can derive their score without
 *  coupling today's save format to a leaderboard metric that may still change. */
export interface RunRecordV1 extends Omit<RunSnapshot, 'weaponPower'> {
  schemaVersion: 1;
  id: string;
  endedAt: string;
  buildVersion: string;
  totalDamage: number;
  /** Added after v1 shipped; absent in older records and treated as unknown. */
  weaponPower?: WeaponPower;
  /** Leaderboard ids this record was accepted by. Steam owns the ranking; this
   *  is only local bookkeeping so a run finished offline can be submitted later
   *  and never submitted twice. */
  submittedTo?: string[];
}

const STORAGE_KEY = 'voltswarm:run-history:v1';
/** Set once the legacy localStorage history has been moved into the file.
 *  Deliberately NOT cleared by a profile reset: it records that a migration
 *  already happened, which stays true no matter how often progress is wiped. */
const MIGRATED_KEY = 'voltswarm:run-history:migrated';
const MAX_STORED_RUNS = 250;

/** Records live in userData/run-history.json under Electron so balance passes
 *  can read real play data with ordinary tooling; localStorage stays as the
 *  browser fallback AND as the source for the one-time migration of runs
 *  recorded before the file existed. */
export function loadRunHistory(): RunRecordV1[] {
  const fromFile = parseHistory(window.electronAPI?.loadRunHistory());
  if (fromFile.length > 0) return fromFile;
  return parseHistory(window.localStorage.getItem(STORAGE_KEY));
}

/** Call once at boot. Copies any localStorage-era history into the file so
 *  playtest runs recorded before the file existed are not stranded in the
 *  Chromium LevelDB, where no external tool can reach them. Runs at startup
 *  rather than lazily, because otherwise the rescue would only happen if the
 *  player happened to finish another run.
 *
 *  NOTE: localStorage is per ORIGIN. Records written by a packaged build live
 *  under file://, so this only finds them when the app boots the same way the
 *  player runs it — a dev-server session sees its own separate store. */
export function migrateRunHistory(): void {
  if (!window.electronAPI) return;
  // ONE-SHOT, and the marker is what makes it so. Without it, an EMPTY history
  // file is indistinguishable from "never migrated", so every profile reset
  // re-imported the same legacy runs from localStorage and the career ledger
  // rebuilt itself from them — a reset that silently undid itself.
  if (window.localStorage.getItem(MIGRATED_KEY)) return;
  if (parseHistory(window.electronAPI.loadRunHistory()).length > 0) {
    window.localStorage.setItem(MIGRATED_KEY, '1');
    return;
  }
  const legacy = parseHistory(window.localStorage.getItem(STORAGE_KEY));
  if (legacy.length > 0) window.electronAPI.saveRunHistory(JSON.stringify(legacy, null, 2));
  window.localStorage.setItem(MIGRATED_KEY, '1');
  // The records now live in the file; leaving the old key around only gives a
  // future reset something to resurrect.
  window.localStorage.removeItem(STORAGE_KEY);
}

/** Wipes every stored run. Required by a profile reset: the career ledger is
 *  rebuilt from surviving history at boot, so clearing the profile alone would
 *  see all the "reset" progress reappear on the next launch. */
export function clearRunHistory(): void {
  writeHistory([]);
  // Under Electron the file is authoritative, so drop the mirror too — it is
  // only a browser fallback, and a stale copy is exactly what resurrects runs.
  if (window.electronAPI) {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* quota/storage disabled */ }
  }
}

function parseHistory(raw: string | null | undefined): RunRecordV1[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isRunRecordV1) : [];
  } catch {
    return [];
  }
}

function writeHistory(history: RunRecordV1[]): void {
  const raw = JSON.stringify(history, null, 2);
  window.electronAPI?.saveRunHistory(raw);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Quota exceeded in the browser fallback: the file write above still holds.
  }
}

export function saveRunRecord(snapshot: RunSnapshot): RunRecordV1 {
  const record: RunRecordV1 = {
    schemaVersion: 1,
    id: snapshot.id,
    endedAt: new Date().toISOString(),
    buildVersion: __APP_VERSION__,
    outcome: snapshot.outcome,
    map: { ...snapshot.map },
    ...(snapshot.startingWeapon ? { startingWeapon: snapshot.startingWeapon } : {}),
    ...(snapshot.difficulty ? { difficulty: snapshot.difficulty } : {}),
    ...(snapshot.characterId ? { characterId: snapshot.characterId } : {}),
    ...(snapshot.damageTaken !== undefined ? { damageTaken: round3(snapshot.damageTaken) } : {}),
    ...(snapshot.goldEarned !== undefined ? { goldEarned: Math.max(0, Math.floor(snapshot.goldEarned)) } : {}),
    ...(snapshot.bossTypesDefeated ? { bossTypesDefeated: [...snapshot.bossTypesDefeated] } : {}),
    ...(snapshot.chestsByTier ? { chestsByTier: { ...snapshot.chestsByTier } } : {}),
    ...(snapshot.shopPurchases !== undefined ? { shopPurchases: Math.max(0, Math.floor(snapshot.shopPurchases)) } : {}),
    // NOTE: this builder is an explicit whitelist, not a spread. A new optional
    // field on RunSnapshot is silently dropped unless it is copied here, and
    // typecheck cannot catch it because optional means "may be absent". Every
    // counter below was lost that way once.
    ...(snapshot.contactS !== undefined ? { contactS: round3(snapshot.contactS) } : {}),
    ...(snapshot.enclosedS !== undefined ? { enclosedS: round3(snapshot.enclosedS) } : {}),
    ...(snapshot.enclosedLowHpS !== undefined ? { enclosedLowHpS: round3(snapshot.enclosedLowHpS) } : {}),
    ...(snapshot.peakEnclosedSectors !== undefined
      ? { peakEnclosedSectors: Math.max(0, Math.floor(snapshot.peakEnclosedSectors)) }
      : {}),
    ...(snapshot.cursedFinal !== undefined ? { cursedFinal: round3(snapshot.cursedFinal) } : {}),
    ...(snapshot.cursedTimeAvg !== undefined ? { cursedTimeAvg: round3(snapshot.cursedTimeAvg) } : {}),
    durationS: Math.max(0, Math.round(snapshot.durationS * 1000) / 1000),
    level: Math.max(1, Math.floor(snapshot.level)),
    kills: Math.max(0, Math.floor(snapshot.kills)),
    bossesDefeated: Math.max(0, Math.floor(snapshot.bossesDefeated)),
    weaponLevels: { ...snapshot.weaponLevels },
    weaponPower: { ...snapshot.weaponPower },
    ...(snapshot.weaponBranches ? { weaponBranches: structuredClone(snapshot.weaponBranches) } : {}),
    weaponDamage: { ...snapshot.weaponDamage },
    coreLevels: { ...snapshot.coreLevels },
    modCounts: { ...snapshot.modCounts },
    totalDamage: Object.values(snapshot.weaponDamage).reduce(
      (total, damage) => total + Math.max(0, damage),
      0,
    ),
  };

  try {
    writeHistory([record, ...loadRunHistory()].slice(0, MAX_STORED_RUNS));
  } catch (error) {
    console.warn('Could not persist run history.', error);
  }
  return record;
}

function round3(value: number): number {
  return Math.max(0, Math.round(value * 1000) / 1000);
}

export function createRunId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isRunRecordV1(value: unknown): value is RunRecordV1 {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<RunRecordV1>;
  return (
    record.schemaVersion === 1 &&
    typeof record.id === 'string' &&
    typeof record.endedAt === 'string' &&
    typeof record.buildVersion === 'string' &&
    (record.outcome === 'defeat' ||
      record.outcome === 'sector-cleared' ||
      record.outcome === 'run-complete') &&
    !!record.map &&
    typeof record.map.id === 'string' &&
    typeof record.map.number === 'number' &&
    typeof record.map.title === 'string' &&
    typeof record.durationS === 'number' &&
    typeof record.level === 'number' &&
    typeof record.kills === 'number' &&
    typeof record.bossesDefeated === 'number' &&
    typeof record.totalDamage === 'number'
  );
}
