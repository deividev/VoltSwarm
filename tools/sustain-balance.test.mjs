import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CHARACTER_BALANCE, CORE_TIER_MAGNITUDES, PLAYER, SECONDS_PER_MINUTE } from '../src/config.ts';

async function coreCardBlock(id) {
  const source = await readFile(new URL('../src/upgrades.ts', import.meta.url), 'utf8');
  const start = source.indexOf(`id: '${id}'`);
  assert.notEqual(start, -1, `${id} Core must be registered`);
  const end = source.indexOf('\n  },', start);
  assert.notEqual(end, -1, `${id} Core block must close`);
  return source.slice(start, end);
}

test('Hull Plates keeps its Max HP tiers but has no immediate heal or healing copy', async () => {
  assert.deepEqual(CORE_TIER_MAGNITUDES['max-hp'], [15, 20, 25, 45, 65]);
  const hullPlates = await coreCardBlock('max-hp');
  assert.match(hullPlates, /describe: \(v\) => `\+\$\{v\} Max HP permanently`,/);
  assert.match(hullPlates, /p\.maxHp \+= v;/);
  assert.doesNotMatch(hullPlates, /p\.hp|heal/i);
});

test('Nanobot Swarm and the stat sheet state config-derived HP per minute', async () => {
  assert.deepEqual(CORE_TIER_MAGNITUDES.regen, [1, 2, 3, 4, 5]);
  assert.equal(PLAYER.regenTickS, 5);
  assert.equal(SECONDS_PER_MINUTE, 60);
  const [nanobotSwarm, hudSource] = await Promise.all([
    coreCardBlock('regen'),
    readFile(new URL('../src/hud.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(nanobotSwarm, /describe: \(v\) => `\+\$\{regenHpPerMinute\(v\)\} HP\/min`,/);
  assert.match(hudSource, /\(v \* SECONDS_PER_MINUTE\) \/ PLAYER\.regenTickS\)} HP\/min/);
});

test('stat sheet reads the live Max HP total after Hull Plates updates the player', async () => {
  const [hudSource, gameSource] = await Promise.all([
    readFile(new URL('../src/hud.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/game.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(hudSource, /updateBuild\(\s*stats: PlayerStats,\s*maxHp: number,/);
  assert.match(hudSource, /Math\.abs\(maxHp - PLAYER\.maxHp\)/);
  assert.match(hudSource, /<span>Max HP<\/span><span class="build-value\$\{maxHpRaised \? ' raised' : ''\}">\$\{asPoints\(maxHp\)\}<\/span>/);
  assert.match(hudSource, /src="\$\{CARD_ICON_IMAGES\['max-hp'\]\}"/);

  const liveMaxHpCalls = gameSource.match(/this\.hud\.updateBuild\(\s*this\.stats,\s*this\.player\.maxHp,/g) ?? [];
  assert.equal(liveMaxHpCalls.length, 7);

  const baseMaxHp = CHARACTER_BALANCE.fieldEngineer.maxHp;
  const hullPlateTotal = baseMaxHp + CORE_TIER_MAGNITUDES['max-hp'][0];
  assert.equal(
    hullPlateTotal,
    CHARACTER_BALANCE.fieldEngineer.maxHp + CORE_TIER_MAGNITUDES['max-hp'][0],
  );
  assert.ok(hullPlateTotal > baseMaxHp);
});

test('Leech Coil uses the reduced chance tiers while retaining its global cooldown', async () => {
  assert.deepEqual(CORE_TIER_MAGNITUDES.lifesteal, [2, 3, 4, 7, 10]);
  assert.equal(PLAYER.lifestealCooldownS, 1);

  const [leechCoil, gameSource] = await Promise.all([
    coreCardBlock('lifesteal'),
    readFile(new URL('../src/game.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(leechCoil, /\$\{v\}% chance on hit to heal 1 HP; \$\{PLAYER\.lifestealCooldownS\}s global cooldown/);
  assert.match(gameSource, /this\.lifestealCooldown\s*=\s*PLAYER\.lifestealCooldownS;/);
});
