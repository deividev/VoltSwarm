// Round 33 — Turbine tornado TRAVEL-ROAR loop: the vortex roaring while it flies.
//
// Plays while any tornado is alive, DISTANCE-ATTENUATED (the game scales its
// volume by the player's distance to the nearest flying tornado). Matches the
// airy WIND character of the launch one-shot the user preferred (v1): a swirling
// wind roar + a low vortex rumble + an airy top, no electric tone. Modest — it's
// an ambient presence, not a weapon voice.
//
// Distinct from the acid loop (fizz/bubble) and the electric loops (blades/
// welder). NO 45 Hz tremolo; the swirl + noise carry it. Seamless: tail→head
// wrap-crossfade, NO fadeEdges; swirl LFO uses integer cycles over OUT_LEN.
// Output: tmp/audio-prototypes/turbine-loop-1.wav
// Usage: node tools/audio/prototype-r33-turbine-loop.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RATE, mulberry32, buffer, biquad, normalize, toWav } from './dsp.mjs';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tmp', 'audio-prototypes');

const OUT_LEN = 2.0;
const OVERLAP = 0.08;
const PRE_LEN = OUT_LEN + OVERLAP;

/** Swirling WIND bed: band-limited noise with a rotation swirl (amplitude LFO) —
 *  the spinning vortex. `swirlCycles` whole cycles over OUT_LEN → seamless. */
function addWindBed(data, rng, { centerHz, q, gain, swirlCycles, swirlDepth }) {
  const swirlHz = swirlCycles / OUT_LEN;
  const tmp = new Float64Array(data.length);
  for (let i = 0; i < data.length; i++) tmp[i] = rng() * 2 - 1;
  biquad(tmp, 'bandpass', centerHz, q);
  for (let i = 0; i < data.length; i++) {
    const t = i / RATE;
    const swirl = 1 - swirlDepth + swirlDepth * (0.5 + 0.5 * Math.sin(2 * Math.PI * swirlHz * t));
    data[i] += tmp[i] * gain * swirl;
  }
}

/** Low vortex rumble — the tornado's mass/body (quiet, keeps it from being pure
 *  hiss). A filtered low noise bed. */
function addRumble(data, rng, { centerHz, q, gain }) {
  const tmp = new Float64Array(data.length);
  for (let i = 0; i < data.length; i++) tmp[i] = rng() * 2 - 1;
  biquad(tmp, 'bandpass', centerHz, q);
  biquad(tmp, 'lowpass', centerHz * 2.5, 0.9);
  for (let i = 0; i < data.length; i++) data[i] += tmp[i] * gain;
}

function loopWrap(data) {
  const overlap = Math.round(OVERLAP * RATE);
  const outLen = data.length - overlap;
  const out = new Float64Array(outLen);
  for (let i = 0; i < outLen; i++) out[i] = data[i];
  for (let i = 0; i < overlap; i++) {
    const t = i / overlap;
    out[i] = data[i] * Math.sin((t * Math.PI) / 2) + data[outLen + i] * Math.cos((t * Math.PI) / 2);
  }
  return out;
}

function turbineLoop(rng) {
  const d = buffer(PRE_LEN);
  // Main swirling wind roar (the hero) — mid-band, spinning.
  addWindBed(d, rng, { centerHz: 1250, q: 1.1, gain: 0.4, swirlCycles: 24, swirlDepth: 0.3 });
  // A second swirl at a different rate/band = a richer, less mechanical spin.
  addWindBed(d, rng, { centerHz: 2100, q: 1.3, gain: 0.22, swirlCycles: 34, swirlDepth: 0.26 });
  // Airy top "shhh".
  addWindBed(d, rng, { centerHz: 3600, q: 0.8, gain: 0.12, swirlCycles: 40, swirlDepth: 0.22 });
  // Low vortex rumble — the mass of the tornado.
  addRumble(d, rng, { centerHz: 220, q: 0.9, gain: 0.2 });
  biquad(d, 'highpass', 150, 0.707);
  biquad(d, 'lowpass', 5200, 0.9);
  return loopWrap(d);
}

mkdirSync(OUT_DIR, { recursive: true });
const rng = mulberry32(331000);
const d = turbineLoop(rng);
normalize(d, 0.55); // asset level; emit base volume + distance attenuation scale it down in-game
writeFileSync(resolve(OUT_DIR, 'turbine-loop-1.wav'), toWav(d));
console.log(`wrote turbine-loop-1.wav (${((d.length / RATE) * 1000).toFixed(0)} ms, wind vortex roar, seamless)`);
