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
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { confirmOnlyVisibleCharacterIfPresent, enterMainMenu } from './character-flow.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const OUTPUT = resolve(ROOT, 'tmp/smoke-output');
const REPORT = resolve(OUTPUT, 'report.json');
/** Isolated Electron profile so bot runs never touch the real save. */
const USER_DATA = resolve(OUTPUT, 'userdata');
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
run('pnpm.cmd', ['run', 'electron:build']);

const electronPath = (await import('electron')).default;
// Spawned through Node directly rather than `npx`/shell: a shell wrapper on
// Windows means kill() only reaps the cmd.exe wrapper, leaving the real dev
// server holding the port and this process alive forever.
const vite = spawn(process.execPath, [
  resolve(ROOT, 'node_modules/vite/bin/vite.js'),
  '--port', String(PORT), '--strictPort',
], { cwd: ROOT, stdio: 'pipe' });
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
  delete electronEnv.ELECTRON_RUN_AS_NODE;
  // Without these, Chromium throttles requestAnimationFrame in a window that is
  // not in the foreground, so the run never leaves the loading screen and every
  // weapon reports a false failure.
  // Throwaway userData dir. Two reasons: bot runs must never land in the real
  // run-history.json (balance thresholds get calibrated from that file, and a
  // bot that circle-strafes and always picks the first card is not a player),
  // and a wiped profile means every sweep starts from the same fresh unlock
  // state instead of inheriting whatever the developer has unlocked.
  rmSync(USER_DATA, { recursive: true, force: true });
  mkdirSync(USER_DATA, { recursive: true });
  electronProcess = spawn(electronPath, [
    ROOT,
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${USER_DATA}`,
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
  // Re-registered per attempt with a DIFFERENT seed: a fixed seed makes the
  // starting draft roll identically on every reload, so it would never offer a
  // weapon the sweep has not covered yet. Each attempt stays individually
  // reproducible via SEED + attempt.
  /** Reloads from INSIDE the page instead of through puppeteer's page.reload().
   *
   *  Measured on Electron 43: CDP's `Page.reload` -- what page.reload() calls --
   *  is silently ignored by this renderer. The frame never navigates, so
   *  `waitUntil: 'domcontentloaded'` blocks for its whole timeout while the page
   *  sits there perfectly healthy (readyState 'complete', dev server 200). A
   *  `location.reload()` issued by the page itself navigates normally, emitting
   *  framenavigated + domcontentloaded + load.
   *
   *  The setTimeout matters: calling location.reload() directly inside evaluate
   *  tears down the execution context before the call can return. And the wait
   *  polls a stamp on the outgoing document rather than listening for an event,
   *  so it cannot miss an edge and it proves a NEW document actually exists. */
  const reloadPage = async () => {
    await page.evaluate(() => { window.__smokePreReload = true; });
    await page.evaluate(() => { setTimeout(() => location.reload(), 0); }).catch(() => undefined);
    await page.waitForFunction(() => window.__smokePreReload === undefined, { timeout: 30_000, polling: 250 });
  };

  const installHooks = (seed) => page.evaluateOnNewDocument((s) => {
    let state = s >>> 0;
    Math.random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0x100000000; };
    const addEventListener = window.addEventListener.bind(window);
    window.addEventListener = (type, listener, options) => {
      if (type === 'blur') return undefined;
      return addEventListener(type, listener, options);
    };
  }, seed);
  await installHooks(SEED);

  await reloadPage();
  await enterMainMenu(page, 30_000);
  await page.waitForSelector('#play-button', { visible: true, timeout: 30_000 });
  // The starting draft offers a RANDOM subset of the unlocked weapons and
  // re-rolls on every reload, so iterating by card index tests whatever landed
  // in that slot — the same weapon twice, and another never. Cover weapons by
  // NAME instead, reloading until an uncovered one is offered. The unlocked
  // count is not queried from the app (that coupling is not worth it): the
  // sweep simply stops once several consecutive drafts offer nothing new.
  console.log(`Smoke sweep: every unlocked starting weapon x ${TARGET_RUN_S}s in-game\n`);

  const covered = new Set();
  const MAX_ATTEMPTS = 24;
  const EXHAUSTED_AFTER = 4;
  let barren = 0;
  for (let attempt = 0; attempt < MAX_ATTEMPTS && barren < EXHAUSTED_AFTER; attempt++) {
    const errors = [];
    const onPageError = (error) => errors.push(`pageerror: ${error.message}`);
    const onConsole = (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    };
    page.on('pageerror', onPageError);
    page.on('console', onConsole);

    try {
      await installHooks(SEED + attempt);
      await reloadPage();
      await enterMainMenu(page, 30_000);
      await page.waitForSelector('#play-button', { visible: true, timeout: 30_000 });
      // evaluate().click() rather than page.click(): the latter hit-tests for a
      // clickable point and loses a race with the menu's layout/animation.
      await page.evaluate(() => document.querySelector('#play-button').click());
      await confirmOnlyVisibleCharacterIfPresent(page);
      await page.waitForSelector('#draft-cards > *', { visible: true, timeout: 30_000 });
      const weaponName = await page.evaluate((done) => {
        const cards = [...document.querySelectorAll('#draft-cards > *')];
        const pick = cards.find((c) => !done.includes(c.querySelector('h3')?.textContent?.trim() ?? ''));
        if (!pick) return null; // this draft only re-offers weapons already covered
        const name = pick.querySelector('h3')?.textContent?.trim() ?? 'unknown';
        pick.click();
        return name;
      }, [...covered]);
      if (weaponName === null) { barren++; continue; } // re-roll the draft
      barren = 0;
      covered.add(weaponName);

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
      results.push({ weapon: weaponName, pass, checks, end, overlaysHandled, stoppedBecause, errors: errors.slice(0, 5) });
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
// Explicit exit: Electron and the dev server can leave handles open that would
// otherwise keep this runner alive after the report is written.
process.exit(failed.length > 0 || results.length === 0 ? 1 : 0);
