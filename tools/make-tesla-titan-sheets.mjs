// Rebuilds the Tesla Titan's three conversion sheets with real surface detail.
//
// WHY: the v1 reference is a bare column with three flat ring slabs and almost
// no interior detail, so the model came out at 8 059 voxels / 6 592 triangles
// against the Crusher King's 27 740 / 13 480 — it read as stacked discs next to
// a boss with a face, arms and panelling. Raising targetWidth alone would NOT
// have fixed it: there was nothing inside the sheet to resolve. The detail has
// to exist in the reference first.
//
// AUTHORED, not AI-generated: this design is geometric and radially regular
// (a coil tower), which is exactly the case where hand-authoring at the model's
// own voxel resolution beats a generated sheet — the downsample becomes a
// lossless 1:1 mapping, and the result is deterministic and re-runnable.
//
// Usage: node tools/make-tesla-titan-sheets.mjs [--debug]

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const SCALE = 14;
const OUT_DIR = 'public/assets/2d';
const DEBUG = process.argv.includes('--debug');

const COLS = 45;
const ROWS = 76;
const MID = (COLS - 1) / 2; // 22

// Palette. E/C/D/A are the model's existing four; T is a NEW deep teal added
// so panel seams can read without punching full charcoal holes in a bright
// cyan hull — same "3-step ramp of one hue" convention the container, scaffold
// and barrel families already use.
const COLORS = {
  E: [0x2e, 0xe6, 0xde, 255], // electric cyan — hull
  C: [0x7e, 0xe0, 0xff, 255], // pale cyan — rings, emissive trim
  T: [0x1a, 0x7d, 0x78, 255], // deep teal — panel seams and recesses
  D: [0x23, 0x28, 0x30, 255], // charcoal — frame, vents, base
  A: [0xff, 0xd2, 0x4a, 255], // amber — visor
  '.': [0, 0, 0, 0],
};

// ---------------------------------------------------------------------------
// Drawing helpers. Every shape is drawn from the CENTRE outward with a
// half-width, which makes symmetry structural instead of something to verify
// afterwards — the voxelizer mirrors shape but never colour, so an asymmetric
// sheet would ship as damage.
// ---------------------------------------------------------------------------
function blank() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill('.'));
}
/** Horizontal span centred on MID, `half` columns either side. */
function bar(g, row, half, ch) {
  if (row < 0 || row >= ROWS) return;
  for (let x = Math.round(MID - half); x <= Math.round(MID + half); x++) {
    if (x >= 0 && x < COLS) g[row][x] = ch;
  }
}
function block(g, y0, y1, half, ch) {
  for (let y = y0; y <= y1; y++) bar(g, y, half, ch);
}
/** Mirrored pair of cells at +-`off` from centre. */
function pair(g, row, off, ch) {
  if (row < 0 || row >= ROWS) return;
  const a = Math.round(MID - off);
  const b = Math.round(MID + off);
  if (a >= 0) g[row][a] = ch;
  if (b < COLS) g[row][b] = ch;
}
/** Mirrored pair of spans — the workhorse for vents and notches. */
function pairSpan(g, row, from, to, ch) {
  for (let o = from; o <= to; o++) pair(g, row, o, ch);
}

// ---------------------------------------------------------------------------
// The tower. Same silhouette as v1 (crown, head, three rings, segmented
// column, armoured base) with the detail v1 never had: coil windings, panel
// seams, ring notches, emitter nodes and vented feet.
// ---------------------------------------------------------------------------

/** One of the three energy rings, with radial notches so it reads as an
 *  engineered emitter instead of a dinner plate. */
function ring(g, top) {
  block(g, top + 0, top + 0, 11, 'C');
  block(g, top + 1, top + 3, 16, 'C');
  block(g, top + 4, top + 4, 13, 'C');
  block(g, top + 5, top + 5, 9, 'E');
  // Radial notches: seam pairs punched at regular offsets across the disc.
  for (const off of [6, 10, 14]) {
    pair(g, top + 1, off, 'T');
    pair(g, top + 2, off, 'D');
    pair(g, top + 3, off, 'T');
  }
  // Emitter nodes at the rim.
  pair(g, top + 2, 16, 'E');
  // Underside shadow line so stacked rings do not merge into one mass.
  block(g, top + 4, top + 4, 13, 'C');
  pairSpan(g, top + 4, 0, 4, 'T');
}

/** A column segment between rings: coil windings plus a central conduit. */
function coil(g, y0, y1, half) {
  block(g, y0, y1, half, 'E');
  for (let y = y0; y <= y1; y++) {
    // Winding: every other row is a recessed band, so the column reads as
    // wound wire rather than an extruded box.
    if ((y - y0) % 2 === 1) {
      pairSpan(g, y, half - 2, half, 'T');
      pairSpan(g, y, 0, 1, 'T');
    }
    // Vertical conduit up the middle, bright so it reads as carried charge.
    if ((y - y0) % 4 === 2) bar(g, y, 1, 'C');
  }
  // Panel seams down both flanks.
  for (let y = y0 + 1; y < y1; y += 3) pair(g, y, half - 1, 'D');
}

function buildFront() {
  const g = blank();

  // Crown emitter.
  block(g, 0, 1, 2, 'C');
  block(g, 2, 2, 4, 'C');
  block(g, 3, 4, 6, 'E');
  bar(g, 3, 2, 'C');
  pairSpan(g, 4, 4, 6, 'T');

  // Head housing.
  block(g, 5, 5, 8, 'E');
  block(g, 6, 12, 10, 'E');
  pairSpan(g, 6, 8, 10, 'D'); // side vents
  pairSpan(g, 7, 8, 10, 'T');
  pairSpan(g, 8, 8, 10, 'D');
  block(g, 9, 10, 7, 'A'); // visor band
  pairSpan(g, 9, 6, 7, 'D'); // visor housing edges
  pairSpan(g, 10, 6, 7, 'D');
  block(g, 11, 11, 6, 'D'); // jaw grille
  bar(g, 11, 2, 'T');
  block(g, 12, 12, 8, 'E');
  // Neck.
  block(g, 13, 14, 4, 'D');
  pair(g, 13, 5, 'T');

  ring(g, 15);
  coil(g, 21, 32, 6);
  ring(g, 33);
  coil(g, 39, 50, 6);
  ring(g, 51);
  coil(g, 57, 65, 7);

  // Armoured base: three stepped tiers with vents and clawed feet.
  block(g, 66, 68, 9, 'D');
  pairSpan(g, 67, 4, 6, 'T');
  block(g, 69, 71, 13, 'D');
  pairSpan(g, 70, 8, 10, 'C'); // base emitters
  block(g, 72, 73, 17, 'D');
  pairSpan(g, 72, 12, 13, 'T');
  block(g, 74, 75, 19, 'D');
  // Foot claws: notch the outline so the base is not a slab.
  pairSpan(g, 74, 6, 8, '.');
  pairSpan(g, 75, 5, 9, '.');
  return g;
}

/** Side view. The tower is radially regular, so the SILHOUETTE matches the
 *  front; only the face changes — the visor is replaced by a cooling stack, and
 *  the flank carries its own panel run. */
function buildSide() {
  const g = buildFront();
  for (let y = 5; y <= 12; y++) {
    for (let x = 0; x < COLS; x++) if (g[y][x] === 'A') g[y][x] = 'T';
  }
  // Flank cooling stack over the head.
  block(g, 8, 10, 6, 'D');
  pairSpan(g, 9, 0, 3, 'T');
  return g;
}

/** Back view. Same hull; the visor becomes an access hatch and the spine gets
 *  a conduit run, so a back view neither repeats the face nor goes blank. */
function buildBack() {
  const g = buildFront();
  for (let y = 5; y <= 12; y++) {
    for (let x = 0; x < COLS; x++) if (g[y][x] === 'A') g[y][x] = 'D';
  }
  block(g, 9, 10, 5, 'D');
  bar(g, 9, 2, 'T');
  bar(g, 10, 2, 'T');
  // Spine conduit down the column segments.
  for (let y = 22; y <= 64; y += 2) bar(g, y, 1, 'C');
  return g;
}

// ---------------------------------------------------------------------------
// Validation — the same checks the other sheet generators learned the hard way.
// ---------------------------------------------------------------------------
function pieces(rows) {
  const seen = Array.from({ length: ROWS }, () => new Array(COLS).fill(false));
  const sizes = [];
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      if (rows[y][x] === '.' || seen[y][x]) continue;
      let n = 0;
      const st = [[x, y]];
      seen[y][x] = true;
      while (st.length) {
        const [cx, cy] = st.pop();
        n++;
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
          if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
          if (rows[ny][nx] === '.' || seen[ny][nx]) continue;
          seen[ny][nx] = true;
          st.push([nx, ny]);
        }
      }
      sizes.push(n);
    }
  return sizes.sort((a, b) => b - a);
}

function validate(name, g) {
  g.forEach((row, y) => {
    if (row.length !== COLS) throw new Error(`${name} row ${y}: ${row.length} cols`);
    const mirrored = [...row].reverse();
    for (let x = 0; x < COLS; x++) {
      if (row[x] !== mirrored[x]) throw new Error(`${name} row ${y} is not symmetric`);
    }
  });
  const p = pieces(g);
  if (p.length !== 1) {
    throw new Error(`${name} is ${p.length} pieces (sizes ${p.join(',')}); must be exactly 1`);
  }
  const filled = g.flat().filter((c) => c !== '.').length;
  console.log(`${name}: OK — 1 contiguous piece, ${filled} filled cells`);
  return filled;
}

// ---------------------------------------------------------------------------
// PNG writer (same minimal encoder the other sheet tools use).
// ---------------------------------------------------------------------------
let CRC = null;
function crc32(buf) {
  if (!CRC) {
    CRC = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC[n] = c;
    }
  }
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
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
  const width = COLS * SCALE;
  const height = ROWS * SCALE;
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
  console.log(`${path} — ${width}x${height} (${COLS}x${ROWS} cells)`);
}

const front = buildFront();
const side = buildSide();
const back = buildBack();

if (DEBUG) {
  console.log('\nFRONT:');
  front.forEach((r, i) => console.log(String(i).padStart(2), r.join('')));
}

validate('FRONT', front);
validate('SIDE', side);
validate('BACK', back);

writePng(`${OUT_DIR}/ref-tesla-titan-front-v2.png`, front);
writePng(`${OUT_DIR}/ref-tesla-titan-side-v2.png`, side);
writePng(`${OUT_DIR}/ref-tesla-titan-back-v2.png`, back);
