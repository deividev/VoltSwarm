// Round 34 — player-fatal: the hit that kills you.
//
// It has to be recognisable as the SAME family as player-hit (heavy metal
// impact, no chiptune, no retro laser) while never being mistaken for it. The
// separation is structural rather than louder: player-hit is one short clang
// and stops; this one is a clang that FAILS — the impact opens into an
// electrical surge and a power-down glide, which is the chassis-overload beat
// the visuals play at the same time.
//
// Frame-exactness: the impact transient sits at t=0 so the sound lands on the
// fatal contact frame; everything after it is the tail of that same gesture.
//
// Output: tmp/audio-prototypes/player-fatal-1..2.wav
// Usage: node tools/audio/prototype-r34-fatal.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RATE, mulberry32, buffer, biquad, addSub, addModal, addTransient, addRing,
  addNoiseBed, saturate, compress, normalize, fadeEdges, toWav,
} from './dsp.mjs';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tmp', 'audio-prototypes');

function playerFatal(rng, dt) {
  const d = buffer(0.95);

  // --- Act 1: the impact (0.00s). Same physical vocabulary as player-hit, but
  // heavier and wider so it reads as the last one rather than another one.
  addTransient(d, rng, { lengthSec: 0.009, centerHz: 1100 * dt, q: 1.4, gain: 0.9 });
  addModal(d, rng, {
    modes: [150 * dt, 258 * dt, 405 * dt], gains: [0.8, 0.34, 0.16],
    decays: [0.07, 0.045, 0.03], detuneCents: 12, gain: 0.85,
  });
  addSub(d, { from: 180 * dt, to: 38 * dt, glideSec: 0.035, decaySec: 0.16, gain: 1.05 });

  // --- Act 2: the surge (0.05s). Arcing current escaping the chassis — a
  // resonant noise wash, NOT a tonal sweep, so it stays industrial. Two bands
  // detuned against each other give the flicker the strobe has on screen.
  addNoiseBed(d, rng, { decaySec: 0.24, gain: 0.5, centerHz: 2400 * dt, q: 1.1, startSec: 0.05 });
  addNoiseBed(d, rng, { decaySec: 0.3, gain: 0.34, centerHz: 3700 * dt, q: 2.2, startSec: 0.07 });
  addRing(d, {
    freq: 620 * dt, decaySec: 0.22, gain: 0.2,
    // Fast wobble = electrical instability, the audible twin of the strobe.
    wobbleHz: 34, wobbleDepth: 0.16, startSec: 0.06,
  });

  // --- Act 3: the power-down (0.18s). A long downward glide. This is the exact
  // gesture that was REJECTED on player-hit for reading synthy — here it is the
  // point: a machine losing power, not a body being struck.
  addSub(d, { from: 96 * dt, to: 21 * dt, glideSec: 0.5, decaySec: 0.34, gain: 0.62, startSec: 0.18 });
  addRing(d, { freq: 300 * dt, decaySec: 0.3, gain: 0.14, wobbleHz: 7, wobbleDepth: 0.3, startSec: 0.2 });

  // --- Act 4: debris. Loose plate rattle settling under the tail, quiet enough
  // to be felt rather than counted.
  addModal(d, rng, {
    modes: [880 * dt, 1310 * dt], gains: [0.16, 0.1],
    decays: [0.05, 0.035], detuneCents: 30, gain: 0.5, startSec: 0.3,
  });
  addNoiseBed(d, rng, { decaySec: 0.18, gain: 0.12, centerHz: 1500 * dt, q: 0.9, startSec: 0.34 });

  biquad(d, 'highpass', 42, 0.707);
  biquad(d, 'lowpass', 5200 * dt, 0.9);
  // Same finishing chain as the rest of the palette — this is what stopped the
  // welder beam from sounding cheap, and the fatal cue has to sit in that mix.
  saturate(d, 1.9);
  compress(d, { threshold: 0.28, ratio: 4.5, releaseSec: 0.09 });
  return d;
}

mkdirSync(OUT_DIR, { recursive: true });
const DETUNES = [1, 0.95];
for (let v = 0; v < DETUNES.length; v++) {
  const rng = mulberry32(340000 + v * 7919);
  const d = playerFatal(rng, DETUNES[v]);
  // Peak sits above player-hit (0.82): death is the top of the loudness pyramid
  // for player-facing damage, below only the boss beats.
  normalize(d, 0.9);
  fadeEdges(d, 0.0005, 0.012);
  const file = `player-fatal-${v + 1}.wav`;
  writeFileSync(resolve(OUT_DIR, file), toWav(d));
  console.log(`wrote ${file} (${(d.length / RATE * 1000).toFixed(0)} ms)`);
}
