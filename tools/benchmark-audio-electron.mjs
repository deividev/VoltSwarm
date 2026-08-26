import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import os from 'node:os';
import puppeteer from 'puppeteer-core';
import { confirmOnlyVisibleCharacterIfPresent, enterMainMenu } from './character-flow.mjs';
import { AUDIO_BENCHMARK_THRESHOLDS, evaluateAudioBenchmark } from './audio-benchmark-policy.mjs';

const require = createRequire(import.meta.url);
const electronExecutable = require('electron');
const viteCli = join(dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
const ROOT = resolve(import.meta.dirname, '..');
const OUTPUT = resolve(ROOT, 'tmp/perf-audio-output');
const REPORT = resolve(OUTPUT, 'report.json');
const DURABLE_REPORT = resolve(ROOT, 'docs/evidence/audio-benchmark-dev-0.30.9.json');
const DEV_PORT = 5174;
const CDP_PORT = 9223;
const DEV_URL = `http://127.0.0.1:${DEV_PORT}/?audioBenchmark=1`;
const WARMUP_MS = 5_000;
const SAMPLE_MS = 10_000;
const wait = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

async function waitForUrl(url, label) {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* process still starting */ }
    await wait(250);
  }
  throw new Error(`${label} did not become ready`);
}

mkdirSync(OUTPUT, { recursive: true });
mkdirSync(dirname(DURABLE_REPORT), { recursive: true });

// The benchmark deliberately runs through Vite's development server. Its hook
// lives in a DEV-only dynamic import and is absent from dist/ and app.asar.
const vite = spawn(
  process.execPath,
  [viteCli, '--host', '127.0.0.1', '--port', String(DEV_PORT), '--strictPort'],
  { cwd: ROOT, stdio: 'pipe', windowsHide: true },
);
let electronProcess;
let browser;
try {
  await waitForUrl(DEV_URL, 'Vite development server');
  const benchmarkEnv = { ...process.env, VITE_DEV_SERVER_URL: DEV_URL };
  delete benchmarkEnv.ELECTRON_RUN_AS_NODE;
  electronProcess = spawn(
    electronExecutable,
    [`--remote-debugging-port=${CDP_PORT}`, ROOT],
    { cwd: ROOT, stdio: 'pipe', windowsHide: true, env: benchmarkEnv },
  );
  await waitForUrl(`http://127.0.0.1:${CDP_PORT}/json/version`, 'Development Electron CDP');

  browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${CDP_PORT}` });
  const pages = await browser.pages();
  const page = pages[0];
  if (!page) throw new Error('No renderer target found');
  await enterMainMenu(page, 20_000);
  await page.waitForSelector('#play-button', { visible: true, timeout: 20_000 });
  await page.click('#play-button');
  await confirmOnlyVisibleCharacterIfPresent(page);
  await page.waitForSelector('#draft-cards > *', { visible: true, timeout: 20_000 });
  await page.click('#draft-cards > *');
  await page.waitForFunction(() => Boolean(window.__voltswarmAudioBenchmark), { timeout: 20_000 });
  const scenario = await page.evaluate(() => window.__voltswarmAudioBenchmark.start());
  // Warm the FULL active workload with rendered frames, not wall-clock sleep.
  // This deliberately pays shader compilation, buffer decode and first-use
  // allocation before the fixed steady-state sample without selecting a lucky
  // performance window based on observed FPS.
  const warmup = await page.evaluate((duration) => new Promise((resolveWarmup) => {
    let frames = 0;
    const started = performance.now();
    const frame = (now) => {
      frames++;
      if (now - started >= duration) {
        resolveWarmup({ requestedMs: duration, actualMs: now - started, renderedFrames: frames });
      } else {
        requestAnimationFrame(frame);
      }
    };
    requestAnimationFrame(frame);
  }), WARMUP_MS);
  const metrics = await page.evaluate((duration) => new Promise((resolveMetrics) => {
    const stamps = [];
    let minimumEnemies = Infinity;
    const started = performance.now();
    const frame = (now) => {
      stamps.push(now);
      minimumEnemies = Math.min(minimumEnemies, window.__voltswarmAudioBenchmark.snapshot().enemies);
      if (now - started < duration) {
        requestAnimationFrame(frame);
        return;
      }
      const deltas = stamps.slice(1).map((value, index) => value - stamps[index]);
      const sorted = [...deltas].sort((a, b) => a - b);
      const p99 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))] ?? 0;
      const seconds = Math.max(1, (stamps.at(-1) - stamps[0]) / 1000);
      const buckets = [];
      const completeUntil = stamps[0] + Math.floor((stamps.at(-1) - stamps[0]) / 1000) * 1000;
      for (let start = stamps[0]; start < completeUntil; start += 1000) {
        buckets.push(stamps.filter((stamp) => stamp >= start && stamp < start + 1000).length);
      }
      const gl = document.createElement('canvas').getContext('webgl');
      const debug = gl?.getExtension('WEBGL_debug_renderer_info');
      resolveMetrics({
        meanFps: stamps.length / seconds,
        minimumBucketFps: Math.min(...buckets),
        frameTimeP99Ms: p99,
        minimumEnemies,
        resolution: `${innerWidth}x${innerHeight}`,
        userAgent: navigator.userAgent,
        gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable',
        end: window.__voltswarmAudioBenchmark.snapshot(),
      });
    };
    requestAnimationFrame(frame);
  }), SAMPLE_MS);
  await page.evaluate(() => window.__voltswarmAudioBenchmark.cleanup());
  await wait(800);
  const cleanup = await page.evaluate(() => window.__voltswarmAudioBenchmark.snapshot());
  const measured = {
    timestamp: new Date().toISOString(),
    environment: 'vite-development-server',
    scenario,
    scenarioDigest: scenario.digest,
    enemyMinimum: metrics.minimumEnemies,
    enemyEnd: metrics.end.enemies,
    warmupMs: WARMUP_MS,
    durationMs: SAMPLE_MS,
    warmup,
    device: { cpu: os.cpus()[0]?.model ?? 'unknown', platform: `${os.platform()} ${os.release()}` },
    metrics,
    cleanup,
  };
  const verdict = evaluateAudioBenchmark(measured);
  const report = { ...measured, thresholds: AUDIO_BENCHMARK_THRESHOLDS, checks: verdict.checks, pass: verdict.pass };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  writeFileSync(REPORT, serialized);
  writeFileSync(DURABLE_REPORT, serialized);
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exitCode = 1;
} finally {
  await browser?.disconnect().catch(() => undefined);
  electronProcess?.kill();
  vite.kill();
}
