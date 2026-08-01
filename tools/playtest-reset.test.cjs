const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { isPlaytestEligible, TELEMETRY_CONFIG } = require('../electron/dist/telemetry/config.js');
const { hasTelemetryConsent, persistTelemetryConsent } = require('../electron/dist/telemetry/consent.js');
const {
  completePlaytestReset,
  isPlaytestResetRequired,
  preparePlaytestReset,
} = require('../electron/dist/playtest-reset.js');

const BUILD = '0.10.5-beta';
const ACTIVE_CONFIG = {
  ...TELEMETRY_CONFIG,
  enabled: true,
  admittedBuildVersions: ['0.10.3-beta', BUILD],
  waveId: 'test-wave',
  resetEpoch: 'test-epoch',
};
const runtime = (overrides = {}) => ({
  packaged: true, benchmark: false, buildVersion: BUILD, ...overrides,
});

function fixture(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'voltswarm-reset-'));
  try { return run(directory); } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

function writeProgress(directory) {
  fs.writeFileSync(path.join(directory, 'profile.json'), '{"old":true}');
  fs.writeFileSync(path.join(directory, 'run-history.json'), '[{"old":true}]');
}

test('eligibility requires enabled packaged non-benchmark exact build admission', () => {
  assert.equal(TELEMETRY_CONFIG.enabled, true);
  assert.deepEqual(TELEMETRY_CONFIG.admittedBuildVersions, [BUILD]);
  assert.equal(TELEMETRY_CONFIG.gameId, 'voltswarm');
  assert.equal(TELEMETRY_CONFIG.waveId, 'wave-1');
  assert.equal(TELEMETRY_CONFIG.resetEpoch, 'wave-1-rc-2026-08');
  assert.equal(isPlaytestEligible(TELEMETRY_CONFIG, runtime()), true);
  assert.equal(isPlaytestEligible(TELEMETRY_CONFIG, runtime({ packaged: false })), false);
  assert.equal(isPlaytestEligible(TELEMETRY_CONFIG, runtime({ benchmark: true })), false);
  assert.equal(isPlaytestEligible(TELEMETRY_CONFIG, runtime({ buildVersion: `${BUILD}.extra` })), false);
});

test('disabled config performs no reset work even with a corrupt pending marker', () => fixture((directory) => {
  writeProgress(directory);
  fs.writeFileSync(path.join(directory, 'playtest-reset.json'), '{corrupt');
  const disabledConfig = { ...TELEMETRY_CONFIG, enabled: false };
  assert.equal(isPlaytestResetRequired(directory, runtime(), disabledConfig), false);
  assert.equal(preparePlaytestReset(directory, runtime(), disabledConfig), null);
  assert.equal(fs.existsSync(path.join(directory, 'profile.json')), true);
}));

test('first admitted packaged launch clears progress and completes its epoch', () => fixture((directory) => {
  writeProgress(directory);
  assert.equal(isPlaytestResetRequired(directory, runtime(), TELEMETRY_CONFIG), true);
  const epoch = preparePlaytestReset(directory, runtime(), TELEMETRY_CONFIG);
  assert.equal(epoch, 'wave-1-rc-2026-08');
  assert.equal(fs.existsSync(path.join(directory, 'profile.json')), false);
  assert.equal(completePlaytestReset(directory, epoch), true);
  assert.equal(isPlaytestResetRequired(directory, runtime(), TELEMETRY_CONFIG), false);
}));

test('0.10.5 preserves progress after a historical build completed the Wave 1 epoch', () => fixture((directory) => {
  const previous = runtime({ buildVersion: '0.10.3-beta' });
  const historicalConfig = { ...TELEMETRY_CONFIG, admittedBuildVersions: ['0.10.3-beta'] };
  const epoch = preparePlaytestReset(directory, previous, historicalConfig);
  assert.equal(completePlaytestReset(directory, epoch), true);
  writeProgress(directory);
  assert.equal(preparePlaytestReset(directory, runtime(), TELEMETRY_CONFIG), null);
  assert.equal(fs.existsSync(path.join(directory, 'profile.json')), true);
  assert.equal(fs.existsSync(path.join(directory, 'run-history.json')), true);
}));

test('eligible new epoch coalesces an older pending reset', () => fixture((directory) => {
  const oldConfig = { ...ACTIVE_CONFIG, resetEpoch: 'old-epoch' };
  preparePlaytestReset(directory, runtime(), oldConfig);
  writeProgress(directory);
  assert.equal(preparePlaytestReset(directory, runtime(), ACTIVE_CONFIG), 'test-epoch');
  assert.equal(completePlaytestReset(directory, 'test-epoch'), true);
  writeProgress(directory);
  assert.equal(preparePlaytestReset(directory, runtime(), ACTIVE_CONFIG), null);
  assert.equal(fs.existsSync(path.join(directory, 'profile.json')), true);
}));

test('nullable reset leaves progress and even pending marker state untouched', () => fixture((directory) => {
  const noReset = { ...ACTIVE_CONFIG, resetEpoch: null };
  writeProgress(directory);
  fs.writeFileSync(path.join(directory, 'playtest-reset.json'), '{corrupt');
  assert.equal(isPlaytestResetRequired(directory, runtime(), noReset), false);
  assert.equal(preparePlaytestReset(directory, runtime(), noReset), null);
  assert.equal(fs.existsSync(path.join(directory, 'profile.json')), true);
}));

test('eligible corrupt or unreadable reset markers fail closed', () => fixture((directory) => {
  writeProgress(directory);
  const marker = path.join(directory, 'playtest-reset.json');
  fs.writeFileSync(marker, '{bad json');
  assert.throws(() => preparePlaytestReset(directory, runtime(), ACTIVE_CONFIG), /marker is corrupt/);
  fs.rmSync(marker);
  fs.mkdirSync(marker);
  assert.throws(() => preparePlaytestReset(directory, runtime(), ACTIVE_CONFIG), /marker is unreadable/);
  assert.equal(fs.existsSync(path.join(directory, 'profile.json')), true);
}));

test('consent proof prompts once and disclosure-version changes require consent again', () => fixture((directory) => {
  assert.equal(hasTelemetryConsent(directory, ACTIVE_CONFIG), false);
  assert.equal(fs.existsSync(path.join(directory, 'telemetry-consent.json')), false);
  persistTelemetryConsent(directory, ACTIVE_CONFIG, new Date('2026-08-01T12:00:00.000Z'));
  assert.equal(hasTelemetryConsent(directory, ACTIVE_CONFIG), true);
  assert.equal(hasTelemetryConsent(directory, { ...ACTIVE_CONFIG, consentVersion: 2 }), false);
  assert.equal(hasTelemetryConsent(directory, {
    ...ACTIVE_CONFIG,
    disclosure: { ...ACTIVE_CONFIG.disclosure, detail: `${ACTIVE_CONFIG.disclosure.detail} Changed.` },
  }), false);
}));

test('corrupt consent proof fails closed', () => fixture((directory) => {
  fs.writeFileSync(path.join(directory, 'telemetry-consent.json'), '{bad json');
  assert.throws(() => hasTelemetryConsent(directory, ACTIVE_CONFIG), /consent proof is corrupt/);
}));

test('existing telemetry consent does not authorize a pending destructive reset', () => fixture((directory) => {
  persistTelemetryConsent(directory, ACTIVE_CONFIG);
  writeProgress(directory);
  assert.equal(hasTelemetryConsent(directory, ACTIVE_CONFIG), true);
  assert.equal(isPlaytestResetRequired(directory, runtime(), ACTIVE_CONFIG), true);
  assert.equal(fs.existsSync(path.join(directory, 'profile.json')), true);
}));
