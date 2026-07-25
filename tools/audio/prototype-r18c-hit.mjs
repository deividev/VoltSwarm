// Round 18c — player-hit take 3 (user: too similar to the bolt shot → the
// player confuses "I'm firing" with "I'm being hit"). Root cause: both are
// bright-ish electric percussion in the same frequency band.
// Fix = TOTAL FREQUENCY SEPARATION. The bolt owns the highs (bright electric
// crackle); player-hit owns the LOWS only: a deep dull "whump" body blow —
// heavy sub + muffled low knock, hard lowpass ~900Hz, NO bright transient, NO
// electric texture. Felt in the chest, unmistakable against the weapon.
// Output: tmp/audio-prototypes/player-hit-c-1..2.wav
// Usage: node tools/audio/prototype-r18c-hit.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RATE, mulberry32, buffer, biquad, addSub, addModal, addNoiseBed,
  saturate, compress, normalize, fadeEdges, toWav,
} from './dsp.mjs';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tmp', 'audio-prototypes');

// Deep dull body blow — lives entirely below the weapon's frequency range.
function playerHitC(rng, dt) {
  const d = buffer(0.2);
  // Heavy sub kick — the weight, the thing you feel.
  addSub(d, { from: 150 * dt, to: 42 * dt, glideSec: 0.03, decaySec: 0.1, gain: 1 });
  // Muffled low knock — dull body, heavily damped (no ring, no clang).
  addModal(d, rng, {
    modes: [118 * dt, 205 * dt], gains: [0.5, 0.22],
    decays: [0.055, 0.032], detuneCents: 8, gain: 0.8,
  });
  // Soft muffled thump texture — dark, no bright contact.
  addNoiseBed(d, rng, { decaySec: 0.03, gain: 0.28, centerHz: 320 * dt, q: 0.8, startSec: 0.001 });
  biquad(d, 'highpass', 38, 0.707);
  biquad(d, 'lowpass', 900 * dt, 0.9); // hard ceiling: no highs to clash with the bolt
  saturate(d, 1.5);
  compress(d, { threshold: 0.32, ratio: 4, releaseSec: 0.06 });
  return d;
}

mkdirSync(OUT_DIR, { recursive: true });
const DETUNES = [1, 0.95];
for (let v = 0; v < DETUNES.length; v++) {
  const rng = mulberry32(184000 + v * 7919);
  const d = playerHitC(rng, DETUNES[v]);
  normalize(d, 0.85);
  fadeEdges(d, 0.0005, 0.01);
  const file = `player-hit-c-${v + 1}.wav`;
  writeFileSync(resolve(OUT_DIR, file), toWav(d));
  console.log(`wrote ${file} (${(d.length / RATE * 1000).toFixed(0)} ms)`);
}
