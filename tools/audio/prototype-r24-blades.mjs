// Round 24 — Saw Blades spin-up: an ascending electric whir as the blades rev.
// Style: modern electric resonance, not a retro synth. Quick attack, bright.
// Output: tmp/audio-prototypes/{blades-spin}-1..3.wav
// Usage: node tools/audio/prototype-r24-blades.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RATE, mulberry32, buffer, biquad, addSub, addTransient,
  addRing, saturate, compress, normalize, fadeEdges, toWav,
} from './dsp.mjs';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tmp', 'audio-prototypes');

function addSynth(data, { from, to = from, glideSec = 0, lengthSec, gain, startSec = 0, detune = 0.012, harmonics = 8, attackSec = 0.004, decayRatio = 0.6, wobbleHz = 0, wobbleDepth = 0 }) {
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

function addArcNoise(data, rng, { fromHz, toHz, q, durSec, decaySec, gain, crackle = 0.25, startSec = 0 }) {
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

// Saw Blades spin-up: ascending electric whir (480→1200 Hz over 0.12s)
// High harmonics, bright attack, electric wobble for modern modulation
function bladesSpin(rng, dt) {
  const d = buffer(0.12);
  // Main whir: rapid ascent from 480→1200 Hz with bright harmonics
  addSynth(d, { from: 480 * dt, to: 1200 * dt, glideSec: 0.11, lengthSec: 0.12, gain: 0.48, attackSec: 0.006, decayRatio: 0.7, wobbleHz: 18, wobbleDepth: 0.04, harmonics: 12 });
  // Bright electric noise burst at the start (impact of engagement)
  addArcNoise(d, rng, { fromHz: 2800 * dt, toHz: 1600 * dt, q: 2.2, durSec: 0.04, decaySec: 0.035, gain: 0.25, crackle: 0.08 });
  // Sub body (very brief, supports the whir)
  addSub(d, { from: 140 * dt, to: 95 * dt, glideSec: 0.08, decaySec: 0.08, gain: 0.22, startSec: 0.01 });
  // Tight highpass (spin is bright) + lowpass (control the top end)
  biquad(d, 'highpass', 280, 0.707);
  biquad(d, 'lowpass', 4800 * dt, 1.0);
  saturate(d, 1.5);
  compress(d, { threshold: 0.38, ratio: 2.5 });
  return d;
}

mkdirSync(OUT_DIR, { recursive: true });
const SETS = {
  'blades-spin': { make: bladesSpin, seed: 241000, peak: 0.75 },
};
const DETUNES = [1, 0.97, 1.03];
for (const [name, { make, seed, peak }] of Object.entries(SETS)) {
  for (let v = 0; v < DETUNES.length; v++) {
    const rng = mulberry32(seed + v * 7919);
    const d = make(rng, DETUNES[v]);
    normalize(d, peak);
    fadeEdges(d, 0.0003, 0.006);
    const file = `${name}-${v + 1}.wav`;
    writeFileSync(resolve(OUT_DIR, file), toWav(d));
    console.log(`wrote ${file} (${(d.length / RATE * 1000).toFixed(0)} ms)`);
  }
}
