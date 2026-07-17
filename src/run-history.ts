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
  outcome: RunOutcome;
  map: RunMapRef;
  durationS: number;
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
}

const STORAGE_KEY = 'voltswarm:run-history:v1';
const MAX_STORED_RUNS = 250;

export function loadRunHistory(): RunRecordV1[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isRunRecordV1) : [];
  } catch {
    return [];
  }
}

export function saveRunRecord(snapshot: RunSnapshot): RunRecordV1 {
  const record: RunRecordV1 = {
    schemaVersion: 1,
    id: createRunId(),
    endedAt: new Date().toISOString(),
    buildVersion: __APP_VERSION__,
    outcome: snapshot.outcome,
    map: { ...snapshot.map },
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
    const history = [record, ...loadRunHistory()].slice(0, MAX_STORED_RUNS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (error) {
    console.warn('Could not persist run history.', error);
  }
  return record;
}

function createRunId(): string {
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
