import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import asar from '@electron/asar';
import { inspectAsar } from './check-asar-payload.mjs';

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
