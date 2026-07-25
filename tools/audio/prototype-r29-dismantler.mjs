// Round 29 — Dismantler swipe: a HEAVY claw strike that dismantles a robot.
//
// Weapon: "Heavy claw strike. Instantly executes enemies below 15% HP." An amber
// claw slams the enemy (visual = an oversized claw mark, random angle). One-shot
// per strike (1.6s cooldown), so it can be meaty. Gesture = a heavy STRIKE impact
// + a TRIPLE metal SHRED (the dismantling) + a mechanical servo grind + a subtle
// amber electric edge (powered claw, our world).
//
// Distinctiveness (review 2026-07-21): use resonant-NOISE rakes (the accepted
// blades-hit "shear" texture, NOT modal = struck glass), but HEAVIER/darker/
// TRIPLE + a percussive impact + servo, so it reads as a heavy tearing STRIKE,
// clearly apart from blades-hit (a light bright single slice) and press-slam (a
// single hydraulic slab). Modern/produced: saturate + compress like the palette.
// Output: tmp/audio-prototypes/dismantler-swipe-1..3.wav
// Usage: node tools/audio/prototype-r29-dismantler.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RATE, mulberry32, buffer, biquad, addSub, addFm, addTransient,
  saturate, compress, normalize, fadeEdges, toWav,
} from './dsp.mjs';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tmp', 'audio-prototypes');

/** Torn-metal RAKE: resonant noise, center sweeping under a swell→cut window —
 *  one claw prong tearing through. Darker/heavier than the blades saw-shear. */
function addRake(data, rng, { fromHz, toHz, q, durSec, gain, startSec = 0 }) {
  const start = Math.round(startSec * RATE);
  const len = Math.round(durSec * RATE);
  const chunk = 12;
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
    const p = i / len;
    const env = p < 0.35
      ? Math.sin((p / 0.35) * (Math.PI / 2))
      : Math.cos(((p - 0.35) / 0.65) * (Math.PI / 2));
    const x = (rng() * 2 - 1);
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    data[start + i] += y * gain * env;
  }
}

/** Amber electric crackle — the powered claw's energy, keeps it in our world. */
function addArcNoise(data, rng, { fromHz, toHz, q, durSec, decaySec, gain, crackle = 0.35, startSec = 0 }) {
  const start = Math.round(startSec * RATE);
  const len = Math.round(durSec * RATE);
  const chunk = 24;
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
      if (rng() < crackle) gate = 0.25 + rng() * 0.75;
    }
    const t = i / RATE;
    const x = (rng() * 2 - 1) * gate * Math.exp(-t / decaySec);
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    data[start + i] += y * gain;
  }
}

/** One SHRED = a sharp attack tick ("shk") + a gritty torn-metal rake. The tick
 *  articulates it so three read as THREE, and low-Q (gritty) noise = tearing,
 *  not a whistle. This is the dominant, must-be-heard element. */
function addShred(data, rng, { attackHz, rakeFrom, rakeTo, gain, startSec }) {
  addTransient(data, rng, { lengthSec: 0.004, centerHz: attackHz, q: 1.3, gain: gain * 0.85, startSec });
  addRake(data, rng, { fromHz: rakeFrom, toHz: rakeTo, q: 2.6, durSec: 0.05, gain, startSec: startSec + 0.003 });
}

// Dismantler v2: a LIGHT strike lead-in, then a clearly-articulated TRIPLE shred.
// v1 buried the shred under a heavy strike + sub (user "no noté el triple
// desgarro"). Now the shreds are the loudest element, spaced ~45ms so you hear
// THREE, and grittier (low-Q = tearing, not a whistle).
function dismantlerSwipe(rng, dt) {
  const d = buffer(0.28);
  // 1) STRIKE lead-in — a light connect + modest thunk (weight, NOT a masker).
  addTransient(d, rng, { lengthSec: 0.005, centerHz: 2400 * dt, q: 1.5, gain: 0.4 });
  addSub(d, { from: 150 * dt, to: 60 * dt, glideSec: 0.04, decaySec: 0.06, gain: 0.4 });
  // 2) SERVO grind — a short descending mechanical "grr", subtle under it.
  addFm(d, { from: 360 * dt, to: 150 * dt, glideSec: 0.03, ratio: 1.5, index: 4, indexDecaySec: 0.018, ampDecaySec: 0.04, gain: 0.2, detune: 0.01, startSec: 0.004 });
  // 3) TRIPLE SHRED (the identity, now dominant) — three torn rakes, spaced ~45ms
  //    and descending = a claw raking across. Clearly THREE "shk-shk-shk" tears.
  addShred(d, rng, { attackHz: 3300 * dt, rakeFrom: 2700 * dt, rakeTo: 1050 * dt, gain: 0.64, startSec: 0.020 });
  addShred(d, rng, { attackHz: 3000 * dt, rakeFrom: 2350 * dt, rakeTo: 900 * dt, gain: 0.66, startSec: 0.065 });
  addShred(d, rng, { attackHz: 2700 * dt, rakeFrom: 2000 * dt, rakeTo: 780 * dt, gain: 0.7, startSec: 0.110 });
  // 4) AMBER electric edge — subtle powered-claw crackle over the shred.
  addArcNoise(d, rng, { fromHz: 2900 * dt, toHz: 1300 * dt, q: 2.0, durSec: 0.12, decaySec: 0.08, gain: 0.13, crackle: 0.4, startSec: 0.02 });
  // Keep the top present so the tears cut through (brighter than v1's 5.4k).
  biquad(d, 'highpass', 90, 0.707);
  biquad(d, 'lowpass', 6400 * dt, 0.85);
  saturate(d, 1.5);
  compress(d, { threshold: 0.36, ratio: 2.8, releaseSec: 0.06 });
  return d;
}

mkdirSync(OUT_DIR, { recursive: true });
const SETS = { 'dismantler-swipe': { make: dismantlerSwipe, seed: 291000, peak: 0.74 } };
// TIGHT variants (±2%) so the strike is consistent hit-to-hit.
const DETUNES = [1, 0.98, 1.02];
for (const [name, { make, seed, peak }] of Object.entries(SETS)) {
  for (let v = 0; v < DETUNES.length; v++) {
    const rng = mulberry32(seed + v * 7919);
    const d = make(rng, DETUNES[v]);
    normalize(d, peak);
    fadeEdges(d, 0.0004, 0.008);
    const file = `${name}-${v + 1}.wav`;
    writeFileSync(resolve(OUT_DIR, file), toWav(d));
    console.log(`wrote ${file} (${(d.length / RATE * 1000).toFixed(0)} ms)`);
  }
}
