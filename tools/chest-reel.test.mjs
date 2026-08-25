import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import * as THREE from 'three';

globalThis.window = {};
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const hud = await server.ssrLoadModule('/src/hud.ts');
const mods = await server.ssrLoadModule('/src/mods.ts');
const config = await server.ssrLoadModule('/src/config.ts');
const contracts = await server.ssrLoadModule('/src/contracts.ts');
const pickups = await server.ssrLoadModule('/src/pickups.ts');
const characters = await server.ssrLoadModule('/src/characters.ts');
const game = await server.ssrLoadModule('/src/game.ts');
const telemetryModule = await server.ssrLoadModule('/src/telemetry.ts');

after(async () => server.close());

function createPickupSystem() {
  const prototype = pickups.PickupSystem.prototype;
  const buildVoxelChests = prototype.buildVoxelChests;
  prototype.buildVoxelChests = async () => {};
  try {
    return new pickups.PickupSystem(new THREE.Scene());
  } finally {
    prototype.buildVoxelChests = buildVoxelChests;
  }
}

for (const tier of ['gray', 'green', 'blue', 'purple', 'gold']) {
  test(`${tier} chest strips keep the prize exact and every neighbour distinct`, () => {
    const tierMods = mods.modsOfTier(tier);
    assert.ok(tierMods.length > 0, `${tier} must have at least one registered mod`);

    for (const finalMod of tierMods) {
      for (let start = 0; start < Math.max(mods.MOD_IDS.length, 4); start++) {
        const strip = hud.buildChestReelStrip(finalMod, tier, start);
        assert.equal(strip.length, 19);
        assert.deepEqual(strip.at(-1), { kind: 'mod', id: finalMod });
        for (let index = 1; index < strip.length; index++) {
          const previous = strip[index - 1];
          const current = strip[index];
          if (previous.kind === 'mod' && current.kind === 'mod') {
            assert.notEqual(current.id, previous.id, `${tier}/${finalMod}/start-${start} at ${index}`);
          }
        }
      }
    }
  });
}

test('blue and purple pools contain their exact intrinsic-tier mods', () => {
  assert.deepEqual(mods.modsOfTier('blue'), [
    'barrier-cell',
    'chain-relay',
    'piston-stompers',
  ]);
  assert.deepEqual(mods.modsOfTier('purple'), [
    'orb-siphon',
    'overload-trigger',
    'phase-chassis',
    'foremans-whistle',
  ]);
});

test('Runaway Draw promotes before materialization and caps Gold at Gold', () => {
  assert.deepEqual(
    ['gray', 'green', 'blue', 'purple', 'gold'].map((tier) => mods.promoteRewardTier(tier, 1)),
    ['green', 'blue', 'purple', 'gold', 'gold'],
  );
  assert.equal(mods.tierPrice(mods.promoteRewardTier('blue', 1), 0, 0), config.MERCHANT.tierPrices.purple);
  assert.equal(mods.TIER_COLORS[mods.promoteRewardTier('blue', 1)], mods.TIER_COLORS.purple);
});

test('eligible fallback descends without reintroducing Repair Kit or capped Mods', () => {
  const neverEligible = () => false;
  assert.equal(mods.resolveEligibleModTier('gold', neverEligible), null);
  assert.equal(mods.rollModOfTier('gold', neverEligible), null);

  const eligibleGreenOnly = (id) => mods.MOD_REGISTRY[id].tier === 'green';
  assert.equal(mods.resolveEligibleModTier('gold', eligibleGreenOnly), 'green');
  const rolled = mods.rollModOfTier('gold', eligibleGreenOnly);
  assert.ok(rolled);
  assert.equal(mods.MOD_REGISTRY[rolled].tier, 'green');

  const noRepair = mods.rollModOfTier('gray', (id) => id !== 'repair');
  assert.notEqual(noRepair, 'repair');
  assert.equal(mods.rollModOfTier('gray', (id) => id === 'repair' && false), null);
});

test('promoted Scrapper stock remains distinct and uses intrinsic promoted prices', () => {
  const originalRandom = Math.random;
  let cursor = 0;
  const values = [0, 0.3, 0.6, 0.9];
  Math.random = () => values[cursor++ % values.length];
  try {
    const stock = mods.rollShopStock(0, 3, () => true, 1);
    assert.equal(new Set(stock).size, stock.length);
    for (const id of stock) {
      assert.equal(mods.modPrice(id, 0, 0), config.MERCHANT.tierPrices[mods.MOD_REGISTRY[id].tier]);
    }
  } finally {
    Math.random = originalRandom;
  }
});

test('Runaway Draw is wired only into chest spawn and Scrapper stock', async () => {
  const [pickupSource, gameSource, upgradeSource, contractSource] = await Promise.all([
    readFile(new URL('../src/pickups.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/game.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/upgrades.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/contracts.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(pickupSource, /resolveChestTier\(promoteRewardTier\(rollRarity\(luck\), this\.rewardTierShift\)\)/);
  assert.match(gameSource, /rollShopStock\([\s\S]{0,220}rewardTierShiftForCharacter\(this\.currentCharacterId\)/);
  assert.match(gameSource, /setRewardTierShift\(rewardTierShiftForCharacter\(this\.currentCharacterId\)\)/);
  assert.doesNotMatch(upgradeSource, /promoteRewardTier|rewardTierShiftForCharacter/);
  assert.doesNotMatch(contractSource, /promoteRewardTier/);
});

test('an active chest permanently keeps its spawned tier, beam, model tier and price', () => {
  const originalRandom = Math.random;
  const originalMods = [...config.PROFILE.unlockedMods];
  Math.random = () => 0;
  try {
    const system = createPickupSystem();
    system.setRewardTierShift(1);
    assert.equal(system.spawnAt(0, 0, 0, []), true);
    const spawned = system.activeChests()[0];
    assert.equal(spawned.tier, mods.resolveChestTier(mods.promoteRewardTier('gold', 1)));
    const slot = system.slots[spawned.index];
    const beam = slot.beamMat.color.getHex();
    const geometry = slot.crate.geometry;
    const price = Math.round(mods.tierPrice(spawned.tier, 0, 0) * config.CHEST.priceMult);

    // Simulate a later run-state/pool change. An already-materialized chest is
    // immutable: it is not re-resolved against the new eligible pool.
    config.PROFILE.unlockedMods.splice(0, config.PROFILE.unlockedMods.length, 'repair');
    mods.refreshUnlockedMods();
    system.update(0, 0, 0, 0, []);

    const after = system.activeChests()[0];
    assert.equal(after.tier, spawned.tier);
    assert.equal(slot.beamMat.color.getHex(), beam);
    assert.strictEqual(slot.crate.geometry, geometry);
    assert.equal(
      Math.round(mods.tierPrice(after.tier, 0, 0) * config.CHEST.priceMult),
      price,
    );
    assert.equal(typeof system.reconcileActiveTiers, 'undefined');
  } finally {
    Math.random = originalRandom;
    config.PROFILE.unlockedMods.splice(0, config.PROFILE.unlockedMods.length, ...originalMods);
    mods.refreshUnlockedMods();
  }
});

test('a fully ineligible paid chest is consumed without inventing a reward or ghost slot', async () => {
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const system = createPickupSystem();
    system.setRewardTierShift(characters.rewardTierShiftForCharacter('field-engineer'));
    assert.equal(system.spawnAt(0, 0, 0, []), true);
    const chest = system.activeChests()[0];
    assert.equal(mods.rollModOfTier(chest.tier, () => false), null);
    assert.equal(system.open(chest.index), true);
    assert.deepEqual(system.activeChests(), []);
    assert.equal(system.open(chest.index), false, 'consumption is idempotent and cannot loop');

    const gameSource = await readFile(new URL('../src/game.ts', import.meta.url), 'utf8');
    const opening = gameSource.slice(
      gameSource.indexOf('private openChest('),
      gameSource.indexOf('/** Points an edge-of-screen arrow'),
    );
    assert.ok(opening.indexOf('if (!this.pickups.open(index)) return;') < opening.indexOf('this.gold -= price;'));
    assert.ok(opening.indexOf('this.gold -= price;') < opening.indexOf('rollModOfTier('));
    assert.match(opening, /if \(!mod\) \{[\s\S]{0,120}Chest spent: no eligible Mod remained\.[\s\S]{0,40}return;/);
  } finally {
    Math.random = originalRandom;
  }
});

test('Game chest transaction charges, records and rewards exactly once per slot', () => {
  let available = true;
  const audioEvents = [];
  let telemetryChoices = 0;
  let rewardSpins = 0;
  let appliedRewards = 0;
  let goldUpdates = 0;
  const originalChoice = telemetryModule.telemetry.choice;
  telemetryModule.telemetry.choice = () => { telemetryChoices += 1; };

  const fakeGame = {
    gold: 100,
    runChestsByTier: {},
    pickups: { open: () => available ? (available = false, true) : false },
    audio: { emit: ({ id }) => { audioEvents.push(id); } },
    hud: {
      updateGold: () => { goldUpdates += 1; },
      showInteractPrompt: () => {},
      showChestSpin: (_mod, _tier, applyReward) => {
        rewardSpins += 1;
        applyReward();
      },
    },
    burst: { spawn: () => {} },
    shakeAmp: 0,
    modCounts: {},
    isChestModEligible: () => true,
    player: { position: { x: 0, z: 0 } },
    orbs: { pullAll: () => {} },
    hasteS: 0,
    state: 'playing',
    interactLabel: () => 'E',
    applyMod: () => { appliedRewards += 1; },
    timer: { reset: () => {} },
    maybeShowLevelUp: () => {},
  };

  try {
    game.Game.prototype.openChest.call(fakeGame, 3, 'gray', 25, 0, 0);
    game.Game.prototype.openChest.call(fakeGame, 3, 'gray', 25, 0, 0);

    assert.equal(fakeGame.gold, 75, 'the fixed price is charged once');
    assert.equal(fakeGame.runChestsByTier.gray, 1, 'chest telemetry counter increments once');
    assert.deepEqual(
      audioEvents,
      ['chest-open', 'chest-spin', 'chest-reveal'],
      'the complete audio sequence emits once',
    );
    assert.equal(telemetryChoices, 1, 'purchase telemetry emits once');
    assert.equal(rewardSpins, 1, 'one reward flow starts');
    assert.equal(appliedRewards, 1, 'one reward is applied');
    assert.equal(goldUpdates, 1, 'gold UI updates once');
  } finally {
    telemetryModule.telemetry.choice = originalChoice;
  }
});

test('Field Engineer and Rack Hauler keep the unshifted chest baseline', () => {
  assert.equal(characters.rewardTierShiftForCharacter('field-engineer'), 0);
  assert.equal(characters.rewardTierShiftForCharacter('rack-hauler'), 0);
  assert.equal(mods.promoteRewardTier('gray', characters.rewardTierShiftForCharacter('field-engineer')), 'gray');
  assert.equal(mods.promoteRewardTier('purple', characters.rewardTierShiftForCharacter('rack-hauler')), 'purple');
});

test('Orb Siphon is Epic and can be awarded by chests only once per run', () => {
  const siphon = mods.MOD_REGISTRY['orb-siphon'];
  assert.equal(siphon.tier, 'purple');
  assert.equal(mods.modPrice('orb-siphon', 0, 0), config.MERCHANT.tierPrices.purple);
  assert.equal(mods.isModEligibleForChest('orb-siphon', 0), true);
  assert.equal(mods.isModEligibleForChest('orb-siphon', 1), false);
  assert.equal(mods.isModEligibleForChest('orb-siphon', 3), false);
  assert.notEqual(
    mods.rollModOfTier('purple', (id) =>
      mods.isModEligibleForChest(id, id === 'orb-siphon' ? 1 : 0)),
    'orb-siphon',
  );
  assert.equal(mods.isModAtCopyCap('orb-siphon', 1), false, 'merchant stacking stays unchanged');
  assert.equal(config.RECORDING.chestTesting.forceGreenChests, false);
  assert.equal(config.RECORDING.chestTesting.forceOrbSiphonReward, false);
});

test('Overload Trigger derives Epic rarity and economy without changing its behavior contract', () => {
  const overload = mods.MOD_REGISTRY['overload-trigger'];
  assert.equal(overload.tier, 'purple');
  assert.equal(mods.modPrice('overload-trigger', 0, 0), config.MERCHANT.tierPrices.purple);
  assert.notEqual(mods.modPrice('overload-trigger', 0, 0), config.MERCHANT.tierPrices.blue);
  assert.deepEqual(config.MODS.overloadTrigger, {
    durationS: 5,
    durationPerCopyS: 2,
    attackSpeedMult: 2,
  });
  assert.match(overload.description, /x2 attack speed for 5s/);
  assert.deepEqual(
    contracts.ACTIVE_CONTRACTS.find((contract) => contract.id === 'overkill')?.reward,
    { kind: 'mod', id: 'overload-trigger' },
  );
});

test('chest marker presentation leaves the established chest economy intact', () => {
  assert.equal(config.CHEST.priceMult, 0.5);
  assert.deepEqual(config.MERCHANT.tierPrices, {
    gray: 25,
    green: 45,
    blue: 80,
    purple: 140,
    gold: 240,
  });
  assert.equal(config.MERCHANT.priceRampPerMin, 0.12);

  const chestPrice = (tier, elapsedMinutes) =>
    Math.round(mods.tierPrice(tier, elapsedMinutes, 0) * config.CHEST.priceMult);
  assert.deepEqual(
    ['gray', 'green', 'blue', 'purple', 'gold'].map((tier) => chestPrice(tier, 0)),
    [13, 23, 40, 70, 120],
  );
  assert.deepEqual(
    ['gray', 'green', 'blue', 'purple', 'gold'].map((tier) => chestPrice(tier, 5)),
    [20, 36, 64, 112, 192],
  );
});

test('gold uses only neutral Legendary anticipation before the exact prize', () => {
  const finalMod = mods.modsOfTier('gold')[0];
  const strip = hud.buildChestReelStrip(finalMod, 'gold', 0);
  assert.deepEqual(strip.at(-1), { kind: 'mod', id: finalMod });
  assert.deepEqual(strip.at(-2), { kind: 'anticipation', tier: 'gold', variant: 1 });
  assert.ok(strip.slice(0, -1).every((cell) => cell.kind === 'anticipation' && cell.tier === 'gold'));
  assert.equal(strip.slice(0, -1).some((cell) => cell.kind === 'mod'), false);
});

test('tiers with at least three items keep their complete item-only reel behavior', () => {
  for (const tier of ['gray', 'green', 'blue', 'purple']) {
    const finalMod = mods.modsOfTier(tier)[0];
    const strip = hud.buildChestReelStrip(finalMod, tier, 0);
    assert.ok(strip.every((cell) => cell.kind === 'mod'));
    assert.deepEqual(strip.at(-1), { kind: 'mod', id: finalMod });
  }
});
