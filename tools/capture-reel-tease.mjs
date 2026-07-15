// Verification: opens a BLUE chest reel (teases the contract-locked Chain Relay
// + Overload Trigger) and parks a locked cell in the window so the padlock badge
// is visible in the screenshot.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const PORT = 5196;
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
].find((p) => existsSync(p));

const vite = spawn('npx.cmd', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', shell: true });
async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://localhost:${PORT}/`); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite did not start');
}

try {
  await waitForServer();
  const browser = await puppeteer.launch({ executablePath: chromePath, headless: 'new', args: ['--window-size=1920,1080', '--use-gl=angle'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector('#play-button', { visible: true, timeout: 15000 });
  await page.click('#play-button');
  await page.waitForSelector('#draft-cards > *', { visible: true, timeout: 15000 });
  await page.click('#draft-cards > *');
  await new Promise((r) => setTimeout(r, 1500));

  const info = await page.evaluate(() => {
    const g = window.__voltswarm;
    g.hud.showChestSpin('piston-stompers', 'blue', () => {}, () => {});
    const reel = document.getElementById('chest-reel');
    const slot = document.getElementById('chest-slot');
    const cells = [...reel.children];
    const lockedIdx = cells.findIndex((c) => c.classList.contains('locked'));
    const cellH = slot.clientHeight;
    // Park a locked cell centered in the window (kill the spin transition).
    reel.style.transition = 'none';
    reel.style.transform = `translateY(${-lockedIdx * cellH}px)`;
    const lockedCount = cells.filter((c) => c.classList.contains('locked')).length;
    return { lockedIdx, lockedCount, total: cells.length };
  });
  await new Promise((r) => setTimeout(r, 250));
  await page.screenshot({ path: 'assets/preview/reel-tease-blue.png' });

  await browser.close();
  console.log('reel info:', JSON.stringify(info));
  console.log('Saved assets/preview/reel-tease-blue.png');
} catch (err) {
  console.error('Capture failed:', err.message);
  process.exitCode = 1;
} finally {
  vite.kill();
  process.exit(process.exitCode ?? 0);
}
