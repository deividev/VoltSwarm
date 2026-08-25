import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createServer } from 'vite';

globalThis.window = {
  electronAPI: undefined,
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
};
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
const {
  ACHIEVEMENT_REGISTRY,
  evaluateAchievements,
  evaluateAchievementsAfterProfileSave,
} = await server.ssrLoadModule('/src/achievements.ts');
const profile = await server.ssrLoadModule('/src/profile.ts');
const contracts = await server.ssrLoadModule('/src/contracts.ts');
const config = await server.ssrLoadModule('/src/config.ts');
const mods = await server.ssrLoadModule('/src/mods.ts');

const lifetime = (overrides = {}) => ({
  runsFinished: 0,
  chestsByTier: {},
  bestLevel: 0,
  bossesDefeated: 0,
  maxMapsReached: 0,
  bossTypesDefeated: [],
  runsCompleted: 0,
  completedCharacterIds: [],
  completedContracts: [],
  weaponMaxLevel: {},
  damageByWeapon: {},
  bestDistinctCoresHeld: 0,
  bestDistinctPermanentModsHeld: 0,
  bestPuristSectors: 0,
  bestFlawlessRunS: 0,
  bestKillsInRun: 0,
  ...overrides,
});

const achievementProfile = (overrides = {}) => ({
  weaponSockets: 2,
  coreSockets: 2,
  levelupDiscards: 3,
  ...overrides,
});

test('First Shift requires one finished recorded run', () => {
  const firstShift = ACHIEVEMENT_REGISTRY.find((entry) => entry.id === 'ach_first_shift');
  assert.ok(firstShift);
  assert.equal(firstShift.steamApiName, 'ACH_FIRST_SHIFT');
  assert.equal(firstShift.isComplete(lifetime()), false);
  assert.equal(firstShift.isComplete(lifetime({ runsFinished: 1 })), true);
});

test('Crack the Cache counts only positive paid-chest ledger values', () => {
  const crackTheCache = ACHIEVEMENT_REGISTRY.find((entry) => entry.id === 'ach_cache_opened');
  assert.ok(crackTheCache);
  assert.deepEqual({
    steamApiName: crackTheCache.steamApiName,
    displayName: crackTheCache.displayName,
    steamDescription: crackTheCache.steamDescription,
    hidden: crackTheCache.hidden,
  }, {
    steamApiName: 'ACH_CACHE_OPENED',
    displayName: 'Crack the Cache',
    steamDescription: 'Open your first paid chest.',
    hidden: false,
  });
  assert.equal(crackTheCache.isComplete(lifetime()), false);
  assert.equal(crackTheCache.isComplete(lifetime({
    chestsByTier: { bronze: 0, gold: -4, corrupt: Number.NaN },
  })), false);
  assert.equal(crackTheCache.isComplete(lifetime({ chestsByTier: { bronze: 1 } })), true);
});

test('Systems Online unlocks at the configured level boundary', () => {
  const systemsOnline = ACHIEVEMENT_REGISTRY.find((entry) => entry.id === 'ach_systems_online');
  assert.ok(systemsOnline);
  assert.deepEqual({
    steamApiName: systemsOnline.steamApiName,
    displayName: systemsOnline.displayName,
    steamDescription: systemsOnline.steamDescription,
    hidden: systemsOnline.hidden,
  }, {
    steamApiName: 'ACH_SYSTEMS_ONLINE',
    displayName: 'Systems Online',
    steamDescription: 'Reach level 10 in a single run.',
    hidden: false,
  });
  assert.equal(systemsOnline.isComplete(lifetime({ bestLevel: 9 })), false);
  assert.equal(systemsOnline.isComplete(lifetime({ bestLevel: 10 })), true);
  assert.equal(systemsOnline.isComplete(lifetime({ bestLevel: 11 })), true);
  assert.equal(systemsOnline.isComplete(lifetime({ bestLevel: -1 })), false);
  assert.equal(systemsOnline.isComplete(lifetime({ bestLevel: Number.NaN })), false);
  assert.equal(systemsOnline.isComplete(lifetime({ bestLevel: Number.POSITIVE_INFINITY })), false);
});

test('Bigger They Fall unlocks at the configured boss boundary', () => {
  const firstBossDown = ACHIEVEMENT_REGISTRY.find((entry) => entry.id === 'ach_first_boss_down');
  assert.ok(firstBossDown);
  assert.deepEqual({
    steamApiName: firstBossDown.steamApiName,
    displayName: firstBossDown.displayName,
    steamDescription: firstBossDown.steamDescription,
    hidden: firstBossDown.hidden,
  }, {
    steamApiName: 'ACH_FIRST_BOSS_DOWN',
    displayName: 'Bigger They Fall',
    steamDescription: 'Defeat your first boss.',
    hidden: false,
  });
  assert.equal(firstBossDown.isComplete(lifetime({ bossesDefeated: 0 })), false);
  assert.equal(firstBossDown.isComplete(lifetime({ bossesDefeated: 1 })), true);
  assert.equal(firstBossDown.isComplete(lifetime({ bossesDefeated: 2 })), true);
  assert.equal(firstBossDown.isComplete(lifetime({ bossesDefeated: -1 })), false);
  assert.equal(firstBossDown.isComplete(lifetime({ bossesDefeated: Number.NaN })), false);
  assert.equal(firstBossDown.isComplete(lifetime({ bossesDefeated: Number.POSITIVE_INFINITY })), false);
});

test('Foundry Bound unlocks at the configured map boundary', () => {
  const foundryBound = ACHIEVEMENT_REGISTRY.find((entry) => entry.id === 'ach_foundry_bound');
  assert.ok(foundryBound);
  assert.deepEqual({
    steamApiName: foundryBound.steamApiName,
    displayName: foundryBound.displayName,
    steamDescription: foundryBound.steamDescription,
    hidden: foundryBound.hidden,
  }, {
    steamApiName: 'ACH_FOUNDRY_BOUND',
    displayName: 'Foundry Bound',
    steamDescription: 'Clear Scrapyard and enter Swarm Foundry.',
    hidden: false,
  });
  assert.equal(foundryBound.isComplete(lifetime({ maxMapsReached: 1 })), false);
  assert.equal(foundryBound.isComplete(lifetime({ maxMapsReached: 2 })), true);
  assert.equal(foundryBound.isComplete(lifetime({ maxMapsReached: 3 })), true);
  assert.equal(foundryBound.isComplete(lifetime({ maxMapsReached: -1 })), false);
  assert.equal(foundryBound.isComplete(lifetime({ maxMapsReached: Number.NaN })), false);
  assert.equal(foundryBound.isComplete(lifetime({ maxMapsReached: Number.POSITIVE_INFINITY })), false);
});

test('Scrapyard Command requires both exact persisted boss identities', () => {
  const scrapyardCommand = ACHIEVEMENT_REGISTRY.find((entry) => entry.id === 'ach_scrapyard_command');
  assert.ok(scrapyardCommand);
  assert.deepEqual({
    steamApiName: scrapyardCommand.steamApiName,
    displayName: scrapyardCommand.displayName,
    steamDescription: scrapyardCommand.steamDescription,
    hidden: scrapyardCommand.hidden,
  }, {
    steamApiName: 'ACH_SCRAPYARD_COMMAND',
    displayName: 'Scrapyard Command',
    steamDescription: 'Defeat both Crusher King and Tesla Titan across your career.',
    hidden: false,
  });
  assert.equal(scrapyardCommand.isComplete(lifetime()), false);
  assert.equal(scrapyardCommand.isComplete(lifetime({ bossTypesDefeated: ['Crusher King'] })), false);
  assert.equal(scrapyardCommand.isComplete(lifetime({ bossTypesDefeated: ['Tesla Titan'] })), false);
  assert.equal(scrapyardCommand.isComplete(lifetime({
    bossTypesDefeated: ['Crusher King', 'Tesla Titan'],
  })), true);
  assert.equal(scrapyardCommand.isComplete(lifetime({
    bossTypesDefeated: ['Tesla Titan', 'Crusher King', 'Crusher King'],
  })), true);
  assert.equal(scrapyardCommand.isComplete(lifetime({ bossTypesDefeated: ['crusher-king', 'tesla-titan'] })), false);
  assert.equal(scrapyardCommand.isComplete(lifetime({ bossTypesDefeated: null })), false);
  assert.equal(scrapyardCommand.isComplete(lifetime({ bossTypesDefeated: 'Crusher King,Tesla Titan' })), false);
});

test('Hazard Contained requires the exact persisted final boss identity and stays hidden', () => {
  const hazardContained = ACHIEVEMENT_REGISTRY.find((entry) => entry.id === 'ach_hazard_contained');
  assert.ok(hazardContained);
  assert.deepEqual({
    steamApiName: hazardContained.steamApiName,
    displayName: hazardContained.displayName,
    steamDescription: hazardContained.steamDescription,
    hidden: hazardContained.hidden,
  }, {
    steamApiName: 'ACH_HAZARD_CONTAINED',
    displayName: 'Hazard Contained',
    steamDescription: 'Defeat the Hazard Marshal.',
    hidden: true,
  });
  assert.equal(hazardContained.isComplete(lifetime()), false);
  assert.equal(hazardContained.isComplete(lifetime({ bossTypesDefeated: ['final-boss'] })), false);
  assert.equal(hazardContained.isComplete(lifetime({ bossTypesDefeated: ['Hazard Marshal'] })), true);
  assert.equal(hazardContained.isComplete(lifetime({
    bossTypesDefeated: ['Crusher King', 'Hazard Marshal', 'Hazard Marshal'],
  })), true);
  assert.equal(hazardContained.isComplete(lifetime({ bossTypesDefeated: null })), false);
  assert.equal(hazardContained.isComplete(lifetime({ bossTypesDefeated: 'Hazard Marshal' })), false);
});

test('Full Circuit unlocks only at the finite completed-run boundary and stays hidden', () => {
  const fullCircuit = ACHIEVEMENT_REGISTRY.find((entry) => entry.id === 'ach_full_circuit');
  assert.ok(fullCircuit);
  assert.deepEqual({
    steamApiName: fullCircuit.steamApiName,
    displayName: fullCircuit.displayName,
    steamDescription: fullCircuit.steamDescription,
    hidden: fullCircuit.hidden,
  }, {
    steamApiName: 'ACH_FULL_CIRCUIT',
    displayName: 'Full Circuit',
    steamDescription: 'Complete the full run by clearing both sectors in order.',
    hidden: true,
  });
  assert.equal(fullCircuit.isComplete(lifetime({ runsCompleted: 0 })), false);
  assert.equal(fullCircuit.isComplete(lifetime({ runsCompleted: 1 })), true);
  assert.equal(fullCircuit.isComplete(lifetime({ runsCompleted: 2 })), true);
  assert.equal(fullCircuit.isComplete(lifetime({ runsCompleted: -1 })), false);
  assert.equal(fullCircuit.isComplete(lifetime({ runsCompleted: Number.NaN })), false);
  assert.equal(fullCircuit.isComplete(lifetime({ runsCompleted: Number.POSITIVE_INFINITY })), false);
  assert.equal(fullCircuit.isComplete(lifetime({ runsCompleted: '1' })), false);
});

test('Field Tested requires the exact completed Field Engineer character ID', () => {
  const fieldTested = ACHIEVEMENT_REGISTRY.find((entry) => entry.id === 'ach_field_engineer_clear');
  assert.ok(fieldTested);
  assert.deepEqual({
    steamApiName: fieldTested.steamApiName,
    displayName: fieldTested.displayName,
    steamDescription: fieldTested.steamDescription,
    hidden: fieldTested.hidden,
  }, {
    steamApiName: 'ACH_FIELD_ENGINEER_CLEAR',
    displayName: 'Field Tested',
    steamDescription: 'Complete the full run as Field Engineer.',
    hidden: false,
  });
  assert.equal(fieldTested.isComplete(lifetime()), false);
  assert.equal(fieldTested.isComplete(lifetime({ completedCharacterIds: ['field-engineer'] })), true);
  assert.equal(fieldTested.isComplete(lifetime({ completedCharacterIds: ['Field Engineer'] })), false);
  assert.equal(fieldTested.isComplete(lifetime({ completedCharacterIds: ['ref-field-engineer-front-v1'] })), false);
  assert.equal(fieldTested.isComplete(lifetime({ completedCharacterIds: null })), false);
  assert.equal(fieldTested.isComplete(lifetime({ completedCharacterIds: 'field-engineer' })), false);
});

test('Fully Loaded requires the exact completed Rack Hauler character ID', () => {
  const fullyLoaded = ACHIEVEMENT_REGISTRY.find((entry) => entry.id === 'ach_rack_hauler_clear');
  assert.ok(fullyLoaded);
  assert.deepEqual({
    steamApiName: fullyLoaded.steamApiName,
    displayName: fullyLoaded.displayName,
    steamDescription: fullyLoaded.steamDescription,
    hidden: fullyLoaded.hidden,
  }, {
    steamApiName: 'ACH_RACK_HAULER_CLEAR',
    displayName: 'Fully Loaded',
    steamDescription: 'Complete the full run as Rack Hauler.',
    hidden: false,
  });
  assert.equal(fullyLoaded.isComplete(lifetime()), false);
  assert.equal(fullyLoaded.isComplete(lifetime({ completedCharacterIds: ['rack-hauler'] })), true);
  assert.equal(fullyLoaded.isComplete(lifetime({ completedCharacterIds: ['Rack Hauler'] })), false);
  assert.equal(fullyLoaded.isComplete(lifetime({
    completedCharacterIds: ['ref-rack-hauler-front-v3-seafoam.png'],
  })), false);
  assert.equal(fullyLoaded.isComplete(lifetime({ completedCharacterIds: null })), false);
  assert.equal(fullyLoaded.isComplete(lifetime({ completedCharacterIds: 'rack-hauler' })), false);
});

test('Past Redline requires the exact completed Overclocker character ID', () => {
  const pastRedline = ACHIEVEMENT_REGISTRY.find((entry) => entry.id === 'ach_overclocker_clear');
  assert.ok(pastRedline);
  assert.deepEqual({
    steamApiName: pastRedline.steamApiName,
    displayName: pastRedline.displayName,
    steamDescription: pastRedline.steamDescription,
    hidden: pastRedline.hidden,
  }, {
    steamApiName: 'ACH_OVERCLOCKER_CLEAR',
    displayName: 'Past Redline',
    steamDescription: 'Complete the full run as Overclocker.',
    hidden: false,
  });
  assert.equal(pastRedline.isComplete(lifetime()), false);
  assert.equal(pastRedline.isComplete(lifetime({ completedCharacterIds: ['overclocker'] })), true);
  assert.equal(pastRedline.isComplete(lifetime({ completedCharacterIds: ['Overclocker'] })), false);
  assert.equal(pastRedline.isComplete(lifetime({
    completedCharacterIds: ['ref-overclocker-front-v1.png'],
  })), false);
  assert.equal(pastRedline.isComplete(lifetime({ completedCharacterIds: null })), false);
  assert.equal(pastRedline.isComplete(lifetime({ completedCharacterIds: 'overclocker' })), false);
});

test('Signed and Stamped requires a valid ID in the settled Contract ledger', () => {
  const signedAndStamped = ACHIEVEMENT_REGISTRY.find((entry) => entry.id === 'ach_first_contract');
  assert.ok(signedAndStamped);
  assert.deepEqual({
    steamApiName: signedAndStamped.steamApiName,
    displayName: signedAndStamped.displayName,
    steamDescription: signedAndStamped.steamDescription,
    hidden: signedAndStamped.hidden,
  }, {
    steamApiName: 'ACH_FIRST_CONTRACT',
    displayName: 'Signed and Stamped',
    steamDescription: 'Complete your first Contract and receive its reward.',
    hidden: false,
  });
  assert.equal(signedAndStamped.isComplete(lifetime()), false);
  assert.equal(signedAndStamped.isComplete(lifetime({ completedContracts: ['first-blood'] })), true);
  assert.equal(signedAndStamped.isComplete(lifetime({ completedContracts: ['not-a-contract'] })), false);
  assert.equal(signedAndStamped.isComplete(lifetime({
    completedContracts: [null, 42, 'not-a-contract'],
  })), false);
  assert.equal(signedAndStamped.isComplete(lifetime({ completedContracts: 'first-blood' })), false);
  assert.equal(signedAndStamped.isComplete(lifetime({
    completedContracts: [],
    pendingContracts: ['first-blood'],
    grantedRewards: { 'first-blood': { kind: 'weapon', id: 'ricochet' } },
  })), false);
});

test('No Empty Sockets requires every persistent capacity at its exact config ceiling', () => {
  const fullCapacity = ACHIEVEMENT_REGISTRY.find((entry) => entry.id === 'ach_full_capacity');
  assert.ok(fullCapacity);
  assert.deepEqual({
    steamApiName: fullCapacity.steamApiName,
    displayName: fullCapacity.displayName,
    steamDescription: fullCapacity.steamDescription,
    hidden: fullCapacity.hidden,
  }, {
    steamApiName: 'ACH_FULL_CAPACITY',
    displayName: 'No Empty Sockets',
    steamDescription: 'Unlock maximum Weapon and Core capacity, plus the extra level-up discard.',
    hidden: false,
  });
  assert.equal(fullCapacity.isComplete(lifetime(), achievementProfile()), false);
  assert.equal(fullCapacity.isComplete(lifetime(), achievementProfile({ weaponSockets: 3 })), false);
  assert.equal(fullCapacity.isComplete(lifetime(), achievementProfile({
    weaponSockets: 3,
    coreSockets: 4,
    levelupDiscards: 4,
  })), true);
  assert.equal(fullCapacity.isComplete(lifetime(), achievementProfile({
    weaponSockets: 4,
    coreSockets: 4,
    levelupDiscards: 4,
  })), false);
  assert.equal(fullCapacity.isComplete(lifetime(), achievementProfile({
    weaponSockets: 3,
    coreSockets: 5,
    levelupDiscards: 4,
  })), false);
  assert.equal(fullCapacity.isComplete(lifetime(), achievementProfile({
    weaponSockets: 3,
    coreSockets: 4,
    levelupDiscards: 5,
  })), false);
  for (const malformed of [Number.NaN, Number.POSITIVE_INFINITY, '4', null]) {
    assert.equal(fullCapacity.isComplete(lifetime(), achievementProfile({
      weaponSockets: 3,
      coreSockets: 4,
      levelupDiscards: malformed,
    })), false);
  }
});

test('Factory Specification requires an integer ceiling level for a playable registered weapon', () => {
  const factorySpecification = ACHIEVEMENT_REGISTRY.find(
    (entry) => entry.id === 'ach_weapon_level_20',
  );
  assert.ok(factorySpecification);
  assert.deepEqual({
    steamApiName: factorySpecification.steamApiName,
    displayName: factorySpecification.displayName,
    steamDescription: factorySpecification.steamDescription,
    hidden: factorySpecification.hidden,
  }, {
    steamApiName: 'ACH_WEAPON_LEVEL_20',
    displayName: 'Factory Specification',
    steamDescription: 'Raise any weapon to level 20 in a single run.',
    hidden: false,
  });
  assert.equal(config.MAX_WEAPON_LEVEL, 20, 'Steam copy and the release ceiling must stay aligned');
  assert.equal(factorySpecification.isComplete(lifetime({ weaponMaxLevel: { bolt: 19 } })), false);
  assert.equal(factorySpecification.isComplete(lifetime({ weaponMaxLevel: { bolt: 20 } })), true);
  assert.equal(factorySpecification.isComplete(lifetime({ weaponMaxLevel: { bolt: 21 } })), true);
  assert.equal(factorySpecification.isComplete(lifetime({ weaponMaxLevel: { unknown: 20 } })), false);
  assert.equal(factorySpecification.isComplete(lifetime({ weaponMaxLevel: { oil: 20 } })), false);
  for (const malformed of [Number.NaN, Number.POSITIVE_INFINITY, 20.5, '20', null]) {
    assert.equal(factorySpecification.isComplete(lifetime({ weaponMaxLevel: { bolt: malformed } })), false);
  }
  assert.equal(factorySpecification.isComplete(lifetime({ weaponMaxLevel: null })), false);
  assert.equal(factorySpecification.isComplete(lifetime({ weaponMaxLevel: ['bolt', 20] })), false);
});

test('Proven Hardware requires config-derived lifetime damage for a playable registered weapon', () => {
  const provenHardware = ACHIEVEMENT_REGISTRY.find((entry) => entry.id === 'ach_weapon_mastery');
  assert.ok(provenHardware);
  assert.deepEqual({
    steamApiName: provenHardware.steamApiName,
    displayName: provenHardware.displayName,
    steamDescription: provenHardware.steamDescription,
    hidden: provenHardware.hidden,
  }, {
    steamApiName: 'ACH_WEAPON_MASTERY',
    displayName: 'Proven Hardware',
    steamDescription: 'Deal 50,000 lifetime damage with a single weapon.',
    hidden: false,
  });
  assert.equal(config.CONTRACTS.ladders.masteryDamage, 50_000);
  const threshold = config.CONTRACTS.ladders.masteryDamage;
  assert.equal(provenHardware.isComplete(lifetime({ damageByWeapon: { bolt: threshold - 0.25 } })), false);
  assert.equal(provenHardware.isComplete(lifetime({ damageByWeapon: { bolt: threshold } })), true);
  assert.equal(provenHardware.isComplete(lifetime({ damageByWeapon: { bolt: threshold + 0.5 } })), true);
  assert.equal(provenHardware.isComplete(lifetime({ damageByWeapon: { unknown: threshold } })), false);
  assert.equal(provenHardware.isComplete(lifetime({ damageByWeapon: { oil: threshold } })), false);
  for (const malformed of [Number.NaN, Number.POSITIVE_INFINITY, '50000', null]) {
    assert.equal(provenHardware.isComplete(lifetime({ damageByWeapon: { bolt: malformed } })), false);
  }
  assert.equal(provenHardware.isComplete(lifetime({ damageByWeapon: null })), false);
  assert.equal(provenHardware.isComplete(lifetime({ damageByWeapon: ['bolt', threshold] })), false);
});

test('Core Array unlocks only at the exact config-owned distinct Core capacity', () => {
  const coreArray = ACHIEVEMENT_REGISTRY.find((entry) => entry.id === 'ach_four_core_array');
  assert.ok(coreArray);
  assert.deepEqual({
    steamApiName: coreArray.steamApiName,
    displayName: coreArray.displayName,
    steamDescription: coreArray.steamDescription,
    hidden: coreArray.hidden,
  }, {
    steamApiName: 'ACH_FOUR_CORE_ARRAY',
    displayName: 'Core Array',
    steamDescription: 'Finish a recorded run carrying four distinct Cores.',
    hidden: false,
  });
  assert.equal(config.PROFILE_CAPACITY.coreSockets, 4);
  assert.equal(coreArray.isComplete(lifetime({ bestDistinctCoresHeld: 3 })), false);
  assert.equal(coreArray.isComplete(lifetime({ bestDistinctCoresHeld: 4 })), true);
  assert.equal(coreArray.isComplete(lifetime({ bestDistinctCoresHeld: 5 })), false);
  assert.equal(coreArray.isComplete(lifetime({ bestDistinctCoresHeld: -1 })), false);
  assert.equal(coreArray.isComplete(lifetime({ bestDistinctCoresHeld: 3.5 })), false);
  assert.equal(coreArray.isComplete(lifetime({ bestDistinctCoresHeld: Number.NaN })), false);
  assert.equal(coreArray.isComplete(lifetime({ bestDistinctCoresHeld: Number.POSITIVE_INFINITY })), false);
  assert.equal(coreArray.isComplete(lifetime({ bestDistinctCoresHeld: '4' })), false);
});

test('Custom Rig unlocks at the config-owned distinct Mod threshold', () => {
  const customRig = ACHIEVEMENT_REGISTRY.find((entry) => entry.id === 'ach_five_mod_rig');
  assert.ok(customRig);
  assert.deepEqual({
    steamApiName: customRig.steamApiName,
    displayName: customRig.displayName,
    steamDescription: customRig.steamDescription,
    hidden: customRig.hidden,
  }, {
    steamApiName: 'ACH_FIVE_MOD_RIG',
    displayName: 'Custom Rig',
    steamDescription: 'Finish a recorded run carrying five distinct Mods.',
    hidden: false,
  });
  assert.equal(config.ACHIEVEMENTS.fiveModRig.minimumDistinctMods, 5);
  assert.equal(customRig.isComplete(lifetime({ bestDistinctPermanentModsHeld: 4 })), false);
  assert.equal(customRig.isComplete(lifetime({ bestDistinctPermanentModsHeld: 5 })), true);
  assert.equal(customRig.isComplete(lifetime({ bestDistinctPermanentModsHeld: 6 })), true);
  assert.equal(customRig.isComplete(lifetime({ bestDistinctPermanentModsHeld: -1 })), false);
  assert.equal(customRig.isComplete(lifetime({ bestDistinctPermanentModsHeld: 4.5 })), false);
  assert.equal(customRig.isComplete(lifetime({ bestDistinctPermanentModsHeld: Number.NaN })), false);
  assert.equal(customRig.isComplete(lifetime({ bestDistinctPermanentModsHeld: Number.POSITIVE_INFINITY })), false);
  assert.equal(customRig.isComplete(lifetime({ bestDistinctPermanentModsHeld: '5' })), false);
});

test('Purist unlocks only from the config-derived full-sector telemetry', () => {
  const purist = ACHIEVEMENT_REGISTRY.find((entry) => entry.id === 'ach_purist');
  assert.ok(purist);
  assert.deepEqual({
    steamApiName: purist.steamApiName,
    displayName: purist.displayName,
    steamDescription: purist.steamDescription,
    hidden: purist.hidden,
  }, {
    steamApiName: 'ACH_PURIST',
    displayName: 'Purist',
    steamDescription: 'Clear both sectors in one run with exactly one weapon and no Mods.',
    hidden: false,
  });
  const threshold = config.CONTRACTS.puristSectors;
  assert.equal(threshold, config.MAPS.length);
  assert.equal(purist.isComplete(lifetime({ bestPuristSectors: threshold - 1 })), false);
  assert.equal(purist.isComplete(lifetime({ bestPuristSectors: threshold })), true);
  assert.equal(purist.isComplete(lifetime({ bestPuristSectors: threshold + 1 })), false);
  for (const malformed of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '2', null]) {
    assert.equal(purist.isComplete(lifetime({ bestPuristSectors: malformed })), false);
  }
});

test('Purist folding requires a complete trustworthy one-weapon permanent-Mod-free run', () => {
  const savedLifetime = structuredClone(profile.LIFETIME);
  const restoreLifetime = () => {
    for (const key of Object.keys(profile.LIFETIME)) {
      if (!(key in savedLifetime)) delete profile.LIFETIME[key];
    }
    for (const [key, value] of Object.entries(savedLifetime)) {
      if (Array.isArray(profile.LIFETIME[key]) && Array.isArray(value)) {
        profile.LIFETIME[key].splice(0, profile.LIFETIME[key].length, ...structuredClone(value));
      } else {
        profile.LIFETIME[key] = structuredClone(value);
      }
    }
  };
  const run = (id, { outcome = 'run-complete', sectorsCleared = config.MAPS.length,
    weaponLevels = { bolt: 1 }, modCounts = {} } = {}) => ({
    id,
    outcome,
    map: { id: 'swarm-foundry', number: 2, title: 'Swarm Foundry' },
    characterId: 'field-engineer',
    sectorsCleared,
    mapsReached: 2,
    durationS: 1_200,
    kills: 1,
    bossesDefeated: 1,
    level: 1,
    weaponLevels,
    weaponDamage: {},
    coreLevels: {},
    modCounts,
  });
  const doesNotQualify = [
    run('purist-partial', { outcome: 'sector-cleared', sectorsCleared: config.MAPS.length - 1 }),
    run('purist-in-progress', { outcome: 'in-progress' }),
    run('purist-no-weapon', { weaponLevels: {} }),
    run('purist-two-weapons', { weaponLevels: { bolt: 1, pulse: 1 } }),
    run('purist-disabled-oil', { weaponLevels: { bolt: 1, oil: 1 } }),
    run('purist-unknown-weapon', { weaponLevels: { bolt: 1, unknown: 1 } }),
    run('purist-fractional-weapon', { weaponLevels: { bolt: 1, pulse: 1.5 } }),
    run('purist-nonfinite-weapon', { weaponLevels: { bolt: 1, pulse: Number.POSITIVE_INFINITY } }),
    run('purist-permanent-mod', { modCounts: { 'stun-bumper': 1 } }),
    run('purist-unknown-mod', { modCounts: { unknown: 1 } }),
    run('purist-fractional-mod', { modCounts: { repair: 1.5 } }),
  ];
  try {
    profile.LIFETIME.bestPuristSectors = 0;
    for (const record of doesNotQualify) profile.recordRunInLifetime(record);
    assert.equal(profile.LIFETIME.bestPuristSectors, 0);

    profile.recordRunInLifetime(run('purist-consumables-allowed', {
      weaponLevels: { bolt: 1, oil: 0, pulse: 0 },
      modCounts: { repair: 1, haste: 2, 'scrap-cache': 1, frenzy: 3 },
    }));
    assert.equal(profile.LIFETIME.bestPuristSectors, config.CONTRACTS.puristSectors);
  } finally {
    restoreLifetime();
  }
});

test('Untouchable unlocks at the shared Contract duration and accepts legitimate fractional seconds', () => {
  const untouchable = ACHIEVEMENT_REGISTRY.find((entry) => entry.id === 'ach_untouchable');
  assert.ok(untouchable);
  assert.deepEqual({
    steamApiName: untouchable.steamApiName,
    displayName: untouchable.displayName,
    steamDescription: untouchable.steamDescription,
    hidden: untouchable.hidden,
  }, {
    steamApiName: 'ACH_UNTOUCHABLE',
    displayName: 'Untouchable',
    steamDescription: 'Survive for five minutes in a single run without taking damage.',
    hidden: false,
  });
  const threshold = config.CONTRACTS.flawlessSeconds;
  assert.equal(threshold, 300);
  assert.equal(untouchable.isComplete(lifetime({ bestFlawlessRunS: threshold - 0.001 })), false);
  assert.equal(untouchable.isComplete(lifetime({ bestFlawlessRunS: threshold })), true);
  assert.equal(untouchable.isComplete(lifetime({ bestFlawlessRunS: threshold + 0.125 })), true);
  for (const malformed of [-1, Number.NaN, Number.POSITIVE_INFINITY, '300', null]) {
    assert.equal(untouchable.isComplete(lifetime({ bestFlawlessRunS: malformed })), false);
  }
});

test('Untouchable folding requires terminal zero-damage evidence and trustworthy duration', () => {
  const savedLifetime = structuredClone(profile.LIFETIME);
  const restoreLifetime = () => {
    for (const key of Object.keys(profile.LIFETIME)) {
      if (!(key in savedLifetime)) delete profile.LIFETIME[key];
    }
    for (const [key, value] of Object.entries(savedLifetime)) {
      if (Array.isArray(profile.LIFETIME[key]) && Array.isArray(value)) {
        profile.LIFETIME[key].splice(0, profile.LIFETIME[key].length, ...structuredClone(value));
      } else {
        profile.LIFETIME[key] = structuredClone(value);
      }
    }
  };
  const run = (id, { outcome = 'defeat', durationS = config.CONTRACTS.flawlessSeconds,
    damageTaken = 0 } = {}) => ({
    id,
    outcome,
    map: { id: 'scrapyard', number: 1, title: 'Scrapyard' },
    characterId: 'field-engineer',
    durationS,
    kills: 0,
    bossesDefeated: 0,
    level: 1,
    weaponLevels: { bolt: 1 },
    weaponDamage: {},
    coreLevels: {},
    modCounts: {},
    ...(damageTaken !== undefined ? { damageTaken } : {}),
  });
  try {
    profile.LIFETIME.bestFlawlessRunS = 0;
    profile.recordRunInLifetime(run('untouchable-in-progress', { outcome: 'in-progress' }));
    const legacyUnknown = run('untouchable-legacy-unknown', { durationS: 600 });
    delete legacyUnknown.damageTaken;
    profile.recordRunInLifetime(legacyUnknown);
    profile.recordRunInLifetime(run('untouchable-damaged', { damageTaken: 1, durationS: 600 }));
    profile.recordRunInLifetime(run('untouchable-negative-duration', { durationS: -1 }));
    profile.recordRunInLifetime(run('untouchable-nonfinite-duration', { durationS: Number.POSITIVE_INFINITY }));
    assert.equal(profile.LIFETIME.bestFlawlessRunS, 0);

    profile.recordRunInLifetime(run('untouchable-short', {
      durationS: config.CONTRACTS.flawlessSeconds - 0.001,
    }));
    assert.equal(profile.LIFETIME.bestFlawlessRunS, config.CONTRACTS.flawlessSeconds - 0.001);
    profile.recordRunInLifetime(run('untouchable-exact', {
      outcome: 'sector-cleared',
      durationS: config.CONTRACTS.flawlessSeconds,
    }));
    assert.equal(profile.LIFETIME.bestFlawlessRunS, config.CONTRACTS.flawlessSeconds);
  } finally {
    restoreLifetime();
  }
});

test('Overkill unlocks at the shared Contract integer kill threshold', () => {
  const overkill = ACHIEVEMENT_REGISTRY.find((entry) => entry.id === 'ach_overkill');
  assert.ok(overkill);
  assert.deepEqual({
    steamApiName: overkill.steamApiName,
    displayName: overkill.displayName,
    steamDescription: overkill.steamDescription,
    hidden: overkill.hidden,
  }, {
    steamApiName: 'ACH_OVERKILL',
    displayName: 'Overkill',
    steamDescription: 'Destroy 800 machines in a single run.',
    hidden: false,
  });
  const threshold = config.CONTRACTS.overkillKillsInRun;
  assert.equal(threshold, 800);
  assert.equal(overkill.isComplete(lifetime({ bestKillsInRun: threshold - 1 })), false);
  assert.equal(overkill.isComplete(lifetime({ bestKillsInRun: threshold })), true);
  assert.equal(overkill.isComplete(lifetime({ bestKillsInRun: threshold + 1 })), true);
  for (const malformed of [-1, 799.5, Number.NaN, Number.POSITIVE_INFINITY, '800', null]) {
    assert.equal(overkill.isComplete(lifetime({ bestKillsInRun: malformed })), false);
  }
});

test('Overkill folding accepts only finite integer kills from terminal records', () => {
  const savedLifetime = structuredClone(profile.LIFETIME);
  const restoreLifetime = () => {
    for (const key of Object.keys(profile.LIFETIME)) {
      if (!(key in savedLifetime)) delete profile.LIFETIME[key];
    }
    for (const [key, value] of Object.entries(savedLifetime)) {
      if (Array.isArray(profile.LIFETIME[key]) && Array.isArray(value)) {
        profile.LIFETIME[key].splice(0, profile.LIFETIME[key].length, ...structuredClone(value));
      } else {
        profile.LIFETIME[key] = structuredClone(value);
      }
    }
  };
  const run = (id, { outcome = 'defeat', kills = config.CONTRACTS.overkillKillsInRun } = {}) => ({
    id,
    outcome,
    map: { id: 'scrapyard', number: 1, title: 'Scrapyard' },
    characterId: 'field-engineer',
    durationS: 600,
    kills,
    bossesDefeated: 0,
    level: 1,
    weaponLevels: { bolt: 1 },
    weaponDamage: {},
    coreLevels: {},
    modCounts: {},
    damageTaken: 1,
  });
  try {
    profile.LIFETIME.bestKillsInRun = 0;
    profile.recordRunInLifetime(run('overkill-in-progress', { outcome: 'in-progress', kills: 2_000 }));
    profile.recordRunInLifetime(run('overkill-negative', { kills: -1 }));
    profile.recordRunInLifetime(run('overkill-fractional', { kills: 800.5 }));
    profile.recordRunInLifetime(run('overkill-nonfinite', { kills: Number.POSITIVE_INFINITY }));
    assert.equal(profile.LIFETIME.bestKillsInRun, 0);

    profile.recordRunInLifetime(run('overkill-below', {
      kills: config.CONTRACTS.overkillKillsInRun - 1,
    }));
    assert.equal(profile.LIFETIME.bestKillsInRun, config.CONTRACTS.overkillKillsInRun - 1);
    profile.recordRunInLifetime(run('overkill-exact', {
      outcome: 'sector-cleared',
      kills: config.CONTRACTS.overkillKillsInRun,
    }));
    assert.equal(profile.LIFETIME.bestKillsInRun, config.CONTRACTS.overkillKillsInRun);
  } finally {
    restoreLifetime();
  }
});

test('Mod telemetry folds valid distinct IDs and counts duplicate copies once', () => {
  const savedLifetime = structuredClone(profile.LIFETIME);
  const restoreLifetime = () => {
    for (const key of Object.keys(profile.LIFETIME)) {
      if (!(key in savedLifetime)) delete profile.LIFETIME[key];
    }
    for (const [key, value] of Object.entries(savedLifetime)) {
      if (Array.isArray(profile.LIFETIME[key]) && Array.isArray(value)) {
        profile.LIFETIME[key].splice(0, profile.LIFETIME[key].length, ...structuredClone(value));
      } else {
        profile.LIFETIME[key] = structuredClone(value);
      }
    }
  };
  const run = (id, outcome, modCounts) => ({
    id,
    outcome,
    map: { id: 'scrapyard', number: 1, title: 'Scrapyard' },
    characterId: 'field-engineer',
    durationS: 1,
    kills: 0,
    bossesDefeated: 0,
    level: 1,
    weaponLevels: { bolt: 1 },
    weaponDamage: {},
    coreLevels: {},
    modCounts,
  });
  try {
    profile.LIFETIME.bestDistinctPermanentModsHeld = 0;
    profile.recordRunInLifetime(run('custom-rig-in-progress', 'in-progress', {
      repair: 1,
      haste: 1,
      'scrap-cache': 1,
      frenzy: 1,
      'stun-bumper': 1,
    }));
    assert.equal(profile.LIFETIME.bestDistinctPermanentModsHeld, 0);

    profile.recordRunInLifetime(run('custom-rig-consumables-only', 'defeat', {
      repair: 1,
      haste: 1,
      'scrap-cache': 1,
      frenzy: 1,
      'stun-bumper': 1,
    }));
    assert.equal(
      profile.LIFETIME.bestDistinctPermanentModsHeld,
      1,
      'instant consumables are used, not carried as installed rig hardware',
    );

    profile.recordRunInLifetime(run('custom-rig-terminal', 'defeat', {
      repair: 7,
      haste: 1,
      'scrap-cache': 2,
      frenzy: 1,
      'stun-bumper': 3,
      'kick-plate': 1,
      'loose-bolts': 2,
      'detonator-rig': 1,
      'barrier-cell': 3,
      unknown: 1,
      'coolant-burst': 0,
      'orb-siphon': 1.5,
      'chain-relay': Number.POSITIVE_INFINITY,
    }));
    assert.equal(
      profile.LIFETIME.bestDistinctPermanentModsHeld,
      config.ACHIEVEMENTS.fiveModRig.minimumDistinctMods,
    );
    const customRig = ACHIEVEMENT_REGISTRY.find((entry) => entry.id === 'ach_five_mod_rig');
    assert.equal(customRig.isComplete(profile.LIFETIME), true);

    profile.recordRunInLifetime(run('custom-rig-six-permanent', 'defeat', {
      'stun-bumper': 1,
      'kick-plate': 1,
      'loose-bolts': 1,
      'detonator-rig': 1,
      'barrier-cell': 1,
      'coolant-burst': 1,
    }));
    assert.equal(profile.LIFETIME.bestDistinctPermanentModsHeld, 6);
  } finally {
    restoreLifetime();
  }
});

test('Core telemetry folds only valid distinct IDs from terminal run records', () => {
  const savedLifetime = structuredClone(profile.LIFETIME);
  const restoreLifetime = () => {
    for (const key of Object.keys(profile.LIFETIME)) {
      if (!(key in savedLifetime)) delete profile.LIFETIME[key];
    }
    for (const [key, value] of Object.entries(savedLifetime)) {
      if (Array.isArray(profile.LIFETIME[key]) && Array.isArray(value)) {
        profile.LIFETIME[key].splice(0, profile.LIFETIME[key].length, ...structuredClone(value));
      } else {
        profile.LIFETIME[key] = structuredClone(value);
      }
    }
  };
  const run = (id, outcome, coreLevels) => ({
    id,
    outcome,
    map: { id: 'scrapyard', number: 1, title: 'Scrapyard' },
    characterId: 'field-engineer',
    durationS: 1,
    kills: 0,
    bossesDefeated: 0,
    level: 1,
    weaponLevels: { bolt: 1 },
    weaponDamage: {},
    coreLevels,
    modCounts: {},
  });
  try {
    profile.LIFETIME.bestDistinctCoresHeld = 0;
    profile.recordRunInLifetime(run('core-array-in-progress', 'in-progress', {
      damage: 1,
      'attack-speed': 1,
      'move-speed': 1,
      'max-hp': 1,
    }));
    assert.equal(profile.LIFETIME.bestDistinctCoresHeld, 0);

    profile.recordRunInLifetime(run('core-array-terminal', 'defeat', {
      damage: 1,
      'attack-speed': 2,
      'move-speed': 1,
      'max-hp': 3,
      unknown: 1,
      armor: 0,
      regen: 1.5,
      luck: Number.POSITIVE_INFINITY,
    }));
    assert.equal(profile.LIFETIME.bestDistinctCoresHeld, config.PROFILE_CAPACITY.coreSockets);

    profile.LIFETIME.bestDistinctCoresHeld = 0;
    profile.recordRunInLifetime(run('core-array-impossible-over-cap', 'defeat', {
      damage: 1,
      'attack-speed': 1,
      'move-speed': 1,
      'max-hp': 1,
      armor: 1,
    }));
    assert.equal(profile.LIFETIME.bestDistinctCoresHeld, 0);
  } finally {
    restoreLifetime();
  }
});

test('finished-run folding accepts only trustworthy playable weapon progress', () => {
  const savedLifetime = structuredClone(profile.LIFETIME);
  const restoreLifetime = () => {
    for (const key of Object.keys(profile.LIFETIME)) {
      if (!(key in savedLifetime)) delete profile.LIFETIME[key];
    }
    for (const [key, value] of Object.entries(savedLifetime)) {
      if (Array.isArray(profile.LIFETIME[key]) && Array.isArray(value)) {
        profile.LIFETIME[key].splice(0, profile.LIFETIME[key].length, ...structuredClone(value));
      } else {
        profile.LIFETIME[key] = structuredClone(value);
      }
    }
  };
  try {
    profile.recordRunInLifetime({
      id: 'achievement-weapon-level-validation',
      outcome: 'defeat',
      map: { id: 'scrapyard', number: 1, title: 'Scrapyard' },
      characterId: 'field-engineer',
      durationS: 1,
      kills: 0,
      bossesDefeated: 0,
      level: 1,
      weaponLevels: {
        bolt: config.MAX_WEAPON_LEVEL,
        pulse: 19.5,
        oil: config.MAX_WEAPON_LEVEL,
        unknown: config.MAX_WEAPON_LEVEL,
        tire: Number.POSITIVE_INFINITY,
      },
      weaponDamage: {
        bolt: 12.75,
        pulse: 0,
        oil: 500,
        unknown: 500,
        tire: Number.POSITIVE_INFINITY,
        acid: -1,
      },
      coreLevels: {},
      modCounts: {},
    });
    assert.equal(profile.LIFETIME.weaponMaxLevel.bolt, config.MAX_WEAPON_LEVEL);
    assert.equal(profile.LIFETIME.weaponMaxLevel.pulse, undefined);
    assert.equal(profile.LIFETIME.weaponMaxLevel.oil, undefined);
    assert.equal(profile.LIFETIME.weaponMaxLevel.unknown, undefined);
    assert.equal(profile.LIFETIME.weaponMaxLevel.tire, undefined);
    assert.equal(profile.LIFETIME.damageByWeapon.bolt, 12.75);
    assert.equal(profile.LIFETIME.damageByWeapon.pulse, undefined);
    assert.equal(profile.LIFETIME.damageByWeapon.oil, undefined);
    assert.equal(profile.LIFETIME.damageByWeapon.unknown, undefined);
    assert.equal(profile.LIFETIME.damageByWeapon.tire, undefined);
    assert.equal(profile.LIFETIME.damageByWeapon.acid, undefined);
  } finally {
    restoreLifetime();
  }
});

test('PROFILE load sanitizes and re-saves weapon progress against the playable registry', () => {
  const savedLifetime = structuredClone(profile.LIFETIME);
  const savedProfile = structuredClone(config.PROFILE);
  const originalStorage = window.localStorage;
  const restoreObject = (target, saved) => {
    for (const key of Object.keys(target)) if (!(key in saved)) delete target[key];
    for (const [key, value] of Object.entries(saved)) {
      if (Array.isArray(target[key]) && Array.isArray(value)) {
        target[key].splice(0, target[key].length, ...structuredClone(value));
      } else {
        target[key] = structuredClone(value);
      }
    }
  };
  let persisted = null;
  const raw = JSON.stringify({
    version: 5,
    lifetime: {
      runsFinished: 1,
      weaponMaxLevel: {
        bolt: config.MAX_WEAPON_LEVEL,
        pulse: 7,
        oil: config.MAX_WEAPON_LEVEL,
        unknown: config.MAX_WEAPON_LEVEL,
        acid: 4.5,
        turbine: '20',
        ricochet: null,
        press: 0,
        tire: -1,
        welder: '__NONFINITE__',
      },
      damageByWeapon: {
        bolt: 12.75,
        pulse: config.CONTRACTS.ladders.masteryDamage,
        oil: config.CONTRACTS.ladders.masteryDamage,
        unknown: config.CONTRACTS.ladders.masteryDamage,
        acid: '50000',
        turbine: null,
        ricochet: 0,
        press: -1,
        tire: '__NONFINITE_DAMAGE__',
      },
    },
  })
    .replace('"__NONFINITE__"', '1e309')
    .replace('"__NONFINITE_DAMAGE__"', '1e309');
  try {
    window.localStorage = {
      getItem: () => raw,
      setItem: (_key, value) => { persisted = value; },
      removeItem: () => {},
    };
    profile.loadProfile();
    assert.deepEqual(profile.LIFETIME.weaponMaxLevel, {
      bolt: config.MAX_WEAPON_LEVEL,
      pulse: 7,
    });
    assert.deepEqual(profile.LIFETIME.damageByWeapon, {
      bolt: 12.75,
      pulse: config.CONTRACTS.ladders.masteryDamage,
      ricochet: 0,
    });
    assert.ok(persisted, 'a contaminated durable ledger must be rewritten after sanitization');
    assert.deepEqual(JSON.parse(persisted).lifetime.weaponMaxLevel, {
      bolt: config.MAX_WEAPON_LEVEL,
      pulse: 7,
    });
    assert.deepEqual(JSON.parse(persisted).lifetime.damageByWeapon, {
      bolt: 12.75,
      pulse: config.CONTRACTS.ladders.masteryDamage,
      ricochet: 0,
    });
  } finally {
    restoreObject(profile.LIFETIME, savedLifetime);
    restoreObject(config.PROFILE, savedProfile);
    window.localStorage = originalStorage;
  }
});

test('PROFILE migration backfills and persists build telemetry from bounded valid run history', () => {
  const savedLifetime = structuredClone(profile.LIFETIME);
  const savedProfile = structuredClone(config.PROFILE);
  const originalStorage = window.localStorage;
  const restoreObject = (target, saved) => {
    for (const key of Object.keys(target)) if (!(key in saved)) delete target[key];
    for (const [key, value] of Object.entries(saved)) {
      if (Array.isArray(target[key]) && Array.isArray(value)) {
        target[key].splice(0, target[key].length, ...structuredClone(value));
      } else {
        target[key] = structuredClone(value);
      }
    }
  };
  const historyRecord = (id, coreLevels, modCounts = {}) => ({
    schemaVersion: 1,
    id,
    endedAt: '2026-08-25T00:00:00.000Z',
    buildVersion: '0.30.4',
    outcome: 'defeat',
    map: { id: 'scrapyard', number: 1, title: 'Scrapyard' },
    durationS: 1,
    level: 1,
    kills: 0,
    bossesDefeated: 0,
    totalDamage: 0,
    weaponLevels: { bolt: 1 },
    weaponDamage: {},
    coreLevels,
    modCounts,
  });
  const stored = {
    'voltswarm:profile': JSON.stringify({
      version: 5,
      lifetime: {
        runsFinished: 2,
        totalSectorsCleared: 0,
        completedCharacterIds: [],
      },
    }),
    'voltswarm:run-history:v1': JSON.stringify([
      historyRecord('core-backfill-valid', {
        damage: 1,
        'attack-speed': 2,
        'move-speed': 1,
        'max-hp': 1,
        unknown: 1,
        armor: 0,
      }, {
        repair: 4,
        haste: 1,
        'scrap-cache': 2,
        frenzy: 1,
        'stun-bumper': 3,
        'kick-plate': 1,
        'loose-bolts': 2,
        'detonator-rig': 1,
        'barrier-cell': 3,
        unknown: 1,
        'coolant-burst': 1.5,
      }),
      historyRecord('core-backfill-impossible', {
        damage: 1,
        'attack-speed': 1,
        'move-speed': 1,
        'max-hp': 1,
        armor: 1,
      }),
    ]),
  };
  let persisted = null;
  try {
    window.localStorage = {
      getItem: (key) => stored[key] ?? null,
      setItem: (key, value) => {
        stored[key] = value;
        if (key === 'voltswarm:profile') persisted = value;
      },
      removeItem: (key) => { delete stored[key]; },
    };
    profile.loadProfile();
    assert.equal(profile.LIFETIME.bestDistinctCoresHeld, config.PROFILE_CAPACITY.coreSockets);
    assert.equal(
      profile.LIFETIME.bestDistinctPermanentModsHeld,
      config.ACHIEVEMENTS.fiveModRig.minimumDistinctMods,
    );
    assert.equal(
      ACHIEVEMENT_REGISTRY.find((entry) => entry.id === 'ach_five_mod_rig')
        .isComplete(profile.LIFETIME),
      true,
    );
    assert.ok(persisted, 'new monotonic telemetry must be persisted after bounded backfill');
    assert.equal(
      JSON.parse(persisted).lifetime.bestDistinctCoresHeld,
      config.PROFILE_CAPACITY.coreSockets,
    );
    assert.equal(
      JSON.parse(persisted).lifetime.bestDistinctPermanentModsHeld,
      config.ACHIEVEMENTS.fiveModRig.minimumDistinctMods,
    );
  } finally {
    restoreObject(profile.LIFETIME, savedLifetime);
    restoreObject(config.PROFILE, savedProfile);
    window.localStorage = originalStorage;
  }
});

test('PROFILE ignores interim mixed-Mod telemetry and preserves valid permanent-only maxima', () => {
  const savedLifetime = structuredClone(profile.LIFETIME);
  const savedProfile = structuredClone(config.PROFILE);
  const originalStorage = window.localStorage;
  const restoreObject = (target, saved) => {
    for (const key of Object.keys(target)) if (!(key in saved)) delete target[key];
    for (const [key, value] of Object.entries(saved)) {
      if (Array.isArray(target[key]) && Array.isArray(value)) {
        target[key].splice(0, target[key].length, ...structuredClone(value));
      } else {
        target[key] = structuredClone(value);
      }
    }
  };
  const history = JSON.stringify([{
    schemaVersion: 1,
    id: 'interim-mod-telemetry-history',
    endedAt: '2026-08-25T00:00:00.000Z',
    buildVersion: '0.30.4',
    outcome: 'defeat',
    map: { id: 'scrapyard', number: 1, title: 'Scrapyard' },
    durationS: 1,
    level: 1,
    kills: 0,
    bossesDefeated: 0,
    totalDamage: 0,
    weaponLevels: { bolt: 1 },
    weaponDamage: {},
    coreLevels: {},
    modCounts: {
      repair: 1,
      haste: 1,
      'scrap-cache': 1,
      frenzy: 1,
      'stun-bumper': 1,
    },
  }]);
  const load = (lifetimeSave) => {
    let persisted = null;
    const stored = {
      'voltswarm:profile': JSON.stringify({ version: 5, lifetime: lifetimeSave }),
      'voltswarm:run-history:v1': history,
    };
    window.localStorage = {
      getItem: (key) => stored[key] ?? null,
      setItem: (key, value) => {
        stored[key] = value;
        if (key === 'voltswarm:profile') persisted = value;
      },
      removeItem: (key) => { delete stored[key]; },
    };
    profile.loadProfile();
    return JSON.parse(persisted);
  };
  try {
    const recovered = load({
      runsFinished: 1,
      totalSectorsCleared: 0,
      completedCharacterIds: [],
      bestDistinctCoresHeld: 0,
      bestDistinctModsHeld: 5,
    });
    assert.equal(profile.LIFETIME.bestDistinctPermanentModsHeld, 1);
    assert.equal(recovered.lifetime.bestDistinctPermanentModsHeld, 1);
    assert.equal('bestDistinctModsHeld' in recovered.lifetime, false);
    const customRig = ACHIEVEMENT_REGISTRY.find((entry) => entry.id === 'ach_five_mod_rig');
    assert.equal(customRig.isComplete(profile.LIFETIME), false);

    const preserved = load({
      runsFinished: 1,
      totalSectorsCleared: 0,
      completedCharacterIds: [],
      bestDistinctCoresHeld: 0,
      bestDistinctModsHeld: 5,
      bestDistinctPermanentModsHeld: 6,
    });
    assert.equal(profile.LIFETIME.bestDistinctPermanentModsHeld, 6);
    assert.equal(preserved.lifetime.bestDistinctPermanentModsHeld, 6);
    assert.equal('bestDistinctModsHeld' in preserved.lifetime, false);
  } finally {
    restoreObject(profile.LIFETIME, savedLifetime);
    restoreObject(config.PROFILE, savedProfile);
    window.localStorage = originalStorage;
  }
});

test('PROFILE ignores legacy mixed Purist telemetry and backfills only strict surviving evidence', () => {
  const savedLifetime = structuredClone(profile.LIFETIME);
  const savedProfile = structuredClone(config.PROFILE);
  const originalStorage = window.localStorage;
  const restoreObject = (target, saved) => {
    for (const key of Object.keys(target)) if (!(key in saved)) delete target[key];
    for (const [key, value] of Object.entries(saved)) {
      if (Array.isArray(target[key]) && Array.isArray(value)) {
        target[key].splice(0, target[key].length, ...structuredClone(value));
      } else {
        target[key] = structuredClone(value);
      }
    }
  };
  const historyRecord = (id, weaponLevels, modCounts) => ({
    schemaVersion: 1,
    id,
    endedAt: '2026-08-25T00:00:00.000Z',
    buildVersion: '0.30.4',
    outcome: 'run-complete',
    map: { id: 'swarm-foundry', number: 2, title: 'Swarm Foundry' },
    sectorsCleared: config.MAPS.length,
    mapsReached: config.MAPS.length,
    durationS: 1_200,
    level: 1,
    kills: 0,
    bossesDefeated: 0,
    totalDamage: 0,
    weaponLevels,
    weaponDamage: {},
    coreLevels: {},
    modCounts,
  });
  const load = (lifetimeSave, history) => {
    let persisted = null;
    const stored = {
      'voltswarm:profile': JSON.stringify({ version: 5, lifetime: lifetimeSave }),
      'voltswarm:run-history:v1': JSON.stringify(history),
    };
    window.localStorage = {
      getItem: (key) => stored[key] ?? null,
      setItem: (key, value) => {
        stored[key] = value;
        if (key === 'voltswarm:profile') persisted = value;
      },
      removeItem: (key) => { delete stored[key]; },
    };
    profile.loadProfile();
    return JSON.parse(persisted);
  };
  try {
    const contaminated = load({
      runsFinished: 1,
      totalSectorsCleared: config.MAPS.length,
      bestMinimalSectors: config.CONTRACTS.puristSectors,
    }, [historyRecord('legacy-purist-contaminated', { bolt: 1 }, { 'stun-bumper': 1 })]);
    assert.equal(profile.LIFETIME.bestPuristSectors, 0);
    assert.equal(contaminated.lifetime.bestPuristSectors, 0);
    assert.equal('bestMinimalSectors' in contaminated.lifetime, false);

    const recovered = load({
      runsFinished: 1,
      totalSectorsCleared: config.MAPS.length,
      bestMinimalSectors: config.CONTRACTS.puristSectors,
    }, [historyRecord('legacy-purist-valid', { bolt: 1, oil: 0 }, {
      repair: 1,
      haste: 1,
      'scrap-cache': 1,
      frenzy: 1,
    })]);
    assert.equal(profile.LIFETIME.bestPuristSectors, config.CONTRACTS.puristSectors);
    assert.equal(recovered.lifetime.bestPuristSectors, config.CONTRACTS.puristSectors);

    const preserved = load({
      runsFinished: 1,
      totalSectorsCleared: config.MAPS.length,
      bestMinimalSectors: config.CONTRACTS.puristSectors,
      bestPuristSectors: config.CONTRACTS.puristSectors,
    }, [historyRecord('new-purist-weaker-history', { bolt: 1, pulse: 1 }, {})]);
    assert.equal(profile.LIFETIME.bestPuristSectors, config.CONTRACTS.puristSectors);
    assert.equal(preserved.lifetime.bestPuristSectors, config.CONTRACTS.puristSectors);
    assert.equal('bestMinimalSectors' in preserved.lifetime, false);
  } finally {
    restoreObject(profile.LIFETIME, savedLifetime);
    restoreObject(config.PROFILE, savedProfile);
    window.localStorage = originalStorage;
  }
});

test('PROFILE backfills missing flawless telemetry only from terminal records with known zero damage', () => {
  const savedLifetime = structuredClone(profile.LIFETIME);
  const savedProfile = structuredClone(config.PROFILE);
  const originalStorage = window.localStorage;
  const restoreObject = (target, saved) => {
    for (const key of Object.keys(target)) if (!(key in saved)) delete target[key];
    for (const [key, value] of Object.entries(saved)) {
      if (Array.isArray(target[key]) && Array.isArray(value)) {
        target[key].splice(0, target[key].length, ...structuredClone(value));
      } else {
        target[key] = structuredClone(value);
      }
    }
  };
  const historyRecord = (id, { durationS, damageTaken }) => ({
    schemaVersion: 1,
    id,
    endedAt: '2026-08-25T00:00:00.000Z',
    buildVersion: '0.30.4',
    outcome: 'sector-cleared',
    map: { id: 'scrapyard', number: 1, title: 'Scrapyard' },
    durationS,
    level: 1,
    kills: 0,
    bossesDefeated: 0,
    totalDamage: 0,
    weaponLevels: { bolt: 1 },
    weaponDamage: {},
    coreLevels: {},
    modCounts: {},
    ...(damageTaken !== undefined ? { damageTaken } : {}),
  });
  const load = (lifetimeSave, history) => {
    let persisted = null;
    const stored = {
      'voltswarm:profile': JSON.stringify({ version: 5, lifetime: lifetimeSave }),
      'voltswarm:run-history:v1': JSON.stringify(history),
    };
    window.localStorage = {
      getItem: (key) => stored[key] ?? null,
      setItem: (key, value) => {
        stored[key] = value;
        if (key === 'voltswarm:profile') persisted = value;
      },
      removeItem: (key) => { delete stored[key]; },
    };
    profile.loadProfile();
    return JSON.parse(persisted);
  };
  try {
    const recovered = load({
      runsFinished: 3,
      totalSectorsCleared: 1,
      bestPuristSectors: 0,
    }, [
      historyRecord('flawless-legacy-unknown', { durationS: 600, damageTaken: undefined }),
      historyRecord('flawless-damaged', { durationS: 500, damageTaken: 1 }),
      historyRecord('flawless-valid', { durationS: 300.125, damageTaken: 0 }),
    ]);
    assert.equal(profile.LIFETIME.bestFlawlessRunS, 300.125);
    assert.equal(recovered.lifetime.bestFlawlessRunS, 300.125);
    assert.equal(
      ACHIEVEMENT_REGISTRY.find((entry) => entry.id === 'ach_untouchable')
        .isComplete(profile.LIFETIME),
      true,
    );

    const preserved = load({
      runsFinished: 3,
      totalSectorsCleared: 1,
      bestPuristSectors: 0,
      bestFlawlessRunS: 450.5,
    }, [historyRecord('flawless-weaker-history', { durationS: 100, damageTaken: 0 })]);
    assert.equal(profile.LIFETIME.bestFlawlessRunS, 450.5);
    assert.equal(preserved.lifetime.bestFlawlessRunS, 450.5);

    const malformedRaw = JSON.stringify({
      version: 5,
      lifetime: {
        runsFinished: 1,
        totalSectorsCleared: 0,
        bestPuristSectors: 0,
        bestFlawlessRunS: '__NONFINITE__',
      },
    }).replace('"__NONFINITE__"', '1e309');
    let malformedPersisted = null;
    window.localStorage = {
      getItem: (key) => key === 'voltswarm:profile'
        ? malformedRaw
        : key === 'voltswarm:run-history:v1'
          ? JSON.stringify([historyRecord('flawless-short-history', { durationS: 299.5, damageTaken: 0 })])
          : null,
      setItem: (key, value) => {
        if (key === 'voltswarm:profile') malformedPersisted = value;
      },
      removeItem: () => {},
    };
    profile.loadProfile();
    assert.equal(profile.LIFETIME.bestFlawlessRunS, 299.5);
    assert.equal(JSON.parse(malformedPersisted).lifetime.bestFlawlessRunS, 299.5);
  } finally {
    restoreObject(profile.LIFETIME, savedLifetime);
    restoreObject(config.PROFILE, savedProfile);
    window.localStorage = originalStorage;
  }
});

test('PROFILE backfills missing or malformed best-kill telemetry from strict terminal history', () => {
  const savedLifetime = structuredClone(profile.LIFETIME);
  const savedProfile = structuredClone(config.PROFILE);
  const originalStorage = window.localStorage;
  const restoreObject = (target, saved) => {
    for (const key of Object.keys(target)) if (!(key in saved)) delete target[key];
    for (const [key, value] of Object.entries(saved)) {
      if (Array.isArray(target[key]) && Array.isArray(value)) {
        target[key].splice(0, target[key].length, ...structuredClone(value));
      } else {
        target[key] = structuredClone(value);
      }
    }
  };
  const historyRecord = (id, kills) => ({
    schemaVersion: 1,
    id,
    endedAt: '2026-08-25T00:00:00.000Z',
    buildVersion: '0.30.4',
    outcome: 'sector-cleared',
    map: { id: 'scrapyard', number: 1, title: 'Scrapyard' },
    durationS: 600,
    level: 1,
    kills,
    bossesDefeated: 0,
    totalDamage: 0,
    weaponLevels: { bolt: 1 },
    weaponDamage: {},
    coreLevels: {},
    modCounts: {},
    damageTaken: 1,
  });
  const load = (lifetimeSave, history) => {
    let persisted = null;
    const stored = {
      'voltswarm:profile': JSON.stringify({ version: 5, lifetime: lifetimeSave }),
      'voltswarm:run-history:v1': JSON.stringify(history),
    };
    window.localStorage = {
      getItem: (key) => stored[key] ?? null,
      setItem: (key, value) => {
        stored[key] = value;
        if (key === 'voltswarm:profile') persisted = value;
      },
      removeItem: (key) => { delete stored[key]; },
    };
    profile.loadProfile();
    return JSON.parse(persisted);
  };
  try {
    const recovered = load({
      runsFinished: 3,
      totalSectorsCleared: 1,
      bestPuristSectors: 0,
      bestFlawlessRunS: 0,
    }, [
      historyRecord('overkill-history-fractional', 1_000.5),
      historyRecord('overkill-history-negative', -5),
      historyRecord('overkill-history-valid', config.CONTRACTS.overkillKillsInRun),
    ]);
    assert.equal(profile.LIFETIME.bestKillsInRun, config.CONTRACTS.overkillKillsInRun);
    assert.equal(recovered.lifetime.bestKillsInRun, config.CONTRACTS.overkillKillsInRun);
    assert.equal(
      ACHIEVEMENT_REGISTRY.find((entry) => entry.id === 'ach_overkill')
        .isComplete(profile.LIFETIME),
      true,
    );

    const preserved = load({
      runsFinished: 3,
      totalSectorsCleared: 1,
      bestPuristSectors: 0,
      bestFlawlessRunS: 0,
      bestKillsInRun: 900,
    }, [historyRecord('overkill-weaker-history', 100)]);
    assert.equal(profile.LIFETIME.bestKillsInRun, 900);
    assert.equal(preserved.lifetime.bestKillsInRun, 900);

    for (const malformed of [799.5, -1, '__NONFINITE__']) {
      const raw = JSON.stringify({
        version: 5,
        lifetime: {
          runsFinished: 1,
          totalSectorsCleared: 0,
          bestPuristSectors: 0,
          bestFlawlessRunS: 0,
          bestKillsInRun: malformed,
        },
      }).replace('"__NONFINITE__"', '1e309');
      let persisted = null;
      window.localStorage = {
        getItem: (key) => key === 'voltswarm:profile'
          ? raw
          : key === 'voltswarm:run-history:v1'
            ? JSON.stringify([historyRecord('overkill-valid-recovery', 799)])
            : null,
        setItem: (key, value) => {
          if (key === 'voltswarm:profile') persisted = value;
        },
        removeItem: () => {},
      };
      profile.loadProfile();
      assert.equal(profile.LIFETIME.bestKillsInRun, 799);
      assert.equal(JSON.parse(persisted).lifetime.bestKillsInRun, 799);
    }
  } finally {
    restoreObject(profile.LIFETIME, savedLifetime);
    restoreObject(config.PROFILE, savedProfile);
    window.localStorage = originalStorage;
  }
});

test('PROFILE normalization rejects malformed or impossible Core telemetry', () => {
  const savedLifetime = structuredClone(profile.LIFETIME);
  const savedProfile = structuredClone(config.PROFILE);
  const originalStorage = window.localStorage;
  const restoreObject = (target, saved) => {
    for (const key of Object.keys(target)) if (!(key in saved)) delete target[key];
    for (const [key, value] of Object.entries(saved)) {
      if (Array.isArray(target[key]) && Array.isArray(value)) {
        target[key].splice(0, target[key].length, ...structuredClone(value));
      } else {
        target[key] = structuredClone(value);
      }
    }
  };
  try {
    for (const malformed of ['4', 3.5, 5, -1, null, '__NONFINITE__']) {
      let persisted = null;
      const raw = JSON.stringify({
        version: 5,
        lifetime: {
          runsFinished: 1,
          totalSectorsCleared: 0,
          completedCharacterIds: [],
          bestDistinctCoresHeld: malformed,
        },
      }).replace('"__NONFINITE__"', '1e309');
      window.localStorage = {
        getItem: (key) => key === 'voltswarm:profile' ? raw : null,
        setItem: (key, value) => {
          if (key === 'voltswarm:profile') persisted = value;
        },
        removeItem: () => {},
      };
      profile.loadProfile();
      assert.equal(profile.LIFETIME.bestDistinctCoresHeld, 0);
      assert.equal(JSON.parse(persisted).lifetime.bestDistinctCoresHeld, 0);
    }
  } finally {
    restoreObject(profile.LIFETIME, savedLifetime);
    restoreObject(config.PROFILE, savedProfile);
    window.localStorage = originalStorage;
  }
});

test('PROFILE normalization rejects malformed or impossible Mod telemetry', () => {
  const savedLifetime = structuredClone(profile.LIFETIME);
  const savedProfile = structuredClone(config.PROFILE);
  const originalStorage = window.localStorage;
  const restoreObject = (target, saved) => {
    for (const key of Object.keys(target)) if (!(key in saved)) delete target[key];
    for (const [key, value] of Object.entries(saved)) {
      if (Array.isArray(target[key]) && Array.isArray(value)) {
        target[key].splice(0, target[key].length, ...structuredClone(value));
      } else {
        target[key] = structuredClone(value);
      }
    }
  };
  try {
    for (const malformed of [
      '5',
      4.5,
      mods.PERMANENT_MOD_IDS.length + 1,
      mods.MOD_IDS.length,
      -1,
      null,
      '__NONFINITE__',
    ]) {
      let persisted = null;
      const raw = JSON.stringify({
        version: 5,
        lifetime: {
          runsFinished: 1,
          totalSectorsCleared: 0,
          completedCharacterIds: [],
          bestDistinctCoresHeld: 0,
          bestDistinctPermanentModsHeld: malformed,
        },
      }).replace('"__NONFINITE__"', '1e309');
      window.localStorage = {
        getItem: (key) => key === 'voltswarm:profile' ? raw : null,
        setItem: (key, value) => {
          if (key === 'voltswarm:profile') persisted = value;
        },
        removeItem: () => {},
      };
      profile.loadProfile();
      assert.equal(profile.LIFETIME.bestDistinctPermanentModsHeld, 0);
      assert.equal(JSON.parse(persisted).lifetime.bestDistinctPermanentModsHeld, 0);
    }
  } finally {
    restoreObject(profile.LIFETIME, savedLifetime);
    restoreObject(config.PROFILE, savedProfile);
    window.localStorage = originalStorage;
  }
});

test('PROFILE normalization rejects over-cap persistence instead of fabricating full capacity', () => {
  const savedLifetime = structuredClone(profile.LIFETIME);
  const savedProfile = structuredClone(config.PROFILE);
  const originalStorage = window.localStorage;
  const restoreObject = (target, saved) => {
    for (const key of Object.keys(target)) if (!(key in saved)) delete target[key];
    for (const [key, value] of Object.entries(saved)) {
      if (Array.isArray(target[key]) && Array.isArray(value)) {
        target[key].splice(0, target[key].length, ...structuredClone(value));
      } else {
        target[key] = structuredClone(value);
      }
    }
  };
  try {
    window.localStorage = {
      getItem: () => JSON.stringify({
        version: 5,
        weaponSockets: 99,
        coreSockets: 99,
        levelupDiscards: 99,
        lifetime: {},
      }),
      setItem: () => {},
      removeItem: () => {},
    };
    profile.loadProfile();
    assert.deepEqual({
      weaponSockets: config.PROFILE.weaponSockets,
      coreSockets: config.PROFILE.coreSockets,
      levelupDiscards: config.PROFILE.levelupDiscards,
    }, achievementProfile());
    const fullCapacity = ACHIEVEMENT_REGISTRY.find((entry) => entry.id === 'ach_full_capacity');
    assert.equal(fullCapacity.isComplete(lifetime(), config.PROFILE), false);
  } finally {
    restoreObject(profile.LIFETIME, savedLifetime);
    restoreObject(config.PROFILE, savedProfile);
    window.localStorage = originalStorage;
  }
});

test('PROFILE normalization recovers paid discard capacity from the completed Contract ID', () => {
  const savedLifetime = structuredClone(profile.LIFETIME);
  const savedProfile = structuredClone(config.PROFILE);
  const originalStorage = window.localStorage;
  const restoreObject = (target, saved) => {
    for (const key of Object.keys(target)) if (!(key in saved)) delete target[key];
    for (const [key, value] of Object.entries(saved)) {
      if (Array.isArray(target[key]) && Array.isArray(value)) {
        target[key].splice(0, target[key].length, ...structuredClone(value));
      } else {
        target[key] = structuredClone(value);
      }
    }
  };
  try {
    for (const damagedValue of [99, 3.5, 'invalid', null]) {
      window.localStorage = {
        getItem: () => JSON.stringify({
          version: 5,
          weaponSockets: 2,
          coreSockets: 2,
          levelupDiscards: damagedValue,
          lifetime: { completedContracts: ['untouchable'] },
        }),
        setItem: () => {},
        removeItem: () => {},
      };
      profile.loadProfile();
      assert.equal(config.PROFILE.levelupDiscards, config.PROFILE.maxLevelupDiscards);
    }
  } finally {
    restoreObject(profile.LIFETIME, savedLifetime);
    restoreObject(config.PROFILE, savedProfile);
    window.localStorage = originalStorage;
  }
});

test('Contract unlock waits for the settlement write and proceeds after durable success', () => {
  const savedLifetime = structuredClone(profile.LIFETIME);
  const savedProfile = structuredClone(config.PROFILE);
  const originalStorage = window.localStorage;
  const restoreObject = (target, saved) => {
    for (const key of Object.keys(target)) if (!(key in saved)) delete target[key];
    for (const [key, value] of Object.entries(saved)) {
      if (Array.isArray(target[key]) && Array.isArray(value)) {
        target[key].splice(0, target[key].length, ...structuredClone(value));
      } else {
        target[key] = structuredClone(value);
      }
    }
  };
  const prepareFirstBlood = () => {
    restoreObject(profile.LIFETIME, savedLifetime);
    restoreObject(config.PROFILE, savedProfile);
    profile.LIFETIME.completedContracts.splice(0);
    profile.LIFETIME.grantedRewards = {};
    profile.LIFETIME.bossesDefeated = 1;
    config.PROFILE.unlockedWeapons.splice(
      0,
      config.PROFILE.unlockedWeapons.length,
      ...config.PROFILE.unlockedWeapons.filter((id) => id !== 'ricochet'),
    );
  };
  const requested = [];
  const transport = {
    requestUnlock(name) {
      requested.push(name);
      return { ok: true, status: 'queued', name };
    },
  };
  try {
    prepareFirstBlood();
    window.localStorage = {
      getItem: () => null,
      setItem: () => { throw new Error('disk full'); },
      removeItem: () => {},
    };
    const failed = contracts.settleContractsWithPersistence();
    assert.equal(failed.earnedContracts.some(({ contract }) => contract.id === 'first-blood'), true);
    assert.equal(failed.profileSaved, false);
    assert.deepEqual(evaluateAchievementsAfterProfileSave(
      failed.profileSaved,
      lifetime({ completedContracts: ['first-blood'] }),
      transport,
    ), []);

    prepareFirstBlood();
    window.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    const saved = contracts.settleContractsWithPersistence();
    assert.equal(saved.profileSaved, true);
    evaluateAchievementsAfterProfileSave(
      saved.profileSaved,
      lifetime({ completedContracts: ['first-blood'] }),
      transport,
    );
    assert.deepEqual(requested, ['ACH_FIRST_CONTRACT']);

    const gameSource = readFileSync(new URL('../src/game.ts', import.meta.url), 'utf8');
    const mainSource = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
    assert.match(gameSource, /profileSaved\s*&&\s*settlement\.profileSaved/);
    assert.match(mainSource, /if \(startupSettlement\.profileSaved\) evaluateAchievements\(\)/);
  } finally {
    restoreObject(profile.LIFETIME, savedLifetime);
    restoreObject(config.PROFILE, savedProfile);
    window.localStorage = originalStorage;
  }
});

test('lifetime folding does not infer a completed run from final boss, map, or duration alone', () => {
  const savedLifetime = structuredClone(profile.LIFETIME);
  const restoreLifetime = () => {
    for (const key of Object.keys(profile.LIFETIME)) {
      if (!(key in savedLifetime)) delete profile.LIFETIME[key];
    }
    for (const [key, value] of Object.entries(savedLifetime)) {
      if (Array.isArray(profile.LIFETIME[key]) && Array.isArray(value)) {
        profile.LIFETIME[key].splice(0, profile.LIFETIME[key].length, ...structuredClone(value));
      } else {
        profile.LIFETIME[key] = structuredClone(value);
      }
    }
  };
  const run = (id, outcome, sectorsCleared) => ({
    id,
    outcome,
    map: { id: 'swarm-foundry', number: 2, title: 'Swarm Foundry' },
    characterId: 'field-engineer',
    sectorsCleared,
    mapsReached: 2,
    durationS: 99_999,
    kills: 1,
    bossesDefeated: 1,
    bossTypesDefeated: ['Hazard Marshal'],
    level: 1,
    weaponLevels: { bolt: 1 },
    weaponDamage: {},
    coreLevels: {},
    modCounts: {},
  });
  try {
    const before = profile.LIFETIME.runsCompleted;
    profile.recordRunInLifetime(run('achievement-final-boss-only', 'sector-cleared', 1));
    assert.equal(profile.LIFETIME.runsCompleted, before);
    profile.recordRunInLifetime(run('achievement-full-arc', 'run-complete', 2));
    assert.equal(profile.LIFETIME.runsCompleted, before + 1);
  } finally {
    restoreLifetime();
  }
});

test('completed character folding requires a structurally complete run and a registered ID', () => {
  const savedLifetime = structuredClone(profile.LIFETIME);
  const restoreLifetime = () => {
    for (const key of Object.keys(profile.LIFETIME)) {
      if (!(key in savedLifetime)) delete profile.LIFETIME[key];
    }
    for (const [key, value] of Object.entries(savedLifetime)) {
      if (Array.isArray(profile.LIFETIME[key]) && Array.isArray(value)) {
        profile.LIFETIME[key].splice(0, profile.LIFETIME[key].length, ...structuredClone(value));
      } else {
        profile.LIFETIME[key] = structuredClone(value);
      }
    }
  };
  const run = (id, outcome, characterId) => ({
    id,
    outcome,
    map: { id: 'swarm-foundry', number: 2, title: 'Swarm Foundry' },
    characterId,
    sectorsCleared: outcome === 'run-complete' ? 2 : 1,
    mapsReached: 2,
    durationS: 1_200,
    kills: 1,
    bossesDefeated: 1,
    bossTypesDefeated: ['Hazard Marshal'],
    level: 1,
    weaponLevels: { bolt: 1 },
    weaponDamage: {},
    coreLevels: {},
    modCounts: {},
  });
  try {
    profile.recordRunInLifetime(run('achievement-field-partial', 'sector-cleared', 'field-engineer'));
    assert.deepEqual(profile.LIFETIME.completedCharacterIds, savedLifetime.completedCharacterIds);
    profile.recordRunInLifetime(run('achievement-field-complete', 'run-complete', 'field-engineer'));
    assert.equal(profile.LIFETIME.completedCharacterIds.includes('field-engineer'), true);
    profile.recordRunInLifetime(run('achievement-rack-partial', 'sector-cleared', 'rack-hauler'));
    assert.equal(profile.LIFETIME.completedCharacterIds.includes('rack-hauler'), false);
    profile.recordRunInLifetime(run('achievement-rack-complete', 'run-complete', 'rack-hauler'));
    assert.equal(profile.LIFETIME.completedCharacterIds.includes('rack-hauler'), true);
    profile.recordRunInLifetime(run('achievement-overclocker-partial', 'sector-cleared', 'overclocker'));
    assert.equal(profile.LIFETIME.completedCharacterIds.includes('overclocker'), false);
    profile.recordRunInLifetime(run('achievement-overclocker-complete', 'run-complete', 'overclocker'));
    assert.equal(profile.LIFETIME.completedCharacterIds.includes('overclocker'), true);
    profile.recordRunInLifetime(run('achievement-unknown-complete', 'run-complete', 'Field Engineer'));
    assert.equal(profile.LIFETIME.completedCharacterIds.includes('Field Engineer'), false);
  } finally {
    restoreLifetime();
  }
});

test('startup evaluation requests eligible achievements retroactively', () => {
  const requested = [];
  const transport = {
    requestUnlock(name) {
      requested.push(name);
      return { ok: true, status: 'queued', name };
    },
  };
  assert.deepEqual(evaluateAchievements(lifetime({ runsFinished: 7 }), transport), [
    { ok: true, status: 'queued', name: 'ACH_FIRST_SHIFT' },
  ]);
  assert.deepEqual(requested, ['ACH_FIRST_SHIFT']);
});

test('startup evaluation awards a previously persisted paid chest retroactively', () => {
  const requested = [];
  const transport = {
    requestUnlock(name) {
      requested.push(name);
      return { ok: true, status: 'queued', name };
    },
  };
  evaluateAchievements(lifetime({ chestsByTier: { silver: 1 } }), transport);
  assert.deepEqual(requested, ['ACH_CACHE_OPENED']);
});

test('startup evaluation awards a previously persisted best level retroactively', () => {
  const requested = [];
  const transport = {
    requestUnlock(name) {
      requested.push(name);
      return { ok: true, status: 'queued', name };
    },
  };
  evaluateAchievements(lifetime({ bestLevel: 10 }), transport);
  assert.deepEqual(requested, ['ACH_SYSTEMS_ONLINE']);
});

test('startup evaluation awards a previously persisted boss defeat retroactively', () => {
  const requested = [];
  const transport = {
    requestUnlock(name) {
      requested.push(name);
      return { ok: true, status: 'queued', name };
    },
  };
  evaluateAchievements(lifetime({ bossesDefeated: 1 }), transport);
  assert.deepEqual(requested, ['ACH_FIRST_BOSS_DOWN']);
});

test('startup evaluation awards a previously persisted foundry arrival retroactively', () => {
  const requested = [];
  const transport = {
    requestUnlock(name) {
      requested.push(name);
      return { ok: true, status: 'queued', name };
    },
  };
  evaluateAchievements(lifetime({ maxMapsReached: 2 }), transport);
  assert.deepEqual(requested, ['ACH_FOUNDRY_BOUND']);
});

test('startup evaluation awards persisted scrapyard boss mastery retroactively', () => {
  const requested = [];
  const transport = {
    requestUnlock(name) {
      requested.push(name);
      return { ok: true, status: 'queued', name };
    },
  };
  evaluateAchievements(lifetime({
    bossTypesDefeated: ['Tesla Titan', 'Crusher King'],
  }), transport);
  assert.deepEqual(requested, ['ACH_SCRAPYARD_COMMAND']);
});

test('startup evaluation awards a persisted Hazard Marshal defeat retroactively', () => {
  const requested = [];
  const transport = {
    requestUnlock(name) {
      requested.push(name);
      return { ok: true, status: 'queued', name };
    },
  };
  evaluateAchievements(lifetime({ bossTypesDefeated: ['Hazard Marshal'] }), transport);
  assert.deepEqual(requested, ['ACH_HAZARD_CONTAINED']);
});

test('startup evaluation awards a structurally completed run retroactively', () => {
  const requested = [];
  const transport = {
    requestUnlock(name) {
      requested.push(name);
      return { ok: true, status: 'queued', name };
    },
  };
  evaluateAchievements(lifetime({ runsCompleted: 1 }), transport);
  assert.deepEqual(requested, ['ACH_FULL_CIRCUIT']);
});

test('startup evaluation awards a persisted Field Engineer clear retroactively', () => {
  const requested = [];
  const transport = {
    requestUnlock(name) {
      requested.push(name);
      return { ok: true, status: 'queued', name };
    },
  };
  evaluateAchievements(lifetime({ completedCharacterIds: ['field-engineer'] }), transport);
  assert.deepEqual(requested, ['ACH_FIELD_ENGINEER_CLEAR']);
});

test('startup evaluation awards a persisted Rack Hauler clear retroactively', () => {
  const requested = [];
  const transport = {
    requestUnlock(name) {
      requested.push(name);
      return { ok: true, status: 'queued', name };
    },
  };
  evaluateAchievements(lifetime({ completedCharacterIds: ['rack-hauler'] }), transport);
  assert.deepEqual(requested, ['ACH_RACK_HAULER_CLEAR']);
});

test('startup evaluation awards a persisted Overclocker clear retroactively', () => {
  const requested = [];
  const transport = {
    requestUnlock(name) {
      requested.push(name);
      return { ok: true, status: 'queued', name };
    },
  };
  evaluateAchievements(lifetime({ completedCharacterIds: ['overclocker'] }), transport);
  assert.deepEqual(requested, ['ACH_OVERCLOCKER_CLEAR']);
});

test('startup evaluation awards a persisted settled Contract retroactively', () => {
  const requested = [];
  const transport = {
    requestUnlock(name) {
      requested.push(name);
      return { ok: true, status: 'queued', name };
    },
  };
  evaluateAchievements(lifetime({ completedContracts: ['first-blood'] }), transport);
  assert.deepEqual(requested, ['ACH_FIRST_CONTRACT']);
});

test('startup evaluation awards durably loaded maximum PROFILE capacity retroactively', () => {
  const requested = [];
  const transport = {
    requestUnlock(name) {
      requested.push(name);
      return { ok: true, status: 'queued', name };
    },
  };
  evaluateAchievements(lifetime(), transport, achievementProfile({
    weaponSockets: 3,
    coreSockets: 4,
    levelupDiscards: 4,
  }));
  assert.deepEqual(requested, ['ACH_FULL_CAPACITY']);
});

test('startup evaluation awards a persisted playable weapon ceiling retroactively', () => {
  const requested = [];
  const transport = {
    requestUnlock(name) {
      requested.push(name);
      return { ok: true, status: 'queued', name };
    },
  };
  evaluateAchievements(lifetime({ weaponMaxLevel: { bolt: config.MAX_WEAPON_LEVEL } }), transport);
  assert.deepEqual(requested, ['ACH_WEAPON_LEVEL_20']);
});

test('startup evaluation awards persisted playable weapon mastery retroactively', () => {
  const requested = [];
  const transport = {
    requestUnlock(name) {
      requested.push(name);
      return { ok: true, status: 'queued', name };
    },
  };
  evaluateAchievements(lifetime({
    damageByWeapon: { bolt: config.CONTRACTS.ladders.masteryDamage },
  }), transport);
  assert.deepEqual(requested, ['ACH_WEAPON_MASTERY']);
});

test('startup evaluation awards a persisted four-Core run retroactively', () => {
  const requested = [];
  const transport = {
    requestUnlock(name) {
      requested.push(name);
      return { ok: true, status: 'queued', name };
    },
  };
  evaluateAchievements(lifetime({
    bestDistinctCoresHeld: config.PROFILE_CAPACITY.coreSockets,
  }), transport);
  assert.deepEqual(requested, ['ACH_FOUR_CORE_ARRAY']);
});

test('startup evaluation awards a persisted five-Mod run retroactively', () => {
  const requested = [];
  const transport = {
    requestUnlock(name) {
      requested.push(name);
      return { ok: true, status: 'queued', name };
    },
  };
  evaluateAchievements(lifetime({
    bestDistinctPermanentModsHeld: config.ACHIEVEMENTS.fiveModRig.minimumDistinctMods,
  }), transport);
  assert.deepEqual(requested, ['ACH_FIVE_MOD_RIG']);
});

test('startup evaluation awards a persisted strict Purist clear retroactively', () => {
  const requested = [];
  const transport = {
    requestUnlock(name) {
      requested.push(name);
      return { ok: true, status: 'queued', name };
    },
  };
  evaluateAchievements(lifetime({
    bestPuristSectors: config.CONTRACTS.puristSectors,
  }), transport);
  assert.deepEqual(requested, ['ACH_PURIST']);
});

test('startup evaluation awards persisted flawless survival retroactively', () => {
  const requested = [];
  const transport = {
    requestUnlock(name) {
      requested.push(name);
      return { ok: true, status: 'queued', name };
    },
  };
  evaluateAchievements(lifetime({
    bestFlawlessRunS: config.CONTRACTS.flawlessSeconds,
  }), transport);
  assert.deepEqual(requested, ['ACH_UNTOUCHABLE']);
});

test('startup evaluation awards a persisted Overkill run retroactively', () => {
  const requested = [];
  const transport = {
    requestUnlock(name) {
      requested.push(name);
      return { ok: true, status: 'queued', name };
    },
  };
  evaluateAchievements(lifetime({
    bestKillsInRun: config.CONTRACTS.overkillKillsInRun,
  }), transport);
  assert.deepEqual(requested, ['ACH_OVERKILL']);
});

test('all implemented achievements coexist in one evaluation', () => {
  const requested = [];
  const transport = {
    requestUnlock(name) {
      requested.push(name);
      return { ok: true, status: 'queued', name };
    },
  };
  evaluateAchievements(lifetime({
    runsFinished: 1,
    chestsByTier: { bronze: 1 },
    bestLevel: 10,
    bossesDefeated: 1,
    maxMapsReached: 2,
    bossTypesDefeated: ['Crusher King', 'Tesla Titan', 'Hazard Marshal'],
    runsCompleted: 1,
    completedCharacterIds: ['field-engineer', 'rack-hauler', 'overclocker'],
    completedContracts: ['first-blood'],
    weaponMaxLevel: { bolt: config.MAX_WEAPON_LEVEL },
    damageByWeapon: { bolt: config.CONTRACTS.ladders.masteryDamage },
    bestDistinctCoresHeld: config.PROFILE_CAPACITY.coreSockets,
    bestDistinctPermanentModsHeld: config.ACHIEVEMENTS.fiveModRig.minimumDistinctMods,
    bestPuristSectors: config.CONTRACTS.puristSectors,
    bestFlawlessRunS: config.CONTRACTS.flawlessSeconds,
    bestKillsInRun: config.CONTRACTS.overkillKillsInRun,
  }), transport, achievementProfile({
    weaponSockets: 3,
    coreSockets: 4,
    levelupDiscards: 4,
  }));
  assert.deepEqual(requested, [
    'ACH_FIRST_SHIFT',
    'ACH_CACHE_OPENED',
    'ACH_SYSTEMS_ONLINE',
    'ACH_FIRST_BOSS_DOWN',
    'ACH_FOUNDRY_BOUND',
    'ACH_SCRAPYARD_COMMAND',
    'ACH_HAZARD_CONTAINED',
    'ACH_FULL_CIRCUIT',
    'ACH_FIELD_ENGINEER_CLEAR',
    'ACH_RACK_HAULER_CLEAR',
    'ACH_OVERCLOCKER_CLEAR',
    'ACH_FIRST_CONTRACT',
    'ACH_FULL_CAPACITY',
    'ACH_WEAPON_LEVEL_20',
    'ACH_WEAPON_MASTERY',
    'ACH_FOUR_CORE_ARRAY',
    'ACH_FIVE_MOD_RIG',
    'ACH_PURIST',
    'ACH_UNTOUCHABLE',
    'ACH_OVERKILL',
  ]);
});

test('ineligible and browser-only sessions do not request an unlock', () => {
  const transport = { requestUnlock: () => { throw new Error('must not request'); } };
  assert.deepEqual(evaluateAchievements(lifetime(), transport), []);
  assert.deepEqual(evaluateAchievements(lifetime({ runsFinished: 1 }), undefined), []);
});

test('a failed post-run profile write cannot request eligible achievements', () => {
  let requests = 0;
  const transport = {
    requestUnlock(name) {
      requests += 1;
      return { ok: true, status: 'queued', name };
    },
  };
  assert.deepEqual(evaluateAchievementsAfterProfileSave(
    false,
    lifetime({
      runsFinished: 1,
      chestsByTier: { bronze: 1 },
      bestLevel: 10,
      bossesDefeated: 1,
      maxMapsReached: 2,
      bossTypesDefeated: ['Crusher King', 'Tesla Titan', 'Hazard Marshal'],
      runsCompleted: 1,
      completedCharacterIds: ['field-engineer', 'rack-hauler', 'overclocker'],
      completedContracts: ['first-blood'],
      weaponMaxLevel: { bolt: config.MAX_WEAPON_LEVEL },
      damageByWeapon: { bolt: config.CONTRACTS.ladders.masteryDamage },
      bestDistinctCoresHeld: config.PROFILE_CAPACITY.coreSockets,
      bestDistinctPermanentModsHeld: config.ACHIEVEMENTS.fiveModRig.minimumDistinctMods,
      bestPuristSectors: config.CONTRACTS.puristSectors,
      bestFlawlessRunS: config.CONTRACTS.flawlessSeconds,
      bestKillsInRun: config.CONTRACTS.overkillKillsInRun,
    }),
    transport,
    achievementProfile({
      weaponSockets: 3,
      coreSockets: 4,
      levelupDiscards: 4,
    }),
  ), []);
  assert.equal(requests, 0);
});

test('browser profile persistence reports storage success and failure truthfully', () => {
  const originalStorage = window.localStorage;
  window.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  assert.equal(profile.saveProfile(), true);
  window.localStorage = {
    getItem: () => null,
    setItem: () => { throw new Error('quota exceeded'); },
    removeItem: () => {},
  };
  assert.equal(profile.saveProfile(), false);
  window.localStorage = originalStorage;
});

test.after(() => server.close());
