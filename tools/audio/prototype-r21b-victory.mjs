// Round 21b — run-victory take 2 (user: the arpeggio bloom felt too much like
// a big level-up). This version is an ANTHEM, not a ding: a short rising swell
// that BUILDS, then a full major chord that LANDS with weight, sustains and
// shimmers out with a high sparkle. "You won", not "you leveled".
// Keeps the old run-victory.wav on disk for A/B; wires this as the active sound.
// Output: tmp/audio-prototypes/run-victory-b.wav
// Usage: node tools/audio/prototype-r21b-victory.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RATE, mulberry32, buffer, biquad, addSub, addTransient, addRing,
  saturate, compress, normalize, fadeEdges, toWav,
} from './dsp.mjs';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tmp', 'audio-prototypes');

function addSynth(data, { from, to = from, glideSec = 0, lengthSec, gain, startSec = 0, detune = 0.012, harmonics = 10, attackSec = 0.006, decayRatio = 0.6 }) {
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

function runVictoryB(rng) {
  const d = buffer(1.5);
  const LAND = 0.34; // when the chord hits

  // 1. Build: a quick rising swell into the landing.
  addSynth(d, { from: 180, to: 523, glideSec: LAND, lengthSec: LAND + 0.02, gain: 0.22, attackSec: 0.02, decayRatio: 1.5 });
  const surgeLen = Math.round(LAND * RATE);
  for (let i = 0; i < surgeLen; i++) { // rising noise shimmer into the hit
    const k = i / surgeLen;
    d[i] += (rng() * 2 - 1) * 0.1 * Math.pow(k, 2.4);
  }

  // 2. Land: a full major chord (C E G C) blooming, with weight.
  addTransient(d, rng, { lengthSec: 0.006, centerHz: 2000, q: 1.6, gain: 0.5, startSec: LAND });
  addSub(d, { from: 98, to: 66, glideSec: 0.05, decaySec: 0.5, gain: 0.7, startSec: LAND });
  const chord = [262, 330, 392, 523];
  for (const f of chord) {
    addSynth(d, { from: f, lengthSec: 1.05, gain: 0.24, startSec: LAND, attackSec: 0.008, decayRatio: 0.85 });
  }

  // 3. Sparkle on top + shimmer tail — the triumphant sheen.
  addSynth(d, { from: 1046, lengthSec: 0.5, gain: 0.22, startSec: LAND + 0.16, decayRatio: 0.7 });
  addRing(d, { freq: 1568, decaySec: 0.35, gain: 0.12, wobbleHz: 34, wobbleDepth: 0.05, startSec: LAND + 0.2 });
  addRing(d, { freq: 2093, decaySec: 0.28, gain: 0.08, wobbleHz: 41, wobbleDepth: 0.05, startSec: LAND + 0.22 });

  biquad(d, 'highpass', 55, 0.707);
  biquad(d, 'lowpass', 7200, 0.9);
  saturate(d, 1.4);
  compress(d, { threshold: 0.32, ratio: 3, releaseSec: 0.12 });
  return d;
}

mkdirSync(OUT_DIR, { recursive: true });
const d = runVictoryB(mulberry32(211500));
normalize(d, 0.9);
fadeEdges(d, 0.0005, 0.02);
writeFileSync(resolve(OUT_DIR, 'run-victory-b.wav'), toWav(d));
console.log(`wrote run-victory-b.wav (${(d.length / RATE * 1000).toFixed(0)} ms)`);
