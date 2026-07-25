// Round 19 — PHASE 2 batch B: boss moments (silent hooks).
//   boss-awaken : giant machine powering up — telegraph impact -> rising
//                 electric power surge -> eruption. Menacing but modern/electric
//                 (never horror drone or orchestral). Pairs with the portal VFX
//                 (strobe -> warning rings -> eruption). The biggest tension cue.
//   boss-defeat : the BIGGEST cube burst in the game (giant collapse) + a
//                 triumphant modern synth victory bloom. The payoff.
// Rare one-shots: single deterministic take each, high peak, will pin.
// Output: tmp/audio-prototypes/boss-awaken.wav, boss-defeat.wav
// Usage: node tools/audio/prototype-r19-boss.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RATE, mulberry32, buffer, biquad, addSub, addModal, addTransient,
  addRing, saturate, compress, normalize, fadeEdges, toWav,
} from './dsp.mjs';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tmp', 'audio-prototypes');

// Band-limited saw synth voice (the album's modern lead voice) for the bloom.
function addSynth(data, { from, to = from, glideSec = 0, lengthSec, gain, startSec = 0, detune = 0.01, harmonics = 10, decayRatio = 0.6 }) {
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
      data[start + i] += s * (gain / 3) * Math.min(t / 0.004, 1) * Math.exp(-t / (lengthSec * decayRatio));
    }
  }
}

// Rising filtered-noise surge (power building) — envelope climbs, not decays.
function addRisingSurge(data, rng, { fromHz, toHz, q, durSec, gain, startSec, rise = 1.6 }) {
  const start = Math.round(startSec * RATE);
  const len = Math.round(durSec * RATE);
  const chunk = 32;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
  for (let i = 0; i < len && start + i < data.length; i++) {
    if (i % chunk === 0) {
      const k = i / len;
      const freq = fromHz * Math.pow(toHz / fromHz, k);
      const w0 = (2 * Math.PI * freq) / RATE;
      const alpha = Math.sin(w0) / (2 * q);
      const a0 = 1 + alpha;
      b0 = alpha / a0; b1 = 0; b2 = -alpha / a0;
      a1 = (-2 * Math.cos(w0)) / a0; a2 = (1 - alpha) / a0;
    }
    const k = i / len;
    const x = (rng() * 2 - 1) * Math.pow(k, rise);
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    data[start + i] += y * gain;
  }
}

function addCubeKnock(data, rng, { atSec, sizeHz, gain }) {
  addModal(data, rng, {
    modes: [sizeHz, sizeHz * 1.83], gains: [1, 0.45],
    decays: [0.02 + rng() * 0.01, 0.012], detuneCents: 18, gain, startSec: atSec,
  });
}

function bossAwaken(rng) {
  const d = buffer(0.95);
  // 1. Telegraph impact + deep boom.
  addTransient(d, rng, { lengthSec: 0.007, centerHz: 1600, q: 1.6, gain: 0.7 });
  addSub(d, { from: 95, to: 34, glideSec: 0.05, decaySec: 0.4, gain: 1 });
  addModal(d, rng, { modes: [88, 132, 176], gains: [0.4, 0.24, 0.14], decays: [0.3, 0.2, 0.14], gain: 0.7 });
  // 2. Rising power surge (0.12-0.65) — menace building.
  addRisingSurge(d, rng, { fromHz: 380, toHz: 1700, q: 2.2, durSec: 0.53, gain: 0.5, startSec: 0.12 });
  addSynth(d, { from: 110, to: 220, glideSec: 0.5, lengthSec: 0.55, gain: 0.28, startSec: 0.12, decayRatio: 1.2 });
  // 3. Eruption (0.62) — the boss is here.
  addTransient(d, rng, { lengthSec: 0.008, centerHz: 2200, q: 1.4, gain: 0.8 });
  addSub(d, { from: 130, to: 40, glideSec: 0.04, decaySec: 0.22, gain: 0.9, startSec: 0.62 });
  addRing(d, { freq: 90, decaySec: 0.25, gain: 0.3, startSec: 0.63 });
  biquad(d, 'highpass', 34, 0.707);
  biquad(d, 'lowpass', 5200, 0.9);
  saturate(d, 1.7);
  compress(d, { threshold: 0.3, ratio: 4, releaseSec: 0.1 });
  return d;
}

function bossDefeat(rng) {
  const d = buffer(1.15);
  // 1. Giant collapse: big sub + a large cube burst (lower, denser than a mob).
  addSub(d, { from: 180, to: 40, glideSec: 0.03, decaySec: 0.16, gain: 1 });
  const cluster = 9;
  for (let i = 0; i < cluster; i++) {
    addCubeKnock(d, rng, { atSec: 0.004 + rng() * 0.34, sizeHz: 260 + rng() * 520, gain: 0.4 + rng() * 0.25 });
  }
  // 2. Victory bloom (0.34-1.05): rising saw arpeggio, bright and triumphant.
  const notes = [392, 494, 587, 698, 880];
  notes.forEach((f, i) => {
    addSynth(d, { from: f, lengthSec: 0.14, gain: 0.3 + i * 0.02, startSec: 0.34 + i * 0.1 });
  });
  addSynth(d, { from: 1046, lengthSec: 0.4, gain: 0.34, startSec: 0.84, decayRatio: 0.7 });
  addSynth(d, { from: 1568, lengthSec: 0.34, gain: 0.18, startSec: 0.86, decayRatio: 0.7 });
  addRing(d, { freq: 1760, decaySec: 0.2, gain: 0.1, wobbleHz: 38, wobbleDepth: 0.05, startSec: 0.86 });
  biquad(d, 'highpass', 45, 0.707);
  biquad(d, 'lowpass', 6500, 0.9);
  saturate(d, 1.5);
  compress(d, { threshold: 0.32, ratio: 3, releaseSec: 0.1 });
  return d;
}

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, make, peak] of [['boss-awaken', bossAwaken, 0.92], ['boss-defeat', bossDefeat, 0.9]]) {
  const d = make(mulberry32(190000 + name.length));
  normalize(d, peak);
  fadeEdges(d, 0.0005, 0.02);
  writeFileSync(resolve(OUT_DIR, `${name}.wav`), toWav(d));
  console.log(`wrote ${name}.wav (${(d.length / RATE * 1000).toFixed(0)} ms)`);
}
