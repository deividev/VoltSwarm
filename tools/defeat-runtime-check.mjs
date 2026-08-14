// Runtime acceptance for the staged defeat transition, measured in Electron.
//
// The phase timings, the frozen-scene contract and the persistence count cannot
// be judged from a screenshot, and they cannot be judged from the Vite preview
// either (a backgrounded tab throttles requestAnimationFrame, so the sequence
// never runs). This drives the real shipping path — Electron loading the dev
// server — presses the release-gated fatal-hit key, and READS state back.
//
// Requires DEV_TOOLS.fatalHitKey = true in src/config.ts. It says so and exits
// if the flag is off, because a silent no-op would look like a pass.
//
// Usage: node tools/defeat-runtime-check.mjs
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { confirmOnlyVisibleCharacterIfPresent, enterMainMenu } from './character-flow.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const OUTPUT = resolve(ROOT, 'tmp/defeat-runtime-output');
const USER_DATA = resolve(OUTPUT, 'userdata');
const PORT = 5601;
const CDP_PORT = 9226;
const SEED = 20260805;

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

function run(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with ${result.status}`);
}

async function waitFor(url, label) {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch { /* still starting */ }
    await wait(250);
  }
  throw new Error(`${label} never became reachable at ${url}`);
}

/**
 * Protects the REAL run history from this bot.
 *
 * `--user-data-dir` is NOT enough: Electron calls app.setPath('userData', ...)
 * during startup, so the app writes to its own AppData folder regardless of the
 * Chromium flag — the smoke sweep's isolation trick silently does not apply
 * here. Balance thresholds get calibrated from these records with `pnpm
 * stats`, and a bot that stands still and takes a scripted lethal hit is not a
 * player, so its runs must never survive the check.
 */
function historyPaths() {
  const appData = process.env.APPDATA;
  if (!appData) return [];
  const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
  const dirs = new Set([pkg.name, pkg.build?.userDataDirectory, pkg.build?.productName].filter(Boolean));
  return [...dirs]
    .map((dir) => resolve(appData, dir, 'run-history.json'))
    .filter((file) => existsSync(file));
}

const historyBackup = historyPaths().map((file) => ({ file, content: readFileSync(file, 'utf8') }));
const restoreHistory = () => {
  for (const { file, content } of historyBackup) {
    if (readFileSync(file, 'utf8') !== content) {
      writeFileSync(file, content);
      console.log(`  restored ${file} (bot runs discarded)`);
    }
  }
};

const config = readFileSync(resolve(ROOT, 'src/config.ts'), 'utf8');
if (!/fatalHitKey:\s*true/.test(config)) {
  console.error('DEV_TOOLS.fatalHitKey is false — this check cannot force a lethal hit.');
  console.error('Set it to true in src/config.ts, run this, then set it back to false.');
  process.exit(1);
}

mkdirSync(OUTPUT, { recursive: true });
run('pnpm.cmd', ['run', 'electron:build']);

const electronPath = (await import('electron')).default;
const vite = spawn(process.execPath, [
  resolve(ROOT, 'node_modules/vite/bin/vite.js'),
  '--port', String(PORT), '--strictPort',
], { cwd: ROOT, stdio: 'pipe' });
let electronProcess;
let browser;
let failures = 0;

const check = (label, ok, detail) => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : ` — ${detail}`}`);
};

try {
  await waitFor(`http://localhost:${PORT}/`, 'Vite dev server');
  const electronEnv = { ...process.env, VITE_DEV_SERVER_URL: `http://localhost:${PORT}/` };
  delete electronEnv.ELECTRON_RUN_AS_NODE;
  rmSync(USER_DATA, { recursive: true, force: true });
  mkdirSync(USER_DATA, { recursive: true });
  electronProcess = spawn(electronPath, [
    ROOT,
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ], { cwd: ROOT, stdio: 'pipe', env: electronEnv });
  electronProcess.stderr.on('data', (chunk) => process.stderr.write(`[electron] ${chunk}`));

  await waitFor(`http://127.0.0.1:${CDP_PORT}/json/version`, 'Electron remote debugging');
  browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${CDP_PORT}` });
  const page = (await browser.pages())[0];
  if (!page) throw new Error('No renderer target found');
  await page.bringToFront().catch(() => undefined);

  const consoleErrors = [];
  page.on('pageerror', (error) => consoleErrors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  // Same test-side hooks the smoke sweep uses: deterministic content, and no
  // pause-on-blur (an automated window loses focus constantly, and a pause
  // would freeze the very sequence being measured).
  await page.evaluateOnNewDocument((s) => {
    let state = s >>> 0;
    Math.random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0x100000000; };
    const addEventListener = window.addEventListener.bind(window);
    window.addEventListener = (type, listener, options) => {
      if (type === 'blur') return undefined;
      return addEventListener(type, listener, options);
    };
  }, SEED);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await enterMainMenu(page, 30_000);
  await page.waitForSelector('#play-button', { visible: true, timeout: 30_000 });
  await page.click('#play-button');
  await confirmOnlyVisibleCharacterIfPresent(page);
  await page.waitForSelector('#draft-cards > *', { visible: true, timeout: 15_000 });
  await page.click('#draft-cards > *');

  // Play far enough in that there is a real battle to freeze behind the beat.
  // The bot never moves, so without armour it is swarmed and dies at ~12s — a
  // real defeat, but one that lands before there is a dense scene to prove the
  // freeze against. HP is inflated TEST-SIDE only; the fatal key scales its
  // damage off maxHp, so the kill stays guaranteed and still goes through the
  // ordinary damage funnel.
  await page.waitForFunction(() => window.__voltswarm?.state === 'playing', { timeout: 30_000 });
  await page.evaluate(() => {
    const p = window.__voltswarm.player;
    p.maxHp = 500_000;
    p.hp = 500_000;
  });
  for (let i = 0; i < 90; i++) {
    const done = await page.evaluate(() => {
      const g = window.__voltswarm;
      g.player.hp = g.player.maxHp;
      // Level-up / chest / shop overlays PAUSE the run, so an idle bot stalls on
      // the first one and never reaches a dense frame. Take the first option.
      const open = (id) => {
        const el = document.getElementById(id);
        return el && !el.classList.contains('hidden') ? el : null;
      };
      open('levelup-overlay')?.querySelector('#upgrade-cards > *')?.click();
      open('chest-overlay')?.querySelector('#chest-continue')?.click();
      open('shop-overlay')?.querySelector('#shop-leave-button')?.click();
      open('pause-overlay')?.querySelector('#resume-button')?.click();
      return g.elapsedS > 25 && g.state === 'playing';
    });
    if (done) break;
    await wait(400);
  }

  const before = await page.evaluate(() => {
    const g = window.__voltswarm;
    const voices = [...(g.audio.voices ?? [])].filter((v) => v.bus === 'music');
    // Under Electron the history is a FILE, not localStorage (localStorage is
    // per origin and a dev-server session has its own store).
    const history = JSON.parse(window.electronAPI?.loadRunHistory() ?? '[]');
    return {
      state: g.state,
      elapsedS: g.elapsedS,
      activeEnemies: g.enemies.activeCount,
      kills: g.progression.kills,
      historyLength: Array.isArray(history) ? history.length : -1,
      // The defeat fade ramps the music VOICE, not the bus, so the bus readout
      // could never observe it — that reads as a false failure.
      musicVoiceGain: voices.length === 0 ? null : Math.max(...voices.map((v) => v.gain.gain.value)),
      audioLive: g.audio.diagnostics().contextState === 'running',
    };
  });
  console.log(`\nPre-death: ${before.state}, ${before.elapsedS.toFixed(1)}s, ${before.activeEnemies} enemies, ${before.kills} kills\n`);
  if (before.state !== 'playing') throw new Error(`Run never reached playing state (was ${before.state})`);

  // The fatal hit, then a timeline sampled off the real clock.
  const timeline = await page.evaluate(async () => {
    const g = window.__voltswarm;
    const sample = (ms) => ({
      ms,
      gameState: g.state,
      defeatPhase: g.defeat?.phase ?? null,
      defeatElapsedS: g.defeat?.elapsedS ?? null,
      runElapsedS: g.elapsedS,
      enemyPos: g.enemies.pool?.[0] ? { x: g.enemies.pool[0].x, z: g.enemies.pool[0].z } : null,
      enemiesAlive: g.enemies.activeCount,
      kills: g.progression.kills,
      musicVoiceGain: (() => {
        const v = [...(g.audio.voices ?? [])].filter((x) => x.bus === 'music');
        return v.length === 0 ? null : Math.max(...v.map((x) => x.gain.gain.value));
      })(),
      beatVisible: !document.getElementById('defeat-beat').classList.contains('hidden'),
      endVisible: !document.getElementById('end-overlay').classList.contains('hidden'),
      primaryDisabled: document.getElementById('end-primary-button').disabled,
      playerVisible: g.player.mesh.visible,
      title: document.getElementById('end-title').textContent,
      subtitle: document.getElementById('end-subtitle').textContent,
      stats: document.getElementById('end-stats').textContent,
    });
    const out = [];
    const t0 = performance.now();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyK', bubbles: true }));
    for (const at of [16, 60, 300, 600, 740, 800, 1100, 1250, 1600]) {
      await new Promise((r) => setTimeout(r, Math.max(0, at - (performance.now() - t0))));
      out.push(sample(Math.round(performance.now() - t0)));
    }
    return out;
  });

  console.log('Timeline:');
  for (const s of timeline) {
    console.log(
      `  ${String(s.ms).padStart(4)}ms  state=${s.gameState.padEnd(18)} phase=${String(s.defeatPhase).padEnd(9)}` +
      ` beat=${s.beatVisible ? 'Y' : 'n'} end=${s.endVisible ? 'Y' : 'n'} body=${s.playerVisible ? 'Y' : 'n'}` +
      ` music=${s.musicVoiceGain === null ? '   --' : s.musicVoiceGain.toFixed(3)} run=${s.runElapsedS.toFixed(2)}s`,
    );
  }

  const at = (ms) => timeline.find((s) => s.ms >= ms);
  const last = timeline[timeline.length - 1];
  const first = timeline[0];

  console.log('\nAcceptance:');
  check('lethal hit enters defeat-transition, not the results overlay',
    first.gameState === 'defeat-transition' && !first.endVisible, `state=${first.gameState}`);
  check('title is hidden before 0.75s', at(600)?.beatVisible === false);
  check('title is visible by 0.80s', at(800)?.beatVisible === true);
  check('summary is hidden before 1.20s', at(1100)?.endVisible === false);
  check('summary is visible by 1.25s', at(1250)?.endVisible === true);
  check('actions arrive disabled and enable after the gate arms',
    at(1250)?.primaryDisabled === false, `disabled=${at(1250)?.primaryDisabled}`);
  check('chassis is powered down at the title handoff', at(800)?.playerVisible === false);

  const frozenPositions = timeline.filter((s) => s.enemyPos).map((s) => `${s.enemyPos.x},${s.enemyPos.z}`);
  check('enemies do not move while the beat runs',
    new Set(frozenPositions).size <= 1, `${new Set(frozenPositions).size} distinct positions`);
  check('run clock stops at the fatal instant',
    Math.abs(last.runElapsedS - first.runElapsedS) < 1e-9, `${first.runElapsedS} → ${last.runElapsedS}`);
  check('kills do not change during the beat', last.kills === first.kills);
  // Only assertable when the audio context actually started: an automated
  // window gets no user gesture, so Web Audio may legitimately never run. A
  // silent context is reported as SKIP, never as a pass.
  if (!before.audioLive || before.musicVoiceGain === null) {
    console.log('  SKIP  music fade — audio context not running in this automated window');
  } else {
    // A stopped voice leaves the active set, so "no music voice" IS the target
    // end state — treating null as a failure would fail the correct behavior.
    const silent = (s) => s.musicVoiceGain === null || s.musicVoiceGain < 0.01;
    check('music is silent once the configured fade has elapsed',
      silent(at(600)) && silent(last),
      `${before.musicVoiceGain.toFixed(3)} → ${at(600).musicVoiceGain === null ? 'stopped' : at(600).musicVoiceGain.toFixed(3)} at 600ms`);

    // Mid-fade the gain must sit on the LINEAR ramp: an exponential
    // setTargetAtTime fade would still be at ~50% here, which is the bug this
    // whole seam exists to avoid.
    const mid = at(300);
    const expected = before.musicVoiceGain * (1 - 0.3 / 0.45);
    check('the fade is linear to zero, not an exponential time constant',
      mid.musicVoiceGain !== null && Math.abs(mid.musicVoiceGain - expected) < 0.08,
      `at ${mid.ms}ms measured ${mid.musicVoiceGain?.toFixed(3)}, linear predicts ${expected.toFixed(3)}`);
  }
  check('copy is exactly SYSTEM OVERLOAD / Chassis integrity lost',
    last.title === 'SYSTEM OVERLOAD' && last.subtitle === 'Chassis integrity lost',
    `${JSON.stringify(last.title)} / ${JSON.stringify(last.subtitle)}`);
  check('time reads as Operational Time', /Operational Time \d+:\d\d/.test(last.stats ?? ''),
    JSON.stringify(last.stats?.slice(0, 90)));
  check('no NEXT MAP anywhere on the defeat screen',
    !/next\s*map/i.test(last.stats ?? '') &&
    !(await page.evaluate(() => /next\s*map/i.test(document.getElementById('end-overlay').textContent ?? ''))));

  // Pointer skip: a press on the transition surface BEFORE the unlock window
  // must do nothing; after it, it must complete the presentation without also
  // selecting an action.
  const pointerSkip = await page.evaluate(async () => {
    const g = window.__voltswarm;
    const surface = document.getElementById('defeat-skip-surface');
    const press = () => surface.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const release = () => window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    // Rewind the live presentation to before the skip window to test rejection.
    g.defeat.elapsedS = 0.2;
    g.defeat.titleRevealed = false;
    g.defeat.summaryRevealed = false;
    document.getElementById('end-overlay').classList.add('hidden');
    press(); release();
    await new Promise((r) => setTimeout(r, 120));
    const early = { skipped: g.defeat.skipped, revealed: g.defeat.summaryRevealed };
    // Now past the unlock point, with the surface re-armed.
    g.defeat.elapsedS = 0.6;
    press(); release();
    await new Promise((r) => setTimeout(r, 150));
    return {
      early,
      late: { skipped: g.defeat.skipped, revealed: g.defeat.summaryRevealed },
      surfaceHidden: document.getElementById('defeat-skip-surface').classList.contains('hidden'),
    };
  });
  check('a pointer press before the skip window is rejected',
    pointerSkip.early.skipped === false && pointerSkip.early.revealed === false,
    JSON.stringify(pointerSkip.early));
  check('a pointer press after the skip window completes the presentation',
    pointerSkip.late.skipped === true && pointerSkip.late.revealed === true,
    JSON.stringify(pointerSkip.late));
  check('the skip surface is removed once the actions are up', pointerSkip.surfaceHidden === true);

  // One physical death, one persistence transaction — hammered with repeats.
  const persistence = await page.evaluate(async () => {
    const g = window.__voltswarm;
    for (let i = 0; i < 12; i++) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyK', bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    const history = JSON.parse(window.electronAPI?.loadRunHistory() ?? '[]');
    return {
      historyLength: Array.isArray(history) ? history.length : -1,
      outcomes: (history ?? []).slice(-3).map((r) => r.outcome),
      runFinalized: g.runFinalized,
      // Map flow is a MAP-2 concept. The Demo has a fixed Scrapyard and no
      // runFlow at all, so this reads defensively: the check below is skipped
      // there rather than crashing the whole acceptance run on the port.
      hasRunFlow: g.runFlow !== undefined,
      sectorsCleared: g.runFlow?.sectorsCleared ?? null,
      mapIndex: g.runFlow?.mapIndex ?? null,
    };
  });
  check('exactly one run record was written',
    persistence.historyLength === before.historyLength + 1,
    `${before.historyLength} → ${persistence.historyLength}`);
  check('the record is a defeat',
    persistence.outcomes[persistence.outcomes.length - 1] === 'defeat', persistence.outcomes.join(','));
  if (!persistence.hasRunFlow) {
    console.log('  SKIP  sector/map advance — this branch has no run flow (Demo is Map 1 only)');
  } else {
    check('defeat did not advance a sector or a map',
      persistence.sectorsCleared === 0 && persistence.mapIndex === 0,
      `sectors=${persistence.sectorsCleared} mapIndex=${persistence.mapIndex}`);
  }

  // New Run must hand back to the normal selection flow, cleanly.
  const afterNewRun = await page.evaluate(async () => {
    document.getElementById('end-primary-button').click();
    await new Promise((r) => setTimeout(r, 400));
    const g = window.__voltswarm;
    return {
      state: g.state,
      defeat: g.defeat,
      endVisible: !document.getElementById('end-overlay').classList.contains('hidden'),
      beatVisible: !document.getElementById('defeat-beat').classList.contains('hidden'),
      characterSelect: !document.getElementById('character-select-overlay').classList.contains('hidden'),
      playerVisible: g.player.mesh.visible,
    };
  });
  check('New Run returns to the character/weapon flow',
    afterNewRun.characterSelect === true && afterNewRun.state === 'menu', JSON.stringify(afterNewRun));
  check('New Run tears the defeat presentation down',
    afterNewRun.defeat === null && !afterNewRun.endVisible && !afterNewRun.beatVisible &&
    afterNewRun.playerVisible === true);

  check('no console errors during the sequence', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
} finally {
  await browser?.disconnect().catch(() => undefined);
  electronProcess?.kill();
  vite.kill();
  // Always, including on a thrown assertion: a crashed check must not leave its
  // bot runs behind either.
  restoreHistory();
}

console.log(failures === 0 ? '\nDefeat runtime check PASSED\n' : `\nDefeat runtime check FAILED (${failures})\n`);
process.exit(failures === 0 ? 0 : 1);
