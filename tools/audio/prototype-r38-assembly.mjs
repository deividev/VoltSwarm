// Round 38 — bodies materializing at the Hazard Marshal's drop zones.
//
// The ONE place the fight is allowed to sound electric, and the reason is that
// it is not an attack: it is matter appearing. The three attacks are industrial
// (press, pressure, battery) precisely so they do not compete with the player's
// electric arsenal — but a spawn is a different verb from all four, so it can
// take the register nothing else in the fight uses without blurring anything.
//
// SECOND PASS (user 2026-08-19): "más eléctrico, para que se sepa que
// mantenerse en esa zona hace daño". The first take resolved into a dry
// mechanical thud, which said "a bot landed" — true, but it said nothing about
// the floor being live. The information the cue has to carry is not "something
// arrived", it is "do not stand here", so the arrival is now buried inside an
// electrical event: a hard arc discharge, a crackle that keeps spitting after
// it, and a charged hum that hangs over the spot as it fades.
//
//   boss-assembly-spawn : arc crack -> digital shimmer resolving DOWNWARD (data
//                         becoming a body) -> the body landing, with crackle
//                         over it and a live hum decaying out.
//
// Deliberately NOT retro: the shimmer is a bank of detuned partials and the
// crackle is filtered noise, never a bitcrush or an arpeggiated blip.
//
// Output: tmp/audio-prototypes/boss-assembly-spawn.wav
// Usage: node tools/audio/prototype-r38-assembly.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RATE, mulberry32, buffer, biquad, addSub, addModal, addTransient,
  addRing, saturate, compress, normalize, fadeEdges, toWav,
} from './dsp.mjs';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tmp', 'audio-prototypes');

/** A bank of close, detuned partials sweeping DOWNWARD and collapsing into
 *  silence: the sound of something resolving out of noise into a shape. Upward
 *  would read as dematerialising, which is the opposite beat. */
function addResolve(data, rng, { startSec, durSec, fromHz, toHz, gain, partials = 9 }) {
  const start = Math.round(startSec * RATE);
  const len = Math.round(durSec * RATE);
  for (let p = 0; p < partials; p++) {
    const detune = 1 + (p - partials / 2) * 0.023 + (rng() - 0.5) * 0.012;
    let phase = rng() * Math.PI * 2;
    for (let i = 0; i < len && start + i < data.length; i++) {
      const k = i / len;
      const freq = fromHz * Math.pow(toHz / fromHz, k) * detune;
      phase += (2 * Math.PI * freq) / RATE;
      const env = Math.pow(1 - k, 1.3) * Math.min(1, i / (RATE * 0.005));
      data[start + i] += Math.sin(phase) * (gain / partials) * env;
    }
  }
}

/** Electrical crackle: sparse, very short noise bursts through a high resonant
 *  band. This is the layer that says LIVE — a steady tone reads as a machine
 *  humming, but irregular spitting reads as something you should not touch. */
function addCrackle(data, rng, { startSec, durSec, gain, centerHz, density = 90 }) {
  const start = Math.round(startSec * RATE);
  const len = Math.round(durSec * RATE);
  const count = Math.max(1, Math.round(durSec * density));
  for (let n = 0; n < count; n++) {
    const at = startSec + rng() * durSec;
    const decay = 1 - (at - startSec) / durSec;
    addTransient(data, rng, {
      lengthSec: 0.004 + rng() * 0.008,
      centerHz: centerHz * (0.6 + rng() * 1.1),
      q: 10 + rng() * 8,
      gain: gain * (0.25 + rng() * 0.75) * decay * decay,
      startSec: at,
    });
  }
  void len;
}

const rng = mulberry32(3811);
const data = buffer(0.72);

// ARC: the discharge that opens the zone. Loud, wide, and unmistakably electric.
addTransient(data, rng, { lengthSec: 0.02, centerHz: 5200, q: 0.9, gain: 0.85, startSec: 0 });
addTransient(data, rng, { lengthSec: 0.05, centerHz: 2400, q: 2.2, gain: 0.6, startSec: 0.001 });
addRing(data, { freq: 1860, decaySec: 0.13, gain: 0.3, wobbleHz: 62, wobbleDepth: 0.09 });
addRing(data, { freq: 2790, decaySec: 0.09, gain: 0.18, wobbleHz: 47, wobbleDepth: 0.07 });

// The shimmer resolving downward into a body.
addResolve(data, rng, { startSec: 0.012, durSec: 0.3, fromHz: 3100, toHz: 420, gain: 0.6 });

// CRACKLE across the whole event, thickest right after the arc: the floor is
// live and stays live for a moment after the body is there.
addCrackle(data, rng, { startSec: 0.005, durSec: 0.6, gain: 0.42, centerHz: 3400, density: 110 });

// The body landing — still present, but now UNDER the electrical event rather
// than the punchline of it.
addTransient(data, rng, { lengthSec: 0.055, centerHz: 250, q: 2.2, gain: 0.42, startSec: 0.22 });
addSub(data, { from: 108, to: 46, glideSec: 0.07, decaySec: 0.15, gain: 0.5, startSec: 0.22 });
addModal(data, rng, {
  modes: [206, 327, 501],
  gains: [0.24, 0.15, 0.09],
  decays: [0.12, 0.09, 0.06],
  gain: 0.4,
  startSec: 0.22,
});

// The charged hum left hanging over the spot: the tail that means "still hot".
addRing(data, { freq: 148, decaySec: 0.42, gain: 0.22, wobbleHz: 23, wobbleDepth: 0.06, startSec: 0.2 });
addRing(data, { freq: 296, decaySec: 0.33, gain: 0.12, wobbleHz: 31, wobbleDepth: 0.05, startSec: 0.2 });

saturate(data, 2.1);
compress(data, { threshold: 0.44, ratio: 3.6, attackSec: 0.002, releaseSec: 0.1 });
fadeEdges(data, 0.004, 0.03);
normalize(data, 0.92);
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, 'boss-assembly-spawn.wav'), toWav(data));
let peak = 0;
let sum = 0;
for (const s of data) {
  peak = Math.max(peak, Math.abs(s));
  sum += s * s;
}
console.log(
  `boss-assembly-spawn.wav  ${(data.length / RATE).toFixed(2)}s  peak ${peak.toFixed(3)}` +
  `  rms ${Math.sqrt(sum / data.length).toFixed(3)}`,
);
