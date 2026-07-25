// Round 18b — player-hit take 2 (user: r18 hit felt "raro"). Likely culprit:
// the downward FM "stress bend" reads as synthy/cartoon, not as an impact.
// This version is PURE PHYSICAL IMPACT: noise smack + heavy sub kick + tight
// dark metal knock + a little grit crunch. No tonal bend at all.
// Keeps the old player-hit-1/2 on disk for A/B; wires these as the active sound.
// Output: tmp/audio-prototypes/player-hit-b-1..2.wav
// Usage: node tools/audio/prototype-r18b-hit.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RATE, mulberry32, buffer, biquad, addSub, addModal, addTransient,
  addNoiseBed, saturate, compress, normalize, fadeEdges, toWav,
} from './dsp.mjs';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tmp', 'audio-prototypes');

// Solid metal impact: smack + kick body + tight knock + grit. No tonal bend.
function playerHitB(rng, dt) {
  const d = buffer(0.18);
  // Smack: the contact — short filtered noise transient.
  addTransient(d, rng, { lengthSec: 0.006, centerHz: 1200 * dt, q: 1.6, gain: 0.7 });
  // Metal knock: tight low modal, fast decay — a clunk, not a ringing bell.
  addModal(d, rng, {
    modes: [180 * dt, 300 * dt, 470 * dt], gains: [0.7, 0.3, 0.14],
    decays: [0.04, 0.025, 0.018], detuneCents: 10, gain: 0.8,
  });
  // Body: heavy sub kick — the weight of taking a hit.
  addSub(d, { from: 165 * dt, to: 46 * dt, glideSec: 0.025, decaySec: 0.085, gain: 1 });
  // Grit: short low-mid noise crunch layered on the contact.
  addNoiseBed(d, rng, { decaySec: 0.02, gain: 0.35, centerHz: 700 * dt, q: 1, startSec: 0.002 });
  biquad(d, 'highpass', 50, 0.707);
  biquad(d, 'lowpass', 3200 * dt, 0.9);
  saturate(d, 1.8);
  compress(d, { threshold: 0.3, ratio: 4, releaseSec: 0.05 });
  return d;
}

mkdirSync(OUT_DIR, { recursive: true });
const DETUNES = [1, 0.96];
for (let v = 0; v < DETUNES.length; v++) {
  const rng = mulberry32(183000 + v * 7919);
  const d = playerHitB(rng, DETUNES[v]);
  normalize(d, 0.82);
  fadeEdges(d, 0.0005, 0.008);
  const file = `player-hit-b-${v + 1}.wav`;
  writeFileSync(resolve(OUT_DIR, file), toWav(d));
  console.log(`wrote ${file} (${(d.length / RATE * 1000).toFixed(0)} ms)`);
}
