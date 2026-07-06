// Verifies a PNG has real (non-opaque) alpha and reports transparency stats.
// Usage: node tools/check-alpha.mjs <file.png>
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const FILE = process.argv[2];
const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
];
const chromePath = CHROME_PATHS.find((p) => existsSync(p));
const browser = await puppeteer.launch({ executablePath: chromePath, headless: 'new' });
const page = await browser.newPage();
await page.goto(pathToFileURL(FILE).href);
const stats = await page.evaluate(async () => {
  const img = document.querySelector('img');
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let transparent = 0;
  let opaque = 0;
  let total = data.length / 4;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 10) transparent++;
    else if (data[i] > 245) opaque++;
  }
  return { total, transparent, opaque, transparentPct: (transparent / total) * 100 };
});
await browser.close();
console.log(stats);
