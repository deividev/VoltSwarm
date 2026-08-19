import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CORE_TIER_MAGNITUDES,
  BOSS,
  ELITES,
  ENEMIES,
  ENEMY_TYPES,
  GUNNER,
  MAPS,
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
function spawnPressureAt(elapsedS, curve = MAPS[0].difficulty) {
  const difficulty = difficultyScalar(elapsedS, 0, curve);
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
  // chooses PLAYER.contactDamage for every non-boss, then applies the elite
  // multiplier and the MAP's contact multiplier. Gunner differs because its
  // projectile sends its own configured damage through the same damage funnel —
  // and it is deliberately NOT scaled by the map, so the two paths diverge from
  // Map 2 onwards.
  for (const type of [voltling, gunner, rustbrute]) {
    assert.equal('damage' in type, false, `${type.name} must not invent a per-type contact damage value`);
  }
  assert.match(
    gameSource,
    /PLAYER\.contactDamage \*\s*\(e\.elite \? ELITES\.scaleMultiplier : 1\) \*\s*\(MAPS\[this\.runFlow\.mapIndex\]\?\.contactDamageMult \?\? 1\)/,
  );
  // Map 1 IS the baseline: any value but 1 there silently retunes every number
  // this report is built on.
  assert.equal(MAPS[0].contactDamageMult, 1);
  assert.equal(MAPS[0].bossContactDamageMult, 1);

  // THE HIT HIERARCHY, per map. This broke silently once and nobody noticed for
  // two versions: raising the swarm's per-map multiplier pushed elite contact
  // (8 x 1.35 x 1.5 = 16.2) past a boss's touch, so the biggest thing on the
  // field stopped being the most dangerous thing to stand next to.
  //
  // The upper bound is the other half of the same lesson: BOSS.contactDamage was
  // cut 25 -> 12 in 2026-07-30 because 25 was 62.5 DPS and killed a full-health
  // player in 1.6s while a boss needed ~30s to kill. Any future raise has to
  // stay clear of that, and "clear" is measured, not eyeballed.
  const REJECTED_BOSS_DPS = 25 / PLAYER.invulnAfterHitS;
  for (const map of MAPS) {
    const ambient = PLAYER.contactDamage * map.contactDamageMult;
    const elite = ambient * ELITES.scaleMultiplier;
    const boss = BOSS.contactDamage * map.bossContactDamageMult;
    assert.ok(elite > ambient, `${map.id}: an elite must cost more than a grunt`);
    assert.ok(boss > elite, `${map.id}: a boss touch must cost more than an elite touch`);
    assert.ok(
      boss / PLAYER.invulnAfterHitS < REJECTED_BOSS_DPS * 0.85,
      `${map.id}: boss contact is approaching the DPS that was measured and rejected`,
    );
  }
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
    {
      name: 'Map 2 Voltling contact',
      elapsedS: 0,
      rawDamage: PLAYER.contactDamage * MAPS[1].contactDamageMult,
    },
  ];

  const opening = spawnPressureAt(voltling.unlockAtS);
  const gunnerArrival = spawnPressureAt(gunner.unlockAtS);
  const rustbruteArrival = spawnPressureAt(rustbrute.unlockAtS);
  assert.equal(opening.difficulty, 0);
  assert.ok(gunnerArrival.difficulty > opening.difficulty);
  assert.ok(gunnerArrival.waveSize > opening.waveSize);
  assert.ok(gunnerArrival.maxActive > opening.maxActive);
  assert.ok(rustbruteArrival.hpMultiplier > gunnerArrival.hpMultiplier);

  // Where Map 2 is allowed to open, bounded by two points on Map 1's OWN curve
  // rather than by a magic ratio: no lower than Map 1's midpoint (below that it
  // is a restart, and the player crosses with a finished build) and below Map 1's
  // close (a map that opens at the ceiling has no crescendo left to play).
  //
  // The upper bound is not theory: the floor sat at 0.9 (346 against a close of
  // 380) and the playtest read it as "basically where Map 1 ended".
  const map1Mid = spawnPressureAt(MAPS[0].durationS / 2, MAPS[0].difficulty);
  const map1Close = spawnPressureAt(MAPS[0].durationS, MAPS[0].difficulty);
  const map2Open = spawnPressureAt(0, MAPS[1].difficulty);
  const map2Close = spawnPressureAt(MAPS[1].durationS, MAPS[1].difficulty);
  assert.ok(map2Open.maxActive < map1Close.maxActive, 'Map 2 must open below Map 1 s close');
  assert.ok(map2Open.maxActive >= map1Mid.maxActive, 'Map 2 must not restart the ramp');
  assert.ok(map2Close.maxActive > map1Close.maxActive, 'Map 2 must finish past Map 1 s ceiling');
  assert.ok(map2Close.difficulty > map2Open.difficulty, 'Map 2 must actually ramp');

  // Difficulty affects spawn cadence, wave/max-active population, enemy HP,
  // and elite chance. It does not multiply ordinary contact or projectile hit
  // damage, so a recovery-time report must compare the actual source of each
  // hit rather than treat every later type as a stronger fixed contact hit.
  assert.match(enemySource, /Math\.max\(ELITES\.chanceFloor, ELITES\.chanceAtMaxDifficulty \* difficulty\)/);
  // The HP ramp reads the ARC clock, not the per-map combat clock: a sector
  // crossing must never hand the player a softer swarm than the one it left.
  assert.match(
    enemySource,
    /\(1 \+ \(arcElapsedS \/ 60\) \* ENEMIES\.hpRampPerMinute\) \* Math\.max\(1, difficulty\);/,
  );
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
    `Map curves: Map 1 cap ${map1Close.maxActive} at difficulty ${map1Close.difficulty.toFixed(2)}; Map 2 opens at cap ${map2Open.maxActive} (difficulty ${map2Open.difficulty.toFixed(2)}) and closes at cap ${map2Close.maxActive} (difficulty ${map2Close.difficulty.toFixed(2)}).`,
  ].join('\n'));

  assert.equal(recoverySeconds(PLAYER.contactDamage, regenRates[0]), 480);
  assert.equal(recoverySeconds(PLAYER.contactDamage, regenRates[4]), 96);
  assert.equal(recoverySeconds(GUNNER.projectileDamage, regenRates[4]), 120);
});
