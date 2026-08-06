// The profile is written at the end of every run and on every contract
// settlement. These two functions are all that stands between a power cut and a
// wiped profile, so they get tested rather than eyeballed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { readSaveOrQuarantine, writeFileAtomic } = require('../electron/dist/safe-save.js');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'voltswarm-safe-save-'));
}

test('a completed write lands exactly', () => {
  const dir = tempDir();
  const file = path.join(dir, 'profile.json');
  const payload = JSON.stringify({ unlockedWeapons: ['bolt', 'tire'], weaponSockets: 2 });
  writeFileAtomic(file, payload);
  assert.equal(fs.readFileSync(file, 'utf8'), payload);
});

test('overwriting never leaves the target absent or partial', () => {
  const dir = tempDir();
  const file = path.join(dir, 'profile.json');
  const first = JSON.stringify({ version: 1, unlockedCores: ['a'] });
  const second = JSON.stringify({ version: 2, unlockedCores: ['a', 'b', 'c'] });
  writeFileAtomic(file, first);
  writeFileAtomic(file, second);
  assert.equal(fs.readFileSync(file, 'utf8'), second);
  // The temp file must not survive: a stray .tmp beside the save would be
  // mistaken for a backup by anyone poking at userData.
  assert.equal(fs.existsSync(`${file}.tmp`), false);
});

test('the previous save survives when the new payload cannot be written', () => {
  const dir = tempDir();
  const file = path.join(dir, 'profile.json');
  const good = JSON.stringify({ unlockedWeapons: ['bolt'] });
  writeFileAtomic(file, good);
  // Simulate the write failing: a directory where the temp file wants to go.
  fs.mkdirSync(`${file}.tmp`);
  assert.throws(() => writeFileAtomic(file, JSON.stringify({ wiped: true })));
  // THE POINT: the old save is still intact and still parses.
  assert.equal(fs.readFileSync(file, 'utf8'), good);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { unlockedWeapons: ['bolt'] });
});

test('a valid save reads back untouched', () => {
  const dir = tempDir();
  const file = path.join(dir, 'profile.json');
  const payload = JSON.stringify({ totalKills: 4211 });
  fs.writeFileSync(file, payload, 'utf8');
  assert.equal(readSaveOrQuarantine(file), payload);
  assert.equal(fs.existsSync(file), true);
});

test('a missing save is the ordinary first launch, not an error', () => {
  const dir = tempDir();
  assert.equal(readSaveOrQuarantine(path.join(dir, 'nothing-here.json')), null);
});

test('a truncated save is quarantined, not silently overwritten', () => {
  const dir = tempDir();
  const file = path.join(dir, 'profile.json');
  // Exactly what a power cut mid-write used to leave behind.
  const truncated = '{"unlockedWeapons":["bolt","tire"],"weaponSock';
  fs.writeFileSync(file, truncated, 'utf8');

  assert.equal(readSaveOrQuarantine(file), null, 'must not hand back unparseable data');
  assert.equal(fs.existsSync(file), false, 'the corrupt file must be moved aside');

  const quarantined = fs.readdirSync(dir).filter((name) => name.includes('.corrupt-'));
  assert.equal(quarantined.length, 1, 'exactly one quarantine copy');
  // The bytes are preserved: the whole point is that they stay recoverable
  // instead of being destroyed by the next autosave.
  assert.equal(fs.readFileSync(path.join(dir, quarantined[0]), 'utf8'), truncated);
});

test('quarantine leaves the path free for a clean save', () => {
  const dir = tempDir();
  const file = path.join(dir, 'profile.json');
  fs.writeFileSync(file, 'not json at all', 'utf8');
  readSaveOrQuarantine(file);
  const fresh = JSON.stringify({ unlockedWeapons: [] });
  writeFileAtomic(file, fresh);
  assert.equal(readSaveOrQuarantine(file), fresh);
});
