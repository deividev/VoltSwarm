// Clears stray narrow tails from the top or bottom of a generated conversion
// sheet.
//
// WHY: image generation likes to run a thin feature past the body — the foundry
// stack's conduit continued below the plinth all the way to the canvas edge, a
// 13px stub under a 301px base. It matters for two reasons beyond looking wrong:
// the voxelizer derives grid HEIGHT from the content bounding box, so a stray
// tail stretches the whole model's proportions, and the tail itself survives as
// a thin peg under the prop.
//
// Rows are cleared from the given edge inward while their filled width stays
// under `--min-width` percent of the sheet's widest row; the first row that
// clears the bar stops the pass, so real geometry is never eaten.
//
// Usage:
//   node tools/trim-sheet-tail.mjs <in.png> <out.png> --edge bottom|top --min-width 40
import { existsSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const args = process.argv.slice(2);
const [IN, OUT] = args;
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
};
const edge = flag('edge') ?? 'bottom';
const minWidthPct = Number(flag('min-width') ?? 40);

if (!IN || !OUT || !existsSync(IN)) {
  console.error('usage: node tools/trim-sheet-tail.mjs <in.png> <out.png> [--edge bottom|top] [--min-width 40]');
  process.exit(1);
}

const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
].find((p) => existsSync(p));

const browser = await puppeteer.launch({ executablePath: chromePath, headless: 'new' });
const page = await browser.newPage();
await page.goto(pathToFileURL(IN).href);
const result = await page.evaluate(
  async (edge, minWidthPct) => {
    const img = document.querySelector('img');
    await img.decode();
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const image = ctx.getImageData(0, 0, w, h);
    const d = image.data;
    const on = (x, y) => d[(y * w + x) * 4 + 3] >= 128;

    const rowWidth = (y) => {
      let l = -1;
      let r = -1;
      for (let x = 0; x < w; x++) {
        if (!on(x, y)) continue;
        if (l === -1) l = x;
        r = x;
      }
      return l === -1 ? 0 : r - l + 1;
    };
    const widths = [];
    for (let y = 0; y < h; y++) widths.push(rowWidth(y));
    const widest = Math.max(...widths);
    const bar = (widest * minWidthPct) / 100;

    const order = edge === 'top' ? [...widths.keys()] : [...widths.keys()].reverse();
    let cleared = 0;
    for (const y of order) {
      if (widths[y] === 0) continue;
      if (widths[y] >= bar) break;
      for (let x = 0; x < w; x++) d[(y * w + x) * 4 + 3] = 0;
      cleared++;
    }
    ctx.putImageData(image, 0, 0);
    return { dataUrl: c.toDataURL('image/png'), cleared, widest, bar };
  },
  edge,
  minWidthPct,
);
await browser.close();

writeFileSync(OUT, Buffer.from(result.dataUrl.split(',')[1], 'base64'));
console.log(
  `${OUT}\n  cleared ${result.cleared} ${edge} rows narrower than ` +
    `${Math.round(result.bar)}px (${minWidthPct}% of the widest row, ${result.widest}px)`,
);
