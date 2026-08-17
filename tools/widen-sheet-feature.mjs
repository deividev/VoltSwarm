// Widens one palette colour inside a flat conversion sheet to a guaranteed
// pixel width, so a thin feature survives voxel downsampling.
//
// WHY THIS EXISTS (same lesson as tools/thin-floor-channels.mjs): a requested
// feature width is not something image generation hits reliably. The foundry
// tower's cyan conduit came back 8px wide on a 768px sheet — 0.25 of a voxel
// column at targetWidth 24, so it lost the downsample's majority vote in every
// column and disappeared from the model entirely. Regenerating gambles the
// sheet's already-validated aspect, tiling, palette and symmetry on fixing one
// number. Widening in code changes only that number.
//
// Each horizontal run of the target colour is expanded symmetrically about its
// own centre, so a centred channel stays centred and the sheet stays
// left-right symmetric (which the voxelizer enforces anyway).
//
// Usage:
//   node tools/widen-sheet-feature.mjs <in.png> <out.png> --color 01e6fe --width 70
import { existsSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const args = process.argv.slice(2);
const [IN, OUT] = args;
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
};
const color = (flag('color') ?? '').replace('#', '').toLowerCase();
const targetWidth = Number(flag('width'));

if (!IN || !OUT || !existsSync(IN) || !color || !Number.isFinite(targetWidth)) {
  console.error(
    'usage: node tools/widen-sheet-feature.mjs <in.png> <out.png> --color <hex> --width <px>',
  );
  process.exit(1);
}

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
];
const chromePath = CHROME_PATHS.find((p) => existsSync(p));
if (!chromePath) {
  console.error('Chrome not found; this tool edits pixels through a headless canvas.');
  process.exit(1);
}

const browser = await puppeteer.launch({ executablePath: chromePath, headless: 'new' });
const page = await browser.newPage();
await page.goto(pathToFileURL(IN).href);

const result = await page.evaluate(
  async (colorHex, targetWidth) => {
    const img = document.querySelector('img');
    await img.decode();
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const image = ctx.getImageData(0, 0, w, h);
    const data = image.data;

    const r0 = parseInt(colorHex.slice(0, 2), 16);
    const g0 = parseInt(colorHex.slice(2, 4), 16);
    const b0 = parseInt(colorHex.slice(4, 6), 16);
    const at = (x, y) => (y * w + x) * 4;
    const isTarget = (x, y) => {
      const i = at(x, y);
      return data[i] === r0 && data[i + 1] === g0 && data[i + 2] === b0 && data[i + 3] >= 128;
    };
    const isOpaque = (x, y) => data[at(x, y) + 3] >= 128;

    let widestBefore = 0;
    let widestAfter = 0;
    let painted = 0;

    for (let y = 0; y < h; y++) {
      // Collect runs first, then paint — painting while scanning would let a
      // widened run be re-detected and grow again on the same row.
      const runs = [];
      let start = -1;
      for (let x = 0; x <= w; x++) {
        const on = x < w && isTarget(x, y);
        if (on && start === -1) start = x;
        else if (!on && start !== -1) {
          runs.push([start, x - 1]);
          start = -1;
        }
      }
      for (const [from, to] of runs) {
        const len = to - from + 1;
        if (len > widestBefore) widestBefore = len;
        if (len >= targetWidth) {
          if (len > widestAfter) widestAfter = len;
          continue;
        }
        const centre = (from + to) / 2;
        let lo = Math.round(centre - (targetWidth - 1) / 2);
        let hi = lo + targetWidth - 1;
        // Never paint outside the subject: clamp into the opaque body so the
        // silhouette cannot change. A silhouette change would break the
        // stacking contract this sheet was validated against.
        while (lo < 0 || !isOpaque(lo, y)) lo++;
        while (hi >= w || !isOpaque(hi, y)) hi--;
        let actual = 0;
        for (let x = lo; x <= hi; x++) {
          if (!isOpaque(x, y)) continue;
          const i = at(x, y);
          if (!(data[i] === r0 && data[i + 1] === g0 && data[i + 2] === b0)) painted++;
          data[i] = r0;
          data[i + 1] = g0;
          data[i + 2] = b0;
          data[i + 3] = 255;
          actual++;
        }
        if (actual > widestAfter) widestAfter = actual;
      }
    }

    ctx.putImageData(image, 0, 0);
    return { dataUrl: canvas.toDataURL('image/png'), widestBefore, widestAfter, painted, w };
  },
  color,
  targetWidth,
);

await browser.close();

writeFileSync(OUT, Buffer.from(result.dataUrl.split(',')[1], 'base64'));
console.log(
  `${OUT}\n  #${color}: widest run ${result.widestBefore}px -> ${result.widestAfter}px` +
    `   (${result.painted} pixels repainted)`,
);
