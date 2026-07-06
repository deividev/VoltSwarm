import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
];
const chromePath = CHROME_PATHS.find((p) => existsSync(p));
const browser = await puppeteer.launch({ executablePath: chromePath, headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 700 });
await page.goto(pathToFileURL('tools/lockup-preview.html').href);
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: 'assets/preview/lockup-icon-logo.png' });
await browser.close();
console.log('saved');
