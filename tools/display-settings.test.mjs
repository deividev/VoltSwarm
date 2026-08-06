// First launch must fill the player's own screen. These are the pure halves of
// src/settings.ts, so they run without a DOM; detectDisplay() is the only part
// that needs `window` and is deliberately not exercised here.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
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
