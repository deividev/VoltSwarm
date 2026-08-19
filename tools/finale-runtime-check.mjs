// Runtime acceptance for the Map 2 finale, measured in Electron.
//
// Three of the four things asked of the arrival are only true or false against
// a LIVE map: that the Hazard Marshal lands out of reach, inside the frame, and
// clear of the foundry's props with room to move. None of them can be judged
// from a unit test (there is no camera and no prop layout) and none of them can
// be judged from a screenshot either — "it looked fine" is exactly how a boss
// ends up half inside a pillar on someone else's monitor.
//
// So this drives the real shipping path (Electron on the dev server), jumps to
// the foundry and winds its clock through the release-gated dev key, and READS
// the numbers back out of the running game.
//
// Requires DEV_TOOLS.finaleKey = true in src/config.ts. It says so and exits if
// the flag is off, because a silent no-op would look like a pass.
//
// Usage: node tools/finale-runtime-check.mjs
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { confirmOnlyVisibleCharacterIfPresent, enterMainMenu } from './character-flow.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const OUTPUT = resolve(ROOT, 'tmp/finale-runtime-output');
const USER_DATA = resolve(OUTPUT, 'userdata');
const PORT = 5603;
const CDP_PORT = 9228;
const SEED = 20260819;
/** How many independent arrivals to measure. One is an anecdote: placement is
 *  random, and the constraint that matters is that EVERY roll respects the
 *  rules, not that a lucky one did. */
const ARRIVALS = 5;

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

/** Protects the REAL run history from this bot: Electron writes to its own
 *  AppData folder regardless of --user-data-dir, and `pnpm stats` calibrates
 *  thresholds off those records. A scripted finale is not a played run. */
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
if (!/finaleKey:\s*true/.test(config)) {
  console.error('DEV_TOOLS.finaleKey is false — this check cannot reach the finale.');
  console.error('Set it to true in src/config.ts, run this, then set it back before packaging.');
  process.exit(1);
}

// Read the live tuning table rather than re-typing its numbers here.
const configServer = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
const { FINAL_BOSS, CAMERA } = await configServer.ssrLoadModule('/src/config.ts');
await configServer.close();

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
  // If the shell exported it, the packaged binary runs as plain Node, rejects
  // Chromium flags and exits 9.
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

  await page.evaluateOnNewDocument((s) => {
    let state = s >>> 0;
    Math.random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0x100000000; };
    // An automated window loses focus constantly and pause-on-blur would freeze
    // the very sequence being measured.
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
  // 10s, not the helper's 1s default: on a cold start the character overlay can
  // take longer than a second to appear, and the helper then reports "no
  // character step" and leaves the run stuck on a screen nobody dismissed.
  await confirmOnlyVisibleCharacterIfPresent(page, 10_000);
  try {
    await page.waitForSelector('#draft-cards > *', { visible: true, timeout: 15_000 });
  } catch (error) {
    // A blind timeout here says nothing about WHY the flow stalled, and the
    // start flow has three gates (boot, character, draft) that all look alike
    // from the outside.
    const visible = await page.evaluate(() => ({
      state: window.__voltswarm?.state ?? 'no game',
      overlays: [...document.querySelectorAll('[id$="-overlay"]')]
        .filter((el) => !el.classList.contains('hidden') && el.getClientRects().length > 0)
        .map((el) => el.id),
    }));
    console.error(`Start flow stalled: state=${visible.state} visible overlays=[${visible.overlays.join(', ')}]`);
    throw error;
  }
  await page.click('#draft-cards > *');
  await page.waitForFunction(() => window.__voltswarm?.state === 'playing', { timeout: 30_000 });

  // The bot never moves, so it would be swarmed long before the finale. HP is
  // inflated TEST-SIDE only; nothing in the fight reads it.
  await page.evaluate(() => {
    const p = window.__voltswarm.player;
    p.maxHp = 5_000_000;
    p.hp = 5_000_000;
  });

  /** One tick of bot housekeeping: top the health up and clear whatever overlay
   *  froze the run. Level-up, chest and shop screens PAUSE the game, so an idle
   *  bot stalls on the first one — and every wait below is really a wait for a
   *  clock that only advances while the run is unpaused. */
  const tick = () =>
    page.evaluate(() => {
      const g = window.__voltswarm;
      g.player.hp = g.player.maxHp;
      const open = (id) => {
        const el = document.getElementById(id);
        return el && !el.classList.contains('hidden') ? el : null;
      };
      open('levelup-overlay')?.querySelector('#upgrade-cards > *')?.click();
      open('chest-overlay')?.querySelector('#chest-continue')?.click();
      open('shop-overlay')?.querySelector('#shop-leave-button')?.click();
      open('pause-overlay')?.querySelector('#resume-button')?.click();
    });

  const keepAlive = async (seconds) => {
    for (let i = 0; i < Math.ceil(seconds * 2.5); i++) {
      await tick();
      await wait(400);
    }
  };

  /** Waits for a page-side predicate WHILE keeping the run unpaused. */
  const waitWhilePlaying = async (predicate, label, timeoutMs = 30_000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await tick();
      if (await page.evaluate(predicate)) return;
      await wait(200);
    }
    const why = await page.evaluate(() => {
      const g = window.__voltswarm;
      return {
        state: g?.state ?? 'no game',
        mapIndex: g?.runFlow?.mapIndex ?? null,
        mapElapsedS: Math.round(g?.runFlow?.mapElapsedS ?? -1),
        finaleStarted: g?.runFlow?.finaleStarted ?? null,
        bossAlive: (g?.enemies?.pool ?? []).some((e) => e.active && e.typeIndex === 8),
        enemies: g?.enemies?.activeCount ?? null,
      };
    });
    throw new Error(`Timed out waiting for ${label} — ${JSON.stringify(why)}`);
  };

  // ONE key from Map 1 to the finale: Y crosses the rest of the arc through
  // run-flow's own enterMap and then winds the foundry clock, so the check
  // exercises the same shortcut a developer uses to look at this fight.
  await keepAlive(3);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyY', bubbles: true })));
  // Deliberately NOT waiting for 'playing' here: Y chains the crossing curtain
  // straight into the finale's, so there is exactly one playing frame between
  // them and a 200ms poll would miss it and time out on a working game.
  await waitWhilePlaying(
    () => window.__voltswarm?.runFlow?.mapIndex === 1,
    'the crossing into the foundry',
  );
  await keepAlive(2);
  const inFoundry = await page.evaluate(() => ({
    mapId: window.__voltswarm.currentMap.id,
    props: window.__voltswarm.obstacles.length,
  }));
  console.log(`\nIn ${inFoundry.mapId} with ${inFoundry.props} obstacles on the floor.\n`);
  check('the finale is measured on the foundry, not the scrapyard', inFoundry.mapId === 'megafactory', inFoundry.mapId);
  check('the foundry has its scenery up', inFoundry.props > 20, `${inFoundry.props} obstacles`);

  const arrivals = [];
  for (let attempt = 0; attempt < ARRIVALS; attempt++) {
    // Wind the map clock to its last second: advanceRunFlow issues the real
    // 'start-finale' action on the next frame.
    //
    // Pressed in a retry loop on purpose. The dev key refuses while the run is
    // paused, and a level-up screen can open between two of the bot's own
    // frames — a single blind press silently does nothing perhaps one run in
    // five, which reads as a broken finale rather than a missed keystroke.
    await waitWhilePlaying(
      () => {
        const g = window.__voltswarm;
        if (g.runFlow.finaleStarted || g.boss.status(g.enemies) !== null) return true;
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyY', bubbles: true }));
        return false;
      },
      `the finale trigger on attempt ${attempt + 1}`,
      20_000,
    );
    if (attempt === ARRIVALS - 1) {
      // Proof for human eyes, of the two halves of the beat: the telegraph on
      // the floor, and the body that lands on it.
      await waitWhilePlaying(() => window.__voltswarm?.boss?.state === 'summoning', 'the arrival telegraph', 15_000);
      await page.screenshot({ path: resolve(OUTPUT, 'finale-telegraph.png') });
    }
    await waitWhilePlaying(
      () => window.__voltswarm?.boss?.status(window.__voltswarm.enemies) !== null,
      `arrival ${attempt + 1} of the Hazard Marshal`,
    );
    if (attempt === ARRIVALS - 1) await page.screenshot({ path: resolve(OUTPUT, 'finale-arrival.png') });
    const sample = await page.evaluate(({ offsetY, offsetZ }) => {
      const g = window.__voltswarm;
      const at = g.boss.lastSummonAt;
      const px = g.player.position.x;
      const pz = g.player.position.z;
      const status = g.boss.status(g.enemies);
      const boss = g.enemies.pool.find((e) => e.active && e.typeIndex === 8);
      // The exact projection the placement used. THREE is not global in the
      // page, so Vector3 comes off an existing one.
      //
      // Measured against a SETTLED camera, not the live one: the arrival fires
      // a 0.72-amplitude screen shake, so the live camera is displaced for the
      // next fraction of a second and a sample taken through it reports the
      // shake as a placement error. The clone reproduces the exact rig the
      // placement projected through (player position + the fixed offset).
      const Vector3 = Object.getPrototypeOf(g.player.position).constructor;
      const camera = g.camera.clone();
      camera.position.set(px, offsetY, pz + offsetZ);
      camera.lookAt(px, 0, pz);
      camera.updateMatrixWorld(true);
      const projected = new Vector3(at.x, 0, at.z).project(camera);
      // The body's real on-screen top, and its real height in world units. The
      // frame test is only as honest as the bodyHeight it was given, so the
      // model is asked directly instead of trusting the constant.
      const mesh = g.enemies.meshes?.[8];
      if (mesh?.geometry && !mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const box = mesh?.geometry?.boundingBox ?? null;
      const bodyHeight = box ? (box.max.y - box.min.y) * (boss?.scale ?? 1) : null;
      const bodyHalfWidth = box
        ? (Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2) * (boss?.scale ?? 1)
        : null;
      const corner = (dx, y) => new Vector3(at.x + dx, y, at.z).project(camera);
      const headNdc = bodyHeight === null ? null : corner(0, bodyHeight);
      // Worst corner of the body box, which is what the placement rule checks.
      let worst = { x: 0, y: 0 };
      if (bodyHeight !== null && bodyHalfWidth !== null) {
        for (const dx of [-bodyHalfWidth, 0, bodyHalfWidth]) {
          for (const y of [0, bodyHeight]) {
            const point = corner(dx, y);
            if (Math.abs(point.x) > Math.abs(worst.x)) worst = { ...worst, x: point.x };
            if (Math.abs(point.y) > Math.abs(worst.y)) worst = { ...worst, y: point.y };
          }
        }
      }
      // How close any prop or structure stands to the ARENA CENTRE, which is
      // where the arena reset drops the player and where the fight opens.
      let closestToCentre = Infinity;
      for (const obstacle of g.obstacles) {
        closestToCentre = Math.min(closestToCentre, Math.hypot(obstacle.x, obstacle.z));
      }
      let closestGap = Infinity;
      let closestKind = null;
      for (const obstacle of g.obstacles) {
        const gap = Math.hypot(obstacle.x - at.x, obstacle.z - at.z) - obstacle.radius - (boss?.radius ?? 3.1);
        if (gap < closestGap) {
          closestGap = gap;
          closestKind = `r=${obstacle.radius.toFixed(2)}`;
        }
      }
      return {
        distance: Math.hypot(at.x - px, at.z - pz),
        ndcX: projected.x,
        ndcY: projected.y,
        ndcZ: projected.z,
        headNdcX: headNdc?.x ?? null,
        headNdcY: headNdc?.y ?? null,
        worstNdcX: worst.x,
        worstNdcY: worst.y,
        bodyHeight,
        bodyHalfWidth,
        closestGap,
        closestKind,
        closestToCentre,
        props: g.obstacles.length,
        playerFromCentre: Math.hypot(px, pz),
        bossHp: status?.hp ?? 0,
        phase: status?.phase ?? null,
        phaseCount: status?.phaseCount ?? null,
        name: status?.name ?? null,
        at: { x: at.x, z: at.z },
        // Relative to the player, which is what the framing actually depends
        // on: the camera is anchored to them, not to the arena.
        rel: { x: at.x - px, z: at.z - pz },
      };
    }, { offsetY: CAMERA.offsetY, offsetZ: CAMERA.offsetZ });
    arrivals.push(sample);
    console.log(
      `  arrival ${attempt + 1}: ${sample.name} rel(${sample.rel.x.toFixed(1)}, ${sample.rel.z.toFixed(1)})` +
      ` dist=${sample.distance.toFixed(1)} worstNdc=(${sample.worstNdcX.toFixed(2)}, ${sample.worstNdcY.toFixed(2)})` +
      ` gap=${sample.closestGap.toFixed(2)}`,
    );

    if (attempt < ARRIVALS - 1) {
      // Clear the field and re-arm the finale for the next roll.
      //
      // Deliberately through EnemySystem.damage and not the game's own damage
      // funnel: the real one ends the run on this kill (completeFinale), which
      // would leave exactly one sample — and one sample cannot say anything
      // about a random placement. The pool bookkeeping still runs; only the
      // reward and the ending are skipped, and neither is under test here.
      await page.evaluate(() => {
        const g = window.__voltswarm;
        const index = g.enemies.pool.findIndex((e) => e.active && e.typeIndex === 8);
        if (index >= 0) g.enemies.damage(index, g.enemies.pool[index].hp + 1);
        g.boss.onBossDefeated();
        g.runFlow.finaleStarted = false;
        g.runFlow.mapElapsedS = 0;
      });
      await keepAlive(1);
    }
  }

  console.log('\nAcceptance — arrival:');
  // Thresholds come from the SAME config the game just ran on, loaded through
  // vite so a retuned number can never leave this check asserting the old one.
  const arrivalCfg = FINAL_BOSS.arrival;
  const limit = 1 - arrivalCfg.screenMargin;

  check(
    'every arrival lands out of the player\'s reach',
    arrivals.every((a) => a.distance >= arrivalCfg.distMin - 0.5),
    `min ${Math.min(...arrivals.map((a) => a.distance)).toFixed(1)} vs distMin ${arrivalCfg.distMin}`,
  );
  check(
    'no arrival lands further away than the ring allows',
    arrivals.every((a) => a.distance <= arrivalCfg.distMax + 1),
    `max ${Math.max(...arrivals.map((a) => a.distance)).toFixed(1)} vs distMax ${arrivalCfg.distMax}`,
  );
  check(
    'every arrival fits the frame WHOLE — head, feet and both flanks',
    arrivals.every(
      (a) => a.ndcZ < 1 && Math.abs(a.worstNdcX) <= limit && Math.abs(a.worstNdcY) <= limit,
    ),
    arrivals.map((a) => `worst(${a.worstNdcX.toFixed(2)},${a.worstNdcY.toFixed(2)})`).join(' '),
  );
  // The constants the frame test runs on have to match the model they describe.
  const measuredHeight = Math.max(...arrivals.map((a) => a.bodyHeight ?? 0));
  const measuredHalfWidth = Math.max(...arrivals.map((a) => a.bodyHalfWidth ?? 0));
  check(
    'config body box still covers the real model',
    measuredHeight > 0 &&
      arrivalCfg.bodyHeight >= measuredHeight &&
      arrivalCfg.bodyHalfWidth >= measuredHalfWidth,
    `config ${arrivalCfg.bodyHeight}x${arrivalCfg.bodyHalfWidth} vs measured ` +
      `${measuredHeight.toFixed(2)}x${measuredHalfWidth.toFixed(2)}`,
  );
  check(
    'the arena reset empties the middle of the map',
    arrivals.every((a) => a.closestToCentre >= FINAL_BOSS.arena.clearRadius - 0.5),
    `nearest obstacle to centre ${Math.min(...arrivals.map((a) => a.closestToCentre)).toFixed(1)} vs clearRadius ${FINAL_BOSS.arena.clearRadius}`,
  );
  check(
    'the reset keeps the scenery instead of deleting it',
    arrivals.every((a) => a.props > 40),
    `${Math.min(...arrivals.map((a) => a.props))} obstacles still standing`,
  );
  check(
    'the fight opens from the centre of the arena',
    arrivals.every((a) => a.playerFromCentre < 2),
    `player ${Math.max(...arrivals.map((a) => a.playerFromCentre)).toFixed(1)} from centre`,
  );
  check(
    'no arrival lands inside a prop',
    arrivals.every((a) => a.closestGap > 0),
    `tightest gap ${Math.min(...arrivals.map((a) => a.closestGap)).toFixed(2)}`,
  );
  check(
    'every arrival has room to move around it',
    arrivals.every((a) => a.closestGap >= arrivalCfg.clearance * 0.9),
    `tightest ${Math.min(...arrivals.map((a) => a.closestGap)).toFixed(2)} vs clearance ${arrivalCfg.clearance}`,
  );
  check(
    'the boss bar reports the Hazard Marshal in phase 1 of 3',
    arrivals.every((a) => a.name === 'Hazard Marshal' && a.phase === 1 && a.phaseCount === 3),
    `${arrivals[0]?.name} phase ${arrivals[0]?.phase}/${arrivals[0]?.phaseCount}`,
  );

  // No ambient waves during the finale. Measured over real seconds rather than
  // asserted off the flag: the flag being set proves nothing about whether the
  // spawner honours it, and the arena reset only means something if the floor
  // STAYS clear.
  console.log('\nAcceptance — the arena stays the boss\'s:');
  const waveWatch = [];
  for (let i = 0; i < 20; i++) {
    await tick();
    waveWatch.push(await page.evaluate(() => window.__voltswarm.enemies.activeCount));
    await wait(500);
  }
  const peak = Math.max(...waveWatch);
  console.log(`  live bodies over 10s: ${waveWatch.join(' ')}`);
  check(
    'no ambient wave joins the fight',
    // 1 is the Marshal itself. Phase 1 calls no reinforcements, so anything
    // beyond a couple of bodies is the spawner ignoring the pause.
    peak <= 3,
    `peaked at ${peak} live bodies`,
  );

  // Phases, on the live boss: drop its HP through each threshold and read the
  // bar back. This is the escalation a player sees, not an internal counter.
  console.log('\nAcceptance — phases:');
  // Collected from Node, one step at a time, with the bot housekeeping running
  // between samples: a level-up overlay PAUSES the game, and a paused game
  // never reaches the phase check — which would read as a broken fight.
  await page.evaluate(() => {
    window.__finaleBanners = [];
    const text = document.getElementById('event-banner-text');
    if (!text) return;
    new MutationObserver(() => {
      const value = text.textContent?.trim();
      if (value && !window.__finaleBanners.includes(value)) window.__finaleBanners.push(value);
    }).observe(text, { childList: true, characterData: true, subtree: true });
  });
  const seen = [];
  for (const fraction of [0.9, 0.6, 0.3]) {
    await page.evaluate((f) => {
      const g = window.__voltswarm;
      const boss = g.enemies.pool.find((e) => e.active && e.typeIndex === 8);
      if (boss) boss.hp = boss.maxHp * f;
    }, fraction);
    for (let i = 0; i < 6; i++) {
      await tick();
      await wait(180);
    }
    seen.push(
      await page.evaluate((f) => {
        const g = window.__voltswarm;
        const boss = g.enemies.pool.find((e) => e.active && e.typeIndex === 8);
        return { fraction: f, phase: g.boss.status(g.enemies)?.phase ?? null, speed: boss?.speed ?? -1 };
      }, fraction),
    );
  }
  const phases = await page.evaluate((collected) => ({
    seen: collected,
    banners: window.__finaleBanners ?? [],
    phaseLabel: document.getElementById('boss-phase')?.textContent ?? null,
  }), seen);
  for (const step of phases.seen) {
    console.log(`  hp ${Math.round(step.fraction * 100)}%  ->  phase ${step.phase}  (speed ${step.speed.toFixed(2)})`);
  }
  check('the fight escalates through all three phases by LIFE',
    phases.seen.map((s) => s.phase).join(',') === '1,2,3', phases.seen.map((s) => s.phase).join(','));
  check('each phase change announces itself',
    phases.banners.some((b) => b.includes('ASSEMBLY')) && phases.banners.some((b) => b.includes('OVERLOAD')),
    phases.banners.join(' | '));
  check('the HUD shows the live phase', phases.phaseLabel === 'PHASE 3/3', String(phases.phaseLabel));

  // Frames of the two telegraphs, for human eyes. Both are readability claims —
  // "the wedge points where it hits", "the chain marches outward" — and the
  // numbers above cannot show whether they READ, only whether they exist.
  const sweepLit = await waitWhilePlaying(
    () => window.__voltswarm.boss.finalFight?.wedge?.visible === true,
    'a sector sweep telegraph',
    30_000,
  ).then(() => true, () => false);
  if (sweepLit) await page.screenshot({ path: resolve(OUTPUT, 'finale-sweep.png') });
  check('a sector sweep telegraph appears within 30s of watching', sweepLit);

  const zoneLit = await waitWhilePlaying(
    () => (window.__voltswarm.boss.finalFight?.markerPool ?? []).some((m) => m.mesh.visible),
    'a core-overload zone chain',
    30_000,
  ).then(() => true, () => false);
  if (zoneLit) await page.screenshot({ path: resolve(OUTPUT, 'finale-overload.png') });
  check('a hazard zone chain appears within 30s of watching', zoneLit);

  await page.screenshot({ path: resolve(OUTPUT, 'finale-phase-3.png') });
  console.log(`\nFrames written to ${OUTPUT}`);

  check('no console errors during the finale', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
} finally {
  await browser?.disconnect().catch(() => undefined);
  electronProcess?.kill();
  vite.kill();
  restoreHistory();
}

console.log(failures === 0 ? '\nFinale runtime check PASSED\n' : `\nFinale runtime check FAILED (${failures})\n`);
process.exit(failures === 0 ? 0 : 1);
