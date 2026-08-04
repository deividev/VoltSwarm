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
