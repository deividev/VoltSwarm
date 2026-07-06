// Builds build/icon.ico (multi-size) and build/icon.png from a source PNG.
// Usage: node tools/make-app-icon.mjs [source.png]
// Resizes via headless Chrome canvas (no image deps) and packs a PNG-compressed
// ICO by hand (Windows supports PNG entries for all sizes).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const SOURCE = process.argv[2] ?? 'public/assets/2d/app-icon-test.png';
const SIZES = [16, 32, 48, 64, 128, 256];

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
if (!existsSync(SOURCE)) {
  console.error(`Source not found: ${SOURCE}`);
  process.exit(1);
}

const browser = await puppeteer.launch({ executablePath: chromePath, headless: 'new' });
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(SOURCE).href);
  const pngs = new Map();
  for (const size of SIZES) {
    const dataUrl = await page.evaluate(async (s) => {
      const img = document.querySelector('img');
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = s;
      canvas.height = s;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, s, s);
      return canvas.toDataURL('image/png');
    }, size);
    pngs.set(size, Buffer.from(dataUrl.split(',')[1], 'base64'));
  }

  // ICO container: ICONDIR (6 bytes) + ICONDIRENTRY (16 bytes each) + PNG blobs.
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(SIZES.length, 4);
  const entries = [];
  const blobs = [];
  let offset = 6 + SIZES.length * 16;
  for (const size of SIZES) {
    const png = pngs.get(size);
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0); // width (0 = 256)
    entry.writeUInt8(size === 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    blobs.push(png);
    offset += png.length;
  }
  writeFileSync('build/icon.ico', Buffer.concat([header, ...entries, ...blobs]));
  writeFileSync('build/icon.png', pngs.get(256));
  console.log(`Wrote build/icon.ico (${SIZES.join('/')}) and build/icon.png from ${SOURCE}`);
} finally {
  await browser.close();
}
