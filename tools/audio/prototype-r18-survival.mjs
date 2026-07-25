// Round 18 — PHASE 2 batch A: survival feedback (silent hooks).
//   player-hit   : PRIORITY danger sound — must cut through the whole mix.
//                  Metallic clang + heavy sub thud + a short downward "stress"
//                  bend. The robot TAKING damage. High peak, not spammable.
//   shield-block : the POSITIVE twin — a bright electric deflect crack + a
//                  barrier "ting" shimmer, NO heavy low thud, NO downward bend.
//                  Reads as "absorbed", never as pain. Clearly distinct.
// Style laws: modern, dark-ish but present, short; 2 rotating micro-variants.
// Output: tmp/audio-prototypes/player-hit-1..2.wav, shield-block-1..2.wav
// Usage: node tools/audio/prototype-r18-survival.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RATE, mulberry32, buffer, biquad, addSub, addModal, addTransient,
  addFm, addRing, saturate, compress, normalize, fadeEdges, toWav,
} from './dsp.mjs';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tmp', 'audio-prototypes');

// Crackle-gated noise through a falling resonant bandpass — electric arc.
function addArcNoise(data, rng, { fromHz, toHz, q, durSec, decaySec, gain, crackle = 0.3, startSec = 0 }) {
  const start = Math.round(startSec * RATE);
  const len = Math.round(durSec * RATE);
  const chunk = 32;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0, gate = 1;
  for (let i = 0; i < len && start + i < data.length; i++) {
    if (i % chunk === 0) {
      const k = i / len;
      const freq = fromHz * Math.pow(toHz / fromHz, k);
      const w0 = (2 * Math.PI * freq) / RATE;
      const alpha = Math.sin(w0) / (2 * q);
      const a0 = 1 + alpha;
      b0 = alpha / a0; b1 = 0; b2 = -alpha / a0;
      a1 = (-2 * Math.cos(w0)) / a0; a2 = (1 - alpha) / a0;
      if (rng() < crackle) gate = 0.2 + rng() * 0.8;
    }
    const t = i / RATE;
    const x = (rng() * 2 - 1) * gate * Math.exp(-t / decaySec);
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    data[start + i] += y * gain;
  }
}

// player-hit: heavy metallic damage. Present and alarming, never fleshy.
function playerHit(rng, dt) {
  const d = buffer(0.22);
  addTransient(d, rng, { lengthSec: 0.005, centerHz: 1400 * dt, q: 2, gain: 0.6 });
  addModal(d, rng, {
    modes: [240 * dt, 410 * dt, 650 * dt], gains: [0.6, 0.35, 0.2],
    decays: [0.06, 0.04, 0.03], detuneCents: 12, gain: 0.9,
  });
  addSub(d, { from: 175 * dt, to: 50 * dt, glideSec: 0.03, decaySec: 0.09, gain: 1 });
  // Short downward "stress" bend — the damage cue on top of the clang.
  addFm(d, { from: 320 * dt, to: 130 * dt, glideSec: 0.07, ratio: 1.5, index: 2,
    indexDecaySec: 0.04, ampDecaySec: 0.06, gain: 0.3 });
  biquad(d, 'highpass', 55, 0.707);
  biquad(d, 'lowpass', 3600 * dt, 0.9);
  saturate(d, 1.7);
  compress(d, { threshold: 0.3, ratio: 4, releaseSec: 0.05 });
  return d;
}

// shield-block: bright electric deflect + barrier ting. Positive, no low thud.
function shieldBlock(rng, dt) {
  const d = buffer(0.16);
  addTransient(d, rng, { lengthSec: 0.004, centerHz: 3200 * dt, q: 2, gain: 0.7 });
  addArcNoise(d, rng, { fromHz: 2600 * dt, toHz: 900 * dt, q: 2.4, durSec: 0.05,
    decaySec: 0.02, gain: 0.7, crackle: 0.35 });
  // Barrier ting: a steady bright ring (steady = held/absorbed, not falling).
  addRing(d, { freq: 1550 * dt, decaySec: 0.09, gain: 0.24, wobbleHz: 40, wobbleDepth: 0.05, startSec: 0.006 });
  addRing(d, { freq: 2320 * dt, decaySec: 0.07, gain: 0.12, startSec: 0.008 });
  addSub(d, { from: 135 * dt, to: 92 * dt, glideSec: 0.02, decaySec: 0.03, gain: 0.3 });
  biquad(d, 'highpass', 200, 0.707);
  biquad(d, 'lowpass', 6800 * dt, 0.9);
  saturate(d, 1.3);
  compress(d, { threshold: 0.35, ratio: 3 });
  return d;
}

mkdirSync(OUT_DIR, { recursive: true });

const SETS = {
  'player-hit': { make: playerHit, seed: 181000, peak: 0.85 },
  'shield-block': { make: shieldBlock, seed: 182000, peak: 0.72 },
};
const DETUNES = [1, 0.96];

for (const [name, { make, seed, peak }] of Object.entries(SETS)) {
  for (let v = 0; v < DETUNES.length; v++) {
    const rng = mulberry32(seed + v * 7919);
    const d = make(rng, DETUNES[v]);
    normalize(d, peak);
    fadeEdges(d, 0.0005, 0.008);
    const file = `${name}-${v + 1}.wav`;
    writeFileSync(resolve(OUT_DIR, file), toWav(d));
    console.log(`wrote ${file} (${(d.length / RATE * 1000).toFixed(0)} ms)`);
  }
}
