// Round 28 (v3) — Welder BEAM LOOP: an EPIC electric ray, in our produced style.
//
// v2 was rejected as "muy basico / cutre" — it was noise + a weak buzz with NO
// saturation/compression, while EVERY accepted weapon sound (bolt/pulse/ricochet/
// press/tire) is saturated + compressed for a produced, powerful body. v3 fixes
// that AND raises the ambition: a real energy BEAM = a rich detuned harmonic
// energy CORE (the beam "singing", with pitch vibrato so the electricity dances)
// + bright arc SPARKS crackling over it + a low POWER body + a hot resonant
// shimmer, all glued with saturation + compression. Bright, alive, premium.
//
// Still differentiated from blades-loop (distinctiveness review): blades = smooth
// low BREATHING hum; welder = bright ENERGETIC beam with sparks. No 45 Hz tremolo
// (blades' signature) — movement is pitch vibrato + crackle flicker.
// Seamless: NO fadeEdges; tonal LFOs use integer cycles over OUT_LEN, wrap seams
// the crackle.
// Output: tmp/audio-prototypes/welder-beam-1.wav
// Usage: node tools/audio/prototype-r28-welder-loop.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RATE, mulberry32, buffer, biquad, saturate, compress, normalize, toWav } from './dsp.mjs';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tmp', 'audio-prototypes');

const OUT_LEN = 2.0;   // seconds of loop
const OVERLAP = 0.08;  // wrap-crossfade length
const PRE_LEN = OUT_LEN + OVERLAP;

/** Rich detuned harmonic ENERGY CORE with pitch vibrato — the beam "singing".
 *  Multiple detuned voices = a thick, powerful energy texture (supersaw-ish),
 *  the epic-beam identity. `vibCycles`/`baseCycles` are whole cycles over
 *  OUT_LEN so the tone seams. */
function addEnergyCore(data, { baseCycles, gain, harmonics, detune, voices, vibCycles, vibDepth }) {
  const f0 = baseCycles / OUT_LEN;
  const vibHz = vibCycles / OUT_LEN;
  const spread = [];
  for (let v = 0; v < voices; v++) spread.push(1 + detune * (v - (voices - 1) / 2));
  for (const vd of spread) {
    let phase = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / RATE;
      const vib = 1 + vibDepth * Math.sin(2 * Math.PI * vibHz * t);
      const f = f0 * vd * vib;
      phase += (2 * Math.PI * f) / RATE;
      let s = 0;
      for (let h = 1; h <= harmonics; h++) s += Math.sin(phase * h) / h; // saw-ish
      data[i] += s * (gain / voices);
    }
  }
}

/** Sustained electric-arc crackle: band-limited noise with random gating — the
 *  sparks arcing over the beam. Flicker = the arc's life. */
function addArcBed(data, rng, { centerHz, q, gain, flicker }) {
  const tmp = new Float64Array(data.length);
  let gate = 1;
  for (let i = 0; i < data.length; i++) {
    if (i % 12 === 0 && rng() < flicker) gate = 0.25 + rng() * 0.75;
    tmp[i] = (rng() * 2 - 1) * gate;
  }
  biquad(tmp, 'bandpass', centerHz, q);
  for (let i = 0; i < data.length; i++) data[i] += tmp[i] * gain;
}

/** Tail→head equal-power wrap so source.loop=true seams without a click. */
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

function welderBeam(rng) {
  const d = buffer(PRE_LEN);
  // ENERGY CORE (the hero): thick detuned harmonic beam at ~360 Hz (720 cycles/2s)
  // with an 8 Hz pitch vibrato so the electricity dances (not a dead tone).
  addEnergyCore(d, { baseCycles: 720, gain: 0.42, harmonics: 10, detune: 0.02, voices: 5, vibCycles: 16, vibDepth: 0.014 });
  // (v3.1: removed the pure-sine "shimmer" layer — a lone sine sweeping ~1.4→2.4
  // kHz read as a background WHISTLE. Brightness comes from the core harmonics +
  // the crackle beds instead.)
  // POWER body: a low harmonic tone for weight (110 Hz = 220 cycles/2s).
  addEnergyCore(d, { baseCycles: 220, gain: 0.2, harmonics: 5, detune: 0.01, voices: 2, vibCycles: 16, vibDepth: 0.006 });
  // ARC SPARKS: crackle beds arcing over the beam — keeps it electric, alive.
  addArcBed(d, rng, { centerHz: 2400, q: 1.4, gain: 0.28, flicker: 0.4 });
  addArcBed(d, rng, { centerHz: 4200, q: 1.8, gain: 0.16, flicker: 0.55 });
  // Electric band: bright (epic beams live up top) but controlled.
  biquad(d, 'highpass', 130, 0.707);
  biquad(d, 'lowpass', 6400, 0.9);
  // PRODUCED like the rest of the palette — this is what v2 was missing.
  saturate(d, 1.7);
  compress(d, { threshold: 0.32, ratio: 3, releaseSec: 0.08 });
  return loopWrap(d);
}

mkdirSync(OUT_DIR, { recursive: true });
const rng = mulberry32(282000);
const d = welderBeam(rng);
normalize(d, 0.46); // raised from 0.34 — v3 was barely audible over music at 50%
// NO fadeEdges — the wrap makes the boundary seamless.
writeFileSync(resolve(OUT_DIR, 'welder-beam-1.wav'), toWav(d));
console.log(`wrote welder-beam-1.wav (${((d.length / RATE) * 1000).toFixed(0)} ms, epic energy beam, saturated)`);
