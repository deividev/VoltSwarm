import { ACCOUNT, MAX_WEAPON_LEVEL, PLAYER, RECORDING, TIERS, WEAPON_INFO, describeWeaponLevel, xpForLevel, type WeaponId } from './config';
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

/** Installed cores by stat-card id → level (times picked). */
export type CoreLevels = Partial<Record<string, number>>;

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

export interface UpgradeCard {
  id: string;
  title: string;
  description: string;
  rarity: Rarity;
  apply(stats: PlayerStats, player: Player, weapons: WeaponLevels, cores: CoreLevels): void;
}

interface StatCardDef {
  id: string;
  title: string;
  /** Magnitude per tier: [gray, green, blue, purple, gold]. */
  magnitudes: [number, number, number, number, number];
  describe(value: number): string;
  apply(stats: PlayerStats, player: Player, value: number): void;
  /** Optional gate: card only offered while this returns true. */
  available?(stats: PlayerStats): boolean;
}

const pct = (v: number): string => `+${Math.round(v * 100)}%`;

const STAT_CARDS: StatCardDef[] = [
  {
    id: 'damage',
    title: 'Power Coupling',
    magnitudes: [0.1, 0.14, 0.18, 0.3, 0.42],
    describe: (v) => `${pct(v)} Damage`,
    apply: (s, _p, v) => {
      s.damage += v;
    },
  },
  {
    id: 'attack-speed',
    title: 'Overclock',
    magnitudes: [0.1, 0.13, 0.16, 0.25, 0.35],
    describe: (v) => `${pct(v)} Attack Speed`,
    apply: (s, _p, v) => {
      s.attackSpeed += v;
    },
  },
  {
    id: 'crit-chance',
    title: 'Targeting Chip',
    magnitudes: [0.04, 0.05, 0.07, 0.12, 0.17],
    describe: (v) => `${pct(v)} Crit Chance`,
    apply: (s, _p, v) => {
      s.critChance += v;
    },
  },
  {
    id: 'crit-damage',
    title: 'Piercing Rounds',
    magnitudes: [0.15, 0.2, 0.25, 0.4, 0.55],
    describe: (v) => `${pct(v)} Crit Damage`,
    apply: (s, _p, v) => {
      s.critDamage += v;
    },
  },
  {
    id: 'move-speed',
    title: 'Servo Tune-Up',
    magnitudes: [0.06, 0.08, 0.1, 0.16, 0.22],
    describe: (v) => `${pct(v)} Move Speed`,
    apply: (s, _p, v) => {
      s.moveSpeed += v;
    },
  },
  {
    id: 'attack-range',
    title: 'Long Barrel',
    magnitudes: [0.08, 0.11, 0.14, 0.22, 0.3],
    describe: (v) => `${pct(v)} Attack Range`,
    apply: (s, _p, v) => {
      s.attackRange += v;
    },
  },
  {
    id: 'pickup-range',
    title: 'Magnet Coil',
    magnitudes: [0.2, 0.28, 0.35, 0.6, 0.85],
    describe: (v) => `${pct(v)} Pickup Range`,
    apply: (s, _p, v) => {
      s.pickupRange *= 1 + v;
    },
  },
  {
    id: 'projectile-speed',
    title: 'Ballistics Kit',
    magnitudes: [0.1, 0.14, 0.18, 0.3, 0.42],
    describe: (v) => `${pct(v)} Projectile Speed`,
    apply: (s, _p, v) => {
      s.projectileSpeed += v;
    },
  },
  {
    id: 'area',
    title: 'Expansion Module',
    magnitudes: [0.08, 0.11, 0.14, 0.22, 0.3],
    describe: (v) => `${pct(v)} Area`,
    apply: (s, _p, v) => {
      s.area += v;
    },
  },
  {
    id: 'armor',
    title: 'Deflector Plates',
    magnitudes: [8, 11, 15, 25, 35],
    describe: (v) => `+${v} Armor`,
    apply: (s, _p, v) => {
      s.armor += v;
    },
  },
  {
    id: 'regen',
    title: 'Nanobot Swarm',
    magnitudes: [1, 2, 3, 4, 6],
    describe: (v) => `+${v} HP Regen per tick`,
    apply: (s, _p, v) => {
      s.regen += v;
    },
  },
  {
    id: 'max-hp',
    title: 'Hull Plates',
    magnitudes: [15, 20, 25, 45, 65],
    describe: (v) => `+${v} Max HP (and heal ${v})`,
    apply: (_s, p, v) => {
      p.maxHp += v;
      p.hp = Math.min(p.maxHp, p.hp + v);
    },
  },
  {
    id: 'evasion',
    title: 'Ghost Plating',
    magnitudes: [8, 11, 14, 22, 30],
    describe: (v) => `+${v} Evasion (chance to dodge hits)`,
    apply: (s, _p, v) => {
      s.evasion += v;
    },
  },
  {
    id: 'thorns',
    title: 'Rusty Spikes',
    magnitudes: [6, 9, 12, 20, 28],
    describe: (v) => `+${v} Thorns (reflect on contact)`,
    apply: (s, _p, v) => {
      s.thorns += v;
    },
  },
  {
    id: 'shield',
    title: 'Barrier Cell',
    magnitudes: [1, 1, 1, 1, 1],
    describe: () => '+1 Shield Charge: blocks one full hit, regenerates over time (max 3)',
    apply: (s) => {
      s.shield = Math.min(PLAYER.maxShieldCharges, s.shield + 1);
    },
    available: (s) => s.shield < PLAYER.maxShieldCharges,
  },
  {
    id: 'lifesteal',
    title: 'Leech Coil',
    magnitudes: [3, 4, 6, 10, 14],
    describe: (v) => `+${v}% Lifesteal (chance to steal 1 HP per hit)`,
    apply: (s, _p, v) => {
      s.lifesteal += v;
    },
  },
  {
    id: 'duration',
    title: 'Capacitor Bank',
    magnitudes: [0.1, 0.13, 0.16, 0.25, 0.35],
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
    magnitudes: [6, 8, 10, 14, 20],
    describe: (v) => `+${v} Luck (better tier rolls)`,
    apply: (s, _p, v) => {
      s.luck += v;
    },
  },
  {
    id: 'cursed',
    title: 'Cursed Core',
    magnitudes: [0.06, 0.08, 0.1, 0.14, 0.2],
    describe: (v) =>
      `+${Math.round(v * 100)}% difficulty, +${Math.round(v * 160)}% XP gain`,
    apply: (s, _p, v) => {
      s.cursedDifficulty += v;
      s.xpGain += v * 1.6;
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
    apply: (stats, player, _weapons, cores) => {
      const def = STAT_CARDS[Math.floor(Math.random() * STAT_CARDS.length)];
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
  magnitudes: [1, 1, 1, 1, 1],
  describe: () => '+1 Projectile',
  apply: (s) => {
    s.projectileCount += 1;
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
export function rollRarity(luck: number): Rarity {
  const weights = TIER_ORDER.map(
    (tier) => TIERS.weights[tier] + luck * TIERS.luckShift[tier],
  );
  let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
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
    apply: (stats, player, _weapons, cores) => {
      def.apply(stats, player, value);
      cores[def.id] = (cores[def.id] ?? 0) + 1;
    },
  };
}

function makeWeaponCard(weaponId: WeaponId, level: number): UpgradeCard {
  const info = WEAPON_INFO[weaponId];
  const owned = level > 0;
  return {
    id: `weapon-${weaponId}`,
    title: owned ? `${info.title} +1` : `Unlock: ${info.title}`,
    // Owned cards show the concrete gains of the NEXT level, generated from
    // the same config the weapon reads (Opción A, docs/DESIGN_MEJORAS.md).
    description: owned ? describeWeaponLevel(weaponId, level + 1) : info.description,
    rarity: 'blue',
    apply: (_stats, _player, weapons) => {
      weapons[weaponId] = Math.min(MAX_WEAPON_LEVEL, weapons[weaponId] + 1);
    },
  };
}

export function ownedWeaponCount(weapons: WeaponLevels): number {
  return (Object.keys(weapons) as WeaponId[]).filter((id) => weapons[id] > 0).length;
}

export function installedCoreCount(cores: CoreLevels): number {
  return Object.values(cores).filter((level) => (level ?? 0) > 0).length;
}

/** Rolls `count` distinct cards for a level-up choice.
 *  Everything is double-gated (2026-07-09): by the ACCOUNT unlock state
 *  (contract-locked weapons/cores never enter the pool) and by the sockets
 *  (weapon slots cap the unlock cards; core sockets full → only installed
 *  cores appear — no swap). */
export function rollUpgradeChoices(
  stats: PlayerStats,
  weapons: WeaponLevels,
  cores: CoreLevels,
  count = 3,
): UpgradeCard[] {
  const atWeaponCap = ownedWeaponCount(weapons) >= ACCOUNT.weaponSockets;
  const atCoreCap = installedCoreCount(cores) >= ACCOUNT.coreSockets;
  const coreOffered = (id: string): boolean =>
    ACCOUNT.unlockedCores.includes(id) && (!atCoreCap || (cores[id] ?? 0) > 0);
  const recordingCoreOffered = (id: string): boolean =>
    !atCoreCap || (cores[id] ?? 0) > 0;

  const candidates: UpgradeCard[] = [];
  for (const def of STAT_CARDS) {
    if (def.available && !def.available(stats)) continue;
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
      candidates.push(makeWeaponCard(weaponId, level));
    } else if (!atWeaponCap && ACCOUNT.unlockedWeapons.includes(weaponId)) {
      unlockCards.push(makeWeaponCard(weaponId, 0));
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
      forced.push(makeWeaponCard(ownedWeapon, weapons[ownedWeapon]));
    }

    for (const coreId of RECORDING.levelUpDraft.coreIds) {
      // Recording-only forced cores may sit outside the normal account pool,
      // but they still obey socket capacity and installed-core eligibility.
      if (!recordingCoreOffered(coreId)) continue;
      if (coreId === PROJECTILE_CARD.id) {
        // Capture mode deliberately bypasses the normal purple/gold roll gate.
        forced.push(makeStatCard(PROJECTILE_CARD, RECORDING.levelUpDraft.coreRarity));
        continue;
      }
      const def = STAT_CARDS.find((card) => card.id === coreId);
      if (!def || (def.available && !def.available(stats))) continue;
      forced.push(makeStatCard(def, RECORDING.levelUpDraft.coreRarity));
    }

    const forcedIds = new Set(forced.map((card) => card.id));
    const legalFill = [...candidates, ...unlockCards].filter((card) => !forcedIds.has(card.id));
    return [...forced, ...legalFill].slice(0, count);
  }

  const picks: UpgradeCard[] = [];
  if (unlockCards.length > 0) {
    picks.push(unlockCards[Math.floor(Math.random() * unlockCards.length)]!);
  }
  while (picks.length < count && candidates.length > 0) {
    const index = Math.floor(Math.random() * candidates.length);
    picks.push(...candidates.splice(index, 1));
  }
  return picks;
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
