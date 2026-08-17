// Measures a flat voxel-conversion sheet against the rules in
// docs/PROMPTS_IMAGENES.md §6 so a sheet is accepted on numbers, not on a
// thumbnail (project method rule #1: measure, never judge from a capture).
//
// Reports, for the sheet's opaque bounding box:
//   - content aspect ratio (vs an optional --aspect target)
//   - connected-component count (§6 MANDATORY: a severed limb is invisible in
//     a thumbnail and shows up here instantly)
//   - palette compliance against --palette, listing any off-palette mass
//   - mean luminance, for floor/prop contrast-ratio checks
//   - per-row left/right silhouette edges, i.e. whether the width is constant
//   - top-row vs bottom-row identity, i.e. whether the sheet tiles vertically
//
// The last two exist for STACKABLE modules (the Map 2 foundry towers): a taper
// makes stacked copies step, and mismatched end rows make them read as a pile
// of boxes rather than one column.
//
// Usage:
//   node tools/check-conversion-sheet.mjs <file.png> [--aspect 1.5]
//     [--palette 232830,2a363f,...] [--tileable]
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const args = process.argv.slice(2);
const FILE = args[0];
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
};
const targetAspect = flag('aspect') ? Number(flag('aspect')) : null;
const palette = (flag('palette') ?? '')
  .split(',')
  .filter(Boolean)
  .map((h) => h.replace('#', '').toLowerCase());
const checkTileable = args.includes('--tileable');
const gridColumns = flag('columns') ? Number(flag('columns')) : null;

if (!FILE || !existsSync(FILE)) {
  console.error(`usage: node tools/check-conversion-sheet.mjs <file.png> [...]`);
  process.exit(1);
}

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
];
const chromePath = CHROME_PATHS.find((p) => existsSync(p));
if (!chromePath) {
  console.error('Chrome not found; this tool reads pixels through a headless canvas.');
  process.exit(1);
}

const browser = await puppeteer.launch({ executablePath: chromePath, headless: 'new' });
const page = await browser.newPage();
await page.goto(pathToFileURL(FILE).href);

const report = await page.evaluate(async (palette, gridColumns) => {
  const img = document.querySelector('img');
  await img.decode();
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, w, h);

  // The voxelizer identifies the subject by ALPHA, so opacity is the ground
  // truth for "is this pixel part of the model" — not colour distance.
  const OPAQUE = 128;
  const at = (x, y) => (y * w + x) * 4;
  const isOn = (x, y) => data[at(x, y) + 3] >= OPAQUE;

  let minX = w;
  let maxX = -1;
  let minY = h;
  let maxY = -1;
  let opaque = 0;
  let fringe = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[at(x, y) + 3];
      if (a > 0 && a < 255) fringe++;
      if (a < OPAQUE) continue;
      opaque++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return { empty: true, width: w, height: h };

  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;

  // Connected components over the opaque mask (4-neighbour), iterative so a
  // full-sheet subject cannot blow the stack.
  const seen = new Uint8Array(w * h);
  const components = [];
  const stack = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const idx = y * w + x;
      if (seen[idx] || !isOn(x, y)) continue;
      let size = 0;
      stack.push(idx);
      seen[idx] = 1;
      while (stack.length) {
        const cur = stack.pop();
        const cx = cur % w;
        const cy = (cur - cx) / w;
        size++;
        const push = (nx, ny) => {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
          const n = ny * w + nx;
          if (seen[n] || !isOn(nx, ny)) return;
          seen[n] = 1;
          stack.push(n);
        };
        push(cx + 1, cy);
        push(cx - 1, cy);
        push(cx, cy + 1);
        push(cx, cy - 1);
      }
      components.push(size);
    }
  }
  components.sort((a, b) => b - a);

  // Colour census + luminance over opaque pixels only.
  const counts = new Map();
  let lumSum = 0;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (!isOn(x, y)) continue;
      const i = at(x, y);
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      lumSum += 0.299 * r + 0.587 * g + 0.114 * b;
      const hex = ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
      counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }
  }
  const colors = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const onPalette = colors
    .filter(([hex]) => palette.includes(hex))
    .reduce((sum, [, n]) => sum + n, 0);

  // Silhouette edges per row: a stackable module must have vertical flanks.
  const rows = [];
  for (let y = minY; y <= maxY; y++) {
    let l = -1;
    let r = -1;
    for (let x = minX; x <= maxX; x++) {
      if (!isOn(x, y)) continue;
      if (l === -1) l = x;
      r = x;
    }
    if (l !== -1) rows.push({ y, l, r, width: r - l + 1 });
  }
  // Width sampled top-to-bottom. A single min/max span cannot tell a flared
  // collar from a taper, and for a stackable piece the width at the MATING row
  // is the number that decides whether it fits the module below it.
  const profile = [];
  for (let i = 0; i <= 10; i++) {
    const row = rows[Math.min(rows.length - 1, Math.round((i / 10) * (rows.length - 1)))];
    profile.push({ t: i / 10, width: row.width });
  }
  const widths = rows.map((row) => row.width);
  const lefts = rows.map((row) => row.l);
  const rights = rows.map((row) => row.r);
  const span = (arr) => ({ min: Math.min(...arr), max: Math.max(...arr) });

  // Interior holes: transparent pixels inside the bbox that cannot be reached
  // from the bbox border. Their presence means the object is HOLLOW, and a
  // hollow object must NOT go through voxelizeMultiView — carving by the cross
  // product of two silhouettes fills the interior with phantom voxels (the
  // scaffold lesson, PROMPTS_IMAGENES §7). Component count cannot reveal this:
  // it measures the opaque mask, which stays connected around a hole.
  const outside = new Uint8Array(w * h);
  const flood = [];
  const seed = (x, y) => {
    if (x < minX || x > maxX || y < minY || y > maxY) return;
    const i = y * w + x;
    if (outside[i] || isOn(x, y)) return;
    outside[i] = 1;
    flood.push(i);
  };
  for (let x = minX; x <= maxX; x++) {
    seed(x, minY);
    seed(x, maxY);
  }
  for (let y = minY; y <= maxY; y++) {
    seed(minX, y);
    seed(maxX, y);
  }
  while (flood.length) {
    const cur = flood.pop();
    const cx = cur % w;
    const cy = (cur - cx) / w;
    seed(cx + 1, cy);
    seed(cx - 1, cy);
    seed(cx, cy + 1);
    seed(cx, cy - 1);
  }
  const holes = [];
  const holeSeen = new Uint8Array(w * h);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const i = y * w + x;
      if (outside[i] || isOn(x, y) || holeSeen[i]) continue;
      let size = 0;
      const st = [i];
      holeSeen[i] = 1;
      while (st.length) {
        const cur = st.pop();
        const cx = cur % w;
        const cy = (cur - cx) / w;
        size++;
        const push = (nx, ny) => {
          if (nx < minX || nx > maxX || ny < minY || ny > maxY) return;
          const n = ny * w + nx;
          if (holeSeen[n] || isOn(nx, ny)) return;
          holeSeen[n] = 1;
          st.push(n);
        };
        push(cx + 1, cy);
        push(cx - 1, cy);
        push(cx, cy + 1);
        push(cx, cy - 1);
      }
      holes.push(size);
    }
  }
  holes.sort((a, b) => b - a);

  // Feature survival (§6 thickness rule): the widest horizontal run of each
  // palette colour, expressed in VOXEL COLUMNS at the model's targetWidth. A
  // feature under ~1 column loses the downsample's majority vote and vanishes
  // from the model entirely, which no amount of staring at the sheet reveals.
  const pxPerColumn = gridColumns ? bw / gridColumns : null;
  const runs = new Map();
  for (let y = minY; y <= maxY; y++) {
    let runHex = null;
    let runLen = 0;
    const close = () => {
      if (runHex && runLen > (runs.get(runHex) ?? 0)) runs.set(runHex, runLen);
      runHex = null;
      runLen = 0;
    };
    for (let x = minX; x <= maxX; x++) {
      if (!isOn(x, y)) {
        close();
        continue;
      }
      const i = at(x, y);
      const hex = ((data[i] << 16) | (data[i + 1] << 8) | data[i + 2])
        .toString(16)
        .padStart(6, '0');
      if (hex === runHex) runLen++;
      else {
        close();
        runHex = hex;
        runLen = 1;
      }
    }
    close();
  }

  // Vertical tiling: does the top edge row match the bottom edge row, pixel
  // for pixel, in both coverage and colour?
  const rowKey = (y) => {
    const out = [];
    for (let x = minX; x <= maxX; x++) {
      if (!isOn(x, y)) {
        out.push('.');
        continue;
      }
      const i = at(x, y);
      out.push(((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]).toString(16).padStart(6, '0'));
    }
    return out;
  };
  const topRow = rowKey(minY);
  const botRow = rowKey(maxY);
  let rowMatches = 0;
  for (let i = 0; i < topRow.length; i++) if (topRow[i] === botRow[i]) rowMatches++;

  return {
    width: w,
    height: h,
    bbox: { minX, minY, maxX, maxY, bw, bh },
    aspect: bw / bh,
    opaque,
    fringe,
    components,
    colorCount: colors.length,
    topColors: colors.slice(0, 12).map(([hex, n]) => ({ hex, pct: (n / opaque) * 100 })),
    onPalettePct: palette.length ? (onPalette / opaque) * 100 : null,
    meanLuma: lumSum / opaque,
    widthSpan: span(widths),
    profile,
    pxPerColumn,
    runs: [...runs.entries()],
    holes,
    bboxArea: bw * bh,
    leftSpan: span(lefts),
    rightSpan: span(rights),
    rowMatchPct: (rowMatches / topRow.length) * 100,
  };
}, palette, gridColumns);

await browser.close();

const pct = (n) => `${n.toFixed(1)}%`;
console.log(`\n${FILE}`);
if (report.empty) {
  console.log('  EMPTY — no opaque pixels at all.');
  process.exit(1);
}
console.log(`  canvas          ${report.width}x${report.height}`);
console.log(`  content bbox    ${report.bbox.bw}x${report.bbox.bh}`);
console.log(
  `  aspect (w/h)    ${report.aspect.toFixed(3)}` +
    (targetAspect
      ? `   target ${targetAspect.toFixed(3)}   off by ${pct(
          Math.abs(report.aspect - targetAspect) / targetAspect * 100,
        )}`
      : ''),
);
console.log(`  opaque pixels   ${report.opaque}   semi-transparent fringe ${report.fringe}`);
console.log(
  `  components      ${report.components.length}` +
    (report.components.length > 1 ? `   sizes ${report.components.slice(0, 6).join(', ')}` : ''),
);
console.log(`  distinct colors ${report.colorCount}`);
if (report.onPalettePct !== null) {
  console.log(`  on-palette      ${pct(report.onPalettePct)}`);
}
console.log(`  mean luminance  ${report.meanLuma.toFixed(1)}`);
console.log('  top colors:');
const runMap = new Map(report.runs);
for (const c of report.topColors) {
  const run = runMap.get(c.hex) ?? 0;
  const cols = report.pxPerColumn ? run / report.pxPerColumn : null;
  const survives =
    cols === null ? '' : cols < 1 ? '   VANISHES at this targetWidth' : cols < 2 ? '   marginal' : '';
  console.log(
    `    #${c.hex}  ${pct(c.pct)}   widest run ${run}px` +
      (cols === null ? '' : ` = ${cols.toFixed(2)} columns${survives}`),
  );
}
console.log(
  `  row width       ${report.widthSpan.min}..${report.widthSpan.max}` +
    `   left edge ${report.leftSpan.min}..${report.leftSpan.max}` +
    `   right edge ${report.rightSpan.min}..${report.rightSpan.max}`,
);
console.log(
  `  interior holes  ${report.holes.length}` +
    (report.holes.length
      ? `   sizes ${report.holes.slice(0, 8).join(', ')}   ${pct(
          (report.holes.reduce((a, b) => a + b, 0) / report.bboxArea) * 100,
        )} of bbox   -> HOLLOW: do NOT use voxelizeMultiView`
      : '   (solid)'),
);
console.log(
  `  width profile   ${report.profile.map((p) => p.width).join(' ')}   (top -> bottom)`,
);
if (checkTileable) {
  console.log(`  top row == bottom row: ${pct(report.rowMatchPct)} of columns match`);
}
console.log('');
