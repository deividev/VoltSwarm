import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const PORT = 5206;
const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const executablePath = CHROME_PATHS.find((path) => existsSync(path));
assert.ok(executablePath, 'Chrome or Edge is required for Contracts browser testing');
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
let browser;
const pageErrors = [];

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`http://localhost:${PORT}/`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Vite dev server did not start');
}

try {
  await waitForServer();
  browser = await puppeteer.launch({ executablePath, headless: 'new' });
  const page = await browser.newPage();
  page.setDefaultTimeout(25_000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#contracts-button');

  const measure = async (width, height) => {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.click('#contracts-button');
    await page.waitForSelector('#contracts-overlay:not(.hidden) .contract-row');
    const result = await page.evaluate(() => {
      const panel = document.querySelector('#contracts-panel');
      const browser = document.querySelector('#contracts-browser');
      const detail = document.querySelector('#contract-detail');
      const selected = document.querySelector('.contract-row[aria-current="true"]');
      const summary = document.querySelector('#contracts-summary');
      const parts = ['.contract-detail-hero', '.contract-detail-objective', '.contract-detail-progress', '.contract-detail-reward'];
      const panelRect = panel.getBoundingClientRect();
      const browserRect = browser.getBoundingClientRect();
      const detailRect = detail.getBoundingClientRect();
      return {
        panelWidth: panelRect.width,
        browserWidth: browserRect.width,
        browserWidthRatio: browserRect.width / (panelRect.width - 44),
        horizontalRange: browser.scrollWidth - browser.clientWidth,
        detailRange: detail.scrollHeight - detail.clientHeight,
        detailPartsVisible: parts.every((selector) => {
          const rect = detail.querySelector(selector)?.getBoundingClientRect();
          return rect && rect.top >= detailRect.top && rect.bottom <= detailRect.bottom;
        }),
        rowHeight: selected.getBoundingClientRect().height,
        summaryVisibleSize: [summary.getBoundingClientRect().width, summary.getBoundingClientRect().height],
        completedDisabled: document.querySelector('[data-contract-status="completed"]').disabled,
        activeFocused: document.activeElement?.matches('[data-contract-status="active"]') ?? false,
        categoryCountSize: Number.parseFloat(getComputedStyle(document.querySelector('.contracts-filter-count')).fontSize),
        selectedId: selected.dataset.contractId,
        lastCategory: document.querySelector('.contracts-category-tab:last-child')?.textContent?.trim(),
      };
    });
    assert.ok(result.browserWidthRatio > 0.97, `Contracts browser should fill shell at ${width}x${height}`);
    assert.equal(result.horizontalRange, 0);
    assert.ok(result.detailRange <= 0, `detail overflow at ${width}x${height}: ${result.detailRange}px`);
    assert.equal(result.detailPartsVisible, true);
    assert.ok(result.rowHeight >= 60 && result.rowHeight <= 64);
    assert.deepEqual(result.summaryVisibleSize, [1, 1]);
    assert.equal(result.completedDisabled, true);
    assert.equal(result.activeFocused, true);
    assert.ok(result.categoryCountSize >= 8);
    assert.ok(result.lastCategory?.startsWith('Perks'));

    const all = '[data-contract-category="all"]';
    await page.click(all);
    assert.equal(await page.evaluate((selector) => document.activeElement?.matches(selector), all), true);
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate((selector) => document.activeElement?.matches(selector), all), true);
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate((selector) => document.activeElement?.matches(selector), all), true);

    const readContractState = () => page.evaluate(() => ({
      selectedId: document.querySelector('.contract-row[aria-current="true"]')?.dataset.contractId,
      focusedId: document.activeElement?.matches('.contract-row') ? document.activeElement.dataset.contractId : undefined,
      detailTitle: document.querySelector('.contract-detail-title')?.textContent,
    }));
    await page.evaluate(() => document.querySelector('.contract-row[aria-current="true"]')?.focus());
    const beforeNavigation = await readContractState();
    await page.keyboard.press('ArrowDown');
    const afterArrowDown = await readContractState();
    assert.equal(afterArrowDown.selectedId, beforeNavigation.selectedId);
    assert.equal(afterArrowDown.detailTitle, beforeNavigation.detailTitle);
    assert.notEqual(afterArrowDown.focusedId, beforeNavigation.selectedId);

    await page.keyboard.press('ArrowUp');
    assert.deepEqual(await readContractState(), beforeNavigation);

    await page.keyboard.press('ArrowDown');
    const focusedBeforeActivation = (await readContractState()).focusedId;
    await page.keyboard.press('Enter');
    const afterActivation = await readContractState();
    assert.equal(afterActivation.selectedId, focusedBeforeActivation);
    assert.equal(afterActivation.focusedId, focusedBeforeActivation);
    assert.notEqual(afterActivation.detailTitle, beforeNavigation.detailTitle);

    await page.click('#contracts-back-button');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'contracts-button');
    return result;
  };

  const desktop = await measure(1280, 720);
  const compact = await measure(1024, 600);
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ desktop, compact }));
} finally {
  await browser?.close();
  vite.kill();
}
