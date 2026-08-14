// Records an in-game moment to an animated GIF (no ffmpeg/ImageMagick needed):
// puppeteer screenshots -> PNG decode (zlib) -> median-cut palette + LZW GIF89a.
// Default scene = the boss summon (portal telegraph + materialization).
// Usage: node tools/capture-gif.mjs [out.gif] [frames] [delayCs] [W] [H]
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { decodePNG, buildPalette, indexFrame, buildGif } from './gif-encoder.mjs';
import { confirmOnlyVisibleCharacterIfPresent, enterMainMenu } from './character-flow.mjs';

const OUT = process.argv[2] ?? 'art/steam/gif/boss-summon.gif';
const FRAMES = Number(process.argv[3] ?? 42);
const DELAY_CS = Number(process.argv[4] ?? 9); // centiseconds per frame (~11fps)
const W = Number(process.argv[5] ?? 560);
const H = Number(process.argv[6] ?? 360);
const PORT = 5199;
const SLEEP_MS = 90;

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find(existsSync);

// ---------- PNG decode (8-bit, colorType 2/6) ----------
async function waitForServer() {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/`); if (r.ok) return; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  throw new Error('vite down');
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  await waitForServer();
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: [`--window-size=${W},${H}`, '--use-gl=angle'] });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H });
  await page.goto(`http://localhost:${PORT}/`);
  await enterMainMenu(page);
  await page.waitForSelector('#play-button', { visible: true, timeout: 15000 });
  await page.click('#play-button');
  await confirmOnlyVisibleCharacterIfPresent(page);
  await page.waitForSelector('#draft-cards > *', { visible: true, timeout: 15000 });
  await page.click('#draft-cards > *');
  await sleep(1200);

  // Stand the player on the portal, drop a swarm for atmosphere, force the summon.
  await page.evaluate(() => {
    const g = window.__voltswarm;
    g.maybeShowLevelUp = () => {};
    g.player.maxHp = 999999; g.player.hp = 999999;
    const t = g.boss.totemTarget();
    if (t) {
      g.player.position.x = t.x; g.player.position.z = t.z;
      for (let k = 0; k < 55; k++) { const a = Math.random() * 6.283, r = 3 + Math.random() * 7; g.enemies.spawnAt(k % 3, t.x + Math.cos(a) * r, t.z + Math.sin(a) * r, 2, false); }
    }
    const originalIsActionDown = g.input.isActionDown.bind(g.input);
    g.input.isActionDown = (action) =>
      action === 'interact' || originalIsActionDown(action);
  });
  await sleep(120); // let the summon trigger + a couple telegraph frames

  const pngs = [];
  for (let i = 0; i < FRAMES; i++) { pngs.push(await page.screenshot({ type: 'png' })); await sleep(SLEEP_MS); }
  await browser.close();

  console.log(`Captured ${pngs.length} frames, decoding…`);
  const frames = pngs.map((b) => decodePNG(b).data);
  const dec0 = decodePNG(pngs[0]);
  const gw = dec0.w, gh = dec0.h;
  console.log(`Building palette (${gw}x${gh})…`);
  const pal = buildPalette(frames, gw, gh);
  const cache = new Map();
  const idxFrames = frames.map((f) => indexFrame(f, gw, gh, pal, cache));
  const gif = buildGif(gw, gh, pal, idxFrames, DELAY_CS);
  mkdirSync(OUT.replace(/[/\\][^/\\]+$/, ''), { recursive: true });
  writeFileSync(OUT, gif);
  console.log(`Saved ${OUT}  (${Math.round(gif.length / 1024)} KB, ${idxFrames.length} frames)`);
} catch (e) {
  console.error('fail:', e.message);
  process.exitCode = 1;
} finally {
  vite.kill();
  process.exit(process.exitCode ?? 0);
}
