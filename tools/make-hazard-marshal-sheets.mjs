// Turns the three Hazard Marshal reference RENDERS into the three FLAT
// conversion sheets the voxelizer actually eats (front / side profile / back).
//
// Why a converter instead of feeding the renders straight in: the references
// are lit renders (soft AO, a cream ramp spanning #d0c0a0..#e0d0b8) and
// icon-voxelizer classifies by raw RGB distance, so shadowed cream competes
// with hazard yellow and loses. Rule from docs/PROMPTS_IMAGENES.md §6 —
// "pretty render != conversion sheet". This flattens the render first:
//
//   1. background removed by border flood fill (the render bg #2b2e37 sits
//      within RGB distance of the charcoal frame, so a colour threshold over
//      the whole image would eat the joints — only connectivity is safe),
//   2. every pixel classified by HSV RULES, not nearest-RGB, because
//      saturation separates cream (s ~= 0.18) from yellow (s ~= 0.89)
//      regardless of how dark the AO makes them,
//   3. downsampled to the model's NATIVE voxel grid measured off the render
//      (16 px pitch -> 47 x 72 front, 18 x 72 side), so icon-voxelizer's own
//      downsample is a lossless 1:1 mapping — every cell IS one voxel column,
//   4. re-emitted as flat nearest-neighbour PNGs in the 4-colour palette.
//
// The renders are PERSPECTIVE, not orthographic: the horizontal voxel pitch
// measured 13.4 px across the head band, 18.1 px at the waist and 16.6 px at
// the boots (tmp/warden-ref/lattice.mjs). There is therefore NO constant voxel
// lattice to snap to and every grid is a resampling — the reference cannot be
// recovered cell-exact, only approximated, and the grid resolution is a
// deliberate fidelity/chunkiness trade rather than a "correct" number.
//
// Usage: node tools/make-warden-sheets.mjs [--cols N] [--debug]

import { deflateSync } from 'node:zlib';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const SCALE = 12;
const OUT_DIR = 'public/assets/2d';
const SRC_DIR = 'tmp/warden-ref';
const DEBUG = process.argv.includes('--debug');

// Grid: columns are chosen, rows and side columns follow from the MEASURED
// bounding boxes (front 754x1152, side 285x1140) so all three sheets stay in
// proportion — icon-voxelizer derives the side depth from the sheet aspect.
const colsArg = process.argv.indexOf('--cols');
const COLS = colsArg > -1 ? Number(process.argv[colsArg + 1]) : 47;
const ROWS = Math.round((1152 / 754) * COLS);
const SIDE_COLS = Math.round((285 / 1140) * ROWS);

// Palette: the render's ALBEDO (the 90th-percentile value per class, i.e. the
// unshaded plate), snapped to the existing foreman family constants — this is
// the same character family and the cast must stay colour-coherent.
const COLORS = {
  C: [0xe7, 0xdf, 0xcb, 255], // cream armour
  Y: [0xf0, 0xb4, 0x29, 255], // hazard yellow
  D: [0x2b, 0x2e, 0x35, 255], // charcoal frame / joints
  V: [0x46, 0xd9, 0xec, 255], // cyan visor + chest core
  '.': [0, 0, 0, 0],
};

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const chromePath = CHROME_PATHS.find((p) => existsSync(p));
if (!chromePath) throw new Error('No Chrome/Edge executable found');

const browser = await puppeteer.launch({ executablePath: chromePath, headless: 'new' });
const page = await browser.newPage();

/** Classifies one render into a COLS x ROWS char grid. */
async function sheetFrom(file, cols, rows, mirror) {
  const dataUrl = 'data:image/png;base64,' + readFileSync(`${SRC_DIR}/${file}`).toString('base64');
  await page.setContent(`<img id="src" src="${dataUrl}">`);
  await page.evaluate(
    () =>
      new Promise((r) => {
        const img = document.getElementById('src');
        if (img.complete && img.naturalWidth) r();
        else img.onload = () => r();
      }),
  );
  return page.evaluate(
    ({ cols, rows, mirror }) => {
      const img = document.getElementById('src');
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, w, h).data;

      // --- 1. background: flood fill inward from the border ---
      const bgR = d[0];
      const bgG = d[1];
      const bgB = d[2];
      // TOLERANCE 11, NOT 26. The render background is #2b2e37 and the
      // model's own charcoal bottoms out around #202020 — a max-channel
      // distance of only 23. At 26 the fill LEAKED THROUGH the dark elbow
      // joints and severed both arms between the elbow and the gauntlet
      // (visible as a two-row gap at rows 39-40). The render background is
      // flat, so a tight tolerance loses nothing; the fill is seeded from the
      // border, so tightening cannot strand real background either.
      const bgish = (p) => {
        const i = p * 4;
        return (
          Math.abs(d[i] - bgR) < 11 && Math.abs(d[i + 1] - bgG) < 11 && Math.abs(d[i + 2] - bgB) < 11
        );
      };
      const bg = new Uint8Array(w * h);
      const stack = [];
      for (let x = 0; x < w; x++) stack.push(x, x + (h - 1) * w);
      for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
      while (stack.length) {
        const p = stack.pop();
        if (bg[p] || !bgish(p)) continue;
        bg[p] = 1;
        const x = p % w;
        const y = (p / w) | 0;
        if (x > 0) stack.push(p - 1);
        if (x < w - 1) stack.push(p + 1);
        if (y > 0) stack.push(p - w);
        if (y < h - 1) stack.push(p + w);
      }

      // --- 2. HSV rule classifier ---
      const classify = (r, g, b) => {
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const v = max / 255;
        const s = max === 0 ? 0 : (max - min) / max;
        let hue = 0;
        if (max !== min) {
          const dd = max - min;
          if (max === r) hue = ((g - b) / dd) % 6;
          else if (max === g) hue = (b - r) / dd + 2;
          else hue = (r - g) / dd + 4;
          hue *= 60;
          if (hue < 0) hue += 360;
        }
        // Cyan first: it is the only cool hue in the palette and is always
        // saturated, so it can never be confused with the warm families.
        if (hue >= 140 && hue <= 235 && s > 0.22 && v > 0.25) return 'V';
        // Charcoal: near-black. The cream's deepest AO measured v ~= 0.42, the
        // frame's brightest lit face v ~= 0.24 — 0.32 sits in that valley.
        if (v < 0.32) return 'D';
        // Warm split by SATURATION, which survives shading; hue alone does not
        // (lit cream and lit yellow share a ~35-40 deg hue).
        if (s > 0.45 && hue >= 15 && hue <= 65) return 'Y';
        return 'C';
      };

      // --- content bbox over non-background pixels ---
      let x0 = w;
      let y0 = h;
      let x1 = -1;
      let y1 = -1;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          if (bg[y * w + x]) continue;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      const bw = x1 - x0 + 1;
      const bh = y1 - y0 + 1;

      // --- 3. downsample by majority vote per cell ---
      const grid = [];
      const stats = { C: 0, Y: 0, D: 0, V: 0 };
      for (let gy = 0; gy < rows; gy++) {
        let line = '';
        for (let gx = 0; gx < cols; gx++) {
          const px0 = x0 + Math.floor((gx / cols) * bw);
          const px1 = Math.max(px0 + 1, x0 + Math.floor(((gx + 1) / cols) * bw));
          const py0 = y0 + Math.floor((gy / rows) * bh);
          const py1 = Math.max(py0 + 1, y0 + Math.floor(((gy + 1) / rows) * bh));
          const votes = { C: 0, Y: 0, D: 0, V: 0 };
          let empty = 0;
          let total = 0;
          for (let y = py0; y < py1; y++)
            for (let x = px0; x < px1; x++) {
              total++;
              if (bg[y * w + x]) {
                empty++;
                continue;
              }
              const i = (y * w + x) * 4;
              votes[classify(d[i], d[i + 1], d[i + 2])]++;
            }
          // A cell is solid when most of it is covered; the visor/core details
          // are small, so a filled cell then takes its own majority colour.
          if (empty * 2 > total) {
            line += '.';
            continue;
          }
          let bestKey = 'C';
          let bestN = -1;
          for (const k of ['C', 'Y', 'D', 'V']) {
            if (votes[k] > bestN) {
              bestN = votes[k];
              bestKey = k;
            }
          }
          stats[bestKey]++;
          line += bestKey;
        }
        grid.push(mirror ? [...line].reverse().join('') : line);
      }
      return { grid, stats, bbox: [x0, y0, x1, y1], bboxSize: [bw, bh] };
    },
    { cols, rows, mirror },
  );
}

/** Resampling a lit render leaves orphan cells (a lone lit bevel that won the
 *  majority vote) and pinholes. Both read as damage on a clean robot, so they
 *  are removed HERE where they are inspectable, not left to the voxelizer. */
function despeckle(grid) {
  const h = grid.length;
  const w = grid[0].length;
  const at = (x, y) => (y < 0 || y >= h || x < 0 || x >= w ? '.' : grid[y][x]);
  const out = grid.map((r) => [...r]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const near = [];
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const c = at(x + dx, y + dy);
          if (c !== '.') near.push(c);
        }
      if (grid[y][x] !== '.' && near.length <= 2) out[y][x] = '.';
      else if (grid[y][x] === '.' && near.length >= 7) {
        const votes = {};
        for (const c of near) votes[c] = (votes[c] ?? 0) + 1;
        out[y][x] = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
      }
    }
  return out.map((r) => r.join(''));
}

/** Robots in this art direction are symmetric and the voxelizer mirrors only
 *  SHAPE, never colour — so directional lighting asymmetry in the render must
 *  not survive into the sheet. Left half wins (the render's lit side). */
function symmetrize(grid) {
  return grid.map((row) => {
    const cells = [...row];
    const n = cells.length;
    for (let x = 0; x < Math.floor(n / 2); x++) {
      const mx = n - 1 - x;
      if (cells[x] !== '.' ) cells[mx] = cells[x];
      else if (cells[mx] !== '.') cells[x] = cells[mx];
    }
    return cells.join('');
  });
}

/** cleanupFront fills any hole whose 8-neighbourhood is 7/8 full, so a
 *  1-column interior gap cascades shut row by row. Widen those gaps here,
 *  where it is visible, instead of losing them silently in the voxelizer. */
function widenThinGaps(grid, name) {
  let widened = 0;
  const out = grid.map((row) => {
    const cells = [...row];
    const first = row.search(/[CYDV]/);
    if (first < 0) return row;
    const last = row.length - 1 - [...row].reverse().join('').search(/[CYDV]/);
    for (const m of row.slice(first, last).matchAll(/\.+/g)) {
      if (m[0].length >= 2) continue;
      const at = first + m.index;
      // Grow into whichever neighbour is not the model's mirror axis side.
      const target = at < row.length / 2 ? at - 1 : at + 1;
      if (target > first && target < last) {
        cells[target] = '.';
        widened++;
      }
    }
    return cells.join('');
  });
  if (widened) console.log(`  ${name}: widened ${widened} one-column gaps (cleanupFront cascade)`);
  return out;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([len, body, crcBuf]);
}

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

function writePng(path, rows) {
  const cols = rows[0].length;
  const width = cols * SCALE;
  const height = rows.length * SCALE;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = rows[Math.floor(y / SCALE)];
    let o = y * (width * 4 + 1);
    raw[o++] = 0;
    for (let x = 0; x < width; x++) {
      const rgba = COLORS[row[Math.floor(x / SCALE)]] ?? COLORS['.'];
      raw[o++] = rgba[0];
      raw[o++] = rgba[1];
      raw[o++] = rgba[2];
      raw[o++] = rgba[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(path, png);
  console.log(`${path} — ${width}x${height} (${cols}x${rows.length} cells)`);
}

// --- front -----------------------------------------------------------------
const frontRaw = await sheetFrom('Stomtrooper_front.png', COLS, ROWS, false);
console.log('front bbox', frontRaw.bboxSize, 'cells', frontRaw.stats);
let front = widenThinGaps(symmetrize(despeckle(frontRaw.grid)), 'FRONT');

// --- back (as seen; icon-voxelizer mirrors it itself) ----------------------
const backRaw = await sheetFrom('Stomtrooper_back.png', COLS, ROWS, false);
console.log('back bbox', backRaw.bboxSize, 'cells', backRaw.stats);
let back = widenThinGaps(symmetrize(despeckle(backRaw.grid)), 'BACK');

// --- side (render faces LEFT; the sheet convention is front at the RIGHT) ---
const sideRaw = await sheetFrom('Stomtrooper_side.png', SIDE_COLS, ROWS, true);
console.log('side bbox', sideRaw.bboxSize, 'cells', sideRaw.stats);
const side = despeckle(sideRaw.grid);

await browser.close();

/**
 * Reports how many separate pieces each sheet is. A limb severed by a keying
 * leak (which is exactly how both arms lost their elbows on the first pass)
 * shows up here as an extra component instead of being discovered by eye three
 * rounds later. The front legitimately has more than one piece — the gauntlets
 * hang clear of the torso — so this REPORTS rather than throws; what matters
 * is that the count does not jump between runs.
 */
function reportPieces(name, rows) {
  const h = rows.length;
  const w = rows[0].length;
  const seen = Array.from({ length: h }, () => new Array(w).fill(false));
  const sizes = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (rows[y][x] === '.' || seen[y][x]) continue;
      let n = 0;
      const st = [[x, y]];
      seen[y][x] = true;
      while (st.length) {
        const [cx, cy] = st.pop();
        n++;
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (rows[ny][nx] === '.' || seen[ny][nx]) continue;
          seen[ny][nx] = true;
          st.push([nx, ny]);
        }
      }
      sizes.push(n);
    }
  sizes.sort((a, b) => b - a);
  console.log(`  ${name}: ${sizes.length} piece(s) — sizes ${sizes.slice(0, 6).join(', ')}`);
}

reportPieces('FRONT', front);
reportPieces('BACK', back);
reportPieces('SIDE', side);

if (DEBUG) {
  console.log('\nFRONT:');
  front.forEach((r, i) => console.log(String(i).padStart(2), r));
  console.log('\nSIDE:');
  side.forEach((r, i) => console.log(String(i).padStart(2), r));
}

writePng(`${OUT_DIR}/ref-hazard-marshal-front-v1.png`, front);
writePng(`${OUT_DIR}/ref-hazard-marshal-side-v1.png`, side);
writePng(`${OUT_DIR}/ref-hazard-marshal-back-v1.png`, back);
