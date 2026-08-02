const assert = require('node:assert/strict');
const test = require('node:test');
const pkg = require('../package.json');
const {
  FULL_GAME_STEAM_APP_ID,
  FULL_GAME_STEAM_URL,
  isCanonicalFullGameSteamTarget,
  validateDemoBuildMetadata,
  windowsFileVersionForDemo,
} = require('./build-metadata.cjs');

function packageAtVersion(version) {
  return {
    ...pkg,
    version,
    build: { ...pkg.build, buildVersion: windowsFileVersionForDemo(version) },
  };
}

test('package embeds the complete Map 1 demo contract', () => {
  assert.deepEqual(validateDemoBuildMetadata(pkg), []);
  assert.equal(pkg.voltswarmBuild.flavor, 'demo');
  assert.deepEqual(pkg.voltswarmBuild.allowedMaps, ['scrapyard']);
});

test('demo build contract accepts canonical SemVer demo versions', () => {
  for (const version of ['0.11.1-demo', '0.12.0-demo', '1.0.0-demo']) {
    assert.deepEqual(validateDemoBuildMetadata(packageAtVersion(version)), [], version);
  }
});

test('demo build contract derives a numeric Windows FileVersion from raw SemVer', () => {
  assert.equal(windowsFileVersionForDemo('0.11.1-demo'), '0.11.1.0');
  assert.equal(windowsFileVersionForDemo('12.34.56-demo'), '12.34.56.0');
  assert.equal(windowsFileVersionForDemo('0.11.1-demo.1'), null);
});

test('demo build contract rejects missing, non-numeric, or drifting Windows FileVersion', () => {
  for (const buildVersion of [undefined, '0.11.1-demo', '0.11.0.0', '0.11.1']) {
    const candidate = { ...pkg, build: { ...pkg.build, buildVersion } };
    assert.notDeepEqual(validateDemoBuildMetadata(candidate), [], String(buildVersion));
  }
});

test('demo build contract rejects non-demo and malformed versions', () => {
  for (const version of [
    '0.11.0-beta.1',
    '0.11.0-playtest.1',
    '0.11.0-release',
    '0.11.0',
    '0.11.0-demo.1',
    '0.11.0-demo.01',
    '0.11.0-demo+build.1',
    '01.11.0-demo',
    '0.01.0-demo',
    '0.11.00-demo',
    'v0.11.0-demo',
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
