// Serious DSP engine for offline SFX authoring (deterministic, no dependencies).
// Building blocks: RBJ biquad filters with resonance, FM voices with index
// envelopes, modal banks (struck-metal bodies), saturation stages and a simple
// feed-forward compressor for punch. All render into Float64Array buffers.

export const RATE = 44_100;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const buffer = (seconds) => new Float64Array(Math.round(seconds * RATE));

// --- RBJ biquads (Audio EQ Cookbook) ---

function biquadCoeffs(type, freq, q, rate = RATE) {
  const w0 = (2 * Math.PI * freq) / rate;
  const cos = Math.cos(w0), sin = Math.sin(w0);
  const alpha = sin / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lowpass') {
    b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2;
  } else if (type === 'highpass') {
    b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2;
  } else { // bandpass (constant peak gain)
    b0 = alpha; b1 = 0; b2 = -alpha;
  }
  a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

export function biquad(data, type, freq, q = 0.707) {
  const { b0, b1, b2, a1, a2 } = biquadCoeffs(type, freq, q);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < data.length; i++) {
    const x = data[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    data[i] = y;
  }
}

// --- Sources ---

/** FM voice: carrier glides from/to, modulator at ratio*carrier, index decays. */
export function addFm(data, {
  from, to, glideSec, ratio, index, indexDecaySec,
  ampDecaySec, gain, startSec = 0, detune = 0,
}) {
  const start = Math.round(startSec * RATE);
  const voices = detune > 0 ? [1, 1 + detune] : [1];
  for (const vd of voices) {
    let carPhase = 0, modPhase = 0;
    for (let i = start; i < data.length; i++) {
      const t = (i - start) / RATE;
      const k = glideSec > 0 ? Math.min(t / glideSec, 1) : 1;
      const freq = (from * Math.pow(to / from, k)) * vd;
      const idx = index * Math.exp(-t / indexDecaySec);
      modPhase += (2 * Math.PI * freq * ratio) / RATE;
      carPhase += (2 * Math.PI * freq) / RATE;
      data[i] += Math.sin(carPhase + idx * Math.sin(modPhase))
        * (gain / voices.length) * Math.exp(-t / ampDecaySec);
    }
  }
}

/** Modal bank: damped inharmonic partials, the body of a struck small object. */
export function addModal(data, rng, {
  modes, gains, decays, detuneCents = 8, gain = 1, startSec = 0,
}) {
  const start = Math.round(startSec * RATE);
  for (let m = 0; m < modes.length; m++) {
    const cents = (rng() * 2 - 1) * detuneCents;
    const f = modes[m] * Math.pow(2, cents / 1200);
    let phase = rng() * 2 * Math.PI;
    for (let i = start; i < data.length; i++) {
      const t = (i - start) / RATE;
      phase += (2 * Math.PI * f) / RATE;
      data[i] += Math.sin(phase) * gains[m] * gain * Math.exp(-t / decays[m]);
    }
  }
}

/** Noise transient shaped by a resonant bandpass — the "click" of an impact. */
export function addTransient(data, rng, {
  lengthSec, centerHz, q, gain, startSec = 0,
}) {
  const len = Math.round(lengthSec * RATE);
  const tmp = new Float64Array(len);
  for (let i = 0; i < len; i++) tmp[i] = (rng() * 2 - 1) * Math.exp(-i / (len / 4));
  biquad(tmp, 'bandpass', centerHz, q);
  const start = Math.round(startSec * RATE);
  for (let i = 0; i < len && start + i < data.length; i++) data[start + i] += tmp[i] * gain;
}

/** Sub layer: clean sine drop for weight. */
export function addSub(data, { from, to, glideSec, decaySec, gain, startSec = 0 }) {
  const start = Math.round(startSec * RATE);
  let phase = 0;
  for (let i = start; i < data.length; i++) {
    const t = (i - start) / RATE;
    const k = Math.min(t / glideSec, 1);
    const freq = from + (to - from) * k;
    phase += (2 * Math.PI * freq) / RATE;
    data[i] += Math.sin(phase) * gain * Math.exp(-t / decaySec);
  }
}

/** Ringing tone with optional pitch wobble (charged coil / shimmer tails). */
export function addRing(data, { freq, decaySec, gain, wobbleHz = 0, wobbleDepth = 0, startSec = 0 }) {
  const start = Math.round(startSec * RATE);
  let phase = 0;
  for (let i = start; i < data.length; i++) {
    const t = (i - start) / RATE;
    const f = wobbleHz > 0 ? freq * (1 + wobbleDepth * Math.sin(2 * Math.PI * wobbleHz * t)) : freq;
    phase += (2 * Math.PI * f) / RATE;
    data[i] += Math.sin(phase) * gain * Math.exp(-t / decaySec);
  }
}

/** Filtered noise bed (air/steam/energy wash). */
export function addNoiseBed(data, rng, {
  decaySec, gain, centerHz, q, startSec = 0,
}) {
  const start = Math.round(startSec * RATE);
  const len = data.length - start;
  const tmp = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / RATE;
    tmp[i] = (rng() * 2 - 1) * Math.exp(-t / decaySec);
  }
  biquad(tmp, 'bandpass', centerHz, q);
  for (let i = 0; i < len; i++) data[start + i] += tmp[i] * gain;
}

// --- Dynamics / tone ---

export function saturate(data, drive) {
  const norm = Math.tanh(drive);
  for (let i = 0; i < data.length; i++) data[i] = Math.tanh(data[i] * drive) / norm;
}

/** Feed-forward compressor: fast attack for punch, program-dependent release. */
export function compress(data, {
  threshold = 0.35, ratio = 4, attackSec = 0.001, releaseSec = 0.06, makeup = 1.4,
}) {
  const atk = Math.exp(-1 / (attackSec * RATE));
  const rel = Math.exp(-1 / (releaseSec * RATE));
  let env = 0;
  for (let i = 0; i < data.length; i++) {
    const level = Math.abs(data[i]);
    env = level > env ? atk * env + (1 - atk) * level : rel * env + (1 - rel) * level;
    let g = 1;
    if (env > threshold) g = (threshold + (env - threshold) / ratio) / env;
    data[i] *= g * makeup;
  }
}

export function normalize(data, peakTarget = 0.92) {
  let peak = 0;
  for (const v of data) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) { const g = peakTarget / peak; for (let i = 0; i < data.length; i++) data[i] *= g; }
}

export function fadeEdges(data, inSeconds = 0.004, outSeconds = inSeconds) {
  const nIn = Math.min(Math.round(inSeconds * RATE), data.length >> 1);
  const nOut = Math.min(Math.round(outSeconds * RATE), data.length >> 1);
  for (let i = 0; i < nIn; i++) data[i] *= i / nIn;
  for (let i = 0; i < nOut; i++) data[data.length - 1 - i] *= i / nOut;
}

// --- WAV output ---

export function toWav(mono) {
  const pcm = new Int16Array(mono.length);
  for (let i = 0; i < mono.length; i++) {
    pcm[i] = Math.max(-32768, Math.min(32767, Math.round(mono[i] * 32767)));
  }
  const dataBytes = pcm.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + dataBytes, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(dataBytes, 40);
  Buffer.from(pcm.buffer).copy(buf, 44);
  return buf;
}
