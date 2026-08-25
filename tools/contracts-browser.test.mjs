import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { enterMainMenu } from './character-flow.mjs';

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
  await enterMainMenu(page);
  await page.waitForSelector('#contracts-button');

  const measureSettings = async (width, height) => {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.click('#menu-settings-button');
    await page.waitForSelector('#settings-overlay:not(.hidden) #settings-frame');
    const result = await page.evaluate(() => {
      const panel = document.querySelector('#settings-panel');
      const frame = document.querySelector('#settings-frame');
      const content = document.querySelector('#settings-content');
      const header = panel.querySelector('.panel-header');
      const sidebar = document.querySelector('#settings-sidebar');
      const footer = document.querySelector('#settings-footer');
      const tabs = [...sidebar.querySelectorAll('.settings-tab')];
      const rows = [...content.querySelectorAll('.settings-row')];
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const bounds = (element) => {
        const rect = element.getBoundingClientRect();
        return rect.left >= 0 && rect.top >= 0 && rect.right <= viewport.width && rect.bottom <= viewport.height;
      };
      const noHorizontalOverflow = (element) => element.clientWidth === element.scrollWidth;
      return {
        noHorizontalOverflow: [panel, frame, content, ...rows].every(noHorizontalOverflow),
        fixedChromeInViewport: [header, sidebar, footer].every(bounds),
        tabsInViewport: tabs.every(bounds),
        tabPadding: tabs.map((tab) => {
          const style = getComputedStyle(tab);
          return [Number.parseFloat(style.paddingLeft), Number.parseFloat(style.paddingRight)];
        }),
        frameOverflowY: getComputedStyle(frame).overflowY,
        frameRange: frame.scrollHeight - frame.clientHeight,
        panelBounds: bounds(panel),
      };
    });
    assert.equal(result.noHorizontalOverflow, true, `Settings horizontal overflow at ${width}x${height}`);
    assert.equal(result.fixedChromeInViewport, true, `Settings fixed chrome clipped at ${width}x${height}`);
    assert.equal(result.tabsInViewport, true, `Settings tabs clipped at ${width}x${height}`);
    assert.ok(result.tabPadding.every(([left, right]) => left >= 12 && right >= 12), `Settings tabs need lateral breathing room at ${width}x${height}`);
    assert.equal(result.frameOverflowY, 'auto');
    assert.ok(result.frameRange >= 0);
    assert.equal(result.panelBounds, true, `Settings panel clipped at ${width}x${height}`);
    await page.click('#settings-back-button');
    await page.waitForSelector('#menu-overlay:not(.hidden)');
    return result;
  };

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

    const expectedAllOrder = [
      'proving-ground', 'two-of-a-kind',
      'first-blood', 'arsenal-1', 'arsenal-2', 'arsenal-3', 'arsenal-4',
      'scrap-quota-1', 'scrap-quota-2', 'scrap-quota-3', 'scrap-quota-4',
      'veteran-1', 'veteran-2', 'veteran-3', 'veteran-4', 'ascension-1', 'ascension-2',
      'overkill', 'purist', 'foreman', 'endurance-1', 'endurance-2',
      'second-wind', 'boss-hunter', 'full-loadout',
      'untouchable',
    ];
    const contractIds = () => page.evaluate(() =>
      [...document.querySelectorAll('.contract-row')].map((row) => row.dataset.contractId));
    assert.deepEqual(await contractIds(), expectedAllOrder, `All order should be stable at ${width}x${height}`);

    const categoryOrders = {
      character: expectedAllOrder.slice(0, 2),
      weapon: expectedAllOrder.slice(2, 7),
      core: expectedAllOrder.slice(7, 17),
      mod: expectedAllOrder.slice(17, 22),
      socket: expectedAllOrder.slice(22, 25),
      other: expectedAllOrder.slice(25),
    };
    for (const [category, expectedIds] of Object.entries(categoryOrders)) {
      await page.click(`[data-contract-category="${category}"]`);
      assert.deepEqual(await contractIds(), expectedIds, `${category} tab should only show its category`);
    }
    await page.click('[data-contract-category="core"]');
    await page.click('.contract-row[data-contract-id="scrap-quota-2"]');
    await page.click(all);
    assert.equal(await page.evaluate(() =>
      document.querySelector('.contract-row[aria-current="true"]')?.dataset.contractId), 'scrap-quota-2');
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
    assert.equal(afterArrowDown.focusedId, expectedAllOrder[expectedAllOrder.indexOf(beforeNavigation.selectedId) + 1]);

    await page.keyboard.press('ArrowUp');
    assert.deepEqual(await readContractState(), beforeNavigation);

    await page.keyboard.press('ArrowDown');
    const focusedBeforeActivation = (await readContractState()).focusedId;
    await page.keyboard.press('Enter');
    const afterActivation = await readContractState();
    assert.equal(afterActivation.selectedId, focusedBeforeActivation);
    assert.equal(afterActivation.focusedId, focusedBeforeActivation);
    assert.notEqual(afterActivation.detailTitle, beforeNavigation.detailTitle);

    await page.click(all);
    const progressBars = await page.evaluate(() => Object.fromEntries(
      ['second-wind', 'arsenal-2', 'full-loadout', 'untouchable', 'overkill'].map((id) => {
        const row = document.querySelector(`.contract-row[data-contract-id="${id}"]`);
        row?.click();
        const readBar = (bar) => ({
          cellCount: bar?.querySelectorAll('i').length,
          fills: [...(bar?.querySelectorAll('i') ?? [])].map((cell) => Number(cell.dataset.fill)),
          valueNow: bar?.getAttribute('aria-valuenow'),
          valueMax: bar?.getAttribute('aria-valuemax'),
          valueText: bar?.getAttribute('aria-valuetext'),
        });
        return [id, {
          list: readBar(row?.querySelector('.contract-bar')),
          detail: readBar(document.querySelector('.contract-detail-progress .contract-bar')),
        }];
      }),
    ));
    for (const [id, bars] of Object.entries(progressBars)) {
      assert.deepEqual(bars.detail, bars.list, `${id} list/detail progress must share cells, fill, and ARIA`);
    }
    assert.deepEqual(progressBars['second-wind'].list, {
      cellCount: 1, fills: [0], valueNow: '0', valueMax: '1', valueText: '0 / 1',
    });
    assert.equal(progressBars['arsenal-2'].list.cellCount, 2);
    assert.equal(progressBars['full-loadout'].list.cellCount, 12);
    assert.equal(progressBars['untouchable'].list.cellCount, 12);
    assert.deepEqual(progressBars['untouchable'].list.valueText, '0:00 / 5:00');
    assert.equal(progressBars['overkill'].list.cellCount, 12);

    await page.click('[data-contract-category="socket"]');
    const socketDetails = await page.evaluate(() => ['second-wind', 'full-loadout', 'boss-hunter'].map((id) => {
      document.querySelector(`.contract-row[data-contract-id="${id}"]`)?.click();
      const icon = document.querySelector('.contract-detail-icon');
      const iconRect = icon.getBoundingClientRect();
      const pips = [...icon.querySelectorAll('.socket-pips i')];
      return {
        id,
        label: document.querySelector('.contract-detail-reward')?.textContent?.replace(/\s+/g, ' ').trim(),
        highlighted: pips.findIndex((pip) => pip.classList.contains('next')) + 1,
        contained: pips.every((pip) => {
          const rect = pip.getBoundingClientRect();
          return rect.left >= iconRect.left && rect.right <= iconRect.right
            && rect.top >= iconRect.top && rect.bottom <= iconRect.bottom;
        }),
      };
    }));
    assert.deepEqual(socketDetails.map(({ id, highlighted }) => [id, highlighted]), [
      ['second-wind', 3], ['full-loadout', 4], ['boss-hunter', 3],
    ]);
    assert.ok(socketDetails.every(({ contained }) => contained), `detail socket pips escape their frame at ${width}x${height}`);
    assert.match(socketDetails.find(({ id }) => id === 'second-wind').label, /Core slot 3/);
    assert.match(socketDetails.find(({ id }) => id === 'full-loadout').label, /Core slot 4/);

    await page.click('#contracts-back-button');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'contracts-button');
    return result;
  };

  const desktop = await measure(1280, 720);
  const compact = await measure(1024, 600);
  await page.evaluate(() => {
    const profile = JSON.parse(window.localStorage.getItem('voltswarm:profile') ?? '{"version":4}');
    profile.lifetime = { ...(profile.lifetime ?? {}), bestLevel: 24 };
    window.localStorage.setItem('voltswarm:profile', JSON.stringify(profile));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await enterMainMenu(page);
  await page.waitForSelector('#contracts-button');
  await page.click('#contracts-button');
  await page.waitForSelector('#contracts-overlay:not(.hidden) .contract-row');
  const highProgressAll = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.contract-row')];
    const selected = document.querySelector('.contract-row[aria-current="true"]');
    return {
      selectedId: selected?.dataset.contractId,
      selectedIndex: rows.indexOf(selected),
      firstWeaponIndex: rows.findIndex((row) => row.dataset.contractId === 'first-blood'),
      selectedDomId: rows[rows.indexOf(selected)]?.dataset.contractId,
      list: (() => {
        const bar = selected?.querySelector('.contract-bar');
        return {
          fills: [...(bar?.querySelectorAll('i') ?? [])].map((cell) => Number(cell.dataset.fill)),
          valueNow: bar?.getAttribute('aria-valuenow'),
          valueMax: bar?.getAttribute('aria-valuemax'),
          valueText: bar?.getAttribute('aria-valuetext'),
        };
      })(),
      detail: (() => {
        const bar = document.querySelector('.contract-detail-progress .contract-bar');
        return {
          fills: [...(bar?.querySelectorAll('i') ?? [])].map((cell) => Number(cell.dataset.fill)),
          valueNow: bar?.getAttribute('aria-valuenow'),
          valueMax: bar?.getAttribute('aria-valuemax'),
          valueText: bar?.getAttribute('aria-valuetext'),
        };
      })(),
    };
  });
  assert.equal(highProgressAll.selectedId, 'full-loadout');
  assert.equal(highProgressAll.selectedDomId, 'full-loadout');
  assert.ok(highProgressAll.selectedIndex > highProgressAll.firstWeaponIndex,
    'highest-progress fallback must not move its Core row ahead of the Weapons group');
  assert.deepEqual(highProgressAll.detail, highProgressAll.list);
  assert.deepEqual(highProgressAll.list, {
    fills: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.52],
    valueNow: '24', valueMax: '25', valueText: '24 / 25',
  });
  await page.click('#contracts-back-button');
  await page.evaluate(() => {
    const profile = JSON.parse(window.localStorage.getItem('voltswarm:profile') ?? '{"version":4}');
    profile.lifetime = { ...(profile.lifetime ?? {}), runsCompleted: 1 };
    window.localStorage.setItem('voltswarm:profile', JSON.stringify(profile));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await enterMainMenu(page);
  await page.waitForSelector('#contracts-button');
  await page.click('#contracts-button');
  await page.click('[data-contract-status="completed"]');
  await page.click('.contract-row[data-contract-id="second-wind"]');
  const completedSingle = await page.evaluate(() => {
    const rowBar = document.querySelector('.contract-row[data-contract-id="second-wind"] .contract-bar');
    const detailBar = document.querySelector('.contract-detail-progress .contract-bar');
    const read = (bar) => ({
      cellCount: bar?.querySelectorAll('i').length,
      fills: [...(bar?.querySelectorAll('i') ?? [])].map((cell) => Number(cell.dataset.fill)),
      valueNow: bar?.getAttribute('aria-valuenow'),
      valueMax: bar?.getAttribute('aria-valuemax'),
      valueText: bar?.getAttribute('aria-valuetext'),
    });
    return { list: read(rowBar), detail: read(detailBar) };
  });
  assert.deepEqual(completedSingle.detail, completedSingle.list);
  assert.deepEqual(completedSingle.list, {
    cellCount: 1, fills: [1], valueNow: '1', valueMax: '1', valueText: '1 / 1',
  });
  await page.click('#contracts-back-button');
  const settings = [];
  for (const viewport of [[1024, 600], [900, 600], [560, 600], [520, 400]]) {
    settings.push(await measureSettings(...viewport));
  }
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ desktop, compact, settings }));
} finally {
  await browser?.close();
  vite.kill();
}
