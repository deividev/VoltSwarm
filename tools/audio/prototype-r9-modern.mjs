// Round 9 — PHASE 2: full SFX regeneration in the Neon Horizon music style.
// Contract: identical gestures and timings to the validated set (behavior is
// approved), modern timbres only — no square waves, no bitcrush, no retro.
// Timbre family: warm detuned-saw synth plucks/sweeps, clean transients, deep
// sine subs, subtle saturation — the sound world of the chosen music bed.
// Regenerates: bolt x3, enemy-death x3, ui-confirm x2, levelup-intro,
// levelup-open, chest-open latch, chest-spin (bezier-synced), chest-reveal.
// Output: tmp/audio-prototypes/modern-*.wav
// Usage: node tools/audio/prototype-r9-modern.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RATE, mulberry32, buffer, biquad, addModal, addTransient, addSub, addRing,
  saturate, compress, normalize, fadeEdges, toWav,
} from './dsp.mjs';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tmp', 'audio-prototypes');

// Animation constants (must mirror hud.ts / config.ts — zero-latency rule).
const REEL_SECONDS = 2.6;
const REEL_CELLS = 18;
const ICON_RISE_SECONDS = 0.6;
const INTRO_SECONDS = 0.72;
const BEZ = { x1: 0.12, y1: 0.82, x2: 0.2, y2: 1 };

const bezAxis = (u, a, b) => 3 * (1 - u) * (1 - u) * u * a + 3 * (1 - u) * u * u * b + u * u * u;
function reelTimeAtProgress(fraction) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (bezAxis(mid, BEZ.y1, BEZ.y2) < fraction) lo = mid; else hi = mid;
  }
  return bezAxis((lo + hi) / 2, BEZ.x1, BEZ.x2) * REEL_SECONDS;
}

/** Modern synth voice: 3 detuned band-limited saws, fast attack, exp decay.
 *  Optional exponential pitch glide (from -> to over glideSec). */
function addSynth(data, {
  from, to = from, glideSec = 0, lengthSec, gain, startSec = 0,
  detune = 0.008, harmonics = 10, decayRatio = 0.55,
}) {
  const start = Math.round(startSec * RATE);
  const len = Math.round(lengthSec * RATE);
  const voices = [1 - detune, 1, 1 + detune];
  for (const vd of voices) {
    let phase = 0;
    for (let i = 0; i < len && start + i < data.length; i++) {
      const t = i / RATE;
      const k = glideSec > 0 ? Math.min(t / glideSec, 1) : 0;
      const freq = (glideSec > 0 ? from * Math.pow(to / from, k) : from) * vd;
      phase += freq / RATE;
      // Band-limited saw: sum of decaying harmonics below ~7 kHz.
      let s = 0;
      const maxH = Math.min(harmonics, Math.floor(7000 / freq));
      for (let h = 1; h <= Math.max(1, maxH); h++) {
        s += Math.sin(2 * Math.PI * phase * h) / h;
      }
      const env = Math.min(t / 0.003, 1) * Math.exp(-t / (lengthSec * decayRatio));
      data[start + i] += s * (gain / voices.length) * env;
    }
  }
}

// --- Combat ---

// Bolt: same 90ms descending "pew" gesture — saw-stack sweep, clean click, sub.
function boltModern(rng, dt) {
  const d = buffer(0.09);
  addTransient(d, rng, { lengthSec: 0.004, centerHz: 2600 * dt, q: 4, gain: 0.5 });
  addSynth(d, { from: 1450 * dt, to: 360 * dt, glideSec: 0.055, lengthSec: 0.08, gain: 0.85, harmonics: 8 });
  addSub(d, { from: 150 * dt, to: 80 * dt, glideSec: 0.03, decaySec: 0.035, gain: 0.5 });
  biquad(d, 'highpass', 110, 0.707);
  biquad(d, 'lowpass', 5200 * dt, 1);
  saturate(d, 1.5);
  compress(d, { threshold: 0.34, ratio: 4 });
  return d;
}

// Enemy death: same short pop gesture — round sine drop + soft synth blip.
function deathModern(rng, dt) {
  const d = buffer(0.08);
  addSub(d, { from: 310 * dt, to: 92 * dt, glideSec: 0.026, decaySec: 0.028, gain: 1 });
  addSynth(d, { from: 720 * dt, to: 260 * dt, glideSec: 0.03, lengthSec: 0.05, gain: 0.3, harmonics: 6 });
  addTransient(d, rng, { lengthSec: 0.003, centerHz: 1900 * dt, q: 4, gain: 0.25 });
  biquad(d, 'highpass', 80, 0.707);
  biquad(d, 'lowpass', 3200 * dt, 0.8);
  saturate(d, 1.4);
  compress(d, { threshold: 0.35, ratio: 3 });
  return d;
}

// UI confirm: sharp click + tiny warm pluck (instant attack — latency rule).
function uiModern(rng, dt) {
  const d = buffer(0.06);
  addTransient(d, rng, { lengthSec: 0.004, centerHz: 2200 * dt, q: 3.5, gain: 0.5 });
  addSynth(d, { from: 1150 * dt, lengthSec: 0.04, gain: 0.4, harmonics: 6 });
  addRing(d, { freq: 1600 * dt, decaySec: 0.02, gain: 0.06, startSec: 0.006 });
  biquad(d, 'highpass', 240, 0.707);
  biquad(d, 'lowpass', 6200 * dt, 0.8);
  saturate(d, 1.2);
  return d;
}

// --- Level-up (two stages, same windows) ---

// Stage 1: fanfare inside the 0.72s LEVEL UP text — impact, rising pluck run,
// top dyad rung out before the draft opens.
function levelupIntroModern(rng) {
  const d = buffer(INTRO_SECONDS + 0.06);
  addTransient(d, rng, { lengthSec: 0.005, centerHz: 2000, q: 3.5, gain: 0.45 });
  addModal(d, rng, { modes: [520, 890], gains: [0.3, 0.15], decays: [0.028, 0.02], gain: 0.5 });
  addSub(d, { from: 165, to: 72, glideSec: 0.045, decaySec: 0.07, gain: 0.9 });
  const notes = [330, 392, 440, 494, 587, 659];
  notes.forEach((f, i) => {
    addSynth(d, { from: f, lengthSec: 0.08, gain: 0.28 + i * 0.02, startSec: 0.05 + i * 0.055 });
  });
  addSynth(d, { from: 880, lengthSec: 0.26, gain: 0.32, startSec: 0.44, decayRatio: 0.7 });
  addSynth(d, { from: 1319, lengthSec: 0.22, gain: 0.18, startSec: 0.46, decayRatio: 0.7 });
  addRing(d, { freq: 1760, decaySec: 0.1, gain: 0.09, wobbleHz: 38, wobbleDepth: 0.05, startSec: 0.46 });
  biquad(d, 'highpass', 80, 0.707);
  biquad(d, 'lowpass', 6200, 0.9);
  saturate(d, 1.4);
  compress(d, { threshold: 0.34, ratio: 3, releaseSec: 0.08 });
  return d;
}

// Stage 2: draft opens — the original approved bloom gesture (three rising
// sweeps + warm body + shimmer), rebuilt with clean synth sweeps.
function levelupOpenModern(rng) {
  const d = buffer(0.5);
  addSub(d, { from: 150, to: 95, glideSec: 0.05, decaySec: 0.08, gain: 0.55 });
  addSynth(d, { from: 420, to: 900, glideSec: 0.05, lengthSec: 0.09, gain: 0.3 });
  addSynth(d, { from: 620, to: 1350, glideSec: 0.05, lengthSec: 0.09, gain: 0.32, startSec: 0.09 });
  addSynth(d, { from: 840, to: 1900, glideSec: 0.06, lengthSec: 0.11, gain: 0.34, startSec: 0.18 });
  addModal(d, rng, { modes: [260, 390], gains: [0.18, 0.1], decays: [0.14, 0.1], gain: 0.8 });
  addRing(d, { freq: 1250, decaySec: 0.14, gain: 0.1, wobbleHz: 34, wobbleDepth: 0.05, startSec: 0.26 });
  addRing(d, { freq: 1870, decaySec: 0.12, gain: 0.07, wobbleHz: 41, wobbleDepth: 0.05, startSec: 0.28 });
  biquad(d, 'highpass', 90, 0.707);
  biquad(d, 'lowpass', 6200, 0.9);
  saturate(d, 1.35);
  compress(d, { threshold: 0.35, ratio: 3, releaseSec: 0.08 });
  return d;
}

// --- Chest (three acts, same choreography) ---

// Act 1: latch pop — mechanical body is not "retro", keep it, cleaner drive.
function chestLatchModern(rng) {
  const d = buffer(0.24);
  addTransient(d, rng, { lengthSec: 0.006, centerHz: 1700, q: 3.5, gain: 0.55 });
  addModal(d, rng, {
    modes: [430, 760, 1150], gains: [0.7, 0.4, 0.2], decays: [0.045, 0.03, 0.02], gain: 0.8,
  });
  addSub(d, { from: 150, to: 62, glideSec: 0.04, decaySec: 0.06, gain: 0.85 });
  biquad(d, 'highpass', 70, 0.707);
  biquad(d, 'lowpass', 4200, 0.9);
  saturate(d, 1.5);
  compress(d, { threshold: 0.32, ratio: 4 });
  return d;
}

// Act 2: suspense riser — bezier-exact cell ticks as clean plucks over a
// warm swelling bed (no bitcrush), shimmer on the final approach.
function chestSpinModern(rng) {
  const d = buffer(REEL_SECONDS);
  for (let cell = 1; cell < REEL_CELLS; cell++) {
    const t = reelTimeAtProgress(cell / REEL_CELLS);
    const k = cell / REEL_CELLS;
    addSynth(d, {
      from: 820 + 600 * k, lengthSec: 0.02 + 0.02 * k,
      gain: 0.22 + 0.14 * k, startSec: t, harmonics: 5,
    });
  }
  const bed = buffer(REEL_SECONDS);
  for (let i = 0; i < bed.length; i++) {
    const t = i / RATE;
    const k = t / REEL_SECONDS;
    const freq = 105 * Math.pow(2, k);
    bed[i] = Math.sin(2 * Math.PI * freq * t + 2.2 * Math.sin(2 * Math.PI * freq * 2.01 * t)) * 0.26 * Math.pow(k, 1.8);
  }
  for (let i = 0; i < d.length; i++) d[i] += bed[i];
  const start = Math.round((REEL_SECONDS - 0.7) * RATE);
  for (let i = start; i < d.length; i++) {
    const k = (i - start) / (d.length - start);
    d[i] += (rng() * 2 - 1) * 0.09 * k * k;
  }
  biquad(d, 'highpass', 90, 0.707);
  biquad(d, 'lowpass', 5600, 0.9);
  saturate(d, 1.3);
  compress(d, { threshold: 0.35, ratio: 3, releaseSec: 0.08 });
  return d;
}

// Act 3: reveal — impact in the flash, pluck arpeggio riding the 0.6s icon
// rise, sustained top note landing as the icon settles.
function chestRevealModern(rng) {
  const d = buffer(1.05);
  addTransient(d, rng, { lengthSec: 0.006, centerHz: 1500, q: 3, gain: 0.5 });
  addSub(d, { from: 140, to: 70, glideSec: 0.05, decaySec: 0.09, gain: 0.8 });
  addModal(d, rng, { modes: [430, 760], gains: [0.35, 0.18], decays: [0.035, 0.025], gain: 0.55 });
  const stepLen = ICON_RISE_SECONDS / 4;
  const steps = [330, 415, 494, 659];
  steps.forEach((f, i) => {
    addSynth(d, {
      from: f, lengthSec: stepLen * 0.9, gain: 0.36 - i * 0.02,
      startSec: 0.1 + i * stepLen * 0.83,
    });
  });
  addSynth(d, { from: 880, lengthSec: 0.34, gain: 0.34, startSec: ICON_RISE_SECONDS, decayRatio: 0.7 });
  addRing(d, { freq: 1760, decaySec: 0.14, gain: 0.08, wobbleHz: 36, wobbleDepth: 0.05, startSec: ICON_RISE_SECONDS });
  addSub(d, { from: 120, to: 82, glideSec: 0.12, decaySec: 0.2, gain: 0.35, startSec: 0.1 });
  biquad(d, 'highpass', 75, 0.707);
  biquad(d, 'lowpass', 5600, 0.9);
  saturate(d, 1.4);
  compress(d, { threshold: 0.34, ratio: 3, releaseSec: 0.08 });
  return d;
}

mkdirSync(OUT_DIR, { recursive: true });

const SETS = {
  'modern-bolt': { make: boltModern, variants: 3, seed: 101000, peak: 0.85, detuned: true },
  'modern-enemy-death': { make: deathModern, variants: 3, seed: 102000, peak: 0.8, detuned: true },
  'modern-ui-confirm': { make: uiModern, variants: 2, seed: 103000, peak: 0.7, detuned: true },
  'modern-levelup-intro': { make: levelupIntroModern, variants: 1, seed: 104000, peak: 0.88 },
  'modern-levelup-open': { make: levelupOpenModern, variants: 1, seed: 105000, peak: 0.85 },
  'modern-chest-open': { make: chestLatchModern, variants: 1, seed: 106000, peak: 0.85 },
  'modern-chest-spin': { make: chestSpinModern, variants: 1, seed: 107000, peak: 0.72 },
  'modern-chest-reveal': { make: chestRevealModern, variants: 1, seed: 108000, peak: 0.88 },
};
const DETUNES = [1, 0.955, 1.045];

for (const [name, { make, variants, seed, peak, detuned }] of Object.entries(SETS)) {
  for (let v = 0; v < variants; v++) {
    const rng = mulberry32(seed + v);
    const d = detuned ? make(rng, DETUNES[v]) : make(rng);
    normalize(d, peak);
    fadeEdges(d, 0.0005, 0.02);
    const file = variants > 1 ? `${name}-${v + 1}.wav` : `${name}.wav`;
    writeFileSync(resolve(OUT_DIR, file), toWav(d));
    console.log(`wrote ${file} (${(d.length / RATE * 1000).toFixed(0)} ms)`);
  }
}
