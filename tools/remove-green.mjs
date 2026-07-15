// Clean chroma-key for GREEN-screen renders: keys by "greenness" (how much the
// green channel dominates red/blue) AND de-spills the edge (clamps green down
// to max(r,b) wherever green dominates), so anti-aliased borders don't keep a
// green fringe — the failure mode of a plain color-distance key.
// Content survives because yellow/cyan/black/orange never have green as the
// sole dominant channel (cyan's blue matches its green; yellow's red exceeds).
// Usage: node tools/remove-green.mjs <input.png> <output.png> [--lo=30] [--hi=95]
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const [, , input, output, ...rest] = process.argv;
if (!input || !output) {
  console.error('Usage: node tools/remove-green.mjs <input.png> <output.png> [--lo=30] [--hi=95]');
  process.exit(1);
}
const loArg = rest.find((a) => a.startsWith('--lo='));
const hiArg = rest.find((a) => a.startsWith('--hi='));
const lo = loArg ? Number(loArg.split('=')[1]) : 30;
const hi = hiArg ? Number(hiArg.split('=')[1]) : 95;

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const chromePath = CHROME_PATHS.find((p) => existsSync(p));
if (!chromePath) {
  console.error('No Chrome/Edge executable found');
  process.exit(1);
}

const browser = await puppeteer.launch({ executablePath: chromePath, headless: 'new' });
const page = await browser.newPage();
await page.goto(pathToFileURL(input).href);
const dataUrl = await page.evaluate(
  async (lo, hi) => {
    const img = document.querySelector('img');
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const maxRB = Math.max(r, b);
      const greenness = g - maxRB; // >0 only where green dominates
      if (greenness >= hi) {
        data[i + 3] = 0; // solid backdrop → fully transparent
      } else if (greenness > lo) {
        // Edge band: fade alpha out toward the key AND kill the green spill so
        // the surviving semi-transparent pixels aren't green-tinted.
        data[i + 3] = Math.round(data[i + 3] * (1 - (greenness - lo) / (hi - lo)));
        data[i + 1] = maxRB;
      } else if (greenness > 0) {
        // Interior de-spill safety: neutralise any faint green cast.
        data[i + 1] = maxRB;
      }
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  },
  lo,
  hi,
);
await browser.close();

const fs = await import('node:fs');
fs.writeFileSync(output, Buffer.from(dataUrl.split(',')[1], 'base64'));
console.log(`Saved ${output}`);
