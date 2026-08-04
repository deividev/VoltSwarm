import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const hud = await server.ssrLoadModule('/src/hud.ts');
const mods = await server.ssrLoadModule('/src/mods.ts');

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

test('purple and gold borrow varied scenery without changing the prize tier', () => {
  for (const tier of ['purple', 'gold']) {
    const finalMod = mods.modsOfTier(tier)[0];
    const strip = hud.buildChestReelStrip(finalMod, tier, 0);
    assert.equal(strip.at(-1), finalMod);
    assert.ok(new Set(strip.slice(0, -1)).size >= 3);
    assert.ok(strip.slice(0, -1).some((id) => mods.MOD_REGISTRY[id].tier !== tier));
  }
});
