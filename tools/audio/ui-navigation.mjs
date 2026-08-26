import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RATE, wav } from './generate.mjs';

export const UI_NAVIGATION_VERSION = 'ui-navigation-v1';
export const UI_NAVIGATION_RECIPES = {
  'ui-focus': { seed: 211, variants: 4, durationS: 0.055 },
  'ui-back': { seed: 307, variants: 1, durationS: 0.08 },
};
export const UI_NAVIGATION_HASH = createHash('sha256')
  .update(JSON.stringify({ UI_NAVIGATION_VERSION, RATE, UI_NAVIGATION_RECIPES }))
  .digest('hex');

function random(seed) { let state = seed >>> 0; return () => ((state = (state * 1664525 + 1013904223) >>> 0) / 0x1_0000_0000) * 2 - 1; }
function normalize(samples) {
  let peak = 0; for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  return samples.map((sample) => sample * (peak ? 0.92 / peak : 1));
}
export function renderUiNavigation(recipeId, variantIndex = 0) {
  const recipe = UI_NAVIGATION_RECIPES[recipeId];
  if (!recipe) throw new Error(`Unknown UI navigation recipe: ${recipeId}`);
  const samples = new Float32Array(Math.round(recipe.durationS * RATE));
  const noise = random(recipe.seed + variantIndex * 997);
  let low = 0;
  for (let index = 0; index < samples.length; index++) {
    const t = index / RATE;
    const attack = Math.min(1, t / 0.004);
    const release = Math.max(0, 1 - t / recipe.durationS);
    low += 0.075 * (noise() - low);
    const drift = 1 + (variantIndex - 1.5) * 0.018;
    const tone = Math.sin(2 * Math.PI * (recipeId === 'ui-back' ? 360 : 510) * drift * t);
    // Filtered electrical texture, never a square/chiptune oscillator.
    samples[index] = (low * 0.72 + tone * 0.18) * attack * release * release;
  }
  return normalize(samples);
}

const root = resolve(import.meta.dirname, '../..');
const candidateRoot = resolve(root, 'tmp/audio-prototypes/ui-navigation');
const hash = (data) => createHash('sha256').update(data).digest('hex');
const writeIfChanged = (path, data) => {
  try { if (readFileSync(path).equals(data)) return; } catch { /* first generation */ }
  writeFileSync(path, data);
};

export function generateUiNavigationPrototypes() {
  const generated = {};
  mkdirSync(candidateRoot, { recursive: true });
  for (const [eventId, recipe] of Object.entries(UI_NAVIGATION_RECIPES)) {
    generated[eventId] = Array.from({ length: recipe.variants }, (_, variantIndex) => {
      const name = `${eventId}-v${variantIndex + 1}`;
      const data = wav(renderUiNavigation(eventId, variantIndex));
      writeIfChanged(resolve(candidateRoot, `${name}.wav`), data);
      return {
        candidate: { path: `tmp/audio-prototypes/ui-navigation/${name}.wav`, format: 'wav' },
        provenance: { recipeId: eventId, version: UI_NAVIGATION_VERSION, seed: recipe.seed, variantIndex, generatorHash: UI_NAVIGATION_HASH, sha256: hash(data) },
      };
    });
  }
  return generated;
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/tools/audio/ui-navigation.mjs')) {
  const candidates = generateUiNavigationPrototypes();
  console.log(`UI navigation candidates generated: ${candidates['ui-focus'].length} focus variants + ${candidates['ui-back'].length} back variant (not promoted)`);
}
