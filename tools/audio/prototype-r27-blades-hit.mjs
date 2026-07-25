// Round 27 (v7) — Saw Blades HIT: a metallic blade SHEAR (slice), not a struck bell.
//
// v5/v6 led with an inharmonic modal ring — user: "muy metalico / como golpear un
// cristal". That's the SAME crystal/glass failure the ricochet's metal takes hit:
// a modal bank is a STRUCK object resonating (glass, bell), NOT a blade cutting.
// A real cut is a metallic SHEAR — bright resonant NOISE that sweeps ("shhing"),
// with no tonal ring. v7 removes the bright modal zing entirely and leads with
// resonant-noise shear; only a low fast-decay "clank" stays for body (low = not
// glassy). "No perder el estilo": short, produced, subtle electric edge, modern.
//
// Fires on blade contact, cooldown-throttled → a swarm reads as a steady tick
// (law 3), asymmetric from cube-death knocks (law 4). Tight variants (±2%).
// Output: tmp/audio-prototypes/blades-hit-1..3.wav
// Usage: node tools/audio/prototype-r27-blades-hit.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RATE, mulberry32, buffer, biquad, addModal, addFm, addTransient,
  saturate, compress, normalize, fadeEdges, toWav,
} from './dsp.mjs';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tmp', 'audio-prototypes');

/** Metallic SHEAR: high-Q resonant noise whose center sweeps under a swell→cut
 *  window — the "shhing" of a sharp edge shearing through. Resonant enough to
 *  read METAL, but NOISE (no tonal partials) so it never rings like glass. */
function addShear(data, rng, { fromHz, toHz, q, durSec, gain, startSec = 0 }) {
  const start = Math.round(startSec * RATE);
  const len = Math.round(durSec * RATE);
  const chunk = 12;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
  for (let i = 0; i < len && start + i < data.length; i++) {
    if (i % chunk === 0) {
      const k = i / len;
      const freq = fromHz * Math.pow(toHz / fromHz, k);
      const w0 = (2 * Math.PI * freq) / RATE;
      const alpha = Math.sin(w0) / (2 * q);
      const a0 = 1 + alpha;
      b0 = alpha / a0; b1 = 0; b2 = -alpha / a0;
      a1 = (-2 * Math.cos(w0)) / a0; a2 = (1 - alpha) / a0;
    }
    const p = i / len;
    // Asymmetric swell→cut: ease up to ~40% (the bite), faster shear-off after →
    // the blade passes THROUGH, not a sitting tone.
    const env = p < 0.4
      ? Math.sin((p / 0.4) * (Math.PI / 2))
      : Math.cos(((p - 0.4) / 0.6) * (Math.PI / 2));
    const x = (rng() * 2 - 1);
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    data[start + i] += y * gain * env;
  }
}

// Metallic blade cut: bite → metallic shear (two resonant-noise layers) → weight.
function bladesHit(rng, dt) {
  const d = buffer(0.095);
  // 1) CONTACT — a short bite the instant the edge meets the robot.
  addTransient(d, rng, { lengthSec: 0.005, centerHz: 2900 * dt, q: 1.3, gain: 0.5 });
  // 2) METAL SHEAR (hero) — resonant noise sweeping DOWN, the main "shhing".
  addShear(d, rng, { fromHz: 4300 * dt, toHz: 2000 * dt, q: 6, durSec: 0.055, gain: 0.62 });
  // 3) Bright shear layer — a thinner, brighter pass for edge sparkle (still
  //    noise, so no glassy ring), quick.
  addShear(d, rng, { fromHz: 5400 * dt, toHz: 3300 * dt, q: 5, durSec: 0.032, gain: 0.3, startSec: 0.003 });
  // 4) CLANK body — one LOW fast-decay partial for weight (golpeando). Low freq
  //    doesn't read glassy; keep short so it doesn't ring.
  addModal(d, rng, { modes: [560 * dt, 900 * dt], gains: [0.4, 0.2], decays: [0.02, 0.013], detuneCents: 10, gain: 0.5 });
  // 5) Subtle electric edge — keeps it in OUR world without masking the steel.
  addFm(d, { from: 2000 * dt, to: 1300 * dt, glideSec: 0.012, ratio: 2, index: 2, indexDecaySec: 0.009, ampDecaySec: 0.012, gain: 0.14, detune: 0.008 });
  // Warm-bright: metal noise sits up top, but keep it from getting glassy/shrill.
  biquad(d, 'highpass', 280, 0.707);
  biquad(d, 'lowpass', 6600 * dt, 0.8);
  saturate(d, 1.4);
  compress(d, { threshold: 0.4, ratio: 2.6 });
  return d;
}

mkdirSync(OUT_DIR, { recursive: true });
const SETS = { 'blades-hit': { make: bladesHit, seed: 275000, peak: 0.52 } };
// TIGHT variants (±2%) so the strike is consistent hit-to-hit.
const DETUNES = [1, 0.98, 1.02];
for (const [name, { make, seed, peak }] of Object.entries(SETS)) {
  for (let v = 0; v < DETUNES.length; v++) {
    const rng = mulberry32(seed + v * 7919);
    const d = make(rng, DETUNES[v]);
    normalize(d, peak);
    fadeEdges(d, 0.0003, 0.006);
    const file = `${name}-${v + 1}.wav`;
    writeFileSync(resolve(OUT_DIR, file), toWav(d));
    console.log(`wrote ${file} (${(d.length / RATE * 1000).toFixed(0)} ms)`);
  }
}
