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
  }), transport);
  assert.deepEqual(requested, [
    'ACH_FIRST_SHIFT',
    'ACH_CACHE_OPENED',
    'ACH_SYSTEMS_ONLINE',
    'ACH_FIRST_BOSS_DOWN',
    'ACH_FOUNDRY_BOUND',
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
