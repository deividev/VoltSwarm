// Worst-case Map 2 render stress: enters Swarm Foundry through the real dev
// transition, asserts Furnace Mite replaced Voltling in the existing type-0
// InstancedMesh, then forces a full swarm at 1920x1080, attempts the boss
// interaction when a portal exists, and measures 65 seconds of real frames.
//
// This is the instrument that answers "did that change cost us frames?", and it
// is the only honest way to answer it -- a screenshot cannot show a frametime.
//
// READ THE MEDIAN AND p99 FRAMETIME. Nothing else here is trustworthy:
//
//   - `fps.average` pins to the refresh rate because the game is display-bound,
//     so it stays at 120 until a regression is catastrophic.
//   - `frametimeMs.max`, `fps.onePercentLow` and `longTasks` are polluted by the
//     environment. This opens a REAL window, so anything that occludes it or
//     steals scheduler priority stalls rAF. Four runs of the same build measured
//     a max of 8.60 ms, 8.60 ms, 125 ms and 30135 ms -- while the median and p99
//     were 8.30 / 8.50 in every single one. A huge max means the desktop got
//     busy, not that the game dropped a frame.
//
// So compare medians and p99s, and re-run before believing any tail number.
// Also check `population.average` and `interaction` match across the runs you
// are comparing: a level-up landing on the pause probe changes the workload.
//
// Historical Map 1 baseline (2026-08-16, three 0.185, Electron 43): 431
// enemies, 8.30 ms median, 8.50 ms p99, 3.2 M triangles, ~76 draw calls.
// Current Map 2/Furnace baseline (2026-08-21, Chrome 151, RTX 2060): 430
// enemies, 8.40 ms median, 16.70 ms p99, 4.59 M triangles, ~86.77 calls.
//
// Compare runs by keeping the previous report.json -- rename it rather than let
// this overwrite it, since the output path is fixed.
//
// Usage: pnpm run benchmark:stress
//        Report + before/after screenshots land in tmp/perf-400-output/.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const PORT = 5199;
const WIDTH = 1920;
const HEIGHT = 1080;
const DURATION_MS = 65_000;
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT_DIR = `${ROOT}tmp/perf-400-output`;
mkdirSync(OUT_DIR, { recursive: true });

const chromePaths = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const executablePath = chromePaths.find(existsSync);
if (!executablePath) throw new Error('Chrome/Edge not found');

const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: false,
});
let viteLog = '';
vite.stdout.on('data', (chunk) => { viteLog += chunk; });
vite.stderr.on('data', (chunk) => { viteLog += chunk; });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitForServer() {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/`)).ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error(`Vite did not start:\n${viteLog}`);
}

const pageErrors = [];
const consoleErrors = [];
let browser;
try {
  await waitForServer();
  browser = await puppeteer.launch({
    executablePath,
    headless: false,
    // The roster screen builds every character preview on click, which can
    // out-run the default CDP call timeout on a cold cache.
    protocolTimeout: 300_000,
    defaultViewport: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 },
    args: [
      `--window-size=${WIDTH},${HEIGHT}`,
      '--use-gl=angle',
      '--enable-gpu-rasterization',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
    ],
  });
  const [page] = await browser.pages();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' });

  // A "PRESS ANY KEY" title screen sits in front of the menu, so #menu-overlay
  // stays display:none and #play-button measures 0x0 until a key arrives.
  // Press until it actually takes: a single press races the title screen's own
  // key listener, which is only attached once its assets finish preloading, and
  // a lost press strands the whole run on a 0x0 button.
  for (let i = 0; i < 30; i++) {
    const open = await page.evaluate(
      () => !document.getElementById('menu-overlay')?.classList.contains('hidden'),
    );
    if (open) break;
    await page.keyboard.press('Space');
    await sleep(500);
  }

  await page.waitForSelector('#play-button', { visible: true, timeout: 20_000 });
  await page.click('#play-button');
  // Play no longer goes straight into the run: the character roster sits in
  // between. Confirm the default pick if the screen shows up.
  const confirm = await page
    .waitForSelector('#character-confirm-button', { visible: true, timeout: 8_000 })
    .catch(() => null);
  if (confirm) {
    await sleep(3_000); // let the roster finish building its previews
    await page.evaluate(() => document.getElementById('character-confirm-button')?.click());
  }
  await page.waitForSelector('#draft-cards > *', { visible: true, timeout: 20_000 });
  await page.click('#draft-cards > *');
  await page.waitForFunction(() => window.__voltswarm?.state === 'playing', { timeout: 20_000 });

  // Freeze the Map 1 mesh identity before the real transition. Map-specific
  // models must swap geometry on this object, never allocate another type mesh.
  await page.evaluate(() => {
    const enemies = window.__voltswarm?.enemies;
    window.__perf400Type0Mesh = enemies?.meshes?.[0] ?? null;
    window.__perf400EnemyMeshCount = enemies?.meshes?.length ?? -1;
  });
  await page.keyboard.press('KeyT');
  await page.waitForFunction(
    () => window.__voltswarm?.runFlow?.mapIndex === 1 && window.__voltswarm?.state === 'playing',
    { timeout: 20_000 },
  );
  await sleep(6_000); // allow all image-derived voxel geometry to replace primitives

  const setup = await page.evaluate(async () => {
    const g = window.__voltswarm;
    if (!g?.enemies?.spawnAt) throw new Error('Dev stress hook unavailable');

    // Await the public variant operation as a hard synchronization point, then
    // prove the Map 2 model occupies the original type-0 InstancedMesh.
    await g.enemies.applyMapModelVariants('megafactory');
    const enemyMeshes = g.enemies.meshes;
    const type0Mesh = enemyMeshes?.[0];
    const furnaceGeometry = await g.enemies.modelGeometryCache?.get('furnace-mite');
    let type0SceneOccurrences = 0;
    g.scene.traverse((object) => {
      if (object === type0Mesh) type0SceneOccurrences++;
    });
    const type0Position = type0Mesh?.geometry?.getAttribute('position');
    const modelVariant = {
      mapIndex: g.runFlow.mapIndex,
      mapId: g.currentMap.id,
      modelKey: type0Mesh?.geometry === furnaceGeometry ? 'furnace-mite' : 'unexpected',
      sameType0Mesh: type0Mesh === window.__perf400Type0Mesh,
      enemyTypeMeshCountBefore: window.__perf400EnemyMeshCount,
      enemyTypeMeshCountAfter: enemyMeshes?.length ?? -1,
      enemyTypeInstancedMeshCount: enemyMeshes?.filter((mesh) => mesh?.isInstancedMesh).length ?? 0,
      type0IsInstancedMesh: type0Mesh?.isInstancedMesh === true,
      type0SceneOccurrences,
      type0GeometryTriangles: type0Position ? type0Position.count / 3 : 0,
      type0Capacity: type0Mesh?.instanceMatrix?.count ?? 0,
    };
    if (modelVariant.mapId !== 'megafactory' || modelVariant.modelKey !== 'furnace-mite') {
      throw new Error(`Map 2 Furnace Mite variant unavailable: ${JSON.stringify(modelVariant)}`);
    }
    if (!modelVariant.sameType0Mesh || !modelVariant.type0IsInstancedMesh ||
        modelVariant.type0SceneOccurrences !== 1 ||
        modelVariant.enemyTypeMeshCountAfter !== modelVariant.enemyTypeMeshCountBefore) {
      throw new Error(`Enemy type mesh identity changed during Map 2 transition: ${JSON.stringify(modelVariant)}`);
    }

    // Deterministic PRNG so the same population layout can be reproduced.
    let seed = 0x5eed400;
    const rnd = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    window.__perf400rnd = rnd;

    // Runtime-only capture build: two legal weapon slots, maxed to make the
    // stress segment VFX-heavy. Nothing is persisted to tracked configuration.
    for (const key of Object.keys(g.weaponLevels)) g.weaponLevels[key] = 0;
    g.weaponLevels.blades = 20;
    g.weaponLevels.turbine = 20;
    g.modCounts = {
      'stun-bumper': 1,
      'kick-plate': 1,
      'loose-bolts': 1,
      'detonator-rig': 1,
      'coolant-burst': 1,
      'orb-siphon': 1,
      'chain-relay': 1,
      'piston-stompers': 1,
      'overload-trigger': 1,
      'phase-chassis': 1,
      'foremans-whistle': 1,
      'magnetron-heart': 1,
    };
    g.player.maxHp = 1_000_000_000;
    g.player.hp = 1_000_000_000;

    // Reset only the active pool, retaining the current source's InstancedMesh
    // allocations and loaded voxel geometries.
    g.enemies.reset();
    const quotas = [180, 80, 45, 35, 45, 45]; // 430 across all six swarm models
    const px = g.player.position.x;
    const pz = g.player.position.z;
    const spawnedByType = [];
    let serial = 0;
    for (let type = 0; type < quotas.length; type++) {
      let spawned = 0;
      for (let n = 0; n < quotas[type]; n++) {
        const a = rnd() * Math.PI * 2;
        const radius = 14 + rnd() * 30;
        const elite = serial % 20 === 0;
        if (g.enemies.spawnAt(type, px + Math.cos(a) * radius, pz + Math.sin(a) * radius, 250, elite) !== -1) spawned++;
        serial++;
      }
      spawnedByType.push(spawned);
    }
    if (g.enemies.activeCount < 400) {
      throw new Error(`Stress population below required 400+: ${g.enemies.activeCount}`);
    }

    // Summon through the real interaction path so the boss telegraph, portal
    // eruption, boss AI, enemy projectiles and auras all participate.
    const portal = g.boss.totemTarget();
    let bossSummoned = false;
    if (portal) {
      g.player.position.x = portal.x;
      g.player.position.z = portal.z;
      const originalAction = g.input.isActionDown.bind(g.input);
      g.input.isActionDown = (action) => action === 'interact' || originalAction(action);
      await new Promise((resolve) => setTimeout(resolve, 3_600));
      g.input.isActionDown = originalAction;
      bossSummoned = g.boss.bossIndex >= 0;
    }

    // Move continuously in a circle. This exercises obstacle collision,
    // separation/pathing and movement-triggered VFX such as Stompers.
    const originalMoveAxis = g.input.moveAxis.bind(g.input);
    g.input.moveAxis = () => {
      const a = performance.now() / 1700;
      return { x: Math.cos(a), y: Math.sin(a) };
    };
    window.__perf400restoreInput = () => { g.input.moveAxis = originalMoveAxis; };

    const gl = g.renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const vendor = debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);

    return {
      viewport: [innerWidth, innerHeight, devicePixelRatio],
      renderer,
      vendor,
      spawnedByType,
      initialActive: g.enemies.activeCount,
      bossSummoned,
      state: g.state,
      weaponLevels: { ...g.weaponLevels },
      modCount: Object.keys(g.modCounts).length,
      poolSize: g.enemies.pool.length,
      modelVariant,
    };
  });

  await page.screenshot({ path: `${OUT_DIR}/stress-start.png` });

  const metrics = await page.evaluate(async (durationMs) => {
    const g = window.__voltswarm;
    const info = g.renderer.info;
    info.autoReset = false;
    info.reset();
    const initialPositions = new Map();
    for (let i = 0; i < g.enemies.pool.length; i++) {
      const e = g.enemies.pool[i];
      if (e?.active) initialPositions.set(i, [e.x, e.z]);
    }

    const frameTimes = [];
    const secondBuckets = [];
    const populationSamples = [];
    const renderSamples = [];
    const longTasks = [];
    let observer;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longTasks.push(entry.duration);
      });
      observer.observe({ type: 'longtask', buffered: true });
    } catch {}

    const spawnReplacement = () => {
      const rnd = window.__perf400rnd;
      const px = g.player.position.x;
      const pz = g.player.position.z;
      for (let type = 0; type < 6 && g.enemies.activeCount < 430; type++) {
        for (let n = 0; n < 12 && g.enemies.activeCount < 430; n++) {
          const a = rnd() * Math.PI * 2;
          const radius = 18 + rnd() * 26;
          g.enemies.spawnAt(type, px + Math.cos(a) * radius, pz + Math.sin(a) * radius, 250, false);
        }
      }
    };
    const refill = setInterval(spawnReplacement, 50);

    let previous = performance.now();
    const started = previous;
    let bucketStart = previous;
    let bucketFrames = 0;
    let previousCalls = 0;
    let previousTriangles = 0;
    let previousPoints = 0;
    let previousLines = 0;
    await new Promise((resolve) => {
      const frame = (now) => {
        frameTimes.push(now - previous);
        previous = now;
        bucketFrames++;
        if (now - bucketStart >= 1000) {
          const bucketMs = now - bucketStart;
          secondBuckets.push((bucketFrames * 1000) / bucketMs);
          populationSamples.push(g.enemies.activeCount);
          const calls = info.render.calls;
          const triangles = info.render.triangles;
          const points = info.render.points;
          const lines = info.render.lines;
          renderSamples.push({
            callsPerFrame: (calls - previousCalls) / bucketFrames,
            trianglesPerFrame: (triangles - previousTriangles) / bucketFrames,
            pointsPerFrame: (points - previousPoints) / bucketFrames,
            linesPerFrame: (lines - previousLines) / bucketFrames,
          });
          previousCalls = calls;
          previousTriangles = triangles;
          previousPoints = points;
          previousLines = lines;
          bucketStart = now;
          bucketFrames = 0;
        }
        if (now - started < durationMs) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });
    clearInterval(refill);
    observer?.disconnect();
    window.__perf400restoreInput?.();
    info.autoReset = true;
    info.reset();

    const sorted = [...frameTimes].sort((a, b) => a - b);
    const sortedFps = [...secondBuckets].sort((a, b) => a - b);
    const q = (values, p) => values[Math.min(values.length - 1, Math.max(0, Math.floor((values.length - 1) * p)))] ?? null;
    const average = (values) => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
    let moved = 0;
    let displacementSum = 0;
    for (const [index, [x, z]] of initialPositions) {
      const e = g.enemies.pool[index];
      if (!e?.active) continue;
      const d = Math.hypot(e.x - x, e.z - z);
      if (d > 1) moved++;
      displacementSum += d;
    }
    const damaged = g.enemies.pool.filter((e) => e?.active && e.hp < e.maxHp).length;
    return {
      measuredMs: performance.now() - started,
      frames: frameTimes.length,
      fps: {
        average: (frameTimes.length * 1000) / (performance.now() - started),
        oneSecondAverage: average(secondBuckets),
        minimumOneSecond: Math.min(...secondBuckets),
        onePercentLowBucket: q(sortedFps, 0.01),
        fivePercentLowBucket: q(sortedFps, 0.05),
      },
      frametimeMs: {
        median: q(sorted, 0.5),
        p95: q(sorted, 0.95),
        p99: q(sorted, 0.99),
        max: Math.max(...frameTimes),
      },
      population: {
        minimum: Math.min(...populationSamples),
        average: average(populationSamples),
        maximum: Math.max(...populationSamples),
        final: g.enemies.activeCount,
        samples: populationSamples.length,
      },
      render: {
        callsPerFrameAverage: average(renderSamples.map((x) => x.callsPerFrame)),
        trianglesPerFrameAverage: average(renderSamples.map((x) => x.trianglesPerFrame)),
        callsPerFrameMax: Math.max(...renderSamples.map((x) => x.callsPerFrame)),
        trianglesPerFrameMax: Math.max(...renderSamples.map((x) => x.trianglesPerFrame)),
        samples: renderSamples.length,
        textures: info.memory.textures,
        geometries: info.memory.geometries,
      },
      longTasks: {
        count: longTasks.length,
        totalMs: longTasks.reduce((a, b) => a + b, 0),
        maxMs: longTasks.length ? Math.max(...longTasks) : 0,
      },
      behavior: {
        initialTracked: initialPositions.size,
        stillActiveTracked: [...initialPositions.keys()].filter((i) => g.enemies.pool[i]?.active).length,
        movedOverOneUnit: moved,
        averageDisplacement: displacementSum / Math.max(1, initialPositions.size),
        damagedActiveEnemies: damaged,
        playerHp: g.player.hp,
        state: g.state,
        bossActive: g.boss.bossIndex >= 0,
      },
    };
  }, DURATION_MS);

  await page.screenshot({ path: `${OUT_DIR}/stress-end.png` });
  const interaction = {};
  await page.keyboard.press('Escape');
  await sleep(300);
  interaction.afterPause = await page.evaluate(() => window.__voltswarm.state);
  await page.keyboard.press('Escape');
  await sleep(300);
  interaction.afterResume = await page.evaluate(() => window.__voltswarm.state);

  const report = {
    timestamp: new Date().toISOString(),
    url: `http://localhost:${PORT}/`,
    browser: await browser.version(),
    setup,
    metrics,
    interaction,
    pageErrors,
    consoleErrors,
  };
  writeFileSync(`${OUT_DIR}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close().catch(() => {});
  vite.kill();
}
