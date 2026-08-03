// Derives a DEPTH-ONLY side sheet for the field engineer by cutting the
// backpack off the artist's side view.
//
// WHY: icon-voxelizer's `sideProfileRef` yields ONE half-depth per row and
// applies it SYMMETRICALLY about the body axis. The artist's side sheet
// includes the rear-mounted pack, so the pack's bulk inflates the FRONT of the
// torso too — the character came out a barrel, and the arms, which share those
// rows, inherited ~12 voxels of depth against ~7 of width and read as fat
// cylinders.
//
// Cutting the pack out of the DEPTH input fixes both at once. Nothing is lost
// visually: the pack still reaches the model through `backPaintRef`, which
// paints the back shell, and the artist's original side sheet is untouched on
// disk for reference and for any future sidePaint use.
//
// The character faces LEFT in this sheet, so the pack is the mass on the
// RIGHT. The cut lands on the dark separator column measured between body and
// pack (~0.63 of the content width).
//
// Usage: node tools/make-field-engineer-depth-sheet.mjs [cutFraction]

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const SRC = 'public/assets/2d/ref-field-engineer-side-v1.png';
const OUT = 'public/assets/2d/ref-field-engineer-side-depth-v1.png';
const CUT = Number(process.argv[2] ?? 0.63);

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const browser = await puppeteer.launch({
  executablePath: CHROME_PATHS.find((p) => existsSync(p)),
  headless: 'new',
});
const page = await browser.newPage();
const url = 'data:image/png;base64,' + readFileSync(SRC).toString('base64');
await page.setContent(`<img id="s" src="${url}">`);
await page.evaluate(
  () =>
    new Promise((r) => {
      const i = document.getElementById('s');
      if (i.complete && i.naturalWidth) r();
      else i.onload = () => r();
    }),
);

const out = await page.evaluate((cut) => {
  const img = document.getElementById('s');
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  const id = x.getImageData(0, 0, w, h);
  const d = id.data;

  // Content bbox, so the cut is relative to the character and not the canvas.
  let x0 = w;
  let x1 = -1;
  let y0 = h;
  let y1 = -1;
  for (let p = 0; p < w * h; p++) {
    if (d[p * 4 + 3] < 128) continue;
    const px = p % w;
    const py = (p / w) | 0;
    if (px < x0) x0 = px;
    if (px > x1) x1 = px;
    if (py < y0) y0 = py;
    if (py > y1) y1 = py;
  }
  const cutX = Math.round(x0 + (x1 - x0 + 1) * cut);

  let removed = 0;
  for (let py = 0; py < h; py++)
    for (let px = cutX; px < w; px++) {
      const i = (py * w + px) * 4;
      if (d[i + 3] >= 128) removed++;
      d[i + 3] = 0;
    }
  x.putImageData(id, 0, 0);

  // Re-measure so the caller can see the new depth proportion.
  let nx0 = w;
  let nx1 = -1;
  for (let p = 0; p < w * h; p++) {
    if (d[p * 4 + 3] < 128) continue;
    const px = p % w;
    if (px < nx0) nx0 = px;
    if (px > nx1) nx1 = px;
  }
  return {
    url: c.toDataURL('image/png'),
    before: [x1 - x0 + 1, y1 - y0 + 1],
    after: [nx1 - nx0 + 1, y1 - y0 + 1],
    cutX,
    removed,
  };
}, CUT);

writeFileSync(OUT, Buffer.from(out.url.split(',')[1], 'base64'));
console.log(
  `${OUT}\n  depth width ${out.before[0]} -> ${out.after[0]} px ` +
    `(cut at ${(CUT * 100).toFixed(0)}%, ${out.removed} px of pack removed), height ${out.before[1]}`,
);
await browser.close();
