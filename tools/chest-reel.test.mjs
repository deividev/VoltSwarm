import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const hud = await server.ssrLoadModule('/src/hud.ts');
const mods = await server.ssrLoadModule('/src/mods.ts');
const config = await server.ssrLoadModule('/src/config.ts');
const contracts = await server.ssrLoadModule('/src/contracts.ts');

after(async () => server.close());

for (const tier of ['gray', 'green', 'blue', 'purple', 'gold']) {
  test(`${tier} chest strips keep the prize exact and every neighbour distinct`, () => {
    const tierMods = mods.modsOfTier(tier);
    assert.ok(tierMods.length > 0, `${tier} must have at least one registered mod`);

    for (const finalMod of tierMods) {
      for (let start = 0; start < Math.max(mods.MOD_IDS.length, 4); start++) {
        const strip = hud.buildChestReelStrip(finalMod, tier, start);
        assert.equal(strip.length, 19);
        assert.equal(strip.at(-1), finalMod);
        for (let index = 1; index < strip.length; index++) {
          assert.notEqual(strip[index], strip[index - 1], `${tier}/${finalMod}/start-${start} at ${index}`);
        }
      }
    }
  });
}

test('blue and purple pools contain exactly three intrinsic-tier mods', () => {
  assert.deepEqual(mods.modsOfTier('blue'), [
    'barrier-cell',
    'chain-relay',
    'piston-stompers',
  ]);
  assert.deepEqual(mods.modsOfTier('purple'), [
    'overload-trigger',
    'phase-chassis',
    'foremans-whistle',
  ]);
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

test('gold borrows varied scenery without changing the prize tier', () => {
  const finalMod = mods.modsOfTier('gold')[0];
  const strip = hud.buildChestReelStrip(finalMod, 'gold', 0);
  assert.equal(strip.at(-1), finalMod);
  assert.ok(new Set(strip.slice(0, -1)).size >= 3);
  assert.ok(strip.slice(0, -1).some((id) => mods.MOD_REGISTRY[id].tier !== 'gold'));
});
