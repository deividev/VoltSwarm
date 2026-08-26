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

test('packaging keeps the native Steam runtime and excludes type-only dependencies', () => {
  assert.ok(pkg.dependencies['steamworks.js'], 'Steamworks must remain a production dependency');
  assert.ok(
    pkg.build.asarUnpack.includes('node_modules/steamworks.js/dist/win64/*.node'),
    'the native Steamworks addon must remain unpacked for Electron to load it',
  );
  assert.ok(
    pkg.build.asarUnpack.includes('node_modules/steamworks.js/dist/win64/*.dll'),
    'the Steamworks runtime DLL must remain unpacked beside the native addon',
  );
  assert.ok(
    pkg.build.files.includes('!node_modules/undici-types/**'),
    'undici-types is pulled through steamworks.js type declarations and must not ship at runtime',
  );
});
