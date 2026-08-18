// Measures the on-screen pixel bounding box of a colour family inside a region
// of a game screenshot. Used to answer "how does this read in the frame?" from
// a real capture rather than from world-space numbers, because the follow
// camera foreshortens height and world proportions are not what the eye judges.
//
// Usage:
//   node tools/measure-screenshot-region.mjs <shot.png> <x0>,<y0>,<x1>,<y1> cyan|bright
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const [FILE, REGION, FAMILY] = process.argv.slice(2);
const [x0, y0, x1, y1] = String(REGION ?? '').split(',').map(Number);
if (!FILE || !existsSync(FILE) || ![x0, y0, x1, y1].every(Number.isFinite)) {
  console.error('usage: node tools/measure-screenshot-region.mjs <shot.png> <x0>,<y0>,<x1>,<y1> <family>');
  process.exit(1);
}

const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
].find((p) => existsSync(p));

const browser = await puppeteer.launch({ executablePath: chromePath, headless: 'new' });
const page = await browser.newPage();
await page.goto(pathToFileURL(FILE).href);
const out = await page.evaluate(
  async (box, family) => {
    const img = document.querySelector('img');
    await img.decode();
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, w, h).data;
    // Hue/relationship tests, not hex equality: the render applies lighting and
    // toon quantisation, so the sheet's exact values never survive to the frame.
    if (family === 'mean') {
      let R = 0, G = 0, B = 0, n = 0;
      for (let y = Math.max(0, box[1]); y <= Math.min(h - 1, box[3]); y++) {
        for (let x = Math.max(0, box[0]); x <= Math.min(w - 1, box[2]); x++) {
          const i = (y * w + x) * 4;
          R += d[i]; G += d[i + 1]; B += d[i + 2]; n++;
        }
      }
      return { mean: { R: R / n, G: G / n, B: B / n }, count: n };
    }
    const match = (r, g, b) =>
      family === 'cyan'
        ? b > 110 && g > 90 && r < g * 0.6 && b > r * 1.8
        : r > 120 && g > 130 && b > 140 && Math.abs(r - b) < 60;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let count = 0;
    for (let y = Math.max(0, box[1]); y <= Math.min(h - 1, box[3]); y++) {
      for (let x = Math.max(0, box[0]); x <= Math.min(w - 1, box[2]); x++) {
        const i = (y * w + x) * 4;
        if (!match(d[i], d[i + 1], d[i + 2])) continue;
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    return count ? { minX, maxX, minY, maxY, count } : { count: 0 };
  },
  [x0, y0, x1, y1],
  FAMILY ?? 'cyan',
);
await browser.close();

if (out.mean) {
  const { R, G, B } = out.mean;
  const luma = 0.299 * R + 0.587 * G + 0.114 * B;
  console.log(
    `${FILE} region ${x0},${y0}-${x1},${y1} (mean)
` +
      `  rgb(${R.toFixed(1)}, ${G.toFixed(1)}, ${B.toFixed(1)})   luma ${luma.toFixed(1)}` +
      `   R-B ${(R - B).toFixed(1)}`,
  );
} else if (!out.count) {
  console.log(`${FILE}: no ${FAMILY} pixels in region`);
} else {
  console.log(
    `${FILE} region ${x0},${y0}-${x1},${y1} (${FAMILY})\n` +
      `  bbox ${out.minX},${out.minY} -> ${out.maxX},${out.maxY}` +
      `   ${out.maxX - out.minX + 1} x ${out.maxY - out.minY + 1} px   (${out.count} px matched)`,
  );
}
