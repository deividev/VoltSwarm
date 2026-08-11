import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const PORT = 5204;
const PORTRAIT_PATH = 'assets/2d/ref-field-engineer-front-v1.png';
const EXPECTED_STATS = [
  ['max-hp', 'Max HP', 'assets/2d/icon-card-max-hp.png', '110 (+10)'],
  ['armor', 'Armor', 'assets/2d/icon-stat-armor-v2.png', '5%'],
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
      && image.alt === 'Field Engineer front orthographic model reference';
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
      gridOverflow: root ? getComputedStyle(root.querySelector('.character-grid')).overflowY : null,
      detailOverflow: detail ? getComputedStyle(detail).overflowY : null,
    };
  };
  const exerciseDetailNavigation = async (rootSelector, expectedExitId) => {
    const detailSelector = `${rootSelector} [data-character-detail-scroll]`;
    const accessibility = await page.$eval(detailSelector, (detail) => ({
      tabIndex: detail.tabIndex,
      role: detail.getAttribute('role'),
      label: detail.getAttribute('aria-label'),
      clipped: detail.scrollHeight > detail.clientHeight,
    }));
    assert.deepEqual(accessibility, {
      tabIndex: 0,
      role: 'region',
      label: 'Field Engineer character details',
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
      if (activeId) {
        assert.equal(activeId, expectedExitId);
        break;
      }
    }
    assert.ok(firstDelta > 0, `${rootSelector} must scroll on the first vertical step`);
    assert.deepEqual(seen, { recommended: true, tradeoff: true });

    // At the lower boundary ArrowDown exits to actions; ArrowUp returns to
    // the detail pane. At the upper boundary ArrowUp exits to the roster card,
    // and ArrowDown re-enters it. This is the same focus path used by the pad.
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-character-detail-scroll]')), true);
    await page.$eval(detailSelector, (detail) => { detail.scrollTop = 0; });
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-character-id="field-engineer"]')), true);
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-character-detail-scroll]')), true);
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
    const detailSelector = `${rootSelector} [data-character-detail-scroll]`;
    await page.waitForFunction((selector) => document.querySelector(selector)?.classList.contains('pad-focus'), {}, cardSelector);
    await assertPadFocus(cardSelector);

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
    await assertPadFocus(detailSelector);
  };
  const exerciseLockedCharacter = async (rootSelector, confirmSelector = null) => {
    const contractId = await page.evaluate(async (rootSelector) => {
      const [{ PROFILE }, { CHARACTER_REGISTRY }, { ACTIVE_CONTRACTS }] = await Promise.all([
        import('/src/config.ts'),
        import('/src/characters.ts'),
        import('/src/contracts.ts'),
      ]);
      const character = CHARACTER_REGISTRY['field-engineer'];
      const contract = ACTIVE_CONTRACTS[0];
      if (!character || !contract) throw new Error('Locked-character fixture requires a registered character and Contract');
      window.__characterRestoreState = {
        unlockedCharacters: [...PROFILE.unlockedCharacters],
        unlock: character.unlock,
      };
      PROFILE.unlockedCharacters.splice(0);
      character.unlock = { kind: 'contract', contractId: contract.id };
      document.querySelector(`${rootSelector} [data-character-id="field-engineer"]`)?.click();
      return contract.id;
    }, rootSelector);
    const locked = await page.$eval(rootSelector, (root) => {
      const card = root.querySelector('[data-character-id="field-engineer"]');
      const status = card?.querySelector('.character-card-status.locked');
      const statusIcon = status?.querySelector('img');
      const footer = root.querySelector('.character-unlock-footer.locked');
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
        progressRole: progress?.getAttribute('role'),
        progressLabel: progress?.getAttribute('aria-label'),
        progressMax: progress?.getAttribute('aria-valuemax'),
        progressNow: progress?.getAttribute('aria-valuenow'),
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
    if (confirmSelector) assert.equal(await page.$eval(confirmSelector, (button) => button.disabled), true);

    await page.evaluate(async ({ rootSelector, contractId }) => {
      const [{ PROFILE }, { CHARACTER_REGISTRY }] = await Promise.all([
        import('/src/config.ts'),
        import('/src/characters.ts'),
      ]);
      const restore = window.__characterRestoreState;
      const character = CHARACTER_REGISTRY['field-engineer'];
      if (!restore || !character || character.unlock.contractId !== contractId) throw new Error('Locked-character fixture drifted');
      PROFILE.unlockedCharacters.splice(0, Infinity, ...restore.unlockedCharacters);
      character.unlock = restore.unlock;
      delete window.__characterRestoreState;
      document.querySelector(`${rootSelector} [data-character-id="field-engineer"]`)?.click();
    }, { rootSelector, contractId });
  };
  const selectorState = await page.evaluate(readRoster, '#character-select-roster');
  assert.equal(await page.$eval('#character-confirm-button', (button) => button.disabled), false);
  assert.equal(selectorState.statusIcon, null);
  await exerciseRealGamepadNavigation('#character-select-roster', 'character-select-back-button');
  await exerciseDetailNavigation('#character-select-roster', 'character-select-back-button');
  await exerciseLockedCharacter('#character-select-roster', '#character-confirm-button');

  await page.click('#character-select-back-button');
  await page.click('#characters-button');
  await page.waitForFunction((path) => {
    const image = document.querySelector('#characters-roster [data-character-id="field-engineer"] .character-portrait');
    return image instanceof HTMLImageElement && image.getAttribute('src') === path && image.complete;
  }, {}, PORTRAIT_PATH);
  const rosterState = await page.evaluate(readRoster, '#characters-roster');
  assert.equal(rosterState.statusIcon, null);
  await exerciseRealGamepadNavigation('#characters-roster', 'characters-back-button');
  await exerciseDetailNavigation('#characters-roster', 'characters-back-button');
  await exerciseLockedCharacter('#characters-roster');

  assert.equal(selectorState.portrait, PORTRAIT_PATH);
  assert.equal(selectorState.portraitAlt, 'Field Engineer front orthographic model reference');
  assert.equal(selectorState.unlocked, 'true');
  assert.equal(selectorState.selected, 'true');
  assert.equal(selectorState.status, 'Unlocked');
  assert.equal(selectorState.header, 'Field Engineer');
  assert.equal(selectorState.description, 'A forgiving chassis that turns Core upgrades into small repairs.');
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
      id: 'recommended-weapon',
      icon: 'assets/2d/icon-weapon-bolt.png',
      label: 'Recommended Weapon',
      title: 'Bolt Cannon',
      badge: null,
    },
    {
      id: 'tradeoff',
      icon: 'assets/2d/icon-stat-damage.png',
      label: 'Tradeoff',
      title: '-5% Damage',
      badge: null,
    },
  ]);
  assert.equal(selectorState.unlockFooter, null);
  assert.equal(selectorState.canvases, 0);
  assert.equal(selectorState.webglContexts, baselineWebglContexts);
  assert.equal(selectorState.gridOverflow, 'auto');
  assert.equal(selectorState.detailOverflow, 'auto');
  assert.deepEqual(rosterState, selectorState);
  if (process.env.CAPTURE_CHARACTER_UI) {
    await page.screenshot({ path: 'assets/preview/character-detail-polish.png' });
  }
  await page.setViewport({ width: 720, height: 800, deviceScaleFactor: 1 });
  const compactLayout = await page.$eval('#characters-roster', (root) => ({
    statColumns: getComputedStyle(root.querySelector('.character-stat-grid')).gridTemplateColumns.split(' ').length,
    moduleColumns: getComputedStyle(root.querySelector('.character-module-grid')).gridTemplateColumns.split(' ').length,
    gridOverflow: getComputedStyle(root.querySelector('.character-grid')).overflowY,
    detailOverflow: getComputedStyle(root.querySelector('.character-detail')).overflowY,
  }));
  assert.deepEqual(compactLayout, {
    statColumns: 1,
    moduleColumns: 1,
    gridOverflow: 'auto',
    detailOverflow: 'auto',
  });
  await page.click('#characters-back-button');
  assert.equal(await page.$eval('#menu-overlay', (menu) => menu.classList.contains('hidden')), false);
  assert.deepEqual(pageErrors, []);
  console.log('character portrait browser smoke passed: shared 2D asset + no character WebGL');
} finally {
  await browser?.close();
  vite.kill();
}
