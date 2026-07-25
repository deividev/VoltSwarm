// Smoke test: plays a real run with each unlocked starting weapon and fails on
// crashes, console errors, or a run that produces no gameplay at all.
//
// It drives the SHIPPING code path — Electron loading the Vite dev server, where
// `import.meta.env.DEV` already exposes `window.__voltswarm`. No product-side
// test hook is added, so nothing here can leak into a release build.
//
// SCOPE — this is regression coverage, NOT a determinism proof. Gameplay advances
// on wall-clock frame deltas with no fixed tick, so two runs of the same seed
// diverge in timing even on one machine. `Math.random` is seeded only so the
// CONTENT of a run (enemy mix, upgrade offers, drops) is repeatable enough to
// compare failures. A frame-exact digest needs the fixed-tick simulation seam,
// which is deliberately out of scope for now.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const ROOT = resolve(import.meta.dirname, '..');
const OUTPUT = resolve(ROOT, 'tmp/smoke-output');
const REPORT = resolve(OUTPUT, 'report.json');
const PORT = 5599;
const CDP_PORT = 9224;
/** Seconds of IN-GAME time to play per weapon — measured off the run clock, not
 *  wall clock, so loading and overlay pauses do not eat the sample. */
const TARGET_RUN_S = 45;
/** Hard wall-clock ceiling per weapon so a hung run cannot stall the sweep. */
const WALL_TIMEOUT_MS = 120_000;
const SEED = 20260725;

/** The player must keep moving or it is simply swarmed and killed in ~15s,
 *  which tells us nothing about the weapon. Circling clockwise keeps it alive
 *  and drags enemies through the weapon's effective area. */
const KITE_CYCLE = [
  ['KeyW'], ['KeyW', 'KeyD'], ['KeyD'], ['KeyS', 'KeyD'],
  ['KeyS'], ['KeyS', 'KeyA'], ['KeyA'], ['KeyW', 'KeyA'],
];
const KITE_STEP_MS = 700;

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

function run(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with ${result.status}`);
}

async function waitFor(url, label) {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* still starting */ }
    await wait(250);
  }
  throw new Error(`${label} never became reachable at ${url}`);
}

/** Clicks whatever overlay is blocking the run. Level-up and chest overlays
 *  PAUSE the game, so without this the run stalls on the first level-up and the
 *  test would report a false "no gameplay". The pause overlay is included
 *  because the game pauses on window blur, which an automated window trips
 *  constantly — without resuming it, elapsed run time barely advances. */
async function dismissBlockingOverlays(page) {
  return page.evaluate(() => {
    const pick = (selector) => {
      const overlay = document.querySelector(selector);
      if (!overlay || overlay.classList.contains('hidden')) return null;
      return overlay;
    };
    const paused = pick('#pause-overlay');
    if (paused) {
      const button = paused.querySelector('#resume-button');
      if (button instanceof HTMLElement) { button.click(); return 'pause'; }
    }
    const levelup = pick('#levelup-overlay');
    if (levelup) {
      const card = levelup.querySelector('#upgrade-cards > *');
      if (card instanceof HTMLElement) { card.click(); return 'levelup'; }
    }
    const chest = pick('#chest-overlay');
    if (chest) {
      const button = chest.querySelector('#chest-continue');
      if (button instanceof HTMLElement && button.offsetParent !== null) { button.click(); return 'chest'; }
    }
    const shop = pick('#shop-overlay');
    if (shop) {
      const button = shop.querySelector('#shop-leave-button');
      if (button instanceof HTMLElement) { button.click(); return 'shop'; }
    }
    return null;
  });
}

function snapshot(page) {
  return page.evaluate(() => {
    const game = window.__voltswarm;
    if (!game) return null;
    const damage = game.weaponDamage ?? {};
    return {
      state: game.state,
      elapsedS: game.elapsedS,
      level: game.progression?.level ?? 0,
      kills: game.progression?.kills ?? 0,
      activeEnemies: game.enemies?.activeCount ?? 0,
      weaponDamage: Object.fromEntries(Object.entries(damage).filter(([, value]) => value > 0)),
      audio: game.audio?.diagnostics?.() ?? null,
    };
  });
}

mkdirSync(OUTPUT, { recursive: true });
run('npm.cmd', ['run', 'electron:build']);

const electronPath = (await import('electron')).default;
const vite = spawn('npx.cmd', ['vite', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT, stdio: 'pipe', shell: process.platform === 'win32',
});
let electronProcess;
let browser;
const results = [];

try {
  await waitFor(`http://localhost:${PORT}/`, 'Vite dev server');
  // Chromium flags must follow the app path for the `electron` CLI, and
  // ELECTRON_RUN_AS_NODE (inherited from some tool environments) would boot the
  // binary as plain Node so `app` never exists.
  const electronEnv = { ...process.env, VITE_DEV_SERVER_URL: `http://localhost:${PORT}/` };
  delete electronEnv.ELECTRON_RUN_AS_NODE;
  // Without these, Chromium throttles requestAnimationFrame in a window that is
  // not in the foreground, so the run never leaves the loading screen and every
  // weapon reports a false failure.
  electronProcess = spawn(electronPath, [
    ROOT,
    `--remote-debugging-port=${CDP_PORT}`,
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ], {
    cwd: ROOT,
    stdio: 'pipe',
    env: electronEnv,
  });
  electronProcess.stderr.on('data', (chunk) => process.stderr.write(`[electron] ${chunk}`));
  await waitFor(`http://127.0.0.1:${CDP_PORT}/json/version`, 'Electron remote debugging');
  browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${CDP_PORT}` });
  const page = (await browser.pages())[0];
  if (!page) throw new Error('No renderer target found');
  await page.bringToFront().catch(() => undefined);

  // Deterministic content per run, and no pause-on-blur. Both are installed
  // before any app code executes. Suppressing the blur listener is test-side
  // only: an automated window loses focus constantly, and letting the game
  // auto-pause turns the sweep into a pause/resume thrash that never plays.
  await page.evaluateOnNewDocument((seed) => {
    let state = seed >>> 0;
    Math.random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0x100000000; };
    const addEventListener = window.addEventListener.bind(window);
    window.addEventListener = (type, listener, options) => {
      if (type === 'blur') return undefined;
      return addEventListener(type, listener, options);
    };
  }, SEED);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#play-button', { visible: true, timeout: 30_000 });
  await page.click('#play-button');
  await page.waitForSelector('#draft-cards > *', { visible: true, timeout: 30_000 });
  const weaponCount = await page.$$eval('#draft-cards > *', (cards) => cards.length);
  if (weaponCount === 0) throw new Error('Starting draft offered no weapons');
  console.log(`Smoke sweep: ${weaponCount} starting weapons x ${TARGET_RUN_S}s in-game\n`);

  for (let index = 0; index < weaponCount; index++) {
    const errors = [];
    const onPageError = (error) => errors.push(`pageerror: ${error.message}`);
    const onConsole = (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    };
    page.on('pageerror', onPageError);
    page.on('console', onConsole);

    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#play-button', { visible: true, timeout: 30_000 });
      await page.click('#play-button');
      await page.waitForSelector('#draft-cards > *', { visible: true, timeout: 30_000 });
      const weaponName = await page.evaluate((i) => {
        const card = document.querySelectorAll('#draft-cards > *')[i];
        const name = card.querySelector('h3')?.textContent?.trim();
        card.click();
        return name ?? `card-${i}`;
      }, index);

      const overlaysHandled = { pause: 0, levelup: 0, chest: 0, shop: 0 };
      const started = Date.now();
      let held = [];
      let step = 0;
      let latest = null;
      let stoppedBecause = 'target reached';
      try {
        while (Date.now() - started < WALL_TIMEOUT_MS) {
          const handled = await dismissBlockingOverlays(page);
          if (handled) overlaysHandled[handled]++;

          latest = await snapshot(page);
          if (latest?.state === 'ended') { stoppedBecause = 'player died'; break; }
          if ((latest?.elapsedS ?? 0) >= TARGET_RUN_S) break;

          const next = KITE_CYCLE[Math.floor((Date.now() - started) / KITE_STEP_MS) % KITE_CYCLE.length];
          if (next !== held[0] || next.length !== held.length) {
            for (const key of held) await page.keyboard.up(key).catch(() => undefined);
            for (const key of next) await page.keyboard.down(key).catch(() => undefined);
            held = next;
          }
          step++;
          await wait(200);
        }
        if (Date.now() - started >= WALL_TIMEOUT_MS) stoppedBecause = 'wall timeout';
      } finally {
        for (const key of held) await page.keyboard.up(key).catch(() => undefined);
      }
      void step;

      const end = latest ?? await snapshot(page);
      if (!end) throw new Error('window.__voltswarm was never exposed');
      const weaponsThatDealtDamage = Object.keys(end.weaponDamage).length;
      const checks = {
        noErrors: errors.length === 0,
        runAdvanced: end.elapsedS > 5,
        enemiesSpawned: end.activeEnemies > 0,
        killsHappened: end.kills > 0,
        weaponDealtDamage: weaponsThatDealtDamage > 0,
        noVoiceLeak: (end.audio?.leakedVoices ?? 0) === 0,
      };
      const pass = Object.values(checks).every(Boolean);
      results.push({ index, weapon: weaponName, pass, checks, end, overlaysHandled, stoppedBecause, errors: errors.slice(0, 5) });
      console.log(`${pass ? 'PASS' : 'FAIL'}  ${weaponName} — ${end.kills} kills, level ${end.level}, ${end.elapsedS.toFixed(0)}s in-game (${stoppedBecause})` +
        (pass ? '' : `\n      failed: ${Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name).join(', ')}` +
          (errors.length ? `\n      first error: ${errors[0]}` : '')));
    } finally {
      page.off('pageerror', onPageError);
      page.off('console', onConsole);
    }
  }
} finally {
  await browser?.disconnect().catch(() => undefined);
  electronProcess?.kill();
  vite.kill();
}

const failed = results.filter((result) => !result.pass);
const report = { timestamp: new Date().toISOString(), seed: SEED, targetRunS: TARGET_RUN_S, total: results.length, failed: failed.length, results };
writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
console.log(`\n${results.length - failed.length}/${results.length} weapons passed. Report: ${resolve(REPORT)}`);
if (failed.length > 0 || results.length === 0) process.exitCode = 1;
