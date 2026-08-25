// Captures screenshot(s) of model-preview.html for art review.
// Usage: node tools/capture-model-preview.mjs <model> [output.png] [angles]
//   angles: comma-separated orbit degrees, e.g. "0,90,180,270" — when given,
//   captures one file per angle as <output-without-ext>-<angle>.png.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const PORT = Number(process.env.CAPTURE_PORT ?? 5199);
const MODEL = process.argv[2] ?? 'voltling';
const OUTPUT = process.argv[3] ?? `assets/preview/${MODEL}.png`;
const ANGLES = (process.argv[4] ?? '0').split(',').map((s) => Number(s.trim()));

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
      const res = await fetch(`http://localhost:${PORT}/model-preview.html`);
      if (res.ok) return;
    } catch {
      // server not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Vite dev server did not start');
}

function outputForAngle(angle) {
  if (ANGLES.length === 1) return OUTPUT;
  const dot = OUTPUT.lastIndexOf('.');
  return dot === -1 ? `${OUTPUT}-${angle}` : `${OUTPUT.slice(0, dot)}-${angle}${OUTPUT.slice(dot)}`;
}

const errors = [];
try {
  await waitForServer();
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--window-size=1000,820'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 820 });
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    // 404s (favicon) are noise; real failures surface as pageerror.
    if (msg.type() === 'error' && !msg.text().includes('404')) errors.push(msg.text());
  });
  for (const angle of ANGLES) {
    await page.goto(`http://localhost:${PORT}/model-preview.html?model=${MODEL}&angle=${angle}`);
    await page.waitForFunction('window.__previewReady === true', { timeout: 15000 });
    const out = outputForAngle(angle);
    await page.screenshot({ path: out });
    console.log(`Saved ${out}`);
  }
  await browser.close();
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
