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
const expectedLuck = [0.04, 0.08, 0.1, 0.14, 0.2];
const legacyLuck = [6, 8, 10, 14, 20];
const legacyLuckShift = { gray: 0, green: 0, blue: 0.45, purple: 0.35, gold: 0.2 };
const expectedTierWeights = { gray: 62, green: 27, blue: 9, purple: 1.8, gold: 0.2 };
const expectedLuckShift = { gray: 0, green: 0, blue: 45, purple: 35, gold: 20 };

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

function tierProbabilities(luckRating) {
  const weighted = Object.fromEntries(
    rarities.map((tier) => [
      tier,
      expectedTierWeights[tier] + luckRating * expectedLuckShift[tier],
    ]),
  );
  const total = Object.values(weighted).reduce((sum, weight) => sum + weight, 0);
  return Object.fromEntries(rarities.map((tier) => [tier, weighted[tier] / total]));
}

function chanceInThree(singleRollChance) {
  return 1 - (1 - singleRollChance) ** 3;
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

test('Common Lucky Gear is 4% while higher tiers preserve legacy rarity boundaries', () => {
  assert.deepEqual(config.CORE_TIER_MAGNITUDES.luck, expectedLuck);

  for (let step = 0; step <= 1000; step++) {
    const random = step / 1001;
    assert.equal(
      upgrades.rollRarity(expectedLuck[0], () => random),
      legacyRarity(4, random),
    );
  }

  for (let index = 1; index < legacyLuck.length; index++) {
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

test('Luck probabilities preserve the baseline and apply the Common 4% experiment', () => {
  assert.deepEqual(config.TIERS.weights, expectedTierWeights);
  assert.deepEqual(config.TIERS.luckShift, expectedLuckShift);
  assert.equal(stats.defaultStats().luck, 0);

  const baseline = tierProbabilities(0);
  const common = tierProbabilities(config.CORE_TIER_MAGNITUDES.luck[0]);
  assert.ok(Math.abs(chanceInThree(baseline.purple + baseline.gold) - 0.058808) < 1e-12);
  assert.ok(Math.abs(chanceInThree(baseline.gold) - 0.005988008) < 1e-12);
  assert.ok(Math.abs(chanceInThree(common.purple + common.gold) - 0.11632695863677733) < 1e-12);
  assert.ok(Math.abs(chanceInThree(common.gold) - 0.028569675978607045) < 1e-12);
});

test('Armor and Luck cards and stat rows render percentage ratings', async () => {
  const armor = upgrades.STAT_CARDS.find((card) => card.id === 'armor');
  const luck = upgrades.STAT_CARDS.find((card) => card.id === 'luck');
  assert.match(armor.describe(config.CORE_TIER_MAGNITUDES.armor[0]), /^\+8% Armor rating/);
  assert.match(luck.describe(config.CORE_TIER_MAGNITUDES.luck[0]), /^\+4% Luck rating/);

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

test('Nanobot Swarm keeps its 10-second config values aligned with HP per minute copy', () => {
  const nanobotSwarm = upgrades.STAT_CARDS.find((card) => card.id === 'regen');
  const perTick = [2 / 6, 4 / 6, 6 / 6, 8 / 6, 10 / 6];
  assert.ok(nanobotSwarm);
  assert.equal(config.PLAYER.regenTickS, 10);
  assert.deepEqual(config.CORE_TIER_MAGNITUDES.regen, perTick);
  assert.deepEqual(nanobotSwarm.magnitudes, perTick);
  assert.deepEqual(perTick.map(config.regenHpPerMinute), [2, 4, 6, 8, 10]);
  const accumulated = stats.defaultStats();
  nanobotSwarm.apply(accumulated, {}, nanobotSwarm.magnitudes[0]);
  nanobotSwarm.apply(accumulated, {}, nanobotSwarm.magnitudes[1]);
  assert.equal(accumulated.regen, 6 / 6);
  assert.equal(config.regenHpPerMinute(accumulated.regen), 6);
});
