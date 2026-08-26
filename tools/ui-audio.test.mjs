import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { UI_NAVIGATION_HASH, UI_NAVIGATION_RECIPES, renderUiNavigation } from './audio/ui-navigation.mjs';
import { hash, wav } from './audio/generate.mjs';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const { UI_ACTION_CUES, UiFocusTracker, isMouseHover, uiActionCue } = await server.ssrLoadModule('/src/ui-audio.ts');
const manifest = JSON.parse(await readFile(new URL('./audio/runtime-pack.json', import.meta.url), 'utf8'));
test.after(async () => server.close());

test('semantic UI actions prevent generic confirmation collisions', () => {
  assert.equal(UI_ACTION_CUES['settings-back-button'], 'ui-back');
  assert.equal(UI_ACTION_CUES['resume-button'], 'none');
  assert.equal(UI_ACTION_CUES['quit-run-button'], 'none');
  assert.equal(uiActionCue({ dataset: { uiCue: 'ui-back' } }), 'ui-back');
  assert.equal(uiActionCue({ dataset: { uiCue: 'none' } }), 'none');
  assert.equal(uiActionCue({ dataset: {} }), 'ui-confirm');
});

test('focus routing emits only for an eligible target transition', () => {
  const tracker = new UiFocusTracker();
  assert.equal(tracker.move('initial', true), false);
  assert.equal(tracker.move('initial'), false);
  assert.equal(tracker.move('next'), true);
  assert.equal(tracker.move('next'), false);
  tracker.clear('next');
  assert.equal(tracker.move('next'), true);
});

test('only mouse-capable pointer hover may request ui-focus', () => {
  assert.equal(isMouseHover({ pointerType: 'mouse' }), true);
  assert.equal(isMouseHover({ pointerType: 'touch' }), false);
  assert.equal(isMouseHover({ pointerType: 'pen' }), false);
  assert.equal(isMouseHover({}), false);
});

test('ui-focus is a reproducible four-variant runtime family and ui-back has provenance', () => {
  for (const [eventId, recipe] of Object.entries(UI_NAVIGATION_RECIPES)) {
    const entries = manifest.events[eventId];
    assert.equal(entries.length, recipe.variants);
    entries.forEach((entry, index) => {
      assert.equal(entry.source.provenance.generatorHash, UI_NAVIGATION_HASH);
      assert.equal(entry.source.provenance.variantIndex, index);
      assert.equal(entry.source.sha256, hash(wav(renderUiNavigation(eventId, index))));
    });
  }
});
