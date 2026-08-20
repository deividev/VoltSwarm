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
/** `--pressure` adds the damage probe below and drops to one arrival: the probe
 *  costs 90 seconds of real fighting and placement is not what it measures. */
const PRESSURE = process.argv.includes('--pressure');
/** Circling keeps the bot moving the way a player kites — the case where the
 *  first playtest reported taking zero damage. */
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
const { FINAL_BOSS, FINAL_BOSS_TYPE_INDEX, CAMERA } = await configServer.ssrLoadModule('/src/config.ts');
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
  // inflated TEST-SIDE only — but as of 2026-08-19 the fight DOES read max HP:
  // every Marshal attack asks for a percentage of it. Inflating it without
  // saying so scaled the boss's damage by 50,000x and one sweep emptied a pool
  // meant to survive the whole fight, which reads in the output as "its ranged
  // kit never lands" rather than as a broken instrument. So the real baseline
  // is captured first and handed back through the fight's own hook.
  await page.evaluate(() => {
    const g = window.__voltswarm;
    const p = g.player;
    g.__probeBaselineHp = p.maxHp;
    p.maxHp = 5_000_000;
    p.hp = 5_000_000;
    if (g.boss?.effects) g.boss.effects.playerMaxHp = () => g.__probeBaselineHp;
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
      // LONG TASKS around the arrival. The player reports a hitch exactly when
      // the boss appears; a stall is invisible to every other check here and
      // indistinguishable from "the game is heavy" by eye.
      await page.evaluate(() => {
        const g = window.__voltswarm;
        g.__longTasks = [];
        if (g.__longTaskObserver) return;
        try {
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              g.__longTasks.push({
                ms: Math.round(entry.duration),
                at: entry.startTime,
                state: g.state,
                bossAlive: g.enemies.pool.some((e) => e.active && e.typeIndex === 8),
              });
            }
          });
          observer.observe({ entryTypes: ['longtask'] });
          g.__longTaskObserver = observer;
        } catch { /* longtask unsupported: reported as no samples below */ }
      });
      // Every sound the director accepts from here on, timestamped against the
      // frame the boss body actually exists. The player reports hearing their
      // weapons fire before the Marshal has finished appearing, and "before" is
      // not something ears can be trusted about across a 2.5s telegraph.
      await page.evaluate(() => {
        const g = window.__voltswarm;
        g.__audioLog = [];
        if (g.__audioPatched) return;
        const original = g.audio.emit.bind(g.audio);
        g.audio.emit = (event) => {
          g.__audioLog.push({
            id: event.id,
            t: performance.now(),
            bossAlive: g.enemies.pool.some((e) => e.active && e.typeIndex === 8),
          });
          return original(event);
        };
        const originalPlay = g.audio.play.bind(g.audio);
        g.__plays = [];
        g.audio.play = async (event, token) => {
          const before = {
            voices: g.audio.voices.size,
            drops: g.audio.drops,
            fails: g.audio.loadFailures,
          };
          const result = await originalPlay(event, token);
          g.__plays.push({
            id: event.id,
            dv: g.audio.voices.size - before.voices,
            dDrops: g.audio.drops - before.drops,
            dFails: g.audio.loadFailures - before.fails,
            ctx: g.audio.context?.state ?? 'none',
          });
          return result;
        };
        g.__audioPatched = true;
      });
      // The curtain's title, captured while it is up: it names the event the
      // player is walking into, so a wrong or clipped one is a real defect.
      // Wait for the curtain to reach full black: that is when the label plays,
      // and a shot taken a moment later catches the map with no title on it.
      for (let i = 0; i < 40; i++) {
        const dark = await page.evaluate(() => {
          const fade = document.getElementById('map-fade');
          return !!fade && !fade.classList.contains('hidden') && Number(fade.style.opacity) >= 0.85;
        });
        if (dark) break;
        await wait(50);
      }
      const title = await page.evaluate(() => {
        const el = document.getElementById('map-fade-label');
        const fade = document.getElementById('map-fade');
        return {
          text: el?.textContent ?? null,
          visible: !!fade && !fade.classList.contains('hidden'),
          // Overflow is how the last banner ran off both edges of the frame.
          overflows: !!el && el.scrollWidth > (el.clientWidth || el.scrollWidth),
        };
      });
      check(
        'the finale curtain announces the boss phase',
        title.text === 'FINAL BOSS PHASE' && !title.overflows,
        `"${title.text}"${title.overflows ? ' (overflows)' : ''}`,
      );
      if (title.visible) await page.screenshot({ path: resolve(OUTPUT, 'finale-title.png') });
      // Proof for human eyes, of the two halves of the beat: the telegraph on
      // the floor, and the body that lands on it.
      await waitWhilePlaying(() => window.__voltswarm?.boss?.state === 'summoning', 'the arrival telegraph', 15_000);
      await page.screenshot({ path: resolve(OUTPUT, 'finale-telegraph.png') });

      // HOLD FIRE (user 2026-08-20): the arena is empty and the waves are
      // paused, so anything the player owns that fires here is firing at
      // nothing, over the entrance. Counted as VOICES across the telegraph —
      // the whole telegraph, not a sample of it — because a weapon that fires
      // once in 2.5s is exactly the failure this is meant to catch.
      const weaponVoices = await page.evaluate(async () => {
        const g = window.__voltswarm;
        const isWeapon = (id) =>
          // The music bed is a loop too, and it is supposed to be playing.
          !/music|foundation/.test(id) &&
          (id === 'weapon-activation' ||
            /-(fire|slam|throw|spin|launch|swipe|beam|loop)$/.test(id) ||
            id === 'bolt-cannon-fire' ||
            id === 'oil-drop');
        const count = () => (g.__plays ?? []).filter((p) => p.dv > 0 && isWeapon(p.id)).length;
        const before = count();
        const seen = new Set((g.__plays ?? []).map((p, i) => i));
        const heard = new Set();
        const liveKeys = new Set();
        let maxExistingGain = 0;
        let during = 0;
        // Watch until the body lands, and SNAPSHOT INSIDE the window. Counting
        // after the loop exits caught the salvo the weapons are owed the moment
        // the hold lifts — the fight opening, not a weapon firing over the
        // entrance — and reported the feature working as the feature broken.
        while (g.boss.finalArrivalPending) {
          during = count() - before;
          (g.__plays ?? []).forEach((play, index) => {
            if (!seen.has(index) && play.dv > 0 && isWeapon(play.id)) heard.add(play.id);
          });
          for (const voice of g.audio.voices) {
            if (!voice.loop || voice.bus !== 'sfx' || !voice.key?.startsWith('weapon-loop-')) continue;
            liveKeys.add(voice.key);
            maxExistingGain = Math.max(maxExistingGain, voice.gain.gain.value);
          }
          await new Promise((resolve) => setTimeout(resolve, 16));
        }
        return {
          during,
          ids: [...heard],
          liveKeys: [...liveKeys],
          maxExistingGain,
        };
      });
      check(
        'nothing the player owns fires over the arrival',
        weaponVoices.during === 0 && weaponVoices.liveKeys.length === 0 && weaponVoices.maxExistingGain <= 0.001,
        `${weaponVoices.during} weapon voices during the telegraph` +
          `${weaponVoices.ids.length ? ` (${weaponVoices.ids.join(', ')})` : ''}` +
          `${weaponVoices.liveKeys.length ? `; existing loops: ${weaponVoices.liveKeys.join(', ')}` : ''}` +
          `; max existing gain ${weaponVoices.maxExistingGain.toFixed(4)}`,
      );
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
      // Per axis, because a circular collider on a body that is wider than it is
      // deep sticks out past the model on the narrow axis — which reads in play
      // as being hit before touching it.
      const halfX = box ? ((box.max.x - box.min.x) / 2) * (boss?.scale ?? 1) : null;
      const halfZ = box ? ((box.max.z - box.min.z) / 2) * (boss?.scale ?? 1) : null;
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
        halfX,
        halfZ,
        colliderRadius: boss?.radius ?? null,
        contactRadius: boss?.contactRadius ?? null,
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
  // The collider against the model it is supposed to represent. A circle bigger
  // than the body on any axis is felt as damage from thin air.
  const shape = arrivals[0];
  if (shape?.halfX != null && shape?.halfZ != null && shape?.contactRadius != null) {
    console.log(
      `  body half-extents: x ${shape.halfX.toFixed(2)}  z ${shape.halfZ.toFixed(2)}` +
      `  contact radius ${shape.contactRadius.toFixed(2)} (steering ${shape.colliderRadius?.toFixed(2)})`,
    );
    // A circle cannot match a body 6.5 wide and 2.7 deep, so the rule is not
    // "fits" but "is never far wrong": at most one unit of reach past the model
    // on its narrow axis, and never wider than the model itself. The number
    // that failed this in play was 3.10 against a 1.33 half-depth — 1.77 units
    // of thin air in front of its face.
    const overhang = shape.contactRadius - Math.min(shape.halfX, shape.halfZ);
    check(
      'the contact radius is never far outside the model',
      overhang <= 1 && shape.contactRadius <= Math.max(shape.halfX, shape.halfZ),
      `overhangs the narrow axis by ${overhang.toFixed(2)}`,
    );
  }
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

  // What was audible while the arena was empty and the Marshal was still
  // arriving. Weapons that do not need a target (orbitals, radial pulses) fire
  // on their own cooldown, so this separates "the game is broken" from "the
  // arena is empty and your build never stops".
  console.log('\nAcceptance — what plays before the boss exists:');
  const audioLog = await page.evaluate(() => window.__voltswarm.__audioLog ?? []);
  const beforeBoss = audioLog.filter((entry) => !entry.bossAlive);
  const counts = new Map();
  for (const entry of beforeBoss) counts.set(entry.id, (counts.get(entry.id) ?? 0) + 1);
  const listed = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `${id} x${n}`);
  console.log(`  ${beforeBoss.length} cues before the body existed: ${listed.join(', ') || 'none'}`);

  const stallReport = await page.evaluate(() => {
    const g = window.__voltswarm;
    const tasks = g.__longTasks ?? [];
    // The boss becoming a body is the frame `boss-awaken` is emitted, so that
    // timestamp is the anchor. Attributing by "sometime during this section"
    // blamed the arrival for the bot's own level-up screens, which rebuild a
    // large DOM panel and stall just as hard.
    const awaken = (g.__audioLog ?? []).find((entry) => entry.id === 'boss-awaken');
    const anchor = awaken?.t ?? null;
    return {
      total: tasks.length,
      worst: tasks.reduce((max, t) => Math.max(max, t.ms), 0),
      nearSpawn: anchor === null ? [] : tasks.filter((t) => Math.abs(t.at - anchor) <= 700).map((t) => t.ms),
      anchored: anchor !== null,
    };
  });
  console.log(
    `
  long tasks in the section: ${stallReport.total} (worst ${stallReport.worst}ms)` +
    `  |  within 0.7s of the boss appearing: ${stallReport.nearSpawn.join(', ') || 'none'}`,
  );
  // One dropped frame is 8.3ms at this refresh rate, so a 50ms task is six in a
  // row — exactly the "microcorte" the player described. Only the ones AT the
  // spawn are this check's business; the rest belong to whatever caused them.
  const worstNearSpawn = stallReport.nearSpawn.reduce((max, ms) => Math.max(max, ms), 0);
  check(
    'the arrival itself does not stall the frame',
    stallReport.anchored && worstNearSpawn < 50,
    stallReport.anchored ? `worst ${worstNearSpawn}ms at the spawn` : 'no spawn anchor recorded',
  );

  // The part rig: is the Marshal actually drawn by it, and does it MOVE?
  // "The walk animation is not applied" is invisible to every check above —
  // a frozen rig and a live one render identically in a still frame.
  console.log('\nAcceptance — the animated rig:');
  const rigState = await page.evaluate(async () => {
    const g = window.__voltswarm;
    const rig = g.boss.finalRig?.rig ?? null;
    if (!rig) return { ready: false };
    const read = () => ({
      leg: rig.parts.legL?.pivot.rotation.x ?? 0,
      arm: rig.parts.armR?.pivot.rotation.x ?? 0,
      torso: rig.parts.torso?.pivot.rotation.y ?? 0,
    });
    const before = read();
    await new Promise((resolve) => setTimeout(resolve, 400));
    const after = read();
    return {
      ready: true,
      parts: Object.keys(rig.parts).length,
      // The instanced copy must be hidden, or the boss is drawn twice.
      instancedHidden: g.enemies.externallyDrawn !== null,
      moved:
        Math.abs(after.leg - before.leg) +
        Math.abs(after.arm - before.arm) +
        Math.abs(after.torso - before.torso),
    };
  });
  check('the Marshal is drawn by its part rig', rigState.ready === true, `${rigState.parts ?? 0} parts`);
  check('its instanced body is hidden while the rig draws', rigState.instancedHidden === true);
  check(
    'the rig is animating, not frozen',
    (rigState.moved ?? 0) > 0.001,
    `joints moved ${(rigState.moved ?? 0).toFixed(4)} rad in 0.4s`,
  );
  await page.screenshot({ path: resolve(OUTPUT, 'finale-rig.png') });

  // SWEEP FORENSICS: the player reports standing inside the amber wedge when it
  // fires and taking nothing. The wedge is DRAWN by one piece of code and TESTED
  // by another, so the only way to tell "it missed" from "it hit and the hit was
  // dropped" is to record both at the exact frame it discharges.
  console.log('\nAcceptance — the sector sweep:');
  const patched = await page.evaluate(() => {
    const g = window.__voltswarm;
    const fight = g.boss.finalFight;
    g.__sweeps = [];
    if (!fight) return 'no fight object';
    if (typeof fight.tickSweep !== 'function') return 'tickSweep is not reachable';
    if (fight.__sweepPatched) return 'ok';
    const original = fight.tickSweep.bind(fight);
    fight.tickSweep = (dt, boss, px, pz, busy, effects) => {
      const before = fight.sweepPhase;
      let asked = false;
      let askedAmount = 0;
      const wrapped = {
        ...effects,
        damagePlayer: (amount) => {
          asked = true;
          askedAmount = amount;
          effects.damagePlayer(amount);
        },
      };
      original(dt, boss, px, pz, busy, wrapped);
      // telegraph -> cooldown IS the discharge frame.
      if (before === 'telegraph' && fight.sweepPhase === 'cooldown') {
        const toX = px - boss.x;
        const toZ = pz - boss.z;
        const distance = Math.hypot(toX, toZ);
        const cos = distance > 0 ? (toX * fight.sweepAimX + toZ * fight.sweepAimZ) / distance : 1;
        g.__sweeps.push({
          distance,
          offAimDeg: (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI,
          // What the marker on the floor was showing at that instant.
          drawnRotation: fight.wedge.rotation.y,
          aimRotation: Math.atan2(-fight.sweepAimZ, fight.sweepAimX),
          asked,
          // The percentage is of MAX HP, never of what is left in the bar
          // (user 2026-08-20). Both are recorded at the damage frame so the
          // check below can tell them apart instead of taking the code's word.
          askedAmount,
          playerHp: g.player.hp,
          // The max the FIGHT is told about. The harness inflates the bot's
          // real max HP to survive a whole fight and hands the true baseline
          // back through playerMaxHp(), so comparing against g.player.maxHp
          // here would measure the harness, not the game.
          basisHp: g.__probeBaselineHp ?? g.player.maxHp,
          // The explosion outlives the damage frame, so this must be running.
          blastStarted: fight.blastS !== null,
        });
      }
    };
    fight.__sweepPatched = true;
    return 'ok';
  });
  check('the sweep can be observed at all', patched === 'ok', String(patched));
  // Stand still, close in front of it, and let several sweeps discharge — on a
  // bar deliberately held at a THIRD of full. The housekeeping tops the bot up
  // to max between samples, so without this every discharge would be measured
  // at full health and could not tell a share of max HP from a share of what is
  // left: at full health the two are the same number.
  for (let i = 0; i < 90; i++) {
    await tick();
    await page.evaluate(() => {
      const g = window.__voltswarm;
      g.player.hp = Math.max(1, Math.round(g.player.maxHp / 3));
    });
    await wait(400);
    const done = await page.evaluate(() => (window.__voltswarm.__sweeps ?? []).length >= 3);
    if (done) break;
  }
  const sweeps = await page.evaluate(() => window.__voltswarm.__sweeps ?? []);
  if (sweeps.length === 0) {
    // Nothing discharged: show what the fight was doing instead, or the failure
    // above is just as blind as the bug report it is chasing.
    const trace = [];
    for (let i = 0; i < 12; i++) {
      trace.push(
        await page.evaluate(() => {
          const f = window.__voltswarm.boss.finalFight;
          return `${f.sweepPhase}/${f.sweepTimer.toFixed(1)} disch:${f.dischargePhase}/${f.dischargeTimer.toFixed(1)}` +
            ` bays:${f.bays.length} zones:${f.zones.length} stagger:${f.staggerS.toFixed(1)} asm:${f.assemblyTimer.toFixed(1)}`;
        }),
      );
      await tick();
      await wait(500);
    }
    console.log('  fight state over 6s:');
    for (const line of trace) console.log(`    ${line}`);
  }
  for (const s of sweeps) {
    console.log(
      `  discharge: player ${s.distance.toFixed(1)} away, ${s.offAimDeg.toFixed(0)} deg off the aim` +
      `  drawn ${s.drawnRotation.toFixed(3)} vs aim ${s.aimRotation.toFixed(3)}` +
      `  -> ${s.asked ? 'DAMAGE' : 'no damage'}`,
    );
  }
  // The three cues, and the explosion that outlives the damage frame. Both are
  // things a still frame cannot show: a silent event and a loud one look the
  // same, and so do a marker that switches off and one that blows up.
  // ACCEPTED IS NOT AUDIBLE. `lastEvent` is stamped before the director has a
  // decoded buffer, a free voice or a running context, so an id can be "played"
  // by that measure and produce silence — which is exactly what the player
  // reported after the last check passed on it. This walks the whole chain:
  // the asset decodes, and a voice actually starts.
  const chain = await page.evaluate(async () => {
    const g = window.__voltswarm;
    const ids = ['boss-sweep-charge', 'boss-sweep-warn', 'boss-sweep-fire'];
    const decode = {};
    for (const id of ids) {
      const path = g.audio.manifest?.events?.[id]?.[0]?.runtime?.path ?? null;
      if (!path) { decode[id] = 'not in manifest'; continue; }
      try {
        const response = await fetch(path);
        if (!response.ok) { decode[id] = `http ${response.status}`; continue; }
        const bytes = await response.arrayBuffer();
        const buffer = await g.audio.context.decodeAudioData(bytes.slice(0));
        decode[id] = `ok ${buffer.duration.toFixed(2)}s`;
      } catch (error) {
        decode[id] = `decode failed: ${String(error).slice(0, 60)}`;
      }
    }
    return {
      decode,
      plays: g.__plays ?? [],
      diagnostics: g.audio.diagnostics(),
      caps: { voices: g.audio.voices.size },
    };
  });
  for (const [id, state] of Object.entries(chain.decode)) console.log(`  asset ${id}: ${state}`);
  // Only the STARTED count is attributable per call. `play()` is async, so any
  // other emit that lands during its awaits moves the director's global drop
  // counter — reading that delta as "this cue was dropped" is a race, and it
  // reported exactly that on cues the cap never touched (peak 5 against a cap
  // of 14, zero steals). Global health is read globally, below.
  const started = new Map();
  for (const play of chain.plays) {
    if (play.dv > 0) started.set(play.id, (started.get(play.id) ?? 0) + 1);
  }
  for (const [id, count] of started) console.log(`  voices ${id}: started ${count}`);
  console.log(`  director: ${JSON.stringify(chain.diagnostics)}`);
  check(
    'the voice cap is not the constraint during the fight',
    chain.diagnostics.peakActiveVoices < 14 && chain.diagnostics.steals === 0,
    `peak ${chain.diagnostics.peakActiveVoices}/14 voices, ${chain.diagnostics.steals} steals`,
  );
  const heard = ['boss-sweep-charge', 'boss-sweep-warn', 'boss-sweep-fire'].filter(
    (id) => (started.get(id) ?? 0) > 0,
  );
  check(
    'all three sweep cues started a real voice',
    heard.length === 3,
    `voiced: ${heard.join(', ') || 'none'}`,
  );
  check(
    'the discharge starts a travelling blast, it does not just switch off',
    sweeps.length > 0 && sweeps.every((s) => s.blastStarted),
  );

  const insideSweeps = sweeps.filter(
    (s) => s.distance <= FINAL_BOSS.sweep.radius && s.offAimDeg <= FINAL_BOSS.sweep.halfAngleDeg,
  );
  // An empty sample is a FAILURE, not a pass: "it never hit me" and "it never
  // fired" are the same experience and completely different bugs.
  check('the sweep fires often enough to be part of the fight', sweeps.length >= 2, `${sweeps.length} discharges in 36s`);
  check(
    'the marker drawn matches the arc tested',
    sweeps.length > 0 && sweeps.every((s) => Math.abs(s.drawnRotation - s.aimRotation) < 1e-6),
  );
  // MAX HP, not current. Measured at the discharge frame: the amount asked has
  // to match the full bar times the fraction even when the bar is half empty —
  // a percentage of what is LEFT would make the boss weaker the closer it got
  // to killing you, which is the opposite of a finale.
  const damaging = sweeps.filter((s) => s.asked);
  const pct = FINAL_BOSS.sweep.damagePct;
  const share = (base) => Math.max(1, Math.round(base * pct));
  const wrongBase = damaging.filter((s) => s.askedAmount !== share(s.basisHp));
  // The two answers must be different numbers, or the check proves nothing: at
  // full health a share of max and a share of what is left are identical.
  const discriminating = damaging.filter((s) => share(s.playerHp) !== share(s.basisHp));
  check(
    'the sweep asks for a share of MAX hp, not of the hp left',
    damaging.length > 0 && discriminating.length === damaging.length && wrongBase.length === 0,
    damaging.length === 0
      ? 'no damaging discharge was recorded'
      : `${damaging.length} discharges: asked ${damaging[0].askedAmount}` +
        ` = ${Math.round(pct * 100)}% of max ${damaging[0].basisHp}` +
        `, not ${share(damaging[0].playerHp)} (${Math.round(pct * 100)}% of the` +
        ` ${Math.round(damaging[0].playerHp)} left)`,
  );
  check(
    'a player inside the wedge is damaged by it',
    insideSweeps.length > 0 && insideSweeps.every((s) => s.asked),
    `${insideSweeps.filter((s) => s.asked).length}/${insideSweeps.length} discharges with the player inside dealt damage`,
  );

  // PRESSURE PROBE (--pressure): can the Marshal land a hit at all?
  //
  // Exists because the first playtest reported zero damage taken across a whole
  // fight. That is not a number any acceptance check above can see: they all
  // pin the bot's health, and a fight that cannot connect looks identical to one
  // that can. So this stops healing, plays the fight twice — once standing
  // still, once orbiting the way a real player kites — and counts the hits.
  if (PRESSURE) {
    console.log('\nPressure probe — can the Marshal connect?');
    const probe = async (label, kite, seconds, stepMs = KITE_STEP_MS) => {
      await page.evaluate(() => {
        const g = window.__voltswarm;
        g.player.maxHp = 5_000_000;
        g.player.hp = 5_000_000;
        // Attribute every hit by the distance to the boss when it landed.
        // "The boss never touches me" and "only its body touches me" look the
        // same in a health bar and mean opposite things.
        g.__hits = [];
        // Separately: what the FIGHT asks for (sweep, hazard zones) versus what
        // actually lands. The two diverge silently — damagePlayer drops the hit
        // whole while an i-frame from any other source is open — and that is
        // indistinguishable in play from an attack that does no damage at all.
        g.__attackDamage = {
          requested: 0,
          landed: 0,
          swallowedByIframe: 0,
          blockedByShield: 0,
          evaded: 0,
          unexplained: 0,
        };
        // And the ranged kit separately, counted where a shot CONNECTS rather
        // than where the health bar moves. Measured 2026-08-19: with the swarm
        // touching the player 100 times in 40s the i-frame is open almost
        // permanently, so counting lost HP made a working volley read as a dead
        // one on some runs and a live one on others. No Gunner exists during the
        // finale — ambient waves are paused — so every shot here is the boss's.
        g.__shotHits = 0;
        g.__absorbedSamples = [];
        if (!g.__patchedEffects && g.boss.effects) {
          const effects = g.boss.effects;
          // Belt and braces: the fight asks for a percentage of a REAL player's
          // max HP, never of the inflated test pool (see the capture at start).
          effects.playerMaxHp = () => g.__probeBaselineHp;
          const originalDamage = effects.damagePlayer;
          effects.damagePlayer = (amount) => {
            const stat = g.__attackDamage;
            const before = g.player.hp;
            const invulnerable = g.player.invulnerable;
            // Every hit routed through here pierces the i-frame, so an absorbed
            // one CANNOT be blamed on it — the funnel says MISS (evasion) or
            // BLOCK (shield) on the player, and that label is the measurement.
            // Guessing from `invulnerable` reported evasion rolls as i-frames.
            g.__lastFunnelLabel = null;
            const shieldBefore = g.shieldCur ?? 0;
            stat.requested++;
            originalDamage(amount);
            const label = g.__lastFunnelLabel;
            if (g.player.hp < before) stat.landed++;
            else if (label === 'BLOCK' || (g.shieldCur ?? 0) < shieldBefore) stat.blockedByShield++;
            else if (label === 'MISS') stat.evaded++;
            else if (invulnerable) stat.swallowedByIframe++;
            else stat.unexplained++;
            if (g.player.hp >= before) {
              (g.__absorbedSamples ??= []).push({
                amount,
                invulnBefore: invulnerable,
                invulnAfter: g.player.invulnerable,
                label,
                shieldBefore,
                shieldAfter: g.shieldCur ?? 0,
                finaleVictory: g.finaleVictory ?? null,
                phase: g.phaseS ?? null,
              });
            }
          };
          g.__patchedEffects = true;
        }
        if (!g.__patchedNumbers && g.damageNumbers) {
          const numbers = g.damageNumbers;
          const originalShow = numbers.show.bind(numbers);
          numbers.show = (x, z, text, ...rest) => {
            g.__lastFunnelLabel = text;
            return originalShow(x, z, text, ...rest);
          };
          g.__patchedNumbers = true;
        }
        if (!g.__patchedShots && g.enemyShots) {
          const shots = g.enemyShots;
          const originalUpdate = shots.update.bind(shots);
          shots.update = (dt, px, pz, radius, obstacles, onHitPlayer, onImpact) =>
            originalUpdate(
              dt,
              px,
              pz,
              radius,
              obstacles,
              (damage) => {
                g.__shotHits++;
                return onHitPlayer(damage);
              },
              onImpact,
            );
          g.__patchedShots = true;
        }
        if (!g.__patchedDamage) {
          const original = g.damagePlayer.bind(g);
        // EVERY argument is forwarded. MEASURED 2026-08-19: this wrapper used
        // to take (amount, attacker) and dropped the third one, `pierceIframe`
        // — so the instrument itself turned every telegraphed boss attack back
        // into a hit the contact i-frame could eat, and then reported the fight
        // as unable to land them. The probe must not change what it measures.
          g.damagePlayer = (...args) => {
            const [amount] = args;
            const before = g.player.hp;
            const body = g.enemies.pool.find((e) => e.active && e.typeIndex === 8);
            const distance = body
              ? Math.hypot(body.x - g.player.position.x, body.z - g.player.position.z)
              : -1;
            const result = original(...args);
            if (g.player.hp < before) g.__hits.push({ distance, amount });
            return result;
          };
          g.__patchedDamage = true;
        }
      });
      let held = [];
      const started = Date.now();
      let step = 0;
      while (Date.now() - started < seconds * 1000) {
        // Overlays still get dismissed; health is deliberately NOT topped up.
        await page.evaluate(() => {
          const open = (id) => {
            const el = document.getElementById(id);
            return el && !el.classList.contains('hidden') ? el : null;
          };
          open('levelup-overlay')?.querySelector('#upgrade-cards > *')?.click();
          open('chest-overlay')?.querySelector('#chest-continue')?.click();
          open('shop-overlay')?.querySelector('#shop-leave-button')?.click();
          open('pause-overlay')?.querySelector('#resume-button')?.click();
        });
        if (kite) {
          const next = KITE_CYCLE[step++ % KITE_CYCLE.length];
          for (const key of held) await page.keyboard.up(key).catch(() => undefined);
          for (const key of next) await page.keyboard.down(key).catch(() => undefined);
          held = next;
        }
        await wait(stepMs);
      }
      for (const key of held) await page.keyboard.up(key).catch(() => undefined);
      const result = await page.evaluate(() => {
        const g = window.__voltswarm;
        const hits = g.__hits ?? [];
        const body = g.enemies.pool.find((e) => e.active && e.typeIndex === 8);
        // Anything landed within the two bodies' radii plus a margin is the
        // boss WALKING INTO the player; the rest is its ranged kit doing work.
        const reach = (body?.radius ?? 3.1) + 0.7 + 1.5;
        return {
          lost: g.player.maxHp - g.player.hp,
          phase: g.boss.status(g.enemies)?.phase ?? null,
          hits: hits.length,
          contact: hits.filter((h) => h.distance >= 0 && h.distance <= reach).length,
          shotHits: g.__shotHits ?? 0,
          absorbedSamples: (g.__absorbedSamples ?? []).slice(0, 3),
          attacks: {
            requested: 0,
            landed: 0,
            swallowedByIframe: 0,
            blockedByShield: 0,
            evaded: 0,
            unexplained: 0,
            ...(g.__attackDamage ?? {}),
          },
        };
      });
      const ranged = result.hits - result.contact;
      const a = result.attacks;
      console.log(
        `  ${label.padEnd(20)} ${String(Math.round(result.lost)).padStart(5)} HP over ${seconds}s` +
        `  hits ${String(result.hits).padStart(3)}  (contact ${result.contact}, ranged ${ranged})` +
        `  volley: ${result.shotHits} shots connected` +
        `  sweep/zone: ${a.requested} asked, ${a.landed} landed,` +
        ` absorbed ${a.evaded} evaded / ${a.blockedByShield} shield /` +
        ` ${a.swallowedByIframe} i-frame / ${a.unexplained} unexplained`,
      );
      for (const sample of result.absorbedSamples ?? []) {
        console.log(`      absorbed: ${JSON.stringify(sample)}`);
      }
      return { ...result, ranged };
    };
    const still = await probe('standing still', false, 40);
    const orbit = await probe('orbiting tight', true, 40);
    const kite = await probe('kiting wide', true, 40, 1_600);
    check('the Marshal can hit a player who stands in front of it', still.hits > 0, `${still.hits} hits`);
    check('the Marshal can hit a player who kites it', kite.hits > 0, `${kite.hits} hits`);
    check(
      'its ranged kit lands on a moving player, not just its body',
      orbit.shotHits + kite.shotHits > 0,
      `${orbit.shotHits + kite.shotHits} shots connected across both patterns` +
        ` (${orbit.ranged + kite.ranged} of them got past an i-frame)`,
    );
  }

  // No ambient waves during the finale. Measured over real seconds rather than
  // asserted off the flag: the flag being set proves nothing about whether the
  // spawner honours it, and the arena reset only means something if the floor
  // STAYS clear.
  console.log('\nAcceptance — the arena stays the boss\'s:');
  // Counting BODIES cannot answer this any more: the Marshal calls Voltlings of
  // its own, so a full floor is now the fight working. What the spawner alone
  // can produce is a MIX — Sparkrunners, Rollers, Drones, Gunners, Rustbrutes —
  // and the arena reset wiped the field, so a single one of those is proof the
  // pause was ignored.
  const waveWatch = [];
  for (let i = 0; i < 20; i++) {
    await tick();
    waveWatch.push(
      await page.evaluate((called) => {
        const g = window.__voltswarm;
        const live = g.enemies.pool.filter((e) => e.active);
        return {
          bodies: live.length,
          // "Called" comes from the config the game is running, not from a list
          // typed here: this check hard-coded Voltling and went stale the moment
          // Rollers joined the drop mix, reporting the fight's own
          // reinforcements as a spawner leak.
          ambient: live.filter((e) => !called.includes(e.typeIndex)).length,
        };
      }, [...FINAL_BOSS.assembly.typeIndexes, FINAL_BOSS_TYPE_INDEX]),
    );
    await wait(500);
  }
  const peakAmbient = Math.max(...waveWatch.map((s) => s.ambient));
  console.log(`  live bodies over 10s: ${waveWatch.map((s) => s.bodies).join(' ')}`);
  console.log(`  of which the spawner's: ${waveWatch.map((s) => s.ambient).join(' ')}`);
  check(
    'no ambient wave joins the fight',
    peakAmbient === 0,
    `${peakAmbient} bodies of a type the Marshal never calls`,
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

  // Missiles in flight: the red chain now has a launcher, and a missile that
  // never leaves the rack looks identical to one that does in a still frame.
  // Sampled from NODE, one short evaluate at a time, with the bot housekeeping
  // running between samples. It used to be one 19.5s evaluate inside the page:
  // if a level-up or chest overlay opened during it the run was PAUSED for the
  // whole window and nothing fired, which the check reported as "the chain is
  // painted on the floor" — a broken instrument wearing a real bug's clothes.
  const missiles = { peak: 0, sampledAboveGround: 0, blocks: 0 };
  let missileShot = false;
  // 130 x 150ms = 19.5s. It MUST outlast the chain's own cooldown (8s) with
  // room to spare: a shorter window reports "no missiles" on a working game,
  // which is how this check failed once already.
  for (let i = 0; i < 130; i++) {
    const sample = await page.evaluate(() => {
      const g = window.__voltswarm;
      // Housekeeping first: an overlay pauses the run, and a paused run fires
      // nothing at all.
      const open = (id) => {
        const el = document.getElementById(id);
        return el && !el.classList.contains('hidden') ? el : null;
      };
      open('levelup-overlay')?.querySelector('#upgrade-cards > *')?.click();
      open('chest-overlay')?.querySelector('#chest-continue')?.click();
      open('shop-overlay')?.querySelector('#shop-leave-button')?.click();
      open('pause-overlay')?.querySelector('#resume-button')?.click();
      g.player.hp = g.player.maxHp;
      const fight = g.boss.finalFight;
      const live = (fight.missiles ?? []).filter((m) => m.live);
      return {
        live: live.length,
        aboveGround: live.filter((m) => m.mesh.position.y > 1).length,
        playing: g.state === 'playing',
        blocks: fight.missiles?.[0]?.mesh?.geometry?.getAttribute('position')?.count ?? 0,
      };
    });
    missiles.peak = Math.max(missiles.peak, sample.live);
    missiles.sampledAboveGround += sample.aboveGround;
    missiles.blocks = sample.blocks || missiles.blocks;
    // Flag the first frame with several in the air so the harness can grab a
    // picture of the thing this check can only count.
    if (!missileShot && sample.live >= 2 && sample.playing) {
      missileShot = true;
      await page.evaluate(() => {
        window.__missileShot = true;
      });
    }
    await wait(150);
  }
  console.log(`  missile body: ${missiles.blocks} vertices (a plain box is 24)`);
  if (await page.evaluate(() => window.__missileShot === true)) {
    await page.screenshot({ path: resolve(OUTPUT, 'finale-missiles.png') });
  }
  check(
    'the red chain is fired from the boss, not painted on the floor',
    missiles.peak > 0 && missiles.sampledAboveGround > 0,
    `${missiles.peak} missiles in the air at once, ${missiles.sampledAboveGround} samples above ground`,
  );
  // Three lines means three racks firing per wave. A pool sized for one line
  // would still show missiles — just a third of them — so the count matters.
  check(
    'all three lines are actually fired',
    missiles.peak >= FINAL_BOSS.overload.lines,
    `${missiles.peak} in the air vs ${FINAL_BOSS.overload.lines} lines`,
  );

  // Phase 3 is the only place the red chain exists, so its cues can only be
  // checked from here — and a silent attack is invisible to every other check.
  const overloadHeard = await page.evaluate(async () => {
    const g = window.__voltswarm;
    // Give the chain time to open and blow at least one link.
    await new Promise((resolve) => setTimeout(resolve, 12_000));
    // Counted as VOICES, not as accepted events: the accepted-event version of
    // this check passed on five cues that produced no sound at all.
    const started = new Set(
      (g.__plays ?? []).filter((play) => play.dv > 0).map((play) => play.id),
    );
    return [
      'boss-overload-open',
      'boss-overload-erupt',
      'boss-volley',
      // Both halves of the reinforcement beat: the ORDER at the boss and the
      // materialisation at each bay. The order shipped mute for a whole pass —
      // it emitted an id that was never enabled — so it is checked as a voice.
      'boss-assembly-open',
      'boss-assembly-spawn',
      'run-start',
    ].filter((id) => started.has(id));
  });
  check(
    'the red chain, the volley and both halves of the reinforcement beat started real voices',
    overloadHeard.length === 6,
    `voiced: ${overloadHeard.join(', ') || 'none'}`,
  );

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

  // THE DEATH BEAT, last because it ends the run. Killed through the game's own
  // damage funnel — EnemySystem.damage would skip the bookkeeping that decides
  // the ending, which is the thing under test.
  console.log('\nAcceptance — the Marshal coming apart:');
  // Clear whatever the bot's own housekeeping left open first: an overlay PAUSES
  // the run, and a paused run never ticks the death beat — the check would
  // report "the results never opened" on a game that works.
  for (let i = 0; i < 6; i++) {
    await tick();
    await wait(120);
  }
  const victory = await page.evaluate(async () => {
    const g = window.__voltswarm;
    const dismiss = () => {
      const open = (id) => {
        const el = document.getElementById(id);
        return el && !el.classList.contains('hidden') ? el : null;
      };
      open('levelup-overlay')?.querySelector('#upgrade-cards > *')?.click();
      open('chest-overlay')?.querySelector('#chest-continue')?.click();
      open('shop-overlay')?.querySelector('#shop-leave-button')?.click();
      open('pause-overlay')?.querySelector('#resume-button')?.click();
    };
    dismiss();
    const index = g.enemies.pool.findIndex((e) => e.active && e.typeIndex === 8);
    if (index < 0) return { error: `no boss on the field (state ${g.state})` };
    const endVisible = () => {
      const el = document.getElementById('end-overlay');
      return !!el && !el.classList.contains('hidden');
    };
    const before = endVisible();
    const t0 = performance.now();
    // Not `hp + 1000`: dealDamage runs the number through rollHit, which scales
    // it by the player's damage stat — at x0.95 that overshoot fell 325 short of
    // a 25k boss and the "kill" left it standing.
    g.dealDamage(index, g.enemies.pool[index].hp * 100 + 10_000);
    // Sampled every frame: the failure this guards against is the results
    // screen opening on the SAME frame as the kill, which no coarse poll sees.
    let openedAt = null;
    let sawExplosion = false;
    // 8 seconds of frames: the assertion is about the ORDER (explosion, then
    // results), not about a knife-edge budget.
    for (let i = 0; i < 480; i++) {
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      // A level-up can still open on the kill (the boss pays a lot of XP), and
      // it would freeze the beat mid-explosion.
      dismiss();
      if (g.finaleVictory) sawExplosion = true;
      if (openedAt === null && endVisible()) openedAt = performance.now() - t0;
      if (openedAt !== null) break;
    }
    return {
      before,
      openedAfterMs: openedAt,
      sawExplosion,
      state: g.state,
      // Everything the failure could be, returned rather than guessed at.
      bossAliveAfter: g.enemies.pool.some((e) => e.active && e.typeIndex === 8),
      finaleStarted: g.runFlow?.finaleStarted ?? null,
      runFinalized: g.runFinalized ?? null,
      victoryPending: g.finaleVictory !== null,
    };
  });
  console.log(
    victory.error
      ? `  could not run the beat: ${victory.error}`
      : `  results opened ${victory.openedAfterMs?.toFixed(0) ?? 'never'}ms after the kill` +
        `  |  ${JSON.stringify(victory)}`,
  );
  check('the death beat runs before the results', victory.sawExplosion === true);
  check(
    'the results wait for the explosion, and still arrive',
    victory.openedAfterMs !== null && victory.openedAfterMs >= 1_000 && victory.openedAfterMs < 6_000,
    `${victory.openedAfterMs?.toFixed(0) ?? 'never'}ms`,
  );
  const stallStates = await page.evaluate(() =>
    (window.__voltswarm.__longTasks ?? []).map((t) => t.state ?? '?'),
  );
  if (stallStates.length > 0) {
    const counts = new Map();
    for (const state of stallStates) counts.set(state, (counts.get(state) ?? 0) + 1);
    console.log(`  long tasks by game state: ${[...counts].map(([k, v]) => `${k} x${v}`).join(', ')}`);
  }

  check('no console errors during the finale', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
} finally {
  await browser?.disconnect().catch(() => undefined);
  electronProcess?.kill();
  vite.kill();
  restoreHistory();
}

console.log(failures === 0 ? '\nFinale runtime check PASSED\n' : `\nFinale runtime check FAILED (${failures})\n`);
process.exit(failures === 0 ? 0 : 1);
