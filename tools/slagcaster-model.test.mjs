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
    assert.equal(def.voxelSize, 0.045, 'both endpoints need one shared voxel pitch');
    assert.equal(def.bodyColor, registry.SLAGCASTER_OLIVE);
    assert.deepEqual(def.palette, [registry.SLAGCASTER_OLIVE, registry.DARK, registry.SLAGCASTER_AMBER]);
  }
  assert.equal(closed.originAtCenter, true, 'the moving ball must rotate about its own centre');
  assert.equal(closed.sphericalDepth, true);
  assert.ok(deployed.targetWidth > closed.targetWidth, 'deployment must preserve its wider braced footprint');
  assert.equal(runtime.slagcasterTransform, true);
  assert.equal(runtime.ref, deployed.ref);
  assert.equal(runtime.voxelSize, closed.voxelSize);
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
  const firedKinds = [];
  const system = Object.create(enemies.EnemySystem.prototype);
  system.currentMapId = 'megafactory';
  system.moveGunner(enemy, 0.05, 0, 10, { fire: (...args) => firedKinds.push(args[6]) }, []);
  assert.equal(firedKinds.length, 0, 'a partially deployed Slagcaster must not fire');
  enemy.deploymentProgress = 0.998;
  enemy.phase = -1;
  enemy.slagFirstShotTimer = 0;
  system.moveGunner(enemy, 0.01, 0, 10, { fire: (...args) => firedKinds.push(args[6]) }, []);
  assert.equal(firedKinds.length, 0, 'crossing fully deployed must start the first-shot delay');
  assert.equal(enemy.slagFirstShotTimer, config.SLAGCASTER.firstShotDelayS);
  system.moveGunner(enemy, 0.19, 0, 10, { fire: (...args) => firedKinds.push(args[6]) }, []);
  assert.equal(firedKinds.length, 0, 'the planted pose must read before the first shot');
  system.moveGunner(enemy, 0.02, 0, 10, { fire: (...args) => firedKinds.push(args[6]) }, []);
  assert.deepEqual(firedKinds, ['slagcaster']);

  system.moveGunner(enemy, 2.9, 0, 10, { fire: (...args) => firedKinds.push(args[6]) }, []);
  assert.equal(firedKinds.length, 1, 'repeat fire must retain the three-second cooldown');
  system.moveGunner(enemy, 0.11, 0, 10, { fire: (...args) => firedKinds.push(args[6]) }, []);
  assert.deepEqual(firedKinds, ['slagcaster', 'slagcaster']);

  enemy.deploymentProgress = 1;
  enemy.slagFirstShotTimer = 0;
  enemy.phase = -1;
  system.moveGunner(enemy, 0.05, 0, 15, { fire: (...args) => firedKinds.push(args[6]) }, []);
  assert.equal(firedKinds.length, 2, 'a moving/retracting Slagcaster must not fire');
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
  const kinds = [];
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
  system.moveGunner(enemy, 0, 0, 10, { fire: (...args) => kinds.push(args[6]) }, []);
  assert.deepEqual(kinds, ['gunner'], 'Map 1 must keep the legacy projectile kind');
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

test('all six Slagcaster sheets are 1024 RGBA with hard alpha and one flat palette', async () => {
  const approved = new Set([
    '120,130,57,255',
    '35,40,48,255',
    '255,168,3,255',
  ]);
  for (const state of ['closed', 'deployed']) for (const view of ['front', 'side', 'back']) {
    const path = `public/assets/2d/ref-slagcaster-${state}-${view}-v1.png`;
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
