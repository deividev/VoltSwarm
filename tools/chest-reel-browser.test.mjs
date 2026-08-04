import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const PORT = 5205;
const CASES = [
  ['gray', 'repair'],
  ['green', 'scrap-cache'],
  ['blue', 'barrier-cell'],
  ['purple', 'overload-trigger'],
  ['gold', 'magnetron-heart'],
];
const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const executablePath = CHROME_PATHS.find((path) => existsSync(path));
assert.ok(executablePath, 'Chrome or Edge is required for chest reel browser testing');

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
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__voltswarm?.hud && document.querySelector('#chest-reel'));

  for (const [tier, finalMod] of CASES) {
    const before = await page.evaluate(({ tier, finalMod }) => {
      window.__chestLandedCount = 0;
      window.__chestDoneCount = 0;
      window.__voltswarm.hud.showChestSpin(
        finalMod,
        tier,
        () => { window.__chestLandedCount++; },
        1,
        () => { window.__chestDoneCount++; },
      );
      const reel = document.querySelector('#chest-reel');
      const cells = [...reel.querySelectorAll('.chest-cell')];
      window.__chestPrizeNode = cells.at(-1).querySelector('.chest-icon-img, .chest-cell-emoji');
      window.__chestPrizeNode.dataset.identityToken = `${tier}-${finalMod}`;
      return {
        ids: cells.map((cell) => cell.dataset.modId),
        token: window.__chestPrizeNode.dataset.identityToken,
        cardTier: document.querySelector('#chest-card').classList.contains(tier),
      };
    }, { tier, finalMod });

    assert.equal(before.ids.length, 19);
    assert.equal(before.ids.at(-1), finalMod);
    assert.equal(before.cardTier, true, `${finalMod} must render with its ${tier} rarity shell`);
    for (let index = 1; index < before.ids.length; index++) {
      assert.notEqual(before.ids[index], before.ids[index - 1], `${tier} browser adjacency at ${index}`);
    }
    if (tier === 'gold') assert.ok(new Set(before.ids.slice(0, -1)).size >= 3);

    const landed = await page.evaluate(() => {
      document.querySelector('#chest-reel').dispatchEvent(new TransitionEvent('transitionend', {
        propertyName: 'transform',
      }));
      const promoted = document.querySelector('#chest-icon > .chest-icon-img, #chest-icon > .chest-cell-emoji');
      return {
        sameNode: promoted === window.__chestPrizeNode,
        token: promoted?.dataset.identityToken,
        childCount: document.querySelector('#chest-icon').childElementCount,
        parentId: promoted?.parentElement?.id,
        connected: promoted?.isConnected,
        landedCount: window.__chestLandedCount,
        cardLanded: document.querySelector('#chest-card').classList.contains('landed'),
        continueVisible: !document.querySelector('#chest-continue').classList.contains('hidden'),
        rarityLabel: document.querySelector('#chest-card .rarity-tag')?.textContent,
      };
    });
    assert.deepEqual(landed, {
      sameNode: true,
      token: before.token,
      childCount: 1,
      parentId: 'chest-icon',
      connected: true,
      landedCount: 1,
      cardLanded: true,
      continueVisible: true,
      rarityLabel: tier === 'purple' ? 'Epic' : ({ gray: 'Common', green: 'Uncommon', blue: 'Rare', gold: 'Legendary' })[tier],
    });

    await page.click('#chest-continue');
    assert.deepEqual(await page.evaluate(() => ({
      doneCount: window.__chestDoneCount,
      hidden: document.querySelector('#chest-overlay').classList.contains('hidden'),
    })), { doneCount: 1, hidden: true });
  }

  assert.deepEqual(pageErrors, []);
  console.log('Chest reel browser node-identity test passed for all five tiers.');
} finally {
  if (browser) await browser.close();
  vite.kill();
}
