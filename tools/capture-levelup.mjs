// One-off: boots the real game, screenshots (1) the in-run HUD with the
// weapons-only build panel and (2) the level-up overlay with the new
// right-side stat sheet. Run from the project root.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { confirmOnlyVisibleCharacterIfPresent } from './character-flow.mjs';

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
    args: ['--window-size=1920,1080', '--use-gl=angle'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto(`http://localhost:${PORT}/`);

  await page.waitForSelector('#play-button', { visible: true, timeout: 15000 });
  await page.click('#play-button');
  await confirmOnlyVisibleCharacterIfPresent(page);
  await page.waitForSelector('#draft-cards > *', { visible: true, timeout: 15000 });
  await page.click('#draft-cards > *');

  // In-run shot after 8s: build panel should show weapons only.
  await new Promise((r) => setTimeout(r, 8000));
  await page.screenshot({ path: 'assets/preview/hud-inrun.png' });

  // Force a level-up through the dev hook (the idle player never reaches
  // dropped orbs), then capture the overlay with the new right-side sheet.
  await page.evaluate(() => {
    const game = window.__voltswarm;
    game.pendingLevelUps += game.progression.grantXp(200);
  });
  let captured = false;
  const startedAt = Date.now();
  while (Date.now() - startedAt < 90000) {
    const visible = await page.evaluate(() => {
      const overlay = document.getElementById('levelup-overlay');
      return overlay !== null && !overlay.classList.contains('hidden');
    });
    if (visible) {
      await new Promise((r) => setTimeout(r, 300));
      await page.screenshot({ path: 'assets/preview/hud-levelup.png' });
      captured = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  await browser.close();
  console.log(captured ? 'Saved both captures' : 'Level-up never appeared');
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
