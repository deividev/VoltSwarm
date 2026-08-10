import { BOSS_TYPE_INDEXES, CONTRACTS, ENEMY_TYPES, PROFILE, WEAPON_INFO, type WeaponId } from './config';
import { CORE_TITLES } from './upgrades';
import { MOD_REGISTRY, refreshUnlockedMods, type ModId } from './mods';
import { LIFETIME, saveProfile, type LifetimeStats } from './profile';
import { CHARACTER_REGISTRY, grantCharacterId, type CharacterId } from './characters';

// Contracts: the only progression engine (there is no meta-currency in v1).
//
// The architecture separates PACE from CONTENT so that adding a weapon, core,
// mod or character never means authoring a contract:
//
//   - Signature contracts are hand-written and name their reward directly.
//     These are the ~10 moments a player remembers: sockets, characters, the
//     first boss, the mastery challenges.
//   - Ladder rungs are generated from a template and pay out "the next entry
//     from a queue". Adding content = appending to the queue; the rungs are
//     already waiting.
//
// Everything is evaluated ONCE, at the end of a run, against the LIFETIME
// ledger. That means a contract published later completes retroactively for a
// player who already met it, and there is a single place where rewards land.

export type Objective =
  | { type: 'lifetime-kills'; n: number }
  | { type: 'kills-in-run'; n: number }
  | { type: 'finish-runs'; n: number }
  | { type: 'complete-runs'; n: number }
  | { type: 'reach-level'; n: number }
  | { type: 'survive'; seconds: number }
  | { type: 'defeat-bosses'; n: number }
  /** Every listed boss TYPE, not an arbitrary number of distinct boss kinds. */
  | { type: 'defeat-boss-types'; requiredTypes: readonly string[] }
  /** Distinct boss KINDS, not a count of kills. */
  | { type: 'boss-kinds'; n: number }
  | { type: 'weapons-mastered'; n: number }
  | { type: 'distinct-starting-weapons'; n: number }
  | { type: 'minimal-run'; seconds: number }
  | { type: 'minimal-sectors'; n: number }
  | { type: 'flawless-run'; seconds: number };

export type Reward =
  | { kind: 'character'; id: CharacterId }
  | { kind: 'weapon'; id: WeaponId }
  | { kind: 'core'; id: string }
  | { kind: 'mod'; id: ModId }
  /** `index` is stamped when the socket is actually granted, so a settled
   *  contract can name the slot IT opened instead of the next one. */
  | { kind: 'socket'; slot: 'weapon' | 'core'; index?: number }
  | { kind: 'discards'; n: number }
  | { kind: 'next-weapon' }
  | { kind: 'next-core' }
  | { kind: 'next-mod' };

export interface Contract {
  id: string;
  title: string;
  description: string;
  objective: Objective;
  reward: Reward;
  /** Set when the contract depends on content that does not exist yet. Latent
   *  contracts are never evaluated and never shown — defining them now keeps
   *  the reward wiring honest without promising the player something absent. */
  latent?: string;
}

/** Ordered payout queues. The LADDERS decide WHEN a reward lands; these decide
 *  WHAT it is. Consumed in order, so the intended power curve holds no matter
 *  which ladder a player advances first.
 *
 *  Safe to reorder or extend at any time: what a player has been granted is
 *  recorded as unlocked IDS, never as a position in this list, so shuffling it
 *  can neither hand out a duplicate nor skip an entry. */
/** Oil Sprayer is deliberately ABSENT (user decision 2026-07-26): it deals no
 *  damage, so it is out of the unlock path until it is redesigned or dropped.
 *  Nothing else was removed — its WeaponId, WEAPON_INFO entry, icon, VFX and
 *  implementation all still exist, and the dev unlock panel can still grant it
 *  for testing. Putting it back is adding `'oil'` to this array; the Arsenal
 *  ladder already carries a spare rung waiting for it. */
export const WEAPON_QUEUE: WeaponId[] = ['welder', 'acid', 'turbine', 'dismantler'];

/** Split per category rather than one mixed queue: it lets the core drip and
 *  the mod drip be tuned independently, and it means a ladder rung always
 *  belongs to exactly one section of the Contracts screen. */
export const CORE_QUEUE: string[] = [
  'crit-chance', 'crit-damage', 'duration', 'evasion', 'thorns',
  'lifesteal', 'luck', 'projectile-count', 'chaos', 'cursed',
];

export const MOD_QUEUE: ModId[] = ['coolant-burst' as ModId, 'chain-relay' as ModId];

/** Boss type identifiers are persisted by name in LIFETIME.bossTypesDefeated. */
const MAP_1_BOSS_TYPE_IDS = [...new Set(BOSS_TYPE_INDEXES.map((index) => {
  const type = ENEMY_TYPES[index];
  if (!type) throw new Error(`Map 1 boss index ${index} is missing from ENEMY_TYPES.`);
  return type.name;
}))];

const SIGNATURE: Contract[] = [
  {
    id: 'first-blood', title: 'First Blood',
    description: 'Defeat your first boss.',
    objective: { type: 'defeat-bosses', n: CONTRACTS.firstBossKill },
    reward: { kind: 'weapon', id: 'ricochet' },
  },
  {
    id: 'second-wind', title: 'Second Wind',
    description: 'Survive a full run.',
    objective: { type: 'complete-runs', n: 1 },
    reward: { kind: 'socket', slot: 'core' },
  },
  {
    id: 'boss-hunter', title: 'Boss Hunter',
    description: 'Defeat every Map 1 boss.',
    objective: { type: 'defeat-boss-types', requiredTypes: MAP_1_BOSS_TYPE_IDS },
    reward: { kind: 'socket', slot: 'weapon' },
  },
  {
    id: 'full-loadout', title: 'Full Loadout',
    description: `Reach level ${CONTRACTS.fullLoadoutLevel} in a run.`,
    objective: { type: 'reach-level', n: CONTRACTS.fullLoadoutLevel },
    reward: { kind: 'socket', slot: 'core' },
  },
  {
    id: 'overkill', title: 'Overkill',
    description: `Score ${CONTRACTS.overkillKillsInRun} kills in a single run.`,
    objective: { type: 'kills-in-run', n: CONTRACTS.overkillKillsInRun },
    reward: { kind: 'mod', id: 'overload-trigger' as ModId },
  },
  {
    id: 'purist', title: 'Purist',
    description: 'Survive a full run with one weapon and no mods.',
    objective: { type: 'minimal-sectors', n: CONTRACTS.puristSectors },
    reward: { kind: 'mod', id: 'phase-chassis' as ModId },
  },
  {
    id: 'untouchable', title: 'Untouchable',
    description: 'Survive five minutes without taking damage.',
    objective: { type: 'flawless-run', seconds: CONTRACTS.flawlessSeconds },
    reward: { kind: 'discards', n: 1 },
  },
  {
    id: 'proving-ground', title: 'Proving Ground',
    description: `Finish runs with ${CONTRACTS.provingGroundWeapons} different starting weapons.`,
    objective: { type: 'distinct-starting-weapons', n: CONTRACTS.provingGroundWeapons },
    reward: { kind: 'next-core' },
    latent: 'Reward becomes the second character once characters exist.',
  },
  {
    id: 'foreman', title: 'Foreman',
    description: 'Defeat every kind of boss.',
    // Target read from the roster, so adding a boss raises the bar by itself.
    // It was hardcoded to 3 against a roster of 2, and as a defeat-bosses COUNT
    // — which would have meant "kill three bosses", not "kill each kind".
    objective: { type: 'boss-kinds', n: ENEMY_TYPES.filter((type) => type.isBoss).length },
    reward: { kind: 'mod', id: 'magnetron-heart' as ModId },
  },
  {
    id: 'two-of-a-kind', title: 'Two of a Kind',
    description: 'Survive a full run with two different characters.',
    objective: { type: 'complete-runs', n: 1 },
    reward: { kind: 'next-core' },
    latent: 'Characters are not implemented.',
  },
];

/** Rung numerals. Repeating 'I' produced "Arsenal IIII"; a table is enough for
 *  any ladder length worth showing, and falls back to digits beyond it. */
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** Builds a ladder: same objective type at rising thresholds, each rung paying
 *  the next queue entry. New content needs an appended queue entry, not a new
 *  contract — which is the whole point of the split. */
function ladder(
  prefix: string,
  title: string,
  thresholds: readonly number[],
  make: (n: number) => Objective,
  describe: (n: number) => string,
  reward: Reward,
): Contract[] {
  return thresholds.map((n, index) => ({
    id: `${prefix}-${index + 1}`,
    title: `${title} ${ROMAN[index] ?? String(index + 1)}`,
    description: describe(n),
    objective: make(n),
    reward,
  }));
}

const LADDERS: Contract[] = [
  ...ladder('arsenal', 'Arsenal', CONTRACTS.ladders.arsenal,
    (n) => ({ type: 'weapons-mastered', n }),
    (n) => `Master ${n} different weapon${n === 1 ? '' : 's'}.`,
    { kind: 'next-weapon' }),
  ...ladder('scrap-quota', 'Scrap Quota', CONTRACTS.ladders.scrapQuota,
    (n) => ({ type: 'lifetime-kills', n }),
    (n) => `Destroy ${n.toLocaleString('en-US')} machines.`,
    { kind: 'next-core' }),
  ...ladder('veteran', 'Veteran', CONTRACTS.ladders.veteran,
    (n) => ({ type: 'finish-runs', n }),
    (n) => `Finish ${n} runs.`,
    { kind: 'next-core' }),
  ...ladder('ascension', 'Ascension', CONTRACTS.ladders.ascension,
    (n) => ({ type: 'reach-level', n }),
    (n) => `Reach level ${n} in a run.`,
    { kind: 'next-core' }),
  ...ladder('endurance', 'Endurance', CONTRACTS.ladders.endurance,
    (n) => ({ type: 'survive', seconds: n }),
    (n) => `Survive ${Math.round(n / 60)} minutes in a run.`,
    { kind: 'next-mod' }),
];

export const ALL_CONTRACTS: Contract[] = [...SIGNATURE, ...LADDERS];

/** Contracts the player can actually see and earn right now. */
export const ACTIVE_CONTRACTS: Contract[] = ALL_CONTRACTS.filter((c) => !c.latent);

/** Current and target for an objective. One function serves both "is it done?"
 *  and the progress bar, so the two can never disagree. */
export function progressOf(objective: Objective, stats: LifetimeStats = LIFETIME): { current: number; target: number } {
  switch (objective.type) {
    case 'lifetime-kills': return { current: stats.totalKills, target: objective.n };
    case 'kills-in-run': return { current: stats.bestKillsInRun, target: objective.n };
    case 'finish-runs': return { current: stats.runsFinished, target: objective.n };
    case 'complete-runs': return { current: stats.runsCompleted, target: objective.n };
    case 'reach-level': return { current: stats.bestLevel, target: objective.n };
    case 'survive': return { current: stats.bestDurationS, target: objective.seconds };
    case 'defeat-bosses': return { current: stats.bossesDefeated, target: objective.n };
    case 'defeat-boss-types': {
      const defeatedTypes = new Set(stats.bossTypesDefeated);
      return {
        current: objective.requiredTypes.filter((type) => defeatedTypes.has(type)).length,
        target: objective.requiredTypes.length,
      };
    }
    case 'boss-kinds': return { current: stats.bossTypesDefeated.length, target: objective.n };
    case 'minimal-run': return { current: stats.bestMinimalRunS, target: objective.seconds };
    case 'minimal-sectors': return { current: stats.bestMinimalSectors, target: objective.n };
    case 'flawless-run': return { current: stats.bestFlawlessRunS, target: objective.seconds };
    case 'weapons-mastered':
      return {
        current: Object.values(stats.damageByWeapon).filter((d) => d >= CONTRACTS.ladders.masteryDamage).length,
        target: objective.n,
      };
    case 'distinct-starting-weapons':
      return { current: Object.keys(stats.runsByStartingWeapon).length, target: objective.n };
  }
}

export function isComplete(contract: Contract, stats: LifetimeStats = LIFETIME): boolean {
  const { current, target } = progressOf(contract.objective, stats);
  return current >= target;
}

export interface EarnedContract {
  contract: Contract;
  /** What was actually granted. A queue reward resolves to a concrete item
   *  here, so the results screen can name it. */
  granted: Reward | null;
  label: string;
}

/** Rebuilds grantedRewards for contracts settled before that record existed.
 *
 *  Queue rewards are consumed in order, so replaying the completed contracts in
 *  declaration order against the queues recovers what each one handed over.
 *  Only items the profile actually has are assigned, and each is used once.
 *
 *  Not exact if the dev unlock panel granted something the queue would also
 *  have given — it may attribute that item to a contract. Acceptable: without
 *  this the row shows no icon and reads "Claimed", which is strictly worse. */
export function backfillGrantedRewards(): void {
  const missing = ALL_CONTRACTS.filter(
    (contract) => LIFETIME.completedContracts.includes(contract.id) && !LIFETIME.grantedRewards[contract.id],
  );
  if (missing.length === 0) return;

  const used = new Set<string>();
  for (const reward of Object.values(LIFETIME.grantedRewards)) {
    if ('id' in reward) used.add(reward.id);
  }

  const takeFrom = <T extends string>(queue: readonly T[], owned: readonly T[]): T | undefined =>
    queue.find((id) => owned.includes(id) && !used.has(id));

  for (const contract of missing) {
    let resolved: Reward | null = null;
    switch (contract.reward.kind) {
      case 'next-weapon': {
        const id = takeFrom(WEAPON_QUEUE, PROFILE.unlockedWeapons);
        if (id) resolved = { kind: 'weapon', id };
        break;
      }
      case 'next-core': {
        const id = takeFrom(CORE_QUEUE, PROFILE.unlockedCores);
        if (id) resolved = { kind: 'core', id };
        break;
      }
      case 'next-mod': {
        const id = takeFrom(MOD_QUEUE, PROFILE.unlockedMods as ModId[]);
        if (id) resolved = { kind: 'mod', id };
        break;
      }
      default:
        // Signature contracts name their reward outright; nothing to recover.
        resolved = contract.reward;
    }
    if (!resolved) {
      // Settled but nothing recoverable: an older build marked a spare ladder
      // rung complete while its queue was already dry, so the player was paid
      // nothing. Un-settle it rather than leave a rewardless row on the screen
      // — it costs them nothing and the rung returns when content fills the
      // slot. Settling now declines this case up front.
      const at = LIFETIME.completedContracts.indexOf(contract.id);
      if (at !== -1) LIFETIME.completedContracts.splice(at, 1);
      continue;
    }
    if ('id' in resolved) used.add(resolved.id);
    LIFETIME.grantedRewards[contract.id] = resolved;
  }
  saveProfile();
}

/** DEV ONLY — settles every active contract regardless of progress.
 *
 *  Goes through the same grant() path as a real payout, so rewards land in
 *  PROFILE and grantedRewards is filled in: the Contracts screen then shows
 *  each row with the item it actually gave rather than a bare "Unlocked".
 *  A contract whose queue has run dry is declined here exactly as it would be
 *  in play, so this cannot invent content that does not exist.
 *
 *  Gated by DEV_TOOLS.unlockPanel at the call site; `npm run package` refuses
 *  to build while that flag is on. */
export function devCompleteAllContracts(): EarnedContract[] {
  const earned: EarnedContract[] = [];
  for (const contract of ACTIVE_CONTRACTS) {
    if (LIFETIME.completedContracts.includes(contract.id)) continue;
    const granted = grantReward(contract.reward);
    if (granted === null) continue;
    LIFETIME.completedContracts.push(contract.id);
    LIFETIME.grantedRewards[contract.id] = granted;
    earned.push({ contract, granted, label: describeReward(granted) });
  }
  refreshUnlockedMods();
  saveProfile();
  return earned;
}

/** Evaluates every active contract and pays out the newly completed ones.
 *  Call once per finished run, after the ledger has been updated. */
export function settleContracts(): EarnedContract[] {
  const earned: EarnedContract[] = [];
  for (const contract of ACTIVE_CONTRACTS) {
    if (LIFETIME.completedContracts.includes(contract.id)) continue;
    if (!isComplete(contract)) continue;
    const granted = grantReward(contract.reward);
    // A ladder deliberately carries more rungs than its queue has entries, so
    // new content lands in a slot that already exists. Until then the spare
    // rung stays PENDING rather than settling for nothing: marking it complete
    // would quietly spend the player's achievement on an empty reward.
    if (granted === null) continue;
    LIFETIME.completedContracts.push(contract.id);
    // Record WHAT was handed over: a ladder rung's declared reward is "the next
    // queue entry", which says nothing once it has been claimed.
    if (granted) LIFETIME.grantedRewards[contract.id] = granted;
    earned.push({ contract, granted, label: describeReward(granted) });
  }
  if (earned.length > 0) {
    refreshUnlockedMods();
    saveProfile();
  }
  return earned;
}

/** Applies a reward. Queue rewards resolve to the first entry the player does
 *  not already own, so a queue that has run dry simply pays nothing rather
 *  than handing out a duplicate. */
export function grantReward(reward: Reward): Reward | null {
  switch (reward.kind) {
    case 'next-weapon': {
      const id = WEAPON_QUEUE.find((w) => !PROFILE.unlockedWeapons.includes(w));
      return id ? grantReward({ kind: 'weapon', id }) : null;
    }
    case 'next-core': {
      const id = CORE_QUEUE.find((c) => !PROFILE.unlockedCores.includes(c));
      return id ? grantReward({ kind: 'core', id }) : null;
    }
    case 'next-mod': {
      const id = MOD_QUEUE.find((m) => !PROFILE.unlockedMods.includes(m));
      return id ? grantReward({ kind: 'mod', id }) : null;
    }
    case 'character':
      grantCharacterId(PROFILE.unlockedCharacters, reward.id);
      return reward;
    case 'weapon':
      if (!PROFILE.unlockedWeapons.includes(reward.id)) PROFILE.unlockedWeapons.push(reward.id);
      return reward;
    case 'core':
      if (!PROFILE.unlockedCores.includes(reward.id)) PROFILE.unlockedCores.push(reward.id);
      return reward;
    case 'mod':
      if (!PROFILE.unlockedMods.includes(reward.id)) PROFILE.unlockedMods.push(reward.id);
      return reward;
    case 'socket':
      if (reward.slot === 'weapon') {
        PROFILE.weaponSockets = Math.min(PROFILE.maxWeaponSockets, PROFILE.weaponSockets + 1);
        return { ...reward, index: PROFILE.weaponSockets };
      }
      PROFILE.coreSockets = Math.min(PROFILE.maxCoreSockets, PROFILE.coreSockets + 1);
      return { ...reward, index: PROFILE.coreSockets };
    case 'discards':
      PROFILE.levelupDiscards += reward.n;
      return reward;
  }
}

/** The reward's bare name, with no category prefix. Used where the surrounding
 *  UI already states the category (the Contracts screen groups by it), so the
 *  line can read "Unlocked: Arc Welder" instead of "Unlocked: Weapon: Arc
 *  Welder". */
export function rewardName(reward: Reward | null): string {
  if (!reward) return 'nothing';
  switch (reward.kind) {
    case 'character': return CHARACTER_REGISTRY[reward.id]?.name ?? reward.id;
    case 'weapon': return WEAPON_INFO[reward.id]?.title ?? reward.id;
    case 'core': return CORE_TITLES[reward.id] ?? reward.id;
    case 'mod': return MOD_REGISTRY[reward.id]?.label ?? reward.id;
    case 'socket': {
      const noun = reward.slot === 'weapon' ? 'Weapon' : 'Core';
      return reward.index ? `${noun} slot ${reward.index}` : `${noun} slot`;
    }
    case 'discards': return `+${reward.n} level-up discard`;
    default: return describeReward(reward);
  }
}

export function describeReward(reward: Reward | null): string {
  if (!reward) return 'Nothing left to unlock';
  switch (reward.kind) {
    case 'character': return `Character: ${CHARACTER_REGISTRY[reward.id]?.name ?? reward.id}`;
    case 'weapon': return `Weapon: ${WEAPON_INFO[reward.id]?.title ?? reward.id}`;
    case 'core': return `Core: ${CORE_TITLES[reward.id] ?? reward.id}`;
    case 'mod': return `Mod: ${MOD_REGISTRY[reward.id]?.label ?? reward.id}`;
    case 'socket': {
      const noun = reward.slot === 'weapon' ? 'weapon' : 'core';
      return reward.index ? `${noun === 'weapon' ? 'Weapon' : 'Core'} slot ${reward.index}` : `New ${noun} socket`;
    }
    case 'discards': return `+${reward.n} level-up discard`;
    case 'next-weapon': return 'Next weapon';
    case 'next-core': return 'Next core';
    case 'next-mod': return 'Next mod';
  }
}

/** Which section of the Contracts screen a contract belongs to. */
export type RewardCategory = 'character' | 'weapon' | 'core' | 'mod' | 'socket' | 'other';

export function rewardCategory(reward: Reward): RewardCategory {
  switch (reward.kind) {
    case 'character': return 'character';
    case 'weapon': case 'next-weapon': return 'weapon';
    case 'core': case 'next-core': return 'core';
    case 'mod': case 'next-mod': return 'mod';
    case 'socket': return 'socket';
    case 'discards': return 'other';
  }
}

/** Resolves what a reward would actually hand over, so the screen can show a
 *  real name and icon instead of "Next core".
 *
 *  `claimed` accumulates across a section: several pending rungs all draw from
 *  the same queue, so without it every one of them would advertise the SAME
 *  item. Walking them in display order shows what completing them in that
 *  order would give. */
export function resolveReward(reward: Reward, claimed: Set<string>): Reward | null {
  switch (reward.kind) {
    case 'next-weapon': {
      const id = WEAPON_QUEUE.find((w) => !PROFILE.unlockedWeapons.includes(w) && !claimed.has(w));
      if (!id) return null;
      claimed.add(id);
      return { kind: 'weapon', id };
    }
    case 'next-core': {
      const id = CORE_QUEUE.find((c) => !PROFILE.unlockedCores.includes(c) && !claimed.has(c));
      if (!id) return null;
      claimed.add(id);
      return { kind: 'core', id };
    }
    case 'next-mod': {
      const id = MOD_QUEUE.find((m) => !PROFILE.unlockedMods.includes(m) && !claimed.has(m));
      if (!id) return null;
      claimed.add(id);
      return { kind: 'mod', id };
    }
    default:
      return reward;
  }
}
