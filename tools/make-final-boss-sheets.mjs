// Rebuilds the three conversion sheets for the Map 2 final boss (Volt Warden)
// from the v1 design reference.
//
// WHY: `ref-volt-warden-front.png` is CONCEPT ART, not a conversion sheet.
// Audited (tmp/warden-ref/audit-sheets.mjs) it is 215 disconnected pieces with
// 101 interior holes — 45% of its foreground lives outside the main
// silhouette. Those fragments extrude independently, which is what makes the
// `final-boss` model a lumpy mass. Adding side/back sheets could never fix
// that; the FRONT had to be rebuilt contiguous first.
//
// The front is DERIVED from the reference (so the design is preserved exactly,
// not redrawn from memory) and then repaired:
//   1. downsample to the boss grid by majority vote,
//   2. drop the exhaust plume — it is a VFX, not geometry, and it is the
//      single largest source of legitimately floating pieces,
//   3. fill interior holes and bridge the shoulder pods to the body, so the
//      sheet becomes ONE contiguous silhouette,
//   4. symmetrize (the voxelizer mirrors shape but never colour).
//
// Side and back are AUTHORED against the repaired front's own row structure —
// a front view cannot supply them, and this is the boss whose missing side
// view created the 3-view rule (PROMPTS_IMAGENES.md §162).
//
// Usage: node tools/make-final-boss-sheets.mjs [--debug]

import { deflateSync } from 'node:zlib';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const SCALE = 16;
const OUT_DIR = 'public/assets/2d';
const DEBUG = process.argv.includes('--debug');
const SRC = 'public/assets/2d/ref-volt-warden-front.png';

// Boss grid: 41 columns is the established boss resolution (crusher-king and
// volt-warden both use it) and keeping it holds the cast coherent.
const COLS = 41;

// The sheets' real measured palette (all four are already exactly on-palette).
const COLORS = {
  Y: [0xff, 0xb4, 0x00, 255], // amber hull
  D: [0x23, 0x28, 0x30, 255], // charcoal frame / vents
  V: [0x7e, 0xe0, 0xff, 255], // cyan visor + core
  '.': [0, 0, 0, 0],
};

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const browser = await puppeteer.launch({
  executablePath: CHROME_PATHS.find((p) => existsSync(p)),
  headless: 'new',
});
const page = await browser.newPage();
const dataUrl = 'data:image/png;base64,' + readFileSync(SRC).toString('base64');
await page.setContent(`<img id="s" src="${dataUrl}">`);
await page.evaluate(
  () =>
    new Promise((r) => {
      const i = document.getElementById('s');
      if (i.complete && i.naturalWidth) r();
      else i.onload = () => r();
    }),
);

const derived = await page.evaluate((cols) => {
  const img = document.getElementById('s');
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, w, h).data;

  // Exact-match keying: this sheet's charcoal #232830 is within RGB distance
  // ~20 of its #151a22 background, so any loose tolerance eats the detail.
  const bgR = d[0];
  const bgG = d[1];
  const bgB = d[2];
  const isBg = (p) => {
    const i = p * 4;
    return (
      d[i + 3] < 128 ||
      (Math.abs(d[i] - bgR) < 6 && Math.abs(d[i + 1] - bgG) < 6 && Math.abs(d[i + 2] - bgB) < 6)
    );
  };
  const key = (p) => {
    const i = p * 4;
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    if (b > 170 && g > 170) return 'V';
    if (r > 150 && g > 110) return 'Y';
    return 'D';
  };

  // The exhaust plume is the cyan mass hanging BELOW the hull. Find the hull
  // bbox first while ignoring cyan that has no non-cyan pixel beneath it.
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++)
    for (let xx = 0; xx < w; xx++) {
      const p = y * w + xx;
      if (isBg(p)) continue;
      if (xx < x0) x0 = xx;
      if (xx > x1) x1 = xx;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  // Row-wise: the plume rows are those whose foreground is (nearly) all cyan.
  let hullBottom = y1;
  for (let y = y1; y > y0; y--) {
    let fg = 0;
    let cy = 0;
    for (let xx = x0; xx <= x1; xx++) {
      const p = y * w + xx;
      if (isBg(p)) continue;
      fg++;
      if (key(p) === 'V') cy++;
    }
    if (fg > 0 && cy < fg * 0.75) {
      hullBottom = y;
      break;
    }
  }

  const bw = x1 - x0 + 1;
  const bh = hullBottom - y0 + 1;
  const rows = Math.max(1, Math.round((bh / bw) * cols));
  const grid = [];
  for (let gy = 0; gy < rows; gy++) {
    let line = '';
    for (let gx = 0; gx < cols; gx++) {
      const px0 = x0 + Math.floor((gx / cols) * bw);
      const px1 = Math.max(px0 + 1, x0 + Math.floor(((gx + 1) / cols) * bw));
      const py0 = y0 + Math.floor((gy / rows) * bh);
      const py1 = Math.max(py0 + 1, y0 + Math.floor(((gy + 1) / rows) * bh));
      const votes = { Y: 0, D: 0, V: 0 };
      let empty = 0;
      let total = 0;
      for (let y = py0; y < py1; y++)
        for (let xx = px0; xx < px1; xx++) {
          total++;
          const p = y * w + xx;
          if (isBg(p)) empty++;
          else votes[key(p)]++;
        }
      if (empty * 2 > total) {
        line += '.';
        continue;
      }
      let best = 'Y';
      let bn = -1;
      for (const k of ['Y', 'D', 'V'])
        if (votes[k] > bn) {
          bn = votes[k];
          best = k;
        }
      line += best;
    }
    grid.push(line);
  }
  return { grid, hullBox: [x0, y0, bw, bh], plumeRowsDropped: y1 - hullBottom };
}, COLS);

await browser.close();
console.log('hull bbox (x,y,w,h):', derived.hullBox);
console.log('plume rows dropped:', derived.plumeRowsDropped);

// --- repair: single contiguous silhouette --------------------------------
function toCells(grid) {
  return grid.map((r) => [...r]);
}
function toRows(cells) {
  return cells.map((r) => r.join(''));
}

/** Fills every background region that is not reachable from the border. */
function fillInteriorHoles(cells) {
  const h = cells.length;
  const w = cells[0].length;
  const seen = Array.from({ length: h }, () => new Array(w).fill(false));
  const st = [];
  for (let x = 0; x < w; x++) st.push([x, 0], [x, h - 1]);
  for (let y = 0; y < h; y++) st.push([0, y], [w - 1, y]);
  while (st.length) {
    const [x, y] = st.pop();
    if (x < 0 || y < 0 || x >= w || y >= h || seen[y][x] || cells[y][x] !== '.') continue;
    seen[y][x] = true;
    st.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  let filled = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (cells[y][x] === '.' && !seen[y][x]) {
        // Adopt the nearest hull colour on the row.
        let c = 'Y';
        for (let dx = 1; dx < w; dx++) {
          const l = cells[y][x - dx];
          const r = cells[y][x + dx];
          if (l && l !== '.') { c = l; break; }
          if (r && r !== '.') { c = r; break; }
        }
        cells[y][x] = c;
        filled++;
      }
  return filled;
}

/** Labels 4-connected foreground components, largest first. */
function components(cells) {
  const h = cells.length;
  const w = cells[0].length;
  const lab = Array.from({ length: h }, () => new Array(w).fill(-1));
  const comps = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (cells[y][x] === '.' || lab[y][x] !== -1) continue;
      const id = comps.length;
      const px = [];
      const st = [[x, y]];
      lab[y][x] = id;
      while (st.length) {
        const [cx, cy] = st.pop();
        px.push([cx, cy]);
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (cells[ny][nx] === '.' || lab[ny][nx] !== -1) continue;
          lab[ny][nx] = id;
          st.push([nx, ny]);
        }
      }
      comps.push(px);
    }
  comps.sort((a, b) => b.length - a.length);
  return comps;
}

/**
 * Forces the sheet to ONE contiguous silhouette: each stray component is
 * either welded to the main body along its shortest clear run (horizontal OR
 * vertical — the reference's thruster arms are stacked segments separated
 * vertically, so a horizontal-only search leaves them orphaned) or deleted.
 * Anything that survives unbridgeable is deleted, because a floating piece is
 * exactly the defect this rebuild exists to remove.
 */
function makeContiguous(cells, minKeep) {
  const h = cells.length;
  const w = cells[0].length;
  let bridged = 0;
  let dropped = 0;
  for (let pass = 0; pass < 24; pass++) {
    const comps = components(cells);
    if (comps.length <= 1) break;
    const main = new Set(comps[0].map(([x, y]) => `${x},${y}`));
    let changed = false;
    for (const comp of comps.slice(1)) {
      if (comp.length < minKeep) {
        for (const [x, y] of comp) cells[y][x] = '.';
        dropped++;
        changed = true;
        continue;
      }
      let best = null;
      for (const [x, y] of comp) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          for (let step = 1; step < Math.max(w, h); step++) {
            const nx = x + dx * step;
            const ny = y + dy * step;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) break;
            if (main.has(`${nx},${ny}`)) {
              if (!best || step < best.len) best = { x, y, dx, dy, len: step };
              break;
            }
            if (cells[ny][nx] !== '.') break;
          }
        }
      }
      if (best) {
        // Weld in the colour of the piece being attached, so a charcoal
        // thruster segment does not grow an amber stalk.
        const weld = cells[best.y][best.x];
        for (let step = 1; step < best.len; step++) {
          cells[best.y + best.dy * step][best.x + best.dx * step] = weld;
        }
        bridged++;
        changed = true;
      } else {
        for (const [x, y] of comp) cells[y][x] = '.';
        dropped++;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return { bridged, dropped };
}

/** Drops empty rows at the top and bottom (the dropped plume leaves some). */
function trimRows(cells) {
  while (cells.length && cells[0].every((c) => c === '.')) cells.shift();
  while (cells.length && cells[cells.length - 1].every((c) => c === '.')) cells.pop();
  return cells;
}

/** The voxelizer mirrors SHAPE but never COLOUR, so asymmetry ships as damage. */
function symmetrize(cells) {
  for (const row of cells) {
    const n = row.length;
    for (let x = 0; x < Math.floor(n / 2); x++) {
      const mx = n - 1 - x;
      if (row[x] !== '.') row[mx] = row[x];
      else if (row[mx] !== '.') row[x] = row[mx];
    }
  }
}

const frontCells = toCells(derived.grid);
symmetrize(frontCells);
const holes = fillInteriorHoles(frontCells);
const { bridged, dropped } = makeContiguous(frontCells, 6);
trimRows(frontCells);
fillInteriorHoles(frontCells);
symmetrize(frontCells);
makeContiguous(frontCells, 6);
const FRONT = toRows(frontCells);
const ROWS = FRONT.length;
console.log(
  `front repaired: ${ROWS} rows, ${holes} interior holes filled, ` +
    `${bridged} pieces bridged, ${dropped} specks dropped`,
);
const finalComps = components(toCells(FRONT));
console.log('front pieces after repair:', finalComps.length);

// ---------------------------------------------------------------------------
// Authoring helpers. Rows are declared as SPANS, not as 41-character string
// literals: hand-counted literals drift by one column constantly, and the
// silhouette must be exactly mirror-symmetric or the voxelizer (which mirrors
// SHAPE but never COLOUR) ships the asymmetry as damage.
// ---------------------------------------------------------------------------
function row(width, spans) {
  const cells = new Array(width).fill('.');
  for (const [a, b, ch] of spans) {
    for (let x = a; x <= b; x++) if (x >= 0 && x < width) cells[x] = ch;
  }
  return cells;
}
/** Mirrors the left half onto the right; `width` must be odd so a true centre
 *  column exists (41 and 33 both are). */
function mirrored(width, spans) {
  const cells = row(width, spans);
  for (let x = 0; x < Math.floor(width / 2); x++) cells[width - 1 - x] = cells[x];
  return cells.join('');
}

// ---------------------------------------------------------------------------
// FRONT, lower half (rows 12+). The reference's thruster arms are spidery
// 1-2 px filaments; at 41 columns they resolve to noise, and the hard sheet
// rule is "large simple shapes". They are rebuilt here as two solid charcoal
// thruster nacelles with an amber energy stripe, hung off a round hull.
// ---------------------------------------------------------------------------
const W = COLS; // 41, centre column 20
const FRONT_LOWER = [
  mirrored(W, [[3, 20, 'Y']]),                                            // 12 shoulder yoke
  mirrored(W, [[1, 17, 'Y'], [18, 20, 'D']]),                             // 13 yoke + neck
  mirrored(W, [[1, 4, 'Y'], [5, 6, 'D'], [7, 17, 'Y'], [18, 20, 'D']]),   // 14 pauldron vents
  mirrored(W, [[0, 4, 'Y'], [5, 6, 'D'], [7, 17, 'Y'], [18, 20, 'D']]),   // 15
  mirrored(W, [[0, 4, 'Y'], [5, 6, 'D'], [7, 16, 'Y'], [17, 20, 'D']]),   // 16
  mirrored(W, [[0, 16, 'Y'], [17, 20, 'D']]),                             // 17 pauldron underside
  mirrored(W, [[1, 16, 'Y'], [17, 20, 'D']]),                             // 18
  mirrored(W, [[1, 6, 'D'], [7, 20, 'Y']]),                               // 19 nacelles split off
  mirrored(W, [[1, 2, 'D'], [3, 3, 'Y'], [4, 6, 'D'], [7, 13, 'Y'], [14, 20, 'D']]), // 20 core top
  mirrored(W, [[1, 2, 'D'], [3, 3, 'Y'], [4, 6, 'D'], [7, 13, 'Y'], [14, 20, 'D']]), // 21
  mirrored(W, [[1, 2, 'D'], [3, 3, 'Y'], [4, 6, 'D'], [7, 13, 'Y'], [14, 20, 'D']]), // 22
  mirrored(W, [[1, 2, 'D'], [3, 3, 'Y'], [4, 6, 'D'], [7, 13, 'Y'], [14, 19, 'D'], [20, 20, 'V']]), // 23 CORE
  mirrored(W, [[1, 2, 'D'], [3, 3, 'Y'], [4, 6, 'D'], [7, 13, 'Y'], [14, 19, 'D'], [20, 20, 'V']]), // 24 CORE
  mirrored(W, [[1, 2, 'D'], [3, 3, 'Y'], [4, 6, 'D'], [7, 13, 'Y'], [14, 20, 'D']]), // 25
  mirrored(W, [[1, 2, 'D'], [3, 3, 'Y'], [4, 6, 'D'], [7, 13, 'Y'], [14, 20, 'D']]), // 26
  mirrored(W, [[1, 6, 'D'], [7, 13, 'Y'], [14, 20, 'D']]),                // 27 nacelle bottom cap
  mirrored(W, [[2, 6, 'D'], [7, 14, 'Y'], [15, 20, 'D']]),                // 28
  mirrored(W, [[3, 6, 'D'], [7, 20, 'Y']]),                               // 29 hull closes under core
  mirrored(W, [[4, 6, 'D'], [8, 20, 'Y']]),                               // 30
  mirrored(W, [[9, 20, 'Y']]),                                            // 31 hull taper
  mirrored(W, [[10, 20, 'Y']]),                                           // 32
  mirrored(W, [[11, 16, 'Y'], [17, 20, 'D']]),                            // 33 engine skirt
  mirrored(W, [[12, 20, 'D']]),                                           // 34
  mirrored(W, [[13, 20, 'D']]),                                           // 35
  mirrored(W, [[15, 19, 'D'], [20, 20, 'V']]),                            // 36 thrust port
  mirrored(W, [[16, 19, 'D'], [20, 20, 'V']]),                            // 37
];
const FRONT_SHEET = [...FRONT.slice(0, 12), ...FRONT_LOWER];

// ---------------------------------------------------------------------------
// SIDE profile. Convention (icon-voxelizer): the object's FRONT is at the
// image's RIGHT edge. A hovering pod reads as a teardrop — dome on top, belly
// bulging forward, engine mass trailing back and down. This is the view the
// model never had, and its absence is what created the 3-view rule.
// 33 columns keeps depth at ~0.8 of the 41-column width.
// ---------------------------------------------------------------------------
const SD = 33;
const SIDE = [
  row(SD, [[13, 20, 'Y']]).join(''),                                      // 0
  row(SD, [[10, 23, 'Y']]).join(''),                                      // 1
  row(SD, [[8, 25, 'Y']]).join(''),                                       // 2
  row(SD, [[7, 26, 'Y']]).join(''),                                       // 3
  row(SD, [[6, 27, 'Y']]).join(''),                                       // 4
  row(SD, [[5, 28, 'Y']]).join(''),                                       // 5
  row(SD, [[5, 27, 'Y'], [28, 29, 'D']]).join(''),                        // 6
  row(SD, [[4, 24, 'Y'], [25, 29, 'D']]).join(''),                        // 7
  row(SD, [[4, 23, 'Y'], [24, 27, 'D'], [28, 30, 'V']]).join(''),         // 8 visor
  row(SD, [[3, 23, 'Y'], [24, 27, 'D'], [28, 30, 'V']]).join(''),         // 9 visor
  row(SD, [[3, 23, 'Y'], [24, 27, 'D'], [28, 30, 'V']]).join(''),         // 10 visor
  row(SD, [[3, 24, 'Y'], [25, 29, 'D']]).join(''),                        // 11
  row(SD, [[2, 30, 'Y']]).join(''),                                       // 12 shoulder yoke
  row(SD, [[1, 31, 'Y']]).join(''),                                       // 13
  row(SD, [[1, 4, 'D'], [5, 31, 'Y']]).join(''),                          // 14
  row(SD, [[1, 4, 'D'], [5, 31, 'Y']]).join(''),                          // 15
  row(SD, [[1, 4, 'D'], [5, 31, 'Y']]).join(''),                          // 16
  row(SD, [[1, 31, 'Y']]).join(''),                                       // 17
  row(SD, [[1, 31, 'Y']]).join(''),                                       // 18
  row(SD, [[0, 31, 'Y']]).join(''),                                       // 19
  row(SD, [[0, 3, 'D'], [4, 26, 'Y'], [27, 31, 'D']]).join(''),           // 20 core panel
  row(SD, [[0, 3, 'D'], [4, 26, 'Y'], [27, 31, 'D']]).join(''),           // 21
  row(SD, [[0, 3, 'D'], [4, 26, 'Y'], [27, 31, 'D']]).join(''),           // 22
  row(SD, [[0, 3, 'D'], [4, 26, 'Y'], [27, 30, 'D'], [31, 31, 'V']]).join(''), // 23 CORE
  row(SD, [[0, 3, 'D'], [4, 26, 'Y'], [27, 30, 'D'], [31, 31, 'V']]).join(''), // 24 CORE
  row(SD, [[0, 3, 'D'], [4, 26, 'Y'], [27, 31, 'D']]).join(''),           // 25
  row(SD, [[0, 3, 'D'], [4, 26, 'Y'], [27, 31, 'D']]).join(''),           // 26
  row(SD, [[1, 4, 'D'], [5, 29, 'Y']]).join(''),                          // 27
  row(SD, [[2, 5, 'D'], [6, 28, 'Y']]).join(''),                          // 28
  row(SD, [[3, 27, 'Y']]).join(''),                                       // 29
  row(SD, [[4, 26, 'Y']]).join(''),                                       // 30
  row(SD, [[6, 25, 'Y']]).join(''),                                       // 31
  row(SD, [[7, 24, 'Y']]).join(''),                                       // 32
  row(SD, [[8, 16, 'D'], [17, 23, 'Y']]).join(''),                        // 33
  row(SD, [[9, 22, 'D']]).join(''),                                       // 34
  row(SD, [[10, 21, 'D']]).join(''),                                      // 35
  row(SD, [[12, 15, 'V'], [16, 20, 'D']]).join(''),                       // 36 thrust port
  row(SD, [[13, 15, 'V'], [16, 19, 'D']]).join(''),                       // 37
];

// ---------------------------------------------------------------------------
// BACK. Same silhouette as the front (it is the same hull) with the face
// swapped for a cooling stack — a back sheet that repeats the visor is the
// classic tell, and leaving it blank is the other one.
// ---------------------------------------------------------------------------
const BACK = [
  ...FRONT.slice(0, 12).map((r, i) => {
    // Replace the visor band and brow with a vented cowl of the same shape.
    if (i < 7) return r;
    return [...r].map((c) => (c === 'V' ? 'D' : c)).join('');
  }),
  ...FRONT_LOWER.map((r, i) => {
    if (i === 11 || i === 12) {
      // Chest core -> charcoal access hatch on the back.
      return [...r].map((c) => (c === 'V' ? 'D' : c)).join('');
    }
    return r;
  }),
];

if (DEBUG) {
  console.log('\nFRONT (derived rows 0-11 + authored 12-37):');
  FRONT_SHEET.forEach((r, i) => console.log(String(i).padStart(2), r));
  console.log('\nSIDE:');
  SIDE.forEach((r, i) => console.log(String(i).padStart(2), r));
}

// --- validation: the rules this whole rebuild exists to enforce ------------
function assertSheet(name, rows, width) {
  rows.forEach((r, i) => {
    if (r.length !== width) throw new Error(`${name} row ${i}: ${r.length} cols, expected ${width}`);
    for (const ch of r) if (!(ch in COLORS)) throw new Error(`${name} row ${i}: bad char '${ch}'`);
  });
  const comps = components(toCells(rows));
  if (comps.length !== 1) {
    throw new Error(`${name} is ${comps.length} pieces; a conversion sheet must be exactly 1`);
  }
  console.log(`${name}: OK — ${rows.length} rows x ${width} cols, 1 contiguous piece`);
}
function assertMirrored(name, rows) {
  rows.forEach((r, i) => {
    if (r !== [...r].reverse().join('')) throw new Error(`${name} row ${i} is not symmetric:\n${r}`);
  });
}

assertSheet('FRONT', FRONT_SHEET, COLS);
assertSheet('SIDE', SIDE, SD);
assertSheet('BACK', BACK, COLS);
assertMirrored('FRONT', FRONT_SHEET);
assertMirrored('BACK', BACK);
if (SIDE.length !== FRONT_SHEET.length || BACK.length !== FRONT_SHEET.length) {
  throw new Error('All three sheets must share the same row count (rows align by height fraction)');
}

// --- PNG writer ------------------------------------------------------------
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
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([len, body, crc]);
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
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
  console.log(`${path} — ${width}x${height} (${cols}x${rows.length} cells)`);
}

writePng(`${OUT_DIR}/ref-final-boss-front-v2.png`, FRONT_SHEET);
writePng(`${OUT_DIR}/ref-final-boss-side-v2.png`, SIDE);
writePng(`${OUT_DIR}/ref-final-boss-back-v2.png`, BACK);
