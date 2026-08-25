import { LIFETIME, type LifetimeStats } from './profile';
import {
  ACHIEVEMENTS,
  CONTRACTS,
  MAX_WEAPON_LEVEL,
  PROFILE,
  PROFILE_CAPACITY,
  isPlayableWeaponId,
} from './config';
import { isContractId } from './contracts';

type AchievementLifetime = Pick<
  LifetimeStats,
  | 'runsFinished'
  | 'chestsByTier'
  | 'bestLevel'
  | 'bossesDefeated'
  | 'maxMapsReached'
  | 'bossTypesDefeated'
  | 'runsCompleted'
  | 'completedCharacterIds'
  | 'completedContracts'
  | 'weaponMaxLevel'
  | 'damageByWeapon'
  | 'bestDistinctCoresHeld'
  | 'bestDistinctPermanentModsHeld'
  | 'bestPuristSectors'
  | 'bestFlawlessRunS'
  | 'bestKillsInRun'
>;

type AchievementProfile = Pick<typeof PROFILE, 'weaponSockets' | 'coreSockets' | 'levelupDiscards'>;

interface AchievementDefinition {
  id: string;
  steamApiName: string;
  displayName: string;
  steamDescription: string;
  hidden: boolean;
  isComplete(lifetime: AchievementLifetime, profile: AchievementProfile): boolean;
}

export const ACHIEVEMENT_REGISTRY: readonly AchievementDefinition[] = [
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
  {
    id: 'ach_scrapyard_command',
    steamApiName: 'ACH_SCRAPYARD_COMMAND',
    displayName: 'Scrapyard Command',
    steamDescription: 'Defeat both Crusher King and Tesla Titan across your career.',
    hidden: false,
    isComplete: (lifetime: AchievementLifetime): boolean =>
      Array.isArray(lifetime.bossTypesDefeated)
      && ACHIEVEMENTS.scrapyardCommand.requiredBossTypes.every(
        (bossType) => lifetime.bossTypesDefeated.includes(bossType),
      ),
  },
  {
    id: 'ach_hazard_contained',
    steamApiName: 'ACH_HAZARD_CONTAINED',
    displayName: 'Hazard Contained',
    steamDescription: 'Defeat the Hazard Marshal.',
    hidden: true,
    isComplete: (lifetime: AchievementLifetime): boolean =>
      Array.isArray(lifetime.bossTypesDefeated)
      && lifetime.bossTypesDefeated.includes(ACHIEVEMENTS.hazardContained.requiredBossType),
  },
  {
    id: 'ach_full_circuit',
    steamApiName: 'ACH_FULL_CIRCUIT',
    displayName: 'Full Circuit',
    steamDescription: 'Complete the full run by clearing both sectors in order.',
    hidden: true,
    isComplete: (lifetime: AchievementLifetime): boolean =>
      Number.isFinite(lifetime.runsCompleted)
      && lifetime.runsCompleted >= ACHIEVEMENTS.fullCircuit.minimumRunsCompleted,
  },
  {
    id: 'ach_field_engineer_clear',
    steamApiName: 'ACH_FIELD_ENGINEER_CLEAR',
    displayName: 'Field Tested',
    steamDescription: 'Complete the full run as Field Engineer.',
    hidden: false,
    isComplete: (lifetime: AchievementLifetime): boolean =>
      Array.isArray(lifetime.completedCharacterIds)
      && lifetime.completedCharacterIds.includes(ACHIEVEMENTS.fieldEngineerClear.requiredCharacterId),
  },
  {
    id: 'ach_rack_hauler_clear',
    steamApiName: 'ACH_RACK_HAULER_CLEAR',
    displayName: 'Fully Loaded',
    steamDescription: 'Complete the full run as Rack Hauler.',
    hidden: false,
    isComplete: (lifetime: AchievementLifetime): boolean =>
      Array.isArray(lifetime.completedCharacterIds)
      && lifetime.completedCharacterIds.includes(ACHIEVEMENTS.rackHaulerClear.requiredCharacterId),
  },
  {
    id: 'ach_overclocker_clear',
    steamApiName: 'ACH_OVERCLOCKER_CLEAR',
    displayName: 'Past Redline',
    steamDescription: 'Complete the full run as Overclocker.',
    hidden: false,
    isComplete: (lifetime: AchievementLifetime): boolean =>
      Array.isArray(lifetime.completedCharacterIds)
      && lifetime.completedCharacterIds.includes(ACHIEVEMENTS.overclockerClear.requiredCharacterId),
  },
  {
    id: 'ach_first_contract',
    steamApiName: 'ACH_FIRST_CONTRACT',
    displayName: 'Signed and Stamped',
    steamDescription: 'Complete your first Contract and receive its reward.',
    hidden: false,
    isComplete: (lifetime: AchievementLifetime): boolean =>
      Array.isArray(lifetime.completedContracts)
      && lifetime.completedContracts.filter(isContractId).length
        >= ACHIEVEMENTS.firstContract.minimumSettledContracts,
  },
  {
    id: 'ach_full_capacity',
    steamApiName: 'ACH_FULL_CAPACITY',
    displayName: 'No Empty Sockets',
    steamDescription: 'Unlock maximum Weapon and Core capacity, plus the extra level-up discard.',
    hidden: false,
    isComplete: (_lifetime: AchievementLifetime, profile: AchievementProfile): boolean =>
      Number.isFinite(profile.weaponSockets)
      && profile.weaponSockets === PROFILE_CAPACITY.weaponSockets
      && Number.isFinite(profile.coreSockets)
      && profile.coreSockets === PROFILE_CAPACITY.coreSockets
      && Number.isFinite(profile.levelupDiscards)
      && profile.levelupDiscards === PROFILE_CAPACITY.levelupDiscards,
  },
  {
    id: 'ach_weapon_level_20',
    steamApiName: 'ACH_WEAPON_LEVEL_20',
    displayName: 'Factory Specification',
    steamDescription: 'Raise any weapon to level 20 in a single run.',
    hidden: false,
    isComplete: (lifetime: AchievementLifetime): boolean =>
      hasPlayableWeaponAtReleaseCeiling(lifetime.weaponMaxLevel),
  },
  {
    id: 'ach_weapon_mastery',
    steamApiName: 'ACH_WEAPON_MASTERY',
    displayName: 'Proven Hardware',
    steamDescription: 'Deal 50,000 lifetime damage with a single weapon.',
    hidden: false,
    isComplete: (lifetime: AchievementLifetime): boolean =>
      hasPlayableWeaponDamageAtMastery(lifetime.damageByWeapon),
  },
  {
    id: 'ach_four_core_array',
    steamApiName: 'ACH_FOUR_CORE_ARRAY',
    displayName: 'Core Array',
    steamDescription: 'Finish a recorded run carrying four distinct Cores.',
    hidden: false,
    isComplete: (lifetime: AchievementLifetime): boolean =>
      Number.isInteger(lifetime.bestDistinctCoresHeld)
      && lifetime.bestDistinctCoresHeld === PROFILE_CAPACITY.coreSockets,
  },
  {
    id: 'ach_five_mod_rig',
    steamApiName: 'ACH_FIVE_MOD_RIG',
    displayName: 'Custom Rig',
    steamDescription: 'Finish a recorded run carrying five distinct Mods.',
    hidden: false,
    isComplete: (lifetime: AchievementLifetime): boolean =>
      Number.isInteger(lifetime.bestDistinctPermanentModsHeld)
      && lifetime.bestDistinctPermanentModsHeld >= ACHIEVEMENTS.fiveModRig.minimumDistinctMods,
  },
  {
    id: 'ach_purist',
    steamApiName: 'ACH_PURIST',
    displayName: 'Purist',
    steamDescription: 'Clear both sectors in one run with exactly one weapon and no Mods.',
    hidden: false,
    isComplete: (lifetime: AchievementLifetime): boolean =>
      Number.isInteger(lifetime.bestPuristSectors)
      && lifetime.bestPuristSectors === CONTRACTS.puristSectors,
  },
  {
    id: 'ach_untouchable',
    steamApiName: 'ACH_UNTOUCHABLE',
    displayName: 'Untouchable',
    steamDescription: 'Survive for five minutes in a single run without taking damage.',
    hidden: false,
    isComplete: (lifetime: AchievementLifetime): boolean =>
      typeof lifetime.bestFlawlessRunS === 'number'
      && Number.isFinite(lifetime.bestFlawlessRunS)
      && lifetime.bestFlawlessRunS >= CONTRACTS.flawlessSeconds,
  },
  {
    id: 'ach_overkill',
    steamApiName: 'ACH_OVERKILL',
    displayName: 'Overkill',
    steamDescription: 'Destroy 800 machines in a single run.',
    hidden: false,
    isComplete: (lifetime: AchievementLifetime): boolean =>
      Number.isInteger(lifetime.bestKillsInRun)
      && lifetime.bestKillsInRun >= CONTRACTS.overkillKillsInRun,
  },
];

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
  profile: AchievementProfile = PROFILE,
): AchievementRequestResult[] {
  if (!transport) return [];
  const results: AchievementRequestResult[] = [];
  for (const achievement of ACHIEVEMENT_REGISTRY) {
    if (achievement.isComplete(lifetime, profile)) results.push(transport.requestUnlock(achievement.steamApiName));
  }
  return results;
}

/** End-of-run durability gate. Startup evaluation intentionally bypasses this
 * helper because its ledger was already loaded from durable storage. */
export function evaluateAchievementsAfterProfileSave(
  profileSaved: boolean,
  lifetime: AchievementLifetime = LIFETIME,
  transport: AchievementTransport | undefined = window.electronAPI?.steam,
  profile: AchievementProfile = PROFILE,
): AchievementRequestResult[] {
  return profileSaved ? evaluateAchievements(lifetime, transport, profile) : [];
}

function sumPositive(values: Record<string, number>): number {
  return Object.values(values).reduce(
    (total, value) => total + (Number.isFinite(value) && value > 0 ? value : 0),
    0,
  );
}

function hasPlayableWeaponAtReleaseCeiling(values: unknown): boolean {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return false;
  return Object.entries(values).some(([id, level]) =>
    isPlayableWeaponId(id)
    && Number.isInteger(level)
    && (level as number) >= MAX_WEAPON_LEVEL);
}

function hasPlayableWeaponDamageAtMastery(values: unknown): boolean {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return false;
  return Object.entries(values).some(([id, damage]) =>
    isPlayableWeaponId(id)
    && typeof damage === 'number'
    && Number.isFinite(damage)
    && damage >= CONTRACTS.ladders.masteryDamage);
}
