import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import asar from '@electron/asar';
import { inspectAsar } from './check-asar-payload.mjs';

async function createArchive(t, files) {
  const fixture = await mkdtemp(join(tmpdir(), 'voltswarm-asar-'));
  const source = join(fixture, 'source');
  const archive = join(fixture, 'app.asar');
  t.after(() => rm(fixture, { force: true, recursive: true }));

  for (const [path, content] of Object.entries(files)) {
    const target = join(source, ...path.split('/'));
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, content);
  }
  await asar.createPackage(source, archive);
  return archive;
}

const rulePaths = (problems, rule) =>
  problems.find((problem) => problem.rule === rule)?.files.map((file) => file.path) ?? [];

test('Steamworks runtime payload is allowed only at the four packaged paths', async (t) => {
  const requiredPaths = [
    'node_modules/steamworks.js/package.json',
    'node_modules/steamworks.js/index.js',
    'node_modules/steamworks.js/dist/win64/steam_api64.dll',
    'node_modules/steamworks.js/dist/win64/steamworksjs.win32-x64-msvc.node',
  ];
  const archive = await createArchive(t, Object.fromEntries([
    ['dist/runtime.js', 'void 0;'],
    ...requiredPaths.map((path) => [path, 'fixture']),
  ]));

  const { problems } = inspectAsar(archive);
  assert.deepEqual(rulePaths(problems, 'node_modules'), []);
  assert.deepEqual(rulePaths(problems, 'unexpected-root'), []);
});

test('Steamworks payload allowlist rejects every extra package path', async (t) => {
  const forbiddenPaths = [
    'node_modules/steamworks.js/README.md',
    'node_modules/steamworks.js/dist/win64/steam_api64.lib',
    'node_modules/steamworks.js/dist/linux64/libsteam_api.so',
    'node_modules/steamworks.js/dist/osx/libsteam_api.dylib',
    'node_modules/three/package.json',
  ];
  const archive = await createArchive(t, Object.fromEntries([
    ['dist/runtime.js', 'void 0;'],
    ...forbiddenPaths.map((path) => [path, 'fixture']),
  ]));

  const { problems } = inspectAsar(archive);
  assert.deepEqual(rulePaths(problems, 'node_modules').sort(), forbiddenPaths.toSorted());
  assert.deepEqual(rulePaths(problems, 'unexpected-root').sort(), forbiddenPaths.toSorted());
});

test('Demo payload guard rejects Map 2 Hazard Marshal reference sheets', async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), 'voltswarm-asar-'));
  const source = join(fixture, 'source');
  const archive = join(fixture, 'app.asar');
  t.after(() => rm(fixture, { force: true, recursive: true }));

  const assetDirectory = join(source, 'dist', 'assets', '2d');
  await mkdir(assetDirectory, { recursive: true });
  await writeFile(join(source, 'dist', 'runtime.js'), 'void 0;');
  await writeFile(join(assetDirectory, 'ref-hazard-marshal-front-v1.png'), 'fixture');
  await asar.createPackage(source, archive);

  const { problems } = inspectAsar(archive);
  const boundaryLeak = problems.find((problem) => problem.rule === 'demo-content-boundary');
  assert.deepEqual(boundaryLeak?.files.map((file) => file.path), [
    'dist/assets/2d/ref-hazard-marshal-front-v1.png',
  ]);
});
