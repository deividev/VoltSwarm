import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import * as THREE from 'three';
import { chooseCharacterId } from './character-flow.mjs';

globalThis.window = {};
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const characters = await server.ssrLoadModule('/src/characters.ts');
const config = await server.ssrLoadModule('/src/config.ts');
const stats = await server.ssrLoadModule('/src/stats.ts');
const upgrades = await server.ssrLoadModule('/src/upgrades.ts');
const contracts = await server.ssrLoadModule('/src/contracts.ts');
const profile = await server.ssrLoadModule('/src/profile.ts');
const registry = await server.ssrLoadModule('/src/models/registry.ts');
const runtimeDetails = await server.ssrLoadModule('/src/models/runtime-details.ts');
const rigModule = await server.ssrLoadModule('/src/models/rig.ts');
const game = await server.ssrLoadModule('/src/game.ts');

after(async () => server.close());

test('registry fallback and unlock filtering use stable ids', () => {
  const locked = { unlockedCharacters: [] };
  const unlocked = { unlockedCharacters: ['field-engineer', 'rack-hauler', 'overclocker', 'unknown-character'] };
  assert.equal(characters.resolveCharacterId('unknown-character', unlocked), 'field-engineer');
  assert.equal(characters.resolveCharacterId('field-engineer', locked), 'field-engineer');
  assert.equal(characters.registeredCharacterId('rack-hauler'), 'rack-hauler');
  assert.equal(characters.resolveCharacterId('rack-hauler', locked), 'field-engineer');
  assert.equal(characters.resolveCharacterId('rack-hauler', unlocked), 'rack-hauler');
  assert.equal(characters.resolveCharacterId('overclocker', locked), 'field-engineer');
  assert.equal(characters.resolveCharacterId('overclocker', unlocked), 'overclocker');
  for (const inheritedId of ['__proto__', 'constructor', 'toString']) {
    assert.equal(characters.isCharacterId(inheritedId), false);
    assert.equal(characters.registeredCharacterId(inheritedId), characters.DEFAULT_CHARACTER_ID);
    assert.equal(characters.resolveCharacterId(inheritedId, unlocked), characters.DEFAULT_CHARACTER_ID);
  }
  assert.deepEqual(characters.unlockedCharacters(locked), []);
  assert.deepEqual(characters.unlockedCharacters(unlocked).map((entry) => entry.id), ['field-engineer', 'rack-hauler', 'overclocker']);
});

test('Field Engineer has the exact approved run profile', () => {
  const engineer = characters.CHARACTER_REGISTRY['field-engineer'];
  const balance = config.CHARACTER_BALANCE.fieldEngineer;
  assert.equal(engineer.maxHp, balance.maxHp);
  assert.equal(engineer.moveSpeed, balance.moveSpeed);
  assert.equal(engineer.stats.damage, balance.damage);
  assert.equal(engineer.stats.attackSpeed, balance.attackSpeed);
  assert.equal(engineer.stats.critChance, balance.critChance);
  assert.equal(engineer.stats.critDamage, balance.critDamage);
  assert.equal(engineer.stats.armor, balance.armor);
  assert.equal(engineer.stats.regen, balance.regen);
  assert.equal(engineer.stats.luck, balance.luck);
  assert.match(engineer.signature.description, new RegExp(`${balance.fieldRepairFraction * 100}%`));
  assert.equal(config.PROFILE.weaponSockets, 2);
  assert.equal(config.PROFILE.coreSockets, 2);
  assert.equal(config.PROFILE.maxWeaponSockets, 3);
  assert.equal(config.PROFILE.maxCoreSockets, 4);
});

test('Overclocker is registered with its exact config-derived runtime contract', () => {
  const balance = config.CHARACTER_BALANCE.overclocker;
  assert.deepEqual(balance, {
    maxHp: 85,
    moveSpeed: 11,
    damage: 1,
    attackSpeed: 1,
    critChance: 0.08,
    critDamage: 0.5,
    armor: 0,
    regen: 0,
    luck: 0,
    evasion: 18,
    rewardTierShift: 1,
    physicalContactDamageMultiplier: 1.35,
  });
  assert.equal(stats.dodgeChance(balance.evasion), 18 / 118);
  assert.equal(characters.rewardTierShiftForCharacter('overclocker'), 1);
  assert.equal(characters.rewardTierShiftForCharacter('field-engineer'), 0);
  for (const source of ['swarm-contact', 'elite-contact', 'boss-contact', 'boss-ram']) {
    assert.equal(characters.physicalContactDamageMultiplier('overclocker', source), 1.35);
  }
  for (const source of ['projectile', 'telegraphed', 'other']) {
    assert.equal(characters.physicalContactDamageMultiplier('overclocker', source), 1);
  }
  assert.equal(characters.physicalContactDamageMultiplier('rack-hauler', 'swarm-contact'), 1);
  const overclocker = characters.CHARACTER_REGISTRY.overclocker;
  assert.equal(characters.isCharacterId('overclocker'), true);
  assert.equal(characters.registeredCharacterId('overclocker'), 'overclocker');
  assert.equal(overclocker.modelKey, 'overclocker');
  assert.equal(overclocker.portrait, 'assets/2d/ref-overclocker-front-v1.png');
  assert.equal(overclocker.maxHp, balance.maxHp);
  assert.equal(overclocker.moveSpeed, balance.moveSpeed);
  assert.equal(overclocker.stats.damage, balance.damage);
  assert.equal(overclocker.stats.attackSpeed, balance.attackSpeed);
  assert.equal(overclocker.stats.critChance, balance.critChance);
  assert.equal(overclocker.stats.critDamage, balance.critDamage);
  assert.equal(overclocker.stats.armor, balance.armor);
  assert.equal(overclocker.stats.evasion, balance.evasion);
  assert.equal(overclocker.recommendedWeapon, 'pulse');
  assert.equal(overclocker.signature.badge, `+${balance.rewardTierShift} CHEST / SCRAPPER TIER`);
  assert.equal(overclocker.tradeoffTitle, `+${Math.round((balance.physicalContactDamageMultiplier - 1) * 100)}% Physical Contact Damage Taken`);
  assert.deepEqual(overclocker.unlock, { kind: 'contract', contractId: 'two-of-a-kind' });
});

test('character socket projection preserves global Contract capacity without mutating PROFILE', () => {
  const profileSnapshot = structuredClone(config.PROFILE);
  const unlockedCharactersRef = config.PROFILE.unlockedCharacters;

  assert.deepEqual(
    characters.effectiveSocketCapacities('field-engineer', config.PROFILE),
    { weapon: { open: 2, max: 3 }, core: { open: 2, max: 4 } },
  );
  assert.deepEqual(
    characters.effectiveSocketCapacities(characters.RACK_HAULER_ID, config.PROFILE),
    { weapon: { open: 3, max: 4 }, core: { open: 1, max: 3 } },
  );
  assert.deepEqual(
    characters.effectiveSocketCapacities(characters.RACK_HAULER_ID, {
      ...config.PROFILE,
      weaponSockets: 3,
      coreSockets: 3,
    }),
    { weapon: { open: 4, max: 4 }, core: { open: 2, max: 3 } },
  );
  assert.deepEqual(
    characters.effectiveSocketCapacities(characters.RACK_HAULER_ID, {
      ...config.PROFILE,
      weaponSockets: 3,
      coreSockets: 4,
    }),
    { weapon: { open: 4, max: 4 }, core: { open: 3, max: 3 } },
  );
  assert.deepEqual(
    contracts.ALL_CONTRACTS
      .filter(({ id }) => ['boss-hunter', 'second-wind', 'full-loadout'].includes(id))
      .map(({ id, reward }) => [id, reward]),
    [
      ['second-wind', { kind: 'socket', slot: 'core', index: 3 }],
      ['boss-hunter', { kind: 'socket', slot: 'weapon', index: 3 }],
      ['full-loadout', { kind: 'socket', slot: 'core', index: 4 }],
    ],
  );
  assert.deepEqual(config.PROFILE, profileSnapshot);
  assert.strictEqual(config.PROFILE.unlockedCharacters, unlockedCharactersRef);
});

test('Rack Hauler is a registered Contract character with the exact approved profile', () => {
  const rack = characters.CHARACTER_REGISTRY['rack-hauler'];
  const balance = config.CHARACTER_BALANCE.rackHauler;
  assert.deepEqual(Object.keys(characters.CHARACTER_REGISTRY), ['field-engineer', 'rack-hauler', 'overclocker']);
  assert.equal(characters.isCharacterId('rack-hauler'), true);
  assert.equal(rack.signature.name, 'Open Rack');
  assert.equal(rack.signature.icon, 'assets/2d/icon-stat-projectiles-v2.png');
  assert.equal(rack.recommendedWeapon, 'blades');
  assert.equal(rack.maxHp, balance.maxHp);
  assert.equal(rack.moveSpeed, balance.moveSpeed);
  assert.equal(rack.stats.damage, balance.damage);
  assert.equal(rack.stats.attackSpeed, balance.attackSpeed);
  assert.equal(rack.stats.critChance, 0.03);
  assert.equal(rack.stats.critDamage, balance.critDamage);
  assert.equal(rack.stats.armor, balance.armor);
  assert.equal(rack.stats.regen, balance.regen);
  assert.equal(rack.stats.luck, balance.luck);
  assert.equal('passive' in rack, false);
  assert.deepEqual(rack.unlock, { kind: 'contract', contractId: 'proving-ground' });
  const provingGround = contracts.ALL_CONTRACTS.find(({ id }) => id === rack.unlock.contractId);
  assert.equal(provingGround?.latent, undefined);
  assert.deepEqual(provingGround?.reward, { kind: 'character', id: 'rack-hauler' });
  assert.equal(contracts.ACTIVE_CONTRACTS.includes(provingGround), true);
  assert.equal(contracts.ALL_CONTRACTS.length, 29);
  assert.equal(contracts.ACTIVE_CONTRACTS.length, 29);
});

test('Rack Hauler draft projection opens a third weapon without changing global odds or PROFILE', () => {
  const profileSnapshot = structuredClone(config.PROFILE);
  const weapons = upgrades.emptyWeaponLevels();
  weapons.bolt = 1;
  weapons.pulse = 1;

  const fieldChoices = upgrades.rollUpgradeChoices(
    stats.defaultStats(), weapons, {}, {}, 3, 'field-engineer',
  );
  const rackChoices = upgrades.rollUpgradeChoices(
    stats.defaultStats(), weapons, {}, {}, 3, characters.RACK_HAULER_ID,
  );

  assert.equal(fieldChoices.some((card) => card.draftKind === 'weapon'), false);
  assert.equal(rackChoices.some((card) => card.draftKind === 'weapon'), true);
  assert.deepEqual(config.PROFILE, profileSnapshot);
});

test('socket presentation represents Rack counts while the locked roster keeps it unavailable', () => {
  const initial = characters.effectiveSocketCapacities('rack-hauler', config.PROFILE);
  assert.deepEqual(
    characters.socketPresentationStates(1, initial.weapon),
    ['installed', 'empty', 'empty', 'locked'],
  );
  assert.deepEqual(
    characters.socketPresentationStates(0, initial.core),
    ['empty', 'locked', 'locked'],
  );
  assert.equal(characters.unlockedCharacters(config.PROFILE).some(({ id }) => id === 'rack-hauler'), false);
  assert.equal(Object.hasOwn(characters.CHARACTER_REGISTRY, 'rack-hauler'), true);
});

test('weapon socket migration raises old saves and preserves Boss Hunter payout', () => {
  assert.equal(profile.normalizeWeaponSockets(1, 2, 3, false), 2);
  assert.equal(profile.normalizeWeaponSockets(2, 2, 3, false), 2);
  assert.equal(profile.normalizeWeaponSockets(2, 2, 3, true), 3);
  assert.equal(profile.normalizeWeaponSockets(99, 2, 3, false), 2);
  assert.equal(profile.normalizeWeaponSockets('invalid', 2, 3, false), 2);
});

test('Boss Hunter unlocks weapon slot 3 and cannot exceed the design cap', () => {
  const bossHunter = contracts.ALL_CONTRACTS.find((contract) => contract.id === 'boss-hunter');
  assert.ok(bossHunter);
  assert.deepEqual(bossHunter.reward, { kind: 'socket', slot: 'weapon', index: 3 });
  assert.deepEqual(bossHunter.objective, {
    type: 'defeat-boss-types',
    requiredTypes: [...new Set(config.BOSS_TYPE_INDEXES.map((index) => config.ENEMY_TYPES[index].name))],
  });

  const originalSockets = config.PROFILE.weaponSockets;
  try {
    config.PROFILE.weaponSockets = 2;
    assert.deepEqual(contracts.grantReward(bossHunter.reward), {
      kind: 'socket',
      slot: 'weapon',
      index: 3,
    });
    assert.equal(config.PROFILE.weaponSockets, 3);
    contracts.grantReward(bossHunter.reward);
    assert.equal(config.PROFILE.weaponSockets, 3);
  } finally {
    config.PROFILE.weaponSockets = originalSockets;
  }
});

test('Foreman tracks every boss kind in the full-game roster', () => {
  const foreman = contracts.ALL_CONTRACTS.find((contract) => contract.id === 'foreman');
  assert.ok(foreman);
  assert.deepEqual(foreman.objective, {
    type: 'defeat-all-boss-types',
    requiredTypes: config.ENEMY_TYPES.filter((type) => type.isBoss).map((type) => type.name),
  });
  assert.equal(foreman.objective.requiredTypes.length, 3);
});

test('run RIG derives character-aware sockets while Contract pips stay global', async () => {
  const hudSource = await readFile(new URL('../src/hud.ts', import.meta.url), 'utf8');
  assert.match(hudSource, /Array\.from\(\{ length: PROFILE\.maxWeaponSockets \}/);
  assert.match(hudSource, /effectiveSocketCapacities\(characterId, PROFILE\)/);
  assert.match(hudSource, /socketPresentationStates\(ownedWeapons, capacity\.weapon\)/);
  assert.match(hudSource, /socketPresentationStates\(installedCores\.length, capacity\.core\)/);
});

test('character stat rows derive baselines and format percentage ratings', () => {
  const engineer = characters.CHARACTER_REGISTRY['field-engineer'];
  const rows = Object.fromEntries(characters.characterStatRows(engineer).map((row) => [row.label, row]));
  assert.equal(rows['Max HP'].value, `${engineer.maxHp} (+${engineer.maxHp - config.PLAYER.maxHp})`);
  assert.equal(rows.Armor.value, `${Math.round(engineer.stats.armor * 100)}%`);
  assert.equal(rows.Armor.icon, 'assets/2d/icon-stat-armor-v2.png');
  assert.notEqual(rows.Armor.icon, 'assets/2d/icon-stat-shield-v2.png');
  assert.equal(rows.Damage.value, `${Math.round((engineer.stats.damage - stats.defaultStats().damage) * 100)}%`);
  assert.equal(rows['Move Speed'].value, `${engineer.moveSpeed}`);
  assert.equal(rows['Crit Chance'].icon, 'assets/2d/icon-stat-crit.png');
  assert.equal(rows['Crit Damage'].icon, 'assets/2d/icon-stat-crit-damage.png');
  assert.equal(rows.Luck.icon, 'assets/2d/icon-stat-luck.png');
  assert.equal(rows.Regen.icon, 'assets/2d/icon-stat-regen.png');
  assert.equal(rows.Luck.value, `${Math.round(engineer.stats.luck * 100)}%`);
  assert.equal(
    rows.Regen.value,
    `${(engineer.stats.regen * config.SECONDS_PER_MINUTE) / config.PLAYER.regenTickS} HP/min`,
  );
  assert.equal(characters.characterStatRows(engineer).length, 9);
  assert.deepEqual(
    Object.fromEntries(characters.characterStatRows(engineer).map((row) => [row.id, row.changed])),
    {
      'max-hp': engineer.maxHp !== config.PLAYER.maxHp,
      armor: engineer.stats.armor !== stats.defaultStats().armor,
      damage: engineer.stats.damage !== stats.defaultStats().damage,
      'move-speed': engineer.moveSpeed !== config.PLAYER.moveSpeed,
      'attack-speed': engineer.stats.attackSpeed !== stats.defaultStats().attackSpeed,
      'crit-chance': engineer.stats.critChance !== stats.defaultStats().critChance,
      'crit-damage': engineer.stats.critDamage !== stats.defaultStats().critDamage,
      luck: engineer.stats.luck !== stats.defaultStats().luck,
      regen: engineer.stats.regen !== stats.defaultStats().regen,
    },
  );
  assert.equal(engineer.signature.badge, `${config.CHARACTER_BALANCE.fieldEngineer.fieldRepairFraction * 100}% MAX HP / CORE UPGRADE`);
  const overclockerEvasion = characters.characterStatRows(characters.CHARACTER_REGISTRY.overclocker)
    .find((row) => row.id === 'evasion');
  assert.deepEqual(overclockerEvasion, {
    id: 'evasion',
    label: 'Evasion',
    value: `${config.CHARACTER_BALANCE.overclocker.evasion}`,
    icon: 'assets/2d/icon-stat-evasion.png',
    changed: true,
  });
});

test('registered run characters survive profile lock changes', () => {
  assert.equal(characters.registeredCharacterId('field-engineer'), 'field-engineer');
  assert.equal(characters.registeredCharacterId('rack-hauler'), 'rack-hauler');
  assert.equal(characters.registeredCharacterId('overclocker'), 'overclocker');
  assert.equal(characters.registeredCharacterId('unknown-character'), characters.DEFAULT_CHARACTER_ID);
});

test('Field Repair heals 1% after an eligible gameplay Core change, clamps, and ignores rebuild paths', () => {
  assert.equal(characters.fieldRepairHp('field-engineer', 40, 110, 'gameplay'), 41.1);
  assert.equal(characters.fieldRepairHp('field-engineer', 109.5, 110, 'gameplay'), 110);
  for (const context of ['load', 'replay', 'boss-lab', 'rebuild']) {
    assert.equal(characters.fieldRepairHp('field-engineer', 40, 110, context), 40);
  }
  assert.equal(characters.fieldRepairHp('rack-hauler', 40, 100, 'gameplay'), 40);
});

test('future character reward seam grants stable ids idempotently', () => {
  const unlocked = ['field-engineer'];
  const futureIds = new Set(['field-engineer', 'future-test-character']);
  assert.equal(characters.grantCharacterId(unlocked, 'future-test-character', futureIds), true);
  assert.equal(characters.grantCharacterId(unlocked, 'future-test-character', futureIds), false);
  assert.deepEqual(unlocked, ['field-engineer', 'future-test-character']);
});

test('character Contract reward is idempotent', () => {
  const original = [...config.PROFILE.unlockedCharacters];
  const reference = config.PROFILE.unlockedCharacters;
  config.PROFILE.unlockedCharacters.splice(0);
  try {
    contracts.grantReward({ kind: 'character', id: 'rack-hauler' });
    contracts.grantReward({ kind: 'character', id: 'rack-hauler' });
    assert.strictEqual(config.PROFILE.unlockedCharacters, reference);
    assert.deepEqual(config.PROFILE.unlockedCharacters, ['rack-hauler']);
  } finally {
    config.PROFILE.unlockedCharacters.splice(0, Infinity, ...original);
  }
});

test('character unlock migration and reset preserve the live PROFILE array', () => {
  const reference = config.PROFILE.unlockedCharacters;
  profile.normalizeCharacterUnlocks(['field-engineer', 'rack-hauler', 'overclocker', 'unknown-character']);
  assert.strictEqual(config.PROFILE.unlockedCharacters, reference);
  assert.deepEqual(reference, ['field-engineer', 'rack-hauler', 'overclocker']);

  reference.push('stale-character');
  profile.normalizeCharacterUnlocks(undefined);
  assert.strictEqual(config.PROFILE.unlockedCharacters, reference);
  assert.deepEqual(reference, ['field-engineer']);
});

test('Bolt recommendation labels presentation without mutating draft membership or order', () => {
  const pool = ['pulse', 'bolt', 'tire'];
  const before = [...pool];
  assert.deepEqual(characters.labelWeaponOptions('field-engineer', pool), [
    { id: 'pulse', recommended: false },
    { id: 'bolt', recommended: true },
    { id: 'tire', recommended: false },
  ]);
  assert.deepEqual(characters.labelWeaponOptions('rack-hauler', pool), [
    { id: 'pulse', recommended: false },
    { id: 'bolt', recommended: false },
    { id: 'tire', recommended: false },
  ]);
  assert.deepEqual(characters.labelWeaponOptions('rack-hauler', ['bolt', 'blades', 'press']), [
    { id: 'bolt', recommended: false },
    { id: 'blades', recommended: true },
    { id: 'press', recommended: false },
  ]);
  assert.deepEqual(characters.labelWeaponOptions('overclocker', pool), [
    { id: 'pulse', recommended: true },
    { id: 'bolt', recommended: false },
    { id: 'tire', recommended: false },
  ]);
  assert.deepEqual(pool, before);
});

test('starting draft presents the recommendation as a non-guaranteed Suggested Start', async () => {
  const hudSource = await readFile(new URL('../src/hud.ts', import.meta.url), 'utf8');
  assert.match(hudSource, /recommended\.textContent\s*=\s*'Suggested Start'/);
});

test('character actions stay fixed outside the single section scroll owner', async () => {
  const [hudSource, cssSource, configSource] = await Promise.all([
    readFile(new URL('../src/hud.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/config.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(
    hudSource,
    /id="character-select-roster"[\s\S]*class="character-actions"[\s\S]*id="character-select-back-button"[\s\S]*id="character-confirm-button"/,
  );
  assert.match(hudSource, /dataset\.defaultCharacterId\s*=\s*DEFAULT_CHARACTER_ID/);
  assert.match(hudSource, /dataset\.characterId\s*=\s*character\.id/);
  assert.match(hudSource, /dataset\.characterUnlocked/);
  assert.match(cssSource, /\.character-screen\s*\{[\s\S]*position:\s*static;[\s\S]*height:\s*min\(640px, calc\(100dvh - 32px\)\);[\s\S]*overflow:\s*hidden;/);
  assert.match(cssSource, /\.character-layout\s*\{[\s\S]*flex:\s*1 1 auto;[\s\S]*overflow-x:\s*hidden;[\s\S]*overflow-y:\s*auto;/);
  assert.match(cssSource, /\.character-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);[\s\S]*overflow:\s*visible;/);
  assert.match(cssSource, /\.character-card\s*\{[\s\S]*min-width:\s*0;[\s\S]*min-height:\s*80px;[\s\S]*overflow:\s*visible;/);
  assert.match(cssSource, /@media \(max-width:\s*899px\)[\s\S]*\.character-grid[^}]*repeat\(2/);
  assert.match(cssSource, /@media \(max-width:\s*599px\)[\s\S]*\.character-grid[^}]*minmax\(0, 1fr\)/);
  assert.match(cssSource, /\.character-card > strong\s*\{[\s\S]*overflow:\s*visible;[\s\S]*white-space:\s*normal;[\s\S]*overflow-wrap:\s*anywhere;/);
  assert.match(cssSource, /\.character-detail\s*\{[\s\S]*grid-template-columns:[^;]*0\.9fr[^;]*1\.2fr[^;]*1\.05fr[\s\S]*overflow:\s*visible;[\s\S]*background:\s*transparent;[\s\S]*border:\s*0;/);
  assert.match(cssSource, /\.character-actions\s*\{[\s\S]*flex:\s*0 0 auto;/);
  assert.match(configSource, /MENU_NAVIGATION\s*=\s*\{[\s\S]*characterSectionScrollPx:\s*\d+/);
  assert.match(hudSource, /host\.dataset\.characterSectionScroll\s*=\s*'true'/);
  assert.match(hudSource, /host\.tabIndex\s*=\s*-1/);
  assert.match(hudSource, /scrollHeight\s*-\s*section\.clientHeight\s*>\s*1/);
  assert.match(hudSource, /MENU_NAVIGATION\.characterSectionScrollPx/);
  assert.doesNotMatch(hudSource, /data-character-detail-scroll|characterDetailScrollPx/);
});

test('automation chooses the explicit unlocked default from a scalable roster', () => {
  const roster = [
    { id: 'future-a', unlocked: true },
    { id: 'field-engineer', unlocked: true },
    { id: 'future-b', unlocked: false },
  ];
  assert.equal(chooseCharacterId(roster, 'field-engineer'), 'field-engineer');
  assert.equal(chooseCharacterId(roster, 'missing'), 'future-a');
  assert.equal(chooseCharacterId([{ id: 'locked', unlocked: false }], 'locked'), null);
});

test('Recorded-build replay restores the character baseline before replaying Cores', async () => {
  // The ordering invariant now lives in applyRecordedBuild, shared by the Boss
  // Lab and the Map 2 dev shortcuts. Assert it where the code actually is, and
  // assert the Boss Lab still routes through it rather than hand-rolling a copy.
  const gameSource = await readFile(new URL('../src/game.ts', import.meta.url), 'utf8');
  const apply = gameSource.slice(
    gameSource.indexOf('private applyRecordedBuild'),
    gameSource.indexOf('private enterBossLab'),
  );
  const resolveAt = apply.indexOf('registeredCharacterId(record.characterId)');
  const rewardShiftAt = apply.indexOf('setRewardTierShift(rewardTierShiftForCharacter(this.currentCharacterId))');
  const statsAt = apply.indexOf('characterStats(this.currentCharacterId)');
  const modelAt = apply.indexOf('this.player.setCharacterModelKey(character.modelKey)');
  const replayAt = apply.indexOf('replayCoresOntoStats(this.stats, this.player, this.coreLevels)');
  assert.ok(resolveAt >= 0 && rewardShiftAt > resolveAt && statsAt > rewardShiftAt && modelAt > statsAt && replayAt > modelAt);
  assert.doesNotMatch(apply, /fieldRepairHp\(/);

  const bossLab = gameSource.slice(gameSource.indexOf('private enterBossLab'), gameSource.indexOf('private installAuditionKeys'));
  assert.match(bossLab, /this\.applyRecordedBuild\(record\)/);
  assert.doesNotMatch(bossLab, /fieldRepairHp\(/);
});

test('Recorded-build replay synchronizes reward tier shift in both identity directions', () => {
  const shifts = [];
  const models = [];
  const fakeGame = {
    currentCharacterId: 'field-engineer',
    pickups: { setRewardTierShift: (shift) => { shifts.push(shift); } },
    player: {
      maxHp: 0,
      hp: 0,
      moveSpeed: 0,
      setCharacterModelKey: (modelKey) => { models.push(modelKey); },
    },
    stats: stats.defaultStats(),
    weaponLevels: {},
    weaponBranches: {},
    modCounts: {},
    coreLevels: {},
    progression: { level: 1 },
  };
  const record = (characterId) => ({
    characterId,
    weaponLevels: {},
    modCounts: {},
    coreLevels: {},
    level: 1,
  });

  game.Game.prototype.applyRecordedBuild.call(fakeGame, record('overclocker'));
  assert.equal(fakeGame.currentCharacterId, 'overclocker');
  assert.equal(fakeGame.stats.evasion, config.CHARACTER_BALANCE.overclocker.evasion);
  assert.deepEqual(shifts, [config.CHARACTER_BALANCE.overclocker.rewardTierShift]);
  assert.deepEqual(models, ['overclocker']);

  game.Game.prototype.applyRecordedBuild.call(fakeGame, record('field-engineer'));
  assert.equal(fakeGame.currentCharacterId, 'field-engineer');
  assert.equal(fakeGame.stats.evasion, stats.defaultStats().evasion);
  assert.deepEqual(shifts, [config.CHARACTER_BALANCE.overclocker.rewardTierShift, 0]);
  assert.deepEqual(models, ['overclocker', 'field-engineer']);
});

test('Field Engineer runtime details add a real rear backpack with three sockets', () => {
  const colors = [];
  const details = runtimeDetails.buildRuntimeModelDetails(
    registry.VOXEL_MODELS['field-engineer'],
    (color) => {
      colors.push(color);
      return new THREE.MeshLambertMaterial({ color });
    },
  );
  assert.ok(details);
  assert.equal(details.userData.runtimeDetail, 'backpack');
  assert.equal(details.userData.socketCount, 3);
  assert.ok(details.children.length >= 8);
  assert.equal(colors.length, 3);
  runtimeDetails.disposeRuntimeModel(details);
});

test('runtime details preserve model-space placement and follow the torso pivot', () => {
  const root = new THREE.Group();
  const torsoPivot = new THREE.Group();
  torsoPivot.position.set(0.4, 0.8, 0);
  root.add(torsoPivot);
  const rig = { root, parts: { torso: { pivot: torsoPivot } } };
  const details = new THREE.Group();
  const marker = new THREE.Object3D();
  marker.position.set(0.2, 1.1, -0.4);
  details.add(marker);
  root.updateMatrixWorld(true);
  const authoredWorld = marker.getWorldPosition(new THREE.Vector3());

  assert.equal(rigModule.attachToRigPart(rig, details), true);
  root.updateMatrixWorld(true);
  assert.ok(marker.getWorldPosition(new THREE.Vector3()).distanceTo(authoredWorld) < 1e-9);

  torsoPivot.rotation.x = 0.2;
  root.updateMatrixWorld(true);
  assert.ok(marker.getWorldPosition(new THREE.Vector3()).distanceTo(authoredWorld) > 0.01);
});

test('preview and live runtime own their material and attachment policies', async () => {
  const [previewSource, playerSource] = await Promise.all([
    readFile(new URL('../src/models/preview-main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/player.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(previewSource, /buildRuntimeModelDetails\([\s\S]*new THREE\.MeshLambertMaterial\(\{ color \}\)/);
  assert.match(previewSource, /if \(rig\) attachToRigPart\(rig, runtimeDetails\)/);
  assert.match(playerSource, /buildRuntimeModelDetails\(def, \(color\) => litMaterial\(\{ color \}\)\)/);
});

test('both character rosters reuse approved front model references without mounting WebGL', async () => {
  const [hudSource, cssSource, portraitBytes, rackPortraitBytes, rackSideBytes, rackBackBytes, rackTopBytes, overFrontBytes, overSideBytes, overBackBytes, overTopBytes] = await Promise.all([
    readFile(new URL('../src/hud.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui.css', import.meta.url), 'utf8'),
    readFile(new URL('../public/assets/2d/ref-field-engineer-front-v1.png', import.meta.url)),
    readFile(new URL('../public/assets/2d/ref-rack-hauler-front-v4-seafoam.png', import.meta.url)),
    readFile(new URL('../public/assets/2d/ref-rack-hauler-side-v4-seafoam.png', import.meta.url)),
    readFile(new URL('../public/assets/2d/ref-rack-hauler-back-v4-seafoam.png', import.meta.url)),
    readFile(new URL('../public/assets/2d/ref-rack-hauler-top-v4-seafoam.png', import.meta.url)),
    readFile(new URL('../public/assets/2d/ref-overclocker-front-v1.png', import.meta.url)),
    readFile(new URL('../public/assets/2d/ref-overclocker-side-v1.png', import.meta.url)),
    readFile(new URL('../public/assets/2d/ref-overclocker-back-v1.png', import.meta.url)),
    readFile(new URL('../public/assets/2d/ref-overclocker-top-v1.png', import.meta.url)),
  ]);
  assert.match(hudSource, /renderCharacterRoster\('characters-roster', false\)/);
  assert.match(hudSource, /renderCharacterRoster\('character-select-roster', true\)/);
  assert.doesNotMatch(hudSource, /CharacterModelPreview|character-model-preview|character-model-canvas/);
  assert.match(hudSource, /`\$\{character\.name\} portrait`/);
  assert.match(hudSource, /large \? ''/);
  assert.match(cssSource, /\.character-card \.character-portrait\s*\{[\s\S]*object-fit:\s*contain/);
  assert.doesNotMatch(cssSource, /\.character-model-preview|\.character-model-canvas/);
  assert.match(hudSource, /data-character-stat="\$\{row\.id\}"/);
  assert.match(hudSource, /data-character-module="signature"[\s\S]*selected\.signature\.icon/);
  assert.match(hudSource, /data-character-module="recommended-weapon"[\s\S]*Suggested Start/);
  assert.match(hudSource, /data-character-module="tradeoff"[\s\S]*selected\.tradeoffIcon/);
  assert.match(hudSource, /<span>\$\{selected\.archetype\}<\/span>/);
  assert.match(hudSource, /if \(unlocked \|\| character\.unlock\.kind === 'default'\) \{[\s\S]*return '';/);
  assert.doesNotMatch(hudSource, /character-unlock-chip|character-unlock-footer unlocked/);
  assert.doesNotMatch(cssSource, /character-unlock-chip|character-unlock-footer\.unlocked/);
  assert.match(hudSource, /icon-ui-lock-v2\.png[\s\S]*segmentedContractBarHtml/);
  assert.match(hudSource, /lockIcon\.src\s*=\s*'assets\/2d\/icon-ui-lock-v2\.png'/);
  assert.match(hudSource, /lockIcon\.alt\s*=\s*''/);
  assert.match(hudSource, /status\.append\(unlocked \? 'Unlocked' : 'Locked'\)/);
  assert.doesNotMatch(hudSource, /status\.innerHTML/);
  assert.match(cssSource, /\.character-stat-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(cssSource, /@media \(max-width:\s*899px\)[\s\S]*\.character-detail[^}]*repeat\(2/);
  assert.match(cssSource, /@media \(max-width:\s*599px\)[\s\S]*\.character-stat-grid[^}]*repeat\(2/);
  assert.match(cssSource, /@media \(max-width:\s*419px\)[\s\S]*\.character-stat-grid[^}]*minmax\(0, 1fr\)/);
  assert.doesNotMatch(hudSource, /character-profile-status/);
  assert.match(hudSource, /data-character-stat-changed="\$\{row\.changed\}"/);
  assert.equal(characters.CHARACTER_REGISTRY['field-engineer'].modelKey, 'field-engineer');
  assert.equal(
    characters.CHARACTER_REGISTRY['field-engineer'].portrait,
    'assets/2d/ref-field-engineer-front-v1.png',
  );
  assert.ok(registry.VOXEL_MODELS[characters.CHARACTER_REGISTRY['field-engineer'].modelKey]);
  const rack = characters.CHARACTER_REGISTRY['rack-hauler'];
  assert.equal(rack.modelKey, 'rack-hauler');
  assert.equal(rack.portrait, 'assets/2d/ref-rack-hauler-front-v4-seafoam.png');
  assert.deepEqual(registry.VOXEL_MODELS[rack.modelKey], {
    kind: 'player',
    ref: 'assets/2d/ref-rack-hauler-front-v4-seafoam.png',
    sideProfileRef: 'assets/2d/ref-rack-hauler-side-v4-seafoam.png',
    backPaintRef: 'assets/2d/ref-rack-hauler-back-v4-seafoam.png',
    topPaintRef: 'assets/2d/ref-rack-hauler-top-v4-seafoam.png',
    topPaintColors: [0x3b9b73, 0xbae8c6, 0x202830, 0xe9f6ff],
    sidePaint: true,
    targetWidth: 41,
    voxelSize: 0.0294,
    bodyColor: 0xbae8c6,
    palette: [0x3b9b73, 0xbae8c6, 0x202830, 0xe9f6ff],
    frontOnly: [],
    armorColors: [0x3b9b73, 0xbae8c6],
    segments: [
      { from: 0, to: 0.25 },
      { from: 0.25, to: 0.67 },
      { from: 0.67, to: 1 },
    ],
    raisedTopFraction: 0,
    previewScale: 2,
  });
  assert.equal(portraitBytes.toString('ascii', 1, 4), 'PNG');
  assert.equal(portraitBytes.readUInt32BE(16), 597);
  assert.equal(portraitBytes.readUInt32BE(20), 826);
  for (const bytes of [rackPortraitBytes, rackSideBytes, rackBackBytes, rackTopBytes]) {
    assert.equal(bytes.toString('ascii', 1, 4), 'PNG');
  }
  assert.deepEqual(
    [rackPortraitBytes, rackSideBytes, rackBackBytes, rackTopBytes].map((bytes) => [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]),
    [[540, 864], [240, 864], [540, 864], [540, 732]],
  );
  assert.equal(new Set(
    [rackPortraitBytes, rackSideBytes, rackBackBytes, rackTopBytes]
      .map((bytes) => createHash('sha256').update(bytes).digest('hex')),
  ).size, 4);
  const overclocker = characters.CHARACTER_REGISTRY.overclocker;
  assert.equal(overclocker.modelKey, 'overclocker');
  assert.equal(overclocker.portrait, 'assets/2d/ref-overclocker-front-v1.png');
  assert.equal(registry.VOXEL_MODELS[overclocker.modelKey].ref, overclocker.portrait);
  assert.equal(registry.VOXEL_MODELS[overclocker.modelKey].sideProfileRef, 'assets/2d/ref-overclocker-side-v1.png');
  assert.equal(registry.VOXEL_MODELS[overclocker.modelKey].backPaintRef, 'assets/2d/ref-overclocker-back-v1.png');
  assert.equal(registry.VOXEL_MODELS[overclocker.modelKey].topPaintRef, 'assets/2d/ref-overclocker-top-v1.png');
  for (const bytes of [overFrontBytes, overSideBytes, overBackBytes, overTopBytes]) {
    assert.equal(bytes.toString('ascii', 1, 4), 'PNG');
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [1024, 1024]);
  }
});
