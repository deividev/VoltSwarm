import { readSaveOrQuarantine, writeFileAtomic } from './safe-save';

export const STEAM_ACHIEVEMENT_NAMES = [
  'ACH_FIRST_SHIFT',
  'ACH_CACHE_OPENED',
  'ACH_SYSTEMS_ONLINE',
  'ACH_FIRST_BOSS_DOWN',
  'ACH_FOUNDRY_BOUND',
  'ACH_SCRAPYARD_COMMAND',
  'ACH_HAZARD_CONTAINED',
  'ACH_FULL_CIRCUIT',
  'ACH_FIELD_ENGINEER_CLEAR',
  'ACH_RACK_HAULER_CLEAR',
  'ACH_OVERCLOCKER_CLEAR',
  'ACH_FIRST_CONTRACT',
  'ACH_FULL_CAPACITY',
  'ACH_WEAPON_LEVEL_20',
  'ACH_WEAPON_MASTERY',
] as const;
export type SteamAchievementName = typeof STEAM_ACHIEVEMENT_NAMES[number];

const ALLOWED_ACHIEVEMENTS = new Set<string>(STEAM_ACHIEVEMENT_NAMES);
const STATE_VERSION = 1;

export type AchievementSyncStatus =
  | 'unlocked'
  | 'queued'
  | 'already-unlocked'
  | 'rejected'
  | 'failed';

export interface AchievementSyncResult {
  ok: boolean;
  status: AchievementSyncStatus;
  name: string;
  error?: string;
}

export interface SteamAchievementClient {
  achievement: {
    isActivated(name: string): boolean;
    activate(name: string): boolean;
  };
}

interface AchievementSyncState {
  version: number;
  pending: string[];
  unlocked: string[];
}

type ReadState = (file: string) => string | null;
type WriteState = (file: string, data: string) => void;

/** Crash-safe, profile-independent Steam achievement outbox.
 *
 * A request is persisted before Steam is touched. If the process dies after
 * Steam accepts activate() but before the local completion save, the next
 * flush observes isActivated() and completes locally without activating twice.
 */
export class AchievementOutbox {
  private state: AchievementSyncState;

  constructor(
    private readonly file: string,
    private readonly readState: ReadState = readSaveOrQuarantine,
    private readonly writeState: WriteState = writeFileAtomic,
  ) {
    this.state = this.load();
  }

  request(name: string): AchievementSyncResult {
    if (!ALLOWED_ACHIEVEMENTS.has(name)) return result(false, 'rejected', name, 'Unknown achievement API name.');
    if (this.state.unlocked.includes(name)) return result(true, 'already-unlocked', name);
    if (this.state.pending.includes(name)) return result(true, 'queued', name);

    const next = { ...this.state, pending: [...this.state.pending, name] };
    try {
      this.persist(next);
      this.state = next;
      return result(true, 'queued', name);
    } catch (error) {
      return result(false, 'failed', name, messageOf(error));
    }
  }

  requestAndFlush(name: string, client: SteamAchievementClient | null): AchievementSyncResult {
    const requested = this.request(name);
    if (requested.status === 'rejected' || requested.status === 'failed' || requested.status === 'already-unlocked') {
      return requested;
    }
    if (!client) return requested;
    return this.flushOne(name, client);
  }

  flush(client: SteamAchievementClient | null): AchievementSyncResult[] {
    if (!client) return this.state.pending.map((name) => result(true, 'queued', name));
    return [...this.state.pending].map((name) => this.flushOne(name, client));
  }

  snapshot(): Readonly<AchievementSyncState> {
    return {
      version: this.state.version,
      pending: [...this.state.pending],
      unlocked: [...this.state.unlocked],
    };
  }

  private flushOne(name: string, client: SteamAchievementClient): AchievementSyncResult {
    if (this.state.unlocked.includes(name)) return result(true, 'already-unlocked', name);
    if (!this.state.pending.includes(name)) return result(false, 'failed', name, 'Achievement is not queued.');

    try {
      if (client.achievement.isActivated(name)) return this.complete(name);
    } catch (error) {
      return result(true, 'queued', name, messageOf(error));
    }

    try {
      if (!client.achievement.activate(name)) {
        return result(true, 'queued', name, 'Steam did not accept the achievement activation.');
      }
    } catch (error) {
      return result(true, 'queued', name, messageOf(error));
    }

    return this.complete(name);
  }

  private complete(name: string): AchievementSyncResult {
    const next: AchievementSyncState = {
      version: STATE_VERSION,
      pending: this.state.pending.filter((entry) => entry !== name),
      unlocked: this.state.unlocked.includes(name) ? this.state.unlocked : [...this.state.unlocked, name],
    };
    try {
      this.persist(next);
      this.state = next;
      return result(true, 'unlocked', name);
    } catch (error) {
      // Keep the in-memory state pending as well. A later retry checks Steam
      // first, repairs the local file, and never calls activate() again.
      return result(true, 'queued', name, messageOf(error));
    }
  }

  private load(): AchievementSyncState {
    const raw = this.readState(this.file);
    if (!raw) return emptyState();
    try {
      const value = JSON.parse(raw) as Partial<AchievementSyncState>;
      const unlocked = allowedNames(value.unlocked);
      return {
        version: STATE_VERSION,
        unlocked,
        pending: allowedNames(value.pending).filter((name) => !unlocked.includes(name)),
      };
    } catch {
      return emptyState();
    }
  }

  private persist(state: AchievementSyncState): void {
    this.writeState(this.file, JSON.stringify(state, null, 2));
  }
}

export function resolveSteamAppId(packaged: boolean, environmentValue: string | undefined): number | null {
  if (packaged) return 4979220;
  if (!environmentValue || !/^\d+$/.test(environmentValue)) return null;
  const appId = Number(environmentValue);
  return Number.isSafeInteger(appId) && appId > 0 ? appId : null;
}

function emptyState(): AchievementSyncState {
  return { version: STATE_VERSION, pending: [], unlocked: [] };
}

function allowedNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((name): name is string => typeof name === 'string' && ALLOWED_ACHIEVEMENTS.has(name)))];
}

function result(
  ok: boolean,
  status: AchievementSyncStatus,
  name: string,
  error?: string,
): AchievementSyncResult {
  return error ? { ok, status, name, error } : { ok, status, name };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
