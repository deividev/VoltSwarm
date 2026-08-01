// Records SEVERAL rig clips side by side into one looping GIF, so they can be
// compared against each other instead of in separate files.
//
// The shared period matters: every clip is stepped over the SAME total time, so
// the reel only loops cleanly if each clip's own frequency divides that total.
// walk runs at 0.62 Hz and idle at 0.31 Hz precisely so 3.226s is 2 strides and
// 1 breath; `hit` is a one-shot that plays once and then holds at rest.
//
// Usage: node tools/capture-anim-reel.mjs <model> [out.gif] [frames] [total] [clips] [angle]
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import puppeteer from 'puppeteer-core';
import { decodePNG, buildPalette, indexFrame, buildGif } from './gif-encoder.mjs';

const MODEL = process.argv[2] ?? 'final-boss';
const OUT = process.argv[3] ?? `assets/preview/anim-reel-${MODEL}.gif`;
const FRAMES = Number(process.argv[4] ?? 40);
const TOTAL = Number(process.argv[5] ?? 3.226);
const CLIPS = (process.argv[6] ?? 'idle,walk,hit').split(',');
const ANGLE = Number(process.argv[7] ?? 0);
const PORT = 5173;

// Crop applied to each preview canvas before tiling — the viewer frames the
// model centred with wide empty margins that would dominate the reel.
const CROP = { x: 0.29, y: 0.02, w: 0.42, h: 0.86 };

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
      const r = await fetch(`http://localhost:${PORT}/model-preview.html`);
      if (r.ok) return;
    } catch {
      /* not up */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Vite dev server did not start');
}

/** Copies a sub-rectangle out of an RGBA buffer into a destination buffer. */
function blit(src, sw, dst, dw, sx, sy, w, h, dx) {
  for (let y = 0; y < h; y++) {
    const s = ((sy + y) * sw + sx) * 4;
    const d = ((y + 0) * dw + dx) * 4;
    dst.set(src.subarray(s, s + w * 4), d);
  }
}

try {
  await waitForServer();
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 460, height: 560 });

  // One clip at a time: the preview builds a single rig per page load.
  const perClip = [];
  for (const clip of CLIPS) {
    await page.goto(
      `http://localhost:${PORT}/model-preview.html?model=${MODEL}&anim=${clip}&angle=${ANGLE}`,
    );
    await page.waitForFunction('window.__previewReady === true', { timeout: 20000 });
    const canvas = await page.$('#preview-canvas');
    if (!canvas) throw new Error('preview canvas not found');
    const shots = [];
    for (let i = 0; i < FRAMES; i++) {
      const t = (i / FRAMES) * TOTAL;
      const ok = await page.evaluate((tt) => window.__setAnimTime?.(tt) ?? false, t);
      if (!ok) throw new Error(`__setAnimTime unavailable for clip '${clip}'`);
      shots.push(decodePNG(await canvas.screenshot({ type: 'png' })));
    }
    perClip.push(shots);
    console.log(`  captured ${clip}: ${shots.length} frames`);
  }
  await browser.close();

  const { w: fw, h: fh } = perClip[0][0];
  const cx = Math.round(fw * CROP.x);
  const cy = Math.round(fh * CROP.y);
  const cw = Math.round(fw * CROP.w);
  const ch = Math.round(fh * CROP.h);
  const outW = cw * CLIPS.length;

  const composited = [];
  for (let i = 0; i < FRAMES; i++) {
    const buf = Buffer.alloc(outW * ch * 4);
    for (let c = 0; c < CLIPS.length; c++) {
      blit(perClip[c][i].data, fw, buf, outW, cx, cy, cw, ch, c * cw);
    }
    composited.push(buf);
  }

  const pal = buildPalette(composited, outW, ch);
  const cache = new Map();
  const idx = composited.map((f) => indexFrame(f, outW, ch, pal, cache));
  const delayCs = Math.max(2, Math.round((TOTAL / FRAMES) * 100));
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, buildGif(outW, ch, pal, idx, delayCs));
  console.log(
    `Saved ${OUT} — ${CLIPS.join(' | ')} — ${FRAMES} frames, ${outW}x${ch}, ` +
      `${delayCs}cs/frame, loop ${TOTAL}s`,
  );
} catch (err) {
  console.error('Capture failed:', err.message);
  process.exitCode = 1;
} finally {
  vite.kill();
  process.exit(process.exitCode ?? 0);
}
