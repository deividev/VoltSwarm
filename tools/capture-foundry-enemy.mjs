// Captures Furnace Mite through the REAL Map 1 -> Map 2 transition hook.
// Usage: node tools/capture-foundry-enemy.mjs [output.png]
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { confirmOnlyVisibleCharacterIfPresent, enterMainMenu } from './character-flow.mjs';

const PORT = 5201;
const OUTPUT = process.argv[2] ?? 'assets/preview/furnace-mite-ingame.png';
const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const chromePath = CHROME_PATHS.find((path) => existsSync(path));
if (!chromePath) throw new Error('No Chrome/Edge executable found');

const vite = spawn('pnpm.cmd', ['exec', 'vite', '--port', String(PORT), '--strictPort'], {
  stdio: 'pipe',
  shell: true,
});

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`http://localhost:${PORT}/`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Vite dev server did not start');
}

const pageErrors = [];
try {
  await waitForServer();
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--window-size=1600,1000', '--use-gl=angle'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`http://localhost:${PORT}/`);

  await enterMainMenu(page);
  await page.waitForSelector('#play-button', { visible: true, timeout: 15000 });
  await page.click('#play-button');
  await confirmOnlyVisibleCharacterIfPresent(page);
  await page.waitForSelector('#draft-cards > *', { visible: true, timeout: 15000 });
  await page.click('#draft-cards > *');
  await page.waitForFunction(() => window.__voltswarm?.state === 'playing', { timeout: 15000 });

  // The enabled development transition key runs enterMap + the production
  // curtain/swap path. This intentionally does not mutate worldMaps by hand.
  await page.keyboard.press('KeyT');
  await page.waitForFunction(
    () => window.__voltswarm?.runFlow?.mapIndex === 1 && window.__voltswarm?.state === 'playing',
    { timeout: 15000 },
  );

  const result = await page.evaluate(async () => {
    const game = window.__voltswarm;
    if (!game?.enemies?.spawnAt) return { status: 'missing-dev-hook', count: 0 };
    await game.enemies.applyMapModelVariants('megafactory');
    game.enemies.reset();
    const player = game.player.position;
    const count = 12;
    for (let index = 0; index < count; index++) {
      const angle = (index / count) * Math.PI * 2;
      const radius = 4.5 + (index % 3) * 1.35;
      const poolIndex = game.enemies.spawnAt(
        0,
        player.x + Math.cos(angle) * radius,
        player.z + Math.sin(angle) * radius,
        1000,
      );
      const enemy = game.enemies.pool[poolIndex];
      if (enemy) enemy.speed = 0;
    }
    game.player.hp = game.player.maxHp;
    return { status: 'ok', count: game.enemies.activeCount };
  });

  await new Promise((resolve) => setTimeout(resolve, 900));
  await page.screenshot({ path: OUTPUT });
  await browser.close();
  console.log(`Saved ${OUTPUT} (${result.status}, active Furnace Mites: ${result.count})`);
  if (pageErrors.length > 0) {
    console.error('Page errors:', pageErrors);
    process.exitCode = 1;
  }
} catch (error) {
  console.error('Capture failed:', error.message);
  if (pageErrors.length > 0) console.error('Page errors:', pageErrors);
  process.exitCode = 1;
} finally {
  vite.kill();
  process.exit(process.exitCode ?? 0);
}
