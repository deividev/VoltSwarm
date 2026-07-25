// Round 22b — merchant-arrival take 2 (user: the whoosh+noise version felt
// generic). This one has CHARACTER: a mechanical rig pulling up and powering
// down (descending servo motor) → a warm park thunk → a friendly 3-note welcome
// motif (the "come shop" hook, now the star). Modern and warm, not a swoosh.
// Keeps the old merchant-arrival.wav on disk for A/B.
// Output: tmp/audio-prototypes/merchant-arrival-b.wav
// Usage: node tools/audio/prototype-r22b-merchant.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RATE, mulberry32, buffer, biquad, addSub, addModal, addTransient,
  addRing, saturate, compress, normalize, fadeEdges, toWav,
} from './dsp.mjs';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tmp', 'audio-prototypes');

function addSynth(data, { from, to = from, glideSec = 0, lengthSec, gain, startSec = 0, detune = 0.01, harmonics = 10, attackSec = 0.005, decayRatio = 0.6, wobbleHz = 0, wobbleDepth = 0 }) {
  const start = Math.round(startSec * RATE);
  const len = Math.round(lengthSec * RATE);
  for (const vd of [1 - detune, 1, 1 + detune]) {
    let phase = 0;
    for (let i = 0; i < len && start + i < data.length; i++) {
      const t = i / RATE;
      const k = glideSec > 0 ? Math.min(t / glideSec, 1) : 0;
      let freq = (glideSec > 0 ? from * Math.pow(to / from, k) : from) * vd;
      if (wobbleHz > 0) freq *= 1 + wobbleDepth * Math.sin(2 * Math.PI * wobbleHz * t);
      phase += freq / RATE;
      let s = 0;
      const maxH = Math.min(harmonics, Math.floor(7000 / freq));
      for (let h = 1; h <= Math.max(1, maxH); h++) s += Math.sin(2 * Math.PI * phase * h) / h;
      data[start + i] += s * (gain / 3) * Math.min(t / attackSec, 1) * Math.exp(-t / (lengthSec * decayRatio));
    }
  }
}

function merchantArrivalB(rng) {
  const d = buffer(0.78);
  // 1. Pulling up + powering down: a descending servo motor with a little wobble.
  addSynth(d, { from: 330, to: 148, glideSec: 0.26, lengthSec: 0.3, gain: 0.3, attackSec: 0.03, decayRatio: 1.3, wobbleHz: 22, wobbleDepth: 0.05 });
  // 2. Park thunk: warm and solid, not sharp.
  addSub(d, { from: 110, to: 58, glideSec: 0.04, decaySec: 0.12, gain: 0.6, startSec: 0.27 });
  addModal(d, rng, { modes: [280, 430], gains: [0.32, 0.16], decays: [0.05, 0.03], gain: 0.55, startSec: 0.27 });
  addTransient(d, rng, { lengthSec: 0.006, centerHz: 620, q: 1.4, gain: 0.35, startSec: 0.27 });
  // 3. Welcome motif: warm rising 3-note hook (A C# E major) — "come shop".
  addSynth(d, { from: 440, lengthSec: 0.18, gain: 0.26, startSec: 0.34, decayRatio: 0.85 });
  addSynth(d, { from: 554, lengthSec: 0.18, gain: 0.27, startSec: 0.44, decayRatio: 0.85 });
  addSynth(d, { from: 659, lengthSec: 0.3, gain: 0.3, startSec: 0.54, decayRatio: 0.8 });
  addRing(d, { freq: 1318, decaySec: 0.16, gain: 0.08, wobbleHz: 32, wobbleDepth: 0.05, startSec: 0.56 });
  biquad(d, 'highpass', 48, 0.707); biquad(d, 'lowpass', 5400, 0.9);
  saturate(d, 1.3); compress(d, { threshold: 0.35, ratio: 3 });
  return d;
}

mkdirSync(OUT_DIR, { recursive: true });
const d = merchantArrivalB(mulberry32(220500));
normalize(d, 0.75); fadeEdges(d, 0.0005, 0.015);
writeFileSync(resolve(OUT_DIR, 'merchant-arrival-b.wav'), toWav(d));
console.log(`wrote merchant-arrival-b.wav (${(d.length / RATE * 1000).toFixed(0)} ms)`);
