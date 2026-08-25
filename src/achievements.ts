import { LIFETIME, type LifetimeStats } from './profile';
import { ACHIEVEMENTS } from './config';

type AchievementLifetime = Pick<
  LifetimeStats,
  'runsFinished' | 'chestsByTier' | 'bestLevel' | 'bossesDefeated' | 'maxMapsReached'
>;

export const ACHIEVEMENT_REGISTRY = [
  {
    id: 'ach_first_shift',
    steamApiName: 'ACH_FIRST_SHIFT',
    displayName: 'First Shift',
    steamDescription: 'Finish your first recorded run. Victories and defeats both count.',
    hidden: false,
    isComplete: (lifetime: AchievementLifetime): boolean =>
      lifetime.runsFinished >= ACHIEVEMENTS.firstShift.minimumRunsFinished,
  },
  {
    id: 'ach_cache_opened',
    steamApiName: 'ACH_CACHE_OPENED',
    displayName: 'Crack the Cache',
    steamDescription: 'Open your first paid chest.',
    hidden: false,
    isComplete: (lifetime: AchievementLifetime): boolean =>
      sumPositive(lifetime.chestsByTier) >= ACHIEVEMENTS.cacheOpened.minimumPaidChests,
  },
  {
    id: 'ach_systems_online',
    steamApiName: 'ACH_SYSTEMS_ONLINE',
    displayName: 'Systems Online',
    steamDescription: 'Reach level 10 in a single run.',
    hidden: false,
    isComplete: (lifetime: AchievementLifetime): boolean =>
      Number.isFinite(lifetime.bestLevel)
      && lifetime.bestLevel >= ACHIEVEMENTS.systemsOnline.minimumLevel,
  },
  {
    id: 'ach_first_boss_down',
    steamApiName: 'ACH_FIRST_BOSS_DOWN',
    displayName: 'Bigger They Fall',
    steamDescription: 'Defeat your first boss.',
    hidden: false,
    isComplete: (lifetime: AchievementLifetime): boolean =>
      Number.isFinite(lifetime.bossesDefeated)
      && lifetime.bossesDefeated >= ACHIEVEMENTS.firstBossDown.minimumBossesDefeated,
  },
  {
    id: 'ach_foundry_bound',
    steamApiName: 'ACH_FOUNDRY_BOUND',
    displayName: 'Foundry Bound',
    steamDescription: 'Clear Scrapyard and enter Swarm Foundry.',
    hidden: false,
    isComplete: (lifetime: AchievementLifetime): boolean =>
      Number.isFinite(lifetime.maxMapsReached)
      && lifetime.maxMapsReached >= ACHIEVEMENTS.foundryBound.minimumMapsReached,
  },
] as const;

export type AchievementRequestResult = {
  ok: boolean;
  status: 'unlocked' | 'queued' | 'already-unlocked' | 'rejected' | 'failed';
  name: string;
  error?: string;
};

export interface AchievementTransport {
  requestUnlock(name: string): AchievementRequestResult;
}

/** Evaluates monotonic career facts. Safe at boot for retroactive awards and
 * after every recorded run; the native outbox owns durable deduplication. */
export function evaluateAchievements(
  lifetime: AchievementLifetime = LIFETIME,
  transport: AchievementTransport | undefined = window.electronAPI?.steam,
): AchievementRequestResult[] {
  if (!transport) return [];
  const results: AchievementRequestResult[] = [];
  for (const achievement of ACHIEVEMENT_REGISTRY) {
    if (achievement.isComplete(lifetime)) results.push(transport.requestUnlock(achievement.steamApiName));
  }
  return results;
}

/** End-of-run durability gate. Startup evaluation intentionally bypasses this
 * helper because its ledger was already loaded from durable storage. */
export function evaluateAchievementsAfterProfileSave(
  profileSaved: boolean,
  lifetime: AchievementLifetime = LIFETIME,
  transport: AchievementTransport | undefined = window.electronAPI?.steam,
): AchievementRequestResult[] {
  return profileSaved ? evaluateAchievements(lifetime, transport) : [];
}

function sumPositive(values: Record<string, number>): number {
  return Object.values(values).reduce(
    (total, value) => total + (Number.isFinite(value) && value > 0 ? value : 0),
    0,
  );
}
