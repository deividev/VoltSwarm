const assert = require('node:assert/strict');
const test = require('node:test');
const { formatDisplayVersion } = require('./version-format.cjs');

test('human versions keep the number first and normalize known labels', () => {
  assert.equal(formatDisplayVersion('0.10.2-beta'), '0.10.2 Beta');
  assert.equal(formatDisplayVersion('0.10.2-alpha.3'), '0.10.2 Alpha');
  assert.equal(formatDisplayVersion('0.10.2-preview'), '0.10.2 Preview');
  assert.equal(formatDisplayVersion('0.10.2-playtest'), '0.10.2 Playtest');
  assert.equal(formatDisplayVersion('0.10.2-rc.1'), '0.10.2 rc.1');
  assert.equal(formatDisplayVersion('0.10.2'), '0.10.2');
});
