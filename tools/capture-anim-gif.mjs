// Records a MODEL RIG animation to an animated GIF for review.
//
// Unlike tools/capture-gif.mjs (which films a live run and therefore races the
// game clock), this steps the clip deterministically: model-preview exposes
// window.__setAnimTime(t), so frame N is always the same pose. That makes the
// GIF reproducible and lets the loop close seamlessly on the exact period.
//
// Usage: node tools/capture-anim-gif.mjs <model> <clip> [out.gif] [frames] [period] [angle]
//   clip   : idle | walk | hit
//   period : seconds the clip spans; for looping clips use the exact loop
//            length or the GIF will visibly stutter at the wrap.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import puppeteer from 'puppeteer-core';
import { decodePNG, buildPalette, indexFrame, buildGif } from './gif-encoder.mjs';

const MODEL = process.argv[2] ?? 'final-boss';
const CLIP = process.argv[3] ?? 'idle';
const OUT = process.argv[4] ?? `assets/preview/anim-${MODEL}-${CLIP}.gif`;
const FRAMES = Number(process.argv[5] ?? 36);
const PERIOD = Number(process.argv[6] ?? 0);
const ANGLE = Number(process.argv[7] ?? 0);
const W = 460;
const H = 520;
const PORT = 5179;

// Loop lengths must match poseRig's own frequencies or the wrap jumps:
// idle breathes at 0.45 Hz, walk strides at 0.75 Hz. `hit` is a one-shot.
const DEFAULT_PERIOD = { idle: 1 / 0.45, walk: 1 / 0.75, hit: 0.75 };
const period = PERIOD > 0 ? PERIOD : (DEFAULT_PERIOD[CLIP] ?? 2);

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find(existsSync);
if (!CHROME) {
  console.error('No Chrome/Edge executable found');
  process.exit(1);
}

const vite = spawn('npx.cmd', ['vite', '--port', String(PORT), '--strictPort'], {
  stdio: 'pipe',
  shell: true,
});

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/model-preview.html`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Vite dev server did not start');
}

try {
  await waitForServer();
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: [`--window-size=${W + 40},${H + 40}`],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(
    `http://localhost:${PORT}/model-preview.html?model=${MODEL}&anim=${CLIP}&angle=${ANGLE}`,
  );
  await page.waitForFunction('window.__previewReady === true', { timeout: 20000 });

  const canvas = await page.$('#preview-canvas');
  if (!canvas) throw new Error('preview canvas not found');

  const frames = [];
  for (let i = 0; i < FRAMES; i++) {
    // A looping clip must NOT repeat frame 0 at the end, hence i/FRAMES.
    const t = CLIP === 'hit' ? (i / (FRAMES - 1)) * period : (i / FRAMES) * period;
    const ok = await page.evaluate((tt) => window.__setAnimTime?.(tt) ?? false, t);
    if (!ok) throw new Error(`__setAnimTime unavailable — is '${CLIP}' a real clip?`);
    const png = await canvas.screenshot({ type: 'png' });
    frames.push(decodePNG(png));
  }
  await browser.close();
  if (errors.length) console.error('Page errors:', errors);

  // decodePNG returns { w, h, data } — not { width, height }.
  const { w: width, h: height } = frames[0];
  const rgba = frames.map((f) => f.data);
  const pal = buildPalette(rgba, width, height);
  const cache = new Map();
  const idx = rgba.map((f) => indexFrame(f, width, height, pal, cache));
  const delayCs = Math.max(2, Math.round((period / FRAMES) * 100));
  const gif = buildGif(width, height, pal, idx, delayCs);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, gif);
  console.log(
    `Saved ${OUT} — ${FRAMES} frames, ${width}x${height}, ` +
      `${delayCs}cs/frame (~${(1000 / (delayCs * 10)).toFixed(1)} fps), period ${period.toFixed(2)}s`,
  );
} catch (err) {
  console.error('Capture failed:', err.message);
  process.exitCode = 1;
} finally {
  vite.kill();
  process.exit(process.exitCode ?? 0);
}
