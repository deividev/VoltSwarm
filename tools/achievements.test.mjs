import assert from 'node:assert/strict';
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

const lifetime = (overrides = {}) => ({
  runsFinished: 0,
  chestsByTier: {},
  bestLevel: 0,
  bossesDefeated: 0,
  maxMapsReached: 0,
  bossTypesDefeated: [],
  runsCompleted: 0,
  completedCharacterIds: [],
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
    completedCharacterIds: ['field-engineer', 'rack-hauler'],
  }), transport);
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
      completedCharacterIds: ['field-engineer', 'rack-hauler'],
    }),
    transport,
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
