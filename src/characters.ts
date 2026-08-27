import { CHARACTER_BALANCE, PLAYER, SECONDS_PER_MINUTE, type WeaponId } from './config';
import { defaultStats, type PlayerStats } from './stats';

export const DEFAULT_CHARACTER_ID = 'field-engineer' as const;
export const RACK_HAULER_ID = 'rack-hauler' as const;
export const OVERCLOCKER_ID = 'overclocker' as const;
export type CharacterId = typeof DEFAULT_CHARACTER_ID | typeof RACK_HAULER_ID | typeof OVERCLOCKER_ID;
export type CharacterRewardId = CharacterId;
export type CharacterCapacityId = CharacterId;

export type PlayerDamageSource =
  | 'swarm-contact'
  | 'elite-contact'
  | 'boss-contact'
  | 'boss-ram'
  | 'projectile'
  | 'telegraphed'
  | 'other';

const PHYSICAL_CONTACT_SOURCES: ReadonlySet<PlayerDamageSource> = new Set([
  'swarm-contact',
  'elite-contact',
  'boss-contact',
  'boss-ram',
]);

/** Config-backed trait seam. Characters without the trait remain bit-identical. */
export function physicalContactDamageMultiplier(
  characterId: string,
  source: PlayerDamageSource,
): number {
  return characterId === OVERCLOCKER_ID && PHYSICAL_CONTACT_SOURCES.has(source)
    ? CHARACTER_BALANCE.overclocker.physicalContactDamageMultiplier
    : 1;
}

export function rewardTierShiftForCharacter(characterId: string): number {
  return characterId === OVERCLOCKER_ID
    ? CHARACTER_BALANCE.overclocker.rewardTierShift
    : 0;
}

export type CharacterUnlock =
  | { kind: 'default' }
  | { kind: 'contract'; contractId: string };

export interface CharacterDef {
  id: CharacterId;
  name: string;
  archetype: string;
  shortDescription: string;
  portrait: string | null;
  /** Runtime model registry seam. The model pipeline owns the matching key. */
  modelKey: string;
  maxHp: number;
  moveSpeed: number;
  stats: PlayerStats;
  signature: { name: string; description: string; badge: string; icon: string };
  tradeoff: string;
  tradeoffTitle: string;
  tradeoffIcon: string;
  recommendedWeapon: WeaponId;
  unlock: CharacterUnlock;
}

const BASE_STATS = defaultStats();

const asPercent = (value: number): string => `${Math.round(value * 100)}%`;
const asSignedPercent = (value: number): string => {
  const percent = Math.round(value * 100);
  return `${percent >= 0 ? '+' : ''}${percent}%`;
};
const asSignedNumber = (value: number): string => `${value >= 0 ? '+' : ''}${value}`;
const asValueWithDelta = (value: number, baseline: number): string => {
  const delta = value - baseline;
  return delta === 0 ? `${value}` : `${value} (${asSignedNumber(delta)})`;
};

const fieldEngineerStats = (): PlayerStats => ({
  ...BASE_STATS,
  damage: CHARACTER_BALANCE.fieldEngineer.damage,
  attackSpeed: CHARACTER_BALANCE.fieldEngineer.attackSpeed,
  critChance: CHARACTER_BALANCE.fieldEngineer.critChance,
  critDamage: CHARACTER_BALANCE.fieldEngineer.critDamage,
  armor: CHARACTER_BALANCE.fieldEngineer.armor,
  regen: CHARACTER_BALANCE.fieldEngineer.regen,
  luck: CHARACTER_BALANCE.fieldEngineer.luck,
});

const rackHaulerStats = (): PlayerStats => ({
  ...BASE_STATS,
  damage: CHARACTER_BALANCE.rackHauler.damage,
  attackSpeed: CHARACTER_BALANCE.rackHauler.attackSpeed,
  critChance: CHARACTER_BALANCE.rackHauler.critChance,
  critDamage: CHARACTER_BALANCE.rackHauler.critDamage,
  armor: CHARACTER_BALANCE.rackHauler.armor,
  regen: CHARACTER_BALANCE.rackHauler.regen,
  luck: CHARACTER_BALANCE.rackHauler.luck,
});

const overclockerStats = (): PlayerStats => ({
  ...BASE_STATS,
  damage: CHARACTER_BALANCE.overclocker.damage,
  attackSpeed: CHARACTER_BALANCE.overclocker.attackSpeed,
  critChance: CHARACTER_BALANCE.overclocker.critChance,
  critDamage: CHARACTER_BALANCE.overclocker.critDamage,
  armor: CHARACTER_BALANCE.overclocker.armor,
  regen: CHARACTER_BALANCE.overclocker.regen,
  luck: CHARACTER_BALANCE.overclocker.luck,
  evasion: CHARACTER_BALANCE.overclocker.evasion,
});

export const CHARACTER_REGISTRY: Readonly<Record<CharacterId, CharacterDef>> = {
  [DEFAULT_CHARACTER_ID]: {
    id: DEFAULT_CHARACTER_ID,
    name: 'Field Engineer',
    archetype: 'Core Sustain',
    shortDescription: 'A forgiving chassis that turns Core upgrades into small repairs.',
    portrait: 'assets/2d/ref-field-engineer-front-v1.png',
    modelKey: 'field-engineer',
    maxHp: CHARACTER_BALANCE.fieldEngineer.maxHp,
    moveSpeed: CHARACTER_BALANCE.fieldEngineer.moveSpeed,
    stats: fieldEngineerStats(),
    signature: {
      name: 'Field Repair',
      description: `Installing or upgrading a Core restores ${asPercent(CHARACTER_BALANCE.fieldEngineer.fieldRepairFraction)} of maximum HP, except Hull Plates.`,
      badge: `${asPercent(CHARACTER_BALANCE.fieldEngineer.fieldRepairFraction)} MAX HP / CORE UPGRADE`,
      icon: 'assets/2d/icon-item-repair.png',
    },
    tradeoff: `More durability and minor repair access, but ${asPercent(BASE_STATS.damage - CHARACTER_BALANCE.fieldEngineer.damage)} less damage.`,
    tradeoffTitle: `${asSignedPercent(CHARACTER_BALANCE.fieldEngineer.damage - BASE_STATS.damage)} Damage`,
    tradeoffIcon: 'assets/2d/icon-stat-damage.png',
    recommendedWeapon: 'bolt',
    unlock: { kind: 'default' },
  },
  [RACK_HAULER_ID]: {
    id: RACK_HAULER_ID,
    name: 'Rack Hauler',
    archetype: 'Weapon Volume',
    shortDescription: 'A broad weapon carrier that trades Core depth for a larger arsenal.',
    portrait: 'assets/2d/ref-rack-hauler-front-v4-seafoam.png',
    modelKey: 'rack-hauler',
    maxHp: CHARACTER_BALANCE.rackHauler.maxHp,
    moveSpeed: CHARACTER_BALANCE.rackHauler.moveSpeed,
    stats: rackHaulerStats(),
    signature: {
      name: 'Open Rack',
      description: `Carries ${asSignedNumber(CHARACTER_BALANCE.rackHauler.weaponSocketOffset)} weapon socket and ${asSignedNumber(CHARACTER_BALANCE.rackHauler.coreSocketOffset)} Core socket.`,
      badge: `${asSignedNumber(CHARACTER_BALANCE.rackHauler.weaponSocketOffset)} WEAPON / ${asSignedNumber(CHARACTER_BALANCE.rackHauler.coreSocketOffset)} CORE`,
      icon: 'assets/2d/icon-stat-projectiles-v2.png',
    },
    tradeoff: 'Broad weapon coverage with less room for shared Core multipliers.',
    tradeoffTitle: `${asSignedPercent(CHARACTER_BALANCE.rackHauler.damage - BASE_STATS.damage)} Damage`,
    tradeoffIcon: 'assets/2d/icon-stat-damage.png',
    recommendedWeapon: 'blades',
    unlock: { kind: 'contract', contractId: 'proving-ground' },
  },
  [OVERCLOCKER_ID]: {
    id: OVERCLOCKER_ID,
    name: 'Overclocker',
    archetype: 'High-Risk Loot',
    shortDescription: 'A glass chassis that turns every paid reward into a higher-tier gamble.',
    portrait: 'assets/2d/ref-overclocker-front-v1.png',
    modelKey: 'overclocker',
    maxHp: CHARACTER_BALANCE.overclocker.maxHp,
    moveSpeed: CHARACTER_BALANCE.overclocker.moveSpeed,
    stats: overclockerStats(),
    signature: {
      name: 'Runaway Draw',
      description: `Chests and Scrapper stock roll ${asSignedNumber(CHARACTER_BALANCE.overclocker.rewardTierShift)} tier higher, capped at Gold.`,
      badge: `${asSignedNumber(CHARACTER_BALANCE.overclocker.rewardTierShift)} CHEST / SCRAPPER TIER`,
      icon: 'assets/2d/prop-chest-front-v2.png',
    },
    tradeoff: `Physical contact from the swarm, elites and boss bodies deals ${asPercent(CHARACTER_BALANCE.overclocker.physicalContactDamageMultiplier - 1)} more damage.`,
    tradeoffTitle: `${asSignedPercent(CHARACTER_BALANCE.overclocker.physicalContactDamageMultiplier - 1)} Physical Contact Damage Taken`,
    tradeoffIcon: 'assets/2d/icon-stat-damage.png',
    recommendedWeapon: 'pulse',
    unlock: { kind: 'contract', contractId: 'two-of-a-kind' },
  },
};

export interface SocketProfileView {
  weaponSockets: number;
  coreSockets: number;
  maxWeaponSockets: number;
  maxCoreSockets: number;
}

export interface SocketCapacity {
  open: number;
  max: number;
}

export interface EffectiveSocketCapacities {
  weapon: SocketCapacity;
  core: SocketCapacity;
}

const SOCKET_OFFSETS: Readonly<Record<CharacterCapacityId, { weapon: number; core: number }>> = {
  [DEFAULT_CHARACTER_ID]: { weapon: 0, core: 0 },
  [RACK_HAULER_ID]: {
    weapon: CHARACTER_BALANCE.rackHauler.weaponSocketOffset,
    core: CHARACTER_BALANCE.rackHauler.coreSocketOffset,
  },
  [OVERCLOCKER_ID]: { weapon: 0, core: 0 },
};

/** Projects global Contract-owned PROFILE capacity into a run. Character
 * offsets never mutate or replace PROFILE, so canonical socket settlement and
 * persistence remain shared by the whole roster. */
export function effectiveSocketCapacities(
  characterId: CharacterCapacityId,
  profile: SocketProfileView,
): EffectiveSocketCapacities {
  const offsets = SOCKET_OFFSETS[characterId];
  return {
    weapon: {
      open: Math.max(0, profile.weaponSockets + offsets.weapon),
      max: Math.max(0, profile.maxWeaponSockets + offsets.weapon),
    },
    core: {
      open: Math.max(0, profile.coreSockets + offsets.core),
      max: Math.max(0, profile.maxCoreSockets + offsets.core),
    },
  };
}

export type SocketPresentationState = 'installed' | 'empty' | 'locked';

/** Shared RIG presentation grammar for character-specific capacity. */
export function socketPresentationStates(
  installed: number,
  capacity: SocketCapacity,
): SocketPresentationState[] {
  return Array.from({ length: capacity.max }, (_, index) => {
    if (index < installed) return 'installed';
    if (index < capacity.open) return 'empty';
    return 'locked';
  });
}

export interface CharacterProfileView {
  unlockedCharacters: readonly string[];
}

export function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CHARACTER_REGISTRY, value);
}

/** Resolves persisted run data against the registry without requiring the
 * character to remain unlocked in the current profile. */
export function registeredCharacterId(requested: unknown): CharacterId {
  return isCharacterId(requested) ? requested : DEFAULT_CHARACTER_ID;
}

export function resolveCharacterId(requested: unknown, profile: CharacterProfileView): CharacterId {
  const registered = registeredCharacterId(requested);
  return profile.unlockedCharacters.includes(registered)
    ? registered
    : DEFAULT_CHARACTER_ID;
}

export function unlockedCharacters(profile: CharacterProfileView): CharacterDef[] {
  return Object.values(CHARACTER_REGISTRY).filter((character) =>
    profile.unlockedCharacters.includes(character.id),
  );
}

/** Shared idempotent mutation seam for contract rewards and profile tools. */
export function grantCharacterId(
  unlocked: string[],
  id: string,
  validIds: ReadonlySet<string> = new Set(Object.keys(CHARACTER_REGISTRY)),
): boolean {
  if (!validIds.has(id) || unlocked.includes(id)) return false;
  unlocked.push(id);
  return true;
}

export function characterStats(characterId: CharacterId): PlayerStats {
  return { ...CHARACTER_REGISTRY[characterId].stats };
}

export interface CharacterStatRow {
  id: string;
  label: string;
  value: string;
  icon: string;
  /** True when the value differs from the shared gameplay baseline. */
  changed: boolean;
}

/** Presentation values derived from the same config-backed character data as
 * gameplay. Baselines come from PLAYER/defaultStats so future characters do
 * not inherit Field Engineer-specific copy. */
export function characterStatRows(character: CharacterDef): CharacterStatRow[] {
  return [
    {
      id: 'max-hp',
      label: 'Max HP',
      value: asValueWithDelta(character.maxHp, PLAYER.maxHp),
      icon: 'assets/2d/icon-card-max-hp.png',
      changed: character.maxHp !== PLAYER.maxHp,
    },
    { id: 'armor', label: 'Armor', value: asPercent(character.stats.armor), icon: 'assets/2d/icon-stat-armor-v2.png', changed: character.stats.armor !== BASE_STATS.armor },
    { id: 'damage', label: 'Damage', value: asSignedPercent(character.stats.damage - BASE_STATS.damage), icon: 'assets/2d/icon-stat-damage.png', changed: character.stats.damage !== BASE_STATS.damage },
    {
      id: 'move-speed',
      label: 'Move Speed',
      value: asValueWithDelta(character.moveSpeed, PLAYER.moveSpeed),
      icon: 'assets/2d/icon-stat-move-speed.png',
      changed: character.moveSpeed !== PLAYER.moveSpeed,
    },
    { id: 'attack-speed', label: 'Attack Speed', value: `x${character.stats.attackSpeed}`, icon: 'assets/2d/icon-stat-attack-speed.png', changed: character.stats.attackSpeed !== BASE_STATS.attackSpeed },
    { id: 'crit-chance', label: 'Crit Chance', value: asPercent(character.stats.critChance), icon: 'assets/2d/icon-stat-crit.png', changed: character.stats.critChance !== BASE_STATS.critChance },
    { id: 'crit-damage', label: 'Crit Damage', value: `+${asPercent(character.stats.critDamage)}`, icon: 'assets/2d/icon-stat-crit-damage.png', changed: character.stats.critDamage !== BASE_STATS.critDamage },
    ...(character.stats.evasion !== BASE_STATS.evasion
      ? [{ id: 'evasion', label: 'Evasion', value: `${character.stats.evasion}`, icon: 'assets/2d/icon-stat-evasion.png', changed: true }]
      : []),
    { id: 'luck', label: 'Luck', value: asPercent(character.stats.luck), icon: 'assets/2d/icon-stat-luck.png', changed: character.stats.luck !== BASE_STATS.luck },
    { id: 'regen', label: 'Regen', value: `${(character.stats.regen * SECONDS_PER_MINUTE) / PLAYER.regenTickS} HP/min`, icon: 'assets/2d/icon-stat-regen.png', changed: character.stats.regen !== BASE_STATS.regen },
  ];
}

export function isRecommendedWeapon(characterId: CharacterId, weaponId: WeaponId): boolean {
  return CHARACTER_REGISTRY[characterId].recommendedWeapon === weaponId;
}

/** Adds presentation metadata without adding, removing, reordering or weighting
 * draft entries. Recommendation is a label, never a pool mutation. */
export function labelWeaponOptions<T extends WeaponId>(
  characterId: CharacterId,
  options: readonly T[],
): { id: T; recommended: boolean }[] {
  return options.map((id) => ({ id, recommended: isRecommendedWeapon(characterId, id) }));
}

export type SignatureTriggerContext = 'gameplay' | 'load' | 'replay' | 'boss-lab' | 'rebuild';

/** Pure Field Repair rule. Call only after an eligible Core has been applied. */
export function fieldRepairHp(
  characterId: CharacterId,
  hp: number,
  maxHp: number,
  context: SignatureTriggerContext,
): number {
  if (characterId !== DEFAULT_CHARACTER_ID || context !== 'gameplay') return hp;
  return Math.min(maxHp, hp + maxHp * CHARACTER_BALANCE.fieldEngineer.fieldRepairFraction);
}
