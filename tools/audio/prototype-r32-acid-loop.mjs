// Round 32 — Acid zone SIZZLE LOOP: the corrosive pool eating while active.
//
// Plays while any acid zone is alive, DISTANCE-ATTENUATED (the game scales its
// volume by the player's distance to the nearest pool — see AcidWeapon). A
// continuous corrosive FIZZ + scattered chemical BUBBLES over a low corrosive
// HUM (body, so it's not raw hiss — palette rule). LOW: it's a background damage
// cue, not a weapon voice.
//
// Distinct from the blades/welder loops (electric hum/beam) — acid is fizzy/wet/
// bubbly. NO 45 Hz tremolo (blades/welder signature); the fizz flicker + bubbles
// carry the life. Seamless: tail→head wrap-crossfade, NO fadeEdges; bubbles kept
// away from the seam.
// Output: tmp/audio-prototypes/acid-loop-1.wav
// Usage: node tools/audio/prototype-r32-acid-loop.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RATE, mulberry32, buffer, biquad, normalize, toWav } from './dsp.mjs';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tmp', 'audio-prototypes');

const OUT_LEN = 2.2;
const OVERLAP = 0.08;
const PRE_LEN = OUT_LEN + OVERLAP;

/** Low corrosive HUM — quiet chemical body so the loop isn't raw hiss. */
function addHum(data, { freq, gain, partials, detune }) {
  for (const vd of [1 - detune, 1, 1 + detune]) {
    for (let h = 1; h <= partials; h++) {
      let phase = 0;
      const g = (gain / partials) / 3;
      for (let i = 0; i < data.length; i++) {
        phase += (2 * Math.PI * freq * h * vd) / RATE;
        data[i] += Math.sin(phase) * g;
      }
    }
  }
}

/** Sustained corrosive FIZZ — band-limited noise with fast random gating. */
function addFizzBed(data, rng, { centerHz, q, gain, flicker }) {
  const tmp = new Float64Array(data.length);
  let gate = 1;
  for (let i = 0; i < data.length; i++) {
    if (i % 8 === 0 && rng() < flicker) gate = 0.2 + rng() * 0.8;
    tmp[i] = (rng() * 2 - 1) * gate;
  }
  biquad(tmp, 'bandpass', centerHz, q);
  for (let i = 0; i < data.length; i++) data[i] += tmp[i] * gain;
}

/** A chemical BUBBLE blip — descending "bloop". */
function addBubble(data, { fromHz, toHz, durSec, gain, startSec }) {
  const start = Math.round(startSec * RATE);
  const len = Math.round(durSec * RATE);
  let phase = 0;
  for (let i = 0; i < len && start + i < data.length; i++) {
    const p = i / len;
    const t = i / RATE;
    const f = fromHz * Math.pow(toHz / fromHz, p);
    phase += (2 * Math.PI * f) / RATE;
    const env = Math.min(p / 0.15, 1) * Math.exp(-t / (durSec * 0.4));
    data[start + i] += Math.sin(phase) * gain * env;
  }
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

function acidLoop(rng) {
  const d = buffer(PRE_LEN);
  // Corrosive fizz (the sizzle) — two layers, mid and bright.
  addFizzBed(d, rng, { centerHz: 2600, q: 1.1, gain: 0.34, flicker: 0.5 });
  addFizzBed(d, rng, { centerHz: 3900, q: 1.5, gain: 0.16, flicker: 0.62 });
  // Low corrosive hum — quiet body (chemical presence, not raw noise).
  addHum(d, { freq: 165, gain: 0.16, partials: 3, detune: 0.012 });
  // Scattered bubbles (kept away from the wrap seam at [OUT_LEN-OVERLAP, OUT_LEN]).
  const bubbles = [
    { fromHz: 520, toHz: 300, durSec: 0.06, gain: 0.22, startSec: 0.25 },
    { fromHz: 430, toHz: 250, durSec: 0.07, gain: 0.18, startSec: 0.62 },
    { fromHz: 600, toHz: 340, durSec: 0.05, gain: 0.2, startSec: 1.02 },
    { fromHz: 470, toHz: 270, durSec: 0.065, gain: 0.19, startSec: 1.44 },
    { fromHz: 560, toHz: 320, durSec: 0.055, gain: 0.17, startSec: 1.83 },
  ];
  for (const b of bubbles) addBubble(d, b);
  biquad(d, 'highpass', 150, 0.707);
  biquad(d, 'lowpass', 5000, 0.9);
  return loopWrap(d);
}

mkdirSync(OUT_DIR, { recursive: true });
const rng = mulberry32(321000);
const d = acidLoop(rng);
normalize(d, 0.6); // asset level; emit base volume + distance attenuation scale it down in-game
writeFileSync(resolve(OUT_DIR, 'acid-loop-1.wav'), toWav(d));
console.log(`wrote acid-loop-1.wav (${((d.length / RATE) * 1000).toFixed(0)} ms, corrosive sizzle, seamless)`);
