// Round 37 — the Hazard Marshal's radial discharge (the ring of red shots).
//
// The third and last silent attack in the fight. Same industrial family as the
// sweep (r35) and the core overload (r36), and again a different VERB, because
// three attacks that all sound like impacts are one attack in three costumes:
//
//   sweep    : a press comes down          -> a single enormous strike
//   overload : pressure escapes underneath -> short blasts, one per link
//   volley   : a BATTERY fires             -> many launch tubes venting at once
//
// So this is launch, not impact: sixteen pneumatic tubes going off in a ragged
// half-second, with the metal of the rack rattling under them. It fires every
// 4.5-6.5s — the most frequent of the three — so by the loudness pyramid it is
// also the quietest, and it deliberately has no wind-up cue of its own: the
// boss visibly stops for 1.1s, which is the telegraph, and stacking another
// riser on top of the sweep's would make the two attacks sound alike.
//
// Output: tmp/audio-prototypes/boss-volley.wav
// Usage: node tools/audio/prototype-r37-volley.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RATE, mulberry32, buffer, biquad, addSub, addModal, addTransient,
  saturate, compress, normalize, fadeEdges, toWav,
} from './dsp.mjs';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tmp', 'audio-prototypes');

function addHiss(data, rng, { startSec, durSec, centerHz, q, gain, shape = 1 }) {
  const start = Math.round(startSec * RATE);
  const len = Math.round(durSec * RATE);
  if (len <= 0) return;
  const tmp = new Float64Array(len);
  for (let i = 0; i < len; i++) tmp[i] = rng() * 2 - 1;
  biquad(tmp, 'bandpass', centerHz, q);
  for (let i = 0; i < len && start + i < data.length; i++) {
    data[start + i] += tmp[i] * gain * Math.pow(1 - i / len, shape);
  }
}

/** One launch tube: a compressed-air punch with a short metallic barrel ring.
 *  Pitch varies per tube so sixteen of them read as a RACK, not as one sound
 *  played sixteen times — that flam is the whole character of a battery. */
function addTube(data, rng, { startSec, gain, pitch }) {
  addTransient(data, rng, { lengthSec: 0.03, centerHz: 2000 * pitch, q: 2.4, gain: gain * 0.7, startSec });
  addHiss(data, rng, { startSec, durSec: 0.09, centerHz: 1300 * pitch, q: 0.9, gain: gain * 0.5, shape: 2.2 });
  addSub(data, { from: 150 * pitch, to: 74 * pitch, glideSec: 0.05, decaySec: 0.1, gain: gain * 0.55, startSec });
  addModal(data, rng, {
    modes: [520 * pitch, 830 * pitch, 1290 * pitch],
    gains: [0.26, 0.15, 0.09],
    decays: [0.08, 0.06, 0.04],
    gain: gain * 0.5,
    startSec,
  });
}

const rng = mulberry32(3701);
const data = buffer(0.75);

// Sixteen tubes over ~0.22s, RAGGED on purpose: perfectly even spacing turns
// into a machine-gun buzz and loses the count. The gaps are jittered and the
// first four are loudest, so the volley has a front instead of a middle.
const TUBES = 16;
for (let i = 0; i < TUBES; i++) {
  const spread = (i / TUBES) * 0.2 + (rng() - 0.5) * 0.02;
  const front = 1 - 0.45 * (i / TUBES);
  addTube(data, rng, { startSec: Math.max(0, spread), gain: 0.42 * front, pitch: 0.86 + rng() * 0.3 });
}

// The rack itself taking the recoil: low metal under the whole burst.
addModal(data, rng, {
  modes: [96, 148, 227, 351],
  gains: [0.3, 0.22, 0.14, 0.08],
  decays: [0.34, 0.26, 0.19, 0.12],
  detuneCents: 18,
  gain: 0.5,
});
addSub(data, { from: 82, to: 46, glideSec: 0.14, decaySec: 0.3, gain: 0.5, startSec: 0.004 });
// Residual air venting off the rack as it empties.
addHiss(data, rng, { startSec: 0.12, durSec: 0.5, centerHz: 2400, q: 0.5, gain: 0.16, shape: 1.6 });

saturate(data, 2.0);
compress(data, { threshold: 0.44, ratio: 3.6, attackSec: 0.002, releaseSec: 0.1 });
fadeEdges(data, 0.004, 0.02);
normalize(data, 0.92);
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, 'boss-volley.wav'), toWav(data));
let peak = 0;
let sum = 0;
for (const s of data) {
  peak = Math.max(peak, Math.abs(s));
  sum += s * s;
}
console.log(
  `boss-volley.wav  ${(data.length / RATE).toFixed(2)}s  peak ${peak.toFixed(3)}` +
  `  rms ${Math.sqrt(sum / data.length).toFixed(3)}`,
);
