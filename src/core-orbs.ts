import { TIER_COLORS } from './mods';
import type { Rarity } from './upgrades';

// Runtime core-orb compositor (2026-07-10): every core icon is shown INSIDE
// the orb shell, with the shell's glass tinted to the card's tier. One shell
// asset (orb-shell-gray-v1.png) serves all tiers — the tint is programmatic
// (mirrors tools/compose-core-orbs.mjs, which won the 32/44/96px gate).
// Composites are cached as data-URLs; callers fall back to the bare icon
// until the warm-up finishes (first level-up is minutes away anyway).

const SHELL_URL = 'assets/2d/orb-shell-gray-v1.png';
/** Composite resolution — 2x the 96px card icon so it stays crisp. */
const SIZE = 192;
/** Icon size inside the shell window (fraction of the shell). */
const ICON_SCALE = 0.62;
/** Vertical center of the shell's circular WINDOW as a fraction of the
 *  image: the cradle mount pushes the ring up, so the optical center sits
 *  above the geometric one (2026-07-10 user note: icon looked low). */
const WINDOW_CENTER_Y = 0.46;
/** Glass pixels above this luminance take the tier tint; the dark cradle
 *  below it keeps its gunmetal. */
const TINT_LUMINANCE = 0.35;

const cache = new Map<string, string>();

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

function tintShell(shell: HTMLImageElement, tier: Rarity): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.drawImage(shell, 0, 0, SIZE, SIZE);
  if (tier === 'gray') return canvas; // native gray glass

  const color = TIER_COLORS[tier];
  const tr = (color >> 16) & 0xff;
  const tg = (color >> 8) & 0xff;
  const tb = color & 0xff;
  const imageData = ctx.getImageData(0, 0, SIZE, SIZE);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    if ((d[i + 3] ?? 0) < 8) continue;
    const lum = ((d[i] ?? 0) * 0.299 + (d[i + 1] ?? 0) * 0.587 + (d[i + 2] ?? 0) * 0.114) / 255;
    if (lum > TINT_LUMINANCE) {
      d[i] = Math.round(tr * lum);
      d[i + 1] = Math.round(tg * lum);
      d[i + 2] = Math.round(tb * lum);
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Builds every icon×tier composite once; safe to call fire-and-forget. */
export async function warmCoreOrbs(
  iconUrls: Record<string, string | undefined>,
): Promise<void> {
  try {
    const shell = await loadImage(SHELL_URL);
    const tiers: Rarity[] = ['gray', 'green', 'blue', 'purple', 'gold'];
    const shells = new Map(tiers.map((tier) => [tier, tintShell(shell, tier)]));

    for (const [key, url] of Object.entries(iconUrls)) {
      if (!url) continue;
      const icon = await loadImage(url);
      for (const tier of tiers) {
        const canvas = document.createElement('canvas');
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        const iconSize = SIZE * ICON_SCALE;
        ctx.drawImage(
          icon,
          (SIZE - iconSize) / 2,
          SIZE * WINDOW_CENTER_Y - iconSize / 2,
          iconSize,
          iconSize,
        );
        const tintedShell = shells.get(tier);
        if (tintedShell) ctx.drawImage(tintedShell, 0, 0);
        cache.set(`${key}|${tier}`, canvas.toDataURL('image/png'));
      }
    }
  } catch (error) {
    console.warn('Core orb composites unavailable, falling back to bare icons:', error);
  }
}

/** Cached composite for a stat key + tier, or null while warming up. */
export function coreOrbIcon(statKey: string, tier: Rarity): string | null {
  return cache.get(`${statKey}|${tier}`) ?? null;
}
