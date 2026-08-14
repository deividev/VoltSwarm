// One-off: verifies the level-up discard flow — click Discard, run resumes,
// counter decrements, and at 0 the button no longer shows.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { confirmOnlyVisibleCharacterIfPresent, enterMainMenu } from './character-flow.mjs';

const PORT = 5199;
const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
];
const chromePath = CHROME_PATHS.find((p) => existsSync(p));
const vite = spawn('npx.cmd', ['vite', '--port', String(PORT), '--strictPort'], {
  stdio: 'pipe',
  shell: true,
  cwd: 'C:\\Users\\david\\Desktop\\Agent Games Web\\Megabonk_3d',
});

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('no server');
}

try {
  await waitForServer();
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--window-size=1600,900', '--use-gl=angle'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  await page.goto(`http://localhost:${PORT}/`);
  await enterMainMenu(page);
  await page.waitForSelector('#play-button', { visible: true, timeout: 15000 });
  await page.click('#play-button');
  await confirmOnlyVisibleCharacterIfPresent(page);
  await page.waitForSelector('#draft-cards > *', { visible: true, timeout: 15000 });
  await page.click('#draft-cards > *');
  await new Promise((r) => setTimeout(r, 2000));

  const labels = [];
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => {
      const g = window.__voltswarm;
      g.pendingLevelUps += g.progression.grantXp(g.progression.xpToNext + 1);
    });
    await page.waitForSelector('#levelup-overlay:not(.hidden)', { timeout: 10000 });
    const state = await page.evaluate(() => {
      const btn = document.getElementById('levelup-discard');
      return { hidden: btn.classList.contains('hidden'), text: btn.textContent };
    });
    labels.push(state.hidden ? 'HIDDEN' : state.text);
    if (state.hidden) {
      // Must pick a card instead.
      await page.click('#upgrade-cards > *');
    } else {
      await page.click('#levelup-discard');
    }
    await new Promise((r) => setTimeout(r, 400));
    const playing = await page.evaluate(() => window.__voltswarm.state === 'playing');
    if (!playing) throw new Error(`run did not resume after round ${i}`);
  }
  console.log('Rounds:', labels.join(' | '));
  const ok =
    labels[0] === 'Discard (3 left)' &&
    labels[1] === 'Discard (2 left)' &&
    labels[2] === 'Discard (1 left)' &&
    labels[3] === 'HIDDEN';
  console.log(ok ? 'DISCARD FLOW OK' : 'DISCARD FLOW WRONG');
  await browser.close();
  process.exitCode = ok ? 0 : 1;
} catch (err) {
  console.error('FAILED:', err.message);
  process.exitCode = 1;
} finally {
  vite.kill();
  process.exit(process.exitCode ?? 0);
}
