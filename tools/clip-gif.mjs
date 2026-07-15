// Cuts a high-quality GIF from a segment of a recorded run using ffmpeg's
// 2-pass palette pipeline (per-clip adaptive palette + dithering) — far cleaner
// than a single-pass GIF. Give it the seconds from your video.
// Usage: node tools/clip-gif.mjs <input.mp4> <startSec> <endSec> <out.gif> [width=640] [fps=15]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';

const [input, startS, endS, out, width = '640', fps = '15'] = process.argv.slice(2);
if (!input || startS === undefined || endS === undefined || !out) {
  console.error('Usage: node tools/clip-gif.mjs <input.mp4> <startSec> <endSec> <out.gif> [width=640] [fps=15]');
  process.exit(1);
}
if (!existsSync(input)) { console.error(`No existe: ${input}`); process.exit(1); }
const start = Number(startS), end = Number(endS);
const dur = +(end - start).toFixed(3);
if (!(dur > 0)) { console.error('endSec debe ser mayor que startSec'); process.exit(1); }

mkdirSync(out.replace(/[/\\][^/\\]+$/, ''), { recursive: true });
const palette = `${out}.palette.png`;
const vf = `fps=${fps},scale=${width}:-1:flags=lanczos`;

const run = (args, label) => {
  const r = spawnSync('ffmpeg', args, { stdio: ['ignore', 'ignore', 'inherit'] });
  if (r.status !== 0) { console.error(`ffmpeg falló en ${label}`); process.exit(1); }
};

console.log(`Clip ${start}s → ${end}s (${dur}s) @ ${width}px ${fps}fps`);
// Pass 1: generate an adaptive palette for this exact clip.
run(['-y', '-ss', String(start), '-t', String(dur), '-i', input, '-vf', `${vf},palettegen=stats_mode=diff`, palette], 'palettegen');
// Pass 2: render the GIF using that palette + dithering.
run(['-y', '-ss', String(start), '-t', String(dur), '-i', input, '-i', palette,
  '-lavfi', `${vf}[x];[x][1:v]paletteuse=dither=sierra2_4a`, out], 'paletteuse');
rmSync(palette, { force: true });

const { statSync } = await import('node:fs');
console.log(`Saved ${out}  (${Math.round(statSync(out).size / 1024)} KB)`);
