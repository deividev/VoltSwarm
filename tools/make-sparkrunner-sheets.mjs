// Authors the three flat conversion sheets for the `sparkrunner` enemy
// (front / side profile / back) and writes them to public/assets/2d/.
//
// v6 (2026-08-04) replaces the Codex-generated v5 set. What v5 got wrong,
// measured off assets/preview and the 45-degree model capture:
//
//   * The arms were not arms. They were the OUTER THIRD OF THE TORSO SLAB,
//     separated by a one-column notch that the depth pass then filled to the
//     same depth as the chest, so in 3D the whole upper body read as a single
//     featureless box.
//   * The legs ended in flat boots, so a swarm gliding across the floor at
//     8.5 u/s looked like it was hovering. Wheels give the slide a reason.
//   * Three colours over 4151 voxels, with the amber visor as the only
//     detail above the waist.
//
// Hand-authored rather than AI-generated for the same reason as the foreman
// (tools/make-foreman-sheets.mjs): the sheets are drawn at the model's EXACT
// voxel resolution (25 x 60) and upscaled with nearest neighbour, so
// icon-voxelizer's downsample is a lossless 1:1 mapping. Every cell below
// becomes exactly one voxel column, gaps never close, and the palette is
// already the flat set the quantizer expects.
//
// Usage: node tools/make-sparkrunner-sheets.mjs

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const SCALE = 24;
const OUT_DIR = 'public/assets/2d';

// The three registry constants the enemy already ships with, and no more. A
// fourth seam tone (TESLA_DEEP) was drawn into an earlier v6 pass and then
// removed: on a hull this saturated it was invisible at the game camera while
// still fragmenting the mesh, so it bought speckle at distance and nothing up
// close. Detail on this model comes from SHAPE — separated limbs, sunk joints,
// a protruding tyre — not from a wider palette.
const COLORS = {
  C: [0x2e, 0xe6, 0xde, 255], // ELECTRIC_CYAN — hull
  D: [0x23, 0x28, 0x30, 255], // DARK — joints, frame, tyres
  A: [0xff, 0xd2, 0x4a, 255], // AMBER — visor, chest lamp, hazard caps, hubs
  '.': [0, 0, 0, 0],
};

const COLS = 25;
const ROWS = 60;

// ---------------------------------------------------------------------------
// FRONT — 25 columns x 60 rows. Column landmarks (mirror axis = col 12):
//
//   arms       0-4  / 20-24      head       8-16
//   arm gap    5-6  / 18-19      visor      9-15
//   torso      7-17              crest      10-14
//   legs       7-10 / 14-17      wheels     7-10 / 14-17 (rows 51-59)
//
// Every interior gap is >= 2 columns on purpose: cleanupFront fills a hole
// whose 8-neighbourhood is 7/8 full, and a 1-column gap hits that at its top
// end and then CASCADES shut. The arm gap opens BELOW a solid shoulder yoke
// (rows 15-16) — that was the v5 lesson in reverse: thin joints read as
// floating arms, so the arm has to hang off a bar, not off nothing.
// ---------------------------------------------------------------------------
const FRONT = [
  '..........CDADC..........', // 0  sensor crest + amber pilot lamp
  '..........CDADC..........', // 1
  '.........CCDDDCC.........', // 2
  '........CCCCCCCCC........', // 3  helmet crown
  '........CCCCCCCCC........', // 4
  '.......DCCCCCCCCCD.......', // 5  ear pods
  '.......DCAAAAAAACD.......', // 6  visor
  '.......DCAAAAAAACD.......', // 7
  '.......DCAAAAAAACD.......', // 8
  '.......DCCCCCCCCCD.......', // 9
  '........CCCCCCCCC........', // 10
  '........CDDDDDDDC........', // 11 chin vent
  '........CCCCCCCCC........', // 12
  '..........DDDDD..........', // 13 neck
  '..........DDDDD..........', // 14
  'CCCCCDDDDDDDDDDDDDDDCCCCC', // 15 shoulder yoke — arms fuse here
  'CAAACDDDDDDDDDDDDDDDCAAAC', // 16 pauldron hazard caps
  'CCCCC..CCCCCCCCCCC..CCCCC', // 17 arm gap opens
  'CCCCC..CCCCCCCCCCC..CCCCC', // 18
  'CCCCC..CCCCCCCCCCC..CCCCC', // 19
  'CCCCC..CCCDDDDDCCC..CCCCC', // 20 chest lamp bezel
  'CCCCC..CCCDAAADCCC..CCCCC', // 21 chest lamp
  'CCCCC..CCCDAAADCCC..CCCCC', // 22
  'CCCCC..CCCDDDDDCCC..CCCCC', // 23
  'CCCCC..CCCCCCCCCCC..CCCCC', // 24
  'CCCCC..CCCCCCCCCCC..CCCCC', // 25
  'DDDDD..CCCCCCCCCCC..DDDDD', // 26 elbow
  'DDDDD..CCCCCCCCCCC..DDDDD', // 27
  '.CCCC..CCCCCCCCCCC..CCCC.', // 28 forearm steps in
  '.CCCC..CDDDDDDDDDC..CCCC.', // 29 waist band
  '.CCCC..CDDDDDDDDDC..CCCC.', // 30
  '.CCCC..CCCCCCCCCCC..CCCC.', // 31
  '.CCCC..CCCCCCCCCCC..CCCC.', // 32
  '.CCCC..CCCCCCCCCCC..CCCC.', // 33
  '.CCCC..CCCCCCCCCCC..CCCC.', // 34
  '.CCCC...CCCCCCCCC...CCCC.', // 35 waist tucks
  '.DDDD...CCCCCCCCC...DDDD.', // 36 grippers
  '.DDDD...CCCCCCCCC...DDDD.', // 37
  '..DD....DDDDDDDDD....DD..', // 38 gripper tips + pelvis
  '........DDDDDDDDD........', // 39
  '.......DDDDDDDDDDD.......', // 40 hip flare
  '.......CCCC...CCCC.......', // 41 legs
  '.......CCCC...CCCC.......', // 42
  '.......CCCC...CCCC.......', // 43
  '.......CCCC...CCCC.......', // 44
  '.......CCCC...CCCC.......', // 45
  '.......CCCC...CCCC.......', // 46
  '.......DDDD...DDDD.......', // 47 knee
  // Rows 48-50 stay HULL-coloured on purpose: a dark strut here merged with
  // the dark tyre below into one shapeless mass, which is what made the first
  // wheel pass read as a boot. The cyan gap is what lets the tyre end.
  '.......CCCC...CCCC.......', // 48
  '.......CCCC...CCCC.......', // 49
  '.......CCCC...CCCC.......', // 50
  '.......DDDD...DDDD.......', // 51 wheel band — RESHAPED IN CODE, see below
  '.......DDDD...DDDD.......', // 52
  '.......DDDD...DDDD.......', // 53
  '.......DAAD...DAAD.......', // 54
  '.......DAAD...DAAD.......', // 55
  '.......DAAD...DAAD.......', // 56
  '.......DDDD...DDDD.......', // 57
  '.......DDDD...DDDD.......', // 58
  '.......DDDD...DDDD.......', // 59
];

// The wheel band (rows 51-59) is authored as a plain block on purpose. A round
// tyre CANNOT come out of this pipeline: the extruder scales every column's
// depth by sqrt(1 - t^2) about its segment centre, so at this model's scale the
// outer wheel columns land on half-depth 2 while the inner ones land on 4 — a
// stepped wedge, not a tyre. registry.ts stamps the real cylinders into the
// finished grid instead (`wheels`); these rows only have to carry the right
// silhouette width and reach row 59 so the bbox maps 1:1.
//
// The FIRST attempt at this failed for a reason worth writing down: the wheel
// was given the same depth as the leg above it, so it never broke the leg's
// silhouette and simply read as a darker boot. A wheel is only legible when it
// BULGES past its strut, so the leg rows below are deliberately shallow
// (half-depth 2) while the tyre is stamped at radius 4.
const WHEEL_BAND_FROM = 51;

// ---------------------------------------------------------------------------
// SIDE PROFILE — object's FRONT at the RIGHT edge. icon-voxelizer only reads
// the per-row FILLED COUNT (half-depth = round(filled / 2)), but it is drawn
// as a real profile so it stays reviewable by eye.
//
// The chest rows deliberately span the full 10 columns: that is what fixes the
// sheet's content bbox at 10 x 60, which makes sideGridW resolve to exactly 10
// and keeps the side downsample 1:1 like the other two.
//
// Depth is the model's single biggest triangle lever, and not for the obvious
// reason. buildGridGeometry merges rectangles PER Z SLICE, so a face whose
// normal points along X or Y cannot merge across depth at all — it costs one
// rectangle per slice it spans. Separating the arms from the torso adds six
// more X-facing walls, and every extra voxel of depth is charged against all
// of them, which is why the chest tops out at half-depth 5 here.
// ---------------------------------------------------------------------------
const SIDE_COLS = 10;
const SIDE_SPANS = [
  [4, 5], [4, 5], [4, 5], [2, 8], [2, 8], // 0-4   crest, then crown
  [1, 8], [1, 8], [1, 8], [1, 8], [1, 8], // 5-9   head
  [1, 8], [1, 8], [1, 8], [3, 7], [3, 7], // 10-14 jaw, neck
  [0, 8], [0, 8], [0, 9], [0, 9], [0, 9], // 15-19 yoke, then chest
  [0, 9], [0, 9], [0, 9], [0, 9], [0, 9], // 20-24 chest is the deepest volume
  [0, 9], [0, 9], [0, 9], [0, 8], [0, 8], // 25-29 elbow line, then abdomen
  [0, 8], [0, 8], [0, 8], [0, 8], [0, 8], // 30-34
  [1, 8], [0, 7], [0, 7], [0, 7], [1, 8], // 35-39 waist, grippers, pelvis
  [1, 8], [3, 6], [3, 6], [3, 6], [3, 6], // 40-44 pelvis, then SHALLOW legs so
  [3, 6], [3, 6], [3, 6], [3, 6], [3, 6], // 45-49 the tyre bulges past them
  [3, 6], [2, 7], [2, 7], [2, 7], [2, 7], // 50-54 wheels (stamped over)
  [2, 7], [2, 7], [2, 7], [2, 7], [2, 7], // 55-59
];

// ---------------------------------------------------------------------------
// BACK — identical silhouette to the front (rows align column for column),
// repainted: no visor, no intake, no chest core. A dark spine channel and a
// seam-toned back plate instead. The hazard bands DO wrap, so they stay.
// ---------------------------------------------------------------------------
const BACK_OVERRIDES = {
  6: '.......DCCDDDDDCCD.......', // nape channel replaces the visor
  7: '.......DCCDDDDDCCD.......',
  8: '.......DCCDDDDDCCD.......',
  11: '........CCCCCCCCC........', // no chin vent on the back of the head
  20: 'CCCCC..CCCCCCCCCCC..CCCCC', // no lamp bezel on the back
  21: 'CCCCC..CCCDDDDDCCC..CCCCC', // spine channel replaces the chest lamp
  22: 'CCCCC..CCCDDDDDCCC..CCCCC',
  23: 'CCCCC..CCCCCCCCCCC..CCCCC',
};

const buildBack = () => FRONT.map((row, y) => BACK_OVERRIDES[y] ?? row);

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
    const first = row.search(/[CDA]/);
    if (first < 0) throw new Error(`${name} row ${y} is empty; the bbox would not map 1:1`);
    const last = row.length - 1 - [...row].reverse().join('').search(/[CDA]/);
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

/** cleanupFront also DROPS any cell with <= 1 filled neighbour, and because it
 *  writes in place that erases a thin spur from the tip down. */
function assertNoOrphans(name, rows) {
  const at = (x, y) => (rows[y]?.[x] ?? '.') !== '.';
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '.') continue;
      let filled = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (at(x + dx, y + dy)) filled++;
        }
      }
      if (filled <= 1) {
        throw new Error(`${name} cell (${x}, ${y}) has ${filled} neighbours and will be dropped`);
      }
    }
  });
}

/** The 1:1 downsample only holds while the content bbox is the whole grid. */
function assertBboxIsFullGrid(name, rows, cols) {
  const touched = (x) => rows.some((row) => row[x] !== '.');
  if (!touched(0) || !touched(cols - 1)) {
    throw new Error(`${name}: content must reach both edge columns for a 1:1 downsample`);
  }
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
assertNoOrphans('FRONT', FRONT);
assertNoOrphans('BACK', back);
assertBboxIsFullGrid('FRONT', FRONT, COLS);
assertBboxIsFullGrid('BACK', back, COLS);
assertBboxIsFullGrid('SIDE', side, SIDE_COLS);

/** The registry's wheel stamp is addressed in GRID coordinates (y counted from
 *  the bottom), so the two files have to agree. Fail loudly if they drift. */
const WHEEL_CENTER_Y = 4;
const WHEEL_RADIUS = 4;
if (ROWS - 1 - WHEEL_BAND_FROM !== WHEEL_CENTER_Y + WHEEL_RADIUS) {
  throw new Error('wheel band in this sheet no longer matches registry.wheels');
}

writePng(`${OUT_DIR}/ref-sparkrunner-front-v6.png`, FRONT);
writePng(`${OUT_DIR}/ref-sparkrunner-side-v6.png`, side);
writePng(`${OUT_DIR}/ref-sparkrunner-back-v6.png`, back);
