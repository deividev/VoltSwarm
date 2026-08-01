// Tiles the orbit captures of a model into one labelled turnaround sheet, so a
// 360 review is a single image instead of eight files.
//
// Usage: node tools/make-turnaround-sheet.mjs <prefix> <out.png> [angles]
//   e.g. node tools/make-turnaround-sheet.mjs assets/preview/fb \
//          assets/preview/fb-turnaround.png 0,45,90,135,180,225,270,315
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const PREFIX = process.argv[2] ?? 'assets/preview/fb';
const OUT = process.argv[3] ?? `${PREFIX}-turnaround.png`;
const ANGLES = (process.argv[4] ?? '0,45,90,135,180,225,270,315')
  .split(',')
  .map((s) => Number(s.trim()));

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

const sources = ANGLES.map((a) => {
  const path = `${PREFIX}-${a}.png`;
  if (!existsSync(path)) throw new Error(`Missing capture: ${path}`);
  return { angle: a, data: 'data:image/png;base64,' + readFileSync(path).toString('base64') };
});

await page.setContent(
  `<body style="margin:0">${sources
    .map((s, i) => `<img id="i${i}" src="${s.data}">`)
    .join('')}</body>`,
);
await page.evaluate(
  (n) =>
    Promise.all(
      Array.from({ length: n }, (_, i) => {
        const img = document.getElementById(`i${i}`);
        return img.complete && img.naturalWidth
          ? Promise.resolve()
          : new Promise((r) => (img.onload = () => r()));
      }),
    ),
  sources.length,
);

const dataUrl = await page.evaluate(
  ({ angles, cols }) => {
    const n = angles.length;
    const rows = Math.ceil(n / cols);

    // Common crop: the union of every frame's model bbox, so all eight tiles
    // share one scale and the turnaround shows real relative proportions.
    let X0 = 1e9;
    let Y0 = 1e9;
    let X1 = -1;
    let Y1 = -1;
    const canvases = [];
    for (let i = 0; i < n; i++) {
      const img = document.getElementById(`i${i}`);
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, 0, 0);
      canvases.push(c);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      // The viewer prints an info line across the top-left. Excluding a whole
      // top BAND would clip the model's head, so exclude that line by its own
      // x-extent instead: it never reaches past ~55% of the width, while the
      // model is centred, so only skip left-of-centre pixels in those rows.
      for (let y = 0; y < c.height; y++)
        for (let xx = 0; xx < c.width; xx++) {
          if (y < 28 && xx < c.width * 0.56) continue;
          const p = (y * c.width + xx) * 4;
          const r = d[p];
          const g = d[p + 1];
          const b = d[p + 2];
          // Background is the flat #151a22 scene colour + the grey ground
          // disc; the model is everything appreciably brighter or warmer.
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          if (max < 90 || (max - min < 26 && max < 150)) continue;
          if (xx < X0) X0 = xx;
          if (xx > X1) X1 = xx;
          if (y < Y0) Y0 = y;
          if (y > Y1) Y1 = y;
        }
    }
    const pad = 16;
    X0 = Math.max(0, X0 - pad);
    Y0 = Math.max(0, Y0 - pad);
    X1 += pad;
    Y1 += pad;
    const cw = X1 - X0 + 1;
    const ch = Y1 - Y0 + 1;

    const label = 34;
    const out = document.createElement('canvas');
    out.width = cw * cols;
    out.height = (ch + label) * rows;
    const o = out.getContext('2d');
    o.fillStyle = '#12161d';
    o.fillRect(0, 0, out.width, out.height);
    for (let i = 0; i < n; i++) {
      const cx = (i % cols) * cw;
      const cy = Math.floor(i / cols) * (ch + label);
      o.drawImage(canvases[i], X0, Y0, cw, ch, cx, cy, cw, ch);
      o.fillStyle = '#8fa3b8';
      o.font = '600 20px system-ui, sans-serif';
      o.textAlign = 'center';
      o.fillText(`${angles[i]}°`, cx + cw / 2, cy + ch + 24);
      o.strokeStyle = '#232b36';
      o.lineWidth = 2;
      o.strokeRect(cx + 1, cy + 1, cw - 2, ch + label - 2);
    }
    return out.toDataURL('image/png');
  },
  { angles: ANGLES, cols: 4 },
);

writeFileSync(OUT, Buffer.from(dataUrl.split(',')[1], 'base64'));
console.log(`Saved ${OUT} (${ANGLES.length} angles)`);
await browser.close();
