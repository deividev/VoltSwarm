// Round 22 — PHASE 2 batch D: economy (the last silent hooks).
//   merchant-arrival : the scrapper lands — descending whoosh -> solid landing
//                      thunk -> a warm inviting two-note chime ("come shop").
//   shop-purchase    : a confident mechanical accept clunk + a short rising
//                      bloom (gold leaves, power arrives). Bigger and more
//                      rewarding than the tiny ui-confirm click.
// Output: tmp/audio-prototypes/merchant-arrival.wav, shop-purchase-1..2.wav
// Usage: node tools/audio/prototype-r22-economy.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RATE, mulberry32, buffer, biquad, addSub, addModal, addTransient,
  addNoiseBed, addRing, saturate, compress, normalize, fadeEdges, toWav,
} from './dsp.mjs';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tmp', 'audio-prototypes');

function addSynth(data, { from, to = from, glideSec = 0, lengthSec, gain, startSec = 0, detune = 0.01, harmonics = 10, attackSec = 0.005, decayRatio = 0.6 }) {
  const start = Math.round(startSec * RATE);
  const len = Math.round(lengthSec * RATE);
  for (const vd of [1 - detune, 1, 1 + detune]) {
    let phase = 0;
    for (let i = 0; i < len && start + i < data.length; i++) {
      const t = i / RATE;
      const k = glideSec > 0 ? Math.min(t / glideSec, 1) : 0;
      const freq = (glideSec > 0 ? from * Math.pow(to / from, k) : from) * vd;
      phase += freq / RATE;
      let s = 0;
      const maxH = Math.min(harmonics, Math.floor(7000 / freq));
      for (let h = 1; h <= Math.max(1, maxH); h++) s += Math.sin(2 * Math.PI * phase * h) / h;
      data[start + i] += s * (gain / 3) * Math.min(t / attackSec, 1) * Math.exp(-t / (lengthSec * decayRatio));
    }
  }
}

function merchantArrival(rng) {
  const d = buffer(0.62);
  // 1. Whoosh in: a descending pitched approach + air.
  addSynth(d, { from: 520, to: 175, glideSec: 0.24, lengthSec: 0.26, gain: 0.3, attackSec: 0.02, decayRatio: 1.4 });
  addNoiseBed(d, rng, { decaySec: 0.12, gain: 0.22, centerHz: 1400, q: 1, startSec: 0 });
  // 2. Landing thunk: it sets down.
  addTransient(d, rng, { lengthSec: 0.007, centerHz: 780, q: 1.6, gain: 0.55, startSec: 0.25 });
  addSub(d, { from: 120, to: 54, glideSec: 0.04, decaySec: 0.12, gain: 0.7, startSec: 0.25 });
  addModal(d, rng, { modes: [300, 470], gains: [0.3, 0.16], decays: [0.05, 0.03], gain: 0.6, startSec: 0.25 });
  // 3. Inviting chime: warm rising two notes (come shop).
  addSynth(d, { from: 440, lengthSec: 0.22, gain: 0.26, startSec: 0.33, decayRatio: 0.8 });
  addSynth(d, { from: 587, lengthSec: 0.24, gain: 0.28, startSec: 0.42, decayRatio: 0.8 });
  addRing(d, { freq: 1320, decaySec: 0.14, gain: 0.08, startSec: 0.44 });
  biquad(d, 'highpass', 50, 0.707); biquad(d, 'lowpass', 5600, 0.9);
  saturate(d, 1.3); compress(d, { threshold: 0.35, ratio: 3 });
  return d;
}

function shopPurchase(rng, dt) {
  const d = buffer(0.42);
  // Accept clunk: solid mechanical transient + short modal knock.
  addTransient(d, rng, { lengthSec: 0.006, centerHz: 1200 * dt, q: 1.6, gain: 0.55 });
  addModal(d, rng, { modes: [320 * dt, 520 * dt], gains: [0.5, 0.26], decays: [0.035, 0.022], gain: 0.7 });
  addSub(d, { from: 130 * dt, to: 70 * dt, glideSec: 0.03, decaySec: 0.05, gain: 0.5 });
  // Bloom: gold leaves, power arrives — a quick rising two-note confirm.
  addSynth(d, { from: 523 * dt, lengthSec: 0.13, gain: 0.28, startSec: 0.05, decayRatio: 0.7 });
  addSynth(d, { from: 784 * dt, lengthSec: 0.16, gain: 0.3, startSec: 0.13, decayRatio: 0.7 });
  addRing(d, { freq: 1568 * dt, decaySec: 0.12, gain: 0.09, wobbleHz: 36, wobbleDepth: 0.05, startSec: 0.14 });
  biquad(d, 'highpass', 70, 0.707); biquad(d, 'lowpass', 6000 * dt, 0.9);
  saturate(d, 1.3); compress(d, { threshold: 0.34, ratio: 3 });
  return d;
}

mkdirSync(OUT_DIR, { recursive: true });

const ma = merchantArrival(mulberry32(220000));
normalize(ma, 0.75); fadeEdges(ma, 0.0005, 0.015);
writeFileSync(resolve(OUT_DIR, 'merchant-arrival.wav'), toWav(ma));
console.log(`wrote merchant-arrival.wav (${(ma.length / RATE * 1000).toFixed(0)} ms)`);

for (const [v, dt] of [[1, 1], [2, 0.97]]) {
  const d = shopPurchase(mulberry32(221000 + v), dt);
  normalize(d, 0.7); fadeEdges(d, 0.0005, 0.01);
  writeFileSync(resolve(OUT_DIR, `shop-purchase-${v}.wav`), toWav(d));
  console.log(`wrote shop-purchase-${v}.wav (${(d.length / RATE * 1000).toFixed(0)} ms)`);
}
