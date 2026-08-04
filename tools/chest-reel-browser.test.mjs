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
        neutralCount: cells.filter((cell) => cell.classList.contains('chest-cell-anticipation')).length,
        neutralImageCount: reel.querySelectorAll('.chest-cell-anticipation img').length,
        neutralLockCount: reel.querySelectorAll('.chest-cell-anticipation .chest-cell-lock').length,
        neutralMarkCount: reel.querySelectorAll('.chest-cell-anticipation .chest-anticipation-mark').length,
        neutralTiers: cells
          .filter((cell) => cell.classList.contains('chest-cell-anticipation'))
          .map((cell) => cell.dataset.anticipationTier),
        neutralBurstColors: [...reel.querySelectorAll('.chest-cell-anticipation .chest-anticipation-mark i')]
          .map((voxel) => getComputedStyle(voxel).backgroundColor),
        itemImageSources: [...reel.querySelectorAll('.chest-cell:not(.chest-cell-anticipation) .chest-icon-img')]
          .map((image) => image.getAttribute('src')),
        neutralText: cells
          .filter((cell) => cell.classList.contains('chest-cell-anticipation'))
          .map((cell) => cell.textContent.trim()),
        penultimateNeutral: cells.at(-2).classList.contains('chest-cell-anticipation'),
        token: window.__chestPrizeNode.dataset.identityToken,
        cardTier: document.querySelector('#chest-card').classList.contains(tier),
      };
    }, { tier, finalMod });

    assert.equal(before.ids.length, 19);
    assert.equal(before.ids.at(-1), finalMod);
    assert.equal(before.cardTier, true, `${finalMod} must render with its ${tier} rarity shell`);
    const itemIds = before.ids.filter(Boolean);
    for (let index = 1; index < itemIds.length; index++) {
      assert.notEqual(itemIds[index], itemIds[index - 1], `${tier} browser item adjacency at ${index}`);
    }
    if (tier === 'gold') {
      assert.deepEqual(before.ids.slice(0, -1), Array(18).fill(null));
      assert.equal(before.neutralCount, 18);
      assert.equal(before.neutralImageCount, 0);
      assert.equal(before.neutralLockCount, 0);
      assert.equal(before.neutralMarkCount, 18);
      assert.deepEqual(before.neutralTiers, Array(18).fill('gold'));
      assert.deepEqual([...new Set(before.neutralBurstColors)], ['rgb(242, 182, 50)']);
      assert.deepEqual(before.neutralText, Array(18).fill(''));
      assert.equal(before.penultimateNeutral, true);
      assert.deepEqual(before.itemImageSources, ['assets/2d/icon-mod-magnetron-heart.png']);
    } else {
      assert.equal(before.neutralCount, 0);
      assert.ok(before.ids.every(Boolean));
    }

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
        rewardLabel: document.querySelector('#chest-label')?.textContent,
        promotedSrc: promoted?.getAttribute('src'),
      };
    });
    const { rewardLabel, promotedSrc, ...landedState } = landed;
    if (tier === 'gold') {
      assert.equal(rewardLabel, 'Magnetron Heart');
      assert.equal(promotedSrc, 'assets/2d/icon-mod-magnetron-heart.png');
    }
    assert.deepEqual(landedState, {
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
