// Round 35 — the Hazard Marshal's sector sweep, in three beats.
//
// The attack has three moments on screen and none of them made a sound, which
// is why it read as scenery: the wedge lights up, it brightens toward its
// deadline, and it discharges.
//
// DIRECTION: HEAVY INDUSTRIAL MACHINERY (user call 2026-08-19). The first pass
// was built as an energy weapon — capacitor ring, electric surge — and was
// rejected outright. Two reasons it was the wrong call, and they are the brief
// for this one: the foundry is the setting, and the PLAYER's arsenal already
// owns the electric register (bolt, pulse, welder), so a boss whose signature
// attack is also electric competes with the weapons instead of towering over
// them. This is a stamping press, not a raygun: air, steel and mass.
//
//   boss-sweep-charge : the plates arm. Pneumatic release, then a heavy metal
//                       seat that SETTLES — "the press is loaded", not "now".
//   boss-sweep-warn   : the last 0.4s. A ratchet whose clicks accelerate over a
//                       rising pressure hiss, ending exactly at the discharge
//                       (zero-latency rule: the WAV is cut to the real
//                       FINAL_BOSS.sweep.warnLeadS, never by ear).
//   boss-sweep-fire   : the stamp. Broadband impact, a sub that drops like a
//                       falling mass, the plate's own ring, and steam blowing
//                       off behind it.
//
// House style holds: modern, never retro. No square-wave arcade lasers, no
// bitcrush. Deterministic: same seed, same bytes.
//
// Output: tmp/audio-prototypes/boss-sweep-{charge,warn,fire}.wav
// Usage: node tools/audio/prototype-r35-sweep.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RATE, mulberry32, buffer, biquad, addSub, addModal, addTransient,
  addNoiseBed, saturate, compress, normalize, fadeEdges, toWav,
} from './dsp.mjs';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tmp', 'audio-prototypes');

/** Pneumatic hiss: filtered noise whose envelope can rise (pressure building)
 *  or fall (a valve venting). The single most identifiable industrial texture,
 *  and the one thing an energy weapon never has. */
function addHiss(data, rng, { startSec, durSec, centerHz, q, gain, rise = false, shape = 1 }) {
  const start = Math.round(startSec * RATE);
  const len = Math.round(durSec * RATE);
  const tmp = new Float64Array(len);
  for (let i = 0; i < len; i++) tmp[i] = rng() * 2 - 1;
  biquad(tmp, 'bandpass', centerHz, q);
  for (let i = 0; i < len && start + i < data.length; i++) {
    const k = i / len;
    const env = rise ? Math.pow(k, shape) : Math.pow(1 - k, shape);
    data[start + i] += tmp[i] * gain * env;
  }
}

/** Struck steel: inharmonic modes with the long-ish decays of a big plate.
 *  Separate from addModal's defaults so the "metal" of this attack is one
 *  recognisable object every time it is heard. */
function addPlate(data, rng, { startSec, gain, decayScale = 1, bright = 1 }) {
  addModal(data, rng, {
    modes: [163, 247, 389, 571, 823, 1187].map((f) => f * bright),
    gains: [0.34, 0.26, 0.2, 0.13, 0.08, 0.05],
    decays: [0.46, 0.34, 0.25, 0.17, 0.11, 0.07].map((d) => d * decayScale),
    detuneCents: 14,
    gain,
    startSec,
  });
}

/** Ratchet: metallic clicks whose gaps shrink geometrically, so the deadline is
 *  audible as acceleration rather than as a countdown of equal beeps. */
function addRatchet(data, rng, { count, durSec, gain }) {
  for (let n = 0; n < count; n++) {
    const at = durSec * (1 - Math.pow(1 - n / count, 2));
    const loudness = gain * (0.5 + 0.5 * (n / Math.max(1, count - 1)));
    // Click plus a very short metal tail: a pawl dropping into a tooth.
    addTransient(data, rng, { lengthSec: 0.02, centerHz: 2300, q: 6, gain: loudness, startSec: at });
    addModal(data, rng, {
      modes: [742, 1163, 1621],
      gains: [0.3, 0.18, 0.1],
      decays: [0.05, 0.035, 0.025],
      gain: loudness * 0.55,
      startSec: at,
    });
  }
}

function write(name, data) {
  fadeEdges(data, 0.004, 0.02);
  normalize(data, 0.92);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(resolve(OUT_DIR, `${name}.wav`), toWav(data));
  let peak = 0;
  for (const s of data) peak = Math.max(peak, Math.abs(s));
  console.log(`${name}.wav  ${(data.length / RATE).toFixed(2)}s  peak ${peak.toFixed(3)}`);
}

// --- 1. CHARGE: the press arms ----------------------------------------------
{
  const rng = mulberry32(3511);
  const data = buffer(0.6);
  // Valve first — air before steel, which is the order a real machine works in.
  addHiss(data, rng, { startSec: 0, durSec: 0.26, centerHz: 3000, q: 0.7, gain: 0.42, shape: 1.6 });
  // Then the plates seat: a heavy, damped clunk. Damped on purpose — this is
  // the load, not the strike, so the metal must NOT ring out.
  addTransient(data, rng, { lengthSec: 0.09, centerHz: 240, q: 2.2, gain: 0.72, startSec: 0.055 });
  addPlate(data, rng, { startSec: 0.055, gain: 0.42, decayScale: 0.45 });
  addSub(data, { from: 78, to: 52, glideSec: 0.14, decaySec: 0.3, gain: 0.55, startSec: 0.055 });
  // Low pressure holding under it: the machine is now live and waiting.
  addHiss(data, rng, { startSec: 0.1, durSec: 0.45, centerHz: 620, q: 1.2, gain: 0.13, shape: 0.8 });
  saturate(data, 1.6);
  compress(data, { threshold: 0.5, ratio: 3, attackSec: 0.005, releaseSec: 0.1 });
  write('boss-sweep-charge', data);
}

// --- 2. WARN: the last 0.4s -------------------------------------------------
{
  const rng = mulberry32(3512);
  // Exactly FINAL_BOSS.sweep.warnLeadS long, so its end IS the discharge.
  const data = buffer(0.4);
  // Pressure climbing to the release.
  addHiss(data, rng, { startSec: 0, durSec: 0.4, centerHz: 2100, q: 0.9, gain: 0.34, rise: true, shape: 2.0 });
  // Something enormous taking up slack: a groan that climbs a little.
  addSub(data, { from: 58, to: 96, glideSec: 0.36, decaySec: 1.6, gain: 0.34, startSec: 0 });
  addModal(data, rng, {
    modes: [128, 191, 289],
    gains: [0.24, 0.15, 0.09],
    decays: [0.5, 0.4, 0.3],
    gain: 0.4,
  });
  addRatchet(data, rng, { count: 6, durSec: 0.375, gain: 0.5 });
  saturate(data, 1.8);
  compress(data, { threshold: 0.45, ratio: 3.5, attackSec: 0.003, releaseSec: 0.07 });
  write('boss-sweep-warn', data);
}

// --- 3. FIRE: the stamp -----------------------------------------------------
{
  const rng = mulberry32(3513);
  const data = buffer(1.0);
  // The impact: broadband crack, then the dull body of something very heavy
  // arriving. Two transients, because a single one reads as a gunshot.
  addTransient(data, rng, { lengthSec: 0.05, centerHz: 3400, q: 1.2, gain: 0.8, startSec: 0 });
  addTransient(data, rng, { lengthSec: 0.16, centerHz: 320, q: 1.1, gain: 0.9, startSec: 0.006 });
  // The mass falling: a long sub drop is what makes an impact read as TONNES
  // rather than as a hit.
  addSub(data, { from: 124, to: 26, glideSec: 0.2, decaySec: 0.44, gain: 1.0, startSec: 0 });
  // The plate rings out — bright and long, the opposite of the charge's damped
  // seat, so loading and firing can never be mistaken for one another.
  addPlate(data, rng, { startSec: 0.004, gain: 0.62, decayScale: 1.25, bright: 1.06 });
  // Steam blowing off behind the strike: the tail that says "machine", and the
  // sound of the blast travelling that the new floor animation draws.
  addHiss(data, rng, { startSec: 0.05, durSec: 0.62, centerHz: 1500, q: 0.6, gain: 0.3, shape: 1.5 });
  addHiss(data, rng, { startSec: 0.12, durSec: 0.5, centerHz: 480, q: 0.9, gain: 0.16, shape: 1.2 });
  saturate(data, 2.2);
  compress(data, { threshold: 0.42, ratio: 4, attackSec: 0.002, releaseSec: 0.13 });
  write('boss-sweep-fire', data);
}
