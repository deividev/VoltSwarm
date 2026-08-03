import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const config = await server.ssrLoadModule('/src/config.ts');
const stats = await server.ssrLoadModule('/src/stats.ts');
const upgrades = await server.ssrLoadModule('/src/upgrades.ts');

after(async () => {
  await server.close();
});

const rarities = ['gray', 'green', 'blue', 'purple', 'gold'];
const rarityRollOrder = [...rarities].reverse();
const legacyArmor = [8, 11, 15, 25, 35];
const legacyLuck = [6, 8, 10, 14, 20];
const legacyLuckShift = { gray: 0, green: 0, blue: 0.45, purple: 0.35, gold: 0.2 };

function legacyArmorDamage(damage, armorPoints) {
  return Math.max(1, Math.round(damage * (1 - armorPoints / (armorPoints + 100))));
}

function legacyRarity(luckPoints, random) {
  const weights = rarityRollOrder.map(
    (tier) => config.TIERS.weights[tier] + luckPoints * legacyLuckShift[tier],
  );
  let roll = random * weights.reduce((sum, weight) => sum + weight, 0);
  for (let index = 0; index < rarityRollOrder.length; index++) {
    roll -= weights[index];
    if (roll < 0) return rarityRollOrder[index];
  }
  return 'gray';
}

test('Armor percentage ratings preserve the legacy diminishing-returns curve', () => {
  assert.deepEqual(config.CORE_TIER_MAGNITUDES.armor, legacyArmor.map((value) => value / 100));

  for (const damage of [1, 7, 25, 100, 999]) {
    for (let index = 0; index < legacyArmor.length; index++) {
      assert.equal(
        stats.applyArmor(damage, config.CORE_TIER_MAGNITUDES.armor[index]),
        legacyArmorDamage(damage, legacyArmor[index]),
      );
    }
  }
});

test('Luck percentage ratings preserve every legacy rarity boundary', () => {
  assert.deepEqual(config.CORE_TIER_MAGNITUDES.luck, legacyLuck.map((value) => value / 100));

  for (let index = 0; index < legacyLuck.length; index++) {
    const luckRating = config.CORE_TIER_MAGNITUDES.luck[index];
    for (const tier of rarities) {
      assert.ok(
        Math.abs(
          luckRating * config.TIERS.luckShift[tier]
            - legacyLuck[index] * legacyLuckShift[tier],
        ) < 1e-12,
      );
    }
    for (let step = 0; step <= 1000; step++) {
      const random = step / 1001;
      assert.equal(
        upgrades.rollRarity(luckRating, () => random),
        legacyRarity(legacyLuck[index], random),
      );
    }
  }
});

test('Armor and Luck cards and stat rows render percentage ratings', async () => {
  const armor = upgrades.STAT_CARDS.find((card) => card.id === 'armor');
  const luck = upgrades.STAT_CARDS.find((card) => card.id === 'luck');
  assert.match(armor.describe(config.CORE_TIER_MAGNITUDES.armor[0]), /^\+8% Armor rating/);
  assert.match(luck.describe(config.CORE_TIER_MAGNITUDES.luck[0]), /^\+6% Luck rating/);

  const hudSource = await readFile(new URL('../src/hud.ts', import.meta.url), 'utf8');
  assert.match(hudSource, /key: 'armor'.*label: 'Armor'.*format: asPct/);
  assert.match(hudSource, /key: 'luck'.*label: 'Luck'.*format: asPct/);
});

test('Armor and Luck Core magnitudes cannot regress to 100x point units', () => {
  for (const stat of ['armor', 'luck']) {
    assert.ok(Math.max(...config.CORE_TIER_MAGNITUDES[stat]) < 1);
    assert.ok(Math.min(...config.CORE_TIER_MAGNITUDES[stat]) >= 0.01);
  }
  assert.deepEqual(
    rarities.map((tier) => config.TIERS.luckShift[tier]),
    [0, 0, 45, 35, 20],
  );
});
