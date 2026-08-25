import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { enterMainMenu } from './character-flow.mjs';

const PORT = 5204;
const PORTRAIT_PATH = 'assets/2d/ref-field-engineer-front-v1.png';
const EXPECTED_STATS = [
  ['max-hp', 'Max HP', 'assets/2d/icon-card-max-hp.png', '110 (+10)'],
  ['armor', 'Armor', 'assets/2d/icon-stat-armor-v2.png', '0%'],
  ['damage', 'Damage', 'assets/2d/icon-stat-damage.png', '-5%'],
  ['move-speed', 'Move Speed', 'assets/2d/icon-stat-move-speed.png', '11'],
  ['attack-speed', 'Attack Speed', 'assets/2d/icon-stat-attack-speed.png', 'x1'],
  ['crit-chance', 'Crit Chance', 'assets/2d/icon-stat-crit.png', '5%'],
  ['crit-damage', 'Crit Damage', 'assets/2d/icon-stat-crit-damage.png', '+50%'],
  ['luck', 'Luck', 'assets/2d/icon-stat-luck.png', '0%'],
  ['regen', 'Regen', 'assets/2d/icon-stat-regen.png', '0 HP/min'],
];
const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const executablePath = CHROME_PATHS.find((path) => existsSync(path));
assert.ok(executablePath, 'Chrome or Edge is required for character portrait smoke testing');

const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], {
  stdio: 'pipe',
});
let browser;
const pageErrors = [];

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`http://localhost:${PORT}/`);
      if (response.ok) return;
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Vite dev server did not start');
}

try {
  await waitForServer();
  browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: ['--enable-webgl', '--use-angle=swiftshader', '--window-size=1280,900'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  page.setDefaultTimeout(25_000);
  await page.evaluateOnNewDocument(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    const webglCanvases = new WeakSet();
    window.__characterPortraitWebglContexts = 0;
    window.__characterTestGamepad = {
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 })),
      connected: true,
      id: 'Voltswarm deterministic test pad',
      index: 0,
      mapping: 'standard',
      timestamp: 0,
    };
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [window.__characterTestGamepad],
    });
    HTMLCanvasElement.prototype.getContext = function getContext(type, ...args) {
      const context = originalGetContext.call(this, type, ...args);
      if ((type === 'webgl' || type === 'webgl2') && context && !webglCanvases.has(this)) {
        webglCanvases.add(this);
        window.__characterPortraitWebglContexts++;
      }
      return context;
    };
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await enterMainMenu(page);
  await page.waitForSelector('#play-button');
  const baselineWebglContexts = await page.evaluate(() => window.__characterPortraitWebglContexts);

  await page.click('#play-button');
  await page.waitForFunction((path) => {
    const image = document.querySelector('#character-select-roster [data-character-id="field-engineer"] .character-portrait');
    return image instanceof HTMLImageElement
      && image.getAttribute('src') === path
      && image.complete
      && image.naturalWidth === 597
      && image.naturalHeight === 826
      && image.alt === 'Field Engineer portrait';
  }, {}, PORTRAIT_PATH);
  const readRoster = (rootSelector) => {
    const root = document.querySelector(rootSelector);
    const card = root?.querySelector('[data-character-id="field-engineer"]');
    const detail = root?.querySelector('.character-detail');
    return {
      portrait: card?.querySelector('.character-portrait')?.getAttribute('src'),
      portraitAlt: card?.querySelector('.character-portrait')?.getAttribute('alt'),
      unlocked: card?.getAttribute('data-character-unlocked'),
      selected: card?.getAttribute('aria-pressed'),
      status: card?.querySelector('.character-card-status')?.textContent?.trim(),
      statusIcon: card?.querySelector('.character-card-status img')?.getAttribute('src') ?? null,
      header: detail?.querySelector('h2')?.textContent?.trim(),
      description: detail?.querySelector('.character-detail-header p')?.textContent?.trim(),
      largePortrait: detail?.querySelector('.character-portrait.large')?.getAttribute('src'),
      largePortraitAlt: detail?.querySelector('.character-portrait.large')?.getAttribute('alt'),
      stats: [...(detail?.querySelectorAll('.character-stat-row') ?? [])].map((row) => [
        row.getAttribute('data-character-stat'),
        row.querySelector(':scope > span')?.textContent?.trim(),
        row.querySelector('img')?.getAttribute('src'),
        row.querySelector('.build-value')?.textContent?.trim(),
      ]),
      modules: [...(detail?.querySelectorAll('.character-module') ?? [])].map((module) => ({
        id: module.getAttribute('data-character-module'),
        icon: module.querySelector('.rig-icon')?.getAttribute('src'),
        label: module.querySelector('.character-module-kicker')?.textContent?.trim(),
        title: module.querySelector('h3')?.textContent?.trim(),
        badge: module.querySelector('.character-rule-badge')?.textContent?.trim() ?? null,
      })),
      unlockFooter: detail?.querySelector('.character-unlock-footer')?.className ?? null,
      canvases: document.querySelectorAll('.character-model-canvas').length,
      webglContexts: window.__characterPortraitWebglContexts,
      sectionOverflow: root ? getComputedStyle(root).overflowY : null,
      gridOverflow: root ? getComputedStyle(root.querySelector('.character-grid')).overflowY : null,
      detailOverflow: detail ? getComputedStyle(detail).overflowY : null,
    };
  };
  const assertLayoutContract = async (rootSelector, actionSelector, width, height, detailColumns, statColumns, expectFit = true) => {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const geometry = await page.$eval(rootSelector, (section, actionSelector) => {
      const detail = section.querySelector('.character-detail');
      const grid = section.querySelector('.character-grid');
      const card = section.querySelector('[data-character-id="field-engineer"]');
      const name = card?.querySelector(':scope > strong');
      const action = document.querySelector(actionSelector);
      const actionRect = action?.getBoundingClientRect();
      const cardRect = card?.getBoundingClientRect();
      const nameRect = name?.getBoundingClientRect();
      return {
        verticalRange: section.scrollHeight - section.clientHeight,
        horizontalRange: section.scrollWidth - section.clientWidth,
        detailColumns: detail ? getComputedStyle(detail).gridTemplateColumns.split(' ').length : 0,
        statColumns: detail ? getComputedStyle(detail.querySelector('.character-stat-grid')).gridTemplateColumns.split(' ').length : 0,
        order: [...(detail?.children ?? [])].map((child) => child.className),
        tabIndex: section.tabIndex,
        sectionOverflow: getComputedStyle(section).overflowY,
        gridOverflow: grid ? getComputedStyle(grid).overflowY : null,
        detailOverflow: detail ? getComputedStyle(detail).overflowY : null,
        actionsOutsideSection: action ? !section.contains(action) : false,
        actionsVisible: Boolean(actionRect && actionRect.top >= 0 && actionRect.bottom <= innerHeight),
        nameText: name?.textContent?.trim(),
        nameFullyVisible: Boolean(
          cardRect && nameRect &&
          nameRect.left >= cardRect.left &&
          nameRect.right <= cardRect.right &&
          nameRect.top >= cardRect.top &&
          nameRect.bottom <= cardRect.bottom &&
          name.scrollWidth <= name.clientWidth &&
          name.scrollHeight <= name.clientHeight,
        ),
        nameWhiteSpace: name ? getComputedStyle(name).whiteSpace : null,
        nameOverflow: name ? getComputedStyle(name).overflow : null,
      };
    }, actionSelector);
    assert.deepEqual(geometry, {
      verticalRange: expectFit ? 0 : geometry.verticalRange,
      horizontalRange: 0,
      detailColumns,
      statColumns,
      order: ['character-identity', 'character-rules', 'character-stat-sheet'],
      tabIndex: expectFit ? -1 : geometry.verticalRange > 1 ? 0 : -1,
      sectionOverflow: 'auto',
      gridOverflow: 'visible',
      detailOverflow: 'visible',
      actionsOutsideSection: true,
      actionsVisible: true,
      nameText: 'Field Engineer',
      nameFullyVisible: true,
      nameWhiteSpace: 'normal',
      nameOverflow: 'visible',
    });
    return geometry;
  };
  const exerciseZeroRangeNavigation = async (rootSelector, expectedExitId) => {
    const fieldCardSelector = `${rootSelector} [data-character-id="field-engineer"]`;
    const rackCardSelector = `${rootSelector} [data-character-id="rack-hauler"]`;
    const overclockerCardSelector = `${rootSelector} [data-character-id="overclocker"]`;
    const sectionSelector = `${rootSelector}[data-character-section-scroll]`;
    assert.equal(await page.$eval(sectionSelector, (section) => section.scrollHeight - section.clientHeight), 0);
    assert.equal(await page.$eval(sectionSelector, (section) => section.tabIndex), -1);

    await page.$eval(fieldCardSelector, (card) => card.focus());
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-character-id="rack-hauler"]')), true);
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-character-id="overclocker"]')), true);
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement?.id), expectedExitId);
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-character-id="overclocker"]')), true);
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-character-id="rack-hauler"]')), true);
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-character-id="field-engineer"]')), true);

    await page.evaluate(() => document.activeElement?.blur());
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await assertPadFocus(fieldCardSelector);
    await padEdge({ button: 13 });
    await assertPadFocus(rackCardSelector);
    await padEdge({ button: 13 });
    await assertPadFocus(overclockerCardSelector);
    await padEdge({ button: 13 });
    await assertPadFocus(`#${expectedExitId}`);
    await padEdge({ button: 12 });
    await assertPadFocus(overclockerCardSelector);
    await padEdge({ button: 12 });
    await assertPadFocus(rackCardSelector);
    await padEdge({ button: 12 });
    await assertPadFocus(fieldCardSelector);
  };
  const exerciseSectionNavigation = async (rootSelector, expectedExitId) => {
    const detailSelector = `${rootSelector}[data-character-section-scroll]`;
    const accessibility = await page.$eval(detailSelector, (detail) => ({
      tabIndex: detail.tabIndex,
      role: detail.getAttribute('role'),
      label: detail.getAttribute('aria-label'),
      clipped: detail.scrollHeight > detail.clientHeight,
    }));
    assert.deepEqual(accessibility, {
      tabIndex: 0,
      role: 'region',
      label: 'Field Engineer character profile',
      clipped: true,
    });

    await page.$eval(detailSelector, (detail) => {
      detail.scrollTop = 0;
      detail.focus();
    });
    const seen = { recommended: false, tradeoff: false };
    let firstDelta = 0;
    for (let step = 0; step < 20; step++) {
      const state = await page.$eval(detailSelector, (detail) => {
        const bounds = detail.getBoundingClientRect();
        const visible = (selector) => {
          const element = detail.querySelector(selector);
          if (!element) return false;
          const rect = element.getBoundingClientRect();
          return rect.bottom > bounds.top && rect.top < bounds.bottom;
        };
        return {
          scrollTop: detail.scrollTop,
          recommended: visible('[data-character-module="recommended-weapon"]'),
          tradeoff: visible('[data-character-module="tradeoff"]'),
        };
      });
      seen.recommended ||= state.recommended;
      seen.tradeoff ||= state.tradeoff;
      const before = state.scrollTop;
      await page.keyboard.press('ArrowDown');
      const after = await page.$eval(detailSelector, (detail) => detail.scrollTop);
      if (step === 0) firstDelta = after - before;
      const activeId = await page.evaluate(() => document.activeElement?.id ?? '');
      if (activeId === expectedExitId) break;
    }
    assert.ok(firstDelta > 0, `${rootSelector} must scroll on the first vertical step`);
    assert.deepEqual(seen, { recommended: true, tradeoff: true });

    // At the lower boundary ArrowDown exits to actions; ArrowUp returns to
    // the detail pane. At the upper boundary ArrowUp exits through the roster
    // cards in reverse order, and ArrowDown re-enters it through the same path.
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-character-section-scroll]')), true);
    await page.$eval(detailSelector, (detail) => { detail.scrollTop = 0; });
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-character-id="overclocker"]')), true);
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-character-id="rack-hauler"]')), true);
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-character-id="field-engineer"]')), true);
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-character-id="rack-hauler"]')), true);
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-character-id="overclocker"]')), true);
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-character-section-scroll]')), true);
  };
  const padEdge = async ({ button = null, axisY = 0 }) => {
    await page.evaluate(async ({ button, axisY }) => {
      const pad = window.__characterTestGamepad;
      if (button !== null) {
        pad.buttons[button].pressed = true;
        pad.buttons[button].touched = true;
        pad.buttons[button].value = 1;
      }
      pad.axes[1] = axisY;
      pad.timestamp++;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (button !== null) {
        pad.buttons[button].pressed = false;
        pad.buttons[button].touched = false;
        pad.buttons[button].value = 0;
      }
      pad.axes[1] = 0;
      pad.timestamp++;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, { button, axisY });
  };
  const assertPadFocus = async (selector) => {
    const state = await page.evaluate((selector) => ({
      count: document.querySelectorAll('.pad-focus').length,
      matches: document.querySelector('.pad-focus')?.matches(selector) ?? false,
      nativeFocus: document.activeElement === document.body,
    }), selector);
    assert.deepEqual(state, { count: 1, matches: true, nativeFocus: true });
  };
  const exerciseRealGamepadNavigation = async (rootSelector, expectedExitId) => {
    const cardSelector = `${rootSelector} [data-character-id="field-engineer"]`;
    const rackCardSelector = `${rootSelector} [data-character-id="rack-hauler"]`;
    const overclockerCardSelector = `${rootSelector} [data-character-id="overclocker"]`;
    const detailSelector = `${rootSelector}[data-character-section-scroll]`;
    await page.$eval(cardSelector, (card) => card.focus());
    await page.evaluate(() => document.activeElement?.blur());
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.waitForFunction((selector) => document.querySelector(selector)?.classList.contains('pad-focus'), {}, cardSelector);
    await assertPadFocus(cardSelector);

    await padEdge({ button: 13 });
    await assertPadFocus(rackCardSelector);
    await padEdge({ button: 13 });
    await assertPadFocus(overclockerCardSelector);
    await padEdge({ button: 13 });
    await assertPadFocus(detailSelector);
    const beforeStick = await page.$eval(detailSelector, (detail) => detail.scrollTop);
    await padEdge({ axisY: 1 });
    const afterStick = await page.$eval(detailSelector, (detail) => detail.scrollTop);
    assert.ok(afterStick > beforeStick, `${rootSelector} must scroll through the real stick path`);

    const seen = { recommended: false, tradeoff: false };
    for (let step = 0; step < 20; step++) {
      const state = await page.$eval(detailSelector, (detail) => {
        const bounds = detail.getBoundingClientRect();
        const visible = (selector) => {
          const element = detail.querySelector(selector);
          if (!element) return false;
          const rect = element.getBoundingClientRect();
          return rect.bottom > bounds.top && rect.top < bounds.bottom;
        };
        return {
          recommended: visible('[data-character-module="recommended-weapon"]'),
          tradeoff: visible('[data-character-module="tradeoff"]'),
        };
      });
      seen.recommended ||= state.recommended;
      seen.tradeoff ||= state.tradeoff;
      await padEdge({ button: 13 });
      const exitFocused = await page.$eval(`#${expectedExitId}`, (item) => item.classList.contains('pad-focus'));
      if (exitFocused) break;
    }
    assert.deepEqual(seen, { recommended: true, tradeoff: true });
    await assertPadFocus(`#${expectedExitId}`);

    await padEdge({ button: 12 });
    await assertPadFocus(detailSelector);
    for (let step = 0; step < 20; step++) {
      await padEdge({ button: 12 });
      const cardFocused = await page.$eval(cardSelector, (item) => item.classList.contains('pad-focus'));
      if (cardFocused) break;
    }
    await assertPadFocus(cardSelector);
    await padEdge({ button: 13 });
    await assertPadFocus(rackCardSelector);
    await padEdge({ button: 13 });
    await assertPadFocus(overclockerCardSelector);
    await padEdge({ button: 13 });
    await assertPadFocus(detailSelector);
  };
  const exerciseLockedCharacter = async (rootSelector, confirmSelector = null) => {
    await page.click(`${rootSelector} [data-character-id="rack-hauler"]`);
    const locked = await page.$eval(rootSelector, (root) => {
      const card = root.querySelector('[data-character-id="rack-hauler"]');
      const status = card?.querySelector('.character-card-status.locked');
      const statusIcon = status?.querySelector('img');
      const footer = root.querySelector('.character-unlock-footer.locked');
      const detail = root.querySelector('.character-detail');
      const footerRect = footer?.getBoundingClientRect();
      const detailRect = detail?.getBoundingClientRect();
      const progress = footer?.querySelector('[role="progressbar"]');
      return {
        cardLocked: card?.getAttribute('data-character-unlocked'),
        statusText: status?.textContent?.trim(),
        statusIcon: statusIcon?.getAttribute('src'),
        statusIconAlt: statusIcon?.getAttribute('alt'),
        statusDisplay: status ? getComputedStyle(status).display : null,
        statusIconSize: statusIcon ? [getComputedStyle(statusIcon).width, getComputedStyle(statusIcon).height] : null,
        footerText: footer?.querySelector('.character-unlock-head span')?.textContent?.trim(),
        footerIcon: footer?.querySelector('.character-unlock-head img')?.getAttribute('src'),
        footerIconAlt: footer?.querySelector('.character-unlock-head img')?.getAttribute('alt'),
        profileStatusAbsent: root.querySelector('.character-profile-status') === null,
        footerSpansProfile: Boolean(footerRect && detailRect && Math.abs(footerRect.left - detailRect.left) <= 3 && Math.abs(footerRect.right - detailRect.right) <= 3),
        progressRole: progress?.getAttribute('role'),
        progressLabel: progress?.getAttribute('aria-label'),
        progressMax: progress?.getAttribute('aria-valuemax'),
        progressNow: progress?.getAttribute('aria-valuenow'),
        header: detail?.querySelector('h2')?.textContent?.trim(),
        portrait: detail?.querySelector('.character-portrait.large')?.getAttribute('src'),
        signature: detail?.querySelector('[data-character-module="signature"] h3')?.textContent?.trim(),
        signatureIcon: detail?.querySelector('[data-character-module="signature"] .rig-icon')?.getAttribute('src'),
        critChance: detail?.querySelector('[data-character-stat="crit-chance"] .build-value')?.textContent?.trim(),
      };
    });
    assert.equal(locked.cardLocked, 'false');
    assert.deepEqual(
      {
        text: locked.statusText,
        icon: locked.statusIcon,
        alt: locked.statusIconAlt,
        display: locked.statusDisplay,
        iconSize: locked.statusIconSize,
      },
      {
        text: 'Locked',
        icon: 'assets/2d/icon-ui-lock-v2.png',
        alt: '',
        display: 'flex',
        iconSize: ['14px', '14px'],
      },
    );
    assert.deepEqual(
      {
        text: locked.footerText,
        icon: locked.footerIcon,
        alt: locked.footerIconAlt,
        role: locked.progressRole,
      },
      { text: 'Locked', icon: 'assets/2d/icon-ui-lock-v2.png', alt: '', role: 'progressbar' },
    );
    assert.ok(locked.progressLabel?.endsWith(' progress'));
    assert.ok(Number(locked.progressMax) > 0);
    assert.ok(Number(locked.progressNow) >= 0);
    assert.equal(locked.progressMax, '4');
    assert.equal(locked.header, 'Rack Hauler');
    assert.equal(locked.portrait, 'assets/2d/ref-rack-hauler-front-v3-seafoam.png');
    assert.equal(locked.signature, 'Open Rack');
    assert.equal(locked.signatureIcon, 'assets/2d/icon-stat-projectiles-v2.png');
    assert.equal(locked.critChance, '3%');
    assert.equal(locked.profileStatusAbsent, true);
    assert.equal(locked.footerSpansProfile, true);
    if (confirmSelector) assert.equal(await page.$eval(confirmSelector, (button) => button.disabled), true);

    await page.click(`${rootSelector} [data-character-id="field-engineer"]`);
  };
  const exerciseLockedOverclocker = async (rootSelector, confirmSelector = null) => {
    await page.click(`${rootSelector} [data-character-id="overclocker"]`);
    const locked = await page.$eval(rootSelector, (root) => {
      const card = root.querySelector('[data-character-id="overclocker"]');
      const detail = root.querySelector('.character-detail');
      const footer = detail?.querySelector('.character-unlock-footer.locked');
      return {
        unlocked: card?.getAttribute('data-character-unlocked'),
        status: card?.querySelector('.character-card-status')?.textContent?.trim(),
        lockIcon: card?.querySelector('.character-card-status img')?.getAttribute('src'),
        header: detail?.querySelector('h2')?.textContent?.trim(),
        archetype: detail?.querySelector('.character-detail-header > span')?.textContent?.trim(),
        portrait: detail?.querySelector('.character-portrait.large')?.getAttribute('src'),
        signature: detail?.querySelector('[data-character-module="signature"] h3')?.textContent?.trim(),
        signatureIcon: detail?.querySelector('[data-character-module="signature"] .rig-icon')?.getAttribute('src'),
        suggestedStart: detail?.querySelector('[data-character-module="recommended-weapon"] h3')?.textContent?.trim(),
        tradeoff: detail?.querySelector('[data-character-module="tradeoff"] h3')?.textContent?.trim(),
        evasion: detail?.querySelector('[data-character-stat="evasion"] .build-value')?.textContent?.trim(),
        contract: footer?.querySelector('.character-unlock-requirement strong')?.textContent?.trim(),
        progress: footer?.querySelector('.character-unlock-requirement span')?.textContent?.trim(),
        progressMax: footer?.querySelector('[role="progressbar"]')?.getAttribute('aria-valuemax'),
      };
    });
    assert.deepEqual(locked, {
      unlocked: 'false',
      status: 'Locked',
      lockIcon: 'assets/2d/icon-ui-lock-v2.png',
      header: 'Overclocker',
      archetype: 'High-Risk Loot',
      portrait: 'assets/2d/ref-overclocker-front-v1.png',
      signature: 'Runaway Draw',
      signatureIcon: 'assets/2d/prop-chest-front-v2.png',
      suggestedStart: 'Volt Pulse',
      tradeoff: '+35% Physical Contact Damage Taken',
      evasion: '18',
      contract: 'Two of a Kind',
      progress: '0 / 2',
      progressMax: '2',
    });
    if (confirmSelector) assert.equal(await page.$eval(confirmSelector, (button) => button.disabled), true);
    await page.click(`${rootSelector} [data-character-id="field-engineer"]`);
  };
  const selectorState = await page.evaluate(readRoster, '#character-select-roster');
  const runtimeMeasurements = [];
  assert.equal(await page.$eval('#character-confirm-button', (button) => button.disabled), false);
  assert.equal(selectorState.statusIcon, null);
  runtimeMeasurements.push({ viewport: '1920x1080', ...(await assertLayoutContract('#character-select-roster', '#character-confirm-button', 1920, 1080, 3, 1)) });
  runtimeMeasurements.push({ viewport: '1280x720', ...(await assertLayoutContract('#character-select-roster', '#character-confirm-button', 1280, 720, 3, 1)) });
  runtimeMeasurements.push({ viewport: '1024x600', ...(await assertLayoutContract('#character-select-roster', '#character-confirm-button', 1024, 600, 3, 1)) });
  await exerciseZeroRangeNavigation('#character-select-roster', 'character-select-back-button');
  runtimeMeasurements.push({ viewport: '800x900', ...(await assertLayoutContract('#character-select-roster', '#character-confirm-button', 800, 900, 2, 3)) });
  runtimeMeasurements.push({ viewport: '520x900', ...(await assertLayoutContract('#character-select-roster', '#character-confirm-button', 520, 900, 1, 2, false)) });
  runtimeMeasurements.push({ viewport: '390x900', ...(await assertLayoutContract('#character-select-roster', '#character-confirm-button', 390, 900, 1, 1, false)) });
  await page.setViewport({ width: 520, height: 400, deviceScaleFactor: 1 });
  await exerciseRealGamepadNavigation('#character-select-roster', 'character-select-back-button');
  await exerciseSectionNavigation('#character-select-roster', 'character-select-back-button');
  await exerciseLockedCharacter('#character-select-roster', '#character-confirm-button');
  await exerciseLockedOverclocker('#character-select-roster', '#character-confirm-button');

  await page.click('#character-select-back-button');
  await page.click('#characters-button');
  await page.waitForFunction((path) => {
    const image = document.querySelector('#characters-roster [data-character-id="field-engineer"] .character-portrait');
    return image instanceof HTMLImageElement && image.getAttribute('src') === path && image.complete;
  }, {}, PORTRAIT_PATH);
  const rosterState = await page.evaluate(readRoster, '#characters-roster');
  assert.equal(rosterState.statusIcon, null);
  await assertLayoutContract('#characters-roster', '#characters-back-button', 1920, 1080, 3, 1);
  await assertLayoutContract('#characters-roster', '#characters-back-button', 1280, 720, 3, 1);
  await assertLayoutContract('#characters-roster', '#characters-back-button', 1024, 600, 3, 1);
  await exerciseZeroRangeNavigation('#characters-roster', 'characters-back-button');
  await assertLayoutContract('#characters-roster', '#characters-back-button', 800, 900, 2, 3);
  await assertLayoutContract('#characters-roster', '#characters-back-button', 520, 900, 1, 2, false);
  await assertLayoutContract('#characters-roster', '#characters-back-button', 390, 900, 1, 1, false);
  await page.setViewport({ width: 520, height: 400, deviceScaleFactor: 1 });
  await exerciseRealGamepadNavigation('#characters-roster', 'characters-back-button');
  await exerciseSectionNavigation('#characters-roster', 'characters-back-button');
  await exerciseLockedCharacter('#characters-roster');
  await exerciseLockedOverclocker('#characters-roster');
  const unlockedRack = await page.evaluate(async () => {
    const [{ PROFILE }, { grantReward, ALL_CONTRACTS }] = await Promise.all([
      import('/src/config.ts'),
      import('/src/contracts.ts'),
    ]);
    const reference = PROFILE.unlockedCharacters;
    const reward = ALL_CONTRACTS.find(({ id }) => id === 'proving-ground')?.reward;
    if (!reward) throw new Error('Proving Ground reward missing');
    grantReward(reward);
    grantReward(reward);
    document.querySelector('#characters-roster [data-character-id="rack-hauler"]')?.click();
    const card = document.querySelector('#characters-roster [data-character-id="rack-hauler"]');
    return {
      sameArray: PROFILE.unlockedCharacters === reference,
      ids: [...PROFILE.unlockedCharacters],
      unlocked: card?.getAttribute('data-character-unlocked'),
      status: card?.querySelector('.character-card-status')?.textContent?.trim(),
      statusIcon: card?.querySelector('.character-card-status img')?.getAttribute('src') ?? null,
      footer: document.querySelector('#characters-roster .character-unlock-footer')?.className ?? null,
    };
  });
  assert.deepEqual(unlockedRack, {
    sameArray: true,
    ids: ['field-engineer', 'rack-hauler'],
    unlocked: 'true',
    status: 'Unlocked',
    statusIcon: null,
    footer: null,
  });
  const unlockedOverclocker = await page.evaluate(async () => {
    const [{ PROFILE }, { LIFETIME }, { settleContracts }] = await Promise.all([
      import('/src/config.ts'),
      import('/src/profile.ts'),
      import('/src/contracts.ts'),
    ]);
    const reference = PROFILE.unlockedCharacters;
    LIFETIME.completedCharacterIds.splice(0, LIFETIME.completedCharacterIds.length, 'field-engineer', 'rack-hauler');
    settleContracts();
    document.querySelector('#characters-roster [data-character-id="overclocker"]')?.click();
    const card = document.querySelector('#characters-roster [data-character-id="overclocker"]');
    return {
      sameArray: PROFILE.unlockedCharacters === reference,
      ids: [...PROFILE.unlockedCharacters],
      unlocked: card?.getAttribute('data-character-unlocked'),
      status: card?.querySelector('.character-card-status')?.textContent?.trim(),
      statusIcon: card?.querySelector('.character-card-status img')?.getAttribute('src') ?? null,
      footer: document.querySelector('#characters-roster .character-unlock-footer')?.className ?? null,
    };
  });
  assert.deepEqual(unlockedOverclocker, {
    sameArray: true,
    ids: ['field-engineer', 'rack-hauler', 'overclocker'],
    unlocked: 'true',
    status: 'Unlocked',
    statusIcon: null,
    footer: null,
  });
  await page.click('#characters-roster [data-character-id="field-engineer"]');

  assert.equal(selectorState.portrait, PORTRAIT_PATH);
  assert.equal(selectorState.portraitAlt, 'Field Engineer portrait');
  assert.equal(selectorState.unlocked, 'true');
  assert.equal(selectorState.selected, 'true');
  assert.equal(selectorState.status, 'Unlocked');
  assert.equal(selectorState.header, 'Field Engineer');
  assert.equal(selectorState.description, 'A forgiving chassis that turns Core upgrades into small repairs.');
  assert.equal(selectorState.largePortrait, PORTRAIT_PATH);
  assert.equal(selectorState.largePortraitAlt, '');
  assert.deepEqual(selectorState.stats, EXPECTED_STATS);
  assert.deepEqual(selectorState.modules, [
    {
      id: 'signature',
      icon: 'assets/2d/icon-item-repair.png',
      label: 'Signature',
      title: 'Field Repair',
      badge: '1% MAX HP / CORE UPGRADE',
    },
    {
      id: 'tradeoff',
      icon: 'assets/2d/icon-stat-damage.png',
      label: 'Tradeoff',
      title: '-5% Damage',
      badge: null,
    },
    {
      id: 'recommended-weapon',
      icon: 'assets/2d/icon-weapon-bolt.png',
      label: 'Suggested Start',
      title: 'Bolt Cannon',
      badge: null,
    },
  ]);
  const statEmphasis = await page.evaluate(async () => {
    const { CHARACTER_REGISTRY, characterStatRows } = await import('/src/characters.ts');
    return characterStatRows(CHARACTER_REGISTRY['field-engineer']).map((row) => {
      const element = document.querySelector(`#characters-roster [data-character-stat="${row.id}"]`);
      return {
        id: row.id,
        derived: row.changed,
        marked: element?.getAttribute('data-character-stat-changed'),
        className: element?.classList.contains(row.changed ? 'changed' : 'baseline'),
      };
    });
  });
  assert.equal(statEmphasis.length, 9);
  for (const stat of statEmphasis) {
    assert.equal(stat.marked, String(stat.derived));
    assert.equal(stat.className, true);
  }
  assert.equal(selectorState.unlockFooter, null);
  assert.equal(selectorState.canvases, 0);
  assert.equal(selectorState.webglContexts, baselineWebglContexts);
  assert.equal(selectorState.sectionOverflow, 'auto');
  assert.equal(selectorState.gridOverflow, 'visible');
  assert.equal(selectorState.detailOverflow, 'visible');
  assert.deepEqual(rosterState, selectorState);
  if (process.env.CAPTURE_CHARACTER_UI) {
    await page.screenshot({ path: 'assets/preview/character-detail-polish.png' });
  }
  await page.setViewport({ width: 520, height: 400, deviceScaleFactor: 1 });
  const compactLayout = await page.$eval('#characters-roster', (root) => ({
    sectionRange: root.scrollHeight - root.clientHeight,
    horizontalRange: root.scrollWidth - root.clientWidth,
    profileColumns: getComputedStyle(root.querySelector('.character-detail')).gridTemplateColumns.split(' ').length,
    sectionOverflow: getComputedStyle(root).overflowY,
    gridOverflow: getComputedStyle(root.querySelector('.character-grid')).overflowY,
    detailOverflow: getComputedStyle(root.querySelector('.character-detail')).overflowY,
  }));
  assert.ok(compactLayout.sectionRange > 0, 'constrained layout must fall back to whole-section scrolling');
  assert.deepEqual({ ...compactLayout, sectionRange: true }, {
    sectionRange: true,
    horizontalRange: 0,
    profileColumns: 1,
    sectionOverflow: 'auto',
    gridOverflow: 'visible',
    detailOverflow: 'visible',
  });
  console.log('character runtime measurements:', JSON.stringify([...runtimeMeasurements, { viewport: '520x400', ...compactLayout }]));
  await page.click('#characters-back-button');
  assert.equal(await page.$eval('#menu-overlay', (menu) => menu.classList.contains('hidden')), false);
  assert.deepEqual(pageErrors, []);
  console.log('character portrait browser smoke passed: shared 2D asset + no character WebGL');
} finally {
  await browser?.close();
  vite.kill();
}
