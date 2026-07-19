// ElevenLabs SFX batch v2 — full event set in the Neon Horizon music ambience.
// Style language mirrors the chosen music bed's prompt: modern, sleek, electric,
// clean, punchy. Anti-retro guard in every prompt (user rule: nothing 8-bit/old).
// chest-spin is NOT generated here: its reel ticks are bezier-timed DSP surgery
// (prototype-r9-modern.mjs) that text-to-SFX cannot reproduce.
// Requires ELEVENLABS_API_KEY (project .env) and ffmpeg. 44.1kHz mono WAV out,
// trailing silence trimmed; timing-critical events hard-trimmed to their
// animation windows (zero-latency rule).
// Usage: node tools/audio/elevenlabs-sfx-v2.mjs [eventName]

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const API_KEY = process.env.ELEVENLABS_API_KEY ?? process.env.ELEVEN_API_KEY;
const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tmp', 'audio-prototypes');
const CANDIDATES_PER_PROMPT = 2;

const STYLE = 'modern sleek electronic video game sound, clean contemporary production, '
  + 'punchy and tactile, dry with no reverb tail, one-shot, not retro, not 8-bit';

// maxSeconds: hard trim to the animation window where timing is contractual.
const PROMPTS = {
  'ai2-bolt': {
    durationSeconds: 0.5,
    text: `Compact futuristic energy blaster shot: a sleek electric zap with a tight punchy low thump, ${STYLE}`,
  },
  'ai2-enemy-death': {
    durationSeconds: 0.5,
    text: `Small robot popping offline: a round soft synthetic pop with a tiny electric fizzle, light and quick, ${STYLE}`,
  },
  'ai2-ui-confirm': {
    durationSeconds: 0.5,
    maxSeconds: 0.25,
    text: `Crisp modern interface confirm click: an instant tactile tap with a subtle warm synth blip, ${STYLE}`,
  },
  'ai2-levelup-intro': {
    durationSeconds: 0.8,
    maxSeconds: 0.75,
    text: `Triumphant modern synth power-up flourish: a fast rising melodic sweep bursting into a bright short shine, ${STYLE}`,
  },
  'ai2-levelup-open': {
    durationSeconds: 0.8,
    maxSeconds: 0.6,
    text: `Smooth modern synth bloom: quick rising energy sweeps opening into a warm bright shimmer, welcoming and rewarding, ${STYLE}`,
  },
  'ai2-chest-open': {
    durationSeconds: 0.5,
    maxSeconds: 0.3,
    text: `Precise mechanical latch of a futuristic metal crate popping open, solid satisfying clunk with a hint of electric charge, ${STYLE}`,
  },
  'ai2-chest-reveal': {
    durationSeconds: 1.2,
    maxSeconds: 1.05,
    text: `Rewarding modern synth flourish: a clean impact then a rising melodic arpeggio ending on a bright sustained note, ${STYLE}`,
  },
};

if (!API_KEY) {
  console.error('ELEVENLABS_API_KEY is not set. Aborting without generating.');
  process.exit(1);
}

const filter = process.argv[2];
mkdirSync(OUT_DIR, { recursive: true });

for (const [name, prompt] of Object.entries(PROMPTS)) {
  if (filter && name !== filter) continue;
  for (let i = 1; i <= CANDIDATES_PER_PROMPT; i++) {
    const response = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST',
      headers: { 'xi-api-key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: prompt.text,
        duration_seconds: prompt.durationSeconds,
        prompt_influence: 0.4,
      }),
    });
    if (!response.ok) {
      console.error(`${name} #${i}: HTTP ${response.status} ${await response.text()}`);
      continue;
    }
    const mp3Path = resolve(OUT_DIR, `${name}-${i}.mp3`);
    const wavPath = resolve(OUT_DIR, `${name}-${i}.wav`);
    writeFileSync(mp3Path, Buffer.from(await response.arrayBuffer()));
    const filters = ['areverse,silenceremove=start_periods=1:start_threshold=-45dB,afade=t=in:d=0.006,areverse'];
    if (prompt.maxSeconds) filters.push(`atrim=0:${prompt.maxSeconds},afade=t=out:st=${prompt.maxSeconds - 0.02}:d=0.02`);
    const ff = spawnSync('ffmpeg', [
      '-y', '-i', mp3Path, '-ar', '44100', '-ac', '1', '-sample_fmt', 's16',
      '-af', filters.join(','), wavPath,
    ], { stdio: 'pipe' });
    if (ff.status === 0) {
      rmSync(mp3Path);
      console.log(`wrote ${name}-${i}.wav`);
    } else {
      console.error(`${name} #${i}: ffmpeg failed, kept ${mp3Path}`);
    }
  }
}
