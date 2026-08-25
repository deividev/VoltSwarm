const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('every supported packaging entry point runs the release flag guard', () => {
  assert.equal(pkg.scripts.prepackage, 'node tools/check-release-flags.mjs');
  assert.match(
    pkg.scripts['package:dir'],
    /^pnpm run check:release-flags && /,
    'unpacked builds are still app.isPackaged and must not bypass release flags',
  );
});
