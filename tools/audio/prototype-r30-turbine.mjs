// Round 30 (v1 RESTORED) — Turbine Fan launch: a spinning tornado flung to shove
// the swarm. The user preferred THIS airier wind version over the v2 "electric
// energy vortex" (reverted 2026-07-22 — v2 "no me gusta nada"). Kept as the
// launch one-shot; the tornado's distance presence lives in `turbine-loop`.
//
// Gesture: a mechanical fan SPIN-UP whine + a swirling wind-VORTEX whoosh + a
// launch GUST + a slight doppler as it travels away. Airy/mid-high so it never
// collides with the tire's heavy fiery low roll.
// Output: tmp/audio-prototypes/turbine-launch-1..3.wav
// Usage: node tools/audio/prototype-r30-turbine.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RATE, mulberry32, buffer, biquad, saturate, compress, normalize, fadeEdges, toWav,
} from './dsp.mjs';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tmp', 'audio-prototypes');

/** Wind VORTEX: bandpass noise, center arcs up→down, swirling — the tornado. */
function addWind(data, rng, { centerFrom, centerPeak, centerTo, q, durSec, gain, swirlHz, swirlDepth, startSec = 0 }) {
  const start = Math.round(startSec * RATE);
  const len = Math.round(durSec * RATE);
  const chunk = 24;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
  for (let i = 0; i < len && start + i < data.length; i++) {
    if (i % chunk === 0) {
      const p = i / len;
      const center = p < 0.4
        ? centerFrom * Math.pow(centerPeak / centerFrom, p / 0.4)
        : centerPeak * Math.pow(centerTo / centerPeak, (p - 0.4) / 0.6);
      const w0 = (2 * Math.PI * center) / RATE;
      const alpha = Math.sin(w0) / (2 * q);
      const a0 = 1 + alpha;
      b0 = alpha / a0; b1 = 0; b2 = -alpha / a0;
      a1 = (-2 * Math.cos(w0)) / a0; a2 = (1 - alpha) / a0;
    }
    const p = i / len;
    const t = i / RATE;
    const env = Math.min(p / 0.12, 1) * (p < 0.55 ? 1 : Math.cos(((p - 0.55) / 0.45) * (Math.PI / 2)));
    const swirl = 1 - swirlDepth + swirlDepth * (0.5 + 0.5 * Math.sin(2 * Math.PI * swirlHz * t));
    const x = (rng() * 2 - 1);
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    data[start + i] += y * gain * env * swirl;
  }
}

/** Fan SPIN-UP whine: high-Q resonant noise rising in pitch — the blades revving. */
function addWhine(data, rng, { fromHz, toHz, q, durSec, gain, startSec = 0 }) {
  const start = Math.round(startSec * RATE);
  const len = Math.round(durSec * RATE);
  const chunk = 20;
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
    const env = Math.min(p / 0.15, 1) * (p < 0.7 ? 1 : Math.cos(((p - 0.7) / 0.3) * (Math.PI / 2)));
    const x = (rng() * 2 - 1);
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    data[start + i] += y * gain * env;
  }
}

// Turbine launch (v1): fan spin-up + swirling vortex whoosh + launch gust.
function turbineLaunch(rng, dt) {
  const d = buffer(0.42);
  // 1) VORTEX whoosh (hero) — swirling air, center arcs up then down (doppler
  //    away as it travels). Rotation swirl = the spinning tornado.
  addWind(d, rng, { centerFrom: 700 * dt, centerPeak: 1900 * dt, centerTo: 850 * dt, q: 1.1, durSec: 0.4, gain: 0.5, swirlHz: 15, swirlDepth: 0.22 });
  // 2) FAN spin-up whine — the turbine blades revving up.
  addWhine(d, rng, { fromHz: 420 * dt, toHz: 1500 * dt, q: 7, durSec: 0.16, gain: 0.24 });
  // 3) LAUNCH gust — a punchy lower-mid burst of air (the shove), quick.
  addWind(d, rng, { centerFrom: 320 * dt, centerPeak: 780 * dt, centerTo: 420 * dt, q: 0.9, durSec: 0.12, gain: 0.34, swirlHz: 10, swirlDepth: 0.15, startSec: 0.02 });
  // 4) Airy top wash — the "shhh" of fast-moving air, light.
  addWind(d, rng, { centerFrom: 3200 * dt, centerPeak: 4200 * dt, centerTo: 2600 * dt, q: 0.7, durSec: 0.34, gain: 0.12, swirlHz: 18, swirlDepth: 0.18, startSec: 0.01 });
  // Airy band: lighter low end than the tire (this is wind, not fire+rubber).
  biquad(d, 'highpass', 200, 0.707);
  biquad(d, 'lowpass', 6200 * dt, 0.9);
  saturate(d, 1.35);
  compress(d, { threshold: 0.38, ratio: 2.4, releaseSec: 0.08 });
  return d;
}

mkdirSync(OUT_DIR, { recursive: true });
const SETS = { 'turbine-launch': { make: turbineLaunch, seed: 301000, peak: 0.7 } };
const DETUNES = [1, 0.97, 1.03];
for (const [name, { make, seed, peak }] of Object.entries(SETS)) {
  for (let v = 0; v < DETUNES.length; v++) {
    const rng = mulberry32(seed + v * 7919);
    const d = make(rng, DETUNES[v]);
    normalize(d, peak);
    fadeEdges(d, 0.0006, 0.012);
    const file = `${name}-${v + 1}.wav`;
    writeFileSync(resolve(OUT_DIR, file), toWav(d));
    console.log(`wrote ${file} (${(d.length / RATE * 1000).toFixed(0)} ms)`);
  }
}
