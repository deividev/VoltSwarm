const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { AchievementOutbox, resolveSteamAppId } = require('../electron/dist/achievement-store.js');

const API_NAME = 'ACH_FIRST_SHIFT';
const CACHE_API_NAME = 'ACH_CACHE_OPENED';
const SYSTEMS_API_NAME = 'ACH_SYSTEMS_ONLINE';
const FIRST_BOSS_API_NAME = 'ACH_FIRST_BOSS_DOWN';
const FOUNDRY_API_NAME = 'ACH_FOUNDRY_BOUND';
const SCRAPYARD_API_NAME = 'ACH_SCRAPYARD_COMMAND';
const HAZARD_API_NAME = 'ACH_HAZARD_CONTAINED';
const FULL_CIRCUIT_API_NAME = 'ACH_FULL_CIRCUIT';
const FIELD_ENGINEER_API_NAME = 'ACH_FIELD_ENGINEER_CLEAR';
const RACK_HAULER_API_NAME = 'ACH_RACK_HAULER_CLEAR';
const OVERCLOCKER_API_NAME = 'ACH_OVERCLOCKER_CLEAR';
const FIRST_CONTRACT_API_NAME = 'ACH_FIRST_CONTRACT';
const FULL_CAPACITY_API_NAME = 'ACH_FULL_CAPACITY';
const WEAPON_LEVEL_API_NAME = 'ACH_WEAPON_LEVEL_20';
const WEAPON_MASTERY_API_NAME = 'ACH_WEAPON_MASTERY';

function fixture(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'voltswarm-achievements-'));
  try { return run(path.join(directory, 'achievement-sync.json')); }
  finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

function steam({ active = false, activateResult = true, activateError = null } = {}) {
  let activated = active;
  let activateCalls = 0;
  return {
    client: {
      achievement: {
        isActivated: () => activated,
        activate: () => {
          activateCalls += 1;
          if (activateError) throw activateError;
          if (activateResult) activated = true;
          return activateResult;
        },
      },
    },
    activateCalls: () => activateCalls,
  };
}

test('offline requests persist once and survive restart', () => fixture((file) => {
  const first = new AchievementOutbox(file);
  assert.equal(first.requestAndFlush(API_NAME, null).status, 'queued');
  assert.equal(first.requestAndFlush(API_NAME, null).status, 'queued');
  assert.deepEqual(first.snapshot().pending, [API_NAME]);

  const restarted = new AchievementOutbox(file);
  assert.deepEqual(restarted.snapshot().pending, [API_NAME]);
  const sdk = steam();
  assert.equal(restarted.flush(sdk.client)[0].status, 'unlocked');
  assert.equal(sdk.activateCalls(), 1);
  assert.deepEqual(restarted.snapshot(), { version: 1, pending: [], unlocked: [API_NAME] });
}));

test('a locally completed achievement never activates again', () => fixture((file) => {
  const outbox = new AchievementOutbox(file);
  const sdk = steam();
  assert.equal(outbox.requestAndFlush(API_NAME, sdk.client).status, 'unlocked');
  assert.equal(outbox.requestAndFlush(API_NAME, sdk.client).status, 'already-unlocked');
  assert.equal(sdk.activateCalls(), 1);
}));

test('crash window repairs from Steam without activating twice', () => {
  let saved = null;
  let writes = 0;
  const write = (_file, raw) => {
    writes += 1;
    if (writes === 2) throw new Error('simulated crash before local completion');
    saved = raw;
  };
  const first = new AchievementOutbox('memory', () => saved, write);
  const sdk = steam();
  assert.equal(first.requestAndFlush(API_NAME, sdk.client).status, 'queued');
  assert.equal(sdk.activateCalls(), 1);

  const restarted = new AchievementOutbox('memory', () => saved, (_file, raw) => { saved = raw; });
  assert.equal(restarted.flush(sdk.client)[0].status, 'unlocked');
  assert.equal(sdk.activateCalls(), 1, 'isActivated must repair without another activate');
});

test('unknown API names are rejected before persistence or Steam', () => {
  let writes = 0;
  const sdk = steam();
  const outbox = new AchievementOutbox('memory', () => null, () => { writes += 1; });
  assert.equal(outbox.requestAndFlush('ACH_NOT_REGISTERED', sdk.client).status, 'rejected');
  assert.equal(writes, 0);
  assert.equal(sdk.activateCalls(), 0);
});

test('registered achievement API names are accepted by the shared allowlist', () => fixture((file) => {
  const outbox = new AchievementOutbox(file);
  assert.equal(outbox.requestAndFlush(CACHE_API_NAME, null).status, 'queued');
  assert.equal(outbox.requestAndFlush(SYSTEMS_API_NAME, null).status, 'queued');
  assert.equal(outbox.requestAndFlush(FIRST_BOSS_API_NAME, null).status, 'queued');
  assert.equal(outbox.requestAndFlush(FOUNDRY_API_NAME, null).status, 'queued');
  assert.equal(outbox.requestAndFlush(SCRAPYARD_API_NAME, null).status, 'queued');
  assert.equal(outbox.requestAndFlush(HAZARD_API_NAME, null).status, 'queued');
  assert.equal(outbox.requestAndFlush(FULL_CIRCUIT_API_NAME, null).status, 'queued');
  assert.equal(outbox.requestAndFlush(FIELD_ENGINEER_API_NAME, null).status, 'queued');
  assert.equal(outbox.requestAndFlush(RACK_HAULER_API_NAME, null).status, 'queued');
  assert.equal(outbox.requestAndFlush(OVERCLOCKER_API_NAME, null).status, 'queued');
  assert.equal(outbox.requestAndFlush(FIRST_CONTRACT_API_NAME, null).status, 'queued');
  assert.equal(outbox.requestAndFlush(FULL_CAPACITY_API_NAME, null).status, 'queued');
  assert.equal(outbox.requestAndFlush(WEAPON_LEVEL_API_NAME, null).status, 'queued');
  assert.equal(outbox.requestAndFlush(WEAPON_MASTERY_API_NAME, null).status, 'queued');
  assert.deepEqual(outbox.snapshot().pending, [
    CACHE_API_NAME,
    SYSTEMS_API_NAME,
    FIRST_BOSS_API_NAME,
    FOUNDRY_API_NAME,
    SCRAPYARD_API_NAME,
    HAZARD_API_NAME,
    FULL_CIRCUIT_API_NAME,
    FIELD_ENGINEER_API_NAME,
    RACK_HAULER_API_NAME,
    OVERCLOCKER_API_NAME,
    FIRST_CONTRACT_API_NAME,
    FULL_CAPACITY_API_NAME,
    WEAPON_LEVEL_API_NAME,
    WEAPON_MASTERY_API_NAME,
  ]);
}));

test('failed initial persistence prevents Steam activation', () => {
  const sdk = steam();
  const outbox = new AchievementOutbox('memory', () => null, () => { throw new Error('disk full'); });
  assert.equal(outbox.requestAndFlush(API_NAME, sdk.client).status, 'failed');
  assert.equal(sdk.activateCalls(), 0);
});

test('failed Steam activation stays queued for a later retry', () => fixture((file) => {
  const outbox = new AchievementOutbox(file);
  const unavailable = steam({ activateResult: false });
  assert.equal(outbox.requestAndFlush(API_NAME, unavailable.client).status, 'queued');
  assert.deepEqual(outbox.snapshot().pending, [API_NAME]);

  const recovered = steam();
  assert.equal(outbox.flush(recovered.client)[0].status, 'unlocked');
  assert.equal(recovered.activateCalls(), 1);
}));

test('App ID policy is fixed for packages and explicit in development', () => {
  assert.equal(resolveSteamAppId(true, undefined), 4979220);
  assert.equal(resolveSteamAppId(true, '480'), 4979220);
  assert.equal(resolveSteamAppId(false, undefined), null);
  assert.equal(resolveSteamAppId(false, 'not-a-number'), null);
  assert.equal(resolveSteamAppId(false, '480'), 480);
});
