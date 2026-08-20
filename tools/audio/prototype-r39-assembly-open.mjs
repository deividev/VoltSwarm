// Round 39 — the Hazard Marshal ORDERING the assembly lines open (phase 2).
//
// The beat that had no sound. `boss-assembly-spawn` already covers each bay
// materialising its bodies, but the ORDER itself — the boss opening the lines,
// 1.4s before anything lands — was emitting a `boss-attack` placeholder that was
// never enabled, so it died inside emit() and the telegraph was carried by the
// picture alone.
//
//   boss-assembly-open : two heavy contactors closing, then the line motors
//                        spinning up. Plays once at the boss when the bays open.
//
// Why motors, and not another "open":
//
//   The fight already owns two openings and they must not be the same event.
//   `boss-overload-open` is PRESSURE — a latch giving way, hiss climbing, the
//   floor about to blow. This one is POWER BEING SWITCHED ON: mechanical,
//   rhythmic, and the only cue in the fight built on a rising harmonic drone.
//   A player who hears rising hiss must know to pick a lane; a player who hears
//   machinery start must know bodies are coming. Two openings that share a
//   texture would be one telegraph wearing two colours.
//
//   It also has to stay clear of its own child. `boss-assembly-spawn` is
//   electric — arcing, bright, matter arriving. This is the switchgear that
//   precedes it: low, mechanical, no arc. Cause and effect, not an echo.
//
// House style holds: modern industrial, never retro; deterministic; short
// enough to leave air before the first bay lands.
//
// Output: public/assets/audio/prototypes/boss-assembly-open.wav
// Usage: node tools/audio/prototype-r39-assembly-open.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RATE, mulberry32, buffer, biquad, addSub, addModal, addTransient, addFm,
  saturate, compress, normalize, fadeEdges, toWav,
} from './dsp.mjs';

const OUT_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', 'public', 'assets', 'audio', 'prototypes',
);

/** Filtered noise with a shaped envelope — air, grit, the brush of a motor. */
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

/** A contactor closing: a hard, dry mechanical clack with a short metal body.
 *  Deliberately DRY — a ringing one would read as a hit, and nothing is being
 *  struck here; a switch is being thrown. */
function addContactor(data, rng, { startSec, gain }) {
  addTransient(data, rng, { lengthSec: 0.016, centerHz: 2400, q: 1.1, gain: gain * 0.75, startSec });
  addTransient(data, rng, { lengthSec: 0.035, centerHz: 620, q: 1.8, gain, startSec: startSec + 0.002 });
  addModal(data, rng, {
    modes: [214, 331, 528],
    gains: [0.3, 0.2, 0.11],
    decays: [0.075, 0.055, 0.035],
    detuneCents: 14,
    gain: gain * 0.6,
    startSec: startSec + 0.002,
  });
}

/** A line motor coming up to speed: a harmonic stack gliding upward, with the
 *  slight beating of several units that are not quite in phase. This is the
 *  layer that carries the meaning — machinery that was off is now running. */
function addMotorSpinUp(data, { startSec, from, to, glideSec, gain, riseSec }) {
  // Weighted UP the harmonic stack rather than down. MEASURED: with the first
  // pass's weights this cue landed at spectral centroid 230 Hz against
  // boss-overload-open's 313 — darker than the pressure cue it has to be told
  // apart from, and with 1% of its energy above 2 kHz it had no surface at all.
  // A motor is heard through its harmonics; only the fundamental is a hum.
  const partials = [
    { mult: 1, gain: 0.75, decay: 1.1 },
    { mult: 2, gain: 0.62, decay: 1 },
    { mult: 3, gain: 0.44, decay: 0.9 },
    { mult: 4.5, gain: 0.3, decay: 0.8 },
    { mult: 6, gain: 0.18, decay: 0.7 },
    { mult: 8.5, gain: 0.1, decay: 0.6 },
  ];
  // Rendered into its OWN buffer so a rising envelope can be applied to it.
  // addFm only decays from its onset, and MEASURED that produced a cue whose
  // loudest moment was its first 100ms — the same shape as the pressure cue it
  // has to be told apart from. A motor coming up to speed gets LOUDER; that
  // difference survives a busy mix better than any difference in timbre.
  const layer = new Float64Array(data.length);
  for (const partial of partials) {
    addFm(layer, {
      from: from * partial.mult,
      to: to * partial.mult,
      glideSec,
      ratio: 2,
      // Low index: this is a motor, not a bell. The FM is here for the metallic
      // edge on the attack, and it has to be gone by the time it is at speed.
      index: 1.4,
      indexDecaySec: 0.18,
      ampDecaySec: partial.decay,
      gain: gain * partial.gain,
      startSec,
      // Two units, slightly apart: the beating is what stops a synth tone from
      // sounding like a synth tone.
      detune: 0.006,
    });
  }
  const start = Math.round(startSec * RATE);
  const rise = Math.max(1, Math.round(riseSec * RATE));
  for (let i = start; i < data.length; i++) {
    const k = i - start;
    // Rise to full over riseSec, then hold: the line is running now, and it
    // stays running until the bays land.
    data[i] += layer[i] * Math.min(1, k / rise);
  }
}

function write(name, data) {
  fadeEdges(data, 0.004, 0.03);
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

// --- OPEN: the order goes out ------------------------------------------------
{
  const rng = mulberry32(3901);
  // 0.78s against a 1.4s telegraph: the order lands, the machinery is heard
  // coming up, and there is still air before the first bay materialises. A cue
  // that ran the whole telegraph would collide with its own spawn.
  const data = buffer(0.78);

  // 1. Two contactors, 90ms apart. Two, not one: a single click is a UI sound,
  //    a pair is switchgear — and the gap is what makes it read as deliberate.
  addContactor(data, rng, { startSec: 0, gain: 0.8 });
  addContactor(data, rng, { startSec: 0.09, gain: 0.62 });

  // 2. The floor takes the load. Short and low, under the second contactor:
  //    the weight of something big being energised, not an impact.
  //    Kept deliberately small: the low end is where boss-overload-open lives
  //    (86% of its energy under 300 Hz), and this cue is not a pressure event.
  addSub(data, { from: 58, to: 41, glideSec: 0.24, decaySec: 0.3, gain: 0.3, startSec: 0.085 });

  // 3. The motors come up, starting on the second contactor. 74 -> 137 Hz is
  //    just over an octave: enough to read as "spinning up" without turning
  //    into a siren, which is the shape the enemy-projectile cues own.
  addMotorSpinUp(data, { startSec: 0.1, from: 74, to: 137, glideSec: 0.5, gain: 0.72, riseSec: 0.42 });

  // 4. Belt and bearing noise riding the spin-up, so the motors have a surface.
  //    They also carry the ENVELOPE: this cue has to grow while the other
  //    opening decays, because that difference survives a busy mix better than
  //    any difference in timbre.
  addHiss(data, rng, { startSec: 0.1, durSec: 0.62, centerHz: 1500, q: 0.9, gain: 0.3, rise: true, shape: 1.1 });
  addHiss(data, rng, { startSec: 0.12, durSec: 0.58, centerHz: 3600, q: 0.7, gain: 0.19, rise: true, shape: 1.4 });
  addHiss(data, rng, { startSec: 0.14, durSec: 0.54, centerHz: 6800, q: 0.8, gain: 0.09, rise: true, shape: 1.8 });

  // 5. Bay shutters unlocking: a scatter of small metal releases across the
  //    spin-up. Irregular on purpose — several doors, not one mechanism.
  for (const [at, level] of [[0.2, 0.34], [0.27, 0.26], [0.36, 0.32], [0.47, 0.28], [0.56, 0.22]]) {
    addTransient(data, rng, { lengthSec: 0.02, centerHz: 1800, q: 2.2, gain: level, startSec: at });
  }

  saturate(data, 1.8);
  compress(data, { threshold: 0.46, ratio: 3.4, attackSec: 0.004, releaseSec: 0.14 });
  write('boss-assembly-open', data);
}
