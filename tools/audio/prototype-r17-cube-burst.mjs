// Round 17 — enemy death as a literal CUBE BURST (user: "explosion of little
// cubes", not abstract clicks). Each debris piece is a tiny resonant KNOCK —
// dice-on-a-table "tok", two inharmonic modes, random pitch per piece (cube
// size) — laid out like real physics: dense burst cluster first, then a few
// quieter rebounds trailing off.
// Output: tmp/audio-prototypes/cube-death-1..4.wav
// Usage: node tools/audio/prototype-r17-cube-burst.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RATE, mulberry32, buffer, biquad, addSub, addModal,
  saturate, normalize, fadeEdges, toWav,
} from './dsp.mjs';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tmp', 'audio-prototypes');

/** One tiny cube knock: short dual-mode resonance, dice/woodblock character. */
function addCubeKnock(data, rng, { atSec, sizeHz, gain }) {
  addModal(data, rng, {
    modes: [sizeHz, sizeHz * 1.83],
    gains: [1, 0.45],
    decays: [0.014 + rng() * 0.008, 0.009],
    detuneCents: 18,
    gain,
    startSec: atSec,
  });
}

function cubeBurst(rng, dt) {
  const d = buffer(0.16);
  // The pop that launches the pieces.
  addSub(d, { from: 200 * dt, to: 80 * dt, glideSec: 0.018, decaySec: 0.022, gain: 0.7 });
  // Burst cluster: 4-5 pieces knocking almost at once (0-35ms).
  const cluster = 4 + Math.floor(rng() * 2);
  for (let i = 0; i < cluster; i++) {
    addCubeKnock(d, rng, {
      atSec: 0.004 + rng() * 0.03,
      sizeHz: (430 + rng() * 620) * dt,
      gain: 0.5 + rng() * 0.25,
    });
  }
  // Rebounds: 2-3 stragglers bouncing out, quieter and slightly higher (small bits).
  const rebounds = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < rebounds; i++) {
    const t = 0.05 + i * (0.028 + rng() * 0.02);
    addCubeKnock(d, rng, {
      atSec: t,
      sizeHz: (620 + rng() * 760) * dt,
      gain: 0.3 * (1 - i * 0.3),
    });
  }
  biquad(d, 'highpass', 110, 0.707);
  biquad(d, 'lowpass', 3000 * dt, 0.8);
  saturate(d, 1.3);
  return d;
}

mkdirSync(OUT_DIR, { recursive: true });
const DETUNES = [1, 0.95, 1.05, 0.9];
for (let v = 0; v < DETUNES.length; v++) {
  const rng = mulberry32(171000 + v * 7919);
  const d = cubeBurst(rng, DETUNES[v]);
  normalize(d, 0.33);
  fadeEdges(d, 0.0005, 0.01);
  const file = `cube-death-${v + 1}.wav`;
  writeFileSync(resolve(OUT_DIR, file), toWav(d));
  console.log(`wrote ${file} (${(d.length / RATE * 1000).toFixed(0)} ms)`);
}
