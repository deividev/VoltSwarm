import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { createServer } from 'vite';
import * as THREE from 'three';

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
const config = await server.ssrLoadModule('/src/config.ts');
const enemies = await server.ssrLoadModule('/src/enemies.ts');
const registry = await server.ssrLoadModule('/src/models/registry.ts');
const voxelBuilder = await server.ssrLoadModule('/src/models/voxel-builder.ts');
after(async () => server.close());

async function readRgbaPng(path) {
  const png = await readFile(path);
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8, 'technical refs must stay 8-bit');
      assert.equal(data[9], 6, 'technical refs must stay RGBA');
    } else if (type === 'IDAT') idat.push(data);
    offset += 12 + length;
  }
  const packed = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = packed[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const raw = packed[y * (stride + 1) + 1 + x];
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upperLeft = y > 0 && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0;
      const value = filter === 0 ? raw
        : filter === 1 ? raw + left
        : filter === 2 ? raw + up
        : filter === 3 ? raw + Math.floor((left + up) / 2)
        : filter === 4 ? raw + paeth(left, up, upperLeft)
        : (() => { throw new Error(`Unsupported PNG filter ${filter}`); })();
      pixels[y * stride + x] = value & 0xff;
    }
  }
  return { width, height, pixels, rgba: (x, y) => [...pixels.subarray(y * stride + x * 4, y * stride + x * 4 + 4)] };
}

test('Voltling resolves to Furnace Mite only in Swarm Foundry', () => {
  const voltling = config.ENEMY_TYPES[0];
  assert.equal(config.resolveEnemyModelKey(voltling, config.MAPS[0].id), 'voltling');
  assert.equal(config.resolveEnemyModelKey(voltling, 'megafactory'), 'furnace-mite');

  const def = registry.VOXEL_MODELS['furnace-mite'];
  assert.ok(def, 'Furnace Mite must be registered');
  assert.equal(def.refSide, undefined, 'the swarm model must not enter voxelizeMultiView');
  assert.equal(def.sideProfileRef, 'assets/2d/ref-furnace-mite-side-v1.png');
  assert.equal(def.backPaintRef, 'assets/2d/ref-furnace-mite-back-v1.png');
  assert.equal(def.sidePaint, true);
  assert.ok(def.topCrucible, 'the approved top view must drive a stamped open crucible');
  assert.ok(def.topFootprintLegs, 'the approved top view must drive four spatial corner legs');
  assert.equal(def.bodyColor, registry.YELLOW, 'the canonical final sheets are yellow-dominant');
  assert.equal(def.recolorMap, undefined, 'final technical sheets must not be swapped again at runtime');
  assert.deepEqual(def.raisedColors, [registry.DARK], 'canonical charcoal plates must gain macro relief');
  assert.equal(def.topCrucible.rimColor, registry.DARK, 'the orange cavity needs a charcoal border');
  assert.equal(def.topPaintRef, 'assets/2d/ref-furnace-mite-top-v1.png');
  assert.deepEqual(def.topPaintColors, [registry.DARK], 'cyan top paint is stabilized by the measured macro pass');
  assert.deepEqual(def.frontOnly, [], 'the macro visor must not be buried by a two-voxel inset');
  assert.ok(def.macroSurfaceDetails, 'the 19-column grid needs measured macro surface registration');
  assert.equal(def.macroSurfaceDetails.paintDepth, 1, 'top paint must not grow cyan pillars at oblique angles');
  assert.equal(def.macroSurfaceDetails.frontPlateDepth, 2, 'the visor needs only a shallow integrated surface');
  assert.equal(def.macroSurfaceDetails.frontInset, 3, 'the visor must sit inside the source brow, not on the front bound');
  assert.deepEqual(def.macroSurfaceDetails.front.visorBands, [
    { x: [4, 14], rows: [6, 7] },
    { x: [6, 12], rows: [8, 8] },
  ]);
  assert.equal(def.macroSurfaceDetails.visorColor, registry.CYAN);
  assert.equal(def.macroSurfaceDetails.frameColor, registry.DARK);
});

test('canonical visor refs provide 2-3-row macro cyan with a charcoal frame', async () => {
  const expected = {
    front: { count: 52804, bbox: [301, 430, 722, 571] },
    side: { count: 7384, bbox: [825, 360, 876, 501] },
    top: { count: 26814, bbox: [348, 710, 674, 791] },
  };
  for (const [view, contract] of Object.entries(expected)) {
    const image = await readRgbaPng(`public/assets/2d/ref-furnace-mite-${view}-v1.png`);
    assert.deepEqual([image.width, image.height], [1024, 1024]);
    let count = 0;
    const bbox = [image.width, image.height, -1, -1];
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        if (image.rgba(x, y).join(',') !== '126,224,255,255') continue;
        count++;
        bbox[0] = Math.min(bbox[0], x);
        bbox[1] = Math.min(bbox[1], y);
        bbox[2] = Math.max(bbox[2], x);
        bbox[3] = Math.max(bbox[3], y);
      }
    }
    assert.equal(count, contract.count, `${view} cyan area drifted`);
    assert.deepEqual(bbox, contract.bbox, `${view} cyan bounds drifted`);
    const cx = Math.round((bbox[0] + bbox[2]) / 2);
    const cy = Math.round((bbox[1] + bbox[3]) / 2);
    assert.deepEqual(image.rgba(cx, bbox[1] - 1), [35, 40, 48, 255], `${view} needs a top frame`);
    assert.deepEqual(image.rgba(cx, bbox[3] + 1), [35, 40, 48, 255], `${view} needs a bottom frame`);
    assert.deepEqual(image.rgba(bbox[0] - 1, cy), [35, 40, 48, 255], `${view} needs a left frame`);
    assert.deepEqual(image.rgba(bbox[2] + 1, cy), [35, 40, 48, 255], `${view} needs a right frame`);
  }
  const back = await readRgbaPng('public/assets/2d/ref-furnace-mite-back-v1.png');
  let backCyan = 0;
  for (let y = 0; y < back.height; y++) for (let x = 0; x < back.width; x++) {
    if (back.rgba(x, y).join(',') === '126,224,255,255') backCyan++;
  }
  assert.equal(backCyan, 0, 'the rear sheet must not invent a visor');
});

test('macro surface registration preserves one integrated stepped visor with a complete frame', () => {
  const width = 19;
  const height = 15;
  const depth = 19;
  const grid = voxelBuilder.emptyGrid(width, height, depth);
  for (let y = 0; y < height; y++) {
    for (let z = 0; z < depth; z++) {
      for (let x = 0; x < width; x++) grid[y][z][x] = registry.YELLOW;
    }
  }
  const spec = registry.VOXEL_MODELS['furnace-mite'].macroSurfaceDetails;
  registry.stampMacroSurfaceDetails(grid, spec);
  assert.deepEqual([grid[0][0].length, grid.length, grid[0].length], [width, height, depth]);

  const yAtRow = (row) => height - 1 - row;
  const plateZ = depth - 1 - spec.frontInset;
  for (let row = 6; row <= 7; row++) {
    for (let x = 4; x <= 14; x++) {
      assert.equal(grid[yAtRow(row)][plateZ][x], registry.CYAN, 'front visor needs its wide 11x2 brow');
    }
    assert.equal(grid[yAtRow(row)][plateZ][3], registry.DARK, 'wide brow needs a left charcoal frame');
    assert.equal(grid[yAtRow(row)][plateZ][15], registry.DARK, 'wide brow needs a right charcoal frame');
  }
  for (let x = 6; x <= 12; x++) {
    assert.equal(grid[yAtRow(8)][plateZ][x], registry.CYAN, 'lower visor needs its centered 7x1 extension');
  }

  for (const band of spec.front.frameBands) {
    for (let row = band.rows[0]; row <= band.rows[1]; row++) {
      for (let x = band.x[0]; x <= band.x[1]; x++) {
        assert.equal(grid[yAtRow(row)][plateZ][x], registry.DARK, 'charcoal frame must follow every stepped edge');
      }
    }
  }

  const visorCells = new Set();
  for (const band of spec.front.visorBands) {
    for (let row = band.rows[0]; row <= band.rows[1]; row++) {
      for (let x = band.x[0]; x <= band.x[1]; x++) {
        visorCells.add(`${x},${row}`);
        for (let z = plateZ + 1; z < depth; z++) {
          assert.equal(grid[yAtRow(row)][z][x], null, 'visor must remain inset behind the old protruding brow');
        }
      }
    }
  }
  assert.equal(visorCells.size, 29, 'stepped visor area must stay 11x2 plus 7x1');
  const pending = [visorCells.values().next().value];
  const reached = new Set(pending);
  while (pending.length > 0) {
    const [x, row] = pending.shift().split(',').map(Number);
    for (const neighbor of [[x - 1, row], [x + 1, row], [x, row - 1], [x, row + 1]]) {
      const key = neighbor.join(',');
      if (!visorCells.has(key) || reached.has(key)) continue;
      reached.add(key);
      pending.push(key);
    }
  }
  assert.equal(reached.size, visorCells.size, 'the stepped cyan visor must remain one component');

  let rearCyan = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (grid[y][0][x] === registry.CYAN) rearCyan++;
  }
  assert.equal(rearCyan, 0, 'front macro registration must not leak cyan onto the rear shell');

  for (let row = 6; row <= 8; row++) {
    assert.equal(grid[yAtRow(row)][14][width - 1], registry.CYAN, 'side visor must align as one 3-row profile band');
  }

  for (let z = 16; z <= 17; z++) for (let x = 5; x <= 13; x++) {
    assert.equal(grid[height - 1][z][x], registry.CYAN, 'top reference needs one restrained 9x2 cyan band');
  }
});

test('the top-footprint stamp replaces the lower mass with four attached charcoal-ended legs', () => {
  const size = 19;
  const grid = voxelBuilder.emptyGrid(size, 13, size);
  // A central body plus the old extrusion-like merged lower volume.
  for (let y = 0; y <= 8; y++) {
    for (let z = y <= 5 ? 0 : 4; z <= (y <= 5 ? 18 : 14); z++) {
      for (let x = y <= 5 ? 0 : 4; x <= (y <= 5 ? 18 : 14); x++) {
        grid[y][z][x] = registry.YELLOW;
      }
    }
  }
  const spec = registry.VOXEL_MODELS['furnace-mite'].topFootprintLegs;
  registry.stampTopFootprintLegs(grid, spec);

  // On the ground layer charcoal exists only as four separated corner feet.
  const footColor = registry.DARK;
  const seen = new Set();
  let components = 0;
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const key = `${x},${z}`;
      if (grid[0][z][x] !== footColor || seen.has(key)) continue;
      components++;
      const queue = [[x, z]];
      seen.add(key);
      while (queue.length > 0) {
        const [qx, qz] = queue.shift();
        for (const [nx, nz] of [[qx - 1, qz], [qx + 1, qz], [qx, qz - 1], [qx, qz + 1]]) {
          const next = `${nx},${nz}`;
          if (nx < 0 || nx >= size || nz < 0 || nz >= size || seen.has(next)) continue;
          if (grid[0][nz][nx] !== footColor) continue;
          seen.add(next);
          queue.push([nx, nz]);
        }
      }
    }
  }
  assert.equal(components, 4, 'top-down view must retain four separate charcoal foot masses');

  // Each foot overlaps its shaft on y=1; each shaft overlaps a joint/body on
  // y=3, so all four remain one physically connected model.
  for (const [x, z] of [[1, 1], [1, 17], [17, 1], [17, 17]]) {
    assert.equal(grid[0][z][x], footColor);
    assert.notEqual(grid[1][z][x], null, 'foot must connect upward into its shaft');
  }
});

test('map variants replace geometry without adding another InstancedMesh', () => {
  const scene = new THREE.Scene();
  const map1Geometry = new THREE.BoxGeometry(1, 1, 1);
  const map2Geometry = new THREE.BoxGeometry(2, 1, 1);
  const mesh = new THREE.InstancedMesh(map1Geometry, new THREE.MeshBasicMaterial(), 288);
  scene.add(mesh);
  const instanceMatrix = mesh.instanceMatrix;
  const before = scene.children.filter((child) => child instanceof THREE.InstancedMesh).length;

  const returned = enemies.swapInstancedMeshGeometry(mesh, map2Geometry);

  assert.equal(returned, mesh, 'the original type mesh identity must survive the map swap');
  assert.equal(mesh.geometry, map2Geometry);
  assert.equal(mesh.instanceMatrix, instanceMatrix, 'instance storage must not be recreated');
  assert.equal(scene.children.filter((child) => child instanceof THREE.InstancedMesh).length, before);
  assert.equal(before, 1, 'the harness itself must contain exactly one type mesh');
});
