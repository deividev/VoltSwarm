import { PROFILE, PLAYER, SECONDS_PER_MINUTE, DRAFT_FALLBACK, CORE_BALANCE, CORE_TIER_MAGNITUDES, MAX_WEAPON_LEVEL, RECORDING, TIERS, WEAPON_INFO, WEAPON_UPGRADE_TIER_SCALE, describeWeaponBranch, isBranchWeapon, isWeaponAvailable, weaponBranchEntries, xpForLevel, type BranchWeaponId, type WeaponBranchId, type WeaponBranchLevels, type WeaponId } from './config';
import type { PlayerStats } from './stats';
import type { Player } from './player';

// Level-up card pool: core cards (permanent player stats) with 5-tier
// rarities plus weapon cards (unlock / level up). Tier weights shift with
// Luck — Megabonk's base rule, our numbers.
//
// Sockets (2026-07-09): the chassis holds a limited number of DISTINCT cores.
// The first pick of a stat installs its core; later picks level it inside its
// socket. With sockets full the draft only offers installed cores — no swap,
// early picks are a run-long commitment.

export type Rarity = 'gray' | 'green' | 'blue' | 'purple' | 'gold';

/** Weapon inventory: 0 = locked, 1..MAX_WEAPON_LEVEL = owned level. */
export type WeaponLevels = Record<WeaponId, number>;
/** Persisted aggregate of rarity-weighted branch picks. Kept for snapshots and
 * backward compatibility only; live combat reads WeaponBranchLevels instead. */
export type WeaponPower = Record<WeaponId, number>;
/** Tier-weighted specialization power for all weapon branches. */
export type { WeaponBranchLevels } from './config';

/** Installed cores by stat-card id → level (times picked). */
export type CoreLevels = Partial<Record<string, number>>;

/** Run-only reward seam for draft fallbacks; it never opens a socket or changes combat stats. */
export interface UpgradeRunState {
  addGold(amount: number): void;
}

export function emptyWeaponLevels(): WeaponLevels {
  return {
    bolt: 0,
    pulse: 0,
    blades: 0,
    welder: 0,
    press: 0,
    tire: 0,
    oil: 0,
    acid: 0,
    turbine: 0,
    ricochet: 0,
    dismantler: 0,
  };
}

export function emptyWeaponPower(): WeaponPower {
  return Object.fromEntries(
    Object.keys(emptyWeaponLevels()).map((id) => [id, 0]),
  ) as WeaponPower;
}

export function emptyWeaponBranches(): WeaponBranchLevels {
  return {
    bolt: {}, pulse: {}, blades: {}, welder: {}, press: {}, tire: {}, oil: {},
    acid: {}, turbine: {}, ricochet: {}, dismantler: {},
  };
}

export interface UpgradeCard {
  id: string;
  title: string;
  description: string;
  rarity: Rarity;
  /** Used only to keep full-socket drafts varied, never shown in UI. */
  draftKind?: 'core' | 'weapon' | 'weapon-branch' | 'fallback';
  /** Owning weapon for shared HUD behavior and per-screen branch diversity. */
  weaponId?: WeaponId;
  apply(
    stats: PlayerStats,
    player: Player,
    weapons: WeaponLevels,
    cores: CoreLevels,
    weaponPower: WeaponPower,
    weaponBranches: WeaponBranchLevels,
    mods?: BuildModCounts,
    run?: UpgradeRunState,
  ): void;
}

interface StatCardDef {
  id: string;
  title: string;
  /** Magnitude per tier: [gray, green, blue, purple, gold]. */
  magnitudes: readonly [number, number, number, number, number];
  describe(value: number): string;
  apply(stats: PlayerStats, player: Player, value: number): void;
  /** Optional marginal-value gate shared by direct draft and Chaos. */
  hasMarginalValue?(stats: PlayerStats): boolean;
}

const pct = (v: number): string => `+${Math.round(v * 100)}%`;
const regenHpPerMinute = (hpPerTick: number): number =>
  (hpPerTick * SECONDS_PER_MINUTE) / PLAYER.regenTickS;

export const STAT_CARDS: StatCardDef[] = [
  {
    id: 'damage',
    title: 'Power Coupling',
    magnitudes: CORE_TIER_MAGNITUDES.damage,
    describe: (v) => `${pct(v)} Damage`,
    apply: (s, _p, v) => {
      s.damage += v;
    },
  },
  {
    id: 'attack-speed',
    title: 'Overclock',
    magnitudes: CORE_TIER_MAGNITUDES['attack-speed'],
    describe: (v) => `${pct(v)} Attack Speed`,
    apply: (s, _p, v) => {
      s.attackSpeed += v;
    },
  },
  {
    id: 'crit-chance',
    title: 'Targeting Chip',
    magnitudes: CORE_TIER_MAGNITUDES['crit-chance'],
    describe: (v) => `${pct(v)} Crit Chance`,
    apply: (s, _p, v) => {
      s.critChance = Math.min(CORE_BALANCE.probabilityCaps.critChance, s.critChance + v);
    },
    hasMarginalValue: (s) => s.critChance < CORE_BALANCE.probabilityCaps.critChance,
  },
  {
    id: 'crit-damage',
    title: 'Piercing Rounds',
    magnitudes: CORE_TIER_MAGNITUDES['crit-damage'],
    describe: (v) => `${pct(v)} Crit Damage`,
    apply: (s, _p, v) => {
      s.critDamage += v;
    },
  },
  {
    id: 'move-speed',
    title: 'Servo Tune-Up',
    magnitudes: CORE_TIER_MAGNITUDES['move-speed'],
    describe: (v) => `${pct(v)} Move Speed`,
    apply: (s, _p, v) => {
      s.moveSpeed += v;
    },
  },
  {
    id: 'attack-range',
    title: 'Long Barrel',
    magnitudes: CORE_TIER_MAGNITUDES['attack-range'],
    describe: (v) => `${pct(v)} Attack Range`,
    apply: (s, _p, v) => {
      s.attackRange += v;
    },
  },
  {
    id: 'pickup-range',
    title: 'Magnet Coil',
    magnitudes: CORE_TIER_MAGNITUDES['pickup-range'],
    describe: (v) => `${pct(v)} Pickup Range`,
    apply: (s, _p, v) => {
      s.pickupRange *= 1 + v;
    },
  },
  {
    id: 'projectile-speed',
    title: 'Ballistics Kit',
    magnitudes: CORE_TIER_MAGNITUDES['projectile-speed'],
    describe: (v) => `${pct(v)} Projectile Speed`,
    apply: (s, _p, v) => {
      s.projectileSpeed += v;
    },
  },
  {
    id: 'area',
    title: 'Expansion Module',
    magnitudes: CORE_TIER_MAGNITUDES.area,
    describe: (v) => `${pct(v)} Area`,
    apply: (s, _p, v) => {
      s.area += v;
    },
  },
  {
    id: 'armor',
    title: 'Deflector Plates',
    magnitudes: CORE_TIER_MAGNITUDES.armor,
    describe: (v) => `${pct(v)} Armor rating (diminishing returns)`,
    apply: (s, _p, v) => {
      s.armor += v;
    },
  },
  {
    id: 'regen',
    title: 'Nanobot Swarm',
    magnitudes: CORE_TIER_MAGNITUDES.regen,
    describe: (v) => `+${regenHpPerMinute(v)} HP/min`,
    apply: (s, _p, v) => {
      s.regen += v;
    },
  },
  {
    id: 'max-hp',
    title: 'Hull Plates',
    magnitudes: CORE_TIER_MAGNITUDES['max-hp'],
    describe: (v) => `+${v} Max HP permanently`,
    apply: (_s, p, v) => {
      p.maxHp += v;
    },
  },
  {
    id: 'evasion',
    title: 'Ghost Plating',
    magnitudes: CORE_TIER_MAGNITUDES.evasion,
    describe: (v) => `+${v} Evasion (chance to dodge hits)`,
    apply: (s, _p, v) => {
      s.evasion += v;
    },
  },
  {
    id: 'thorns',
    title: 'Rusty Spikes',
    magnitudes: CORE_TIER_MAGNITUDES.thorns,
    describe: (v) => `+${v} Thorns (reflect on contact)`,
    apply: (s, _p, v) => {
      s.thorns += v;
    },
  },
  {
    id: 'lifesteal',
    title: 'Leech Coil',
    magnitudes: CORE_TIER_MAGNITUDES.lifesteal,
    describe: (v) => `+${v}% Lifesteal (${v}% chance on hit to heal 1 HP; ${PLAYER.lifestealCooldownS}s global cooldown)`,
    apply: (s, _p, v) => {
      s.lifesteal = Math.min(
        CORE_BALANCE.probabilityCaps.lifestealPercent,
        s.lifesteal + v,
      );
    },
    hasMarginalValue: (s) => s.lifesteal < CORE_BALANCE.probabilityCaps.lifestealPercent,
  },
  {
    id: 'duration',
    title: 'Capacitor Bank',
    magnitudes: CORE_TIER_MAGNITUDES.duration,
    describe: (v) => `${pct(v)} Effect Duration`,
    apply: (s, _p, v) => {
      s.duration += v;
    },
  },
  // Migrated from chest rewards (2026-07-09): permanent stats live in the
  // core draft, chests hold consumables only.
  {
    id: 'luck',
    title: 'Lucky Gear',
    magnitudes: CORE_TIER_MAGNITUDES.luck,
    describe: (v) => `${pct(v)} Luck rating (better tier weights, not direct odds)`,
    apply: (s, _p, v) => {
      s.luck += v;
    },
  },
  {
    id: 'cursed',
    title: 'Cursed Core',
    magnitudes: CORE_TIER_MAGNITUDES.cursed,
    describe: (v) =>
      `+${Math.round(v * 100)}% difficulty, +${Math.round(v * CORE_BALANCE.cursedXpGainMultiplier * 100)}% XP gain`,
    apply: (s, _p, v) => {
      s.cursedDifficulty += v;
      s.xpGain += v * CORE_BALANCE.cursedXpGainMultiplier;
    },
  },
];

/** Chaos: applies a random stat card's effect at this card's rarity. It is a
 *  core like any other — it installs into (and levels inside) one socket. */
function makeChaosCard(rarity: Rarity): UpgradeCard {
  const index = RARITY_INDEX[rarity];
  return {
    id: 'chaos',
    title: 'Chaos Module',
    description: 'Boosts a random stat. Feeling lucky?',
    rarity,
    draftKind: 'core',
    apply: (stats, player, weapons, cores, _weaponPower, _weaponBranches, mods = {}) => {
      const eligible = STAT_CARDS.filter(
        (def) =>
          (!def.hasMarginalValue || def.hasMarginalValue(stats)) &&
          coreBenefitsBuild(def.id, weapons, mods),
      );
      const def = eligible[Math.floor(Math.random() * eligible.length)];
      def?.apply(stats, player, def.magnitudes[index]);
      cores['chaos'] = (cores['chaos'] ?? 0) + 1;
    },
  };
}

/** High-tier-only card: +1 unit of whichever weapon (projectile/tire/blade/
 *  tornado) — the sole quantity scaler past the Lv3/Lv5 weapon milestones. */
const PROJECTILE_CARD: StatCardDef = {
  id: 'projectile-count',
  title: 'Ammo Feeder',
  magnitudes: CORE_TIER_MAGNITUDES['projectile-count'],
  describe: () => '+1 Projectile',
  apply: (s, _p, v) => {
    s.projectileCount += v;
  },
};

const TIER_ORDER: Rarity[] = ['gold', 'purple', 'blue', 'green', 'gray'];

/** Card id → display title, for the HUD's core-socket rows. */
export const CORE_TITLES: Record<string, string> = Object.fromEntries(
  STAT_CARDS.map((def) => [def.id, def.title]),
);
CORE_TITLES['chaos'] = 'Chaos Module';
CORE_TITLES['projectile-count'] = 'Ammo Feeder';

/** Luck-weighted tier roll — shared by the card draft, the chest reel and
 *  the merchant stock. */
export function rollRarity(luck: number, random: () => number = Math.random): Rarity {
  const weights = TIER_ORDER.map(
    (tier) => TIERS.weights[tier] + luck * TIERS.luckShift[tier],
  );
  let roll = random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < TIER_ORDER.length; i++) {
    roll -= weights[i]!;
    if (roll < 0) return TIER_ORDER[i]!;
  }
  return 'gray';
}

const RARITY_INDEX: Record<Rarity, 0 | 1 | 2 | 3 | 4> = {
  gray: 0,
  green: 1,
  blue: 2,
  purple: 3,
  gold: 4,
};

function makeStatCard(def: StatCardDef, rarity: Rarity): UpgradeCard {
  const value = def.magnitudes[RARITY_INDEX[rarity]];
  return {
    id: def.id,
    title: def.title,
    description: def.describe(value),
    rarity,
    draftKind: 'core',
    apply: (stats, player, _weapons, cores) => {
      def.apply(stats, player, value);
      cores[def.id] = (cores[def.id] ?? 0) + 1;
    },
  };
}

function makeWeaponUnlockCard(weaponId: WeaponId): UpgradeCard {
  const info = WEAPON_INFO[weaponId];
  return {
    id: `weapon-${weaponId}`,
    title: `Unlock: ${info.title}`,
    description: info.description,
    rarity: 'blue',
    draftKind: 'weapon',
    weaponId,
    apply: (_stats, _player, weapons) => {
      weapons[weaponId] = Math.min(MAX_WEAPON_LEVEL, weapons[weaponId] + 1);
    },
  };
}

function makeWeaponBranchCard(
  weaponId: BranchWeaponId,
  branchId: WeaponBranchId,
  level: number,
  rarity: Rarity,
): UpgradeCard {
  const info = WEAPON_INFO[weaponId];
  const branch = weaponBranchEntries(weaponId).find(([id]) => id === branchId)?.[1];
  const potency = WEAPON_UPGRADE_TIER_SCALE[rarity];
  if (!branch) throw new Error(`Unknown ${weaponId} weapon branch: ${branchId}`);
  return {
    id: `weapon-${weaponId}-${branchId}`,
    title: `${info.title}: ${branch.title}`,
    description: describeWeaponBranch(weaponId, branchId, level + 1, potency),
    rarity,
    draftKind: 'weapon-branch',
    weaponId,
    apply: (_stats, _player, weapons, _cores, weaponPower, weaponBranches) => {
      weapons[weaponId] = Math.min(MAX_WEAPON_LEVEL, weapons[weaponId] + 1);
      weaponPower[weaponId] += potency;
      weaponBranches[weaponId][branchId] = (weaponBranches[weaponId][branchId] ?? 0) + potency;
    },
  };
}

function makeOwnedWeaponUpgradeCard(weaponId: WeaponId, level: number, rarity: Rarity): UpgradeCard {
  if (!isBranchWeapon(weaponId)) throw new Error(`Missing branches for weapon: ${weaponId}`);
  // Capture mode presents a single deterministic branch, while normal drafts
  // expose the full branch pool. Oil has no damage branch, so use its first entry.
  const branchId = weaponBranchEntries(weaponId)[0]?.[0];
  if (!branchId) throw new Error(`Missing branch definitions for weapon: ${weaponId}`);
  return makeWeaponBranchCard(weaponId, branchId, level, rarity);
}


/** Resolves branch-card ids back to their owning weapon for shared HUD behavior. */
export function weaponIdFromUpgradeCard(cardId: string): WeaponId | undefined {
  return (Object.keys(emptyWeaponLevels()) as WeaponId[]).find(
    (weaponId) => cardId === `weapon-${weaponId}` || cardId.startsWith(`weapon-${weaponId}-`),
  );
}

function makeSalvageFallbackCard(): UpgradeCard {
  return {
    id: 'fallback-salvage-dividend',
    title: 'Salvage Dividend',
    description: `+${DRAFT_FALLBACK.salvageDividendGold} Gold`,
    rarity: 'gray',
    draftKind: 'fallback',
    apply: (_stats, _player, _weapons, _cores, _weaponPower, _weaponBranches, _mods, run) => {
      run?.addGold(DRAFT_FALLBACK.salvageDividendGold);
    },
  };
}

export function ownedWeaponCount(weapons: WeaponLevels): number {
  return (Object.keys(weapons) as WeaponId[]).filter((id) => weapons[id] > 0).length;
}

export function installedCoreCount(cores: CoreLevels): number {
  return Object.values(cores).filter((level) => (level ?? 0) > 0).length;
}

/** Build-dependent cores declare the systems that consume their stat. Any
 *  core absent from this table is universal (damage, defence, economy, etc.).
 *  This keeps draft eligibility data-driven instead of relying on card titles
 *  or scattered weapon-specific conditionals. */
const BUILD_DEPENDENT_CORE_EFFECTS: Partial<Record<string, {
  weapons?: readonly WeaponId[];
  mods?: readonly string[];
}>> = {
  'attack-range': {
    weapons: ['bolt', 'welder', 'press', 'acid', 'ricochet', 'dismantler'],
  },
  'projectile-speed': {
    weapons: ['bolt', 'tire', 'turbine', 'ricochet'],
  },
  area: {
    weapons: ['bolt', 'pulse', 'blades', 'press', 'tire', 'oil', 'acid', 'turbine'],
    mods: ['detonator-rig', 'piston-stompers'],
  },
  duration: {
    weapons: ['oil', 'acid', 'turbine'],
    mods: ['stun-bumper', 'coolant-burst'],
  },
  'projectile-count': {
    weapons: ['bolt', 'blades', 'tire', 'turbine'],
  },
};

export type BuildModCounts = Partial<Record<string, number>>;

/** Whether a core changes at least one currently installed build system. */
export function coreBenefitsBuild(
  coreId: string,
  weapons: WeaponLevels,
  mods: BuildModCounts = {},
): boolean {
  const effect = BUILD_DEPENDENT_CORE_EFFECTS[coreId];
  if (!effect) return true;
  return Boolean(
    effect.weapons?.some((id) => weapons[id] > 0) ||
    effect.mods?.some((id) => (mods[id] ?? 0) > 0),
  );
}

/** Rolls `count` distinct cards for a level-up choice.
 *  Everything is double-gated (2026-07-09): by the PROFILE unlock state
 *  (contract-locked weapons/cores never enter the pool) and by the sockets
 *  (weapon slots cap the unlock cards; core sockets full → only installed
 *  cores appear — no swap). */
export function rollUpgradeChoices(
  stats: PlayerStats,
  weapons: WeaponLevels,
  cores: CoreLevels,
  mods: BuildModCounts = {},
  count = 3,
): UpgradeCard[] {
  const atWeaponCap = ownedWeaponCount(weapons) >= PROFILE.weaponSockets;
  const atCoreCap = installedCoreCount(cores) >= PROFILE.coreSockets;
  const coreOffered = (id: string): boolean =>
    PROFILE.unlockedCores.includes(id) &&
    coreBenefitsBuild(id, weapons, mods) &&
    (!atCoreCap || (cores[id] ?? 0) > 0);
  const recordingCoreOffered = (id: string): boolean =>
    coreBenefitsBuild(id, weapons, mods) &&
    (!atCoreCap || (cores[id] ?? 0) > 0);

  const candidates: UpgradeCard[] = [];
  for (const def of STAT_CARDS) {
    if (def.hasMarginalValue && !def.hasMarginalValue(stats)) continue;
    if (!coreOffered(def.id)) continue;
    candidates.push(makeStatCard(def, rollRarity(stats.luck)));
  }
  if (coreOffered('chaos')) {
    candidates.push(makeChaosCard(rollRarity(stats.luck)));
  }
  const projectileTier = rollRarity(stats.luck);
  if (
    (projectileTier === 'purple' || projectileTier === 'gold') &&
    coreOffered(PROJECTILE_CARD.id)
  ) {
    candidates.push(makeStatCard(PROJECTILE_CARD, projectileTier));
  }

  const unlockCards: UpgradeCard[] = [];
  for (const weaponId of Object.keys(weapons) as WeaponId[]) {
    const level = weapons[weaponId];
    if (level >= MAX_WEAPON_LEVEL) continue;
    if (level > 0) {
      if (!isBranchWeapon(weaponId)) throw new Error(`Missing branches for weapon: ${weaponId}`);
      for (const [branchId] of weaponBranchEntries(weaponId)) {
        candidates.push(makeWeaponBranchCard(weaponId, branchId, level, rollRarity(stats.luck)));
      }
    } else if (!atWeaponCap && isWeaponAvailable(weaponId) && PROFILE.unlockedWeapons.includes(weaponId)) {
      unlockCards.push(makeWeaponUnlockCard(weaponId));
    }
  }

  if (RECORDING.levelUpDraft.enabled) {
    const forced: UpgradeCard[] = [];

    // With one socket this is the selected starting weapon. If future capture
    // builds own several, prefer the highest-level weapon; ties keep the
    // canonical WeaponLevels insertion order from emptyWeaponLevels().
    const ownedWeapon = (Object.keys(weapons) as WeaponId[])
      .filter((id) => weapons[id] > 0 && weapons[id] < MAX_WEAPON_LEVEL)
      .sort((a, b) => weapons[b] - weapons[a])[0];
    if (ownedWeapon) {
      forced.push(makeOwnedWeaponUpgradeCard(ownedWeapon, weapons[ownedWeapon], RECORDING.levelUpDraft.coreRarity));
    }

    for (const coreId of RECORDING.levelUpDraft.coreIds) {
      // Recording-only forced cores may sit outside the normal profile pool,
      // but they still obey socket capacity and installed-core eligibility.
      if (!recordingCoreOffered(coreId)) continue;
      if (coreId === PROJECTILE_CARD.id) {
        // Capture mode deliberately bypasses the normal purple/gold roll gate.
        forced.push(makeStatCard(PROJECTILE_CARD, RECORDING.levelUpDraft.coreRarity));
        continue;
      }
      const def = STAT_CARDS.find((card) => card.id === coreId);
      if (!def || (def.hasMarginalValue && !def.hasMarginalValue(stats))) continue;
      forced.push(makeStatCard(def, RECORDING.levelUpDraft.coreRarity));
    }

    const forcedIds = new Set(forced.map((card) => card.id));
    const forcedWeaponIds = new Set(forced.map((card) => card.weaponId).filter(Boolean));
    const legalFill = [...candidates, ...unlockCards].filter(
      (card) => !forcedIds.has(card.id) && (!card.weaponId || !forcedWeaponIds.has(card.weaponId)),
    );
    const picks = [...forced];
    for (const card of legalFill) {
      if (picks.length >= count) break;
      if (card.weaponId && picks.some((pick) => pick.weaponId === card.weaponId)) continue;
      picks.push(card);
    }
    return picks;
  }

  const picks: UpgradeCard[] = [];
  const takeCandidate = (kind?: UpgradeCard['draftKind']): boolean => {
    const eligible = candidates
      .map((card, index) => ({ card, index }))
      .filter((entry) => !kind || entry.card.draftKind === kind)
      .filter((entry) => !entry.card.weaponId || !picks.some((pick) => pick.weaponId === entry.card.weaponId));
    if (eligible.length === 0 || picks.length >= count) return false;
    const selected = eligible[Math.floor(Math.random() * eligible.length)]!;
    picks.push(...candidates.splice(selected.index, 1));
    return true;
  };

  if (unlockCards.length > 0) {
    picks.push(unlockCards[Math.floor(Math.random() * unlockCards.length)]!);
  } else if (atWeaponCap && atCoreCap) {
    // Once sockets are committed, preserve a real build decision: one distinct
    // weapon branch and one eligible installed core lead the draft whenever both exist.
    takeCandidate('weapon-branch');
    takeCandidate('core');
  }
  while (picks.length < count && candidates.length > 0) {
    if (!takeCandidate()) break;
  }
  // Socket commitments plus one-branch-per-owner can exhaust otherwise valid
  // cards (for example one weapon and one marginal installed core). A run-only
  // gold card preserves a three-choice screen without bypassing no-swap cores.
  if (picks.length < count) picks.push(makeSalvageFallbackCard());
  return picks;
}

/** DEV ONLY — replays a recorded run's core picks onto a fresh stat sheet.
 *
 *  Approximate by construction: the run record stores how many TIMES each core
 *  was taken, never which rarity rolled, so exact magnitudes are unrecoverable.
 *
 *  Each pick is replayed at the PROBABILITY-WEIGHTED magnitude, derived from
 *  TIERS.weights, rather than at a fixed tier. The first version used blue —
 *  the middle of the five — which turned out to be a serious overestimate:
 *  blue rolls only 9% of the time while gray rolls 62%, so the real expected
 *  index is about 0.5. On the damage core that is 0.18 replayed against a true
 *  expectation of 0.12, inflating every pick by nearly half.
 *
 *  That mattered in practice (2026-08-01): a boss died easily in the lab and
 *  read as "boss HP too low", when the build under test was simply much
 *  stronger than the one actually recorded. Deriving from the weights keeps
 *  this honest if the tier table is ever retuned.
 *
 *  Assumes 0 Luck, since the record does not preserve the luck the rolls
 *  actually saw. A high-Luck run is therefore still under-represented. */
export function replayCoresOntoStats(
  stats: PlayerStats,
  player: Player,
  coreLevels: CoreLevels,
): void {
  // MUST match the magnitudes array order — [gray, green, blue, purple, gold].
  // TIER_ORDER is the REVERSE of this (it runs gold-first for the roll), and
  // reusing it here silently pairs gold's 0.2% weight with gray's magnitude,
  // which inflates the replay instead of correcting it. Typecheck cannot catch
  // that: both are just number arrays.
  const MAGNITUDE_TIER_ORDER: Rarity[] = ['gray', 'green', 'blue', 'purple', 'gold'];
  const probabilities = MAGNITUDE_TIER_ORDER.map((tier) => TIERS.weights[tier]);
  const total = probabilities.reduce((sum, weight) => sum + weight, 0);
  for (const [coreId, level] of Object.entries(coreLevels)) {
    const def = STAT_CARDS.find((card) => card.id === coreId);
    if (!def || !level) continue;
    const expected = def.magnitudes.reduce(
      (sum, magnitude, tier) => sum + magnitude * ((probabilities[tier] ?? 0) / total),
      0,
    );
    for (let i = 0; i < level; i++) def.apply(stats, player, expected);
  }
}

export class Progression {
  level = 1;
  xp = 0;
  xpToNext = xpForLevel(1);
  kills = 0;

  /** Adds XP (already multiplied by xpGain). Returns the number of levels
   *  gained (0 if none) — a single merged XP orb (xp-orbs.ts sums nearby
   *  kills into one pickup) can clear more than one threshold at once, and
   *  the caller queues one upgrade-card screen per level gained rather than
   *  collapsing them into a single choice. */
  grantXp(amount: number): number {
    if (amount <= 0) return 0;
    this.xp += amount;
    let levelsGained = 0;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level += 1;
      this.xpToNext = xpForLevel(this.level);
      levelsGained++;
    }
    return levelsGained;
  }

  addKill(): void {
    this.kills += 1;
  }

  reset(): void {
    this.level = 1;
    this.xp = 0;
    this.xpToNext = xpForLevel(1);
    this.kills = 0;
  }
}
