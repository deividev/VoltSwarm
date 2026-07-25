// Round 31 — Acid Drum throw: lob a drum that bursts into a corrosive zone.
//
// Weapon: "Lobs drums that burst into a corrosive zone, melting enemies over
// time" (acid-green, 3.5s cooldown, DoT zones). One-shot per lob. Three acts:
// a LOB whoosh (the drum flying) → a wet BURST/splash (the drum shatters) → a
// CORROSIVE fizz + chemical BUBBLES (the acid eating). Green/chemical is on-theme
// for this weapon (like fire=tire, air=turbine), but keep it PRODUCED with an
// energized edge so it belongs to the electric palette (turbine lesson: no raw
// noise). Modern: saturate + compress.
//
// Distinctiveness: fizz + discrete bubble blips = a chemical signature nobody else
// has (vs tire's fiery low roll, turbine's swirling air). Output:
// tmp/audio-prototypes/acid-throw-1..3.wav
// Usage: node tools/audio/prototype-r31-acid.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RATE, mulberry32, buffer, biquad, addSub, addFm, addTransient,
  saturate, compress, normalize, fadeEdges, toWav,
} from './dsp.mjs';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tmp', 'audio-prototypes');

/** Corrosive FIZZ: band-limited noise with fast random gating (the "fzzz" of
 *  acid eating), under an overall decay — the sizzle. */
function addFizz(data, rng, { centerHz, q, durSec, decaySec, gain, gateRate, startSec = 0 }) {
  const start = Math.round(startSec * RATE);
  const len = Math.round(durSec * RATE);
  const tmp = new Float64Array(len);
  let gate = 1;
  for (let i = 0; i < len; i++) {
    if (i % 8 === 0 && rng() < gateRate) gate = 0.2 + rng() * 0.8;
    tmp[i] = (rng() * 2 - 1) * gate;
  }
  biquad(tmp, 'bandpass', centerHz, q);
  for (let i = 0; i < len && start + i < data.length; i++) {
    const t = i / RATE;
    data[start + i] += tmp[i] * gain * Math.exp(-t / decaySec);
  }
}

/** Chemical BUBBLE: a short descending resonant blip ("bloop") — a corrosion
 *  bubble popping. Discrete pitched pops = the acid signature. */
function addBubble(data, { fromHz, toHz, durSec, gain, startSec }) {
  const start = Math.round(startSec * RATE);
  const len = Math.round(durSec * RATE);
  let phase = 0;
  for (let i = 0; i < len && start + i < data.length; i++) {
    const p = i / len;
    const t = i / RATE;
    const f = fromHz * Math.pow(toHz / fromHz, p);
    phase += (2 * Math.PI * f) / RATE;
    // soft attack, quick decay — a rounded "bloop"
    const env = Math.min(p / 0.15, 1) * Math.exp(-t / (durSec * 0.4));
    data[start + i] += Math.sin(phase) * gain * env;
  }
}

/** Wet splat noise — the drum shattering / acid splashing. */
function addSplat(data, rng, { fromHz, toHz, q, durSec, decaySec, gain, startSec = 0 }) {
  const start = Math.round(startSec * RATE);
  const len = Math.round(durSec * RATE);
  const chunk = 24;
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
    const t = i / RATE;
    const x = (rng() * 2 - 1) * Math.exp(-t / decaySec);
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    data[start + i] += y * gain;
  }
}

// Acid throw: lob whoosh → wet burst → corrosive fizz + bubbles.
function acidThrow(rng, dt) {
  const d = buffer(0.36);
  const burst = 0.055; // the drum lands/shatters
  // 1) LOB whoosh — the drum flying through the air (quick), rising then cut.
  addSplat(d, rng, { fromHz: 900 * dt, toHz: 1500 * dt, q: 1.2, durSec: 0.05, decaySec: 0.04, gain: 0.22 });
  // 2) BURST — wet impact transient + a splattering splat (the drum shatters).
  addTransient(d, rng, { lengthSec: 0.005, centerHz: 1500 * dt, q: 1.4, gain: 0.5, startSec: burst });
  addSplat(d, rng, { fromHz: 1300 * dt, toHz: 500 * dt, q: 1.0, durSec: 0.06, decaySec: 0.04, gain: 0.42, startSec: burst });
  addSub(d, { from: 130 * dt, to: 55 * dt, glideSec: 0.03, decaySec: 0.05, gain: 0.34, startSec: burst });
  // 3) ENERGIZED edge — a short green-acid resonant zap ties it to the palette.
  addFm(d, { from: 760 * dt, to: 340 * dt, glideSec: 0.02, ratio: 2.5, index: 4, indexDecaySec: 0.02, ampDecaySec: 0.05, gain: 0.2, detune: 0.01, startSec: burst });
  // 4) CORROSIVE FIZZ — the sizzle of acid eating, decaying over the tail.
  addFizz(d, rng, { centerHz: 3000 * dt, q: 1.0, durSec: 0.29, decaySec: 0.16, gain: 0.32, gateRate: 0.5, startSec: burst + 0.01 });
  // 5) CHEMICAL BUBBLES — discrete descending blips popping in the corrosion.
  addBubble(d, { fromHz: 520 * dt, toHz: 300 * dt, durSec: 0.05, gain: 0.24, startSec: 0.11 });
  addBubble(d, { fromHz: 620 * dt, toHz: 360 * dt, durSec: 0.045, gain: 0.2, startSec: 0.17 });
  addBubble(d, { fromHz: 440 * dt, toHz: 260 * dt, durSec: 0.055, gain: 0.22, startSec: 0.23 });
  addBubble(d, { fromHz: 560 * dt, toHz: 320 * dt, durSec: 0.05, gain: 0.18, startSec: 0.29 });
  // Chemical band: bright fizz up top, wet body below; keep it controlled.
  biquad(d, 'highpass', 140, 0.707);
  biquad(d, 'lowpass', 5600 * dt, 0.9);
  saturate(d, 1.5);
  compress(d, { threshold: 0.36, ratio: 2.8, releaseSec: 0.07 });
  return d;
}

mkdirSync(OUT_DIR, { recursive: true });
const SETS = { 'acid-throw': { make: acidThrow, seed: 311000, peak: 0.7 } };
const DETUNES = [1, 0.97, 1.03];
for (const [name, { make, seed, peak }] of Object.entries(SETS)) {
  for (let v = 0; v < DETUNES.length; v++) {
    const rng = mulberry32(seed + v * 7919);
    const d = make(rng, DETUNES[v]);
    normalize(d, peak);
    fadeEdges(d, 0.0005, 0.01);
    const file = `${name}-${v + 1}.wav`;
    writeFileSync(resolve(OUT_DIR, file), toWav(d));
    console.log(`wrote ${file} (${(d.length / RATE * 1000).toFixed(0)} ms)`);
  }
}
