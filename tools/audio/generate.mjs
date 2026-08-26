import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export const VERSION = 'audio-authoring-v3';
export const RATE = 44_100;
export const CHANNELS = 1;
export const BIT_DEPTH = 16;
export const TARGET_PEAK = 0.92;
export const FADE_SECONDS = 0.008;
export const RECIPES = {
  'ui-confirm': { family: 'ui', version: 1, seed: 11, duration: .09, layers: ['square'], freq: 780 },
  'weapon-activation': { family: 'weapon', version: 1, seed: 21, duration: .12, layers: ['saw', 'noise'], freq: 180 },
  'bolt-cannon-fire': { family: 'weapon-prototype', version: 3, seed: 4979, duration: .12, kind: 'bolt-cannon' },
  'enemy-death': { family: 'death', version: 1, seed: 31, duration: .11, layers: ['noise', 'square'], freq: 140 },
  'xp-pickup': { family: 'pickup', version: 1, seed: 41, duration: .08, layers: ['sine'], freq: 620 },
  'gold-pickup': { family: 'pickup', version: 1, seed: 51, duration: .1, layers: ['square', 'sine'], freq: 510 },
  'player-hit': { family: 'player', version: 1, seed: 61, duration: .16, layers: ['noise', 'saw'], freq: 95 },
  'shield-block': { family: 'player', version: 1, seed: 71, duration: .16, layers: ['square', 'noise'], freq: 330 },
  'levelup-open': { family: 'ui', version: 1, seed: 81, duration: .25, layers: ['sine', 'square'], freq: 420 },
  'chest-open': { family: 'chest', version: 1, seed: 91, duration: .22, layers: ['noise', 'square'], freq: 210 },
  'chest-reveal': { family: 'chest', version: 1, seed: 101, duration: .34, layers: ['sine', 'saw'], freq: 260 },
  'merchant-arrival': { family: 'merchant', version: 1, seed: 111, duration: .3, layers: ['square', 'sine'], freq: 190 },
  'boss-awaken': { family: 'boss', version: 1, seed: 121, duration: .42, layers: ['saw', 'noise'], freq: 72 },
  'boss-defeat': { family: 'boss', version: 1, seed: 131, duration: .45, layers: ['square', 'sine'], freq: 155 },
  'run-victory': { family: 'run', version: 1, seed: 141, duration: .5, layers: ['sine', 'square'], freq: 240 },
  'run-defeat': { family: 'run', version: 1, seed: 151, duration: .42, layers: ['saw', 'noise'], freq: 80 },
  'foundation-music': { family: 'music', version: 1, seed: 161, duration: 4, layers: ['sine', 'square'], freq: 110, channels: 2 },
};
export const EVENT_RECIPE = {
  'ui-confirm': 'ui-confirm', 'ui-back': 'ui-confirm', 'panel-open': 'ui-confirm',
  'run-start': 'levelup-open', 'menu-enter': 'ui-confirm', 'pause': 'ui-confirm', 'resume': 'ui-confirm',
  'weapon-activation': 'weapon-activation', 'bolt-cannon-fire': 'bolt-cannon-fire', 'player-hit': 'player-hit', 'shield-block': 'shield-block',
  'enemy-death': 'enemy-death', 'xp-pickup': 'xp-pickup', 'gold-pickup': 'gold-pickup',
  'levelup-open': 'levelup-open', 'levelup-pick': 'levelup-open', 'chest-open': 'chest-open',
  'chest-reveal': 'chest-reveal', 'merchant-arrival': 'merchant-arrival', 'shop-purchase': 'gold-pickup',
  'boss-awaken': 'boss-awaken', 'boss-attack': 'boss-awaken', 'boss-defeat': 'boss-defeat',
  'run-victory': 'run-victory', 'run-defeat': 'run-defeat', 'foundation-music': 'foundation-music',
};
export const GENERATOR_HASH = hash(Buffer.from(JSON.stringify({ VERSION, RATE, defaultChannels: CHANNELS, BIT_DEPTH, TARGET_PEAK, FADE_SECONDS, RECIPES, EVENT_RECIPE })));

function rng(seed) { let x = seed >>> 0; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1; }
export function render(recipe, variant = 0) {
  if (recipe.kind === 'bolt-cannon') return renderBoltCannon(recipe, variant);
  const count = Math.max(1, Math.round(recipe.duration * RATE));
  const channels = recipe.channels ?? CHANNELS;
  const samples = new Float32Array(count * channels); const random = rng(recipe.seed + variant * 997);
  for (let i = 0; i < count; i++) {
    const t = i / RATE; const env = Math.min(1, t / FADE_SECONDS) * Math.max(0, 1 - t / recipe.duration);
    let value = 0;
    for (const layer of recipe.layers) {
      const phase = 2 * Math.PI * recipe.freq * (1 - t / recipe.duration * .35) * t;
      value += layer === 'noise' ? random() : layer === 'square' ? (Math.sin(phase) > 0 ? 1 : -1) : layer === 'saw' ? 2 * (phase / (2 * Math.PI) - Math.floor(.5 + phase / (2 * Math.PI))) : Math.sin(phase);
    }
    const quantized = Math.round(Math.max(-1, Math.min(1, value / recipe.layers.length * env * .78)) * 24) / 24;
    for (let channel = 0; channel < channels; channel++) samples[i * channels + channel] = quantized * (channel === 0 ? 1 : 0.88);
  }
  let peak = 0; for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const gain = peak ? TARGET_PEAK / peak : 1; return samples.map((sample) => sample * gain);
}

function renderBoltCannon(recipe, variant) {
  const count = Math.max(1, Math.round(recipe.duration * RATE));
  const samples = new Float32Array(count);
  const random = rng(recipe.seed + variant * 997);
  let noiseLow = 0;
  let noiseBody = 0;
  let noiseFast = 0;
  let previousInput = 0;
  let highPassState = 0;
  for (let i = 0; i < count; i++) {
    const t = i / RATE;
    const variation = 1 + (variant - 1) * .025;

    // Broadband actuator mass: filtered impact energy with no pitched sweep,
    // so it cannot read as a ball, drum, tube or elastic launcher.
    const rawNoise = random();
    noiseLow += .035 * (rawNoise - noiseLow);
    noiseBody += .16 * (rawNoise - noiseBody);
    noiseFast += .58 * (rawNoise - noiseFast);
    const actuator = (noiseBody * .9 + noiseLow * .45) * Math.exp(-t * 115);
    const mechanicalEdge = (noiseFast - noiseBody) * .7 * Math.exp(-t * 210);

    // Electromagnetic discharge is a dry high-frequency crack, not a tonal zap.
    const coilCrack = (rawNoise - noiseFast) * .42 * Math.exp(-t * 260);

    // Inharmonic steel jaws clamp the bolt for only a few milliseconds.
    const clampT = Math.max(0, t - .006);
    const clamp = t >= .006
      ? .16 * (
        Math.sin(2 * Math.PI * 947 * variation * clampT)
        + .63 * Math.sin(2 * Math.PI * 1531 * variation * clampT + .3)
        + .31 * Math.sin(2 * Math.PI * 2287 * variation * clampT + .8)
      ) * Math.exp(-clampT * 205)
      : 0;

    // Quiet feeder reset makes the source unmistakably mechanical.
    const returnT = Math.max(0, t - .058);
    const returnLatch = t >= .058
      ? .11 * (random() * .7 + Math.sin(2 * Math.PI * 487 * variation * returnT)) * Math.exp(-returnT * 155)
      : 0;

    const attack = Math.min(1, t / .0015);
    const release = Math.min(1, Math.max(0, (recipe.duration - t) / .012));
    const saturated = Math.tanh((actuator + mechanicalEdge + coilCrack + clamp + returnLatch) * 2.05) * attack * release;
    // Remove residual DC introduced by asymmetric saturation/noise.
    highPassState = .995 * (highPassState + saturated - previousInput);
    previousInput = saturated;
    samples[i] = highPassState;
  }
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const gain = peak ? TARGET_PEAK / peak : 1;
  return samples.map((sample) => sample * gain);
}
export function wav(samples, channels = CHANNELS) {
  const bytes = 44 + samples.length * 2; const buffer = Buffer.alloc(bytes);
  buffer.write('RIFF'); buffer.writeUInt32LE(bytes - 8, 4); buffer.write('WAVEfmt ', 8); buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(channels, 22); buffer.writeUInt32LE(RATE, 24); buffer.writeUInt32LE(RATE * channels * 2, 28);
  buffer.writeUInt16LE(channels * 2, 32); buffer.writeUInt16LE(BIT_DEPTH, 34); buffer.write('data', 36); buffer.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((sample, index) => buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), 44 + index * 2));
  return buffer;
}
export function hash(buffer) { return createHash('sha256').update(buffer).digest('hex'); }
export function inspectWav(buffer) {
  if (buffer.length < 44 || buffer.subarray(0, 4).toString() !== 'RIFF' || buffer.subarray(8, 12).toString() !== 'WAVE') throw new Error('invalid RIFF/WAVE header');
  const sampleRate = buffer.readUInt32LE(24); const channels = buffer.readUInt16LE(22); const bitDepth = buffer.readUInt16LE(34); const dataBytes = buffer.readUInt32LE(40);
  const sampleCount = dataBytes / (bitDepth / 8) / channels; let peak = 0;
  for (let offset = 44; offset < buffer.length; offset += 2) peak = Math.max(peak, Math.abs(buffer.readInt16LE(offset)) / 32767);
  return { sampleRate, channels, bitDepth, sampleCount, durationS: sampleCount / sampleRate, peak, first: Math.abs(buffer.readInt16LE(44)) / 32767, last: Math.abs(buffer.readInt16LE(buffer.length - 2)) / 32767 };
}
export function variantCount(recipe) { return recipe.family === 'pickup' || recipe.family === 'death' || recipe.family === 'weapon-prototype' ? 3 : 1; }

const root = resolve(import.meta.dirname, '../..');
const master = resolve(root, 'art/audio/sfx/masters');
// Recipe regression output only. The accepted runtime pack is reconstructed by
// rebuild-runtime-pack.mjs; foundation experiments must never overwrite it.
const runtime = resolve(root, 'tmp/audio-foundation-runtime');
const runtimePath = (name, ext) => `tmp/audio-foundation-runtime/${name}.${ext}`;
function exportRuntime(wavPath, name, wavData) {
  const oggPath = resolve(runtime, `${name}.ogg`);
  const ffmpeg = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const result = spawnSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', wavPath, '-c:a', 'libvorbis', '-q:a', '5', oggPath], { stdio: 'pipe' });
  if (result.status === 0 && existsSync(oggPath)) return { format: 'ogg', path: runtimePath(name, 'ogg') };
  const fallbackPath = resolve(runtime, `${name}.wav`); writeFileSync(fallbackPath, wavData);
  console.warn(`ffmpeg OGG export failed for ${name}; using valid WAV fallback: ${result.stderr?.toString().trim() || result.error?.message || 'unknown error'}`);
  return { format: 'wav', path: runtimePath(name, 'wav') };
}
export function generate() {
  rmSync(runtime, { recursive: true, force: true }); mkdirSync(runtime, { recursive: true }); mkdirSync(master, { recursive: true });
  const recipeAssets = {};
  for (const [recipeId, recipe] of Object.entries(RECIPES)) {
    recipeAssets[recipeId] = [];
    for (let variantIndex = 0; variantIndex < variantCount(recipe); variantIndex++) {
      const name = `${recipeId}-v${variantIndex + 1}`; const wavPath = resolve(master, `${name}.wav`); const wavData = wav(render(recipe, variantIndex), recipe.channels ?? CHANNELS);
      writeFileSync(wavPath, wavData); const inspected = inspectWav(wavData); const runtimeExport = exportRuntime(wavPath, name, wavData);
      recipeAssets[recipeId].push({ semanticEvent: recipeId, family: recipe.family, recipeId, recipeVersion: recipe.version, seed: recipe.seed, variantIndex, generatorVersion: VERSION, generatorHash: GENERATOR_HASH, wav: { path: `art/audio/sfx/masters/${name}.wav`, sha256: hash(wavData), ...inspected, normalizationTarget: TARGET_PEAK, fadeSeconds: FADE_SECONDS }, runtime: runtimeExport });
    }
  }
  const events = Object.fromEntries(Object.entries(EVENT_RECIPE).map(([eventId, recipeId]) => [eventId, recipeAssets[recipeId].map((asset) => ({ ...asset, semanticEvent: eventId }))]));
  const manifest = { version: VERSION, generator: { version: VERSION, hash: GENERATOR_HASH }, events };
  const serialized = JSON.stringify(manifest, null, 2) + '\n';
  writeFileSync(resolve(root, 'tools/audio/foundation-manifest.json'), serialized); writeFileSync(resolve(runtime, 'manifest.json'), serialized);
  return manifest;
}
if (process.argv[1]?.replace(/\\/g, '/').endsWith('/tools/audio/generate.mjs')) {
  const manifest = generate();
  console.log(`audio generation complete: ${Object.keys(manifest.events).length} semantic events`);
}
