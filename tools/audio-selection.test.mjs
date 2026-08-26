import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const { audioBusGains, selectAudioVariantIndex } = await server.ssrLoadModule('/src/audio.ts');
const { AUDIO } = await server.ssrLoadModule('/src/config.ts');
const manifest = JSON.parse(await readFile(
  new URL('../public/assets/audio/sfx/manifest.json', import.meta.url),
  'utf8',
));
// The RUNTIME manifest above is a build artefact: `prebuild` regenerates it from
// the source below on every build. Anything hand-written into the runtime copy
// survives exactly until the next `pnpm build`, which is how five boss cues
// shipped enabled, emitted, and completely silent (2026-08-19).
const sourceManifest = JSON.parse(await readFile(
  new URL('./audio/runtime-pack.json', import.meta.url),
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
  assert.equal(entries[index].runtime.path, 'assets/audio/sfx/modern-chest-reveal.wav');
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

test('menu music obeys Music Volume without changing the shared bus gain', () => {
  const full = audioBusGains({ masterVolume: 0.8, musicVolume: 1, sfxVolume: 1 }, false, true);
  const run = audioBusGains({ masterVolume: 0.8, musicVolume: 1, sfxVolume: 1 }, false, false);
  const muted = audioBusGains({ masterVolume: 0.8, musicVolume: 0, sfxVolume: 1 }, false, true);

  assert.equal(full.music, 1);
  assert.equal(full.music, run.music, 'menu state raised/lowered the shared music bus');
  assert.equal(AUDIO.music.menuLoopVolume, 0.675);
  assert.equal(muted.music, 0);
  assert.equal(full.sfx, AUDIO.mix.sfxBusGain);
});

test('every enabled audio event has an asset in the SOURCE manifest', () => {
  // An id in enabledEvents with no manifest entry is guaranteed silence: emit()
  // stamps it as accepted, resolvePath finds nothing, and no voice is ever
  // created — so every symptom says "the sound played" except the speakers.
  const missing = AUDIO.validation.enabledEvents.filter(
    (id) => !Array.isArray(sourceManifest.events?.[id]) || sourceManifest.events[id].length === 0,
  );
  assert.deepEqual(missing, [], `enabled but with no asset entry: ${missing.join(', ')}`);
});

test('the runtime manifest is not ahead of the source it is generated from', () => {
  // Catches the inverse mistake: entries added to the build artefact only. They
  // work until the next build and then vanish without a word.
  const orphans = Object.keys(manifest.events ?? {}).filter((id) => !sourceManifest.events?.[id]);
  assert.deepEqual(orphans, [], `only in the generated manifest: ${orphans.join(', ')}`);
});

test('a one-shot never evicts a sustained loop', async () => {
  // Weapon hums start on an EDGE (weapons.ts starts them when the weapon
  // activates, not per frame), so a loop stolen by the voice cap is gone until
  // that weapon fully stops and restarts — silence with no visible cause.
  const source = await readFile(new URL('../src/audio.ts', import.meta.url), 'utf8');
  assert.match(source, /const victim = existing[\s\S]{0,40}\.filter\(\(v\) => !v\.loop\)/);
});

test('Game lifecycle overlaps menu into run but ends run music before menu reset', async () => {
  const source = await readFile(new URL('../src/game.ts', import.meta.url), 'utf8');
  assert.match(source, /this\.audio\.setMenu\(false\);\s*this\.audio\.setPaused\(false\);\s*this\.audio\.emit\(\{ id: 'run-start' \}\);\s*this\.audio\.transitionMusic\('foundation-music'/);
  assert.match(source, /private endRun[\s\S]*?this\.audio\.stopMusic\(\);[\s\S]*?this\.hud\.showEnd/);
  assert.match(source, /private quitToMenu[\s\S]*?this\.audio\.reset\(\);[\s\S]*?this\.audio\.setMenu\(true\);[\s\S]*?this\.audio\.transitionMusic\('menu-music'/);
});
