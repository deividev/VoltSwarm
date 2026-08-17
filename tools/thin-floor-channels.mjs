// Deterministically thins the lit channels of a floor texture.
//
// Why this exists: four generation passes failed to hit a requested channel
// width, alternating between too thick and losing the pale core entirely. Width
// is a number, so it should be computed, not asked for.
//
// Method: classify channel pixels by colour family, erode them with a distance
// transform so the line shrinks symmetrically, fill the vacated pixels with the
// nearest surrounding floor colour, then repaint the survivors as
// dark edge / saturated / PALE CORE by their distance from the new edge. The
// core is written last and unconditionally, so it can never go missing.
//
// Usage: node tmp/thin-channels.mjs <in.png> <out.png> <pixelsToRemovePerSide>
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const [, , INPUT, OUTPUT, TARGET] = process.argv;
const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
];
const browser = await puppeteer.launch({
  executablePath: CHROME_PATHS.find((p) => existsSync(p)), headless: 'new',
});
const page = await browser.newPage();
await page.setContent(`<img id="s" src="data:image/png;base64,${readFileSync(INPUT).toString('base64')}">`);
await page.evaluate(() => new Promise((r) => {
  const i = document.getElementById('s');
  if (i.complete && i.naturalWidth) r(); else i.onload = () => r();
}));

const result = await page.evaluate((target) => {
  const img = document.getElementById('s');
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const im = ctx.getImageData(0, 0, W, H);
  const d = im.data;
  const N = W * H;

  const PAL = {
    blue: { core: [0xcf, 0xe9, 0xff], band: [0x3b, 0x8f, 0xff], edge: [0x1b, 0x4f, 0xb0] },
    warm: { core: [0xff, 0xd9, 0xa0], band: [0xff, 0x8a, 0x2a], edge: [0xa8, 0x41, 0x0c] },
  };
  const kind = new Uint8Array(N); // 0 none, 1 blue, 2 warm
  for (let p = 0; p < N; p++) {
    const r = d[p * 4], g = d[p * 4 + 1], b = d[p * 4 + 2];
    if (b > 120 && b > r + 25 && g >= r - 10) kind[p] = 1;
    else if (r > 130 && r > b + 40 && g < r) kind[p] = 2;
  }

  // Distance (in 4-neighbour steps) from each channel pixel to the nearest
  // non-channel pixel. Two-pass chamfer is enough for lines this thin.
  const INF = 1e6;
  const dist = new Float32Array(N).fill(INF);
  for (let p = 0; p < N; p++) if (!kind[p]) dist[p] = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x;
    if (!dist[p]) continue;
    if (x > 0) dist[p] = Math.min(dist[p], dist[p - 1] + 1);
    if (y > 0) dist[p] = Math.min(dist[p], dist[p - W] + 1);
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const p = y * W + x;
    if (!dist[p]) continue;
    if (x < W - 1) dist[p] = Math.min(dist[p], dist[p + 1] + 1);
    if (y < H - 1) dist[p] = Math.min(dist[p], dist[p + W] + 1);
  }

  // Erode by a FIXED amount, never one derived from the widest feature: the
  // grating and the corner turns are far thicker than a straight run, so a
  // global maximum shaves the lines down to nothing (measured: 4.5px of
  // erosion, leaving 2px lines) while barely touching the blobs.
  // `target` here is the pixels to remove from EACH side.
  const keep = new Uint8Array(N);
  for (let p = 0; p < N; p++) if (kind[p] && dist[p] > target) keep[p] = kind[p];

  // Fill vacated channel pixels with the nearest surviving floor colour,
  // grown outward from the untouched background so the seam is invisible.
  const removed = [];
  for (let p = 0; p < N; p++) if (kind[p] && !keep[p]) removed.push(p);
  const isFloor = (p) => !kind[p];
  for (const p of removed) {
    const x = p % W, y = (p / W) | 0;
    let found = null;
    for (let radius = 1; radius <= 24 && !found; radius++) {
      for (const [dx, dy] of [[0, -radius], [0, radius], [-radius, 0], [radius, 0]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx;
        if (isFloor(q)) { found = q; break; }
      }
    }
    if (found != null) {
      d[p * 4] = d[found * 4];
      d[p * 4 + 1] = d[found * 4 + 1];
      d[p * 4 + 2] = d[found * 4 + 2];
    }
  }

  // Repaint survivors: outermost row dark, next saturated, centre PALE CORE.
  const dist2 = new Float32Array(N).fill(INF);
  for (let p = 0; p < N; p++) if (!keep[p]) dist2[p] = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x;
    if (!dist2[p]) continue;
    if (x > 0) dist2[p] = Math.min(dist2[p], dist2[p - 1] + 1);
    if (y > 0) dist2[p] = Math.min(dist2[p], dist2[p - W] + 1);
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const p = y * W + x;
    if (!dist2[p]) continue;
    if (x < W - 1) dist2[p] = Math.min(dist2[p], dist2[p + 1] + 1);
    if (y < H - 1) dist2[p] = Math.min(dist2[p], dist2[p + W] + 1);
  }
  let corePixels = 0;
  for (let p = 0; p < N; p++) {
    if (!keep[p]) continue;
    const pal = keep[p] === 1 ? PAL.blue : PAL.warm;
    const band = dist2[p] <= 1 ? pal.edge : dist2[p] <= 2 ? pal.band : pal.core;
    if (band === pal.core) corePixels++;
    d[p * 4] = band[0]; d[p * 4 + 1] = band[1]; d[p * 4 + 2] = band[2];
  }
  ctx.putImageData(im, 0, 0);
  return { dataUrl: c.toDataURL('image/png'), erodedBy: target, corePixels };
}, Number(TARGET));

writeFileSync(OUTPUT, Buffer.from(result.dataUrl.split(',')[1], 'base64'));
console.log('Saved', OUTPUT, JSON.stringify({
  erodedPerSide: result.erodedBy, corePixels: result.corePixels,
}));
await browser.close();
