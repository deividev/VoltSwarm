// Round 36 — the Hazard Marshal's core overload (the red zone chain, phase 3).
//
// Same industrial family as the sector sweep (round 35) and deliberately the
// OTHER half of it. The sweep is a stamping press: something comes down and
// hits. This is pressure escaping: the core unlocks, and the floor blows out in
// a line. If both attacks were impacts they would be one attack with two
// colours, and the player would have nothing to learn.
//
//   boss-overload-open  : the core unlocks. Metal under strain, a latch giving
//                         way, pressure climbing — plays once when the chain
//                         opens, at the boss.
//   boss-overload-erupt : one link of the chain blowing. Deliberately SMALLER
//                         than the sweep's stamp: four of these land inside two
//                         seconds, and the loudness pyramid says the thing that
//                         happens four times cannot be the loudest thing in the
//                         fight. Muffled thump, slag spray, short.
//
// House style holds: modern, never retro; deterministic.
//
// Output: tmp/audio-prototypes/boss-overload-{open,erupt}.wav
// Usage: node tools/audio/prototype-r36-overload.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RATE, mulberry32, buffer, biquad, addSub, addModal, addTransient,
  saturate, compress, normalize, fadeEdges, toWav,
} from './dsp.mjs';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tmp', 'audio-prototypes');

/** Filtered noise with a shaped envelope — the vent, the spray, the pressure. */
function addHiss(data, rng, { startSec, durSec, centerHz, q, gain, rise = false, shape = 1 }) {
  const start = Math.round(startSec * RATE);
  const len = Math.round(durSec * RATE);
  const tmp = new Float64Array(len);
  for (let i = 0; i < len; i++) tmp[i] = rng() * 2 - 1;
  biquad(tmp, 'bandpass', centerHz, q);
  for (let i = 0; i < len && start + i < data.length; i++) {
    const k = i / len;
    data[start + i] += tmp[i] * gain * (rise ? Math.pow(k, shape) : Math.pow(1 - k, shape));
  }
}

/** Metal under load: low inharmonic modes with slow decays and a slight pitch
 *  wobble, which is what a big structure taking strain sounds like. Distinct
 *  from round 35's plate — that one is STRUCK, this one is being bent. */
function addStrain(data, rng, { startSec, gain, decayScale = 1 }) {
  addModal(data, rng, {
    modes: [71, 109, 168, 263, 397],
    gains: [0.36, 0.28, 0.19, 0.12, 0.07],
    decays: [0.62, 0.5, 0.38, 0.27, 0.18].map((d) => d * decayScale),
    detuneCents: 22,
    gain,
    startSec,
  });
}

function write(name, data) {
  fadeEdges(data, 0.004, 0.02);
  normalize(data, 0.92);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(resolve(OUT_DIR, `${name}.wav`), toWav(data));
  let peak = 0;
  let sum = 0;
  for (const s of data) {
    peak = Math.max(peak, Math.abs(s));
    sum += s * s;
  }
  console.log(
    `${name}.wav  ${(data.length / RATE).toFixed(2)}s  peak ${peak.toFixed(3)}` +
    `  rms ${Math.sqrt(sum / data.length).toFixed(3)}`,
  );
}

// --- 1. OPEN: the core unlocks ----------------------------------------------
{
  const rng = mulberry32(3601);
  const data = buffer(0.85);
  // A latch letting go: one dull mechanical release, not a hit.
  addTransient(data, rng, { lengthSec: 0.07, centerHz: 190, q: 2.6, gain: 0.55, startSec: 0 });
  addStrain(data, rng, { startSec: 0, gain: 0.6 });
  // Pressure climbing behind it — the reason the floor is about to open.
  addHiss(data, rng, { startSec: 0.05, durSec: 0.7, centerHz: 900, q: 0.8, gain: 0.3, rise: true, shape: 1.6 });
  addHiss(data, rng, { startSec: 0.2, durSec: 0.6, centerHz: 2600, q: 0.6, gain: 0.16, rise: true, shape: 2.2 });
  // The reactor's own weight settling downward: this attack comes from BELOW.
  addSub(data, { from: 44, to: 62, glideSec: 0.55, decaySec: 0.9, gain: 0.5, startSec: 0 });
  saturate(data, 1.7);
  compress(data, { threshold: 0.48, ratio: 3.2, attackSec: 0.006, releaseSec: 0.12 });
  write('boss-overload-open', data);
}

// --- 2. ERUPT: one link blows -----------------------------------------------
{
  const rng = mulberry32(3612);
  // 0.45 -> 0.55s, and rebuilt as a BLAST (user 2026-08-19: "le falta un toque
  // para que suene más explosivo"). The first version was a muffled thump: all
  // body, no crack, so it read as something landing rather than as something
  // detonating. What was missing is the front of an explosion — a broadband
  // crack ahead of the low end — plus debris that outlives it.
  //
  // Still the shortest cue of the fight, and that constraint has not moved:
  // four of these land 0.45s apart, so a long tail would smear the chain into
  // one continuous roar and the SEQUENCE — the thing the player reads to dodge
  // — would stop being audible as steps.
  const data = buffer(0.55);
  // THE CRACK, first and loudest: broadband, almost no pitch, over in 25ms.
  addTransient(data, rng, { lengthSec: 0.025, centerHz: 4200, q: 0.7, gain: 0.95, startSec: 0 });
  addTransient(data, rng, { lengthSec: 0.05, centerHz: 1500, q: 0.8, gain: 0.7, startSec: 0.002 });
  // The body right behind it, deeper and faster than before (96->38 in 0.10s
  // became 118->28 in 0.075s): a shorter, steeper drop is what reads as a
  // detonation instead of a drum.
  addTransient(data, rng, { lengthSec: 0.06, centerHz: 130, q: 1.6, gain: 0.85, startSec: 0.003 });
  addSub(data, { from: 118, to: 28, glideSec: 0.075, decaySec: 0.24, gain: 0.95, startSec: 0 });
  // Blast wash: wide and instant, decaying hard. This is the layer the old
  // version did not have at all.
  addHiss(data, rng, { startSec: 0.002, durSec: 0.2, centerHz: 1100, q: 0.35, gain: 0.5, shape: 2.4 });
  // Slag and grit thrown up, now lasting past the blast so debris is heard
  // falling back — the tail that says "the floor came apart".
  addHiss(data, rng, { startSec: 0.01, durSec: 0.42, centerHz: 2600, q: 0.5, gain: 0.34, shape: 1.7 });
  addHiss(data, rng, { startSec: 0.02, durSec: 0.3, centerHz: 6200, q: 0.6, gain: 0.16, shape: 2.4 });
  // A short ring so it still reads as METAL erupting rather than as a bass drum.
  addStrain(data, rng, { startSec: 0.004, gain: 0.3, decayScale: 0.34 });
  saturate(data, 2.4);
  compress(data, { threshold: 0.4, ratio: 4.2, attackSec: 0.001, releaseSec: 0.1 });
  write('boss-overload-erupt', data);
}
