import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import os from 'node:os';
import puppeteer from 'puppeteer-core';
import { confirmOnlyVisibleCharacterIfPresent, enterMainMenu } from './character-flow.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const OUTPUT = resolve(ROOT, 'tmp/perf-audio-output');
const REPORT = resolve(OUTPUT, 'report.json');
const PORT = 9223;
const WARMUP_MS = 3_000;
const SAMPLE_MS = 10_000;
const MIN_MEAN_FPS = 60;
const EXE = resolve(ROOT, 'release/win-unpacked/Voltswarm.exe');
const wait = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
function run(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with ${result.status}`);
}
async function waitForCdp() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try { const response = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (response.ok) return; } catch { /* process still starting */ }
    await wait(250);
  }
  throw new Error('Packaged Electron did not expose remote debugging');
}

mkdirSync(OUTPUT, { recursive: true });
run('pnpm.cmd', ['run', 'package:dir']);
if (!existsSync(EXE)) throw new Error(`Missing packaged executable: ${EXE}`);
// ELECTRON_RUN_AS_NODE (inherited from some tool environments) boots the
// packaged binary as plain Node, which rejects the Chromium flags below with
// "bad option" and exits 9 — reads like the app refusing its own arguments.
const benchmarkEnv = { ...process.env };
delete benchmarkEnv.ELECTRON_RUN_AS_NODE;
const processHandle = spawn(EXE, [`--remote-debugging-port=${PORT}`, '--audio-benchmark'], { cwd: dirname(EXE), stdio: 'pipe', windowsHide: true, env: benchmarkEnv });
let browser;
try {
  await waitForCdp();
  browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}` });
  const pages = await browser.pages(); const page = pages[0];
  if (!page) throw new Error('No renderer target found');
  await enterMainMenu(page, 20_000);
  await page.waitForSelector('#play-button', { visible: true, timeout: 20_000 });
  await page.click('#play-button');
  await confirmOnlyVisibleCharacterIfPresent(page);
  await page.waitForSelector('#draft-cards > *', { visible: true, timeout: 20_000 });
  await page.click('#draft-cards > *');
  await page.waitForFunction(() => Boolean(window.__voltswarmAudioBenchmark), { timeout: 20_000 });
  const scenario = await page.evaluate(() => window.__voltswarmAudioBenchmark.start());
  await wait(WARMUP_MS);
  const metrics = await page.evaluate((duration) => new Promise((resolveMetrics) => {
    const stamps = []; let minimumEnemies = Infinity; const started = performance.now();
    const frame = (now) => {
      stamps.push(now);
      minimumEnemies = Math.min(minimumEnemies, window.__voltswarmAudioBenchmark.snapshot().enemies);
      if (now - started < duration) requestAnimationFrame(frame);
      else {
        const deltas = stamps.slice(1).map((value, index) => value - stamps[index]);
        const sorted = [...deltas].sort((a, b) => a - b);
        const p99 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))] ?? 0;
        const seconds = Math.max(1, (stamps.at(-1) - stamps[0]) / 1000);
        const buckets = []; const completeUntil = stamps[0] + Math.floor((stamps.at(-1) - stamps[0]) / 1000) * 1000;
        for (let start = stamps[0]; start < completeUntil; start += 1000) buckets.push(stamps.filter((stamp) => stamp >= start && stamp < start + 1000).length);
        const gl = document.createElement('canvas').getContext('webgl');
        const debug = gl?.getExtension('WEBGL_debug_renderer_info');
        resolveMetrics({ meanFps: stamps.length / seconds, minimumBucketFps: Math.min(...buckets), frameTimeP99Ms: p99, minimumEnemies, resolution: `${innerWidth}x${innerHeight}`, userAgent: navigator.userAgent, gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable', end: window.__voltswarmAudioBenchmark.snapshot() });
      }
    };
    requestAnimationFrame(frame);
  }), SAMPLE_MS);
  await page.evaluate(() => window.__voltswarmAudioBenchmark.cleanup());
  await wait(800);
  const cleanup = await page.evaluate(() => window.__voltswarmAudioBenchmark.snapshot());
  const report = { timestamp: new Date().toISOString(), scenario, scenarioDigest: scenario.digest, enemyPeak: scenario.enemies + 4, enemyMinimum: metrics.minimumEnemies, enemyEnd: metrics.end.enemies, warmupMs: WARMUP_MS, durationMs: SAMPLE_MS, device: { cpu: os.cpus()[0]?.model ?? 'unknown', platform: `${os.platform()} ${os.release()}` }, metrics, cleanup, pass: metrics.meanFps >= MIN_MEAN_FPS && metrics.frameTimeP99Ms > 0 && metrics.minimumEnemies >= 400 && metrics.end.enemies >= 400 && metrics.end.kills > 0 && metrics.end.xpPickups > 0 && metrics.end.goldPickups > 0 && metrics.end.audio.attempts > 0 && metrics.end.audio.accepted > 0 && cleanup.audio.activeVoices === 0 && cleanup.audio.leakedVoices === 0 };
  writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exitCode = 1;
} finally {
  await browser?.disconnect().catch(() => undefined);
  processHandle.kill();
}
