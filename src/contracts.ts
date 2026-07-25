import { CONTRACTS, PROFILE, WEAPON_INFO, type WeaponId } from './config';
import { CORE_TITLES } from './upgrades';
import { MOD_REGISTRY, refreshUnlockedMods, type ModId } from './mods';
import { LIFETIME, saveProfile, type LifetimeStats } from './profile';

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
  | { type: 'reach-level'; n: number }
  | { type: 'survive'; seconds: number }
  | { type: 'defeat-bosses'; n: number }
  | { type: 'weapons-mastered'; n: number }
  | { type: 'distinct-starting-weapons'; n: number }
  | { type: 'minimal-run'; seconds: number }
  | { type: 'flawless-run'; seconds: number };

export type Reward =
  | { kind: 'weapon'; id: WeaponId }
  | { kind: 'core'; id: string }
  | { kind: 'mod'; id: ModId }
  | { kind: 'socket'; slot: 'weapon' | 'core' }
  | { kind: 'discards'; n: number }
  | { kind: 'next-weapon' }
  | { kind: 'next-item' };

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
const WEAPON_QUEUE: WeaponId[] = ['welder', 'acid', 'turbine', 'dismantler', 'oil'];

const ITEM_QUEUE: Reward[] = [
  { kind: 'core', id: 'crit-chance' },
  { kind: 'mod', id: 'coolant-burst' as ModId },
  { kind: 'core', id: 'crit-damage' },
  { kind: 'core', id: 'duration' },
  { kind: 'core', id: 'evasion' },
  { kind: 'mod', id: 'chain-relay' as ModId },
  { kind: 'core', id: 'thorns' },
  { kind: 'core', id: 'lifesteal' },
  { kind: 'core', id: 'luck' },
  { kind: 'core', id: 'projectile-count' },
  { kind: 'core', id: 'chaos' },
  { kind: 'core', id: 'cursed' },
];

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
    objective: { type: 'survive', seconds: CONTRACTS.fullRunSeconds },
    reward: { kind: 'socket', slot: 'core' },
  },
  {
    id: 'boss-hunter', title: 'Boss Hunter',
    description: 'Defeat five bosses.',
    objective: { type: 'defeat-bosses', n: CONTRACTS.bossHunterKills },
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
    objective: { type: 'minimal-run', seconds: CONTRACTS.puristSeconds },
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
    reward: { kind: 'next-item' },
    latent: 'Reward becomes the second character once characters exist.',
  },
  {
    id: 'foreman', title: 'Foreman',
    description: 'Defeat every kind of boss.',
    objective: { type: 'defeat-bosses', n: 3 },
    reward: { kind: 'mod', id: 'magnetron-heart' as ModId },
    latent: 'Run records count bosses but not which TYPE; needs per-type tracking.',
  },
  {
    id: 'two-of-a-kind', title: 'Two of a Kind',
    description: 'Survive a full run with two different characters.',
    objective: { type: 'survive', seconds: CONTRACTS.fullRunSeconds },
    reward: { kind: 'next-item' },
    latent: 'Characters are not implemented.',
  },
];

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
    title: `${title} ${'I'.repeat(index + 1)}`,
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
    { kind: 'next-item' }),
  ...ladder('veteran', 'Veteran', CONTRACTS.ladders.veteran,
    (n) => ({ type: 'finish-runs', n }),
    (n) => `Finish ${n} runs.`,
    { kind: 'next-item' }),
  ...ladder('ascension', 'Ascension', CONTRACTS.ladders.ascension,
    (n) => ({ type: 'reach-level', n }),
    (n) => `Reach level ${n} in a run.`,
    { kind: 'next-item' }),
  ...ladder('endurance', 'Endurance', CONTRACTS.ladders.endurance,
    (n) => ({ type: 'survive', seconds: n }),
    (n) => `Survive ${Math.round(n / 60)} minutes in a run.`,
    { kind: 'next-item' }),
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
    case 'reach-level': return { current: stats.bestLevel, target: objective.n };
    case 'survive': return { current: stats.bestDurationS, target: objective.seconds };
    case 'defeat-bosses': return { current: stats.bossesDefeated, target: objective.n };
    case 'minimal-run': return { current: stats.bestMinimalRunS, target: objective.seconds };
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

/** Evaluates every active contract and pays out the newly completed ones.
 *  Call once per finished run, after the ledger has been updated. */
export function settleContracts(): EarnedContract[] {
  const earned: EarnedContract[] = [];
  for (const contract of ACTIVE_CONTRACTS) {
    if (LIFETIME.completedContracts.includes(contract.id)) continue;
    if (!isComplete(contract)) continue;
    LIFETIME.completedContracts.push(contract.id);
    const granted = grant(contract.reward);
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
function grant(reward: Reward): Reward | null {
  switch (reward.kind) {
    case 'next-weapon': {
      const id = WEAPON_QUEUE.find((w) => !PROFILE.unlockedWeapons.includes(w));
      return id ? grant({ kind: 'weapon', id }) : null;
    }
    case 'next-item': {
      const next = ITEM_QUEUE.find((item) =>
        item.kind === 'core'
          ? !PROFILE.unlockedCores.includes(item.id)
          : item.kind === 'mod' && !PROFILE.unlockedMods.includes(item.id));
      return next ? grant(next) : null;
    }
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
      } else {
        PROFILE.coreSockets = Math.min(PROFILE.maxCoreSockets, PROFILE.coreSockets + 1);
      }
      return reward;
    case 'discards':
      PROFILE.levelupDiscards += reward.n;
      return reward;
  }
}

export function describeReward(reward: Reward | null): string {
  if (!reward) return 'Nothing left to unlock';
  switch (reward.kind) {
    case 'weapon': return `Weapon: ${WEAPON_INFO[reward.id]?.title ?? reward.id}`;
    case 'core': return `Core: ${CORE_TITLES[reward.id] ?? reward.id}`;
    case 'mod': return `Mod: ${MOD_REGISTRY[reward.id]?.label ?? reward.id}`;
    case 'socket': return reward.slot === 'weapon' ? 'New weapon socket' : 'New core socket';
    case 'discards': return `+${reward.n} level-up discard`;
    case 'next-weapon': return 'Next weapon';
    case 'next-item': return 'Next upgrade';
  }
}
