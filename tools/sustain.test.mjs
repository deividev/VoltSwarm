import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const config = await server.ssrLoadModule('/src/config.ts');
const stats = await server.ssrLoadModule('/src/stats.ts');
const upgrades = await server.ssrLoadModule('/src/upgrades.ts');
const hud = await server.ssrLoadModule('/src/hud.ts');

after(async () => {
  await server.close();
});

const card = (id) => {
  const found = upgrades.STAT_CARDS.find((entry) => entry.id === id);
  assert.ok(found, `Missing ${id} Core card`);
  return found;
};

test('Sustain Core tiers and player-facing values are config-derived', () => {
  const regen = card('regen');
  const lifesteal = card('lifesteal');

  assert.equal(config.PLAYER.regenTickS, 10);
  assert.deepEqual(config.CORE_TIER_MAGNITUDES.regen, [1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6]);
  assert.deepEqual(
    config.CORE_TIER_MAGNITUDES.regen.map(config.regenHpPerMinute),
    [1, 2, 3, 4, 5],
  );
  assert.equal(regen.describe(config.CORE_TIER_MAGNITUDES.regen[0]), '+1 HP Regen/min');

  assert.equal(config.PLAYER.lifestealHealHp, 1);
  assert.equal(config.PLAYER.lifestealCooldownS, 1);
  assert.deepEqual(config.CORE_TIER_MAGNITUDES.lifesteal, [0.1, 0.5, 1, 1.5, 2]);
  assert.equal(
    lifesteal.describe(config.CORE_TIER_MAGNITUDES.lifesteal[0]),
    '+0.1% Lifesteal (chance to restore 1 HP on hit; 1s global cooldown)',
  );
});

test('Lifesteal stat formatting preserves fractional percentage points without trailing zeros', () => {
  assert.deepEqual(
    config.CORE_TIER_MAGNITUDES.lifesteal.map(hud.formatPercentPoints),
    ['0.1%', '0.5%', '1%', '1.5%', '2%'],
  );
});

test('Hull Plates changes only maximum HP, never the current HP directly', () => {
  const hullPlates = card('max-hp');
  const player = { maxHp: config.PLAYER.maxHp, hp: 37 };
  const magnitude = config.CORE_TIER_MAGNITUDES['max-hp'][0];

  hullPlates.apply(stats.defaultStats(), player, magnitude);

  assert.equal(player.maxHp, config.PLAYER.maxHp + magnitude);
  assert.equal(player.hp, 37);
  assert.equal(hullPlates.describe(magnitude), `+${magnitude} Max HP`);
});

test('gameplay Field Repair excludes Hull Plates while other Core upgrades still qualify', async () => {
  const source = await readFile(new URL('../src/game.ts', import.meta.url), 'utf8');
  const start = source.indexOf('private applyUpgrade(card: UpgradeCard)');
  const end = source.indexOf('\n  private frame()', start);
  assert.ok(start >= 0 && end > start, 'applyUpgrade gameplay seam must exist');
  const applyUpgrade = source.slice(start, end);

  assert.match(
    applyUpgrade,
    /if \(\s*coreLevelBefore !== null\s*&& card\.id !== 'max-hp'\s*&& \(this\.coreLevels\[card\.id\] \?\? 0\) > coreLevelBefore\s*\) \{\s*this\.player\.hp = fieldRepairHp\(/,
  );
});

test('The runtime uses config-owned sustain values and feeds live Max HP into the stats sheet', async () => {
  assert.deepEqual(config.CORE_TIER_MAGNITUDES.regen, [1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6]);
  assert.deepEqual(config.CORE_TIER_MAGNITUDES.regen.map(config.regenHpPerMinute), [1, 2, 3, 4, 5]);
  assert.equal(config.PLAYER.regenTickS, 10);
  const [gameSource, hudSource] = await Promise.all([
    readFile(new URL('../src/game.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/hud.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(gameSource, /this\.regenTimer >= PLAYER\.regenTickS/);
  assert.match(gameSource, /this\.player\.hp = Math\.min\(this\.player\.maxHp, this\.player\.hp \+ this\.stats\.regen\)/);
  assert.match(gameSource, /Math\.random\(\) < this\.stats\.lifesteal \/ 100/);
  assert.match(gameSource, /this\.player\.hp = Math\.min\(this\.player\.maxHp, this\.player\.hp \+ PLAYER\.lifestealHealHp\)/);
  assert.match(gameSource, /this\.lifestealCooldown = PLAYER\.lifestealCooldownS/);
  assert.match(gameSource, /this\.hud\.updateBuild\(this\.stats, this\.weaponLevels, this\.modCounts, this\.coreLevels, this\.weaponBranches, this\.player\.maxHp\)/);
  assert.match(hudSource, /key: 'maxHp'.*label: 'Max HP'.*format: asPoints/);
  assert.match(hudSource, /const value = def\.key === 'maxHp' \? maxHp : stats\[def\.key\]/);
  assert.match(hudSource, /key: 'regen'.*regenHpPerMinute\(v\).*HP\/min/);
});
