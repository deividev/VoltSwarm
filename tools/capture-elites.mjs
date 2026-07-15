// Boots the real game, force-spawns elite enemies near the player via the
// dev hook, and screenshots them — elites normally need 4+ minutes to roll.
// Usage: node tools/capture-elites.mjs [output.png]
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const PORT = 5198;
const OUTPUT = process.argv[2] ?? 'assets/preview/elites.png';

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

const vite = spawn('npx.cmd', ['vite', '--port', String(PORT), '--strictPort'], {
  stdio: 'pipe',
  shell: true,
});

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/`);
      if (res.ok) return;
    } catch {
      // server not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Vite dev server did not start');
}

try {
  await waitForServer();
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--window-size=1400,900', '--use-gl=angle'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.goto(`http://localhost:${PORT}/`);

  await page.waitForSelector('#play-button', { visible: true, timeout: 15000 });
  await page.click('#play-button');
  await page.waitForSelector('#draft-cards > *', { visible: true, timeout: 15000 });
  await page.click('#draft-cards > *');
  await new Promise((r) => setTimeout(r, 1500));

  const spawned = await page.evaluate(() => {
    const game = window.__voltswarm;
    if (!game?.enemies?.spawnAt) return 'no spawnAt on dev hook';
    const p = game.player?.mesh?.position ?? { x: 0, z: 0 };
    // One elite of each swarm silhouette family around the player.
    const picks = [
      [0, 3, 0],
      [1, -3, 2],
      [2, 1, 4],
      [3, -2, -3],
    ];
    for (const [typeIndex, dx, dz] of picks) {
      game.enemies.spawnAt(typeIndex, p.x + dx, p.z + dz, 1, true);
    }
    return 'ok';
  });
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: OUTPUT });
  await browser.close();
  console.log(`Saved ${OUTPUT} (spawn: ${spawned})`);
} catch (err) {
  console.error('Capture failed:', err.message);
  process.exitCode = 1;
} finally {
  vite.kill();
  process.exit(process.exitCode ?? 0);
}
