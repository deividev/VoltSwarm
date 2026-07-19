// Round 13 — two fixes:
//   1. Bolt Cannon re-voiced as an ELECTRIC arc (user: the noise fwip read as
//      "a ball launcher"). Crackle-gated noise sweep = spark texture without
//      tonal glass or bright drilling. Same frequent-sound law: dark, short,
//      low peak, 4 rotating micro-variants.
//   2. NEW xp-pickup and gold-pickup — the two most frequent reward blips.
//      Lowest rung of the loudness order: tiny, soft, distinct identities
//      (XP = smooth rising blip, Gold = small metallic clink), 4 variants each.
// Output: tmp/audio-prototypes/arc2-bolt-1..4.wav, pickup-xp-1..4.wav,
//         pickup-gold-1..4.wav
// Usage: node tools/audio/prototype-r13-arc-pickups.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RATE, mulberry32, buffer, biquad, addSub, addModal, addTransient,
  saturate, compress, normalize, fadeEdges, toWav,
} from './dsp.mjs';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tmp', 'audio-prototypes');

/** Crackle-gated noise through a falling resonant bandpass — electric arc body. */
function addArcNoise(data, rng, {
  fromHz, toHz, q, durSec, decaySec, gain, crackle = 0.22, startSec = 0,
}) {
  const start = Math.round(startSec * RATE);
  const len = Math.round(durSec * RATE);
  const chunk = 32;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  let b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
  let gate = 1;
  for (let i = 0; i < len && start + i < data.length; i++) {
    if (i % chunk === 0) {
      const k = i / len;
      const freq = fromHz * Math.pow(toHz / fromHz, k);
      const w0 = (2 * Math.PI * freq) / RATE;
      const alpha = Math.sin(w0) / (2 * q);
      const a0 = 1 + alpha;
      b0 = alpha / a0; b1 = 0; b2 = -alpha / a0;
      a1 = (-2 * Math.cos(w0)) / a0; a2 = (1 - alpha) / a0;
      if (rng() < crackle) gate = 0.2 + rng() * 0.8; // spark flicker
    }
    const t = i / RATE;
    const x = (rng() * 2 - 1) * gate * Math.exp(-t / decaySec);
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    data[start + i] += y * gain;
  }
}

// Electric arc shot: dry snap + crackling falling arc + small sub. No tones.
function boltArc(rng, dt) {
  const d = buffer(0.08);
  addTransient(d, rng, { lengthSec: 0.003, centerHz: 2900 * dt, q: 3, gain: 0.55 });
  addArcNoise(d, rng, {
    fromHz: 2300 * dt, toHz: 480 * dt, q: 2.6,
    durSec: 0.06, decaySec: 0.025, gain: 1.5, crackle: 0.3,
  });
  addSub(d, { from: 140 * dt, to: 84 * dt, glideSec: 0.03, decaySec: 0.028, gain: 0.35 });
  biquad(d, 'highpass', 130, 0.707);
  biquad(d, 'lowpass', 4200 * dt, 0.9);
  saturate(d, 1.35);
  compress(d, { threshold: 0.4, ratio: 3, makeup: 1.1 });
  return d;
}

// XP: tiny smooth rising blip — soft sine glide, barely-there noise tick.
function xpPickup(rng, dt) {
  const d = buffer(0.04);
  let phase = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / RATE;
    const k = t / 0.04;
    const freq = (700 + 320 * k) * dt;
    phase += (2 * Math.PI * freq) / RATE;
    d[i] += Math.sin(phase) * Math.min(t / 0.004, 1) * Math.exp(-t / 0.02);
  }
  addTransient(d, rng, { lengthSec: 0.002, centerHz: 2100 * dt, q: 4, gain: 0.12 });
  biquad(d, 'highpass', 260, 0.707);
  biquad(d, 'lowpass', 3600 * dt, 0.8);
  saturate(d, 1.15);
  return d;
}

// Gold: one small metallic clink (two quiet inharmonic modes) + soft low tap.
function goldPickup(rng, dt) {
  const d = buffer(0.05);
  addModal(d, rng, {
    modes: [1880 * dt, 2570 * dt], gains: [0.5, 0.28],
    decays: [0.02, 0.014], detuneCents: 10, gain: 0.9,
  });
  addSub(d, { from: 320 * dt, to: 170 * dt, glideSec: 0.015, decaySec: 0.016, gain: 0.3 });
  biquad(d, 'highpass', 220, 0.707);
  biquad(d, 'lowpass', 5200 * dt, 0.8);
  saturate(d, 1.15);
  return d;
}

mkdirSync(OUT_DIR, { recursive: true });

const SETS = {
  'arc2-bolt': { make: boltArc, seed: 131000, peak: 0.58 },
  'pickup-xp': { make: xpPickup, seed: 132000, peak: 0.42 },
  'pickup-gold': { make: goldPickup, seed: 133000, peak: 0.48 },
};
const DETUNES = [1, 0.95, 1.05, 0.9];

for (const [name, { make, seed, peak }] of Object.entries(SETS)) {
  for (let v = 0; v < DETUNES.length; v++) {
    const rng = mulberry32(seed + v * 7919);
    const d = make(rng, DETUNES[v]);
    normalize(d, peak);
    fadeEdges(d, 0.001, 0.006);
    const file = `${name}-${v + 1}.wav`;
    writeFileSync(resolve(OUT_DIR, file), toWav(d));
    console.log(`wrote ${file} (${(d.length / RATE * 1000).toFixed(0)} ms)`);
  }
}
