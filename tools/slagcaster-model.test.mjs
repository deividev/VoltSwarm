import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { createServer } from 'vite';
import * as THREE from 'three';

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
const config = await server.ssrLoadModule('/src/config.ts');
const registry = await server.ssrLoadModule('/src/models/registry.ts');
const enemies = await server.ssrLoadModule('/src/enemies.ts');
const transform = await server.ssrLoadModule('/src/models/slagcaster-transform.ts');
const enemyProjectiles = await server.ssrLoadModule('/src/enemy-projectiles.ts');
after(async () => server.close());

async function readRgbaPng(path) {
  const png = await readFile(path);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
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
      assert.equal(data[8], 8, `${path} must stay 8-bit`);
      assert.equal(data[9], 6, `${path} must stay RGBA`);
    } else if (type === 'IDAT') idat.push(data);
    offset += length + 12;
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
  return { width, height, pixels };
}

test('Slagcaster registers two preview-only measured-profile endpoints', () => {
  const runtime = registry.VOXEL_MODELS.slagcaster;
  const closed = registry.VOXEL_MODELS['slagcaster-closed'];
  const deployed = registry.VOXEL_MODELS['slagcaster-deployed'];
  assert.ok(runtime);
  assert.ok(closed);
  assert.ok(deployed);
  for (const def of [closed, deployed]) {
    assert.equal(def.kind, 'enemy');
    assert.equal(def.refSide, undefined, 'swarm endpoint must not enter voxelizeMultiView');
    assert.equal(def.sidePaint, true);
    assert.equal(def.asymmetric, true, 'the lateral cannon silhouette must not be mirrored shut');
    assert.equal(def.voxelSize, 0.030273, 'both endpoints need one shared voxel pitch');
    assert.equal(def.bodyColor, registry.SLAGCASTER_OLIVE);
    assert.deepEqual(def.palette, [registry.SLAGCASTER_OLIVE, registry.DARK, registry.SLAGCASTER_AMBER]);
  }
  assert.equal(closed.originAtCenter, true, 'the moving ball must rotate about its own centre');
  assert.equal(closed.sphericalDepth, true);
  assert.ok(deployed.targetWidth > closed.targetWidth, 'deployment must preserve its wider braced footprint');
  assert.equal(runtime.slagcasterTransform, true);
  assert.equal(runtime.ref, deployed.ref);
  assert.match(runtime.ref, /deployed-front-v3\.png$/);
  assert.match(runtime.sideProfileRef, /deployed-side-v3\.png$/);
  assert.match(runtime.backPaintRef, /deployed-back-v3\.png$/);
  assert.equal(runtime.sideProfileBodyFraction, 27 / 47);
  assert.equal(runtime.voxelSize, closed.voxelSize);
});

test('deployed v2 sheets correct front/back handedness without changing the side profile', async () => {
  for (const view of ['front', 'back']) {
    const v1 = await readRgbaPng(`public/assets/2d/ref-slagcaster-deployed-${view}-v1.png`);
    const v2 = await readRgbaPng(`public/assets/2d/ref-slagcaster-deployed-${view}-v2.png`);
    assert.deepEqual([v2.width, v2.height], [v1.width, v1.height]);
    const mirrored = Buffer.alloc(v1.pixels.length);
    for (let y = 0; y < v1.height; y++) for (let x = 0; x < v1.width; x++) {
      const source = (y * v1.width + (v1.width - 1 - x)) * 4;
      v1.pixels.copy(mirrored, (y * v2.width + x) * 4, source, source + 4);
    }
    assert.deepEqual(v2.pixels, mirrored, `${view} v2 must be the exact handedness correction`);
  }
  const sideV1 = await readRgbaPng('public/assets/2d/ref-slagcaster-deployed-side-v1.png');
  const sideV2 = await readRgbaPng('public/assets/2d/ref-slagcaster-deployed-side-v2.png');
  assert.deepEqual(sideV2.pixels, sideV1.pixels, 'side firing direction must not change');
});

function colorComponents(image, rgba) {
  const visited = new Uint8Array(image.width * image.height);
  const components = [];
  const matches = (pixel) => {
    const offset = pixel * 4;
    return rgba.every((value, channel) => image.pixels[offset + channel] === value);
  };
  for (let pixel = 0; pixel < visited.length; pixel++) {
    if (visited[pixel] || !matches(pixel)) continue;
    const stack = [pixel];
    visited[pixel] = 1;
    let x0 = image.width;
    let y0 = image.height;
    let x1 = -1;
    let y1 = -1;
    let count = 0;
    while (stack.length) {
      const current = stack.pop();
      const x = current % image.width;
      const y = Math.floor(current / image.width);
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
      count++;
      for (const next of [current - 1, current + 1, current - image.width, current + image.width]) {
        if (next < 0 || next >= visited.length || visited[next] || !matches(next)) continue;
        const nextX = next % image.width;
        if (Math.abs(nextX - x) > 1) continue;
        visited[next] = 1;
        stack.push(next);
      }
    }
    components.push({ x0, y0, x1, y1, width: x1 - x0 + 1, height: y1 - y0 + 1, count });
  }
  return components;
}

test('deployed v3 sheet has a narrow central visor and separate viewer-right muzzle', async () => {
  const front = await readRgbaPng('public/assets/2d/ref-slagcaster-deployed-front-v3.png');
  const amber = colorComponents(front, [255, 168, 3, 255]);
  const visor = amber.find((part) => part.x0 > 300 && part.x1 < 650 && part.y0 > 320 && part.y1 < 560);
  const muzzle = amber.find((part) => part.x0 > 700 && part.y0 > 300 && part.y1 < 600);
  assert.ok(visor, 'v3 needs a distinct central visor');
  assert.ok(muzzle, 'v3 needs a distinct viewer-right muzzle');
  assert.ok(visor.width <= 160, `central amber opening is still too wide: ${visor.width}`);
  assert.ok(muzzle.height >= 64, `side muzzle must remain a large physical signal: ${muzzle.height}`);
});

test('deployed side-v3 is a pure profile with a torso-mounted right-firing cannon', async () => {
  const side = await readRgbaPng('public/assets/2d/ref-slagcaster-deployed-side-v3.png');
  assert.deepEqual([side.width, side.height], [1024, 1024]);
  const occupied = (x, y) => side.pixels[(y * side.width + x) * 4 + 3] === 255;

  // The normalized sheet is a 47x37 lattice of 19px cells at (65, 160).
  // Rows 11..16 cross the torso pivot and barrel without a gap: this is the
  // regression guard against the rejected rear/spine-mounted reading.
  for (let row = 11; row <= 16; row++) {
    const y = 160 + row * 19 + 9;
    for (let column = 23; column <= 46; column++) {
      assert.equal(occupied(65 + column * 19 + 9, y), true, `side cannon disconnect at row ${row}, column ${column}`);
    }
  }

  const bodyRight = 65 + 26 * 19 + 18;
  const muzzleLeft = 65 + 46 * 19;
  assert.ok(muzzleLeft - bodyRight >= 19 * 19, 'barrel must extend horizontally well beyond the body');
  assert.equal(
    side.pixels[((160 + 13 * 19 + 9) * side.width + (65 + 46 * 19 + 9)) * 4],
    255,
    'far-right side muzzle must stay amber',
  );

  // Below the cannon band, the silhouette returns to the compact body/feet;
  // a three-quarter pose would leak the barrel/leg mass into these rows.
  for (let row = 20; row < 37; row++) {
    const y = 160 + row * 19 + 9;
    for (let column = 27; column < 47; column++) {
      assert.equal(occupied(65 + column * 19 + 9, y), false, `non-profile mass at row ${row}, column ${column}`);
    }
  }
});

test('Slagcaster replaces Gunner only in Swarm Foundry', () => {
  const gunner = config.ENEMY_TYPES.find((type) => type.name === 'Gunner');
  assert.ok(gunner);
  assert.equal(config.resolveEnemyModelKey(gunner, config.MAPS[0].id), 'gunner');
  assert.equal(config.resolveEnemyModelKey(gunner, 'megafactory'), 'slagcaster');
});

test('one InstancedMesh holds independent deployment progress per Slagcaster', () => {
  const source = new THREE.BoxGeometry(2, 2, 2);
  const geometry = transform.makeSlagcasterTransformGeometry(
    source,
    3,
    1.2,
    config.SLAGCASTER.transform,
  );
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), 3);
  const scene = new THREE.Scene();
  scene.add(mesh);
  const identity = mesh;
  assert.equal(transform.setSlagcasterDeploymentAt(mesh, 0, 0.2), true);
  assert.equal(transform.setSlagcasterDeploymentAt(mesh, 1, 0.85), true);
  const progress = geometry.getAttribute(transform.SLAGCASTER_DEPLOY_ATTRIBUTE);
  assert.ok(progress instanceof THREE.InstancedBufferAttribute);
  assert.ok(Math.abs(progress.getX(0) - 0.2) < 1e-6);
  assert.ok(Math.abs(progress.getX(1) - 0.85) < 1e-6);
  assert.equal(mesh, identity);
  assert.equal(scene.children.filter((child) => child instanceof THREE.InstancedMesh).length, 1);
});

test('runtime semantic cannon occupies viewer-right and packs into the closed ball', () => {
  const closedDef = registry.VOXEL_MODELS['slagcaster-closed'];
  const body = new THREE.BoxGeometry(1, 2, 1);
  body.translate(0, 1, 0);
  const coloredBody = body.toNonIndexed();
  body.dispose();
  coloredBody.setAttribute(
    'color',
    new THREE.BufferAttribute(new Float32Array(coloredBody.getAttribute('position').count * 3), 3),
  );
  const geometry = transform.addSlagcasterCannonGeometry(
    coloredBody,
    config.SLAGCASTER.cannonGeometry,
  );
  const cannonHint = geometry.getAttribute(transform.SLAGCASTER_CANNON_HINT_ATTRIBUTE);
  geometry.computeBoundingBox();
  const stampedBounds = new THREE.Box3();
  const stampedPoint = new THREE.Vector3();
  const stampedPosition = geometry.getAttribute('position');
  for (let i = 0; i < stampedPosition.count; i++) {
    if (cannonHint.getX(i) <= 0.5) continue;
    stampedBounds.expandByPoint(stampedPoint.fromBufferAttribute(stampedPosition, i));
  }
  assert.ok(stampedBounds.min.x > 0, 'physical cannon must stay on local +X');
  // Measured against the REAL model, not a magic number. The front sheet's 55
  // columns already INCLUDE the cannon, so the stamp has to reach past the
  // torso (which frontAppendageFraction cuts at column 36 of 55) and stop at
  // the model's own right edge. Overshooting that is what left the cannon
  // floating five voxels clear of the silhouette with a dark slab bridging it.
  const runtime = registry.VOXEL_MODELS.slagcaster;
  const halfWidth = (runtime.targetWidth * runtime.voxelSize) / 2;
  const torsoRightEdge =
    Math.round(runtime.frontAppendageRect.fromX * runtime.targetWidth) * runtime.voxelSize - halfWidth;
  assert.ok(
    stampedBounds.min.x < torsoRightEdge,
    'the cannon must start inside the torso so the volumes connect',
  );
  assert.ok(
    stampedBounds.max.x > torsoRightEdge,
    'physical cannon must protrude beyond the torso',
  );
  // The cannon must not be one flat dark mass. It was, while the geometry was
  // calibrated to the pre-retouch side sheet, and at gameplay size it read as a
  // featureless slab bolted to the flank. The retouched side v3 paints its
  // spine olive and its root amber, so all three palette colours must survive
  // into the stamped vertices.
  const cannonColors = new Set();
  const colorAttr = geometry.getAttribute('color');
  for (let i = 0; i < colorAttr.count; i++) {
    if (cannonHint.getX(i) <= 0.5) continue;
    cannonColors.add(
      [colorAttr.getX(i), colorAttr.getY(i), colorAttr.getZ(i)]
        .map((v) => Math.round(v * 255))
        .join(','),
    );
  }
  assert.ok(
    cannonColors.size >= 3,
    `cannon must carry the sheet's three colours, got ${cannonColors.size}: ${[...cannonColors]}`,
  );

  // One voxel of tolerance, not zero: the sheet's muzzle ring is CLIPPED by its
  // own canvas edge (a 15-cell disc centred on column 48 of 55 wants column 55,
  // which does not exist), and the model should not inherit a canvas artefact.
  // The bug this guards is the cannon floating FIVE voxels clear of the body,
  // which this still catches.
  assert.ok(
    stampedBounds.max.x <= halfWidth + runtime.voxelSize + 1e-6,
    `cannon must stop at the sheet's own silhouette (${halfWidth}), got ${stampedBounds.max.x}`,
  );
  assert.ok(
    stampedBounds.max.z >= config.SLAGCASTER.muzzle.forward - 1e-6,
    'barrel/bore must project forward in +Z',
  );
  assert.ok(Math.abs(config.SLAGCASTER.muzzle.lateral - config.SLAGCASTER.cannonGeometry.barrel.center[0]) < 1e-9);
  assert.ok(Math.abs(config.SLAGCASTER.muzzle.forward - stampedBounds.max.z) < 1e-6);

  const neck = config.SLAGCASTER.cannonGeometry.neck;
  const barrel = config.SLAGCASTER.cannonGeometry.barrel;
  const ring = config.SLAGCASTER.cannonGeometry.muzzleRing;
  const span = (piece, axis) => [
    piece.center[axis] - piece.size[axis] / 2,
    piece.center[axis] + piece.size[axis] / 2,
  ];
  const overlaps = (a, b, axis) => {
    const [aLo, aHi] = span(a, axis);
    const [bLo, bHi] = span(b, axis);
    return aHi > bLo && bHi > aLo;
  };
  assert.ok(
    overlaps(neck, barrel, 0) && overlaps(neck, barrel, 1) && overlaps(neck, barrel, 2),
    'neck and barrel volumes must overlap on all three axes',
  );
  // The joint has to stay a STALK. It read as a wide cube welded to the flank
  // while its depth was a guess (user 2026-08-22), and depth is the axis no
  // sheet constrains — so it is the one that needs a guard.
  assert.ok(
    neck.size[2] < barrel.size[2] && neck.size[1] <= barrel.size[1],
    `neck must stay slimmer than the barrel it feeds, got ${neck.size} vs ${barrel.size}`,
  );
  // Every cannon dimension must be a whole number of voxels. Authoring in world
  // units is what put its edges mid-voxel and made it read as a smooth
  // primitive glued to a voxel body.
  for (const [name, piece] of Object.entries(config.SLAGCASTER.cannonGeometry)) {
    if (name === 'muzzleRing') continue;
    for (const value of piece.size) {
      const cells = value / runtime.voxelSize;
      assert.ok(
        Math.abs(cells - Math.round(cells)) < 1e-6,
        `${name} must be a whole number of voxels, got ${cells}`,
      );
    }
  }
  assert.ok(
    barrel.center[2] + barrel.size[2] / 2 > ring.zFrom,
    'barrel and muzzle ring must overlap',
  );
  assert.ok(
    Math.abs(ring.zTo - config.SLAGCASTER.muzzle.forward) < 1e-9,
    'the visible muzzle face IS the projectile socket',
  );
  // The barrel is split into a lower body and three top segments so the olive
  // spine is its own solid, so no single piece sits on the axis any more —
  // what must hold is that the ring's axis runs through the barrel.
  const cannonSpanY = [
    Math.min(...['barrel', 'barrelTopNear', 'barrelTopSpine', 'barrelTopFar']
      .map((k) => span(config.SLAGCASTER.cannonGeometry[k], 1)[0])),
    Math.max(...['barrel', 'barrelTopNear', 'barrelTopSpine', 'barrelTopFar']
      .map((k) => span(config.SLAGCASTER.cannonGeometry[k], 1)[1])),
  ];
  const [barrelLoX, barrelHiX] = span(barrel, 0);
  assert.ok(
    ring.center[0] > barrelLoX && ring.center[0] < barrelHiX,
    'the ring axis must run through the barrel in X',
  );
  assert.ok(
    ring.center[1] > cannonSpanY[0] && ring.center[1] < cannonSpanY[1],
    'the ring axis must run through the barrel in Y',
  );
  // Ordered radii are what make it a ring: collapse any two and the muzzle
  // silently becomes a disc again, which is the look this replaced.
  assert.ok(
    ring.boreRadius < ring.ringInnerRadius &&
      ring.ringInnerRadius < ring.ringOuterRadius &&
      ring.ringOuterRadius < ring.outerRadius,
    'muzzle bands must be strictly ordered bore < inner rim < olive < outer rim',
  );
  // Every band must be at least one stamp cell wide or it does not exist.
  for (const [name, width] of [
    ['bore', ring.boreRadius],
    ['inner rim', ring.ringInnerRadius - ring.boreRadius],
    ['olive band', ring.ringOuterRadius - ring.ringInnerRadius],
    ['outer rim', ring.outerRadius - ring.ringOuterRadius],
  ]) {
    assert.ok(
      width >= ring.voxel - 1e-9,
      `${name} must be at least one voxel wide, got ${width}`,
    );
  }
  assert.ok(
    ring.outerRadius > barrel.size[0] / 2,
    'the muzzle ring must be wider than the barrel it sits on',
  );

  transform.makeSlagcasterTransformGeometry(
    geometry,
    1,
    closedDef.targetWidth * closedDef.voxelSize,
    config.SLAGCASTER.transform,
  );
  geometry.computeBoundingBox();
  const center = geometry.boundingBox.getCenter(new THREE.Vector3());
  const position = geometry.getAttribute('position');
  const closed = geometry.getAttribute('slagClosedPosition');
  const parts = geometry.getAttribute('slagPartId');
  const radius = (closedDef.targetWidth * closedDef.voxelSize) / 2;
  let cannonVertices = 0;
  let cannonMinX = Infinity;
  let cannonMaxX = -Infinity;
  for (let i = 0; i < position.count; i++) {
    if (parts.getX(i) !== transform.SLAGCASTER_PART.cannon) continue;
    cannonVertices++;
    cannonMinX = Math.min(cannonMinX, position.getX(i));
    cannonMaxX = Math.max(cannonMaxX, position.getX(i));
    const packedRadius = Math.hypot(
      closed.getX(i),
      closed.getY(i) - radius,
      closed.getZ(i),
    );
    assert.ok(Math.abs(packedRadius - radius) < 1e-5, 'cannon vertex must pack onto the ball');
  }
  assert.ok(cannonVertices > 0);
  assert.ok(cannonMinX > 0, 'semantic cannon must stay entirely on model-local/viewer right');
  assert.ok(cannonMaxX - center.x > 0.5, 'deployed cannon must protrude laterally from the body');
  geometry.dispose();
});

test('Slagcaster muzzle socket follows the model yaw convention', () => {
  const at = (heading) => enemies.writeSlagcasterMuzzleWorld({ x: 0, z: 0 }, 10, 20, heading, 1);
  const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
  let muzzle = at(0);
  close(muzzle.x, 10 + config.SLAGCASTER.muzzle.lateral);
  close(muzzle.z, 20 + config.SLAGCASTER.muzzle.forward);
  muzzle = at(Math.PI / 2);
  close(muzzle.x, 10 + config.SLAGCASTER.muzzle.forward);
  close(muzzle.z, 20 - config.SLAGCASTER.muzzle.lateral);
  muzzle = at(Math.PI);
  close(muzzle.x, 10 - config.SLAGCASTER.muzzle.lateral);
  close(muzzle.z, 20 - config.SLAGCASTER.muzzle.forward);
});

test('Slagcaster deployment is deterministic and firing waits for the planted endpoint', () => {
  assert.equal(enemies.advanceSlagcasterDeployment(0, true, config.SLAGCASTER.deployDurationS), 1);
  assert.equal(enemies.advanceSlagcasterDeployment(1, false, config.SLAGCASTER.retractDurationS), 0);
  assert.equal(enemies.canSlagcasterFire(0.998, true), false);
  assert.equal(enemies.canSlagcasterFire(1, false), false);
  assert.equal(enemies.canSlagcasterFire(1, true), true);

  const gunnerIndex = config.ENEMY_TYPES.findIndex((type) => type.name === 'Gunner');
  const enemy = {
    typeIndex: gunnerIndex,
    x: 0,
    z: 0,
    speed: config.ENEMY_TYPES[gunnerIndex].speed,
    heading: 0,
    phase: -1,
    deploymentProgress: 0.4,
    slagRollAngle: 0,
    slagFirstShotTimer: config.SLAGCASTER.firstShotDelayS,
    scale: config.ENEMY_TYPES[gunnerIndex].scale,
  };
  const firedCalls = [];
  const projectiles = { fire: (...args) => firedCalls.push(args) };
  const system = Object.create(enemies.EnemySystem.prototype);
  system.currentMapId = 'megafactory';
  system.moveGunner(enemy, 0.05, 0, 10, projectiles, []);
  assert.equal(firedCalls.length, 0, 'a partially deployed Slagcaster must not fire');
  enemy.deploymentProgress = 0.998;
  enemy.phase = -1;
  enemy.slagFirstShotTimer = 0;
  system.moveGunner(enemy, 0.01, 0, 10, projectiles, []);
  assert.equal(firedCalls.length, 0, 'crossing fully deployed must start the first-shot delay');
  assert.equal(enemy.slagFirstShotTimer, config.SLAGCASTER.firstShotDelayS);
  system.moveGunner(enemy, 0.19, 0, 10, projectiles, []);
  assert.equal(firedCalls.length, 0, 'the planted pose must read before the first shot');
  system.moveGunner(enemy, 0.02, 0, 10, projectiles, []);
  assert.equal(firedCalls.length, 1);
  const firstShot = firedCalls[0];
  const expectedMuzzle = enemies.writeSlagcasterMuzzleWorld(
    { x: 0, z: 0 },
    enemy.x,
    enemy.z,
    enemy.heading,
    enemy.scale,
  );
  assert.ok(Math.abs(firstShot[0] - expectedMuzzle.x) < 1e-9);
  assert.ok(Math.abs(firstShot[1] - expectedMuzzle.z) < 1e-9);
  const targetLength = Math.hypot(0 - firstShot[0], 10 - firstShot[1]);
  assert.ok(Math.abs(firstShot[2] - (0 - firstShot[0]) / targetLength) < 1e-9);
  assert.ok(Math.abs(firstShot[3] - (10 - firstShot[1]) / targetLength) < 1e-9);
  assert.equal(firstShot[6], 'slagcaster');

  system.moveGunner(enemy, 2.9, 0, 10, projectiles, []);
  assert.equal(firedCalls.length, 1, 'repeat fire must retain the three-second cooldown');
  system.moveGunner(enemy, 0.11, 0, 10, projectiles, []);
  assert.equal(firedCalls.length, 2);

  enemy.deploymentProgress = 1;
  enemy.slagFirstShotTimer = 0;
  enemy.phase = -1;
  system.moveGunner(enemy, 0.05, 0, 15, projectiles, []);
  assert.equal(firedCalls.length, 2, 'a moving/retracting Slagcaster must not fire');
  assert.ok(enemy.deploymentProgress < 1);
});

test('Slagcaster stays grounded throughout deployment and rolls around its ball centre', () => {
  const source = new THREE.SphereGeometry(1, 12, 8);
  source.translate(0, 1, 0);
  const geometry = transform.makeSlagcasterTransformGeometry(
    source,
    1,
    config.SLAGCASTER.rollingRadius * 2,
    config.SLAGCASTER.transform,
  );
  const deployed = geometry.getAttribute('position');
  const closed = geometry.getAttribute('slagClosedPosition');
  const parts = geometry.getAttribute('slagPartId');
  for (const progress of [0, 0.5, 1]) {
    const matrix = transform.composeSlagcasterInstanceMatrix(
      new THREE.Matrix4(),
      0.7,
      Math.PI * 0.73,
      progress,
      1,
      0,
      0,
      config.SLAGCASTER.rollingRadius,
    );
    let minY = Infinity;
    for (let i = 0; i < deployed.count; i++) {
      const t = transform.slagcasterPartProgress(parts.getX(i), progress, config.SLAGCASTER.transform);
      const point = new THREE.Vector3(
        THREE.MathUtils.lerp(closed.getX(i), deployed.getX(i), t),
        THREE.MathUtils.lerp(closed.getY(i), deployed.getY(i), t),
        THREE.MathUtils.lerp(closed.getZ(i), deployed.getZ(i), t),
      ).applyMatrix4(matrix);
      minY = Math.min(minY, point.y);
    }
    assert.ok(minY >= -1e-6, `progress ${progress} crossed the floor: ${minY}`);
  }
});

test('Foundry-only range and slag projectile stay isolated from legacy Gunner', () => {
  assert.equal(config.SLAGCASTER.preferredDist, 14);
  assert.equal(config.GUNNER.preferredDist, 12);
  assert.equal(config.GUNNER.projectileSpeed, 12, 'dodge timing must not speed up');
  assert.ok(config.SLAGCASTER.projectile.visualDiameter > config.GUNNER.projectileRadius * 2);
  assert.ok(
    config.SLAGCASTER.projectile.collisionRadius < config.SLAGCASTER.projectile.visualDiameter / 2,
    'visual silhouette must be slightly more generous than its collider',
  );
  assert.equal(
    enemyProjectiles.enemyShotCollisionRadius('gunner'),
    config.GUNNER.projectileRadius,
  );
  assert.equal(
    enemyProjectiles.enemyShotCollisionRadius('slagcaster'),
    config.SLAGCASTER.projectile.collisionRadius,
  );

  const gunnerIndex = config.ENEMY_TYPES.findIndex((type) => type.name === 'Gunner');
  const enemy = {
    typeIndex: gunnerIndex,
    x: 0,
    z: 0,
    speed: config.ENEMY_TYPES[gunnerIndex].speed,
    heading: 0,
    phase: -1,
    deploymentProgress: 1,
    slagRollAngle: 0,
    slagFirstShotTimer: 0,
    scale: config.ENEMY_TYPES[gunnerIndex].scale,
  };
  const legacyCalls = [];
  const system = Object.create(enemies.EnemySystem.prototype);
  system.currentMapId = 'megafactory';
  const foundryStartX = enemy.x;
  enemy.deploymentProgress = 0;
  enemy.phase = 1;
  system.moveGunner(enemy, 0.1, 13, 0, { fire: () => {} }, []);
  assert.equal(enemy.x, foundryStartX, 'Foundry Slagcaster must plant at 13 units');
  assert.ok(enemy.deploymentProgress > 0, 'Foundry Slagcaster must begin deploying at 13 units');

  enemy.x = 0;
  enemy.z = 0;
  enemy.phase = -1;
  system.currentMapId = config.MAPS[0].id;
  system.moveGunner(enemy, 0, 0, 10, { fire: (...args) => legacyCalls.push(args) }, []);
  assert.equal(legacyCalls.length, 1);
  assert.deepEqual(
    [legacyCalls[0][0], legacyCalls[0][1], legacyCalls[0][6]],
    [enemy.x, enemy.z, 'gunner'],
    'Map 1 must keep the legacy center spawn and projectile kind',
  );
});

test('runtime Slagcaster bolt geometry stays visibly ahead of its collider', () => {
  const geometry = enemyProjectiles.buildSlagBoltGeometry();
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  assert.ok(bounds);
  const size = bounds.getSize(new THREE.Vector3());
  const forwardMargin = bounds.max.z - config.SLAGCASTER.projectile.collisionRadius;
  assert.ok(
    forwardMargin >= 0.08,
    `visible forward extent must lead the collider by >= 0.08, got ${forwardMargin}`,
  );
  assert.ok(bounds.min.z < 0, 'the ember tail must remain behind the projectile origin');
  assert.ok(
    Math.abs(size.x - config.SLAGCASTER.projectile.visualDiameter) <= 1e-6,
    `measured X span ${size.x} must match visualDiameter`,
  );
  assert.ok(
    Math.abs(size.y - config.SLAGCASTER.projectile.visualDiameter) <= 1e-6,
    `measured Y span ${size.y} must match visualDiameter`,
  );
  geometry.dispose();
});

test('all Slagcaster runtime sheets are 1024 RGBA with hard alpha and one flat palette', async () => {
  const approved = new Set([
    '120,130,57,255',
    '35,40,48,255',
    '255,168,3,255',
  ]);
  const sheets = [
    ...['front', 'side', 'back'].map((view) => `ref-slagcaster-closed-${view}-v1.png`),
    ...['front', 'side', 'back'].flatMap((view) => [
      `ref-slagcaster-deployed-${view}-v1.png`,
      `ref-slagcaster-deployed-${view}-v2.png`,
      `ref-slagcaster-deployed-${view}-v3.png`,
    ]),
  ];
  for (const sheet of sheets) {
    const path = `public/assets/2d/${sheet}`;
    const image = await readRgbaPng(path);
    assert.deepEqual([image.width, image.height], [1024, 1024], `${path} dimensions drifted`);
    const colors = new Set();
    let transparent = 0;
    let opaque = 0;
    for (let i = 0; i < image.pixels.length; i += 4) {
      const alpha = image.pixels[i + 3];
      assert.ok(alpha === 0 || alpha === 255, `${path} contains alpha fringe ${alpha}`);
      if (alpha === 0) {
        transparent++;
        continue;
      }
      opaque++;
      colors.add([...image.pixels.subarray(i, i + 4)].join(','));
    }
    assert.ok(transparent > 0 && opaque > 0, `${path} must contain silhouette and transparency`);
    assert.deepEqual(colors, approved, `${path} palette drifted`);
  }
});
