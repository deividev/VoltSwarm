import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { validatePack } from './audio/rebuild-runtime-pack.mjs';

const root = resolve(import.meta.dirname, '..');
const canonical = JSON.parse(readFileSync(resolve(root, 'tools/audio/runtime-pack.json'), 'utf8'));
const clone = () => structuredClone(canonical);

test('canonical runtime pack passes strict source and runtime validation', () => {
  assert.deepEqual(validatePack(clone()), []);
});

test('validator rejects hash drift, wrong declared format, and missing provenance', () => {
  const badHash = clone();
  badHash.events['ui-back'][0].source.sha256 = '0'.repeat(64);
  assert.ok(validatePack(badHash).some((failure) => failure.includes('source master hash mismatch')));

  const wrongFormat = clone();
  wrongFormat.events['ui-back'][0].runtime.format = 'mp3';
  assert.ok(validatePack(wrongFormat).some((failure) => failure.includes('extension does not match declared mp3')));

  const noProvenance = clone();
  delete noProvenance.events['ui-back'][0].source.provenance;
  assert.ok(validatePack(noProvenance).some((failure) => failure.includes('invalid source provenance')));

  const badMagicRoot = mkdtempSync(resolve(tmpdir(), 'voltswarm-audio-magic-'));
  try {
    writeFileSync(resolve(badMagicRoot, 'ui-back-v1.wav'), Buffer.from('this is not PCM audio'));
    assert.ok(validatePack(clone(), { sourceVaultRoot: badMagicRoot }).some((failure) => failure.includes('invalid PCM WAV structure')));
  } finally {
    rmSync(badMagicRoot, { recursive: true, force: true });
  }
});

test('validator rejects missing enabled coverage, missing source, and runtime orphans', () => {
  const missingEvent = clone();
  delete missingEvent.events['ui-back'];
  assert.ok(validatePack(missingEvent).some((failure) => failure.includes('enabled event has no asset: ui-back')));

  const missingSource = clone();
  missingSource.events['ui-back'][0].runtime.path = 'assets/audio/sfx/not-a-master.wav';
  assert.ok(validatePack(missingSource).some((failure) => failure.includes('canonical source master missing')));

  const temporary = mkdtempSync(resolve(tmpdir(), 'voltswarm-audio-pack-'));
  try {
    cpSync(resolve(root, 'public/assets/audio/sfx'), temporary, { recursive: true });
    writeFileSync(resolve(temporary, 'orphan.wav'), Buffer.from('RIFF orphan'));
    assert.ok(validatePack(clone(), { output: temporary }).some((failure) => failure.includes('orphan runtime file: orphan.wav')));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
