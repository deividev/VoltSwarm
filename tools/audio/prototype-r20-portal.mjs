// Round 20 — portal charge (the missing tension layer). Between the summon key
// press and the boss appearing there is a 2.5s telegraph (BOSS.summonDelayS):
// the portal spins fast, the beam strobes (~2.86Hz), warning rings pulse.
// This sound fills that window: a rising electric charge that builds tension,
// strobe pulses matching the beam, ending right as boss-awaken erupts.
// Authored to the REAL telegraph length; cut on spawn via stopLoop as a safety.
// Output: tmp/audio-prototypes/boss-portal.wav
// Usage: node tools/audio/prototype-r20-portal.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RATE, mulberry32, buffer, biquad, addTransient, saturate, compress,
  normalize, fadeEdges, toWav,
} from './dsp.mjs';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tmp', 'audio-prototypes');
const D = 2.5;          // must match BOSS.summonDelayS
const BEAM_HZ = 18 / (2 * Math.PI); // beam strobe rate in boss.ts (~2.86Hz)

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

function portalCharge(rng) {
  const d = buffer(D);
  const N = d.length;
  // Rising drone: two detuned low voices climbing 62 -> 150 Hz, amplitude rising.
  for (const vd of [0.992, 1.008]) {
    let phase = 0;
    for (let i = 0; i < N; i++) {
      const k = i / N;
      const freq = (62 + 88 * k) * vd;
      phase += freq / RATE;
      // A few harmonics for an electric (not pure) drone.
      const s = Math.sin(2 * Math.PI * phase) + 0.4 * Math.sin(4 * Math.PI * phase) + 0.2 * Math.sin(6 * Math.PI * phase);
      d[i] += s * 0.18 * Math.pow(k, 1.15);
    }
  }
  // Strobe pulses matching the beam — electric ticks getting louder/tighter.
  const interval = 1 / BEAM_HZ;
  for (let t = 0.15; t < D - 0.1; t += interval) {
    const k = t / D;
    addTransient(d, rng, {
      lengthSec: 0.01, centerHz: 900 + 1400 * k, q: 2.5,
      gain: (0.12 + 0.4 * k), startSec: t,
    });
  }
  // Rising noise surge over the final approach — the charge peaking.
  addRisingSurge(d, rng, { fromHz: 500, toHz: 2400, q: 2, durSec: 1.4, gain: 0.4, startSec: 1.05, rise: 2.2 });
  biquad(d, 'highpass', 42, 0.707);
  biquad(d, 'lowpass', 4600, 0.9);
  saturate(d, 1.3);
  compress(d, { threshold: 0.4, ratio: 3, releaseSec: 0.1 });
  return d;
}

mkdirSync(OUT_DIR, { recursive: true });
const d = portalCharge(mulberry32(200000));
normalize(d, 0.62); // sits under the boss-awaken eruption that follows
fadeEdges(d, 0.004, 0.08); // taper the tail so it never clashes with the eruption
writeFileSync(resolve(OUT_DIR, 'boss-portal.wav'), toWav(d));
console.log(`wrote boss-portal.wav (${(d.length / RATE * 1000).toFixed(0)} ms)`);
