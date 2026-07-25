// Round 23b — weapons batch A tweaks from user feedback.
//   pulse-fire     : "le falta algo" → add a punchy release + fuller ring +
//                    more low body so the energy pulse feels satisfying.
//   ricochet-throw : "el lanzamiento demasiado agudo, los rebotes me encantan"
//                    → lower/soften the initial toss and tame the top end, KEEP
//                    the metallic ringing ping (the beloved "bounce").
//   press-slam     : unchanged (user likes it) — not regenerated here.
// Regenerates the same wired filenames (pulse-fire-1..3, ricochet-throw-1..3).
// Usage: node tools/audio/prototype-r23b-weapons-a.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RATE, mulberry32, buffer, biquad, addSub, addModal, addTransient,
  addRing, saturate, compress, normalize, fadeEdges, toWav,
} from './dsp.mjs';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tmp', 'audio-prototypes');

function addSynth(data, { from, to = from, glideSec = 0, lengthSec, gain, startSec = 0, detune = 0.012, harmonics = 8, attackSec = 0.004, decayRatio = 0.6 }) {
  const start = Math.round(startSec * RATE);
  const len = Math.round(lengthSec * RATE);
  for (const vd of [1 - detune, 1, 1 + detune]) {
    let phase = 0;
    for (let i = 0; i < len && start + i < data.length; i++) {
      const t = i / RATE;
      const k = glideSec > 0 ? Math.min(t / glideSec, 1) : 0;
      const freq = (glideSec > 0 ? from * Math.pow(to / from, k) : from) * vd;
      phase += freq / RATE;
      let s = 0;
      const maxH = Math.min(harmonics, Math.floor(7000 / freq));
      for (let h = 1; h <= Math.max(1, maxH); h++) s += Math.sin(2 * Math.PI * phase * h) / h;
      data[start + i] += s * (gain / 3) * Math.min(t / attackSec, 1) * Math.exp(-t / (lengthSec * decayRatio));
    }
  }
}

function addArcNoise(data, rng, { fromHz, toHz, q, durSec, decaySec, gain, crackle = 0.25, startSec = 0 }) {
  const start = Math.round(startSec * RATE);
  const len = Math.round(durSec * RATE);
  const chunk = 32;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0, gate = 1;
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

// Pulse v2: punchy release + fuller ring + more low body.
function pulseFire(rng, dt) {
  const d = buffer(0.2);
  addTransient(d, rng, { lengthSec: 0.005, centerHz: 1300 * dt, q: 1.8, gain: 0.4 }); // the release punch
  addSynth(d, { from: 280 * dt, to: 560 * dt, glideSec: 0.07, lengthSec: 0.16, gain: 0.44, decayRatio: 0.95 });
  addArcNoise(d, rng, { fromHz: 2000 * dt, toHz: 640 * dt, q: 2.4, durSec: 0.03, decaySec: 0.014, gain: 0.28 });
  addRing(d, { freq: 780 * dt, decaySec: 0.12, gain: 0.2, wobbleHz: 40, wobbleDepth: 0.06, startSec: 0.015 });
  addRing(d, { freq: 1170 * dt, decaySec: 0.1, gain: 0.12, wobbleHz: 33, wobbleDepth: 0.05, startSec: 0.02 });
  addSub(d, { from: 135 * dt, to: 68 * dt, glideSec: 0.04, decaySec: 0.08, gain: 0.5 });
  biquad(d, 'highpass', 80, 0.707); biquad(d, 'lowpass', 5200 * dt, 0.9);
  saturate(d, 1.5); compress(d, { threshold: 0.32, ratio: 3.5 });
  return d;
}

// Ricochet v2: lower/softer toss, tamed top, metallic ring kept.
function ricochetThrow(rng, dt) {
  const d = buffer(0.15);
  addArcNoise(d, rng, { fromHz: 880 * dt, toHz: 360 * dt, q: 1.5, durSec: 0.03, decaySec: 0.014, gain: 0.42, crackle: 0.1 });
  // The beloved metallic ping — slightly lower, still bright and ringing.
  addModal(d, rng, { modes: [1620 * dt, 2280 * dt], gains: [0.5, 0.26], decays: [0.055, 0.034], detuneCents: 12, gain: 0.8, startSec: 0.008 });
  addSub(d, { from: 140 * dt, to: 84 * dt, glideSec: 0.02, decaySec: 0.03, gain: 0.32 });
  biquad(d, 'highpass', 120, 0.707); biquad(d, 'lowpass', 5600 * dt, 0.9);
  saturate(d, 1.3); compress(d, { threshold: 0.35, ratio: 3 });
  return d;
}

mkdirSync(OUT_DIR, { recursive: true });
const SETS = {
  'pulse-fire': { make: pulseFire, seed: 231000, peak: 0.74 },
  'ricochet-throw': { make: ricochetThrow, seed: 233000, peak: 0.72 },
};
const DETUNES = [1, 0.96, 1.04];
for (const [name, { make, seed, peak }] of Object.entries(SETS)) {
  for (let v = 0; v < DETUNES.length; v++) {
    const rng = mulberry32(seed + v * 7919);
    const d = make(rng, DETUNES[v]);
    normalize(d, peak);
    fadeEdges(d, 0.0005, 0.008);
    const file = `${name}-${v + 1}.wav`;
    writeFileSync(resolve(OUT_DIR, file), toWav(d));
    console.log(`wrote ${file} (${(d.length / RATE * 1000).toFixed(0)} ms)`);
  }
}
