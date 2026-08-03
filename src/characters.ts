import { CHARACTER_BALANCE, PLAYER, type WeaponId } from './config';
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
  signature: { name: string; description: string };
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
    shortDescription: 'A forgiving chassis that turns Core upgrades into repairs.',
    portrait: null,
    modelKey: 'field-engineer',
    maxHp: CHARACTER_BALANCE.fieldEngineer.maxHp,
    moveSpeed: CHARACTER_BALANCE.fieldEngineer.moveSpeed,
    stats: fieldEngineerStats(),
    signature: {
      name: 'Field Repair',
      description: `Installing or upgrading a Core restores ${asPercent(CHARACTER_BALANCE.fieldEngineer.fieldRepairFraction)} of maximum HP.`,
    },
    tradeoff: `More durability and repair access, but ${asPercent(BASE_STATS.damage - CHARACTER_BALANCE.fieldEngineer.damage)} less damage.`,
    recommendedWeapon: 'bolt',
    unlock: { kind: 'default' },
  },
};

export interface CharacterProfileView {
  unlockedCharacters: readonly string[];
}

export function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === 'string' && value in CHARACTER_REGISTRY;
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
  label: string;
  value: string;
}

/** Presentation values derived from the same config-backed character data as
 * gameplay. Baselines come from PLAYER/defaultStats so future characters do
 * not inherit Field Engineer-specific copy. */
export function characterStatRows(character: CharacterDef): CharacterStatRow[] {
  return [
    {
      label: 'Max HP',
      value: `${character.maxHp} (${asSignedNumber(character.maxHp - PLAYER.maxHp)})`,
    },
    { label: 'Armor', value: asPercent(character.stats.armor) },
    { label: 'Damage', value: asSignedPercent(character.stats.damage - BASE_STATS.damage) },
    {
      label: 'Move Speed',
      value: `${character.moveSpeed} (${asSignedNumber(character.moveSpeed - PLAYER.moveSpeed)})`,
    },
    { label: 'Attack Speed', value: `x${character.stats.attackSpeed}` },
    {
      label: 'Crit',
      value: `${asPercent(character.stats.critChance)} / +${asPercent(character.stats.critDamage)}`,
    },
    {
      label: 'Luck / Regen',
      value: `${asPercent(character.stats.luck)} / ${character.stats.regen}`,
    },
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

/** Pure Field Repair rule. Call only after the Core has been applied. */
export function fieldRepairHp(
  characterId: CharacterId,
  hp: number,
  maxHp: number,
  context: SignatureTriggerContext,
): number {
  if (characterId !== DEFAULT_CHARACTER_ID || context !== 'gameplay') return hp;
  return Math.min(maxHp, hp + maxHp * CHARACTER_BALANCE.fieldEngineer.fieldRepairFraction);
}
