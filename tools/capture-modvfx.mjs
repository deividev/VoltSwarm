// Captures a mod-behavior VFX the instant it triggers (2026-07-11).
// Usage: node tools/capture-modvfx.mjs <mod-id> <trigger-expr> [outfile]
//   mod-id:       key in MOD_REGISTRY, granted via the dev hook
//   trigger-expr: JS expression on `g` (window.__voltswarm) that flips truthy
//                 the moment the effect fires, e.g. "g.stunBumperCdS > 0"
// Screenshots right after the trigger so the burst cubes are mid-flight.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { confirmOnlyVisibleCharacterIfPresent, enterMainMenu } from './character-flow.mjs';

const [
  modId,
  triggerExpr,
  outfile = `assets/preview/modvfx-${process.argv[2]}.png`,
  delayMs = '120',
  setupExpr = '',
] = process.argv.slice(2);
if (!modId || !triggerExpr) {
  console.error('Usage: node tools/capture-modvfx.mjs <mod-id> <trigger-expr> [outfile]');
  process.exit(1);
}

const PORT = 5199;
const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
];
const chromePath = CHROME_PATHS.find((p) => existsSync(p));
const vite = spawn('npx.cmd', ['vite', '--port', String(PORT), '--strictPort'], {
  stdio: 'pipe',
  shell: true,
});

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Vite dev server did not start');
}

try {
  await waitForServer();
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--window-size=1600,900', '--use-gl=angle'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  await page.goto(`http://localhost:${PORT}/`);
  await enterMainMenu(page);
  await page.waitForSelector('#play-button', { visible: true, timeout: 15000 });
  await page.click('#play-button');
  await confirmOnlyVisibleCharacterIfPresent(page);
  await page.waitForSelector('#draft-cards > *', { visible: true, timeout: 15000 });
  await page.click('#draft-cards > *');
  await new Promise((r) => setTimeout(r, 2000));

  await page.evaluate(
    (id, setup) => {
      const g = window.__voltswarm;
      g.modCounts[id] = (g.modCounts[id] ?? 0) + 1;
      if (setup) Function('g', setup)(g);
    },
    modId,
    setupExpr,
  );

  // Wait for the trigger, then shoot immediately (bursts live ~0.6s).
  await page.waitForFunction(
    (expr) => {
      const g = window.__voltswarm;
      return Function('g', `return (${expr})`)(g);
    },
    { polling: 'raf', timeout: 60000 },
    triggerExpr,
  );
  await new Promise((r) => setTimeout(r, Number(delayMs))); // frames of spread
  await page.screenshot({ path: outfile });
  await browser.close();
  console.log(`Saved ${outfile}`);
} catch (err) {
  console.error('Capture failed:', err.message);
  process.exitCode = 1;
} finally {
  vite.kill();
  process.exit(process.exitCode ?? 0);
}
