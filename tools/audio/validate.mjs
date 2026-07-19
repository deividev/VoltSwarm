import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { BIT_DEPTH, CHANNELS, EVENT_RECIPE, FADE_SECONDS, GENERATOR_HASH, RATE, RECIPES, TARGET_PEAK, VERSION, hash, inspectWav, variantCount } from './generate.mjs';

const root = resolve(import.meta.dirname, '../..');
const masterRoot = resolve(root, 'art/audio/sfx/masters');
const runtimeRoot = resolve(root, 'public');
const runtimeAudioRoot = resolve(root, 'public/assets/audio/sfx');
const tolerance = 0.002;

function filePath(path) { return resolve(root, path); }
function listedPaths(manifest) { return Object.values(manifest.events ?? {}).flat().flatMap((asset) => [asset.wav?.path, asset.runtime?.path]).filter(Boolean); }
export function validateManifest(manifest, { checkFiles = true } = {}) {
  const failures = [];
  if (manifest?.version !== VERSION) failures.push(`manifest version must be ${VERSION}`);
  if (manifest?.generator?.version !== VERSION || manifest?.generator?.hash !== GENERATOR_HASH) failures.push('manifest generator provenance mismatch');
  for (const [eventId, recipeId] of Object.entries(EVENT_RECIPE)) {
    const recipe = RECIPES[recipeId]; const entries = manifest?.events?.[eventId];
    if (!Array.isArray(entries) || entries.length !== variantCount(recipe)) { failures.push(`${eventId} has incomplete variant coverage`); continue; }
    entries.forEach((asset, index) => {
      if (asset.semanticEvent !== eventId || asset.recipeId !== recipeId || asset.family !== recipe.family || asset.recipeVersion !== recipe.version || asset.seed !== recipe.seed || asset.variantIndex !== index) failures.push(`${eventId} v${index + 1} recipe provenance mismatch`);
      if (asset.generatorVersion !== VERSION || asset.generatorHash !== GENERATOR_HASH) failures.push(`${eventId} v${index + 1} generator provenance mismatch`);
      if (!asset.runtime || !['ogg', 'wav'].includes(asset.runtime.format) || !asset.runtime.path?.endsWith(`.${asset.runtime.format}`)) failures.push(`${eventId} v${index + 1} has invalid runtime export metadata`);
      const wavMeta = asset.wav;
      const expectedChannels = recipe.channels ?? CHANNELS;
      if (!wavMeta || wavMeta.sampleRate !== RATE || wavMeta.channels !== expectedChannels || wavMeta.bitDepth !== BIT_DEPTH || wavMeta.sampleCount !== Math.round(recipe.duration * RATE)) failures.push(`${eventId} v${index + 1} has invalid WAV metadata`);
      if (wavMeta && (Math.abs(wavMeta.durationS - recipe.duration) > 1 / RATE || Math.abs(wavMeta.normalizationTarget - TARGET_PEAK) > tolerance || Math.abs(wavMeta.fadeSeconds - FADE_SECONDS) > Number.EPSILON)) failures.push(`${eventId} v${index + 1} has invalid duration/normalization/fade metadata`);
      if (!checkFiles || !wavMeta || !asset.runtime) return;
      const masterPath = filePath(wavMeta.path); const runtimePath = resolve(runtimeRoot, asset.runtime.path);
      if (!existsSync(masterPath)) { failures.push(`${eventId} v${index + 1} master missing`); return; }
      if (!existsSync(runtimePath)) failures.push(`${eventId} v${index + 1} runtime export missing`);
      const data = readFileSync(masterPath); let inspected;
      try { inspected = inspectWav(data); } catch (error) { failures.push(`${eventId} v${index + 1} invalid WAV: ${error.message}`); return; }
      if (hash(data) !== wavMeta.sha256) failures.push(`${eventId} v${index + 1} WAV hash mismatch`);
      if (inspected.sampleRate !== RATE || inspected.channels !== expectedChannels || inspected.bitDepth !== BIT_DEPTH || inspected.sampleCount !== Math.round(recipe.duration * RATE)) failures.push(`${eventId} v${index + 1} WAV format mismatch`);
      if (Math.abs(inspected.peak - TARGET_PEAK) > tolerance || inspected.first > tolerance || inspected.last > tolerance) failures.push(`${eventId} v${index + 1} is not normalized/click-safe`);
    });
  }
  if (checkFiles) {
    const listed = new Set(listedPaths(manifest));
    if (existsSync(masterRoot)) for (const name of readdirSync(masterRoot).filter((name) => name.endsWith('.wav'))) if (!listed.has(`art/audio/sfx/masters/${name}`)) failures.push(`orphan master ${name}`);
    if (existsSync(runtimeAudioRoot)) for (const name of readdirSync(runtimeAudioRoot).filter((name) => name !== 'manifest.json')) if (!listed.has(`assets/audio/sfx/${name}`)) failures.push(`orphan runtime export ${name}`);
  }
  return failures;
}
export function loadManifest() { return JSON.parse(readFileSync(resolve(root, 'tools/audio/manifest.json'), 'utf8')); }
if (process.argv[1]?.replace(/\\/g, '/').endsWith('/tools/audio/validate.mjs')) {
  const failures = validateManifest(loadManifest());
  if (failures.length) { failures.forEach((failure) => console.error(`audio validation: ${failure}`)); process.exit(1); }
  console.log(`audio validation passed: ${Object.keys(EVENT_RECIPE).length} semantic events, provenance and local exports verified`);
}
