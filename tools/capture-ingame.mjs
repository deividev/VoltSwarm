// Boots the real game in headless Chrome, starts a run, and screenshots it.
// Usage: node tools/capture-ingame.mjs [seconds-into-run] [output.png] [weaponId] [width] [height]
//   --at <x>,<z>   teleport the player there just before the shot, and freeze
//                  the run. The follow camera only ever shows ~40 world units
//                  around the player, so anything further out — the Map 2
//                  perimeter towers sit at radius 72 — is simply not in frame
//                  from spawn. Use this to review scenery, not to judge combat.
//   --invuln       stop the swarm killing the bot before the shot (Map 2 opens
//                  at Map 1's minute-4 pressure, which ends an unbuilt run in
//                  under 10 seconds).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { confirmOnlyVisibleCharacterIfPresent, enterMainMenu } from './character-flow.mjs';

const PORT = 5198;
const RUN_SECONDS = Number(process.argv[2] ?? 25);
const OUTPUT = process.argv[3] ?? 'assets/preview/ingame.png';
const WANT_WEAPON = process.argv[4] ?? null;
const AT = (() => {
  const i = process.argv.indexOf('--at');
  if (i === -1) return null;
  const [x, z] = String(process.argv[i + 1] ?? '').split(',').map(Number);
  return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
})();
const INVULN = process.argv.includes('--invuln');
const CAPTURE_WIDTH = Number(process.argv[5] ?? process.env.CAPTURE_WIDTH ?? 1920);
const CAPTURE_HEIGHT = Number(process.argv[6] ?? process.env.CAPTURE_HEIGHT ?? 1080);

if (!Number.isInteger(CAPTURE_WIDTH) || CAPTURE_WIDTH <= 0 ||
    !Number.isInteger(CAPTURE_HEIGHT) || CAPTURE_HEIGHT <= 0) {
  console.error('Capture width and height must be positive integers');
  process.exit(1);
}

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

const errors = [];
try {
  await waitForServer();
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: [`--window-size=${CAPTURE_WIDTH},${CAPTURE_HEIGHT}`, '--use-gl=angle'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT });
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto(`http://localhost:${PORT}/`);

  await enterMainMenu(page);
  await page.waitForSelector('#play-button', { visible: true, timeout: 15000 });
  await page.click('#play-button');
  await confirmOnlyVisibleCharacterIfPresent(page);
  await page.waitForSelector('#draft-cards .card, #draft-cards button, #draft-cards > *', {
    visible: true,
    timeout: 15000,
  });
  if (WANT_WEAPON) {
    // Draft cards don't expose weaponId in the DOM; keep clicking "New Run"
    // isn't available mid-draft, so just retry via reload until the wanted
    // weapon's title appears among the 3 offered cards.
    let picked = false;
    for (let attempt = 0; attempt < 12 && !picked; attempt++) {
      const cards = await page.$$('#draft-cards > *');
      for (const card of cards) {
        const text = await card.evaluate((el) => el.textContent ?? '');
        if (text.toLowerCase().includes(WANT_WEAPON.toLowerCase())) {
          await card.click();
          picked = true;
          break;
        }
      }
      if (!picked) {
        // Reroll: reload and redraft.
        await page.goto(`http://localhost:${PORT}/`);
        await enterMainMenu(page);
        await page.waitForSelector('#play-button', { visible: true, timeout: 15000 });
        await page.click('#play-button');
        await confirmOnlyVisibleCharacterIfPresent(page);
        await page.waitForSelector('#draft-cards > *', { visible: true, timeout: 15000 });
      }
    }
    if (!picked) {
      console.error(`Could not draft a card matching "${WANT_WEAPON}" after retries`);
    }
  } else {
    await page.click('#draft-cards > *');
  }

  // Let the swarm build up, dismissing any level-up overlay that pauses the run.
  const startedAt = Date.now();
  while (Date.now() - startedAt < RUN_SECONDS * 1000) {
    await new Promise((r) => setTimeout(r, INVULN ? 300 : 1000));
    if (INVULN) {
      // Top the bar up rather than inflating maxHp: maxHp is recomputed from
      // stats every frame, so assigning it is silently undone (measured — the
      // HUD still read 38/110 after setting it to 1e9). Swarm DPS is capped by
      // the i-frame window at contactDamage / invulnAfterHitS = 20/s, so a
      // 300ms top-up cannot be outrun.
      await page.evaluate(() => {
        const game = window.__voltswarm;
        if (game?.player) game.player.hp = game.player.maxHp;
      });
    }
    const levelUpVisible = await page.evaluate(() => {
      const overlay = document.getElementById('levelup-overlay');
      return overlay !== null && !overlay.classList.contains('hidden');
    });
    if (levelUpVisible) await page.click('#upgrade-cards > *');
  }

  if (AT) {
    // Move, then let a few frames run so the follow camera eases in and the
    // ground/props around the new position are actually drawn.
    await page.evaluate((at) => {
      const game = window.__voltswarm;
      // player.position is the authoritative vector; the mesh is written from
      // it every frame, so moving the mesh alone is silently undone.
      if (!game?.player) return;
      game.player.position.x = at.x;
      game.player.position.z = at.z;
    }, AT);
    await new Promise((r) => setTimeout(r, 1200));
  }
  await page.screenshot({ path: OUTPUT });
  // Sample FPS over ~3s via rAF and read the swarm size from the dev hook.
  const stats = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0;
        const start = performance.now();
        const tick = () => {
          frames++;
          if (performance.now() - start < 3000) requestAnimationFrame(tick);
          else {
            const game = window.__voltswarm;
            resolve({
              fps: Math.round((frames / (performance.now() - start)) * 1000),
              enemies: game?.enemies?.activeCount ?? null,
            });
          }
        };
        requestAnimationFrame(tick);
      }),
  );
  await browser.close();
  console.log(`Saved ${OUTPUT} (fps: ${stats.fps}, active enemies: ${stats.enemies})`);
  if (errors.length) {
    console.error('Page errors:', errors);
    process.exitCode = 1;
  }
} catch (err) {
  console.error('Capture failed:', err.message);
  if (errors.length) console.error('Page errors:', errors);
  process.exitCode = 1;
} finally {
  vite.kill();
  process.exit(process.exitCode ?? 0);
}
