// First launch must fill the player's own screen. These are the pure halves of
// src/settings.ts, so they run without a DOM; detectDisplay() is the only part
// that needs `window` and is deliberately not exercised here.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const settings = await server.ssrLoadModule('/src/settings.ts');

after(async () => {
  await server.close();
});

const display = (width, height, scaleFactor = 1) => ({ width, height, scaleFactor });

const LAPTOP_768 = display(1366, 768);
const FHD = display(1920, 1080);
const QHD = display(2560, 1440);
const ULTRAWIDE = display(3440, 1440);
const SCALED_LAPTOP = display(2560, 1600, 2);

test('first launch is fullscreen at the display native resolution', () => {
  for (const screen of [LAPTOP_768, FHD, QHD, ULTRAWIDE, SCALED_LAPTOP]) {
    const defaults = settings.defaultSettingsForDisplay(screen);
    assert.equal(defaults.displayMode, 'fullscreen');
    assert.equal(defaults.resolution, settings.resolutionId(screen.width, screen.height));
  }
});

test('the native resolution is always offered, standard size or not', () => {
  for (const screen of [LAPTOP_768, ULTRAWIDE, SCALED_LAPTOP]) {
    const nativeId = settings.resolutionId(screen.width, screen.height);
    const options = settings.resolutionsForDisplay(screen);
    const native = options.find((item) => item.id === nativeId);
    assert.ok(native, `no native entry for ${nativeId}`);
    assert.match(native.label, /Native/);
    // Exactly one entry per id: the catalogue must not duplicate the native one.
    assert.equal(options.filter((item) => item.id === nativeId).length, 1);
  }
});

test('a default the picker cannot show would silently fall back, so it never happens', () => {
  // This is the actual bug class: DEFAULT_SETTINGS.resolution used to be
  // '1280x720' while normalizeSettings validated against a fixed list.
  for (const screen of [LAPTOP_768, FHD, QHD, ULTRAWIDE, SCALED_LAPTOP]) {
    const defaults = settings.defaultSettingsForDisplay(screen);
    const options = settings.resolutionsForDisplay(screen);
    assert.ok(options.some((item) => item.id === defaults.resolution));
    assert.equal(settings.normalizeSettings(defaults, screen).resolution, defaults.resolution);
  }
});

test('options never exceed the screen', () => {
  for (const screen of [LAPTOP_768, FHD, QHD, ULTRAWIDE, SCALED_LAPTOP]) {
    for (const option of settings.resolutionsForDisplay(screen)) {
      assert.ok(
        option.width <= screen.width && option.height <= screen.height,
        `${option.id} does not fit ${screen.width}x${screen.height}`,
      );
    }
  }
});

test('a stored resolution that no longer fits falls back to native', () => {
  // Saved on a 1440p monitor, then launched on a 768p laptop.
  const stored = { displayMode: 'windowed', resolution: '2560x1440' };
  const result = settings.normalizeSettings(stored, LAPTOP_768);
  assert.equal(result.resolution, settings.resolutionId(1366, 768));
  // The mode is the player's explicit choice and survives untouched.
  assert.equal(result.displayMode, 'windowed');
});

test('an explicit player choice still persists', () => {
  const chosen = { displayMode: 'windowed', resolution: '1280x720', masterVolume: 0.25 };
  const result = settings.normalizeSettings(chosen, QHD);
  assert.equal(result.displayMode, 'windowed');
  assert.equal(result.resolution, '1280x720');
  assert.equal(result.masterVolume, 0.25);
});

test('legacy settings without UI scale migrate to Auto', () => {
  const result = settings.normalizeSettings(
    { displayMode: 'windowed', resolution: '1280x720' },
    QHD,
  );
  assert.equal(result.uiScale, 'auto');
});

test('Auto UI scale follows physical display resolution thresholds', () => {
  assert.equal(settings.resolveUiScale('auto', FHD), 1);
  assert.equal(settings.resolveUiScale('auto', display(2560, 1439)), 1);
  assert.equal(settings.resolveUiScale('auto', QHD), 1.25);
  assert.equal(settings.resolveUiScale('auto', ULTRAWIDE), 1.25);
  assert.equal(settings.resolveUiScale('auto', display(3840, 2160)), 1.5);
});

test('valid explicit UI scale values survive normalization and bypass Auto', () => {
  for (const [value, factor] of [['100', 1], ['125', 1.25], ['150', 1.5]]) {
    const normalized = settings.normalizeSettings({ uiScale: value }, QHD);
    assert.equal(normalized.uiScale, value);
    assert.equal(settings.resolveUiScale(normalized.uiScale, QHD), factor);
  }
});

test('malformed UI scale falls back safely to Auto', () => {
  for (const value of [null, '', '200', 1.25, {}, []]) {
    assert.equal(settings.normalizeSettings({ uiScale: value }, QHD).uiScale, 'auto');
  }
});

test('Settings compact CSS keeps the segmented navigation and fixed footer', () => {
  const css = readFileSync(new URL('../src/ui.css', import.meta.url), 'utf8');
  const compact = css.slice(css.lastIndexOf('@media (max-width: 900px)'));
  assert.match(compact, /#settings-panel\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/);
  assert.match(compact, /#settings-sidebar\s*\{[\s\S]*?flex-direction:\s*row;/);
  assert.match(compact, /#settings-frame\s*\{[\s\S]*?width:\s*100%;/);
  assert.match(compact, /#settings-footer\s*\{[\s\S]*?grid-row:\s*4;/);
  assert.match(compact, /@media \(max-width: 560px\)[\s\S]*?#settings-content \.settings-row,[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/);
});

test('Settings layout declares safe shrinking, fixed chrome, and shared scroll owners', () => {
  const css = readFileSync(new URL('../src/ui.css', import.meta.url), 'utf8');
  assert.match(css, /#settings-panel\s*\{[\s\S]*?align-items:\s*stretch;/);
  assert.match(css, /#settings-frame\s*\{[\s\S]*?box-sizing:\s*border-box;[\s\S]*?overflow-x:\s*hidden;[\s\S]*?overflow-y:\s*auto;/);
  assert.match(css, /#settings-content\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?max-width:\s*100%;/);
  assert.match(css, /#settings-content \.settings-row\s*\{[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*100%;/);
  assert.match(css, /#settings-sidebar \.settings-tab\s*\{[\s\S]*?padding:\s*12px 16px;/);
  assert.match(css, /#settings-frame,[\s\S]*?#contracts-list,[\s\S]*?\.contract-detail,[\s\S]*?\.character-layout\s*\{[\s\S]*?scrollbar-color:\s*#526172 #090d12;/);
  assert.match(css, /\.contracts-category-tabs\s*\{[\s\S]*?scrollbar-width:\s*none;/);
});
