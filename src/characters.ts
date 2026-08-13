import { CHARACTER_BALANCE, PLAYER, regenHpPerMinute, type WeaponId } from './config';
import { defaultStats, type PlayerStats } from './stats';

export const DEFAULT_CHARACTER_ID = 'field-engineer' as const;
export type CharacterId = typeof DEFAULT_CHARACTER_ID;

export type CharacterUnlock =
  | { kind: 'default' }
  | { kind: 'contract'; contractId: string };

export interface CharacterDef {
  id: CharacterId;
  name: string;
  shortDescription: string;
  portrait: string | null;
  /** Runtime model registry seam. The model pipeline owns the matching key. */
  modelKey: string;
  maxHp: number;
  moveSpeed: number;
  stats: PlayerStats;
  signature: { name: string; description: string; badge: string };
  tradeoff: string;
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

export const CHARACTER_REGISTRY: Readonly<Record<CharacterId, CharacterDef>> = {
  [DEFAULT_CHARACTER_ID]: {
    id: DEFAULT_CHARACTER_ID,
    name: 'Field Engineer',
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
    },
    tradeoff: `More durability and minor repair access, but ${asPercent(BASE_STATS.damage - CHARACTER_BALANCE.fieldEngineer.damage)} less damage.`,
    recommendedWeapon: 'bolt',
    unlock: { kind: 'default' },
  },
};

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
    { id: 'luck', label: 'Luck', value: asPercent(character.stats.luck), icon: 'assets/2d/icon-stat-luck.png', changed: character.stats.luck !== BASE_STATS.luck },
    { id: 'regen', label: 'Regen', value: `${regenHpPerMinute(character.stats.regen)} HP/min`, icon: 'assets/2d/icon-stat-regen.png', changed: character.stats.regen !== BASE_STATS.regen },
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
