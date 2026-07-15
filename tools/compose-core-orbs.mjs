// Composes core-orb icons: a stat icon centered inside the orb shell frame
// (docs/PROMPTS_IMAGENES.md §5 — the shell IS the tier ornament; its gray rim
// gets hue-shifted per tier here, so ONE shell asset serves all five tiers).
// Usage:
//   node tools/compose-core-orbs.mjs <icon.png> <out.png> [tier]
//   tier: gray|green|blue|purple|gold (default gray = shell as-is)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

/** file → data URL (keeps the canvas untainted: no file:// origins). */
const toDataUrl = (path) => `data:image/png;base64,${readFileSync(path).toString('base64')}`;

const ICON = process.argv[2];
const OUT = process.argv[3];
const TIER = process.argv[4] ?? 'gray';
const SHELL = 'public/assets/2d/orb-shell-gray-v1.png';
// Must match TIER_COLORS in src/mods.ts.
const TIER_RGB = {
  gray: null, // shell's native gray glass
  green: [0x5f, 0xd0, 0x68],
  blue: [0x3f, 0xa9, 0xf5],
  purple: [0xb0, 0x69, 0xff],
  gold: [0xf2, 0xb6, 0x32],
};
/** Fraction of the shell size the icon occupies (the window is ~70%). */
const ICON_SCALE = 0.62;
/** Vertical center of the circular window (the cradle pushes the ring up). */
const WINDOW_CENTER_Y = 0.46;

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
];
const chromePath = CHROME_PATHS.find((p) => existsSync(p));
const browser = await puppeteer.launch({ executablePath: chromePath, headless: 'new' });
const page = await browser.newPage();
const dataUrl = await page.evaluate(
  async (shellUrl, iconUrl, tint, iconScale) => {
    const shell = new Image();
    shell.src = shellUrl;
    await shell.decode();
    const icon = new Image();
    icon.src = iconUrl;
    await icon.decode();

    const size = shell.naturalWidth;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Icon first, centered inside the circular window (not the image).
    const iconSize = size * iconScale;
    ctx.drawImage(icon, (size - iconSize) / 2, size * 0.46 - iconSize / 2, iconSize, iconSize);

    // Shell on top. For colored tiers, tint the shell's glass toward the
    // tier color while keeping luminance (the dark cradle stays dark).
    if (!tint) {
      ctx.drawImage(shell, 0, 0, size, size);
    } else {
      const off = document.createElement('canvas');
      off.width = size;
      off.height = size;
      const octx = off.getContext('2d');
      octx.drawImage(shell, 0, 0, size, size);
      const id = octx.getImageData(0, 0, size, size);
      const d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 8) continue;
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
        // Only recolor the light glass (the dark cradle keeps its gunmetal).
        if (lum > 0.35) {
          d[i] = Math.round(tint[0] * lum);
          d[i + 1] = Math.round(tint[1] * lum);
          d[i + 2] = Math.round(tint[2] * lum);
        }
      }
      octx.putImageData(id, 0, 0);
      ctx.drawImage(off, 0, 0);
    }
    return canvas.toDataURL('image/png');
  },
  toDataUrl(SHELL),
  toDataUrl(ICON),
  TIER_RGB[TIER] ?? null,
  ICON_SCALE,
);
await browser.close();
writeFileSync(OUT, Buffer.from(dataUrl.split(',')[1], 'base64'));
console.log(`composed [${TIER}] →`, OUT);
