const assert = require('node:assert/strict');
const test = require('node:test');
const pkg = require('../package.json');
const {
  FULL_GAME_STEAM_APP_ID,
  FULL_GAME_STEAM_URL,
  isCanonicalFullGameSteamTarget,
  validateDemoBuildMetadata,
} = require('./build-metadata.cjs');

test('package embeds the complete Map 1 demo contract', () => {
  assert.deepEqual(validateDemoBuildMetadata(pkg), []);
  assert.equal(pkg.voltswarmBuild.flavor, 'demo');
  assert.deepEqual(pkg.voltswarmBuild.allowedMaps, ['scrapyard']);
});

test('demo build contract accepts future SemVer demo iterations', () => {
  for (const version of ['0.11.0-demo.2', '0.11.1-demo.1', '1.0.0-demo.0']) {
    assert.deepEqual(validateDemoBuildMetadata({ ...pkg, version }), [], version);
  }
});

test('demo build contract rejects non-demo and malformed versions', () => {
  for (const version of [
    '0.11.0-beta.1',
    '0.11.0-playtest.1',
    '0.11.0',
    '0.11.0-demo',
    '0.11.0-demo.01',
    'v0.11.0-demo.1',
  ]) {
    assert.notDeepEqual(validateDemoBuildMetadata({ ...pkg, version }), [], version);
  }
});

test('wishlist CTA accepts only the canonical full-game Steam target', () => {
  assert.equal(isCanonicalFullGameSteamTarget(FULL_GAME_STEAM_APP_ID, FULL_GAME_STEAM_URL), true);
  assert.equal(isCanonicalFullGameSteamTarget(FULL_GAME_STEAM_APP_ID, 'http://store.steampowered.com/app/4979220/Voltswarm/'), false);
  assert.equal(isCanonicalFullGameSteamTarget(123, FULL_GAME_STEAM_URL), false);
  assert.equal(isCanonicalFullGameSteamTarget(FULL_GAME_STEAM_APP_ID, `${FULL_GAME_STEAM_URL}?redirect=evil`), false);
  assert.equal(isCanonicalFullGameSteamTarget(FULL_GAME_STEAM_APP_ID, 'https://evil.example/app/4979220/Voltswarm/'), false);
});
