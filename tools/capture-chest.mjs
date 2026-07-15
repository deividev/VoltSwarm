// One-off: boots the real game, force-opens a paid chest through the dev
// hook and screenshots the landed reel — Continue button + revealed stat
// sheet / items list (2026-07-10). Run from the project root.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

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

const errors = [];
try {
  await waitForServer();
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--window-size=1600,900', '--use-gl=angle'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto(`http://localhost:${PORT}/`);

  await page.waitForSelector('#play-button', { visible: true, timeout: 15000 });
  await page.click('#play-button');
  await page.waitForSelector('#draft-cards > *', { visible: true, timeout: 15000 });
  await page.click('#draft-cards > *');

  await new Promise((r) => setTimeout(r, 4000));

  // Give gold and open a chest directly (openChest is TS-private only).
  await page.evaluate(() => {
    const game = window.__voltswarm;
    game.gold = 500;
    game.openChest(0, 'green', 20);
  });

  // Mid-spin frame: the vertical reel strip scrolling through the window.
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: 'assets/preview/chest-spinning.png' });

  // Wait for the reel to land (Continue button becomes visible).
  await page.waitForSelector('#chest-continue:not(.hidden)', { visible: true, timeout: 15000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: 'assets/preview/chest-landed.png' });

  // Click Continue and confirm the run resumes (overlay hides, state playing).
  await page.click('#chest-continue');
  await new Promise((r) => setTimeout(r, 500));
  const resumed = await page.evaluate(() => {
    const overlay = document.getElementById('chest-overlay');
    return overlay.classList.contains('hidden') && window.__voltswarm.state === 'playing';
  });
  await browser.close();
  console.log(resumed ? 'Saved chest-landed.png, resume verified' : 'RESUME FAILED');
  if (!resumed) process.exitCode = 1;
  if (errors.length) {
    console.error('Page errors:', errors);
    process.exitCode = 1;
  }
} catch (err) {
  console.error('Capture failed:', err.message);
  process.exitCode = 1;
} finally {
  vite.kill();
  process.exit(process.exitCode ?? 0);
}
