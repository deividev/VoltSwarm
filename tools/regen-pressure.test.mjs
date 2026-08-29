import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const config = await server.ssrLoadModule('/src/config.ts');
const stats = await server.ssrLoadModule('/src/stats.ts');

after(async () => {
  await server.close();
});

test('Regen remains below continuous unmitigated contact pressure', async (t) => {
  const gameSource = await readFile(new URL('../src/game.ts', import.meta.url), 'utf8');
  const baseStats = stats.defaultStats();
  const damagePerContact = stats.applyArmor(config.PLAYER.contactDamage, baseStats.armor);
  const contactDps = damagePerContact / config.PLAYER.invulnAfterHitS;
  const contactDamagePerRegenTick = contactDps * config.PLAYER.regenTickS;
  const regenPerMinute = config.CORE_TIER_MAGNITUDES.regen.map(config.regenHpPerMinute);

  assert.match(gameSource, /const amount = applyArmor\(rawDamage, this\.stats\.armor\)/);
  assert.match(gameSource, /PLAYER\.contactDamage \* \(e\.elite \? ELITES\.scaleMultiplier : 1\)/);
  assert.match(gameSource, /this\.regenTimer >= PLAYER\.regenTickS/);
  assert.deepEqual(config.CORE_TIER_MAGNITUDES.regen, [2 / 6, 4 / 6, 6 / 6, 8 / 6, 10 / 6]);
  assert.deepEqual(regenPerMinute, [2, 4, 6, 8, 10]);
  assert.equal(damagePerContact, config.PLAYER.contactDamage);
  assert.equal(contactDps, config.PLAYER.contactDamage / config.PLAYER.invulnAfterHitS);
  assert.ok(
    Math.max(...config.CORE_TIER_MAGNITUDES.regen) < contactDamagePerRegenTick,
    'Even Gold Regen must not outheal uninterrupted base contact pressure.',
  );

  t.diagnostic(
    `Base contact analytical bound: ${contactDps} HP/s, ${contactDamagePerRegenTick} HP per ${config.PLAYER.regenTickS}s; Gold Regen restores ${config.CORE_TIER_MAGNITUDES.regen.at(-1)} HP per tick.`,
  );
  t.diagnostic(
    'Limit: this is a deterministic continuous-contact/no-defense comparison. It excludes evasion, shields, armor, lifesteal procs, enemy projectile/boss damage, spawn timing, and how long a player remains overlapped; it is not a combat simulation.',
  );
});
