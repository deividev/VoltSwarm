// Plays a real run against the PACKAGED build and fails on any asset the
// archive is missing.
//
// This exists because `pnpm test:smoke` cannot answer that question: it
// drives Electron against the Vite dev server, which serves straight from
// public/. A smoke run passes even when every asset has been excluded from
// app.asar. The failure mode this guards is exactly the one that only appears
// after packaging.
//
// It boots the shipped exe, installs asset-error recorders BEFORE any page
// script runs, starts a run, plays it, and reads back both the recorded
// failures and proof the simulation actually advanced. `window.__voltswarm` is
// DEV-only, so everything here goes through the real UI.
//
// Usage: node tools/packaged-run-check.mjs "<path-to-exe>" [seconds]
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const EXE = process.argv[2];
const PLAY_SECONDS = Number(process.argv[3] ?? 25);
const CDP_PORT = 9412;
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

/** Runs before any page script, so nothing loads unobserved. */
function installRecorders() {
  window.__assetErrors = [];
  window.__runtimeErrors = [];
  const note = (bucket, value) => { if (!bucket.includes(value)) bucket.push(value); };

  for (const Ctor of [window.Image, window.Audio]) {
    if (!Ctor) continue;
    const original = Ctor;
    const patched = function (...args) {
      const element = new original(...args);
      element.addEventListener('error', () => {
        note(window.__assetErrors, element.src || element.currentSrc || '(no src)');
      });
      return element;
    };
    patched.prototype = original.prototype;
    if (Ctor === window.Image) window.Image = patched; else window.Audio = patched;
  }

  window.addEventListener('error', (event) => {
    const target = event.target;
    if (target && (target.tagName === 'IMG' || target.tagName === 'AUDIO' || target.tagName === 'LINK')) {
      note(window.__assetErrors, target.src || target.href || '(no src)');
      return;
    }
    note(window.__runtimeErrors, String(event.message ?? event.error));
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    note(window.__runtimeErrors, String(event.reason?.message ?? event.reason));
  });

  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    try {
      const response = await originalFetch(...args);
      if (!response.ok) note(window.__assetErrors, `${response.status} ${String(args[0])}`);
      return response;
    } catch (error) {
      note(window.__assetErrors, `fetch failed ${String(args[0])}: ${error?.message ?? error}`);
      throw error;
    }
  };
}

const KITE = [['KeyW'], ['KeyW', 'KeyD'], ['KeyD'], ['KeyS', 'KeyD'], ['KeyS'], ['KeyS', 'KeyA'], ['KeyA'], ['KeyW', 'KeyA']];

async function main() {
  if (!EXE || !existsSync(EXE)) {
    console.error(`Usage: node tools/packaged-run-check.mjs "<path-to-exe>" [seconds]`);
    process.exit(2);
  }
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE; // makes the exe run as plain Node and reject Chromium flags

  const child = spawn(EXE, [`--remote-debugging-port=${CDP_PORT}`], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let processOutput = '';
  child.stdout.on('data', (d) => { processOutput += d; });
  child.stderr.on('data', (d) => { processOutput += d; });

  let browser;
  const consoleErrors = [];
  try {
    let up = false;
    for (let attempt = 0; attempt < 120 && !up; attempt++) {
      try { up = (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).ok; } catch { await wait(250); }
    }
    if (!up) throw new Error(`CDP never came up.\n${processOutput}`);

    browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${CDP_PORT}`, defaultViewport: null });
    const pages = await browser.pages();
    const page = pages.find((p) => p.url().startsWith('file://')) ?? pages[0];

    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', (error) => consoleErrors.push(String(error)));

    await page.evaluateOnNewDocument(installRecorders);
    await page.reload({ waitUntil: 'domcontentloaded' });

    await page.waitForFunction(
      () => {
        const button = document.querySelector('#play-button');
        return button instanceof HTMLElement && button.getClientRects().length > 0;
      },
      { timeout: 60_000 },
    );
    await page.evaluate(() => document.querySelector('#play-button').click());

    // Branches older than the character-selection step have no such helper.
    try {
      const { confirmOnlyVisibleCharacterIfPresent } = await import('./character-flow.mjs');
      await confirmOnlyVisibleCharacterIfPresent(page, 5_000);
    } catch (error) {
      if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    }

    // The starting-weapon draft blocks the run until a card is taken.
    try {
      await page.waitForFunction(
        () => [...document.querySelectorAll('#draft-cards > *')].some((c) => c.getClientRects().length > 0),
        { timeout: 15_000 },
      );
      await page.evaluate(() => document.querySelector('#draft-cards > *').click());
    } catch { /* some builds start without a draft */ }

    const deadline = Date.now() + PLAY_SECONDS * 1000;
    let step = 0;
    while (Date.now() < deadline) {
      const keys = KITE[step++ % KITE.length];
      for (const key of keys) await page.keyboard.down(key);
      await wait(700);
      for (const key of keys) await page.keyboard.up(key);
      // Level-up draft pauses the run; take the first card so the clock resumes.
      await page.evaluate(() => {
        const card = [...document.querySelectorAll('#draft-cards > *')].find((c) => c.getClientRects().length > 0);
        if (card) card.click();
      });
    }

    const result = await page.evaluate(() => ({
      assetErrors: window.__assetErrors ?? [],
      runtimeErrors: window.__runtimeErrors ?? [],
      hudTimer: document.querySelector('#timer, #hud-timer, .timer')?.textContent?.trim() ?? null,
      hudText: (document.querySelector('#hud')?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 140),
      canvases: document.querySelectorAll('canvas').length,
      inRun: !document.querySelector('#start-overlay:not(.hidden)'),
    }));

    const assetErrors = result.assetErrors;
    const failures = [];
    if (assetErrors.length > 0) failures.push(`${assetErrors.length} asset(s) failed to load from the archive`);
    if (result.runtimeErrors.length > 0) failures.push(`${result.runtimeErrors.length} runtime error(s)`);
    if (consoleErrors.length > 0) failures.push(`${consoleErrors.length} console error(s)`);
    if (!result.inRun) failures.push('never left the start menu');
    if (result.canvases === 0) failures.push('no canvas in the document');

    console.log(JSON.stringify({
      exe: EXE,
      playedSeconds: PLAY_SECONDS,
      inRun: result.inRun,
      canvases: result.canvases,
      hudTimer: result.hudTimer,
      hudText: result.hudText,
      assetErrors,
      runtimeErrors: result.runtimeErrors.slice(0, 10),
      consoleErrors: consoleErrors.slice(0, 10),
      verdict: failures.length === 0 ? 'PASS' : `FAIL - ${failures.join('; ')}`,
    }, null, 2));

    process.exitCode = failures.length === 0 ? 0 : 1;
  } finally {
    try { await browser?.disconnect(); } catch { /* already gone */ }
    child.kill();
  }
}

await main();
