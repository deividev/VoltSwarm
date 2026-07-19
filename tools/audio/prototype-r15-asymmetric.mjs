// Round 15 — asymmetric combat redesign (user: shot+death alternating read as
// "a tennis match"). Root cause: two similar-sized percussive monosyllables
// taking turns. Fix = break the symmetry at the GESTURE level:
//   bolt : "brrt" — a 3-tick electric micro-burst (~65ms). Bursts read as
//          automatic weapons; single pocks read as balls.
//   death: "crunch-fizzle" — noisy breakage + electric sputter, NO tonal pop.
//          A robot breaking, not a ball bouncing back.
// Fatigue law unchanged: dark, short, low peaks, 4 rotating micro-variants.
// Output: tmp/audio-prototypes/burst-bolt-1..4.wav, fizzle-death-1..4.wav
// Usage: node tools/audio/prototype-r15-asymmetric.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RATE, mulberry32, buffer, biquad, addSub, addTransient,
  saturate, compress, normalize, fadeEdges, toWav,
} from './dsp.mjs';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tmp', 'audio-prototypes');

function addArcNoise(data, rng, {
  fromHz, toHz, q, durSec, decaySec, gain, crackle = 0.25, startSec = 0,
}) {
  const start = Math.round(startSec * RATE);
  const len = Math.round(durSec * RATE);
  const chunk = 32;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  let b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
  let gate = 1;
  for (let i = 0; i < len && start + i < data.length; i++) {
    if (i % chunk === 0) {
      const k = i / len;
      const freq = fromHz * Math.pow(toHz / fromHz, k);
      const w0 = (2 * Math.PI * freq) / RATE;
      const alpha = Math.sin(w0) / (2 * q);
      const a0 = 1 + alpha;
      b0 = alpha / a0; b1 = 0; b2 = -alpha / a0;
      a1 = (-2 * Math.cos(w0)) / a0; a2 = (1 - alpha) / a0;
      if (rng() < crackle) gate = 0.2 + rng() * 0.8;
    }
    const t = i / RATE;
    const x = (rng() * 2 - 1) * gate * Math.exp(-t / decaySec);
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    data[start + i] += y * gain;
  }
}

// "Brrt": three tiny electric ticks, slightly falling in pitch, tight rhythm.
function boltBurst(rng, dt) {
  const d = buffer(0.075);
  const tickTimes = [0, 0.021, 0.043];
  tickTimes.forEach((t0, i) => {
    const drop = 1 - i * 0.12; // each tick slightly lower — burst has a shape
    addTransient(d, rng, {
      lengthSec: 0.004, centerHz: 2600 * dt * drop, q: 2.2,
      gain: 0.7 - i * 0.1, startSec: t0,
    });
    addArcNoise(d, rng, {
      fromHz: 1500 * dt * drop, toHz: 600 * dt * drop, q: 2.6,
      durSec: 0.016, decaySec: 0.009, gain: 0.9, crackle: 0.3, startSec: t0 + 0.002,
    });
  });
  addSub(d, { from: 150 * dt, to: 90 * dt, glideSec: 0.04, decaySec: 0.04, gain: 0.3 });
  biquad(d, 'highpass', 130, 0.707);
  biquad(d, 'lowpass', 4400 * dt, 0.9);
  saturate(d, 1.4);
  compress(d, { threshold: 0.35, ratio: 3.5, attackSec: 0.0008 });
  return d;
}

// "Crunch-fizzle": broadband breakage noise + sputtering arc tail. No pitch.
function deathFizzle(rng, dt) {
  const d = buffer(0.09);
  // Breakage: dense filtered noise, fast decay, mid-focused.
  addArcNoise(d, rng, {
    fromHz: 1100 * dt, toHz: 700 * dt, q: 0.9,
    durSec: 0.03, decaySec: 0.014, gain: 1.3, crackle: 0.15,
  });
  // Sputter: gated arc flickering out, falling away.
  addArcNoise(d, rng, {
    fromHz: 900 * dt, toHz: 260 * dt, q: 1.6,
    durSec: 0.055, decaySec: 0.022, gain: 0.8, crackle: 0.45, startSec: 0.018,
  });
  addSub(d, { from: 160 * dt, to: 70 * dt, glideSec: 0.03, decaySec: 0.03, gain: 0.4 });
  biquad(d, 'highpass', 90, 0.707);
  biquad(d, 'lowpass', 3000 * dt, 0.8);
  saturate(d, 1.35);
  return d;
}

mkdirSync(OUT_DIR, { recursive: true });

const SETS = {
  'burst-bolt': { make: boltBurst, seed: 151000, peak: 0.78 },
  'fizzle-death': { make: deathFizzle, seed: 152000, peak: 0.58 },
};
const DETUNES = [1, 0.95, 1.05, 0.9];

for (const [name, { make, seed, peak }] of Object.entries(SETS)) {
  for (let v = 0; v < DETUNES.length; v++) {
    const rng = mulberry32(seed + v * 7919);
    const d = make(rng, DETUNES[v]);
    normalize(d, peak);
    fadeEdges(d, 0.0005, 0.006);
    const file = `${name}-${v + 1}.wav`;
    writeFileSync(resolve(OUT_DIR, file), toWav(d));
    console.log(`wrote ${file} (${(d.length / RATE * 1000).toFixed(0)} ms)`);
  }
}
