// Round 23 — PHASE 5 weapons batch A: three maximally-distinct weapon voices to
// prove the per-weapon identity approach (each weapon its own gesture, like bolt).
//   pulse-fire     : capacitor charge-release — a round expanding electric ring.
//   press-slam     : hydraulic press — a servo whine drop into a heavy slab slam.
//   ricochet-throw : a scrap chunk tossed + a bright metallic PING (the identity).
// Style laws: modern/electric, dark-ish, asymmetric from each other and from the
// bolt burst; 3 rotating micro-variants so repeats don't drill.
// Output: tmp/audio-prototypes/{pulse-fire,press-slam,ricochet-throw}-1..3.wav
// Usage: node tools/audio/prototype-r23-weapons-a.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RATE, mulberry32, buffer, biquad, addSub, addModal, addTransient,
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

// Pulse: round expanding electric ring (charge → release → ring).
function pulseFire(rng, dt) {
  const d = buffer(0.17);
  addSynth(d, { from: 300 * dt, to: 540 * dt, glideSec: 0.06, lengthSec: 0.14, gain: 0.42, decayRatio: 0.9 });
  addArcNoise(d, rng, { fromHz: 2200 * dt, toHz: 700 * dt, q: 2.4, durSec: 0.03, decaySec: 0.014, gain: 0.3 });
  addRing(d, { freq: 880 * dt, decaySec: 0.09, gain: 0.18, wobbleHz: 42, wobbleDepth: 0.06, startSec: 0.02 });
  addSub(d, { from: 120 * dt, to: 80 * dt, glideSec: 0.03, decaySec: 0.05, gain: 0.35 });
  biquad(d, 'highpass', 95, 0.707); biquad(d, 'lowpass', 5200 * dt, 0.9);
  saturate(d, 1.4); compress(d, { threshold: 0.35, ratio: 3 });
  return d;
}

// Press: hydraulic servo whine dropping into a heavy slab slam.
function pressSlam(rng, dt) {
  const d = buffer(0.3);
  addSynth(d, { from: 720 * dt, to: 250 * dt, glideSec: 0.09, lengthSec: 0.1, gain: 0.28, decayRatio: 1, wobbleHz: 55, wobbleDepth: 0.08 });
  addTransient(d, rng, { lengthSec: 0.007, centerHz: 1300 * dt, q: 1.6, gain: 0.6, startSec: 0.1 });
  addSub(d, { from: 150 * dt, to: 44 * dt, glideSec: 0.04, decaySec: 0.1, gain: 1, startSec: 0.1 });
  addModal(d, rng, { modes: [285 * dt, 440 * dt, 700 * dt], gains: [0.4, 0.24, 0.13], decays: [0.05, 0.035, 0.022], gain: 0.7, startSec: 0.1 });
  biquad(d, 'highpass', 45, 0.707); biquad(d, 'lowpass', 3600 * dt, 0.9);
  saturate(d, 1.8); compress(d, { threshold: 0.3, ratio: 4, releaseSec: 0.05 });
  return d;
}

// Ricochet: a scrap chunk thrown + a bright metallic ping (the signature).
function ricochetThrow(rng, dt) {
  const d = buffer(0.15);
  addArcNoise(d, rng, { fromHz: 1400 * dt, toHz: 560 * dt, q: 1.4, durSec: 0.028, decaySec: 0.012, gain: 0.5, crackle: 0.1 });
  addModal(d, rng, { modes: [1850 * dt, 2560 * dt], gains: [0.5, 0.28], decays: [0.05, 0.032], detuneCents: 12, gain: 0.8, startSec: 0.006 });
  addSub(d, { from: 150 * dt, to: 90 * dt, glideSec: 0.02, decaySec: 0.03, gain: 0.3 });
  biquad(d, 'highpass', 150, 0.707); biquad(d, 'lowpass', 6800 * dt, 0.9);
  saturate(d, 1.3); compress(d, { threshold: 0.35, ratio: 3 });
  return d;
}

mkdirSync(OUT_DIR, { recursive: true });
const SETS = {
  'pulse-fire': { make: pulseFire, seed: 231000, peak: 0.72 },
  'press-slam': { make: pressSlam, seed: 232000, peak: 0.8 },
  'ricochet-throw': { make: ricochetThrow, seed: 233000, peak: 0.72 },
};
const DETUNES = [1, 0.96, 1.04];
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
