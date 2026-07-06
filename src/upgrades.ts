import { MAX_WEAPON_LEVEL, PLAYER, WEAPON_INFO, xpForLevel, type WeaponId } from './config';
import type { PlayerStats } from './stats';
import type { Player } from './player';

// Level-up card pool: stat upgrades with rarity tiers plus weapon cards
// (unlock / level up). Rarity weights shift with Luck — Megabonk's base rule,
// our numbers.

export type Rarity = 'common' | 'rare' | 'epic';

/** Weapon inventory: 0 = locked, 1..MAX_WEAPON_LEVEL = owned level. */
export type WeaponLevels = Record<WeaponId, number>;

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
  apply(stats: PlayerStats, player: Player, weapons: WeaponLevels): void;
}

interface StatCardDef {
  id: string;
  title: string;
  /** Magnitude per rarity: [common, rare, epic]. */
  magnitudes: [number, number, number];
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
    magnitudes: [0.1, 0.18, 0.3],
    describe: (v) => `${pct(v)} Damage`,
    apply: (s, _p, v) => {
      s.damage += v;
    },
  },
  {
    id: 'attack-speed',
    title: 'Overclock',
    magnitudes: [0.1, 0.16, 0.25],
    describe: (v) => `${pct(v)} Attack Speed`,
    apply: (s, _p, v) => {
      s.attackSpeed += v;
    },
  },
  {
    id: 'crit-chance',
    title: 'Targeting Chip',
    magnitudes: [0.04, 0.07, 0.12],
    describe: (v) => `${pct(v)} Crit Chance`,
    apply: (s, _p, v) => {
      s.critChance += v;
    },
  },
  {
    id: 'crit-damage',
    title: 'Piercing Rounds',
    magnitudes: [0.15, 0.25, 0.4],
    describe: (v) => `${pct(v)} Crit Damage`,
    apply: (s, _p, v) => {
      s.critDamage += v;
    },
  },
  {
    id: 'move-speed',
    title: 'Servo Tune-Up',
    magnitudes: [0.06, 0.1, 0.16],
    describe: (v) => `${pct(v)} Move Speed`,
    apply: (s, _p, v) => {
      s.moveSpeed += v;
    },
  },
  {
    id: 'attack-range',
    title: 'Long Barrel',
    magnitudes: [0.08, 0.14, 0.22],
    describe: (v) => `${pct(v)} Attack Range`,
    apply: (s, _p, v) => {
      s.attackRange += v;
    },
  },
  {
    id: 'pickup-range',
    title: 'Magnet Coil',
    magnitudes: [0.2, 0.35, 0.6],
    describe: (v) => `${pct(v)} Pickup Range`,
    apply: (s, _p, v) => {
      s.pickupRange *= 1 + v;
    },
  },
  {
    id: 'projectile-speed',
    title: 'Ballistics Kit',
    magnitudes: [0.1, 0.18, 0.3],
    describe: (v) => `${pct(v)} Projectile Speed`,
    apply: (s, _p, v) => {
      s.projectileSpeed += v;
    },
  },
  {
    id: 'area',
    title: 'Expansion Module',
    magnitudes: [0.08, 0.14, 0.22],
    describe: (v) => `${pct(v)} Area`,
    apply: (s, _p, v) => {
      s.area += v;
    },
  },
  {
    id: 'armor',
    title: 'Deflector Plates',
    magnitudes: [8, 15, 25],
    describe: (v) => `+${v} Armor`,
    apply: (s, _p, v) => {
      s.armor += v;
    },
  },
  {
    id: 'regen',
    title: 'Nanobot Swarm',
    magnitudes: [1, 2, 4],
    describe: (v) => `+${v} HP Regen per tick`,
    apply: (s, _p, v) => {
      s.regen += v;
    },
  },
  {
    id: 'max-hp',
    title: 'Hull Plates',
    magnitudes: [15, 25, 45],
    describe: (v) => `+${v} Max HP (and heal ${v})`,
    apply: (_s, p, v) => {
      p.maxHp += v;
      p.hp = Math.min(p.maxHp, p.hp + v);
    },
  },
  {
    id: 'evasion',
    title: 'Ghost Plating',
    magnitudes: [8, 14, 22],
    describe: (v) => `+${v} Evasion (chance to dodge hits)`,
    apply: (s, _p, v) => {
      s.evasion += v;
    },
  },
  {
    id: 'thorns',
    title: 'Rusty Spikes',
    magnitudes: [6, 12, 20],
    describe: (v) => `+${v} Thorns (reflect on contact)`,
    apply: (s, _p, v) => {
      s.thorns += v;
    },
  },
  {
    id: 'shield',
    title: 'Barrier Cell',
    magnitudes: [1, 1, 1],
    describe: () => '+1 Shield Charge: blocks one full hit, regenerates over time (max 3)',
    apply: (s) => {
      s.shield = Math.min(PLAYER.maxShieldCharges, s.shield + 1);
    },
    available: (s) => s.shield < PLAYER.maxShieldCharges,
  },
  {
    id: 'lifesteal',
    title: 'Leech Coil',
    magnitudes: [3, 6, 10],
    describe: (v) => `+${v}% Lifesteal (chance to steal 1 HP per hit)`,
    apply: (s, _p, v) => {
      s.lifesteal += v;
    },
  },
  {
    id: 'duration',
    title: 'Capacitor Bank',
    magnitudes: [0.1, 0.16, 0.25],
    describe: (v) => `${pct(v)} Effect Duration`,
    apply: (s, _p, v) => {
      s.duration += v;
    },
  },
];

/** Chaos: applies a random stat card's effect at this card's rarity. */
function makeChaosCard(rarity: Rarity): UpgradeCard {
  const index = RARITY_INDEX[rarity];
  return {
    id: 'chaos',
    title: 'Chaos Module',
    description: 'Boosts a random stat. Feeling lucky?',
    rarity,
    apply: (stats, player) => {
      const def = STAT_CARDS[Math.floor(Math.random() * STAT_CARDS.length)];
      def?.apply(stats, player, def.magnitudes[index]);
    },
  };
}

/** Epic-only card: flat extra projectile for volley weapons. */
const PROJECTILE_CARD: StatCardDef = {
  id: 'projectile-count',
  title: 'Ammo Feeder',
  magnitudes: [1, 1, 1],
  describe: () => '+1 Projectile',
  apply: (s) => {
    s.projectileCount += 1;
  },
};

function rollRarity(luck: number): Rarity {
  const epicW = 8 + luck * 0.5;
  const rareW = 30 + luck * 0.5;
  const commonW = 62;
  const roll = Math.random() * (epicW + rareW + commonW);
  if (roll < epicW) return 'epic';
  if (roll < epicW + rareW) return 'rare';
  return 'common';
}

const RARITY_INDEX: Record<Rarity, 0 | 1 | 2> = { common: 0, rare: 1, epic: 2 };

function makeStatCard(def: StatCardDef, rarity: Rarity): UpgradeCard {
  const value = def.magnitudes[RARITY_INDEX[rarity]];
  return {
    id: def.id,
    title: def.title,
    description: def.describe(value),
    rarity,
    apply: (stats, player) => def.apply(stats, player, value),
  };
}

function makeWeaponCard(weaponId: WeaponId, owned: boolean): UpgradeCard {
  const info = WEAPON_INFO[weaponId];
  return {
    id: `weapon-${weaponId}`,
    title: owned ? `${info.title} +1` : `Unlock: ${info.title}`,
    description: owned ? `Level up ${info.title}.` : info.description,
    rarity: 'rare',
    apply: (_stats, _player, weapons) => {
      weapons[weaponId] = Math.min(MAX_WEAPON_LEVEL, weapons[weaponId] + 1);
    },
  };
}

/** Maximum weapons a build can hold: the draft pick plus one unlock. */
export const MAX_WEAPONS = 2;

export function ownedWeaponCount(weapons: WeaponLevels): number {
  return (Object.keys(weapons) as WeaponId[]).filter((id) => weapons[id] > 0).length;
}

/** Rolls `count` distinct cards for a level-up choice.
 *  While the build holds fewer than MAX_WEAPONS, one new-weapon unlock is
 *  guaranteed among the options; at the cap, unlock cards disappear and only
 *  stat cards + owned-weapon level-ups remain. */
export function rollUpgradeChoices(
  stats: PlayerStats,
  weapons: WeaponLevels,
  count = 3,
): UpgradeCard[] {
  const atWeaponCap = ownedWeaponCount(weapons) >= MAX_WEAPONS;

  const candidates: UpgradeCard[] = [];
  for (const def of STAT_CARDS) {
    if (def.available && !def.available(stats)) continue;
    candidates.push(makeStatCard(def, rollRarity(stats.luck)));
  }
  candidates.push(makeChaosCard(rollRarity(stats.luck)));
  if (rollRarity(stats.luck) === 'epic') {
    candidates.push(makeStatCard(PROJECTILE_CARD, 'epic'));
  }

  const unlockCards: UpgradeCard[] = [];
  for (const weaponId of Object.keys(weapons) as WeaponId[]) {
    const level = weapons[weaponId];
    if (level >= MAX_WEAPON_LEVEL) continue;
    if (level > 0) {
      candidates.push(makeWeaponCard(weaponId, true));
    } else if (!atWeaponCap) {
      unlockCards.push(makeWeaponCard(weaponId, false));
    }
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
