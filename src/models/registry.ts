import { voxelizeIcon, voxelizeMultiView } from './icon-voxelizer';
import type { VoxelGrid } from './voxel-builder';
import { TIER_COLORS } from '../mods';

/**
 * Central registry of voxel character models (the frozen art pipeline):
 * each model is a flat front-view reference sheet (assets/2d/ref-*.png,
 * generated per docs/PROMPTS_IMAGENES.md) plus voxelization parameters.
 *
 * Adding a new character = generate its reference + add one entry here.
 * EnemySystem swaps in any registered model whose key matches the enemy
 * type name (kebab-case), bosses included; unregistered types keep their
 * primitive geometry.
 */

export interface VoxelModelDef {
  kind: 'enemy' | 'boss' | 'player' | 'prop';
  /** Flat front-view reference sheet URL (served from assets/2d/). */
  ref: string;
  /**
   * Side (profile) and back reference sheets. When refSide is present the
   * model is built by 3-view hull carving (voxelizeMultiView) — real depth
   * and side/back detail from the sheets — instead of front-view extrusion
   * with a guessed depth profile. Extrusion-only options below (segments,
   * depthFactor, frontOnly, ...) are ignored on that path.
   */
  refSide?: string;
  refBack?: string;
  /** Voxel columns across. Enemies stay low (swarm triangle budget). */
  targetWidth: number;
  /** World size of one voxel — controls the final model footprint. */
  voxelSize: number;
  /** Primary armor color; also the backfill behind surface details. */
  bodyColor: number;
  /** Full quantization palette (must include bodyColor). */
  palette: number[];
  /** Colors that exist only on the front face (visor glass, cores). */
  frontOnly: number[];
  /** Hull colors; everything else carves relief. Defaults to [bodyColor]. */
  armorColors?: number[];
  /** Vertical extrusion bands (head/torso/skirt). See icon-voxelizer. */
  segments?: { from: number; to: number; depthFactor?: number }[];
  /** Rows (fraction from top) where dark details sit proud (crest vents). */
  raisedTopFraction?: number;
  /** Fallback dome roundness when no segments are given. */
  depthFactor?: number;
  /**
   * Centers the geometry vertically instead of resting on y=0. Required by
   * types whose transform spins the mesh around its center (Roller).
   */
  originAtCenter?: boolean;
  /** Mirrors the front face onto the back shell (bodies seen mid-roll). */
  mirrorBack?: boolean;
  /** Spherical depth profile (balls); default is column-cylinder. */
  sphericalDepth?: boolean;
  /** Gradual vertical dome 0..1 — rounds side/back views (see voxelizer). */
  verticalRoundness?: number;
  /** FLAT side sheet: per-row depth measured from the real profile
   *  (front-only path; distinct from refSide which switches to multiView). */
  sideProfileRef?: string;
  /** FLAT back sheet: paints the back shell with real reference detail. */
  backPaintRef?: string;
  /** Paints the outer left/right faces from the side sheet's own colours
   *  instead of smearing the front silhouette edge. See icon-voxelizer. */
  sidePaint?: boolean;
  /** Colors that protrude from the armor (muzzle rings, raised plates). */
  raisedColors?: number[];
  /** Overrides the per-kind hero scale in the preview viewer. */
  previewScale?: number;
  /**
   * Post-classification color swap: `{sourceHex: targetHex}`, applied to the
   * finished grid AFTER classification/extrusion. This is how color variants
   * (2026-07-06) are built — swapping the PALETTE itself before classifying
   * does NOT reliably recolor, because the classifier picks the nearest
   * color to the REFERENCE IMAGE's actual (unchanged) pixels; an unrelated
   * new hue often loses to an existing palette entry it wasn't meant to
   * compete with (a container recolored teal→orange collapsed almost
   * entirely to the frame gray, since orange was numerically farther from
   * the teal pixels than gray was). Recoloring the OUTPUT instead keeps
   * classification identical to the base model and only changes render color.
   */
  recolorMap?: Record<number, number>;
  /**
   * Same post-classification swap as `recolorMap`, but limited to a HEIGHT
   * BAND — `from`/`to` are fractions from the TOP of the model, matching the
   * convention `segments` already uses. This is how a model wears two colour
   * schemes at once (2026-07-31: the final boss keeps the cast's cream body
   * but takes the logo's amber head, so it reads as the brand mascot without
   * the whole model collapsing into one gold mass).
   *
   * Applied AFTER `recolorMap`, so a global swap can be overridden locally.
   */
  recolorRegions?: { from: number; to: number; map: Record<number, number> }[];
}

export const YELLOW = 0xffb400;
export const DARK = 0x232830;
export const CYAN = 0x7ee0ff;
export const ELECTRIC_CYAN = 0x2ee6de;
export const AMBER = 0xffd24a;
export const ORANGE = 0xff8c33;
export const BONE = 0xe8e3d5;
export const VISOR_DARK = 0x1c2a38;
export const SIGNAL_RED = 0xff4433;
export const PURPLE = 0xb069ff;
export const GREEN = 0x7dd94a;
export const MUZZLE_RED = 0xff5533;
export const PINK = 0xff9de2;
export const GOLD = 0xf2b632;
// Container teal ramp — MEASURED from prop-container-*-v3.png (not guessed):
// the reference doors span a wide luminance range and a single teal made the
// shadowed recesses snap to the blue-gray frame (read as "too dark/blue").
// A 3-step teal ramp keeps green shadows green. Frame gray is the real
// measured 0x373d43 (lighter than DARK); DARK stays for the deepest seams.
export const TEAL_LIGHT = 0x347976;
export const TEAL = 0x286b68;
export const TEAL_DARK = 0x174946;
export const CONTAINER_FRAME = 0x373d43;
// Scaffold steel ramp — RETINTED TWICE 2026-07-06 (user playtest feedback).
// 1st: measured blue-gray steel (0x667799/0x465778/0x343c56) blended into
// the factory floor's own cool blue-gray palette. Shifted warm bronze/
// mustard — fixed the contrast, but user then asked for reddish instead of
// mustard. 2nd (current): muted oxide-red painted steel (deliberately duller
// than the saturated enemy reds SIGNAL_RED/MUZZLE_RED — props must stay
// under enemy saturation per DIRECCION_ARTE). Same 3-step ramp shape each
// time (only final render color changes, classification buckets unaffected).
// Rivets stay CYAN — already popped fine against both body colors.
export const STEEL_LIGHT = 0xc06a52;
export const STEEL = 0x93463a;
export const STEEL_DARK = 0x5e2a24;
export const SCAFFOLD_JOINT = 0x2a1512;
export const RIVET = CYAN;
// Barrel mustard ramp — MEASURED from prop-barrel-front-v1.png. Reuses the
// established prop mustard family (docs/PROMPTS_IMAGENES.md §7 mustard/
// teal/mauve trio) rather than colliding with the container's teal or any
// enemy color. Label tone is a warm tan, distinct enough from BONE to need
// its own constant (measured, not reused, to stay faithful to the ref).
export const BARREL_LIGHT = 0x957a2a;
export const BARREL = 0x7c631b;
export const BARREL_DARK = 0x58450c;
export const BARREL_LABEL = 0xd7c49c;
// Color variants (2026-07-06, user request): same 3D model, different
// palette, so a run doesn't look like the same 6 objects copy-pasted.
// Container orange keeps the SAME ramp shape (3 luminance steps) as the
// measured teal, just hue-shifted — same technique as the scaffold retint.
export const CONTAINER_ORANGE_LIGHT = 0xd97a3a;
export const CONTAINER_ORANGE = 0xb5602c;
export const CONTAINER_ORANGE_DARK = 0x7a3f1d;
// Container mauve (2026-07-08): third variant, completing the established
// mustard/teal/mauve prop trio (PROMPTS_IMAGENES §7). Muted painted-steel
// mauve, deliberately far below enemy PURPLE saturation. Each step is
// luminance-matched to the measured teal ramp (~100/87/58 luma) so shading
// depth reads identically across all three container colors.
export const CONTAINER_MAUVE_LIGHT = 0x7d5674;
export const CONTAINER_MAUVE = 0x6b4a63;
export const CONTAINER_MAUVE_DARK = 0x4a3145;
// Barrel black/white ramps, same 3-step shape as the mustard original.
export const BARREL_BLACK_LIGHT = 0x4a4d52;
export const BARREL_BLACK = 0x33353a;
export const BARREL_BLACK_DARK = 0x1c1e21;
export const BARREL_WHITE_LIGHT = 0xe8e4da;
export const BARREL_WHITE = 0xc9c4b6;
export const BARREL_WHITE_DARK = 0x8f8a7c;
// Scrapper (merchant) palette — MEASURED per-region from
// ref-scrapper-front-v1.png (v2 2026-07-09: first pass missed the TOOL GRAYS
// entirely — the wrench/pipes cluster collapsed into bronze/olive mush — and
// used only 3 bronze steps, so the AO'd belly fell into the crate olive).
// Families: 4-step bronze body ramp, 3-step olive crate ramp, 2-step warm
// tool gray; lantern reuses AMBER (front-only glow), price tag reuses BONE.
export const SCRAP_BRONZE_LIGHT = 0xc06008;
export const SCRAP_BRONZE = 0xa05008;
export const SCRAP_BRONZE_DARK = 0x783408;
export const SCRAP_BRONZE_SHADOW = 0x4c2304;
export const SCRAP_OLIVE_LIGHT = 0x806020;
export const SCRAP_OLIVE = 0x574414;
export const SCRAP_OLIVE_DARK = 0x362a0c;
export const SCRAP_TOOL_GRAY_LIGHT = 0x9a8f88;
export const SCRAP_TOOL_GRAY = 0x6e635a;

// Loot chest v2 (2026-07-09) — warm LOOT-GOLD armored crate (v1 gunmetal was
// rejected: cold blue-gray sank into the factory floor, the scaffold lesson
// all over again; gold is the approved in-game loot language). The ENERGY
// SEAM is the tier signal, recolored per rarity (recolorMap); its base hex IS
// TIER_COLORS.gray so the gray variant needs no recolor. The beam light in
// pickups.ts carries the same tier color at distance. Body reuses GOLD/AMBER.
export const CHEST_GOLD_DARK = 0xa8730a;
export const CHEST_SEAM = 0x8a94a2;
// Boss portal (2026-07-09) — replaces the procedural totem. Dark industrial
// gate; the RED energy field keeps the established danger language (red =
// boss: totem indicator, summon prompt, boss HP bar all use it). PORTAL_RED
// matches the indicator/beam red 0xff3355 exactly.
export const PORTAL_STEEL = 0x161a21;
export const PORTAL_RED = 0xff3355;
export const PORTAL_RED_DEEP = 0xa8172e;
// Foreman palette — read off the reference render (measured-palette rule,
// §6). Deliberately NOT the shared BONE/YELLOW/DARK/CYAN constants: this
// reference's cream is warmer, its yellow less orange than the enemy YELLOW,
// and its visor cyan more saturated than the pale CYAN. Only four entries are
// needed because the conversion sheets are AUTHORED flat (no light/shadow
// ramp to keep in-family — see tools/make-foreman-sheets.mjs).
export const FOREMAN_CREAM = 0xe7dfcb;
export const FOREMAN_YELLOW = 0xf0b429;
export const FOREMAN_DARK = 0x2b2e35;
export const FOREMAN_CYAN = 0x46d9ec;

// Brand palette — MEASURED off logo-mascot-v3.png / logo-letras-v3.png
// (tmp/warden-ref/logo-palette.mjs), per the standing sample-the-PNG rule.
// The logo is only THREE colours and has no cream at all: amber #fdb601 at
// 60% of the mascot, a cool blue-black #152532 at 25%, electric cyan #01e6fe
// at 15%. The wordmark runs even hotter at 82% amber.
// Tesla Titan seam tone (2026-07-31). Added so its v2 sheets can carve panel
// lines and coil windings WITHOUT punching full charcoal holes through a bright
// cyan hull — charcoal on cyan reads as damage, a deep teal reads as machining.
// Same "3-step ramp of one hue" convention as the container/scaffold/barrel
// families: it sits below ELECTRIC_CYAN in value, on the same hue.
export const TESLA_DEEP = 0x1a7d78;

export const LOGO_AMBER = 0xfdb601;
export const LOGO_DARK = 0x152532;
export const LOGO_CYAN = 0x01e6fe;
// The logo's own amber ramp is far too flat to serve as panel trim: measured
// p90/p55/p25 are #fdb601 / #fab202 / #ee9d00, which at boss size read as one
// tone. This deep step is therefore DELIBERATE, not measured — same hue,
// ~70% value — following the 3-step same-hue ramp convention already used by
// the container teal, scaffold steel and barrel mustard families above.
export const LOGO_AMBER_DEEP = 0x7d5600;
// Deepest seam value. The logo's own dark (#152532) becomes the ACCENT trim,
// so the seams beneath it need to go further still or they merge into it.
// Same cool blue-black hue, roughly half the value — measured from the
// wordmark's own darkest step (#09222b) and pushed one notch below it.
export const LOGO_BLACK = 0x0a1219;

/** Background swatches shared by every reference sheet. */
const BACKGROUND = [0x10141d, 0x151a22, 0x000000];

export const VOXEL_MODELS: Record<string, VoxelModelDef> = {
  foreman: {
    kind: 'player',
    // Hand-authored flat sheets (tools/make-foreman-sheets.mjs) drawn at the
    // model's exact 33x50 voxel resolution, so downsampleMap is a lossless
    // 1:1 mapping — every authored cell IS one voxel column.
    ref: 'assets/2d/ref-foreman-front-v1.png',
    // Measured-profile pipeline. voxelizeMultiView is WRONG for this subject:
    // the arms hang clear of the torso, and the hull cross-product would
    // phantom-fill those gaps (the scaffold limitation, icon-voxelizer.ts).
    sideProfileRef: 'assets/2d/ref-foreman-side-v1.png',
    backPaintRef: 'assets/2d/ref-foreman-back-v1.png',
    // Hero resolution: single instance, always centre-screen. 50 rows at
    // 0.04 lands the model at the ~2u height of the existing player rig.
    targetWidth: 33,
    voxelSize: 0.04,
    bodyColor: FOREMAN_CREAM,
    palette: [FOREMAN_CREAM, FOREMAN_YELLOW, FOREMAN_DARK, FOREMAN_CYAN],
    // Cyan is deliberately NOT frontOnly: that path insets it 2 voxels, and a
    // slot that deep swallows the visor at the game's 3/4 camera angle. As a
    // plain interior detail it sinks 1 and still backfills with armour, so no
    // cyan bleeds onto the sides.
    frontOnly: [],
    // Two-tone hull: cream plates and yellow trim are both armour, so the
    // charcoal frame is the only colour that carves relief.
    armorColors: [FOREMAN_CREAM, FOREMAN_YELLOW],
    // With sideProfileRef the depth per row is measured, so these bands only
    // supply each volume's own centre/half-width for the left-right falloff:
    // one band spanning the arms would make the legs read as near-centre and
    // extrude them as deep as the chest.
    segments: [
      { from: 0, to: 0.24 }, // head
      { from: 0.24, to: 0.7 }, // shoulders, chest, arms
      { from: 0.7, to: 1 }, // knees down
    ],
    raisedTopFraction: 0,
  },
  voltling: {
    kind: 'enemy',
    ref: 'assets/2d/ref-voltling-front.png',
    // Measured-profile pipeline (2026-07-13): real side silhouette + painted
    // back — swarm enemies graduate to the boss-grade sheet workflow because
    // the gameplay camera mostly shows their back and top.
    sideProfileRef: 'assets/2d/ref-voltling-side-v1.png',
    backPaintRef: 'assets/2d/ref-voltling-back-v1.png',
    // Swarm resolution: cheap triangles, silhouette-first. Sized to match
    // the primitive Voltling footprint (~0.9u wide) config was tuned around.
    targetWidth: 19,
    voxelSize: 0.055,
    bodyColor: YELLOW,
    palette: [YELLOW, DARK, CYAN],
    frontOnly: [CYAN],
    // Body block is round and forward; tread base is flatter and wider.
    segments: [
      { from: 0, to: 0.72, depthFactor: 0.4 },
      { from: 0.72, to: 1, depthFactor: 0.34 },
    ],
    raisedTopFraction: 0.14,
  },
  sparkrunner: {
    kind: 'enemy',
    ref: 'assets/2d/ref-sparkrunner-front-v5.png',
    // Measured-profile pipeline (2026-07-13): v5 sheet set — real chunky
    // ARMS fused to a solid shoulder bar (v4's thin joints read as floating
    // arms) with WIDE torso gaps below (v3's narrow gaps fused at swarm
    // resolution), side gives action-figure depth, painted back matches v5.
    sideProfileRef: 'assets/2d/ref-sparkrunner-side-v3.png',
    backPaintRef: 'assets/2d/ref-sparkrunner-back-v5.png',
    // Arms widen the sheet's bbox, so width buys more columns while the
    // smaller voxel keeps the runner ~1.9u tall like the primitive.
    targetWidth: 21,
    voxelSize: 0.037,
    bodyColor: ELECTRIC_CYAN,
    palette: [ELECTRIC_CYAN, DARK, AMBER],
    frontOnly: [AMBER],
    // Head round and forward; torso slimmer; legs nearly flat.
    segments: [
      { from: 0, to: 0.35, depthFactor: 0.36 },
      { from: 0.35, to: 0.7, depthFactor: 0.32 },
      { from: 0.7, to: 1, depthFactor: 0.28 },
    ],
    raisedTopFraction: 0.12,
  },
  rustbrute: {
    kind: 'enemy',
    ref: 'assets/2d/ref-rustbrute-front-v2.png',
    // Measured-profile pipeline (2026-07-13): real side silhouette + painted
    // back (see voltling note).
    sideProfileRef: 'assets/2d/ref-rustbrute-side-v2.png',
    backPaintRef: 'assets/2d/ref-rustbrute-back-v1.png',
    // The widest silhouette of the family; v2 raises the head above the
    // shoulder line so it extrudes as its own volume.
    targetWidth: 23,
    voxelSize: 0.06,
    bodyColor: SIGNAL_RED,
    palette: [SIGNAL_RED, DARK, AMBER],
    frontOnly: [AMBER],
    // Head forward and round; shoulder mass flatter; tread base narrow.
    // Depths kept lean: wide bodies balloon fast (playtest 2026-07-05).
    segments: [
      { from: 0, to: 0.28, depthFactor: 0.34 },
      { from: 0.28, to: 0.75, depthFactor: 0.26 },
      { from: 0.75, to: 1, depthFactor: 0.24 },
    ],
    raisedTopFraction: 0.1,
  },
  roller: {
    kind: 'enemy',
    ref: 'assets/2d/ref-roller-front.png',
    // Measured-profile pipeline (2026-07-13): sheets confirm the sphere and
    // keep the approved mirrored back eye (backPaint wins over mirrorBack,
    // which stays as fallback).
    sideProfileRef: 'assets/2d/ref-roller-side-v1.png',
    backPaintRef: 'assets/2d/ref-roller-back-v1.png',
    // A ball: depth equals width (single full-round segment), centered
    // origin so the rolling X-rotation doesn't wobble, and the amber eye
    // mirrored onto the back so a face always reads mid-roll.
    targetWidth: 19,
    voxelSize: 0.058,
    bodyColor: PURPLE,
    palette: [PURPLE, DARK, AMBER],
    frontOnly: [AMBER],
    depthFactor: 0.5,
    raisedTopFraction: 0,
    originAtCenter: true,
    mirrorBack: true,
    sphericalDepth: true,
  },
  gunner: {
    kind: 'enemy',
    ref: 'assets/2d/ref-gunner-front.png',
    // Measured-profile pipeline (2026-07-13): the side sheet gives the
    // cannon its real protruding profile; painted back (see voltling note).
    sideProfileRef: 'assets/2d/ref-gunner-side-v1.png',
    backPaintRef: 'assets/2d/ref-gunner-back-v1.png',
    // Squat turret; the red muzzle ring protrudes so the cannon reads as a
    // physical tube aiming at the player, with the dark bore recessed.
    targetWidth: 19,
    voxelSize: 0.055,
    bodyColor: GREEN,
    palette: [GREEN, DARK, AMBER, MUZZLE_RED],
    frontOnly: [AMBER],
    armorColors: [GREEN],
    raisedColors: [MUZZLE_RED],
    // Turret dome forward; leg base flatter.
    segments: [
      { from: 0, to: 0.7, depthFactor: 0.4 },
      { from: 0.7, to: 1, depthFactor: 0.3 },
    ],
    raisedTopFraction: 0.1,
  },
  drone: {
    kind: 'enemy',
    ref: 'assets/2d/ref-drone-front.png',
    // Painted back only (2026-07-13). No sideProfileRef on purpose: the
    // measured rotor-bar depth re-capped the roof in dark — the segment
    // profile below keeps the rotor a THIN blade (top-down camera rule).
    backPaintRef: 'assets/2d/ref-drone-back-v1.png',
    // Flat wide saucer; the dark rotor bar tops the silhouette and keeps
    // its color through the depth (it IS a rotor slab).
    targetWidth: 19,
    voxelSize: 0.05,
    bodyColor: PINK,
    palette: [PINK, DARK, AMBER],
    frontOnly: [AMBER],
    // Rotor bar as a THIN blade (the game camera looks down at the flyer:
    // a deep rotor band caps the whole roof in dark); saucer body rounder.
    segments: [
      { from: 0, to: 0.32, depthFactor: 0.09 },
      { from: 0.32, to: 0.78, depthFactor: 0.4 },
      { from: 0.78, to: 1, depthFactor: 0.28 },
    ],
    raisedTopFraction: 0,
  },
  player: {
    kind: 'player',
    ref: 'assets/2d/ref-player-front-v3.png',
    // Measured-profile pipeline (2026-07-13): real side silhouette + painted
    // back — the tool backpack finally reads from behind, which is the angle
    // the gameplay camera shows all run long.
    sideProfileRef: 'assets/2d/ref-player-side-v1.png',
    backPaintRef: 'assets/2d/ref-player-back-v1.png',
    // Hero resolution: single instance, always center-screen. Sized to the
    // primitive player's ~2u height.
    targetWidth: 25,
    voxelSize: 0.05,
    bodyColor: BONE,
    palette: [ORANGE, BONE, DARK, VISOR_DARK],
    frontOnly: [VISOR_DARK],
    // Two-tone hull: orange head + bone body both count as armor.
    armorColors: [BONE, ORANGE],
    // Head round and forward; torso broad; legs flatter.
    segments: [
      { from: 0, to: 0.34, depthFactor: 0.4 },
      { from: 0.34, to: 0.72, depthFactor: 0.34 },
      { from: 0.72, to: 1, depthFactor: 0.28 },
    ],
    raisedTopFraction: 0.1,
  },
  'tesla-titan': {
    kind: 'boss',
    // REBUILT 2026-07-31. The v1 sheets were a bare column with three flat ring
    // slabs and almost no interior detail, which put this boss at 8 059 voxels
    // / 6 592 triangles against the Crusher King's 27 740 / 13 480 — it read as
    // stacked discs next to a boss with a face and panelling. Raising
    // targetWidth alone could not have fixed it: there was nothing inside the
    // sheet to resolve. tools/make-tesla-titan-sheets.mjs authors all three
    // views at the model's exact voxel resolution (45x76, so the voxelizer's
    // downsample is a lossless 1:1) with coil windings, ring notches, a vented
    // head housing and a stepped armoured base.
    ref: 'assets/2d/ref-tesla-titan-front-v2.png',
    sideProfileRef: 'assets/2d/ref-tesla-titan-side-v2.png',
    backPaintRef: 'assets/2d/ref-tesla-titan-back-v2.png',
    // The side sheet now carries real flank detail, so use it for COLOUR too
    // and not just depth — see `sidePaint` in icon-voxelizer.
    sidePaint: true,
    // 45 columns matches the Crusher King's density class. voxelSize keeps the
    // 76-row tower at the same ~2u the primitive rig was tuned around, before
    // the type's own boss instance scale multiplies on top.
    targetWidth: 45,
    voxelSize: 0.0263,
    bodyColor: ELECTRIC_CYAN,
    palette: [ELECTRIC_CYAN, CYAN, TESLA_DEEP, DARK, AMBER],
    // Not frontOnly: that path insets the colour 2 voxels and buries the visor
    // at the game camera angle (the foreman lesson).
    frontOnly: [],
    // Hull is both cyans — the rings ARE structure, not decals. Deep teal and
    // charcoal are what carve relief.
    armorColors: [ELECTRIC_CYAN, CYAN],
    segments: [
      { from: 0, to: 0.22, depthFactor: 0.45 },
      { from: 0.22, to: 0.82, depthFactor: 0.4 },
      { from: 0.82, to: 1, depthFactor: 0.34 },
    ],
    raisedTopFraction: 0,
    // Framing only: the v2 tower is 76 rows tall, so the old 2.4 ran its head
    // off the top of the viewer even though the world height is unchanged.
    previewScale: 1.75,
  },
  'crusher-king': {
    kind: 'boss',
    ref: 'assets/2d/ref-crusher-king-front-v2.png',
    // Measured-profile pipeline (2026-07-09): real side silhouette + painted
    // back — the "loaf from behind" fix graduated from parametric dome to data.
    sideProfileRef: 'assets/2d/ref-crusher-king-side-v1.png',
    backPaintRef: 'assets/2d/ref-crusher-king-back-v1.png',
    // Sized to the primitive boss rig (~1.9u tall) because the instance
    // scale (BOSS 4.6x) multiplies on top. Gold is a full material (crown
    // spikes are silhouette), not a front-only glow; crest logic off so the
    // crown keeps its gold through the depth.
    targetWidth: 41,
    voxelSize: 0.046,
    bodyColor: SIGNAL_RED,
    palette: [SIGNAL_RED, DARK, GOLD],
    frontOnly: [],
    armorColors: [SIGNAL_RED],
    // Bands match the v2 sheet: crown+face down to the jaw, then torso.
    // Depths kept lean: at boss scale the extrusion balloons fast and the
    // king read as a loaf from behind (playtest 2026-07-05). The vertical
    // dome (2026-07-09) attacks that loaf directly — depth now tapers toward
    // crown and feet instead of extruding as a constant slab.
    segments: [
      { from: 0, to: 0.44, depthFactor: 0.36 },
      { from: 0.44, to: 0.82, depthFactor: 0.32 },
      { from: 0.82, to: 1, depthFactor: 0.26 },
    ],
    verticalRoundness: 0.7,
    raisedTopFraction: 0,
    previewScale: 1.9,
  },
  'volt-warden': {
    kind: 'boss',
    // v1 sheet by user decision (2026-07-09): the -v2 ref is RESERVED for a
    // future new enemy. The v1's "flat mass from the side/back" weakness is
    // covered by the measured side/back sheets below.
    ref: 'assets/2d/ref-volt-warden-front.png',
    sideProfileRef: 'assets/2d/ref-volt-warden-side-v1.png',
    backPaintRef: 'assets/2d/ref-volt-warden-back-v1.png',
    // Boss resolution: max detail, only 1-2 instances ever on screen.
    targetWidth: 41,
    voxelSize: 0.05,
    bodyColor: YELLOW,
    palette: [YELLOW, DARK, CYAN],
    frontOnly: [CYAN],
    // Head is round and forward; torso broad and flatter; skirt narrow.
    segments: [
      { from: 0, to: 0.42, depthFactor: 0.42 },
      { from: 0.42, to: 0.8, depthFactor: 0.32 },
      { from: 0.8, to: 1, depthFactor: 0.26 },
    ],
    raisedTopFraction: 0.12,
  },
  // Held for the future Map 3 final boss (see DIRECCION_ARTE arc: scrapyard
  // → foundry → neon city/orbital station with the final boss). Voxelized
  // from the ORIGINAL Volt Warden reference (pre-v2) at the user's request,
  // kept as a distinct entry — deliberately NOT wired into any enemy type
  // yet, so it has zero effect on the current game.
  // MAP 2 FINAL BOSS — fixed 2026-07-31 (user decision). This slot used to
  // hold the Volt Warden hovering pod; it now holds the Hazard Marshal, which
  // won a side-by-side at real boss scale. Those pod sheets and their
  // generator (tools/make-final-boss-sheets.mjs, output ref-final-boss-*-v2)
  // are kept: the design is free for a future enemy, alongside the reserved
  // ref-volt-warden-front-v2.
  //
  // Still NOT wired into any enemy type. Nothing summons it until the boss
  // gameplay exists — ROADMAP_STEAM.md flags that neither candidate has a
  // single phase, telegraph or pattern designed yet.
  'final-boss': {
    kind: 'boss',
    // Sheets DERIVED from lit reference renders by
    // tools/make-hazard-marshal-sheets.mjs (see that file for the flood-fill
    // keying and HSV-rule classifier the renders need). 61 columns is roughly
    // double the rest of the cast, and MEASURED in-game that only pays off at
    // boss scale: the same model occupies 50x58 px as a player and 244x293 px
    // as a boss — about 24x the screen area, which is where the panel detail
    // finally survives rasterisation.
    ref: 'assets/2d/ref-hazard-marshal-front-v1.png',
    // Measured-profile pipeline, NOT voxelizeMultiView: the gauntlets hang
    // clear of the torso and hull carving would phantom-fill those gaps.
    sideProfileRef: 'assets/2d/ref-hazard-marshal-side-v1.png',
    backPaintRef: 'assets/2d/ref-hazard-marshal-back-v1.png',
    // The 90/270 views were this model's weakest angle: the side sheet was
    // consumed for depth only and the flanks wore the front silhouette's edge
    // colour smeared backwards. voxelizeMultiView paints real side colour but
    // was tried and REJECTED here — it fused the gauntlets to the torso, and
    // those gaps are load-bearing for the silhouette. sidePaint gets the same
    // real colour without touching the shape.
    sidePaint: true,
    targetWidth: 61,
    // 93 rows at 0.0204 stands ~1.9u, which is the base the other bosses use
    // BEFORE their type's 4.6x instance scale multiplies on top — so it lands
    // at the established boss size rather than towering arbitrarily.
    voxelSize: 0.0204,
    bodyColor: FOREMAN_CREAM,
    palette: [FOREMAN_CREAM, FOREMAN_YELLOW, FOREMAN_DARK, FOREMAN_CYAN],
    frontOnly: [],
    armorColors: [FOREMAN_CREAM, FOREMAN_YELLOW],
    segments: [
      { from: 0, to: 0.24 }, // helmet + respirator
      { from: 0.24, to: 0.65 }, // pauldrons, chest, arms, belt
      { from: 0.65, to: 1 }, // thighs down
    ],
    raisedTopFraction: 0,
    // BRAND RECOLOUR — HEAD ONLY (user decision 2026-07-31, revised).
    // Recolouring the WHOLE model into the logo palette was built and
    // rejected: the body lost the cream/yellow value contrast that made it
    // read, and it rendered as a featureless gold statue. So the body keeps
    // the cast's own palette and only the HELMET wears the brand — which is
    // the part that actually quotes the logo mascot (dome, visor, grille).
    //
    // 0 to 0.245 is the helmet + respirator band, matching the first segment
    // boundary below so the recolour ends exactly where the pauldrons begin.
    // Region recolour is post-classification like recolorMap, for the reason
    // documented on that field — swapping the palette instead collapses the
    // model, because the classifier compares against the reference image's
    // own unchanged pixels.
    recolorRegions: [
      {
        from: 0,
        to: 0.245,
        map: {
          [FOREMAN_CREAM]: LOGO_AMBER,
          [FOREMAN_YELLOW]: LOGO_DARK,
          [FOREMAN_DARK]: LOGO_BLACK,
          [FOREMAN_CYAN]: LOGO_CYAN,
        },
      },
    ],
    // Framing only, no effect on game scale. Kept at 2.0 rather than pushed
    // to fill the frame: the viewer draws its info line across the top ~30 px,
    // and a taller model runs its head under that text (and under the
    // turnaround sheet's crop).
    previewScale: 2.0,
  },
  // Map 1 tactical prop (approved refs 2026-07-06, see PROMPTS_IMAGENES §7):
  // static chokepoint obstacle, not tied to any enemy/boss type name — world.ts
  // places multiple instances of this one model directly by key 'container'.
  // First model built from ALL 3 reference views (front/side/back hull
  // carving): the elongated body and side corrugation come from the side
  // sheet, not from a guessed depth profile.
  container: {
    kind: 'prop',
    ref: 'assets/2d/prop-container-front-v3.png',
    refSide: 'assets/2d/prop-container-side-v3.png',
    refBack: 'assets/2d/prop-container-back-v3.png',
    targetWidth: 26,
    voxelSize: 0.12,
    bodyColor: TEAL,
    // 3-step teal ramp + measured frame gray + deep-seam dark + stripe bone.
    // More entries = the quantizer keeps shadowed teal in the green family
    // instead of collapsing it to the blue-gray frame.
    palette: [TEAL_LIGHT, TEAL, TEAL_DARK, CONTAINER_FRAME, DARK, BONE],
    frontOnly: [],
    previewScale: 0.55,
  },
  // Color variant of `container` (2026-07-06) — identical geometry/refs,
  // orange ramp instead of teal so the map doesn't read as one repeated
  // object; world.ts picks a variant at random per gate.
  'container-orange': {
    kind: 'prop',
    ref: 'assets/2d/prop-container-front-v3.png',
    refSide: 'assets/2d/prop-container-side-v3.png',
    refBack: 'assets/2d/prop-container-back-v3.png',
    targetWidth: 26,
    voxelSize: 0.12,
    bodyColor: TEAL,
    // Classify with the SAME teal palette as `container` (the reference
    // image IS teal; recoloring the palette itself instead of the output
    // fails, see recolorMap doc) — recolorMap swaps the render color after.
    palette: [TEAL_LIGHT, TEAL, TEAL_DARK, CONTAINER_FRAME, DARK, BONE],
    frontOnly: [],
    recolorMap: {
      [TEAL_LIGHT]: CONTAINER_ORANGE_LIGHT,
      [TEAL]: CONTAINER_ORANGE,
      [TEAL_DARK]: CONTAINER_ORANGE_DARK,
    },
    previewScale: 0.55,
  },
  // Third container variant (2026-07-08): mauve ramp, same recolor-the-output
  // technique as `container-orange` (see recolorMap doc above).
  'container-mauve': {
    kind: 'prop',
    ref: 'assets/2d/prop-container-front-v3.png',
    refSide: 'assets/2d/prop-container-side-v3.png',
    refBack: 'assets/2d/prop-container-back-v3.png',
    targetWidth: 26,
    voxelSize: 0.12,
    bodyColor: TEAL,
    palette: [TEAL_LIGHT, TEAL, TEAL_DARK, CONTAINER_FRAME, DARK, BONE],
    frontOnly: [],
    recolorMap: {
      [TEAL_LIGHT]: CONTAINER_MAUVE_LIGHT,
      [TEAL]: CONTAINER_MAUVE,
      [TEAL_DARK]: CONTAINER_MAUVE_DARK,
    },
    previewScale: 0.55,
  },
  // Second 3-view multi-view prop (2026-07-06): tall thin steel scaffold
  // tower, chosen deliberately as a contrast to the container — see-through
  // X-braced lattice instead of a solid wall, so the swarm stays visible
  // through it (docs/PROMPTS_IMAGENES.md §7). Back is byte-identical to
  // front by construction (the object is front-to-back symmetric).
  // Single-view extrusion, NOT multi-view (see icon-voxelizer.ts LIMITATION
  // note): the front/side visual-hull cross product filled the X-brace's
  // real open gaps with phantom solid combinations, since a lattice's faces
  // are independent hollow patterns, not a solid volume like the container.
  // A shallow single-view extrusion only ever draws material behind an
  // actual front pixel, so the diamond gaps stay genuinely open. mirrorBack
  // paints the identical pattern on the back shell (front=back by design).
  scaffold: {
    kind: 'prop',
    ref: 'assets/2d/prop-scaffold-front-v1.png',
    targetWidth: 34,
    voxelSize: 0.042,
    bodyColor: STEEL,
    palette: [STEEL_LIGHT, STEEL, STEEL_DARK, SCAFFOLD_JOINT, RIVET],
    frontOnly: [],
    armorColors: [STEEL, STEEL_LIGHT, STEEL_DARK],
    depthFactor: 0.16,
    mirrorBack: true,
    raisedTopFraction: 0,
    previewScale: 0.7,
  },
  // Small decorative prop (2026-07-06, no collision — docs/PROMPTS_IMAGENES
  // §7 "variantes menores"): a solid rounded drum, unlike the scaffold's
  // lattice, so the default single-view column-cylinder extrusion (no
  // sphericalDepth, no mirrorBack) gives it the right round silhouette; the
  // hazard label is a detail color, automatically front-face-only via the
  // existing interior-detail backfill (armorColors covers only the 3 body
  // tones, so the label never wraps around the sides).
  barrel: {
    kind: 'prop',
    ref: 'assets/2d/prop-barrel-front-v1.png',
    targetWidth: 22,
    // Bigger + collision (2026-07-06 user request): world footprint now
    // matches config.BARREL_PROP (~1.3m wide) instead of the original
    // decorative-only ~0.77m.
    voxelSize: 0.059,
    bodyColor: BARREL,
    palette: [BARREL_LIGHT, BARREL, BARREL_DARK, DARK, BARREL_LABEL],
    frontOnly: [],
    armorColors: [BARREL_LIGHT, BARREL, BARREL_DARK],
    depthFactor: 0.48,
    raisedTopFraction: 0,
    previewScale: 1.6,
  },
  // Color variants of `barrel` (2026-07-06) — identical geometry/ref, same
  // 3-step ramp shape, different hue; world.ts picks one at random per drum.
  'barrel-black': {
    kind: 'prop',
    ref: 'assets/2d/prop-barrel-front-v1.png',
    targetWidth: 22,
    voxelSize: 0.059,
    bodyColor: BARREL,
    // Classify with the SAME mustard palette as `barrel` (the reference IS
    // mustard; see recolorMap doc for why palette-swap-before-classify
    // fails) — recolorMap swaps the render color after classification.
    palette: [BARREL_LIGHT, BARREL, BARREL_DARK, DARK, BARREL_LABEL],
    frontOnly: [],
    armorColors: [BARREL_LIGHT, BARREL, BARREL_DARK],
    depthFactor: 0.48,
    raisedTopFraction: 0,
    recolorMap: {
      [BARREL_LIGHT]: BARREL_BLACK_LIGHT,
      [BARREL]: BARREL_BLACK,
      [BARREL_DARK]: BARREL_BLACK_DARK,
    },
    previewScale: 1.6,
  },
  'barrel-white': {
    kind: 'prop',
    ref: 'assets/2d/prop-barrel-front-v1.png',
    targetWidth: 22,
    voxelSize: 0.059,
    bodyColor: BARREL,
    palette: [BARREL_LIGHT, BARREL, BARREL_DARK, DARK, BARREL_LABEL],
    frontOnly: [],
    armorColors: [BARREL_LIGHT, BARREL, BARREL_DARK],
    depthFactor: 0.48,
    raisedTopFraction: 0,
    recolorMap: {
      [BARREL_LIGHT]: BARREL_WHITE_LIGHT,
      [BARREL]: BARREL_WHITE,
      [BARREL_DARK]: BARREL_WHITE_DARK,
    },
    previewScale: 1.6,
  },
  // The Scrapper merchant — front-only voxelization (Camino A, 2026-07-09):
  // a stationary NPC that faces the player, so the back is never the hero
  // angle. Boss-grade resolution (single instance, and the ref is packed
  // with fine detail: tools, straps, lantern, tag). Rounded solid body →
  // generous belly depth; the crate + tools silhouette stays solid via the
  // olive/gray armor families. Lantern glows via the AMBER front-only pass.
  // Voxelization source is the FLAT conversion sprite (-v2): the -v1 beauty
  // render (per-block 3D shading + AO) turned into color mush when quantized
  // — §6's "flat solid colors" rule exists precisely for this. -v1 stays as
  // concept/marketing art.
  scrapper: {
    kind: 'prop',
    ref: 'assets/2d/ref-scrapper-front-v2.png',
    // Pilot of the measured-profile pipeline (2026-07-09): depth per row
    // comes from the flat side sheet (hunch + crate bulge are DATA) and the
    // back shell is painted from the flat back sheet (the crate reads from
    // behind). Both sheets are flat conversion sprites, same palette.
    sideProfileRef: 'assets/2d/ref-scrapper-side-v2.png',
    backPaintRef: 'assets/2d/ref-scrapper-back-v2.png',
    targetWidth: 52,
    voxelSize: 0.045,
    bodyColor: SCRAP_BRONZE,
    palette: [
      SCRAP_BRONZE_LIGHT,
      SCRAP_BRONZE,
      SCRAP_BRONZE_DARK,
      SCRAP_BRONZE_SHADOW,
      SCRAP_OLIVE_LIGHT,
      SCRAP_OLIVE,
      SCRAP_OLIVE_DARK,
      SCRAP_TOOL_GRAY_LIGHT,
      SCRAP_TOOL_GRAY,
      DARK,
      AMBER,
      BONE,
    ],
    frontOnly: [AMBER],
    armorColors: [
      SCRAP_BRONZE_LIGHT,
      SCRAP_BRONZE,
      SCRAP_BRONZE_DARK,
      SCRAP_BRONZE_SHADOW,
      SCRAP_OLIVE_LIGHT,
      SCRAP_OLIVE,
      SCRAP_OLIVE_DARK,
      SCRAP_TOOL_GRAY_LIGHT,
      SCRAP_TOOL_GRAY,
    ],
    segments: [
      { from: 0, to: 0.36, depthFactor: 0.34 },
      { from: 0.36, to: 0.8, depthFactor: 0.44 },
      { from: 0.8, to: 1, depthFactor: 0.3 },
    ],
    // Egg-bodied vendor: without the dome the side view was a slab (2026-07-09).
    verticalRoundness: 0.6,
    raisedTopFraction: 0,
    previewScale: 1.0,
  },
  // Boss portal gate — thin slab profile measured from the side sheet, back
  // painted with the mirrored front (the energy field glows on both faces).
  portal: {
    kind: 'prop',
    ref: 'assets/2d/prop-portal-front-v1.png',
    sideProfileRef: 'assets/2d/prop-portal-side-v1.png',
    backPaintRef: 'assets/2d/prop-portal-front-v1.png',
    targetWidth: 30,
    // Landmark scale (2026-07-09 user call): ~3.6u wide / ~4.5u tall — the
    // boss door should dwarf the player and read across the arena.
    voxelSize: 0.12,
    bodyColor: DARK,
    palette: [DARK, PORTAL_STEEL, PORTAL_RED, PORTAL_RED_DEEP, BONE],
    frontOnly: [],
    armorColors: [DARK, PORTAL_STEEL],
    raisedTopFraction: 0,
    previewScale: 1.4,
  },
  ...buildChestVariants(),
};

/** The five tier-colored chest entries share everything but the seam color.
 *  Back sheet reuses the front (the crate is front/back symmetric).
 *
 *  The SPRITES are painted gold, but the rendered body shifts to the
 *  scrapper's BRONZE family via recolorMap (2026-07-09 playtest: gold chests
 *  were the same blob as the yellow Voltling swarm — loot vs enemy confusion).
 *  Bronze forms the "economy family" with the merchant and, as a bonus, the
 *  gold TIER seam now pops against the bronze case instead of vanishing. */
function buildChestVariants(): Record<string, VoxelModelDef> {
  const entries: Record<string, VoxelModelDef> = {};
  for (const [tier, color] of Object.entries(TIER_COLORS)) {
    const recolorMap: Record<number, number> = {
      [AMBER]: SCRAP_BRONZE_LIGHT,
      [GOLD]: SCRAP_BRONZE,
      [CHEST_GOLD_DARK]: SCRAP_BRONZE_DARK,
    };
    if (color !== CHEST_SEAM) recolorMap[CHEST_SEAM] = color;
    entries[`chest-${tier}`] = {
      kind: 'prop',
      ref: 'assets/2d/prop-chest-front-v2.png',
      sideProfileRef: 'assets/2d/prop-chest-side-v2.png',
      backPaintRef: 'assets/2d/prop-chest-front-v2.png',
      targetWidth: 22,
      voxelSize: 0.055,
      bodyColor: GOLD,
      palette: [GOLD, AMBER, CHEST_GOLD_DARK, DARK, BONE, CHEST_SEAM],
      frontOnly: [],
      armorColors: [GOLD, AMBER, CHEST_GOLD_DARK],
      raisedTopFraction: 0,
      recolorMap,
      previewScale: 1.6,
    };
  }
  return entries;
}

/** Enemy type name (config.ts) → registry key. */
export function modelKeyForTypeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

export async function buildModelGrid(key: string): Promise<VoxelGrid> {
  const def = VOXEL_MODELS[key];
  if (!def) throw new Error(`No voxel model registered as '${key}'`);
  const grid = def.refSide
    ? await voxelizeMultiView(
        { front: def.ref, side: def.refSide, back: def.refBack },
        { targetWidth: def.targetWidth, background: BACKGROUND, palette: def.palette },
      )
    : await voxelizeIcon(def.ref, {
        targetWidth: def.targetWidth,
        depthFactor: def.depthFactor,
        raisedTopFraction: def.raisedTopFraction,
        segments: def.segments,
        background: BACKGROUND,
        palette: def.palette,
        frontOnly: def.frontOnly,
        armorColors: def.armorColors,
        mirrorBack: def.mirrorBack,
        sphericalDepth: def.sphericalDepth,
        verticalRoundness: def.verticalRoundness,
        sideProfileRef: def.sideProfileRef,
        sidePaint: def.sidePaint,
        backPaintRef: def.backPaintRef,
        raisedColors: def.raisedColors,
        bodyColor: def.bodyColor,
      });
  if (def.recolorMap) recolorGrid(grid, def.recolorMap);
  for (const region of def.recolorRegions ?? []) recolorGridRegion(grid, region);
  return grid;
}

/** Applies a post-classification color swap in place (see `recolorMap` on
 *  VoxelModelDef for why this happens after classification, not before). */
function recolorGrid(grid: VoxelGrid, recolorMap: Record<number, number>): void {
  for (const slice of grid) {
    for (const row of slice) {
      for (let x = 0; x < row.length; x++) {
        const color = row[x];
        if (color != null && color in recolorMap) row[x] = recolorMap[color] ?? color;
      }
    }
  }
}

/**
 * Applies a recolor to a height band only. `from`/`to` are fractions measured
 * from the TOP (the `segments` convention), while the grid's own Y runs from
 * the BOTTOM up — hence the flip. Bounds are clamped so a band of 0..0.25
 * always covers the real top quarter regardless of rounding.
 */
function recolorGridRegion(
  grid: VoxelGrid,
  region: { from: number; to: number; map: Record<number, number> },
): void {
  const height = grid.length;
  const yFrom = Math.max(0, Math.floor(height * (1 - region.to)));
  const yTo = Math.min(height - 1, Math.ceil(height * (1 - region.from)) - 1);
  for (let y = yFrom; y <= yTo; y++) {
    const slice = grid[y];
    if (!slice) continue;
    for (const row of slice) {
      for (let x = 0; x < row.length; x++) {
        const color = row[x];
        if (color != null && color in region.map) row[x] = region.map[color] ?? color;
      }
    }
  }
}
