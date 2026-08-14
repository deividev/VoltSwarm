// Regression harness for the one-time boot gate and initial-menu navigation.
// It injects keyboard, standard/XInput and non-standard/DirectInput input,
// then verifies gate dismissal, edge draining, focus movement and activation.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const PORT = 5204;
const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const chromePath = CHROME_PATHS.find((path) => existsSync(path));
if (!chromePath) throw new Error('No Chrome/Edge executable found');

const vite = spawn('npx.cmd', ['vite', '--port', String(PORT), '--strictPort'], {
  stdio: 'pipe',
  shell: true,
});

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`http://localhost:${PORT}/`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Vite dev server did not start');
}

async function waitFrames(page, count = 4) {
  await page.evaluate(
    (frames) =>
      new Promise((resolve) => {
        let remaining = frames;
        const tick = () => {
          if (--remaining <= 0) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    count,
  );
}

async function createPage(browser, mapping = null) {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument((initialMapping) => {
    const buttons = Array.from({ length: 16 }, () => ({
      pressed: false,
      touched: false,
      value: 0,
    }));
    const pad = initialMapping === null ? null : {
      id: initialMapping === 'standard' ? 'Mock XInput Pad' : 'Mock DirectInput Pad',
      index: 0,
      connected: true,
      mapping: initialMapping,
      timestamp: 0,
      axes: initialMapping === 'standard' ? [0, 0] : [0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
      buttons,
      vibrationActuator: null,
    };
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => (pad ? [pad] : []),
    });
    window.__mockGamepad = {
      button(index, pressed) {
        if (!pad) return;
        buttons[index].pressed = pressed;
        buttons[index].touched = pressed;
        buttons[index].value = pressed ? 1 : 0;
        pad.timestamp += 1;
      },
      axis(index, value) {
        if (!pad) return;
        pad.axes[index] = value;
        pad.timestamp += 1;
      },
    };
  }, mapping);
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector('#boot-overlay:not(.hidden)', { timeout: 15000 });
  await waitFrames(page);
  const preInputState = await page.evaluate(() => {
    const boot = document.querySelector('#boot-overlay');
    const menu = document.querySelector('#menu-overlay');
    if (!boot || !menu) return null;
    const bootStyle = getComputedStyle(boot);
    const menuStyle = getComputedStyle(menu);
    return {
      bootVisible:
        !boot.classList.contains('hidden') &&
        bootStyle.display !== 'none' &&
        bootStyle.visibility !== 'hidden',
      menuHidden: menu.classList.contains('hidden') || menuStyle.display === 'none',
      prompt: boot.textContent.trim(),
    };
  });
  if (!preInputState?.bootVisible) throw new Error('boot overlay is not visible before input');
  if (!preInputState.menuHidden) throw new Error('menu overlay is displayed before input');
  if (preInputState.prompt !== 'PRESS ANY KEY') {
    throw new Error(`unexpected pre-input boot copy: ${preInputState.prompt}`);
  }
  return page;
}

async function expectMenu(page) {
  await page.waitForSelector('#menu-overlay:not(.hidden)', { timeout: 5000 });
  await page.waitForSelector('#boot-overlay.hidden', { timeout: 5000 });
}

async function expectFocus(page, id) {
  await page.waitForFunction(
    (expectedId) => document.querySelector('.pad-focus')?.id === expectedId,
    { timeout: 5000 },
    id,
  );
}

async function expectDismissalDidNotActivatePlay(page) {
  await waitFrames(page, 2);
  await expectMenu(page);
  await expectFocus(page, 'play-button');
  const visibleOverlays = await page.evaluate(() =>
    [...document.querySelectorAll('.overlay:not(.hidden)')]
      .filter((overlay) => overlay instanceof HTMLElement && overlay.getClientRects().length > 0)
      .map((overlay) => overlay.id),
  );
  if (visibleOverlays.length !== 1 || visibleOverlays[0] !== 'menu-overlay') {
    throw new Error(`boot dismissal activated Play: ${visibleOverlays.join(', ') || 'no visible overlay'}`);
  }
}

async function expectKeyboardDismissalDidNotActivatePlay(page) {
  await waitFrames(page, 2);
  const state = await page.evaluate(() => {
    const visibility = (selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) return null;
      const style = getComputedStyle(element);
      return (
        !element.classList.contains('hidden') &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        element.getClientRects().length > 0
      );
    };
    return {
      bootHidden: visibility('#boot-overlay') === false,
      menuVisible: visibility('#menu-overlay') === true,
      characterSelectHidden: visibility('#character-select-overlay') === false,
      weaponDraftHidden: visibility('#start-overlay') === false,
    };
  });
  if (!state.bootHidden) throw new Error('boot overlay is not hidden after keyboard dismissal');
  if (!state.menuVisible) throw new Error('menu overlay is not visible after keyboard dismissal');
  if (!state.characterSelectHidden || !state.weaponDraftHidden) {
    throw new Error('keyboard boot dismissal activated Play');
  }
}

async function tapButton(page, index) {
  await page.evaluate((button) => window.__mockGamepad.button(button, true), index);
  await waitFrames(page);
  await page.evaluate((button) => window.__mockGamepad.button(button, false), index);
  await waitFrames(page);
}

async function testStandard(browser) {
  const page = await createPage(browser, 'standard');
  await tapButton(page, 0); // Standard A / confirm dismisses boot.
  await expectDismissalDidNotActivatePlay(page);
  await tapButton(page, 13); // Standard d-pad down.
  await expectFocus(page, 'characters-button');
  await tapButton(page, 0); // Standard A / Interact.
  await page.waitForSelector('#characters-overlay:not(.hidden)', { timeout: 5000 });
  await page.close();
  console.log('PASS standard/XInput initial-menu navigation');
}

async function testDirectInput(browser) {
  const page = await createPage(browser, '');
  // DirectInput HAT direction 4 (down) dismisses boot. The same edge must not
  // move focus to the second menu item when that menu is revealed.
  await page.evaluate(() => window.__mockGamepad.axis(9, 1 / 7));
  await waitFrames(page);
  await expectDismissalDidNotActivatePlay(page);
  await page.evaluate(() => window.__mockGamepad.axis(9, 2)); // Idle HAT value.
  await waitFrames(page);
  await page.evaluate(() => window.__mockGamepad.axis(9, 1 / 7));
  await waitFrames(page);
  await page.evaluate(() => window.__mockGamepad.axis(9, 2));
  await waitFrames(page);
  await expectFocus(page, 'characters-button');
  await tapButton(page, 1); // Raw DirectInput Cross -> standard Interact/A.
  await page.waitForSelector('#characters-overlay:not(.hidden)', { timeout: 5000 });
  await page.close();
  console.log('PASS non-standard/DirectInput initial-menu navigation');
}

async function testKeyboard(browser, key) {
  const page = await createPage(browser);
  const prompt = await page.$eval('#boot-overlay', (overlay) => overlay.textContent.trim());
  if (prompt !== 'PRESS ANY KEY') throw new Error(`unexpected boot copy: ${prompt}`);
  await page.keyboard.press(key);
  await expectKeyboardDismissalDidNotActivatePlay(page);
  await page.close();
  console.log(`PASS keyboard ${key} boot dismissal`);
}

try {
  await waitForServer();
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--use-gl=angle'],
  });
  await testKeyboard(browser, 'Enter');
  await testKeyboard(browser, 'Space');
  await testStandard(browser);
  await testDirectInput(browser);
  await browser.close();
} catch (error) {
  console.error('Menu gamepad regression failed:', error.message);
  process.exitCode = 1;
} finally {
  vite.kill();
  process.exit(process.exitCode ?? 0);
}
