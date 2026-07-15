// One-off review capture: boots the real game and screenshots the scrapper
// shop at 3 cards (normal) and 4 cards (Foreman's Whistle +1 stock), with a
// mix of affordable/unaffordable so the afford states show.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const PORT = 5198;
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

async function openShop(page, stock, gold) {
  await page.evaluate(
    (stockIds, g) => {
      const game = window.__voltswarm;
      game.gold = g;
      game.merchant.arrive(0, 0, stockIds, game.elapsedS);
      game.openShop();
    },
    stock,
    gold,
  );
  await new Promise((r) => setTimeout(r, 400));
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
  await page.waitForSelector('#draft-cards > *', { visible: true, timeout: 15000 });
  await page.click('#draft-cards > *');
  await new Promise((r) => setTimeout(r, 2000));

  // Seed a populated build so the framed inventory shows all three sections.
  await page.evaluate(() => {
    const g = window.__voltswarm;
    g.weaponLevels = { bolt: 3, pulse: 1 };
    g.coreLevels = { damage: 2, 'move-speed': 1 };
    g.modCounts = { 'stun-bumper': 1, 'detonator-rig': 1, 'piston-stompers': 2, 'foremans-whistle': 1 };
    g.hud.updateBuild(g.stats, g.weaponLevels, g.modCounts, g.coreLevels);
  });
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: 'assets/preview/inventory-inrun.png' });

  // 3 cards, mixed tiers, gold that leaves the gold-tier one unaffordable.
  await openShop(page, ['loose-bolts', 'chain-relay', 'magnetron-heart'], 120);
  await page.screenshot({ path: 'assets/preview/shop-3cards.png' });

  // 4 cards (whistle +1 stock), all affordable.
  await openShop(page, ['stun-bumper', 'coolant-burst', 'phase-chassis', 'magnetron-heart'], 600);
  await page.screenshot({ path: 'assets/preview/shop-4cards.png' });

  await browser.close();
  console.log('Saved shop-3cards.png + shop-4cards.png');
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
