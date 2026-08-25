import { PROFILE, MERCHANT, MODS, PICKUPS } from './config';
import { rollRarity, type Rarity } from './upgrades';

// The unified mod pool (docs/DESIGN_MEJORAS.md Lista 4): one list, two doors.
// The chest reel rolls it for free (tier-weighted) and the merchant sells it
// for in-run gold. Consumables apply instantly and can always re-drop;
// permanents stack by default; deliberate exceptions may have a hard copy cap.
// Their balance lives in per-mod floors/caps (config.MODS).

export type ConsumableModId = 'repair' | 'scrap-cache' | 'frenzy' | 'haste';
export type PermanentModId =
  | 'stun-bumper'
  | 'kick-plate'
  | 'loose-bolts'
  | 'detonator-rig'
  | 'barrier-cell'
  | 'coolant-burst'
  | 'orb-siphon'
  | 'chain-relay'
  | 'piston-stompers'
  | 'overload-trigger'
  | 'phase-chassis'
  | 'foremans-whistle'
  | 'magnetron-heart';
export type ModId = ConsumableModId | PermanentModId;

/** Copies collected this run (consumables count uses, permanents count stacks). */
export type ModCounts = Partial<Record<ModId, number>>;

export interface ModInfo {
  tier: Rarity;
  kind: 'consumable' | 'permanent';
  label: string;
  description: string;
  /** Emoji placeholder until each dedicated icon is approved (`image`) —
   *  same gradual replacement as weapons/stats. */
  icon: string;
  image?: string;
}

export const MOD_REGISTRY: Record<ModId, ModInfo> = {
  repair: {
    tier: 'gray',
    kind: 'consumable',
    label: 'Repair Kit',
    description: `Restores ${Math.round(PICKUPS.healFraction * 100)}% of max HP.`,
    icon: '🔧',
    image: 'assets/2d/icon-item-repair.png',
  },
  haste: {
    tier: 'gray',
    kind: 'consumable',
    label: 'Overdrive',
    description: `x${PICKUPS.hasteSpeedMultiplier} move speed for ${PICKUPS.hasteDurationS}s.`,
    icon: '👟',
    image: 'assets/2d/icon-item-overdrive.png',
  },
  'scrap-cache': {
    tier: 'green',
    kind: 'consumable',
    label: 'Volt Cache',
    description: `Instantly grants ${Math.round(PICKUPS.xpCacheFraction * 100)}% of the XP needed for the next level.`,
    icon: '🔷',
    image: 'assets/2d/icon-item-volt-cache.png',
  },
  frenzy: {
    tier: 'green',
    kind: 'consumable',
    label: 'Frenzy',
    description: `x${PICKUPS.frenzyDamageMultiplier} damage for ${PICKUPS.frenzyDurationS}s.`,
    icon: '💢',
    image: 'assets/2d/icon-item-frenzy.png',
  },
  'stun-bumper': {
    tier: 'gray',
    kind: 'permanent',
    label: 'Stun Bumper',
    description: `Every ${MODS.stunBumper.cooldownS}s, the next enemy that touches you is zapped and stunned ${MODS.stunBumper.stunS}s.`,
    icon: '🔌',
    image: 'assets/2d/icon-mod-stun-bumper-v2.png',
  },
  'kick-plate': {
    tier: 'gray',
    kind: 'permanent',
    label: 'Kick Plate',
    description: 'Enemies that hit you are knocked back.',
    icon: '🦶',
    image: 'assets/2d/icon-mod-kick-plate.png',
  },
  'loose-bolts': {
    tier: 'gray',
    kind: 'permanent',
    label: 'Loose Bolts',
    description: `Taking a hit scatters ${MODS.looseBolts.bolts} damaging bolts around you.`,
    icon: '🔩',
    image: 'assets/2d/icon-mod-loose-bolts.png',
  },
  'detonator-rig': {
    tier: 'green',
    kind: 'permanent',
    label: 'Detonator Rig',
    description: `Every ${MODS.detonatorRig.kills} kills, the next kill explodes in an AoE.`,
    icon: '🧨',
    image: 'assets/2d/icon-mod-detonator-rig.png',
  },
  'barrier-cell': {
    tier: 'blue',
    kind: 'permanent',
    label: 'Barrier Cell',
    description: 'Blocks full hits and expands your rechargeable shield.',
    icon: 'shield',
    image: 'assets/2d/icon-stat-shield-v2.png',
  },
  'coolant-burst': {
    tier: 'green',
    kind: 'permanent',
    label: 'Coolant Burst',
    description: `When a shield charge breaks, coolant freezes nearby enemies for ${MODS.coolantBurst.freezeS}s.`,
    icon: '🧊',
    image: 'assets/2d/icon-mod-coolant-burst.png',
  },
  'orb-siphon': {
    tier: 'purple',
    kind: 'permanent',
    label: 'Orb Siphon',
    description: 'Opening a chest pulls every XP orb on the map to you.',
    icon: '🧲',
    image: 'assets/2d/icon-mod-orb-siphon.png',
  },
  'chain-relay': {
    tier: 'blue',
    kind: 'permanent',
    label: 'Chain Relay',
    description: `Critical hits arc lightning to up to ${MODS.chainRelay.jumps} nearby enemies.`,
    icon: '⚡',
    image: 'assets/2d/icon-mod-chain-relay-v2.png',
  },
  'piston-stompers': {
    tier: 'blue',
    kind: 'permanent',
    label: 'Piston Stompers',
    description: `Every ${MODS.pistonStompers.steps} steps, stomp the ground: AoE damage scaling with Move Speed.`,
    icon: '🥾',
    image: 'assets/2d/icon-mod-piston-stompers.png',
  },
  'overload-trigger': {
    tier: 'purple',
    kind: 'permanent',
    label: 'Overload Trigger',
    description: `Elite and boss kills overcharge you: x${MODS.overloadTrigger.attackSpeedMult} attack speed for ${MODS.overloadTrigger.durationS}s.`,
    icon: '🔴',
    image: 'assets/2d/icon-mod-overload-trigger.png',
  },
  'phase-chassis': {
    tier: 'purple',
    kind: 'permanent',
    label: 'Phase Chassis',
    description: `After taking damage, phase for ${MODS.phaseChassis.durationS}s: enemies pass through you.`,
    icon: '👻',
    image: 'assets/2d/icon-mod-phase-chassis-v2.png',
  },
  'foremans-whistle': {
    tier: 'purple',
    kind: 'permanent',
    label: "Foreman's Whistle",
    description: 'The scrapper visits twice as often and stocks one extra mod.',
    icon: '📯',
    image: 'assets/2d/icon-mod-foremans-whistle.png',
  },
  'magnetron-heart': {
    tier: 'gold',
    kind: 'permanent',
    label: 'Magnetron Heart',
    description: `Every ${MODS.magnetronHeart.cycleS}s: drags the whole horde toward you for ${MODS.magnetronHeart.pullS}s, then a nova deals damage per enemy dragged.`,
    icon: '🧿',
    image: 'assets/2d/icon-mod-magnetron-heart.png',
  },
};

export const MOD_IDS = Object.keys(MOD_REGISTRY) as ModId[];

/** Mods this profile has unlocked — contract-locked ones never drop or
 *  appear in the shop (gating state: config.PROFILE). Recomputed from PROFILE
 *  whenever an unlock happens at runtime (dev unlock panel today, contracts
 *  later) via refreshUnlockedMods(); importers see the new value because ESM
 *  bindings are live. */
export let UNLOCKED_MOD_IDS = MOD_IDS.filter((id) => PROFILE.unlockedMods.includes(id));

/** Rebuild UNLOCKED_MOD_IDS after PROFILE.unlockedMods changes at runtime. */
export function refreshUnlockedMods(): void {
  UNLOCKED_MOD_IDS = MOD_IDS.filter((id) => PROFILE.unlockedMods.includes(id));
}

/** Tier order high→low, shared by tier capping and the roll fall-down safety. */
const TIER_ORDER: Rarity[] = ['gold', 'purple', 'blue', 'green', 'gray'];

/** Applies a character reward shift before a chest or shop materializes. */
export function promoteRewardTier(tier: Rarity, shift: number): Rarity {
  const index = TIER_ORDER.indexOf(tier);
  const promotedIndex = Math.max(0, Math.min(TIER_ORDER.length - 1, index - Math.max(0, Math.floor(shift))));
  return TIER_ORDER[promotedIndex] ?? tier;
}

/** Unlocked mods of an EXACT tier (empty if the profile has none there yet). */
export function unlockedModsOfTier(tier: Rarity): ModId[] {
  return UNLOCKED_MOD_IDS.filter((id) => MOD_REGISTRY[id].tier === tier);
}

/** ALL mods of an EXACT tier — unlocked AND contract-locked. The chest reel
 *  spins through these to TEASE locked content (marked with a padlock); it can
 *  still only LAND on an unlocked mod. */
export function modsOfTier(tier: Rarity): ModId[] {
  return MOD_IDS.filter((id) => MOD_REGISTRY[id].tier === tier);
}

/** Caps a rolled chest tier DOWN to the highest tier that actually has an
 *  unlocked mod, so a chest never announces (beam colour + price) a tier it
 *  can't pay out — e.g. a gold chest before any gold mod is unlocked resolves
 *  to purple. Applied at spawn, it keeps beam, price, reel and reward all on
 *  the SAME tier (no cross-tier fall-down at reveal). Self-heals as contracts
 *  unlock higher tiers. */
export function resolveEligibleModTier(
  tier: Rarity,
  eligible: (id: ModId) => boolean = () => true,
): Rarity | null {
  for (let i = Math.max(0, TIER_ORDER.indexOf(tier)); i < TIER_ORDER.length; i++) {
    const t = TIER_ORDER[i];
    if (t && unlockedModsOfTier(t).some(eligible)) return t;
  }
  return null;
}

export function resolveChestTier(tier: Rarity): Rarity {
  return resolveEligibleModTier(tier) ?? 'gray';
}

/** Rolls one mod from the pool: luck-weighted tier, then uniform inside it. */
export function rollMod(luck: number): ModId {
  const id = rollModOfTier(rollRarity(luck));
  if (!id) throw new Error('The unlocked Mod pool is empty.');
  return id;
}

/** Rolls one UNLOCKED mod of a fixed tier. Chests cap their tier at spawn
 *  (resolveChestTier) so this returns an exact-tier mod in practice; the
 *  DOWN fall-through stays only as a safety net (e.g. shop tier rolls). */
export function rollModOfTier(
  tier: Rarity,
  eligible: (id: ModId) => boolean = () => true,
): ModId | null {
  for (let i = Math.max(0, TIER_ORDER.indexOf(tier)); i < TIER_ORDER.length; i++) {
    const t = TIER_ORDER[i];
    if (!t) continue;
    const pool = unlockedModsOfTier(t).filter(eligible);
    if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)] ?? null;
  }
  return null;
}

/** Tier base price × run-time ramp × discount, shared by shop and chests. */
export function tierPrice(tier: Rarity, elapsedMinutes: number, discount: number): number {
  const base = MERCHANT.tierPrices[tier];
  return Math.max(1, Math.round(base * (1 + MERCHANT.priceRampPerMin * elapsedMinutes) * (1 - discount)));
}

/** Rolls the merchant stock: distinct, eligible Mods, one tier roll each. */
export function rollShopStock(
  luck: number,
  count: number,
  eligible: (id: ModId) => boolean = () => true,
  tierShift = 0,
): ModId[] {
  const stock: ModId[] = [];
  for (let guard = 0; stock.length < count && guard < 50; guard++) {
    const tier = promoteRewardTier(rollRarity(luck), tierShift);
    const id = rollModOfTier(tier, (candidate) => eligible(candidate) && !stock.includes(candidate));
    if (id) stock.push(id);
  }
  return stock;
}

export function barrierCellCapacity(copies: number): number {
  return Math.min(
    MODS.barrierCell.capacityCap,
    Math.max(0, copies) * MODS.barrierCell.capacityPerCopy,
  );
}

export function barrierCellRegenS(copies: number): number {
  const capacityCopies = Math.ceil(MODS.barrierCell.capacityCap / MODS.barrierCell.capacityPerCopy);
  const extraCopies = Math.max(0, copies - capacityCopies);
  return Math.max(
    MODS.barrierCell.regenFloorS,
    MODS.barrierCell.regenS - extraCopies * MODS.barrierCell.regenReductionPerExtraCopyS,
  );
}

/** Barrier Cell has a finite two-stage curve, so its cap is never sold again. */
export function isModAtCopyCap(id: ModId, copies: number): boolean {
  return id === 'barrier-cell' && copies >= MODS.barrierCell.maxCopies;
}

/** Chest-only marginal-value filter. Orb Siphon can still be sold by the
 *  merchant, but a chest never spends its reward on a duplicate copy. */
export function isModEligibleForChest(id: ModId, copies: number): boolean {
  return !isModAtCopyCap(id, copies) && (id !== 'orb-siphon' || copies === 0);
}

/** Cumulative wording keeps chest, shop and final-build UI truthful per copy. */
export function describeMod(id: ModId, copies = 1): string {
  if (id !== 'barrier-cell') return MOD_REGISTRY[id].description;
  const capacity = barrierCellCapacity(copies);
  const regenS = barrierCellRegenS(copies);
  const maxed = copies >= MODS.barrierCell.maxCopies ? ' Maxed.' : '';
  return `Blocks a full hit. ${capacity} max shield charge${capacity === 1 ? '' : 's'} (cap ${MODS.barrierCell.capacityCap}); restores 1 every ${regenS}s.${maxed}`;
}

/** Shop price: tier base × time ramp × Foreman's Whistle discount. */
export function modPrice(id: ModId, elapsedMinutes: number, discount: number): number {
  return tierPrice(MOD_REGISTRY[id].tier, elapsedMinutes, discount);
}

/** Per-tier readable colors — shared by chest tint and any tier UI. */
export const TIER_COLORS: Record<Rarity, number> = {
  gray: 0x8a94a2,
  green: 0x5fd068,
  blue: 0x3fa9f5,
  purple: 0xb069ff,
  gold: 0xf2b632,
};
