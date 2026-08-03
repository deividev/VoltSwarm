// Verification: boots the real game and spawns many chests at high luck (which
// biases rollRarity toward high tiers), tallying the resulting chest tiers.
// With the resolveChestTier cap and the current unlock list, NO chest should
// resolve to 'gold' (no gold mod unlocked) — gold rolls cap down to purple.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { confirmOnlyVisibleCharacterIfPresent } from './character-flow.mjs';

const PORT = 5197;
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
  const browser = await puppeteer.launch({ executablePath: chromePath, headless: 'new', args: ['--use-gl=angle'] });
  const page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector('#play-button', { visible: true, timeout: 15000 });
  await page.click('#play-button');
  await confirmOnlyVisibleCharacterIfPresent(page);
  await page.waitForSelector('#draft-cards > *', { visible: true, timeout: 15000 });
  await page.click('#draft-cards > *');
  await new Promise((r) => setTimeout(r, 1500));

  const result = await page.evaluate(() => {
    const ps = window.__voltswarm.pickups;
    const tally = {};
    for (let n = 0; n < 400; n++) {
      ps.spawnAt(0, 0, 0.10, []); // 10% Luck rating → many gold rolls pre-cap
      const slot = ps.slots.find((s) => s.active);
      if (slot) {
        tally[slot.tier] = (tally[slot.tier] || 0) + 1;
        slot.active = false;
        slot.group.visible = false;
      }
    }
    return tally;
  });

  await browser.close();
  console.log('Chest tier tally over 400 spawns at 10% Luck rating:', JSON.stringify(result));
  console.log(result.gold ? 'FAIL: gold chests still appear' : 'PASS: no gold chests (capped to a populated tier)');
} catch (err) {
  console.error('Verify failed:', err.message);
  process.exitCode = 1;
} finally {
  vite.kill();
  process.exit(process.exitCode ?? 0);
}
