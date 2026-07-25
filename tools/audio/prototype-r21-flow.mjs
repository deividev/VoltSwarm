// Round 21 — PHASE 2 batch C: run-flow (silent hooks), designed as mirrored pairs.
//   run-start    : quick modern power-on rise; hands off to music.
//   menu-enter   : soft settle returning to the menu (ui-confirm's calm sibling).
//   pause/resume : a down-tick / up-tick pair (freeze / unfreeze).
//   run-victory  : triumphant rising bloom stinger (bigger than level-up).
//   run-defeat   : machine power-DOWN — descending, de-energizing (the one place
//                  a downward glide fits: the robot literally shutting off).
// Single deterministic take each (rare one-shots).
// Output: tmp/audio-prototypes/{run-start,menu-enter,pause,resume,run-victory,run-defeat}.wav
// Usage: node tools/audio/prototype-r21-flow.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RATE, mulberry32, buffer, biquad, addSub, addModal, addTransient,
  addRing, saturate, compress, normalize, fadeEdges, toWav,
} from './dsp.mjs';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tmp', 'audio-prototypes');

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

function runStart(rng) {
  const d = buffer(0.45);
  addSub(d, { from: 58, to: 112, glideSec: 0.28, decaySec: 0.2, gain: 0.4 });
  addSynth(d, { from: 200, to: 620, glideSec: 0.3, lengthSec: 0.34, gain: 0.42, decayRatio: 1 });
  addRing(d, { freq: 1500, decaySec: 0.12, gain: 0.1, wobbleHz: 34, wobbleDepth: 0.05, startSec: 0.28 });
  addTransient(d, rng, { lengthSec: 0.004, centerHz: 2200, q: 3, gain: 0.25, startSec: 0.3 });
  biquad(d, 'highpass', 45, 0.707); biquad(d, 'lowpass', 6000, 0.9);
  saturate(d, 1.3); compress(d, { threshold: 0.35, ratio: 3 });
  return d;
}

function menuEnter(rng) {
  const d = buffer(0.3);
  addSynth(d, { from: 540, to: 330, glideSec: 0.22, lengthSec: 0.26, gain: 0.36, decayRatio: 0.8 });
  addSub(d, { from: 130, to: 92, glideSec: 0.05, decaySec: 0.08, gain: 0.28 });
  addRing(d, { freq: 1100, decaySec: 0.08, gain: 0.07, startSec: 0.01 });
  biquad(d, 'highpass', 90, 0.707); biquad(d, 'lowpass', 5200, 0.9);
  saturate(d, 1.2);
  return d;
}

function pauseTick(rng) {
  const d = buffer(0.14);
  addTransient(d, rng, { lengthSec: 0.004, centerHz: 1800, q: 3, gain: 0.4 });
  addSynth(d, { from: 720, to: 360, glideSec: 0.09, lengthSec: 0.1, gain: 0.4, decayRatio: 0.7 });
  biquad(d, 'highpass', 160, 0.707); biquad(d, 'lowpass', 5000, 0.9);
  saturate(d, 1.2);
  return d;
}

function resumeTick(rng) {
  const d = buffer(0.14);
  addTransient(d, rng, { lengthSec: 0.004, centerHz: 1500, q: 3, gain: 0.35 });
  addSynth(d, { from: 360, to: 760, glideSec: 0.09, lengthSec: 0.1, gain: 0.4, decayRatio: 0.7 });
  biquad(d, 'highpass', 160, 0.707); biquad(d, 'lowpass', 5400, 0.9);
  saturate(d, 1.2);
  return d;
}

function runVictory(rng) {
  const d = buffer(1.25);
  addSub(d, { from: 140, to: 96, glideSec: 0.08, decaySec: 0.25, gain: 0.45 });
  const notes = [523, 659, 784, 880, 1046];
  notes.forEach((f, i) => addSynth(d, { from: f, lengthSec: 0.16, gain: 0.3 + i * 0.02, startSec: 0.04 + i * 0.12 }));
  addSynth(d, { from: 1319, lengthSec: 0.5, gain: 0.32, startSec: 0.66, decayRatio: 0.7 });
  addSynth(d, { from: 1976, lengthSec: 0.42, gain: 0.16, startSec: 0.68, decayRatio: 0.7 });
  addRing(d, { freq: 2093, decaySec: 0.3, gain: 0.1, wobbleHz: 36, wobbleDepth: 0.05, startSec: 0.68 });
  biquad(d, 'highpass', 60, 0.707); biquad(d, 'lowpass', 7000, 0.9);
  saturate(d, 1.4); compress(d, { threshold: 0.34, ratio: 3, releaseSec: 0.1 });
  return d;
}

function runDefeat(rng) {
  const d = buffer(1.25);
  // Everything winds DOWN: the machine losing power (downward glide fits here).
  addSynth(d, { from: 440, to: 110, glideSec: 0.9, lengthSec: 1.0, gain: 0.4, detune: 0.015, decayRatio: 1 });
  addSub(d, { from: 120, to: 34, glideSec: 0.7, decaySec: 0.5, gain: 0.7 });
  addModal(d, rng, { modes: [90, 150], gains: [0.3, 0.15], decays: [0.4, 0.25], gain: 0.6, startSec: 0.85 });
  // Final low thud — the shutdown lands.
  addTransient(d, rng, { lengthSec: 0.006, centerHz: 700, q: 1.4, gain: 0.4, startSec: 0.92 });
  biquad(d, 'highpass', 40, 0.707); biquad(d, 'lowpass', 4200, 0.9);
  saturate(d, 1.4); compress(d, { threshold: 0.34, ratio: 3, releaseSec: 0.12 });
  return d;
}

mkdirSync(OUT_DIR, { recursive: true });
const SET = [
  ['run-start', runStart, 0.7], ['menu-enter', menuEnter, 0.6],
  ['pause', pauseTick, 0.6], ['resume', resumeTick, 0.6],
  ['run-victory', runVictory, 0.9], ['run-defeat', runDefeat, 0.85],
];
for (const [name, make, peak] of SET) {
  const d = make(mulberry32(210000 + name.length));
  normalize(d, peak);
  fadeEdges(d, 0.0005, 0.012);
  writeFileSync(resolve(OUT_DIR, `${name}.wav`), toWav(d));
  console.log(`wrote ${name}.wav (${(d.length / RATE * 1000).toFixed(0)} ms)`);
}
