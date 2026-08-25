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
