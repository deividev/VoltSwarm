// Round 23d — ricochet-throw FROM SCRATCH, new direction. The three metal-impact
// takes (bright ping, lowered ping, dull clank) all failed. Pivot: drop the
// "hitting an object" idea entirely. A ricochet in OUR electric world is a
// springy energy launch — a bouncy electric "dwip" with a wobbling tail that
// implies the bounce potential. Modern/electric, aligned with the synth family,
// distinct from the bolt burst and the pulse ring.
// Regenerates the wired filenames ricochet-throw-1..3.
// Usage: node tools/audio/prototype-r23d-ricochet.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RATE, mulberry32, buffer, biquad, addSub, addRing, saturate, compress,
  normalize, fadeEdges, toWav,
} from './dsp.mjs';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tmp', 'audio-prototypes');

// Synth voice with pitch wobble (springy) + optional glide.
function addSynth(data, { from, to = from, glideSec = 0, lengthSec, gain, startSec = 0, detune = 0.012, harmonics = 8, attackSec = 0.003, decayRatio = 0.6, wobbleHz = 0, wobbleDepth = 0, wobbleDecaySec = 0.05 }) {
  const start = Math.round(startSec * RATE);
  const len = Math.round(lengthSec * RATE);
  for (const vd of [1 - detune, 1, 1 + detune]) {
    let phase = 0;
    for (let i = 0; i < len && start + i < data.length; i++) {
      const t = i / RATE;
      const k = glideSec > 0 ? Math.min(t / glideSec, 1) : 0;
      let freq = (glideSec > 0 ? from * Math.pow(to / from, k) : from) * vd;
      if (wobbleHz > 0) freq *= 1 + wobbleDepth * Math.sin(2 * Math.PI * wobbleHz * t) * Math.exp(-t / wobbleDecaySec);
      phase += freq / RATE;
      let s = 0;
      const maxH = Math.min(harmonics, Math.floor(7000 / freq));
      for (let h = 1; h <= Math.max(1, maxH); h++) s += Math.sin(2 * Math.PI * phase * h) / h;
      data[start + i] += s * (gain / 3) * Math.min(t / attackSec, 1) * Math.exp(-t / (lengthSec * decayRatio));
    }
  }
}

// Springy electric launch: a fast down-bend with a bouncy wobble + wobble ring.
function ricochetThrow(rng, dt) {
  const d = buffer(0.14);
  // The "dwip": a synth bending down fast with a springy wobble (the launch).
  addSynth(d, {
    from: 780 * dt, to: 300 * dt, glideSec: 0.06, lengthSec: 0.1, gain: 0.5,
    wobbleHz: 60, wobbleDepth: 0.14, wobbleDecaySec: 0.05, decayRatio: 0.8,
  });
  // Bounce tail: a wobbling ring that keeps a little springy energy alive.
  addRing(d, { freq: 620 * dt, decaySec: 0.07, gain: 0.16, wobbleHz: 48, wobbleDepth: 0.12, startSec: 0.02 });
  addSub(d, { from: 140 * dt, to: 82 * dt, glideSec: 0.02, decaySec: 0.03, gain: 0.34 });
  biquad(d, 'highpass', 95, 0.707); biquad(d, 'lowpass', 4200 * dt, 0.9);
  saturate(d, 1.4); compress(d, { threshold: 0.34, ratio: 3 });
  return d;
}

mkdirSync(OUT_DIR, { recursive: true });
const DETUNES = [1, 0.96, 1.04];
for (let v = 0; v < DETUNES.length; v++) {
  const rng = mulberry32(234000 + v * 7919);
  const d = ricochetThrow(rng, DETUNES[v]);
  normalize(d, 0.72);
  fadeEdges(d, 0.0005, 0.008);
  writeFileSync(resolve(OUT_DIR, `ricochet-throw-${v + 1}.wav`), toWav(d));
  console.log(`wrote ricochet-throw-${v + 1}.wav (${(d.length / RATE * 1000).toFixed(0)} ms)`);
}
