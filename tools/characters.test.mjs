import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import * as THREE from 'three';
import { chooseCharacterId } from './character-flow.mjs';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const characters = await server.ssrLoadModule('/src/characters.ts');
const config = await server.ssrLoadModule('/src/config.ts');
const stats = await server.ssrLoadModule('/src/stats.ts');
const contracts = await server.ssrLoadModule('/src/contracts.ts');
const profile = await server.ssrLoadModule('/src/profile.ts');
const registry = await server.ssrLoadModule('/src/models/registry.ts');
const runtimeDetails = await server.ssrLoadModule('/src/models/runtime-details.ts');
const rigModule = await server.ssrLoadModule('/src/models/rig.ts');

after(async () => server.close());

test('registry fallback and unlock filtering use stable ids', () => {
  const locked = { unlockedCharacters: [] };
  const unlocked = { unlockedCharacters: ['field-engineer', 'unknown-character'] };
  assert.equal(characters.resolveCharacterId('unknown-character', unlocked), 'field-engineer');
  assert.equal(characters.resolveCharacterId('field-engineer', locked), 'field-engineer');
  for (const inheritedId of ['__proto__', 'constructor', 'toString']) {
    assert.equal(characters.isCharacterId(inheritedId), false);
    assert.equal(characters.registeredCharacterId(inheritedId), characters.DEFAULT_CHARACTER_ID);
    assert.equal(characters.resolveCharacterId(inheritedId, unlocked), characters.DEFAULT_CHARACTER_ID);
  }
  assert.deepEqual(characters.unlockedCharacters(locked), []);
  assert.deepEqual(characters.unlockedCharacters(unlocked).map((entry) => entry.id), ['field-engineer']);
});

test('Field Engineer has the exact approved run profile', () => {
  const engineer = characters.CHARACTER_REGISTRY['field-engineer'];
  const balance = config.CHARACTER_BALANCE.fieldEngineer;
  assert.equal(engineer.maxHp, balance.maxHp);
  assert.equal(engineer.moveSpeed, balance.moveSpeed);
  assert.equal(engineer.stats.damage, balance.damage);
  assert.equal(engineer.stats.attackSpeed, balance.attackSpeed);
  assert.equal(engineer.stats.critChance, balance.critChance);
  assert.equal(engineer.stats.critDamage, balance.critDamage);
  assert.equal(engineer.stats.armor, balance.armor);
  assert.equal(engineer.stats.regen, balance.regen);
  assert.equal(engineer.stats.luck, balance.luck);
  assert.match(engineer.signature.description, new RegExp(`${balance.fieldRepairFraction * 100}%`));
  assert.equal(config.PROFILE.weaponSockets, 1);
  assert.equal(config.PROFILE.coreSockets, 2);
  assert.equal(config.PROFILE.maxWeaponSockets, 2);
  assert.equal(config.PROFILE.maxCoreSockets, 4);
});

test('character stat rows derive baselines and format percentage ratings', () => {
  const engineer = characters.CHARACTER_REGISTRY['field-engineer'];
  const rows = Object.fromEntries(characters.characterStatRows(engineer).map((row) => [row.label, row.value]));
  assert.equal(rows['Max HP'], `${engineer.maxHp} (+${engineer.maxHp - config.PLAYER.maxHp})`);
  assert.equal(rows.Armor, `${Math.round(engineer.stats.armor * 100)}%`);
  assert.equal(rows.Damage, `${Math.round((engineer.stats.damage - stats.defaultStats().damage) * 100)}%`);
  assert.equal(rows['Move Speed'], `${engineer.moveSpeed} (+${engineer.moveSpeed - config.PLAYER.moveSpeed})`);
  assert.equal(rows['Luck / Regen'], `${Math.round(engineer.stats.luck * 100)}% / ${engineer.stats.regen}`);
});

test('registered run characters survive profile lock changes', () => {
  assert.equal(characters.registeredCharacterId('field-engineer'), 'field-engineer');
  assert.equal(characters.registeredCharacterId('unknown-character'), characters.DEFAULT_CHARACTER_ID);
});

test('Field Repair heals after a gameplay Core change, clamps, and ignores rebuild paths', () => {
  assert.equal(characters.fieldRepairHp('field-engineer', 40, 110, 'gameplay'), 46.6);
  assert.equal(characters.fieldRepairHp('field-engineer', 108, 110, 'gameplay'), 110);
  for (const context of ['load', 'replay', 'boss-lab', 'rebuild']) {
    assert.equal(characters.fieldRepairHp('field-engineer', 40, 110, context), 40);
  }
});

test('future character reward seam grants stable ids idempotently', () => {
  const unlocked = ['field-engineer'];
  const futureIds = new Set(['field-engineer', 'future-test-character']);
  assert.equal(characters.grantCharacterId(unlocked, 'future-test-character', futureIds), true);
  assert.equal(characters.grantCharacterId(unlocked, 'future-test-character', futureIds), false);
  assert.deepEqual(unlocked, ['field-engineer', 'future-test-character']);
});

test('character Contract reward is idempotent', () => {
  const original = [...config.PROFILE.unlockedCharacters];
  config.PROFILE.unlockedCharacters.splice(0);
  try {
    contracts.grantReward({ kind: 'character', id: 'field-engineer' });
    contracts.grantReward({ kind: 'character', id: 'field-engineer' });
    assert.deepEqual(config.PROFILE.unlockedCharacters, ['field-engineer']);
  } finally {
    config.PROFILE.unlockedCharacters.splice(0, Infinity, ...original);
  }
});

test('character unlock migration and reset preserve the live PROFILE array', () => {
  const reference = config.PROFILE.unlockedCharacters;
  profile.normalizeCharacterUnlocks(['field-engineer', 'unknown-character']);
  assert.strictEqual(config.PROFILE.unlockedCharacters, reference);
  assert.deepEqual(reference, ['field-engineer']);

  reference.push('stale-character');
  profile.normalizeCharacterUnlocks(undefined);
  assert.strictEqual(config.PROFILE.unlockedCharacters, reference);
  assert.deepEqual(reference, ['field-engineer']);
});

test('Bolt recommendation labels presentation without mutating draft membership or order', () => {
  const pool = ['pulse', 'bolt', 'tire'];
  const before = [...pool];
  assert.deepEqual(characters.labelWeaponOptions('field-engineer', pool), [
    { id: 'pulse', recommended: false },
    { id: 'bolt', recommended: true },
    { id: 'tire', recommended: false },
  ]);
  assert.deepEqual(pool, before);
});

test('character actions stay inside a viewport-bounded panel with internal scrolling', async () => {
  const [hudSource, cssSource] = await Promise.all([
    readFile(new URL('../src/hud.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui.css', import.meta.url), 'utf8'),
  ]);
  assert.match(
    hudSource,
    /id="character-select-roster"[\s\S]*class="character-actions"[\s\S]*id="character-select-back-button"[\s\S]*id="character-confirm-button"/,
  );
  assert.match(hudSource, /dataset\.defaultCharacterId\s*=\s*DEFAULT_CHARACTER_ID/);
  assert.match(hudSource, /dataset\.characterId\s*=\s*character\.id/);
  assert.match(hudSource, /dataset\.characterUnlocked/);
  assert.match(cssSource, /\.character-screen\s*\{[\s\S]*position:\s*static;[\s\S]*height:\s*min\(820px, calc\(100dvh - 32px\)\);[\s\S]*overflow:\s*hidden;/);
  assert.match(cssSource, /\.character-layout\s*\{[\s\S]*flex:\s*1 1 auto;[\s\S]*min-height:\s*0;[\s\S]*overflow:\s*hidden;/);
  assert.match(cssSource, /\.character-actions\s*\{[\s\S]*flex:\s*0 0 auto;/);
});

test('automation chooses the explicit unlocked default from a scalable roster', () => {
  const roster = [
    { id: 'future-a', unlocked: true },
    { id: 'field-engineer', unlocked: true },
    { id: 'future-b', unlocked: false },
  ];
  assert.equal(chooseCharacterId(roster, 'field-engineer'), 'field-engineer');
  assert.equal(chooseCharacterId(roster, 'missing'), 'future-a');
  assert.equal(chooseCharacterId([{ id: 'locked', unlocked: false }], 'locked'), null);
});

test('Boss Lab restores the recorded character baseline before replaying Cores', async () => {
  const gameSource = await readFile(new URL('../src/game.ts', import.meta.url), 'utf8');
  const bossLab = gameSource.slice(gameSource.indexOf('private enterBossLab'), gameSource.indexOf('private installAuditionKeys'));
  const resolveAt = bossLab.indexOf('registeredCharacterId(record.characterId)');
  const statsAt = bossLab.indexOf('characterStats(this.currentCharacterId)');
  const replayAt = bossLab.indexOf('replayCoresOntoStats(this.stats, this.player, this.coreLevels)');
  assert.ok(resolveAt >= 0 && statsAt > resolveAt && replayAt > statsAt);
  assert.doesNotMatch(bossLab, /fieldRepairHp\(/);
});

test('Field Engineer runtime details add a real rear backpack with three sockets', () => {
  const colors = [];
  const details = runtimeDetails.buildRuntimeModelDetails(
    registry.VOXEL_MODELS['field-engineer'],
    (color) => {
      colors.push(color);
      return new THREE.MeshLambertMaterial({ color });
    },
  );
  assert.ok(details);
  assert.equal(details.userData.runtimeDetail, 'backpack');
  assert.equal(details.userData.socketCount, 3);
  assert.ok(details.children.length >= 8);
  assert.equal(colors.length, 3);
  runtimeDetails.disposeRuntimeModel(details);
});

test('runtime details preserve model-space placement and follow the torso pivot', () => {
  const root = new THREE.Group();
  const torsoPivot = new THREE.Group();
  torsoPivot.position.set(0.4, 0.8, 0);
  root.add(torsoPivot);
  const rig = { root, parts: { torso: { pivot: torsoPivot } } };
  const details = new THREE.Group();
  const marker = new THREE.Object3D();
  marker.position.set(0.2, 1.1, -0.4);
  details.add(marker);
  root.updateMatrixWorld(true);
  const authoredWorld = marker.getWorldPosition(new THREE.Vector3());

  assert.equal(rigModule.attachToRigPart(rig, details), true);
  root.updateMatrixWorld(true);
  assert.ok(marker.getWorldPosition(new THREE.Vector3()).distanceTo(authoredWorld) < 1e-9);

  torsoPivot.rotation.x = 0.2;
  root.updateMatrixWorld(true);
  assert.ok(marker.getWorldPosition(new THREE.Vector3()).distanceTo(authoredWorld) > 0.01);
});

test('preview and live runtime own their material and attachment policies', async () => {
  const [previewSource, playerSource] = await Promise.all([
    readFile(new URL('../src/models/preview-main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/player.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(previewSource, /buildRuntimeModelDetails\([\s\S]*new THREE\.MeshLambertMaterial\(\{ color \}\)/);
  assert.match(previewSource, /if \(rig\) attachToRigPart\(rig, runtimeDetails\)/);
  assert.match(playerSource, /buildRuntimeModelDetails\(def, \(color\) => litMaterial\(\{ color \}\)\)/);
});
