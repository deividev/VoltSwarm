import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

// Renders each encuadre concept in tools/capsule-frames.html to its own PNG.
const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
];
const styles = ['brackets', 'outline', 'hazard', 'rivet', 'underline', 'spotlight'];
const chromePath = CHROME_PATHS.find((p) => existsSync(p));
const browser = await puppeteer.launch({ executablePath: chromePath, headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1232, height: 706, deviceScaleFactor: 1 });
const base = pathToFileURL('tools/capsule-frames.html').href;
for (const s of styles) {
  await page.goto(`${base}?style=${s}`);
  await new Promise((r) => setTimeout(r, 350));
  const el = await page.$('#capsule');
  const out = `art/steam/frame-${s}.png`;
  await el.screenshot({ path: out });
  console.log(`saved ${out}`);
}
await browser.close();
