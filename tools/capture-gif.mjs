// Records an in-game moment to an animated GIF (no ffmpeg/ImageMagick needed):
// puppeteer screenshots -> PNG decode (zlib) -> median-cut palette + LZW GIF89a.
// Default scene = the boss summon (portal telegraph + materialization).
// Usage: node tools/capture-gif.mjs [out.gif] [frames] [delayCs] [W] [H]
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import zlib from 'node:zlib';
import puppeteer from 'puppeteer-core';

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
function decodePNG(buf) {
  let p = 8, w = 0, h = 0, colorType = 6;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 4;
  const stride = w * ch;
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  let rp = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[rp++];
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0;
      const b = prev[x];
      const c = x >= ch ? prev[x - ch] : 0;
      let v = raw[rp + x];
      if (filter === 1) v = (v + a) & 255;
      else if (filter === 2) v = (v + b) & 255;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        v = (v + pr) & 255;
      }
      cur[x] = v;
    }
    rp += stride;
    for (let x = 0; x < w; x++) {
      const s = x * ch, d = (y * w + x) * 4;
      out[d] = cur[s]; out[d + 1] = ch >= 3 ? cur[s + 1] : cur[s];
      out[d + 2] = ch >= 3 ? cur[s + 2] : cur[s]; out[d + 3] = ch === 4 ? cur[s + 3] : 255;
    }
    prev = cur;
  }
  return { w, h, data: out };
}

// ---------- median-cut palette (256 colors, shared across frames) ----------
function buildPalette(frames, w, h) {
  const samples = [];
  const step = Math.max(1, Math.floor((w * h) / 3000)) * 4;
  for (const f of frames) for (let i = 0; i < f.length; i += step) samples.push([f[i], f[i + 1], f[i + 2]]);
  const rng = (box) => {
    let r0 = 255, g0 = 255, b0 = 255, r1 = 0, g1 = 0, b1 = 0;
    for (const [r, g, b] of box) { if (r < r0) r0 = r; if (r > r1) r1 = r; if (g < g0) g0 = g; if (g > g1) g1 = g; if (b < b0) b0 = b; if (b > b1) b1 = b; }
    return { r: r1 - r0, g: g1 - g0, b: b1 - b0 };
  };
  let boxes = [samples];
  while (boxes.length < 256) {
    let bi = -1, best = -1;
    for (let k = 0; k < boxes.length; k++) { if (boxes[k].length < 2) continue; const r = rng(boxes[k]); const m = Math.max(r.r, r.g, r.b); if (m > best) { best = m; bi = k; } }
    if (bi < 0) break;
    const box = boxes[bi], r = rng(boxes[bi]);
    const ch = r.r >= r.g && r.r >= r.b ? 0 : r.g >= r.b ? 1 : 2;
    box.sort((a, b) => a[ch] - b[ch]);
    const mid = box.length >> 1;
    boxes.splice(bi, 1, box.slice(0, mid), box.slice(mid));
  }
  const pal = boxes.map((box) => {
    let r = 0, g = 0, b = 0;
    for (const s of box) { r += s[0]; g += s[1]; b += s[2]; }
    const n = box.length || 1;
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  });
  while (pal.length < 256) pal.push([0, 0, 0]);
  return pal;
}

function indexFrame(f, w, h, pal, cache) {
  const idx = new Uint8Array(w * h);
  for (let i = 0, pi = 0; i < f.length; i += 4, pi++) {
    const r = f[i], g = f[i + 1], b = f[i + 2];
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let best = cache.get(key);
    if (best === undefined) {
      let bd = 1e9;
      for (let c = 0; c < 256; c++) {
        const dr = r - pal[c][0], dg = g - pal[c][1], db = b - pal[c][2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bd) { bd = d; best = c; }
      }
      cache.set(key, best);
    }
    idx[pi] = best;
  }
  return idx;
}

// ---------- LZW (GIF) ----------
function lzwEncode(indices) {
  const minCode = 8, clear = 256, eoi = 257;
  let codeSize = minCode + 1, dict = new Map(), next = eoi + 1;
  const out = [];
  let acc = 0, bits = 0;
  const write = (code) => { acc |= code << bits; bits += codeSize; while (bits >= 8) { out.push(acc & 255); acc >>= 8; bits -= 8; } };
  const reset = () => { dict = new Map(); next = eoi + 1; codeSize = minCode + 1; };
  write(clear); reset();
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i], key = prefix * 4096 + k;
    if (dict.has(key)) prefix = dict.get(key);
    else {
      write(prefix);
      dict.set(key, next++);
      if (next > (1 << codeSize) && codeSize < 12) codeSize++;
      if (next >= 4096) { write(clear); reset(); }
      prefix = k;
    }
  }
  write(prefix); write(eoi);
  if (bits > 0) out.push(acc & 255);
  return out;
}

function buildGif(w, h, pal, idxFrames, delayCs) {
  const bytes = [];
  const push = (...b) => bytes.push(...b);
  const u16 = (v) => push(v & 255, (v >> 8) & 255);
  push(...[71, 73, 70, 56, 57, 97]); // GIF89a
  u16(w); u16(h); push(0xf7, 0, 0); // packed: global table, 256 colors
  for (const [r, g, b] of pal) push(r, g, b);
  push(0x21, 0xff, 0x0b); push(...'NETSCAPE2.0'.split('').map((c) => c.charCodeAt(0))); push(0x03, 0x01, 0, 0, 0x00); // loop forever
  for (const idx of idxFrames) {
    push(0x21, 0xf9, 0x04, 0x00); u16(delayCs); push(0x00, 0x00); // graphic control (no transparency)
    push(0x2c); u16(0); u16(0); u16(w); u16(h); push(0x00); // image descriptor
    push(8); // LZW min code size
    const data = lzwEncode(idx);
    for (let i = 0; i < data.length; i += 255) {
      const chunk = data.slice(i, i + 255);
      push(chunk.length, ...chunk);
    }
    push(0x00);
  }
  push(0x3b);
  return Buffer.from(bytes);
}

// ---------- capture ----------
const vite = spawn('npx.cmd', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', shell: true });
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
  await page.waitForSelector('#play-button', { visible: true, timeout: 15000 });
  await page.click('#play-button');
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
