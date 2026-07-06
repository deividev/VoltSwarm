// Removes a flat solid background from a PNG via color-key (chroma key),
// auto-detected from the corner pixel unless --color is given.
// Usage: node tools/remove-background.mjs <input.png> <output.png> [--tolerance=30] [--color=0x151a22]
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const [, , input, output, ...rest] = process.argv;
if (!input || !output) {
  console.error('Usage: node tools/remove-background.mjs <input.png> <output.png> [--tolerance=30] [--color=0xRRGGBB]');
  process.exit(1);
}
const toleranceArg = rest.find((a) => a.startsWith('--tolerance='));
const colorArg = rest.find((a) => a.startsWith('--color='));
const tolerance = toleranceArg ? Number(toleranceArg.split('=')[1]) : 30;
const forcedColor = colorArg ? Number(colorArg.split('=')[1]) : null;

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
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
  async (tol, forced) => {
    const img = document.querySelector('img');
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    let br, bg, bb;
    if (forced !== null) {
      br = (forced >> 16) & 0xff;
      bg = (forced >> 8) & 0xff;
      bb = forced & 0xff;
    } else {
      // Sample the four corners; use the most common corner color.
      const w = canvas.width;
      const h = canvas.height;
      const corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + w - 1) * 4];
      br = data[corners[0]];
      bg = data[corners[0] + 1];
      bb = data[corners[0] + 2];
    }

    for (let i = 0; i < data.length; i += 4) {
      const dr = data[i] - br;
      const dg = data[i + 1] - bg;
      const db = data[i + 2] - bb;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist < tol) data[i + 3] = 0;
      else if (dist < tol * 2) {
        // Soft edge: partial alpha to avoid a hard chroma-key ring.
        data[i + 3] = Math.round((data[i + 3] * (dist - tol)) / tol);
      }
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  },
  tolerance,
  forcedColor,
);
await browser.close();

const fs = await import('node:fs');
fs.writeFileSync(output, Buffer.from(dataUrl.split(',')[1], 'base64'));
console.log(`Saved ${output}`);
