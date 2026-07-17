# tools/ — Automation & Asset Pipeline Catalog

Catalog of every script in this directory, written so a future project (the reusable
boilerplate/core extracted from Voltswarm) can adopt these tools without re-discovering
how they work. Last audited: 2026-07-15.

Reusability legend:

- 🟢 **generic** — drop-in reusable in any project, no changes needed
- 🟡 **adaptable** — the pattern/engine is reusable; swap paths, ports, DOM ids, or dev hooks
- 🔴 **project-specific** — tied to Voltswarm internals (dev hooks, catalog ids, art assets)

---

## Shared conventions (read once — every tool follows these)

- **Dev-server pattern**: game-interaction tools spawn Vite themselves —
  `spawn('npx.cmd', ['vite', '--port', PORT, '--strictPort'], { stdio: 'pipe', shell: true })`,
  poll `http://localhost:PORT/` up to 60×500ms, run the browser, then `vite.kill()` in `finally`.
  Ports vary per tool (5196–5204) so several can run concurrently.
- **Browser**: all browser tools use `puppeteer-core` (no bundled Chromium) and probe
  hardcoded Windows paths for Chrome (Program Files x64/x86, `%LOCALAPPDATA%`), with an
  Edge fallback in some. Launch is `headless: 'new'`, usually with `--use-gl=angle`
  (required for headless WebGL).
- **Game boot sequence**: goto page → `waitForSelector('#play-button')` → click →
  `waitForSelector('#draft-cards > *')` → click a card → act.
- **Dev hook**: the running game exposes `window.__voltswarm` with mutable internals used
  by every capture/verify tool: `.gold`, `.openChest()`, `.enemies.spawnAt()`, `.player`,
  `.progression.grantXp()`, `.pendingLevelUps`, `.modCounts`, `.weaponLevels`,
  `.coreLevels`, `.merchant.arrive()`, `.openShop()`, `.hud`, `.boss.totemTarget()`,
  `.input.isActionDown`, `.state`, `.pickups`, `.stats`. **A future core should expose an
  equivalent hook from day one — it is what makes all of this automation possible.**
- **Image processing without npm deps**: image utilities load a blank page in headless
  Chrome and do all pixel work with an in-page `<canvas>` (`getImageData`). Zero
  sharp/jimp dependencies. Images are passed as data URLs to avoid `file://` canvas
  tainting.
- **Output directories**: `assets/preview/` (review screenshots/GIFs), `art/steam/`
  (store art), `build/` (app icons), `tmp/imagegen/` (intermediates),
  `public/assets/2d/` (in-game 2D sources).
- **Verify scripts**: no test framework — `verify-*.mjs` are ad-hoc regression scripts
  that log PASS/FAIL and set `process.exitCode`.
- **npm scripts**: only `write-electron-cjs-package.cjs` is wired into `package.json`
  (via `electron:build`). Everything else runs ad hoc: `node tools/<file>.mjs [args]`.

---

## 🟢 Generic — extract as-is into the boilerplate

### make-app-icon.mjs

Builds a multi-size Windows `.ico` (16–256px) plus `build/icon.png` from one source PNG.
Resizes via headless-Chrome canvas and hand-packs a PNG-compressed ICO container — no
image library needed.

- Run: `node tools/make-app-icon.mjs [source.png]` (default `public/assets/2d/app-icon-test.png`)
- Output: `build/icon.ico`, `build/icon.png`
- Deps: `puppeteer-core` only

### remove-background.mjs

Removes a flat solid-color background via color-distance chroma keying. Auto-detects the
key color from the top-left pixel (or force it), with a soft-edge alpha falloff band.

- Run: `node tools/remove-background.mjs <input.png> <output.png> [--tolerance=30] [--color=0xRRGGBB]`

### remove-green.mjs

Better green-screen keyer than `remove-background.mjs`: keys by green-channel dominance
over `max(r,b)` and de-spills the green fringe on semi-transparent edge pixels — avoids
the green-ring artifact of plain color-distance keying. Use this for any asset rendered
over green (AI renders, 3D exports).

- Run: `node tools/remove-green.mjs <input.png> <output.png> [--lo=30] [--hi=95]`

### check-alpha.mjs

QA check after background removal: verifies a PNG has real (non-fully-opaque) alpha and
prints transparency stats `{ total, transparent, opaque, transparentPct }`.

- Run: `node tools/check-alpha.mjs <file.png>`

### clip-gif.mjs

Cuts a high-quality GIF from a time range of an MP4 using ffmpeg's 2-pass palette
pipeline (palettegen + paletteuse, sierra2_4a dithering). Creates and deletes a temp
palette PNG.

- Run: `node tools/clip-gif.mjs <input.mp4> <startSec> <endSec> <out.gif> [width=640] [fps=15]`
- Deps: **`ffmpeg` on PATH** (installed via scoop on this machine; not an npm dep)

### write-electron-cjs-package.cjs

Writes `{"type": "commonjs"}` into `electron/dist/package.json` so the compiled Electron
main process is treated as CJS while the root project stays ESM. The standard "dual
package.json boundary" trick — needed in ANY TS+Electron+ESM project.

- Run: automatic via `npm run electron:build` (chained after `tsc -p tsconfig.electron.json`)
- Deps: Node builtins only. It is `.cjs` on purpose (root is `"type": "module"`).

---

## 🟡 Adaptable — reusable engines/patterns, swap the project-specific bits

### capture-ingame.mjs

The workhorse gameplay-screenshot harness: boots the game, optionally drafts a specific
weapon by name (reloading until it's offered), lets the run play for N seconds while
auto-dismissing level-up overlays, then screenshots and reports FPS + enemy count.

- Run: `node tools/capture-ingame.mjs [secondsIntoRun=25] [output.png=assets/preview/ingame.png] [weaponId] [width] [height]`
- Env: `CAPTURE_WIDTH` / `CAPTURE_HEIGHT` (default 1920×1080). Port 5198.
- Adapt: draft selectors (`#levelup-overlay`, `#upgrade-cards`), `enemies.activeCount` hook.

### capture-gif.mjs

Records an in-game moment as a captioned animated GIF with a **fully self-contained
pure-JS GIF pipeline**: its own PNG decoder (via `zlib`), median-cut palette quantizer,
and LZW/GIF89a encoder — no ffmpeg, no image libraries. The encoder half is a generic
asset worth extracting on its own; the scene-setup half (boss summon forcing) is
project-specific.

- Run: `node tools/capture-gif.mjs [out.gif] [frames=42] [delayCs=9] [W=560] [H=360]`
- Output default: `art/steam/gif/boss-summon.gif`. Port 5199.

### capture-model-preview.mjs

Screenshots a Three.js model-viewer page (`model-preview.html?model=<id>&angle=<deg>`,
served by Vite) at one or more orbit angles. Waits for `window.__previewReady === true`.
The multi-angle loop + ready-flag pattern generalizes to any model viewer.

- Run: `node tools/capture-model-preview.mjs <model> [output.png] [angles]`
  (angles = comma-separated degrees, e.g. `0,90,180`; multi-angle writes `<name>-<angle>.png`)
- Port 5199.

### capture-modvfx.mjs

Grants a mod via dev hook, then polls an **arbitrary caller-supplied JS trigger
expression** (evaluated against the game object as `g`) until true, and screenshots
shortly after. The "grant flag → poll expression → shoot" harness is a great generic
pattern for capturing transient VFX.

- Run: `node tools/capture-modvfx.mjs <mod-id> <trigger-expr> [outfile] [delayMs=120] [setupExpr]`
- Output default: `assets/preview/modvfx-<mod-id>.png`. Port 5199.

### verify-menu-gamepad.mjs

Regression harness for menu gamepad navigation. Injects **mocked Gamepads** (standard
XInput and non-standard DirectInput with HAT-switch d-pad) by overriding
`navigator.getGamepads` via `evaluateOnNewDocument`, exposing
`window.__mockGamepad.button(i, pressed)` / `.axis(i, value)` helpers, then verifies
d-pad focus movement and press activation on the real menu. The gamepad-mocking
technique is reusable in any web game with Gamepad API input.

- Run: `node tools/verify-menu-gamepad.mjs` (port 5204; prints PASS per gamepad type)
- Adapt: menu DOM ids (`#menu-overlay`, `.pad-focus`, `#unlocks-overlay`), button indices.

### capture-capsule.mjs / capture-frames.mjs / capture-lockup.mjs

Static-HTML screenshot trio: load a local preview HTML via `file://` (no dev server) and
screenshot a fixed-size element (or iterate style variants via query param, in
`capture-frames.mjs` — `?style=brackets|outline|hazard|rivet|underline|spotlight`).
The "compose art in HTML/CSS, screenshot the element" pattern is the reusable part.

- Run: `node tools/capture-capsule.mjs [out.png]` · `node tools/capture-frames.mjs` ·
  `node tools/capture-lockup.mjs`
- Companions: `capsule-preview.html`, `capsule-frames.html`, `lockup-preview.html` (below).

---

## 🔴 Project-specific — tied to Voltswarm; keep as reference examples

These depend on Voltswarm's dev-hook shape, catalog ids, or art assets. In the
boilerplate, keep them as EXAMPLES of how to script the dev hook, not as runnable tools.

| Tool | What it does | Key dependencies |
| --- | --- | --- |
| `capture-chest.mjs` | Force-opens a paid chest, shoots mid-spin + landed reel, verifies Continue resumes. Port 5199 → `assets/preview/chest-{spinning,landed}.png` | `__voltswarm.openChest()`, `.gold`, `#chest-overlay/#chest-continue` |
| `capture-elites.mjs` | Force-spawns 1 elite of each of 4 enemy families near the player (skips the 4-min in-game roll). `node tools/capture-elites.mjs [out.png]`, port 5198 | `enemies.spawnAt(type,x,z,count,elite)` |
| `capture-levelup.mjs` | Shoots in-run build panel + level-up stat sheet (forced via `grantXp(200)`). Port 5199 → `assets/preview/hud-{inrun,levelup}.png` | `progression.grantXp`, `#levelup-overlay` |
| `capture-reel-tease.mjs` | Parks a locked reel cell centered in the chest window (kills spin CSS) so the padlock badge is visible. Port 5196 → `assets/preview/reel-tease-blue.png` | `hud.showChestSpin()`, `#chest-reel`, `.locked` |
| `capture-shop.mjs` | Seeds and shoots the scrapper shop (3-card and 4-card perk variants) + populated inventory panel. Port 5198 → `assets/preview/{shop-3cards,shop-4cards,inventory-inrun}.png` | `merchant.arrive()`, `openShop()`, hardcoded mod ids |
| `verify-chest-tiers.mjs` | Regression: at high Luck with no gold mod unlocked, tier rolls must never resolve to `gold` (400-pickup tally). Port 5197 | `pickups.spawnAt`, `.pickups.slots` |
| `verify-discard.mjs` | Regression: level-up Discard counter 3→2→1→hidden with run resuming each round. Port 5199. ⚠️ Hardcodes the absolute repo path as `cwd` for Vite — breaks if the repo moves. | `pendingLevelUps`, `#levelup-discard` |
| `compose-core-orbs.mjs` | Composites a stat icon into the shared orb-shell frame and hue-shifts the rim per tier (`gray\|green\|blue\|purple\|gold`). `node tools/compose-core-orbs.mjs <icon> <out> [tier]` — TIER_RGB **must match `TIER_COLORS` in `src/mods.ts`** | `public/assets/2d/orb-shell-gray-v1.png` |
| `extract-ref.mjs` | One-off: chroma/luma-keys the mascot head + wordmark out of `tmp/imagegen/capsule-ref.png` with hardcoded crop boxes. The two keying algorithms (luma-band, warm-vs-bright) are the adaptable part | fixed crops/thresholds |
| `capsule-preview.html` | Final Steam Main Capsule composition (1232×706): bg + blurred "quieted zone" + vignette + mascot/wordmark glow. Screenshot via `capture-capsule.mjs` | `tmp/imagegen/capsule-bg-v2.png`, `art/steam/logo*.png` |
| `capsule-frames.html` | 6 frame-style variants around the capsule lockup, switched via `?style=`. Screenshot via `capture-frames.mjs` | same art assets |
| `lockup-preview.html` | Icon + logo lockup composition. Screenshot via `capture-lockup.mjs` | project logos |

---

## Porting checklist for the future boilerplate/core

1. **Expose a dev hook** (`window.__yourgame`) from the game entry point in dev builds —
   spawn/give/open/state accessors. Every capture and verify tool hangs off this.
2. **Copy the 🟢 generic tools verbatim**: `make-app-icon`, `remove-background`,
   `remove-green`, `check-alpha`, `clip-gif`, `write-electron-cjs-package`.
3. **Extract shared helpers into a `tools/lib/`** (this repo never did — each script
   duplicates them): Vite spawn/poll/kill, Chrome/Edge path probing, the game boot
   sequence, and the pure-JS GIF encoder from `capture-gif.mjs`.
4. **Never hardcode absolute paths** (see the `verify-discard.mjs` ⚠️) — use
   `process.cwd()` / `import.meta.url`-relative paths.
5. **Keep one port per tool** (or make it a CLI flag) so tools can run concurrently.
6. **Reserve the output directory convention**: `assets/preview/` for review captures,
   `art/` for marketing, `build/` for packaging inputs, `tmp/` for intermediates.
7. `ffmpeg` is the only external binary dependency (only `clip-gif.mjs`); everything
   else needs just `puppeteer-core` + a local Chrome/Edge.
