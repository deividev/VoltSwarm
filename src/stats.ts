// The RPG stat sheet. Every combat system reads from here; upgrades and chest
// rewards only ever mutate this object.

export interface PlayerStats {
  /** Global damage multiplier. */
  damage: number;
  /** Cooldown divider — 1.2 means 20% faster attacks. */
  attackSpeed: number;
  /** 0..1 chance for a hit to crit. */
  critChance: number;
  /** Extra damage multiplier on crit (0.5 = +50%). */
  critDamage: number;
  /** Move speed multiplier. */
  moveSpeed: number;
  /** Weapon range multiplier. */
  attackRange: number;
  /** World-unit radius at which XP orbs start flying to the player. */
  pickupRange: number;
  /** Extra projectiles added to volley weapons. */
  projectileCount: number;
  /** Projectile speed multiplier. */
  projectileSpeed: number;
  /** Size multiplier for AoEs, projectiles and blades. */
  area: number;
  /** Armor points; reduction = armor / (armor + 100) — diminishing returns. */
  armor: number;
  /** HP healed per regen tick. */
  regen: number;
  /** Luck points; shifts upgrade rarity weights. */
  luck: number;
  /** Cursed difficulty bonus (fraction) chosen by the player. */
  cursedDifficulty: number;
  /** XP gain multiplier. */
  xpGain: number;
  /** Evasion points; dodge chance = evasion / (evasion + 100) — diminishing. */
  evasion: number;
  /** Damage reflected to enemies that touch the player. */
  thorns: number;
  /** Percent chance to steal 1 HP per weapon hit. */
  lifesteal: number;
  /** Multiplier on buff and status-effect durations. */
  duration: number;
}

export function defaultStats(): PlayerStats {
  return {
    damage: 1,
    attackSpeed: 1,
    critChance: 0.05,
    critDamage: 0.5,
    moveSpeed: 1,
    attackRange: 1,
    pickupRange: 4.5,
    projectileCount: 0,
    projectileSpeed: 1,
    area: 1,
    armor: 0,
    regen: 0,
    luck: 0,
    cursedDifficulty: 0,
    xpGain: 1,
    evasion: 0,
    thorns: 0,
    lifesteal: 0,
    duration: 1,
  };
}

/** Dodge chance from evasion points, with diminishing returns. */
export function dodgeChance(evasion: number): number {
  return evasion / (evasion + 100);
}

/** Applies armor's diminishing-returns reduction to incoming damage. */
export function applyArmor(damage: number, armor: number): number {
  return Math.max(1, Math.round(damage * (1 - armor / (armor + 100))));
}

export interface HitResult {
  amount: number;
  crit: boolean;
}

/** Rolls crit and returns the final damage for one hit. */
export function rollHit(baseDamage: number, stats: PlayerStats): HitResult {
  const crit = Math.random() < stats.critChance;
  const amount = baseDamage * stats.damage * (crit ? 1 + stats.critDamage : 1);
  return { amount, crit };
}
