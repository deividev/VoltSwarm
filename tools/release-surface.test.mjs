import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const pkg = JSON.parse(read('package.json'));

test('production Electron has no packaged audio benchmark route', () => {
  const main = read('electron/main.ts');
  assert.doesNotMatch(main, /--audio-benchmark|audioBenchmark|__voltswarmAudioBenchmark/);
});

test('the deterministic audio rig is isolated behind a Vite DEV dynamic import', () => {
  const main = read('src/main.ts');
  const rig = read('src/dev/audio-benchmark.ts');
  assert.match(main, /if \(import\.meta\.env\.DEV\)/);
  assert.match(main, /import\('\.\/dev\/audio-benchmark'\)/);
  assert.match(rig, /__voltswarmAudioBenchmark/);
  assert.match(pkg.scripts['benchmark:audio'], /benchmark-audio-electron\.mjs/);
});

test('packaging validates the built release surface before electron-builder', () => {
  assert.match(pkg.scripts.package, /check:release-bundle && electron-builder$/);
  assert.match(pkg.scripts['package:dir'], /check:release-bundle && electron-builder --dir$/);
});

test('the source document title is Voltswarm', () => {
  const html = read('index.html');
  assert.match(html, /<title>Voltswarm<\/title>/);
  assert.doesNotMatch(html, /<title>\s*Scrap Swarm\s*<\/title>/i);
});
