// Authors the three flat conversion sheets for the `foreman` character
// (front / side profile / back) and writes them to public/assets/2d/.
//
// Why hand-authored instead of AI-generated: the sheets are drawn at the
// EXACT voxel resolution of the model (33 x 50) and upscaled with nearest
// neighbour, so icon-voxelizer's downsample is a lossless 1:1 mapping —
// every cell below becomes exactly one voxel column. Nothing is lost to
// majority-vote resampling, gaps never close, and the palette is already
// the flat 4-colour set the quantizer expects (see docs/PROMPTS_IMAGENES.md
// §6 "flat sheet vs pretty render").
//
// Usage: node tools/make-foreman-sheets.mjs

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const SCALE = 24;
const OUT_DIR = 'public/assets/2d';

// Palette read off the reference render. Flat solid colours only — no
// luminance ramps needed because the sheets are authored, not rendered.
const COLORS = {
  C: [0xe7, 0xdf, 0xcb, 255], // cream armour
  Y: [0xf0, 0xb4, 0x29, 255], // hazard yellow
  D: [0x2b, 0x2e, 0x35, 255], // charcoal frame / joints
  V: [0x46, 0xd9, 0xec, 255], // cyan visor + chest core
  '.': [0, 0, 0, 0],
};

const COLS = 33;
const ROWS = 50;

// ---------------------------------------------------------------------------
// FRONT — 33 columns x 50 rows. Column landmarks (mirror axis = col 16):
//
//   gauntlets  0-5  / 27-32     head        11-21
//   arm gap    6-9  / 23-26     chest       10-22 (tapers to 11-21)
//   upper arms 3-8  / 24-29     belt/hips   10-22
//   pauldrons  2-8  / 24-30     thighs      9-14 / 18-23
//   boots      8-14 / 18-24     shins       10-14 / 18-22
//
// Every background gap is >= 2 columns wide on purpose: cleanupFront fills a
// hole whose 8-neighbourhood is 7/8 full, and a 1-column vertical gap hits
// that threshold at its top end and then CASCADES shut row by row.
// ---------------------------------------------------------------------------
const FRONT = [
  '............CCCYYYCCC............', // 0  helmet crown + crest
  '...........CCCCYYYCCCC...........', // 1
  '...........CCCCYYYCCCC...........', // 2
  '...........CCCCCCCCCCC...........', // 3
  '...........YCCCCCCCCCY...........', // 4  ear pods
  '...........CDVVVVVVVDC...........', // 5  visor
  '...........YCCCCCCCCCY...........', // 6  ear pods
  '...........YYYYDDDYYYY...........', // 7  respirator canisters
  '...........YYYYDDDYYYY...........', // 8
  '...........CCCDDDDDCCC...........', // 9  jaw
  '.............DDDDDDD.............', // 10 neck
  '..........DDDDDDDDDDDDD..........', // 11 shoulder yoke
  '.....CCCCDDDDDDDDDDDDDDDCCCC.....', // 12 pauldron caps
  '...CCCCCCDDCCCCCCCCCCCDDCCCCCC...', // 13 collar step above the chest plate
  '..YYCCCCCDCCCCCCCCCCCCCDCCCCCYY..', // 14 pauldron yellow cap
  '..YYCCCCCDCCCCCCCCCCCCCDCCCCCYY..', // 15
  '..CCCCCCCDCCYCYYYYYCYCCDCCCCCCC..', // 16 core ring top
  '..CCCCCCCDCCYCYVVVYCYCCDCCCCCCC..', // 17 core
  '..CCCCCCCDCCYCYVVVYCYCCDCCCCCCC..', // 18
  '..CCCCCCCDCCYCYVVVYCYCCDCCCCCCC..', // 19
  '..YYDDYYCDCCYCYYYYYCYCCDCYYDDYY..', // 20 pauldron hazard edge
  '..CCCCCC..CCCCCCCCCCCCC..CCCCCC..', // 21 arm/body gap opens
  '..CYYCCC..CCCCCCCCCCCCC..CCCYYC..', // 22 arm patch
  '.DDDDDDD..DDDDDDDDDDDDD..DDDDDDD.', // 23 elbow + waist
  '.DDDDDDD..CCCCCYYYCCCCC..DDDDDDD.', // 24 belt
  'YYCCCCC...CCCCCYDYCCCCC...CCCCCYY', // 25 gauntlets + buckle
  'YYCCCCC...CCCCCYYYCCCCC...CCCCCYY', // 26
  'YYCCCCC...DDDDDDDDDDDDD...CCCCCYY', // 27 hips
  'YYCCCCC..CCCCCC...CCCCCC..CCCCCYY', // 28 thighs
  'YYCCCCC..CCCCCC...CCCCCC..CCCCCYY', // 29
  'CCCCCCC..CCYYCC...CCYYCC..CCCCCCC', // 30 thigh plates
  'YYYYYYY..CCCCCC...CCCCCC..YYYYYYY', // 31 gauntlet band
  'CCCCCCC..CCCCCC...CCCCCC..CCCCCCC', // 32
  'CDDDDDC..CCCCCC...CCCCCC..CDDDDDC', // 33 gauntlet port
  'DDDDDDD..CCCCCC...CCCCCC..DDDDDDD', // 34 gauntlet base
  '.........DDDDDD...DDDDDD.........', // 35 knee joint
  '.........YYYYYY...YYYYYY.........', // 36 knee caps
  '.........YYYYYY...YYYYYY.........', // 37
  '..........YYYYY...YYYYY..........', // 38
  '..........CCCCC...CCCCC..........', // 39 shins
  '..........CYYYC...CYYYC..........', // 40 shin plate
  '..........CCCCC...CCCCC..........', // 41
  '..........CCCCC...CCCCC..........', // 42
  '..........CCCCC...CCCCC..........', // 43
  '..........DDDDD...DDDDD..........', // 44 ankles
  '.........CCCCCC...CCCCCC.........', // 45 instep
  '........YYYYYYY...YYYYYYY........', // 46 boots
  '........YYYYYYY...YYYYYYY........', // 47
  '.......YYYYYYYY...YYYYYYYY.......', // 48 splayed toe
  '.......DDDDDDDD...DDDDDDDD.......', // 49 soles
];

// ---------------------------------------------------------------------------
// SIDE PROFILE — object's FRONT at the RIGHT edge. Only the per-row FILLED
// COUNT is read (icon-voxelizer measures half-depth as round(filled / 2)),
// but it is drawn as a real profile so it stays reviewable by eye.
// ---------------------------------------------------------------------------
// Depths are tuned against how icon-voxelizer consumes them, not by eye:
// half-depth per row is round(filled / 2), then the left-right falloff scales
// it by sqrt(1 - t²) and QUANTIZES to even steps. That last step is a cliff —
// a column needs rawDepth >= 3 to reach half-depth 4 instead of 2. The v2
// sheet capped the torso at half-depth 4, which left the gauntlet columns
// (t ~= 0.79) at half-depth 2, i.e. flat paddles. Deeper rows here lift them
// over the cliff without inflating the near-centre volumes.
const SIDE_SPANS = [
  [2, 11], [2, 11], [2, 11], [2, 11], [2, 11], // 0-4  helmet
  [2, 11], [2, 11], [2, 12], [2, 12], [2, 11], // 5-9  respirators jut forward
  [5, 10], [5, 10], [1, 11], [1, 11], [1, 12], // 10-14 neck, then shoulders
  [1, 12], [1, 12], [1, 12], [1, 12], [1, 12], // 15-19 chest bulges forward
  [1, 12], [1, 11], [1, 11], [2, 10], [2, 11], // 20-24 lower chest, waist tuck
  [2, 11], [2, 11], [1, 11], [2, 11], [2, 11], // 25-29 belt, hips, thighs
  [2, 11], [2, 11], [2, 11], [2, 11], [2, 11], // 30-34
  [2, 10], [2, 10], [2, 10], [2, 10], [4, 9], // 35-39 knees, then shins
  [4, 9], [4, 9], [4, 9], [4, 9], [4, 9], //      40-44
  [3, 11], [0, 12], [0, 12], [0, 12], [0, 12], // 45-49 boots reach forward
];
const SIDE_COLS = 13;

// ---------------------------------------------------------------------------
// BACK — identical silhouette to the front (rows must align column for
// column), repainted: no visor, no respirators, no chest core. Nape panel and
// a vertical spine strip instead.
// ---------------------------------------------------------------------------
const BACK_OVERRIDES = {
  5: '...........CCCCCCCCCCC...........', // no visor
  7: '...........CDDDDDDDDDC...........', // nape panel
  8: '...........CDDDDDDDDDC...........',
  16: '..CCCCCCCDCCDCCYYYCCDCCDCCCCCCC..', // spine strip + back vents
  17: '..CCCCCCCDCCDCCYYYCCDCCDCCCCCCC..',
  18: '..CCCCCCCDCCDCCYYYCCDCCDCCCCCCC..',
  19: '..CCCCCCCDCCDCCYYYCCDCCDCCCCCCC..',
  20: '..YYDDYYCDCCDCCYYYCCDCCDCYYDDYY..',
  21: '..CCCCCC..CCCCCYYYCCCCC..CCCCCC..',
  22: '..CYYCCC..CCCCCYYYCCCCC..CCCYYC..',
  33: 'CCCCCCC..CCCCCC...CCCCCC..CCCCCCC', // gauntlet backs are closed
};

const buildBack = () =>
  FRONT.map((row, y) => (BACK_OVERRIDES[y] ?? row).replaceAll('V', 'C'));

const sideRows = () =>
  SIDE_SPANS.map(([from, to]) => {
    let row = '';
    for (let x = 0; x < SIDE_COLS; x++) row += x >= from && x <= to ? 'C' : '.';
    return row;
  });

// --- PNG writing (no dependencies; pngjs is not installed in this repo) -----

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function writePng(path, rows) {
  const cols = rows[0].length;
  const width = cols * SCALE;
  const height = rows.length * SCALE;
  // One filter byte (0 = none) per scanline, then RGBA.
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
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(path, png);
  console.log(`${path} — ${width}x${height} (${cols}x${rows.length} cells)`);
}

function assertGrid(name, rows, cols) {
  if (rows.length !== ROWS) throw new Error(`${name} has ${rows.length} rows, expected ${ROWS}`);
  rows.forEach((row, y) => {
    if (row.length !== cols) {
      throw new Error(`${name} row ${y} is ${row.length} chars, expected ${cols}`);
    }
    for (const ch of row) if (!(ch in COLORS)) throw new Error(`${name} row ${y}: bad char '${ch}'`);
  });
}

/** Robots in this art direction are symmetric; the voxelizer only mirrors
 *  SHAPE, never colour, so colour asymmetry would ship as damage. */
function assertMirrored(name, rows) {
  rows.forEach((row, y) => {
    const mirrored = [...row].reverse().join('');
    if (row !== mirrored) {
      throw new Error(`${name} row ${y} is not symmetric:\n  ${row}\n  ${mirrored}`);
    }
  });
}

/** Any background gap narrower than 2 columns is cascaded shut by
 *  cleanupFront's pinhole rule — catch it here, not in the render. */
function assertGapsSurvive(name, rows) {
  rows.forEach((row, y) => {
    const first = row.search(/[CYDV]/);
    const last = row.length - 1 - [...row].reverse().join('').search(/[CYDV]/);
    if (first < 0) return;
    for (const match of row.slice(first, last).matchAll(/\.+/g)) {
      if (match[0].length < 2) {
        throw new Error(
          `${name} row ${y}: interior gap at col ${first + match.index} is only ` +
            `${match[0].length} column wide and cleanupFront will close it`,
        );
      }
    }
  });
}

const back = buildBack();
const side = sideRows();
assertGrid('FRONT', FRONT, COLS);
assertGrid('BACK', back, COLS);
assertGrid('SIDE', side, SIDE_COLS);
assertMirrored('FRONT', FRONT);
assertMirrored('BACK', back);
assertGapsSurvive('FRONT', FRONT);
assertGapsSurvive('BACK', back);

writePng(`${OUT_DIR}/ref-foreman-front-v1.png`, FRONT);
writePng(`${OUT_DIR}/ref-foreman-side-v1.png`, side);
writePng(`${OUT_DIR}/ref-foreman-back-v1.png`, back);
