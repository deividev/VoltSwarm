import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const { audioBusGains, selectAudioVariantIndex } = await server.ssrLoadModule('/src/audio.ts');
const { AUDIO } = await server.ssrLoadModule('/src/config.ts');
const manifest = JSON.parse(await readFile(
  new URL('../public/assets/audio/prototypes/manifest.json', import.meta.url),
  'utf8',
));

test.after(async () => server.close());

test('dev audition pin overrides the configured fixed chest reveal', () => {
  assert.equal(selectAudioVariantIndex(3, 2, 0, 0), 2);
});

test('configured chest reveal stays on modern variant zero', () => {
  const entries = manifest.events['chest-reveal'];
  const index = selectAudioVariantIndex(
    entries.length,
    undefined,
    AUDIO.fixedVariantIndex['chest-reveal'],
    0.99,
  );
  assert.equal(index, 0);
  assert.equal(entries[index].runtime.path, 'assets/audio/prototypes/modern-chest-reveal.wav');
});

test('chest open and events without policy keep random selection', () => {
  const entries = manifest.events['chest-open'];
  assert.equal(AUDIO.fixedVariantIndex['chest-open'], undefined);
  assert.equal(selectAudioVariantIndex(entries.length, undefined, undefined, 0.6), 1);
});

test('variant selection is bounds-safe for malformed pins and empty manifests', () => {
  assert.equal(selectAudioVariantIndex(3, -1, 0, 0), 2);
  assert.equal(selectAudioVariantIndex(3, undefined, 9, 0), 0);
  assert.equal(selectAudioVariantIndex(0, 0, 0, 0), null);
});

test('menu music obeys the Music Volume setting and SFX uses the calibrated bus trim', () => {
  const full = audioBusGains({ masterVolume: 0.8, musicVolume: 1, sfxVolume: 1 }, false, true);
  const muted = audioBusGains({ masterVolume: 0.8, musicVolume: 0, sfxVolume: 1 }, false, true);

  assert.equal(full.music, AUDIO.fades.menuMusicGain);
  assert.equal(muted.music, 0);
  assert.equal(full.sfx, AUDIO.mix.sfxBusGain);
});
