// Round 25 (v2) — Tire Fire launch: a BURNING tire flung to roll through the swarm.
//
// v1 REJECTED (user 2026-07-21): "rubber scrub + elastic spring bounce" read as a
// spring launcher — it represented NOTHING of the weapon. Tire Fire is "burning
// tires roll in a line through everything" (orange flame accent, 2.6s roll). v2
// is what the weapon IS: a fiery WHOOMP (flames catching as it launches) + a
// heavy DARK rubber thud (a fat tire flung, not a springy metal) + a rolling
// rumble tail with flame crackle that dopplers away as it rolls off.
//
// One-shot per launch (cooldown 3.2s → infrequent, so it can be meatier/longer
// than the high-rate weapons). Modern/produced; fire is this weapon's identity.
// Output: tmp/audio-prototypes/tire-launch-1..3.wav
// Usage: node tools/audio/prototype-r25-tire.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RATE, mulberry32, buffer, biquad, addSub,
  saturate, compress, normalize, fadeEdges, toWav,
} from './dsp.mjs';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tmp', 'audio-prototypes');

/** Fire WHOOMP: broadband noise under a swell→settle window with a moving
 *  low-pass — the flames catching as the tire launches. Warm, not electric. */
function addWhoomp(data, rng, { fromHz, toHz, durSec, gain, startSec = 0 }) {
  const start = Math.round(startSec * RATE);
  const len = Math.round(durSec * RATE);
  const chunk = 32;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
  for (let i = 0; i < len && start + i < data.length; i++) {
    if (i % chunk === 0) {
      const k = i / len;
      const freq = fromHz * Math.pow(toHz / fromHz, k);
      const w0 = (2 * Math.PI * freq) / RATE;
      const alpha = Math.sin(w0) / (2 * 0.9);
      const a0 = 1 + alpha;
      // low-pass biquad (warm flame body, not a resonant whistle)
      b0 = (1 - Math.cos(w0)) / 2 / a0; b1 = (1 - Math.cos(w0)) / a0; b2 = b0;
      a1 = (-2 * Math.cos(w0)) / a0; a2 = (1 - alpha) / a0;
    }
    const p = i / len;
    const env = p < 0.3 ? Math.sin((p / 0.3) * (Math.PI / 2)) : Math.cos(((p - 0.3) / 0.7) * (Math.PI / 2)) ** 1.5;
    const x = (rng() * 2 - 1);
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    data[start + i] += y * gain * env;
  }
}

/** Rolling rumble: low band-limited noise sweeping DOWN (dopplers away) with a
 *  slow decay — the heavy tire trundling off. */
function addRumble(data, rng, { fromHz, toHz, q, durSec, decaySec, gain, startSec = 0 }) {
  const start = Math.round(startSec * RATE);
  const len = Math.round(durSec * RATE);
  const chunk = 48;
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

/** Sparse flame crackle in the tail — the tire is on fire as it rolls. */
function addCrackle(data, rng, { centerHz, q, durSec, gain, density, startSec = 0 }) {
  const start = Math.round(startSec * RATE);
  const len = Math.round(durSec * RATE);
  const tmp = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    // sparse impulses (pops of burning rubber)
    tmp[i] = rng() < density ? (rng() * 2 - 1) * (0.5 + rng() * 0.5) : 0;
  }
  biquad(tmp, 'bandpass', centerHz, q);
  for (let i = 0; i < len && start + i < data.length; i++) {
    const t = i / RATE;
    data[start + i] += tmp[i] * gain * Math.exp(-t / (durSec * 0.6));
  }
}

// Tire Fire launch: fiery whoomp + heavy dark rubber thud + rolling flame tail.
function tireLaunch(rng, dt) {
  const d = buffer(0.34);
  // 1) Fire WHOOMP — the flames catching as the tire is flung.
  addWhoomp(d, rng, { fromHz: 1600 * dt, toHz: 520 * dt, durSec: 0.12, gain: 0.5 });
  // 2) Heavy rubber LAUNCH — a fat dark thud (sub + damped low-mid), the weight
  //    of the tire. Dark/damped = rubber, NOT a bright spring or metal.
  addSub(d, { from: 140 * dt, to: 55 * dt, glideSec: 0.05, decaySec: 0.12, gain: 0.7, startSec: 0.01 });
  addRumble(d, rng, { fromHz: 260 * dt, toHz: 150 * dt, q: 1.1, durSec: 0.05, decaySec: 0.04, gain: 0.34, startSec: 0.012 });
  // 3) Rolling RUMBLE tail — the heavy tire trundling off, dopplering down.
  addRumble(d, rng, { fromHz: 190 * dt, toHz: 95 * dt, q: 1.3, durSec: 0.28, decaySec: 0.16, gain: 0.4, startSec: 0.05 });
  // 4) Flame CRACKLE — it's burning as it rolls.
  addCrackle(d, rng, { centerHz: 1500 * dt, q: 1.0, durSec: 0.3, gain: 0.3, density: 0.006, startSec: 0.04 });
  // Warm band: fire + rubber live low-mid; keep the top soft (not sizzly).
  biquad(d, 'highpass', 45, 0.707);
  biquad(d, 'lowpass', 3200 * dt, 0.9);
  saturate(d, 1.6);
  compress(d, { threshold: 0.34, ratio: 3, releaseSec: 0.08 });
  return d;
}

mkdirSync(OUT_DIR, { recursive: true });
const SETS = { 'tire-launch': { make: tireLaunch, seed: 252000, peak: 0.72 } };
const DETUNES = [1, 0.97, 1.03];
for (const [name, { make, seed, peak }] of Object.entries(SETS)) {
  for (let v = 0; v < DETUNES.length; v++) {
    const rng = mulberry32(seed + v * 7919);
    const d = make(rng, DETUNES[v]);
    normalize(d, peak);
    fadeEdges(d, 0.0004, 0.01);
    const file = `${name}-${v + 1}.wav`;
    writeFileSync(resolve(OUT_DIR, file), toWav(d));
    console.log(`wrote ${file} (${(d.length / RATE * 1000).toFixed(0)} ms)`);
  }
}
