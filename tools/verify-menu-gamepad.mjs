// Regression harness for initial-menu gamepad navigation.
// It injects deterministic standard/XInput and non-standard/DirectInput pads,
// then verifies focus movement and Interact activation in the real renderer.
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

async function createPage(browser, mapping) {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument((initialMapping) => {
    const buttons = Array.from({ length: 16 }, () => ({
      pressed: false,
      touched: false,
      value: 0,
    }));
    const pad = {
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
      value: () => [pad],
    });
    window.__mockGamepad = {
      button(index, pressed) {
        buttons[index].pressed = pressed;
        buttons[index].touched = pressed;
        buttons[index].value = pressed ? 1 : 0;
        pad.timestamp += 1;
      },
      axis(index, value) {
        pad.axes[index] = value;
        pad.timestamp += 1;
      },
    };
  }, mapping);
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector('#menu-overlay:not(.hidden)', { timeout: 15000 });
  await waitFrames(page);
  return page;
}

async function expectFocus(page, id) {
  await page.waitForFunction(
    (expectedId) => document.querySelector('.pad-focus')?.id === expectedId,
    { timeout: 5000 },
    id,
  );
}

async function tapButton(page, index) {
  await page.evaluate((button) => window.__mockGamepad.button(button, true), index);
  await waitFrames(page);
  await page.evaluate((button) => window.__mockGamepad.button(button, false), index);
  await waitFrames(page);
}

async function testStandard(browser) {
  const page = await createPage(browser, 'standard');
  await expectFocus(page, 'play-button');
  await tapButton(page, 13); // Standard d-pad down.
  await expectFocus(page, 'unlocks-button');
  await tapButton(page, 0); // Standard A / Interact.
  await page.waitForSelector('#unlocks-overlay:not(.hidden)', { timeout: 5000 });
  await page.close();
  console.log('PASS standard/XInput initial-menu navigation');
}

async function testDirectInput(browser) {
  const page = await createPage(browser, '');
  await expectFocus(page, 'play-button');
  // DirectInput HAT direction 4 (down): (4 / 7) * 2 - 1.
  await page.evaluate(() => window.__mockGamepad.axis(9, 1 / 7));
  await waitFrames(page);
  await page.evaluate(() => window.__mockGamepad.axis(9, 2)); // Idle HAT value.
  await waitFrames(page);
  await expectFocus(page, 'unlocks-button');
  await tapButton(page, 1); // Raw DirectInput Cross -> standard Interact/A.
  await page.waitForSelector('#unlocks-overlay:not(.hidden)', { timeout: 5000 });
  await page.close();
  console.log('PASS non-standard/DirectInput initial-menu navigation');
}

try {
  await waitForServer();
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--use-gl=angle'],
  });
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
