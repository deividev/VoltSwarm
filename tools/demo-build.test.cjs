const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');
const pkg = require('../package.json');
const {
  FULL_GAME_STEAM_APP_ID,
  FULL_GAME_STEAM_URL,
  isCanonicalFullGameSteamTarget,
  validateDemoBuildMetadata,
  validateDemoRuntimeMetadata,
  windowsFileVersionForDemo,
} = require('./build-metadata.cjs');

function packageAtVersion(version) {
  return {
    ...pkg,
    version,
    build: { ...pkg.build, buildVersion: windowsFileVersionForDemo(version) },
  };
}

function loadSettingsModule({
  electronSettings = null,
  localStorageSettings = null,
  // settings.ts derives the resolution list from the real display, so the fake
  // window needs a screen. 1080p keeps 1600x900 a legal choice for the
  // persistence case below.
  screen = { width: 1920, height: 1080 },
  devicePixelRatio = 1,
} = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'settings.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const localStorage = {
    getItem: () => localStorageSettings,
    setItem: () => {},
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    window: {
      electronAPI: electronSettings === null ? undefined : { loadSettings: () => electronSettings },
      localStorage,
      screen,
      devicePixelRatio,
    },
  });
  return module.exports;
}

test('package embeds the complete Map 1 demo contract', () => {
  assert.deepEqual(validateDemoBuildMetadata(pkg), []);
  assert.equal(pkg.voltswarmBuild.flavor, 'demo');
  assert.deepEqual(pkg.voltswarmBuild.allowedMaps, ['scrapyard']);
});

test('packaged metadata preserves the complete runtime identity without electron-builder config', () => {
  const packagedPackage = {
    version: pkg.version,
    voltswarmBuild: pkg.voltswarmBuild,
  };
  assert.deepEqual(validateDemoRuntimeMetadata(packagedPackage), []);
  assert.equal(packagedPackage.voltswarmBuild.appId, 'com.davidseco.voltswarm.demo');
  assert.equal(packagedPackage.voltswarmBuild.productName, 'Voltswarm Demo');
});

test('Electron runtime never reads electron-builder packaging configuration', () => {
  const electronMainSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.ts'), 'utf8');
  assert.doesNotMatch(electronMainSource, /\bpackageJson\.build\b/);
  assert.match(electronMainSource, /BUILD_METADATA\.appId/);
  assert.match(electronMainSource, /BUILD_METADATA\.productName/);
});

test('first launch defaults to fullscreen in native and renderer settings', () => {
  const electronMainSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.ts'), 'utf8');
  const initialWindowSettingsStart = electronMainSource.indexOf('function initialWindowSettings');
  const initialWindowSettingsEnd = electronMainSource.indexOf('/** Applies', initialWindowSettingsStart);
  assert.notEqual(initialWindowSettingsStart, -1);
  assert.notEqual(initialWindowSettingsEnd, -1);
  const initialWindowSettings = electronMainSource.slice(
    initialWindowSettingsStart,
    initialWindowSettingsEnd,
  );
  // No settings file: the fallback opens fullscreen. The size is no longer a
  // literal 1280x720 — it is derived from the display the game was launched on
  // (0.13.7-demo), so the contract asserted here is the fullscreen flag and the
  // absence of a hardcoded size, not the old exact string.
  assert.match(initialWindowSettings, /const fallback = \{\s*fullscreen: true,/);
  assert.match(initialWindowSettings, /catch \{\s*return fallback;\s*}/);
  assert.doesNotMatch(initialWindowSettings, /width: 1280, height: 720/);
  // Only an explicit 'windowed' opts out; a missing or legacy value stays
  // fullscreen. This is stricter than the old `=== 'fullscreen'` test.
  assert.match(initialWindowSettings, /fullscreen: settings\.displayMode !== 'windowed'/);

  const { defaultSettingsForDisplay, loadSettings, resolutionId } = loadSettingsModule();
  const display = { width: 1920, height: 1080, scaleFactor: 1 };
  assert.equal(defaultSettingsForDisplay(display).displayMode, 'fullscreen');
  // The default resolution is the player's own screen, never a fixed 720p.
  assert.equal(defaultSettingsForDisplay(display).resolution, resolutionId(1920, 1080));
  assert.equal(loadSettings().displayMode, 'fullscreen');
  assert.equal(loadSettings().resolution, resolutionId(1920, 1080));
});

test('persisted display modes remain authoritative after startup', () => {
  for (const displayMode of ['windowed', 'fullscreen']) {
    const { loadSettings } = loadSettingsModule({
      electronSettings: JSON.stringify({ displayMode, resolution: '1600x900' }),
    });
    const settings = loadSettings();
    assert.deepEqual(
      { displayMode: settings.displayMode, resolution: settings.resolution },
      { displayMode, resolution: '1600x900' },
    );
  }
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

test('demo build contract rejects packaging identity that drifts from runtime identity', () => {
  for (const build of [
    { ...pkg.build, appId: 'com.example.wrong' },
    { ...pkg.build, productName: 'Wrong Demo' },
  ]) {
    assert.notDeepEqual(validateDemoBuildMetadata({ ...pkg, build }), []);
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
