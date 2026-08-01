import type { RendererTelemetryEvent } from './types';

const MAX_RENDERER_PAYLOAD_BYTES = 32 * 1024;
const MAX_JSON_DEPTH = 12;
const MAX_ARRAY_ITEMS = 256;
const SAFE_ID = /^[A-Za-z0-9._:-]+$/;
const DISPLAY_LABEL = /^[A-Za-z0-9][A-Za-z0-9 .,'&()\/:+-]*$/;
const RUN_OUTCOMES = new Set(['defeat', 'sector-cleared', 'run-complete', 'abandoned']);
const CHOICE_TYPES = new Set(['level_up', 'boss_summon', 'chest_purchase', 'shop_purchase']);
const FEEDBACK_DIFFICULTIES = new Set(['too_easy', 'about_right', 'too_hard']);
const FEEDBACK_REASONS = new Set([
  'combat_feel',
  'build_choices',
  'enemy_pressure',
  'bosses',
  'economy',
  'clarity',
  'performance',
]);

export function validateRendererTelemetryEvent(value: unknown): RendererTelemetryEvent | null {
  if (!isPlainRecord(value)) return null;
  if (!hasOnlyKeys(value, ['type', 'runId', 'payload'])) return null;
  if (!isSafeId(value.runId) || !isPlainRecord(value.payload)) return null;
  if (!isJsonValue(value.payload, 0, new Set())) return null;
  let payloadBytes: number;
  try {
    payloadBytes = Buffer.byteLength(JSON.stringify(value.payload), 'utf8');
  } catch {
    return null;
  }
  if (payloadBytes > MAX_RENDERER_PAYLOAD_BYTES) return null;

  switch (value.type) {
    case 'run_started':
      return isRunStarted(value.payload) ? value as unknown as RendererTelemetryEvent : null;
    case 'run_ended':
      return isRunEnded(value.payload) ? value as unknown as RendererTelemetryEvent : null;
    case 'choice':
      return isChoice(value.payload) ? value as unknown as RendererTelemetryEvent : null;
    case 'performance':
      return isPerformance(value.payload) ? value as unknown as RendererTelemetryEvent : null;
    case 'feedback':
      return isFeedback(value.payload) ? value as unknown as RendererTelemetryEvent : null;
    default:
      return null;
  }
}

function isRunStarted(payload: Record<string, unknown>): boolean {
  return (
    hasOnlyKeys(payload, ['mapId', 'mapNumber', 'difficulty', 'startingWeaponId']) &&
    isSafeId(payload.mapId) &&
    isPositiveInteger(payload.mapNumber) &&
    isSafeId(payload.difficulty) &&
    isSafeId(payload.startingWeaponId)
  );
}

function isRunEnded(payload: Record<string, unknown>): boolean {
  return (
    hasOnlyKeys(payload, [
      'outcome',
      'reason',
      'map',
      'durationS',
      'level',
      'kills',
      'bossesDefeated',
      'bossTypesDefeated',
      'damageTaken',
      'goldEarned',
      'chestsByTier',
      'shopPurchases',
      'contactS',
      'enclosedS',
      'enclosedLowHpS',
      'peakEnclosedSectors',
      'cursedFinal',
      'cursedTimeAvg',
      'totalDamage',
      'weaponLevels',
      'weaponBranches',
      'weaponDamage',
      'coreLevels',
      'modCounts',
      'startingWeaponId',
    ]) &&
    typeof payload.outcome === 'string' &&
    RUN_OUTCOMES.has(payload.outcome) &&
    isNonNegativeNumber(payload.durationS) &&
    isPositiveInteger(payload.level) &&
    isNonNegativeInteger(payload.kills) &&
    isNonNegativeInteger(payload.bossesDefeated) &&
    isRunMap(payload.map) &&
    isOptional(payload.reason, isSafeId) &&
    isOptional(payload.startingWeaponId, isSafeId) &&
    isOptional(payload.bossTypesDefeated, (value) => isDisplayLabelArray(value, 32)) &&
    [payload.damageTaken, payload.goldEarned, payload.contactS, payload.enclosedS,
      payload.enclosedLowHpS, payload.cursedFinal, payload.cursedTimeAvg, payload.totalDamage]
      .every((value) => isOptional(value, isNonNegativeNumber)) &&
    [payload.shopPurchases, payload.peakEnclosedSectors].every((value) => isOptional(value, isNonNegativeInteger)) &&
    [payload.chestsByTier, payload.weaponLevels, payload.weaponDamage, payload.coreLevels, payload.modCounts]
      .every((value) => isOptional(value, (entry) => isNumericDictionary(entry, 64))) &&
    isOptional(payload.weaponBranches, (value) => isNestedNumericDictionary(value, 16, 32))
  );
}

function isChoice(payload: Record<string, unknown>): boolean {
  if (typeof payload.choiceType !== 'string' || !CHOICE_TYPES.has(payload.choiceType)) return false;
  switch (payload.choiceType) {
    case 'level_up':
      return (
        hasOnlyKeys(payload, [
          'choiceType',
          'action',
          'selectedId',
          'rarity',
          'offeredIds',
          'level',
          'discardsRemaining',
          'discardsRemainingBefore',
        ]) &&
        (payload.action === 'selected' || payload.action === 'discarded') &&
        isSafeIdArray(payload.offeredIds, 16) &&
        isPositiveInteger(payload.level) &&
        (payload.action !== 'selected' || isSafeId(payload.selectedId))
      );
    case 'boss_summon':
      return (
        hasOnlyKeys(payload, ['choiceType', 'bossId', 'elapsedS', 'playerLevel']) &&
        isSafeId(payload.bossId) &&
        isNonNegativeNumber(payload.elapsedS)
      );
    case 'chest_purchase':
      return (
        hasOnlyKeys(payload, [
          'choiceType',
          'tier',
          'price',
          'rewardId',
          'rewardCopiesBefore',
          'elapsedS',
        ]) &&
        isSafeId(payload.tier) &&
        isNonNegativeNumber(payload.price) &&
        isSafeId(payload.rewardId) &&
        isNonNegativeNumber(payload.elapsedS)
      );
    case 'shop_purchase':
      return (
        hasOnlyKeys(payload, [
          'choiceType',
          'modId',
          'price',
          'goldBefore',
          'stockIds',
          'elapsedS',
        ]) &&
        isSafeId(payload.modId) &&
        isNonNegativeNumber(payload.price) &&
        isSafeIdArray(payload.stockIds, 32) &&
        isNonNegativeNumber(payload.elapsedS)
      );
    default:
      return false;
  }
}

function isPerformance(payload: Record<string, unknown>): boolean {
  return (
    hasOnlyKeys(payload, [
      'window',
      'elapsedS',
      'frameCount',
      'averageFps',
      'averageFrameMs',
      'p95FrameMs',
      'maxFrameMs',
      'slowFrameRatio',
      'averageActiveEnemies',
      'peakActiveEnemies',
    ]) &&
    (payload.window === 'periodic' || payload.window === 'final') &&
    isPositiveNumber(payload.elapsedS) &&
    isPositiveInteger(payload.frameCount) &&
    isNonNegativeNumber(payload.averageFps) &&
    isNonNegativeNumber(payload.averageFrameMs) &&
    isNonNegativeNumber(payload.p95FrameMs) &&
    isNonNegativeNumber(payload.maxFrameMs) &&
    isUnitNumber(payload.slowFrameRatio) &&
    isNonNegativeNumber(payload.averageActiveEnemies) &&
    isNonNegativeInteger(payload.peakActiveEnemies)
  );
}

function isFeedback(payload: Record<string, unknown>): boolean {
  return (
    hasOnlyKeys(payload, ['fun', 'difficulty', 'reasons']) &&
    isIntegerBetween(payload.fun, 1, 5) &&
    typeof payload.difficulty === 'string' &&
    FEEDBACK_DIFFICULTIES.has(payload.difficulty) &&
    Array.isArray(payload.reasons) &&
    payload.reasons.length <= FEEDBACK_REASONS.size &&
    payload.reasons.every((reason) => typeof reason === 'string' && FEEDBACK_REASONS.has(reason)) &&
    new Set(payload.reasons).size === payload.reasons.length
  );
}

function isJsonValue(value: unknown, depth: number, seen: Set<object>): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (depth >= MAX_JSON_DEPTH || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.length <= MAX_ARRAY_ITEMS && value.every((entry) => isJsonValue(entry, depth + 1, seen))
    : isPlainRecord(value) && Object.values(value).every((entry) => isJsonValue(entry, depth + 1, seen));
  seen.delete(value);
  return valid;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && SAFE_ID.test(value);
}

function isSafeIdArray(value: unknown, maxItems: number): value is string[] {
  return Array.isArray(value) && value.length <= maxItems && value.every(isSafeId);
}

function isDisplayLabelArray(value: unknown, maxItems: number): value is string[] {
  return Array.isArray(value) && value.length <= maxItems && value.every((entry) =>
    typeof entry === 'string' && entry.length <= 128 && entry.trim() === entry && DISPLAY_LABEL.test(entry));
}

function isRunMap(value: unknown): boolean {
  return (
    isPlainRecord(value) && hasOnlyKeys(value, ['id', 'number', 'title']) &&
    isSafeId(value.id) && isPositiveInteger(value.number) &&
    typeof value.title === 'string' && value.title.length > 0 && value.title.length <= 128
  );
}

function isOptional(value: unknown, validate: (entry: unknown) => boolean): boolean {
  return value === undefined || validate(value);
}

function isNumericDictionary(value: unknown, maxEntries: number): boolean {
  return (
    isPlainRecord(value) && Object.keys(value).length <= maxEntries &&
    Object.entries(value).every(([key, entry]) => isSafeId(key) && isNonNegativeNumber(entry))
  );
}

function isNestedNumericDictionary(value: unknown, maxEntries: number, maxNestedEntries: number): boolean {
  return (
    isPlainRecord(value) && Object.keys(value).length <= maxEntries &&
    Object.entries(value).every(([key, entry]) => isSafeId(key) && isNumericDictionary(entry, maxNestedEntries))
  );
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isPositiveNumber(value: unknown): value is number {
  return isNonNegativeNumber(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return isNonNegativeNumber(value) && Number.isInteger(value);
}

function isPositiveInteger(value: unknown): value is number {
  return isNonNegativeInteger(value) && value > 0;
}

function isIntegerBetween(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function isUnitNumber(value: unknown): value is number {
  return isNonNegativeNumber(value) && value <= 1;
}
