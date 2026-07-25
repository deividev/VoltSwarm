// Round 26 (v3) — Saw Blades SUSTAINED LOOP, electric + breathing. The continuous
// hum of the orbiting saws while active. Pairs with the blades-spin rev one-shot.
//
// v3 changes (user 2026-07-21): v2 still "drilled" a bit. Now (a) LOWER level,
// (b) an ELECTRIC touch aligned with our style (bolt/pulse/ricochet are charged,
// not mechanical) — a gentle pitch VIBRATO makes the tone read as a charged coil
// spinning, not a dry gas motor — and (c) the fast teeth-tremolo depth is cut
// hard (0.22 → 0.10) so the buzz stops biting. The slow breath swell stays.
//
// Seamless: NO fadeEdges. Every LFO (breath, teeth, vibrato) completes an INTEGER
// number of cycles over OUT_LEN, so the tail→head wrap-crossfade seams them
// phase-matched with zero click.
// Output: tmp/audio-prototypes/blades-loop-1.wav
// Usage: node tools/audio/prototype-r26-blades-loop.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RATE, mulberry32, buffer, biquad, normalize, toWav } from './dsp.mjs';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tmp', 'audio-prototypes');

const OUT_LEN = 2.4;   // seconds of loop
const OVERLAP = 0.08;  // wrap-crossfade length
const PRE_LEN = OUT_LEN + OVERLAP;

/** Detuned partials with optional pitch VIBRATO — a charged electric coil, not a
 *  dry motor. `vibCycles` whole cycles over OUT_LEN keeps the vibrato seamless. */
function addDrone(data, { freq, gain, detune = 0.01, partials = 3, vibCycles = 0, vibDepth = 0 }) {
  const vibHz = vibCycles / OUT_LEN;
  for (const vd of [1 - detune, 1, 1 + detune]) {
    for (let h = 1; h <= partials; h++) {
      let phase = 0;
      const g = (gain / partials) / 3;
      for (let i = 0; i < data.length; i++) {
        const t = i / RATE;
        const vib = vibDepth > 0 ? 1 + vibDepth * Math.sin(2 * Math.PI * vibHz * t) : 1;
        const f = freq * h * vd * vib;
        phase += (2 * Math.PI * f) / RATE;
        data[i] += Math.sin(phase) * g;
      }
    }
  }
}

/** Steady band-limited noise bed — friction/air of the spinning teeth. */
function addSteadyNoise(data, rng, { gain, centerHz, q }) {
  const tmp = new Float64Array(data.length);
  for (let i = 0; i < data.length; i++) tmp[i] = rng() * 2 - 1;
  biquad(tmp, 'bandpass', centerHz, q);
  for (let i = 0; i < data.length; i++) data[i] += tmp[i] * gain;
}

/** Amplitude LFO. `cycles` whole cycles over OUT_LEN → seams perfectly. */
function applyLfo(data, { cycles, depth, phase0 = 0 }) {
  const hz = cycles / OUT_LEN;
  for (let i = 0; i < data.length; i++) {
    const t = i / RATE;
    data[i] *= 1 - depth + depth * (0.5 + 0.5 * Math.sin(2 * Math.PI * hz * t + phase0));
  }
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

function bladesLoop(rng) {
  const d = buffer(PRE_LEN);
  // Motor body: warm detuned drone with a slow pitch vibrato (5 Hz = 12 cycles
  // /2.4s) → the charged-coil "living" quality of our electric world.
  addDrone(d, { freq: 320, gain: 0.5, detune: 0.012, partials: 4, vibCycles: 12, vibDepth: 0.008 });
  // Bright hum an octave+ up (the blade edge singing), quiet, faster shimmer
  // vibrato (7.5 Hz = 18 cycles) so the top end sparkles electrically.
  addDrone(d, { freq: 980, gain: 0.14, detune: 0.02, partials: 2, vibCycles: 18, vibDepth: 0.012 });
  // Friction/air bed, dark and low.
  addSteadyNoise(d, rng, { gain: 0.10, centerHz: 2400, q: 1.1 });
  // Fast teeth tremolo — now VERY soft (0.22 → 0.10) so it no longer drills.
  // 108 cycles over 2.4s = 45 Hz (less piercing than 60 Hz).
  applyLfo(d, { cycles: 108, depth: 0.10 });
  // SLOW breathing swell — the "sube y baja". 2 cycles over 2.4s = 0.833 Hz.
  applyLfo(d, { cycles: 2, depth: 0.45, phase0: -Math.PI / 2 });
  // Dark and controlled — continuous sound must not bite.
  biquad(d, 'highpass', 110, 0.707);
  biquad(d, 'lowpass', 3400, 0.9);
  return loopWrap(d);
}

mkdirSync(OUT_DIR, { recursive: true });
const rng = mulberry32(261000);
const d = bladesLoop(rng);
normalize(d, 0.24); // lower than v2 (0.28); emit volume drops it further still
// NO fadeEdges — the wrap already makes the boundary seamless.
writeFileSync(resolve(OUT_DIR, 'blades-loop-1.wav'), toWav(d));
console.log(`wrote blades-loop-1.wav (${((d.length / RATE) * 1000).toFixed(0)} ms, electric, breathing, seamless)`);
