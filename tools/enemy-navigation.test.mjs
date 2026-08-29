import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const { EnemySystem, CHARGE } = await server.ssrLoadModule('/src/enemies.ts');
const config = await server.ssrLoadModule('/src/config.ts');
const { VOXEL_MODELS } = await server.ssrLoadModule('/src/models/registry.ts');
after(async () => server.close());
const typeIndex = (name) => config.ENEMY_TYPES.findIndex((type) => type.name === name);
const enemy = (name, overrides = {}) => ({ active: true, typeIndex: typeIndex(name), slot: 0, gen: 1, x: 0, z: 0, prevX: 0, prevZ: 0, speed: 1, radius: config.ENEMY_TYPES[typeIndex(name)].radius, heading: 0, chargeState: CHARGE.approach, avoidanceObstacle: null, avoidanceSide: 0, avoidanceSourceEnemy: null, avoidanceSourceGeneration: -1, ...overrides });
const systemWith = (pool) => { const system = Object.create(EnemySystem.prototype); Object.assign(system, { pool, grid: new Map(), dynamicObstacles: [], combinedObstacles: [], activeBosses: [] }); return system; };

test('lunging Crusher remains an early clear-radius navigation obstacle', () => {
  const boss = enemy('Crusher King', { slot: 1, z: 10, prevZ: 10, chargeState: CHARGE.lunging }); const rustbrute = enemy('Rustbrute', { slot: 2, chargeState: CHARGE.lunging }); const system = systemWith([boss, rustbrute]);
  const obstacles = system.rebuildDynamicObstacles([]);
  assert.equal(obstacles.find((entry) => entry.sourceEnemy === boss)?.radius, config.BOSS.clearRadius); assert.ok(!obstacles.some((entry) => entry.sourceEnemy === rustbrute));
  const chaser = enemy('Voltling'); assert.notEqual(system.steerAroundObstacles(chaser, 0, 1, obstacles).x, 0);
});
test('boss contact correction keeps the boss fixed and never projects to clearRadius', () => {
  const normal = enemy('Voltling'); const boss = enemy('Crusher King', { slot: 1 }); const system = systemWith([normal, boss]); system.separate(); assert.deepEqual({ x: boss.x, z: boss.z }, { x: 0, z: 0 }); normal.x = 0; normal.z = 0; system.resolveBossSeparation(); assert.deepEqual({ x: boss.x, z: boss.z }, { x: 0, z: 0 }); const correctionDistance = Math.hypot(normal.x, normal.z); assert.ok(Math.abs(correctionDistance - (boss.radius + normal.radius)) < 1e-9); assert.ok(correctionDistance < config.BOSS.clearRadius);
});
test('Crusher size preserves voxel fidelity, boss hierarchy, and gate steering room', () => {
  const crusher = config.ENEMY_TYPES[typeIndex('Crusher King')]; const rustbrute = config.ENEMY_TYPES[typeIndex('Rustbrute')]; assert.equal(crusher.scale, 3.1); assert.equal(crusher.radius, 2.6);
  const crusherModel = VOXEL_MODELS['crusher-king']; const rustbruteModel = VOXEL_MODELS.rustbrute; const crusherBodyWidth = crusherModel.targetWidth * crusherModel.voxelSize * crusher.scale; const physicalDiameter = crusher.radius * 2; assert.ok(physicalDiameter / crusherBodyWidth >= 0.85);
  const maxEliteRustbruteWidth = rustbruteModel.targetWidth * rustbruteModel.voxelSize * rustbrute.scale * config.ELITES.scaleMultiplier; assert.ok(crusherBodyWidth >= maxEliteRustbruteWidth * 1.5);
  const innerColliderOffset = Math.min(...config.CONTAINER_PROP.colliderOffsets); const physicalOpening = 2 * (config.CONTAINER_PROP.gapHalf + config.CONTAINER_PROP.length / 2 + innerColliderOffset - config.CONTAINER_PROP.colliderRadius); const steeringCorridor = physicalOpening - 2 * (crusher.radius + config.ENEMIES.obstacleAvoidance.clearance); assert.ok(steeringCorridor >= 4);
  const maxColliderOffset = Math.max(...config.CONTAINER_PROP.colliderOffsets.map((offset) => Math.abs(offset))); const gateReach = config.CONTAINER_PROP.gapHalf + config.CONTAINER_PROP.length / 2 + maxColliderOffset + config.CONTAINER_PROP.colliderRadius; assert.ok(config.CONTAINER_PROP.minSeparation >= 2 * gateReach);
});
test('stationary boss CCD catches a full crossing on the entry side', () => {
  const normal = enemy('Voltling', { prevX: -6, x: 6 }); const boss = enemy('Crusher King', { slot: 1 }); systemWith([normal, boss]).resolveBossSeparation(); assert.deepEqual({ x: boss.x, z: boss.z }, { x: 0, z: 0 }); assert.ok(normal.x < 0); assert.ok(Math.hypot(normal.x, normal.z) >= boss.radius + normal.radius - 1e-9); assert.ok(Math.hypot(normal.x, normal.z) < config.BOSS.clearRadius);
});
test('initial overlap cannot pop through to the far side', () => {
  const normal = enemy('Voltling', { prevX: -1, x: 5 }); const boss = enemy('Crusher King', { slot: 1 }); systemWith([normal, boss]).resolveBossSeparation(); assert.ok(normal.x < 0); assert.ok(Math.hypot(normal.x, normal.z) >= boss.radius + normal.radius - 1e-9); assert.ok(Math.hypot(normal.x, normal.z) < config.BOSS.clearRadius);
});
test('relative sweep catches a moving boss without changing its trajectory', () => {
  const normal = enemy('Voltling'); const boss = enemy('Crusher King', { slot: 1, prevX: -6, x: 6 }); systemWith([normal, boss]).resolveBossSeparation(); assert.deepEqual({ prevX: boss.prevX, x: boss.x, z: boss.z }, { prevX: -6, x: 6, z: 0 }); assert.ok(normal.x > boss.x); assert.ok(Math.hypot(normal.x - boss.x, normal.z - boss.z) >= boss.radius + normal.radius - 1e-9);
});
test('oblique sweep preserves tangential remainder instead of stopping at contact', () => {
  const normal = enemy('Voltling', { prevX: -6, prevZ: -1, x: 6, z: 3 }); const boss = enemy('Crusher King', { slot: 1 }); systemWith([normal, boss]).resolveBossSeparation(); const distance = Math.hypot(normal.x, normal.z); assert.ok(normal.x < 0); assert.ok(normal.z > -1); assert.ok(distance > boss.radius + normal.radius + 0.1);
});
test('CCD covers all six normal enemy types', () => {
  for (const [slot, name] of ['Voltling', 'Sparkrunner', 'Rustbrute', 'Roller', 'Gunner', 'Drone'].entries()) { const normal = enemy(name, { slot, prevX: -6, x: 6 }); const boss = enemy('Crusher King', { slot: 20 }); systemWith([normal, boss]).resolveBossSeparation(); assert.ok(normal.x < 0, name); assert.ok(Math.hypot(normal.x, normal.z) >= boss.radius + normal.radius - 1e-9, name); assert.deepEqual({ x: boss.x, z: boss.z }, { x: 0, z: 0 }, name); }
});
test('CCD catches a normal-separation push into a boss', () => {
  const boss = enemy('Crusher King', { slot: 2 }); const contactRadius = boss.radius + config.ENEMY_TYPES[typeIndex('Voltling')].radius; const normal = enemy('Voltling', { prevX: contactRadius + 0.1, x: contactRadius + 0.1 }); const pusher = enemy('Voltling', { slot: 1, prevX: contactRadius + 0.6, x: contactRadius + 0.6 }); const system = systemWith([normal, pusher, boss]); system.separate(); assert.ok(Math.hypot(normal.x, normal.z) < boss.radius + normal.radius); system.resolveBossSeparation(); assert.ok(Math.hypot(normal.x, normal.z) >= boss.radius + normal.radius - 1e-9); assert.deepEqual({ x: boss.x, z: boss.z }, { x: 0, z: 0 });
});
test('Crusher charge direction and obstacle tangent side stay locked', () => {
  const boss = enemy('Crusher King', { heading: Math.PI / 2, speed: 10, chargeState: CHARGE.lunging }); const system = systemWith([boss]); system.moveChase(boss, 0.1, 0, -10, []); assert.ok(Math.abs(boss.x - 1) < 1e-9); assert.ok(Math.abs(boss.z) < 1e-9); assert.equal(boss.heading, Math.PI / 2);
  const chaser = enemy('Voltling'); const obstacle = { x: 0.01, z: 2, radius: 1 }; const first = system.steerAroundObstacles(chaser, 0, 1, [obstacle]); obstacle.x = -0.01; const second = system.steerAroundObstacles(chaser, 0, 1, [obstacle]); assert.equal(Math.sign(first.x), Math.sign(second.x));
});
test('recycled dynamic obstacle generation chooses a fresh tangent side', () => {
  const chaser = enemy('Voltling'); const source = enemy('Rustbrute', { slot: 1, gen: 4 }); const obstacle = { x: 0.01, z: 2, radius: 1, sourceEnemy: source }; const system = systemWith([chaser, source]); const first = system.steerAroundObstacles(chaser, 0, 1, [obstacle]);
  source.gen++; obstacle.x = -0.01; const second = system.steerAroundObstacles(chaser, 0, 1, [obstacle]);
  assert.ok(first.x * second.x < 0); assert.equal(chaser.avoidanceSourceGeneration, source.gen);
});
test('coincident drones and mixed flyer-ground bodies separate deterministically', () => {
  const droneA = enemy('Drone'); const droneB = enemy('Drone', { slot: 1 }); systemWith([droneA, droneB]).separate(); assert.ok(Math.hypot(droneB.x - droneA.x, droneB.z - droneA.z) > 0);
  const flyer = enemy('Drone'); const ground = enemy('Voltling', { slot: 1 }); systemWith([flyer, ground]).separate(); assert.ok(Math.abs(Math.hypot(ground.x - flyer.x, ground.z - flyer.z) - (flyer.radius + ground.radius)) < 1e-9);
});
test('flyers steer around and physically resolve against map obstacles', () => {
  const flyer = enemy('Drone'); const obstacle = { x: 0.05, z: 2, radius: 1, blocksFlyers: false }; const system = systemWith([flyer]); const steered = system.steerAroundObstacles(flyer, 0, 1, [obstacle]); assert.notEqual(steered.x, 0); flyer.x = obstacle.x; flyer.z = obstacle.z; system.resolveObstacles([obstacle]); assert.ok(Math.hypot(flyer.x - obstacle.x, flyer.z - obstacle.z) >= flyer.radius + obstacle.radius - 1e-9);
});
test('Tesla HUD portrait uses the canonical registry front sheet', async () => { const hudSource = await readFile(new URL('../src/hud.ts', import.meta.url), 'utf8'); const match = hudSource.match(/'tesla titan': '([^']+)'/); assert.equal(match?.[1], VOXEL_MODELS['tesla-titan'].ref); });
