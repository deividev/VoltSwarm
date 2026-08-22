// Converts the six approved Slagcaster concept renders into flat technical
// sheets for the swarm voxel pipeline. The candidates are opaque RGB renders:
// their apparent transparency is a baked checkerboard and their materials
// contain lighting gradients. Feeding them directly to icon-voxelizer would
// preserve the checkerboard as geometry and split one material into thousands
// of near-colours.
//
// This converter is deterministic:
//   1. flood-fill the connected light neutral checkerboard/shadow from the
//      image border,
//   2. crop to the surviving silhouette,
//   3. fit it without distortion inside a 1024 square,
//   4. classify every occupied pixel into the approved three-colour palette,
//      and emit hard alpha (0 or 255 only).
//
// Usage: node tools/make-slagcaster-sheets.mjs

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const SOURCE_DIR = 'art/concept/swarm-foundry-enemies';
const OUTPUT_DIR = 'public/assets/2d';
const SIZE = 1024;
const PAD = 56;
const GRID_ROWS = { closed: 35, deployed: 37 };

const PALETTE = {
  olive: [0x78, 0x82, 0x39, 255],
  dark: [0x23, 0x28, 0x30, 255],
  amber: [0xff, 0xa8, 0x03, 255],
};

const SOURCES = [
  ['closed', 'front'],
  ['closed', 'side'],
  ['closed', 'back'],
  ['deployed', 'front'],
  ['deployed', 'side'],
  ['deployed', 'back'],
];

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const chromePath = CHROME_PATHS.find((path) => existsSync(path));
if (!chromePath) throw new Error('No Chrome/Edge executable found');

mkdirSync(OUTPUT_DIR, { recursive: true });
const browser = await puppeteer.launch({ executablePath: chromePath, headless: 'new' });
const page = await browser.newPage();

for (const [state, view] of SOURCES) {
  const source = `${SOURCE_DIR}/slagcaster-${state}-${view}-candidate-v1.png`;
  if (!existsSync(source)) throw new Error(`Missing approved candidate: ${source}`);
  const dataUrl = `data:image/png;base64,${readFileSync(source).toString('base64')}`;
  await page.setContent(`<img id="source" src="${dataUrl}">`);
  await page.evaluate(() => new Promise((resolve) => {
    const image = document.getElementById('source');
    if (image.complete && image.naturalWidth) resolve();
    else image.onload = resolve;
  }));

  const result = await page.evaluate(({ size, pad, palette, gridRows }) => {
    const image = document.getElementById('source');
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const input = document.createElement('canvas');
    input.width = width;
    input.height = height;
    const inputContext = input.getContext('2d', { willReadFrequently: true });
    inputContext.drawImage(image, 0, 0);
    const sourceData = inputContext.getImageData(0, 0, width, height).data;

    const neutralLight = (pixel) => {
      const offset = pixel * 4;
      const r = sourceData[offset] / 255;
      const g = sourceData[offset + 1] / 255;
      const b = sourceData[offset + 2] / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max === 0 ? 0 : (max - min) / max;
      // The checker is #f4f4f4/#fff and its baked contact shadow is neutral.
      // Real charcoal stays below this value; olive and amber are saturated.
      return saturation < 0.12 && max > 0.34;
    };

    // Connectivity is essential: a global neutral threshold would erase the
    // model's lit charcoal panels. Only pixels reachable from the border are
    // admitted as checker/background.
    const background = new Uint8Array(width * height);
    const stack = [];
    for (let x = 0; x < width; x++) stack.push(x, x + (height - 1) * width);
    for (let y = 0; y < height; y++) stack.push(y * width, y * width + width - 1);
    while (stack.length > 0) {
      const pixel = stack.pop();
      if (background[pixel] || !neutralLight(pixel)) continue;
      background[pixel] = 1;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      if (x > 0) stack.push(pixel - 1);
      if (x + 1 < width) stack.push(pixel + 1);
      if (y > 0) stack.push(pixel - width);
      if (y + 1 < height) stack.push(pixel + width);
    }

    let x0 = width;
    let y0 = height;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (background[y * width + x]) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    if (x1 < x0 || y1 < y0) throw new Error('No foreground survived background removal');

    const cropWidth = x1 - x0 + 1;
    const cropHeight = y1 - y0 + 1;
    // Collapse the render back onto a coarse authored-looking voxel lattice.
    // Majority voting per cell removes baked AO/noise while retaining panel
    // boundaries that are actually large enough to survive the swarm grid.
    const gridCols = Math.max(1, Math.round((cropWidth / cropHeight) * gridRows));
    const classify = (sourcePixel) => {
      if (background[sourcePixel]) return 'transparent';
      const sourceOffset = sourcePixel * 4;
      const r = sourceData[sourceOffset];
      const g = sourceData[sourceOffset + 1];
      const b = sourceData[sourceOffset + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max === 0 ? 0 : (max - min) / max;
      if (r > g * 1.18 && g > b * 1.45 && saturation > 0.42) return 'amber';
      if (g > r * 1.06 && g > b * 1.35 && saturation > 0.22) return 'olive';
      return 'dark';
    };
    const grid = [];
    for (let gy = 0; gy < gridRows; gy++) {
      const row = [];
      const sy0 = y0 + Math.floor((gy / gridRows) * cropHeight);
      const sy1 = Math.max(sy0 + 1, y0 + Math.floor(((gy + 1) / gridRows) * cropHeight));
      for (let gx = 0; gx < gridCols; gx++) {
        const sx0 = x0 + Math.floor((gx / gridCols) * cropWidth);
        const sx1 = Math.max(sx0 + 1, x0 + Math.floor(((gx + 1) / gridCols) * cropWidth));
        const votes = { transparent: 0, olive: 0, dark: 0, amber: 0 };
        for (let sy = sy0; sy < sy1; sy++) for (let sx = sx0; sx < sx1; sx++) {
          votes[classify(sy * width + sx)]++;
        }
        const total = (sy1 - sy0) * (sx1 - sx0);
        if (votes.transparent > total * 0.52) row.push('transparent');
        else row.push(['olive', 'dark', 'amber'].sort((a, b) => votes[b] - votes[a])[0]);
      }
      grid.push(row);
    }

    const cellSize = Math.floor(Math.min((size - pad * 2) / gridCols, (size - pad * 2) / gridRows));
    const drawWidth = gridCols * cellSize;
    const drawHeight = gridRows * cellSize;
    const offsetX = Math.floor((size - drawWidth) / 2);
    const offsetY = Math.floor((size - drawHeight) / 2);

    const output = document.createElement('canvas');
    output.width = size;
    output.height = size;
    const outputContext = output.getContext('2d');
    const pixels = outputContext.createImageData(size, size);
    const counts = { olive: 0, dark: 0, amber: 0, transparent: 0 };
    for (let oy = 0; oy < size; oy++) for (let ox = 0; ox < size; ox++) {
      const outOffset = (oy * size + ox) * 4;
      if (ox < offsetX || ox >= offsetX + drawWidth || oy < offsetY || oy >= offsetY + drawHeight) {
        counts.transparent++;
        continue;
      }
      const gx = Math.min(gridCols - 1, Math.floor((ox - offsetX) / cellSize));
      const gy = Math.min(gridRows - 1, Math.floor((oy - offsetY) / cellSize));
      const key = grid[gy][gx];
      if (key === 'transparent') {
        counts.transparent++;
        continue;
      }
      pixels.data.set(palette[key], outOffset);
      counts[key]++;
    }
    outputContext.putImageData(pixels, 0, 0);
    return {
      png: output.toDataURL('image/png'),
      sourceSize: [width, height],
      sourceBbox: [x0, y0, x1, y1],
      grid: [gridCols, gridRows],
      outputBbox: [offsetX, offsetY, offsetX + drawWidth - 1, offsetY + drawHeight - 1],
      counts,
    };
  }, { size: SIZE, pad: PAD, palette: PALETTE, gridRows: GRID_ROWS[state] });

  const output = `${OUTPUT_DIR}/ref-slagcaster-${state}-${view}-v1.png`;
  writeFileSync(output, Buffer.from(result.png.split(',')[1], 'base64'));
  const { png: _, ...report } = result;
  console.log(`${output} — ${SIZE}x${SIZE}`, report);
}

await browser.close();
