import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CORE_TIER_MAGNITUDES,
  ELITES,
  ENEMIES,
  ENEMY_TYPES,
  GUNNER,
  PLAYER,
  SECONDS_PER_MINUTE,
  STAT_RATING_UNITS,
  difficultyScalar,
} from '../src/config.ts';

const byName = (name) => {
  const type = ENEMY_TYPES.find((entry) => entry.name === name);
  assert.ok(type, `${name} must remain an enemy type`);
  return type;
};

function regenHpPerMinute(hpPerTick) {
  return (hpPerTick * SECONDS_PER_MINUTE) / PLAYER.regenTickS;
}

function postArmorDamage(rawDamage, armor = 0) {
  const reduction = armor / (armor + STAT_RATING_UNITS.armorFullScale);
  return Math.max(1, Math.round(rawDamage * (1 - reduction)));
}

function recoverySeconds(rawDamage, hpPerMinute) {
  const postArmor = postArmorDamage(rawDamage);
  return (postArmor * SECONDS_PER_MINUTE) / hpPerMinute;
}

/** Mirrors EnemySystem.updateSpawner's no-boss, empty-field pressure formulas.
 * The source assertions below bind this report to the actual runtime path. */
function spawnPressureAt(elapsedS) {
  const difficulty = difficultyScalar(elapsedS, 0);
  const t = Math.min(difficulty, 1);
  const lerp = (start, end) => start + (end - start) * t;
  return {
    difficulty,
    intervalS: lerp(ENEMIES.waveIntervalStartS, ENEMIES.waveIntervalEndS),
    waveSize: Math.round(lerp(ENEMIES.waveSizeStart, ENEMIES.waveSizeEnd) * Math.max(1, difficulty)),
    maxActive: Math.round(lerp(ENEMIES.maxActiveStart, ENEMIES.maxActiveEnd) * Math.max(1, difficulty)),
    hpMultiplier: (1 + (elapsedS / SECONDS_PER_MINUTE) * ENEMIES.hpRampPerMinute) * Math.max(1, difficulty),
  };
}

test('Regen HP/min reports recovery against representative real incoming-damage paths', async (t) => {
  const [enemySource, gameSource, statsSource] = await Promise.all([
    readFile(new URL('../src/enemies.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/game.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/stats.ts', import.meta.url), 'utf8'),
  ]);
  const voltling = byName('Voltling');
  const gunner = byName('Gunner');
  const rustbrute = byName('Rustbrute');
  const regenRates = CORE_TIER_MAGNITUDES.regen.map(regenHpPerMinute);

  assert.deepEqual(regenRates, [1, 2, 3, 4, 5]);
  for (let tier = 1; tier < regenRates.length; tier++) {
    assert.ok(regenRates[tier] > regenRates[tier - 1], `Regen tier ${tier + 1} must exceed tier ${tier}`);
  }

  // Normal contact does not have a per-enemy-type damage field: EnemySystem
  // chooses PLAYER.contactDamage for every non-boss, then applies only the
  // elite multiplier. Gunner differs because its projectile sends its own
  // configured damage through the same damage funnel.
  for (const type of [voltling, gunner, rustbrute]) {
    assert.equal('damage' in type, false, `${type.name} must not invent a per-type contact damage value`);
  }
  assert.match(gameSource, /PLAYER\.contactDamage \* \(e\.elite \? ELITES\.scaleMultiplier : 1\)/);
  assert.match(enemySource, /projectiles\.fire\(e\.x, e\.z, dx, dz, GUNNER\.projectileSpeed, GUNNER\.projectileDamage\);/);
  assert.match(gameSource, /\(damage\) => this\.damagePlayer\(damage\)/);
  assert.match(statsSource, /return Math\.max\(1, Math\.round\(damage \* \(1 - reduction\)\)\);/);

  const points = [
    { name: 'opening Voltling contact', elapsedS: voltling.unlockAtS, rawDamage: PLAYER.contactDamage },
    {
      name: 'elite gate Voltling contact',
      elapsedS: ELITES.minRunTimeS,
      rawDamage: PLAYER.contactDamage * ELITES.scaleMultiplier,
    },
    { name: 'Gunner arrival projectile', elapsedS: gunner.unlockAtS, rawDamage: GUNNER.projectileDamage },
    { name: 'Rustbrute arrival contact', elapsedS: rustbrute.unlockAtS, rawDamage: PLAYER.contactDamage },
  ];

  const opening = spawnPressureAt(voltling.unlockAtS);
  const gunnerArrival = spawnPressureAt(gunner.unlockAtS);
  const rustbruteArrival = spawnPressureAt(rustbrute.unlockAtS);
  assert.equal(opening.difficulty, 0);
  assert.ok(gunnerArrival.difficulty > opening.difficulty);
  assert.ok(gunnerArrival.waveSize > opening.waveSize);
  assert.ok(gunnerArrival.maxActive > opening.maxActive);
  assert.ok(rustbruteArrival.hpMultiplier > gunnerArrival.hpMultiplier);

  // Difficulty affects spawn cadence, wave/max-active population, enemy HP,
  // and elite chance. It does not multiply ordinary contact or projectile hit
  // damage, so a recovery-time report must compare the actual source of each
  // hit rather than treat every later type as a stronger fixed contact hit.
  assert.match(enemySource, /Math\.max\(ELITES\.chanceFloor, ELITES\.chanceAtMaxDifficulty \* difficulty\)/);
  assert.match(enemySource, /const hpMultiplier = \(1 \+ \(elapsedS \/ 60\) \* ENEMIES\.hpRampPerMinute\) \* Math\.max\(1, difficulty\);/);
  assert.equal(points[0].rawDamage, points[3].rawDamage);
  assert.ok(points[2].rawDamage > points[0].rawDamage);

  const report = points.map((point) => {
    const postArmor = postArmorDamage(point.rawDamage);
    const recovery = regenRates
      .map((rate) => `${((postArmor * SECONDS_PER_MINUTE) / rate).toFixed(1)}s`)
      .join(' / ');
    return `${point.name} at ${point.elapsedS}s: ${postArmor} HP per connected hit; T1-T5 recovery ${recovery}`;
  });
  t.diagnostic([
    'Regen balance signal (no armor, no shield, no dodge, no further hits):',
    `T1-T5: ${regenRates.join(' / ')} HP/min`,
    ...report,
    `Spawner: opening ${opening.waveSize} per ${opening.intervalS.toFixed(2)}s / cap ${opening.maxActive}; Gunner arrival ${gunnerArrival.waveSize} per ${gunnerArrival.intervalS.toFixed(2)}s / cap ${gunnerArrival.maxActive}; Rustbrute arrival HP multiplier ${rustbruteArrival.hpMultiplier.toFixed(2)}.`,
  ].join('\n'));

  assert.equal(recoverySeconds(PLAYER.contactDamage, regenRates[0]), 480);
  assert.equal(recoverySeconds(PLAYER.contactDamage, regenRates[4]), 96);
  assert.equal(recoverySeconds(GUNNER.projectileDamage, regenRates[4]), 120);
});
