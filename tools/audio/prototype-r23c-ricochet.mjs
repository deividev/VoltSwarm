// Round 23c — ricochet-throw v3 (user: still too high, "sounds like hitting
// glass/crystal"). The clean high modal ring = a glass bell. A scrap chunk
// should CLANK: dull, low-mid, damped, inharmonic, with grit — junk metal, not
// crystal. Lower modes, short decays, noise body, hard top-end tame.
// Regenerates the wired filenames ricochet-throw-1..3.
// Usage: node tools/audio/prototype-r23c-ricochet.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RATE, mulberry32, buffer, biquad, addSub, addModal, addTransient,
  saturate, compress, normalize, fadeEdges, toWav,
} from './dsp.mjs';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tmp', 'audio-prototypes');

function addArcNoise(data, rng, { fromHz, toHz, q, durSec, decaySec, gain, crackle = 0.15, startSec = 0 }) {
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
      if (rng() < crackle) gate = 0.3 + rng() * 0.7;
    }
    const t = i / RATE;
    const x = (rng() * 2 - 1) * gate * Math.exp(-t / decaySec);
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    data[start + i] += y * gain;
  }
}

// Junk-metal clank: dull damped inharmonic body + grit + weight. No crystal ring.
function ricochetThrow(rng, dt) {
  const d = buffer(0.13);
  // Contact — a mid transient, not a bright ping.
  addTransient(d, rng, { lengthSec: 0.005, centerHz: 1050 * dt, q: 1.3, gain: 0.5 });
  // Dull clank body: low-mid inharmonic modes, SHORT damped decays (no bell ring).
  addModal(d, rng, {
    modes: [470 * dt, 715 * dt, 990 * dt], gains: [0.55, 0.3, 0.14],
    decays: [0.026, 0.018, 0.012], detuneCents: 22, gain: 0.8, startSec: 0.004,
  });
  // Scrap grit — a short dull noise scrape.
  addArcNoise(d, rng, { fromHz: 720 * dt, toHz: 300 * dt, q: 0.9, durSec: 0.03, decaySec: 0.014, gain: 0.38 });
  addSub(d, { from: 150 * dt, to: 78 * dt, glideSec: 0.02, decaySec: 0.03, gain: 0.36 });
  biquad(d, 'highpass', 90, 0.707); biquad(d, 'lowpass', 3600 * dt, 0.85);
  saturate(d, 1.5); compress(d, { threshold: 0.34, ratio: 3.5 });
  return d;
}

mkdirSync(OUT_DIR, { recursive: true });
const DETUNES = [1, 0.96, 1.04];
for (let v = 0; v < DETUNES.length; v++) {
  const rng = mulberry32(233000 + v * 7919);
  const d = ricochetThrow(rng, DETUNES[v]);
  normalize(d, 0.72);
  fadeEdges(d, 0.0005, 0.008);
  writeFileSync(resolve(OUT_DIR, `ricochet-throw-${v + 1}.wav`), toWav(d));
  console.log(`wrote ricochet-throw-${v + 1}.wav (${(d.length / RATE * 1000).toFixed(0)} ms)`);
}
