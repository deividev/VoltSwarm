import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

// Composes the Steam Main Capsule (1232x706) from the Codex background +
// mascot head + wordmark laid out in tools/capsule-preview.html.
const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
];
const chromePath = CHROME_PATHS.find((p) => existsSync(p));
const browser = await puppeteer.launch({ executablePath: chromePath, headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1232, height: 706, deviceScaleFactor: 1 });
await page.goto(pathToFileURL('tools/capsule-preview.html').href);
await new Promise((r) => setTimeout(r, 400));
const el = await page.$('#capsule');
const out = process.argv[2] ?? 'art/steam/capsule-main-v1.png';
await el.screenshot({ path: out });
await browser.close();
console.log(`saved ${out}`);
