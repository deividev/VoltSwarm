const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  completePlaytestReset,
  isPlaytestResetRequired,
  preparePlaytestReset,
} = require('../electron/dist/playtest-reset.js');

const BUILD = '0.10.2-beta';

function fixture(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'voltswarm-reset-'));
  try { return run(directory); } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

function writeProgress(directory) {
  fs.writeFileSync(path.join(directory, 'profile.json'), '{"old":true}');
  fs.writeFileSync(path.join(directory, 'run-history.json'), '[{"old":true}]');
}

test('first packaged launch clears file progress and commits the epoch', () => fixture((directory) => {
  writeProgress(directory);
  assert.equal(isPlaytestResetRequired(directory, true, BUILD), true);
  const epoch = preparePlaytestReset(directory, true, BUILD);
  assert.equal(epoch, 'wave-1-rc-2026-08');
  assert.equal(fs.existsSync(path.join(directory, 'profile.json')), false);
  assert.equal(fs.existsSync(path.join(directory, 'run-history.json')), false);
  assert.equal(completePlaytestReset(directory, epoch), true);
  assert.equal(isPlaytestResetRequired(directory, true, BUILD), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'playtest-reset.json'))).status, 'complete');
}));

test('second launch in the same epoch preserves new progress', () => fixture((directory) => {
  const epoch = preparePlaytestReset(directory, true, BUILD);
  assert.equal(completePlaytestReset(directory, epoch), true);
  writeProgress(directory);
  assert.equal(preparePlaytestReset(directory, true, BUILD), null);
  assert.equal(fs.existsSync(path.join(directory, 'profile.json')), true);
  assert.equal(fs.existsSync(path.join(directory, 'run-history.json')), true);
}));

test('unpackaged mode never resets progress', () => fixture((directory) => {
  writeProgress(directory);
  assert.equal(isPlaytestResetRequired(directory, false, BUILD), false);
  assert.equal(isPlaytestResetRequired(directory, true, '1.0.0'), false);
  assert.equal(preparePlaytestReset(directory, false, BUILD), null);
  assert.equal(preparePlaytestReset(directory, true, '1.0.0'), null);
  assert.equal(fs.existsSync(path.join(directory, 'profile.json')), true);
  assert.equal(fs.existsSync(path.join(directory, 'playtest-reset.json')), false);
}));

test('a pending transaction safely retries after an interrupted launch', () => fixture((directory) => {
  assert.ok(preparePlaytestReset(directory, true, BUILD));
  writeProgress(directory);
  assert.ok(preparePlaytestReset(directory, true, BUILD));
  assert.equal(fs.existsSync(path.join(directory, 'profile.json')), false);
  assert.equal(fs.existsSync(path.join(directory, 'run-history.json')), false);
}));

test('a newer packaged build resumes an existing pending epoch', () => fixture((directory) => {
  const epoch = preparePlaytestReset(directory, true, BUILD);
  writeProgress(directory);
  assert.equal(preparePlaytestReset(directory, true, '0.10.3-beta'), epoch);
  assert.equal(fs.existsSync(path.join(directory, 'profile.json')), false);
  assert.equal(fs.existsSync(path.join(directory, 'run-history.json')), false);
}));

test('an allowlisted new epoch coalesces an older pending reset', () => fixture((directory) => {
  preparePlaytestReset(directory, true, BUILD);
  writeProgress(directory);
  const wave2 = { enabled: true, epoch: 'wave-2', buildVersions: ['0.11.0-beta'] };
  assert.equal(preparePlaytestReset(directory, true, '0.11.0-beta', wave2), 'wave-2');
  assert.equal(completePlaytestReset(directory, 'wave-2'), true);
  writeProgress(directory);
  assert.equal(preparePlaytestReset(directory, true, '0.11.0-beta', wave2), null);
  assert.equal(fs.existsSync(path.join(directory, 'profile.json')), true);
}));

test('a corrupt existing marker fails closed without deleting progress', () => fixture((directory) => {
  writeProgress(directory);
  fs.writeFileSync(path.join(directory, 'playtest-reset.json'), '{bad json');
  assert.throws(() => preparePlaytestReset(directory, true, BUILD), /marker is corrupt/);
  assert.equal(fs.existsSync(path.join(directory, 'profile.json')), true);
  assert.equal(fs.existsSync(path.join(directory, 'run-history.json')), true);
}));

test('an unreadable existing marker fails closed', () => fixture((directory) => {
  fs.mkdirSync(path.join(directory, 'playtest-reset.json'));
  assert.throws(() => preparePlaytestReset(directory, true, BUILD), /marker is unreadable/);
}));
