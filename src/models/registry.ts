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
  /** FLAT top sheet: paints selected top-facing macro accents directly from
   * the approved orthographic view (front of object at image bottom). */
  topPaintRef?: string;
  topPaintColors?: number[];
  /** Paints the outer left/right faces from the side sheet's own colours
   *  instead of smearing the front silhouette edge. See icon-voxelizer. */
  sidePaint?: boolean;
  /** Skips the left-right symmetrization pass. REQUIRED for any reference that
   *  is deliberately asymmetric, or the mirror fills its gaps. See
   *  icon-voxelizer. */
  asymmetric?: boolean;
  /** Colors that protrude from the armor (muzzle rings, raised plates). */
  raisedColors?: number[];
  /** Overrides the per-kind hero scale in the preview viewer. */
  previewScale?: number;
  /** Optional code-built volumes that the measured-profile shell cannot
   * represent without symmetrically inflating the opposite side. */
  runtimeDetails?: {
    backpack?: {
      size: readonly [number, number, number];
      position: readonly [number, number, number];
      bodyColor: number;
      trimColor: number;
      accentColor: number;
      socketCount: number;
    };
  };
  /**
   * Cylindrical wheels stamped into the FINISHED grid (axle along X, so the
   * tyre is round in the Y/Z plane).
   *
   * Why this cannot live in the sheets: the extruder scales every column's
   * depth by `sqrt(1 - t²)` about its segment centre, so a feature at the
   * silhouette edge always ends up shallower than one near the middle. A tyre
   * is the opposite — constant width across its whole face. Measured on the
   * Sparkrunner's 4-column wheel: the outer columns land on half-depth 2 while
   * the inner ones land on 4, i.e. a stepped wedge, not a wheel.
   *
   * Stamping happens inside `buildModelGrid`, so the swarm InstancedMesh path
   * and the preview get the same geometry, and it writes into the SAME voxel
   * grid — no extra mesh, no extra draw call.
   */
  wheels?: {
    /** Radius in voxels, in the Y/Z plane. The band is 2*radius+1 tall. */
    radius: number;
    /** Grid Y of the wheel centre, counted from the BOTTOM of the model. */
    centerY: number;
    /** Inclusive X column ranges, one per wheel. */
    columns: readonly (readonly [number, number])[];
    tireColor: number;
    /** Painted on each wheel's two end faces only, so it reads as a hub cap
     *  from the side without coring the tyre through. */
    hubColor: number;
    /** Hub cap radius, in the same Y/Z plane as `radius`. */
    hubRadius: number;
  };
  /**
   * Open-topped crucible stamped into the SAME voxel grid as the measured
   * shell. The orthographic top sheet is the measurement source, while these
   * normalized values keep the runtime deterministic and browser-independent.
   * A separate Three.js mesh would break the one-InstancedMesh-per-type rule.
   */
  topCrucible?: {
    /** Approved top sheet used to measure the normalized footprint. */
    ref: string;
    /** Centre across the occupied X span, 0 = left and 1 = right. */
    centerX: number;
    /** Centre along the occupied Z span, 0 = back and 1 = front. */
    centerZ: number;
    widthFraction: number;
    depthFraction: number;
    /** Number of solid rim cells around the real empty cavity. */
    rimThickness: number;
    /** Height of the raised crucible lip in voxel layers. */
    rimHeight: number;
    rimColor: number;
    /** Heat surface at the bottom of the cavity. */
    innerColor: number;
    /** Empty layers between the heat surface and the upper rim. */
    cavityDepth: number;
  };
  /** Four corner legs measured from an approved orthographic top sheet. They
   * are stamped into the source grid because front extrusion collapses each
   * front/back pair into one side mass from the gameplay camera. */
  topFootprintLegs?: {
    ref: string;
    bodyWidthFraction: number;
    bodyDepthFraction: number;
    clearThroughY: number;
    radius: number;
    jointY: readonly [number, number];
    shaftY: readonly [number, number];
    footY: readonly [number, number];
    shaftColor: number;
    jointColor: number;
    footColor: number;
  };
  /**
   * Coarse orthographic surface registration for details that collapse when
   * 1024 px technical sheets are reduced to swarm resolution. Coordinates are
   * measured on the final target-width grid; rows count down from the top in
   * front/side views. A shallow front plate may fill missing extrusion steps,
   * but it never expands the grid bounds or creates a separate object.
   */
  macroSurfaceDetails?: {
    /** Occupied shell cells recolored along side/top orthographic rays. */
    paintDepth: number;
    /** Shallow front plate depth. The source sheet has a solid visor, while
     * raw extrusion leaves empty steps that read as black stripes obliquely. */
    frontPlateDepth: number;
    /** Layers inset from the grid's front bound. Cells in front of the shaped
     * plate are cleared so it reads integrated rather than as a windshield. */
    frontInset: number;
    visorColor: number;
    frameColor: number;
    ventColor: number;
    front: {
      visorBands: readonly {
        x: readonly [number, number];
        rows: readonly [number, number];
      }[];
      frameBands: readonly {
        x: readonly [number, number];
        rows: readonly [number, number];
      }[];
      ventX: readonly number[];
      ventRows: readonly [number, number];
    };
    side: {
      visorZ: readonly [number, number];
      visorRows: readonly [number, number];
      frameZ: readonly [number, number];
      frameRows: readonly [number, number];
      ventZ: readonly [number, number];
      ventRows: readonly [number, number];
    };
    top: {
      visorX: readonly [number, number];
      visorZ: readonly [number, number];
      frameX: readonly [number, number];
      frameZ: readonly [number, number];
    };
  };
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
export const FURNACE_HEAT = 0xff7a1a;
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
// Power cell (Map 2 scatter prop) — MEASURED from prop-powercell-front-v3.png,
// which quantizes to exactly these 7 tones. Deliberately a cold steel family
// rather than the Map 1 mustard/teal/mauve trio: the Swarm Foundry is an
// ACTIVE futuristic plant, not the dead factory. The four steel steps are a
// 4-stop ramp (front face lit, flank, far flank, frame) because the faceted
// body shows three luminance planes at once and a 3-step ramp collapsed the
// middle one. CORE reuses the map's own conduit cyan (config MEGAFACTORY_MAP
// .colors.cyan) on purpose, so the prop belongs to the same building as the
// perimeter towers — but only as a thin recessed column, never a body color:
// saturated cyan at prop scale competes with the Sparkrunner.
export const POWERCELL_FACE = 0x40515d;
export const POWERCELL_FLANK = 0x33424c;
export const POWERCELL_FLANK_DARK = 0x2a363f;
export const POWERCELL_FRAME = 0x232830;
export const POWERCELL_RECESS = 0x17212a;
export const POWERCELL_TERMINAL = 0x8fa3ad;
export const POWERCELL_CORE = 0x01e6fe;
// Two recolours of the power cell (2026-08-17, user request), the same variant
// technique Map 1's barrels use: identical ref and classification palette, with
// a recolorMap applied to the OUTPUT. Entering these as palette members instead
// would make them lose to the steel tones they are meant to replace — the
// container teal->orange attempt that came back grey.
//
// Unlike the foundry towers, these CAN carry a real hue shift. The towers are
// dark mass at luma ~38, where the three-step toon quantisation crushes hue to
// nothing and their variants had to move luminance instead. A power cell is a
// mid-tone prop, so hue survives at play distance.
//
// The oxide steps are luminance-matched to the measured steel ramp
// (77 / 63 / 52 / 40) so shading depth reads identically across both.
export const POWERCELL_RUST_FACE = 0x654433;
export const POWERCELL_RUST_FLANK = 0x533628;
export const POWERCELL_RUST_FLANK_DARK = 0x432c21;
export const POWERCELL_RUST_FRAME = 0x342319;
// The pale variant deliberately breaks that match and sits brighter than the
// other two, exactly as Map 1's white barrel sits brighter than the mustard one.
// A prop this small is meant to be picked out of the floor, which is the
// opposite of the towers' job.
export const POWERCELL_BONE_FACE = 0xa8a294;
export const POWERCELL_BONE_FLANK = 0x8b8678;
export const POWERCELL_BONE_FLANK_DARK = 0x6e6a5e;
export const POWERCELL_BONE_FRAME = 0x46433b;
// Arena containment wall (2026-08-17). Its own five-tone family rather than a
// borrowed one: the wall is the only prop that is pure background mass on BOTH
// maps, so it needs tones that recolour cleanly in either direction.
//
// The hazard band reuses BONE, never yellow. That is the container's decision
// from 2026-07-06 and the reason is unchanged: yellow is the Voltling's body.
export const WALL_RECESS = 0x14181e;
export const WALL_PANEL = 0x2b333d;
export const WALL_RAISED = 0x4a5666;
export const WALL_BOLT = 0x8a9099;
// Per-map recolours. The sheet measures 61.3 mean luminance and the Map 2 floor
// raster sits at ~62, so untouched the barrier would be exactly as bright as the
// ground it encloses. Both variants pull the two dominant tones down; Map 1 also
// cools them toward its slate floor, Map 2 warms them toward its ember sky.
export const WALL_M1_PANEL = 0x222932;
export const WALL_M1_RAISED = 0x3a4552;
export const WALL_M2_PANEL = 0x262428;
export const WALL_M2_RAISED = 0x423f44;
// Foundry tower accents (2026-08-17, user direction). Applied as a recolorMap
// over the classified grid, never by swapping the palette hexes: the quantizer
// picks the nearest palette entry to the SHEET's real pixels, so a new hue
// entered as a palette member loses to whichever original tone is numerically
// closer (the container teal->orange attempt collapsed to frame gray).
//
// Trim goes white — the BODY deliberately stays dark. Measured: the floor
// raster sits at ~62 mean luminance and the tower casing at ~40; a white body
// would jump to ~230, making the perimeter the brightest thing on screen and
// putting it in the player's own bone-white family, the opposite of scenery
// that sits behind the action.
export const FOUNDRY_TRIM_WHITE = 0xf0f4f7;
// Conduit green, replacing the cyan. Cyan was never free — it is the
// Sparkrunner's body colour and the machinery language of the floor texture.
// MEASURED by hue, against the cast: red 0-20 (Rustbrute, boss), amber 30-45
// (player, gold, heat lanes), yellow 50-60 (Voltling), lime 95 (Gunner), cyan
// 176 (Sparkrunner), blue 210-230 (floor channels), violet 275 (Roller),
// magenta 320 (Drone, elites). The widest genuinely unoccupied gap is true
// green near 140, which this sits in at 146 — 51 degrees off the Gunner's lime
// and 31 off the Sparkrunner's cyan.
// Foundry stack (Map 2 perimeter chimney, 2026-08-17). The sheet is authored in
// the five tones below, but two of them are DARKENED at build time by
// recolorMap: Codex ignored the requested area shares (30% of the darkest tone
// was asked for, 2.1% came back) and the sheet measures 76 mean luminance
// against a floor at ~62 — the prop would be brighter than the ground it stands
// on. Remapping the output is exact and keeps the block structure untouched;
// re-rolling the generation to chase a share is not.
export const DARKEST_RECESS = 0x151a20;
export const SHEET_CASING = 0x2e3a46;
export const SHEET_PLATE = 0x596b7a;
export const FOUNDRY_CASING = 0x1e2831;
export const FOUNDRY_PLATE = 0x3d4b57;
// The conduit is WHITE, not a hue (user decision 2026-08-17 after rejecting the
// green). Every saturated slot on the wheel is already spoken for by the cast or
// by loot — yellow worst of all, since it is simultaneously the Voltling's body,
// the player's accent, the gold and the chests. White cannot collide with any
// gameplay signal by construction, and it reuses the trim the user approved.
export const FOUNDRY_STACK_SHEET_CONDUIT = 0x1f9d55;
// Two recolours of the stack, the container/barrel variant technique applied to
// Map 2 (2026-08-17, user request). Same sheets, same classification palette,
// different recolorMap — recolouring the OUTPUT keeps the block structure and
// the silhouette identical while changing only render colour.
//
// They shift TEMPERATURE AND LUMINANCE, not hue alone, and that is a deliberate
// departure from Map 1's mustard/teal/mauve trio. Those work because containers
// are mid-tone (luma ~87) where hue survives; the towers are dark mass (luma
// ~38) where the three-step toon quantisation crushes a pure hue shift into
// nothing. The measured casing spread here is 28 / 38 / 45, all comfortably
// under the floor's ~62 so every variant still reads as scenery.
export const FOUNDRY_IRON_CASING = 0x332b25;
export const FOUNDRY_IRON_PLATE = 0x57493d;
export const FOUNDRY_GRAPHITE_CASING = 0x191d20;
export const FOUNDRY_GRAPHITE_PLATE = 0x33393d;
/** Foundry container ramps.
 *
 *  Two rules decided these, and the first attempt broke both.
 *
 *  1. They must sit ABOVE the floor's ~62 luma, not under it. A chimney is
 *     skyline the eye reads by silhouette; a container is COVER, and the player
 *     has to spot it at a glance while running from 300 bodies.
 *  2. They must land in a hue nothing else owns. The first pass used steel and
 *     iron — which is exactly what the power cells (hue 205) and the chimney
 *     recolours (204-208 and 26-28) already are, so the map gained props and no
 *     variety at all.
 *
 *  MEASURED HUE CENSUS of everything already spoken for: 0-45 red/orange/amber
 *  (boss signal, muzzle flash, bronze, barrels, and the GOLD that means loot),
 *  ~99 the blinking acid status tint, ~146 the chimney conduit, 176-194
 *  teal/cyan (Sparkrunner, Tesla, cell cores, the logo), 200-220 the industrial
 *  greys AND the floor's own blue channels (#3b8fff), ~300 the elite ring
 *  (0xff6bff), 312-315 Map 1's mauve containers.
 *
 *  That leaves two windows. These take both: violet at 258 sits in the widest
 *  empty band in the project — 38 hue clear of the floor's blue on one side and
 *  42 clear of the elite magenta on the other — and moss at 88 takes the
 *  olive-green window. Moss is the riskier of the two, being 11 hue from the
 *  acid tint, but that tint is bright (luma 173), saturated and BLINKING on a
 *  moving body, against a still, dark, half-saturated wall. If they ever read as
 *  the same thing in play, moss is the one to move, not violet. */
export const FOUNDRY_CONTAINER_VIOLET_LIGHT = 0x9a86c4;
export const FOUNDRY_CONTAINER_VIOLET = 0x6b5a93;
export const FOUNDRY_CONTAINER_VIOLET_DARK = 0x443a5e;
export const FOUNDRY_CONTAINER_MOSS_LIGHT = 0x86a85f;
export const FOUNDRY_CONTAINER_MOSS = 0x5e7742;
export const FOUNDRY_CONTAINER_MOSS_DARK = 0x3b4c2a;
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
  'furnace-mite': {
    kind: 'enemy',
    ref: 'assets/2d/ref-furnace-mite-front-v1.png',
    sideProfileRef: 'assets/2d/ref-furnace-mite-side-v1.png',
    backPaintRef: 'assets/2d/ref-furnace-mite-back-v1.png',
    topPaintRef: 'assets/2d/ref-furnace-mite-top-v1.png',
    // Charcoal roof plates can project directly. Cyan is registered by the
    // measured macro pass below; direct 1024→19 projection fragments it.
    topPaintColors: [DARK],
    sidePaint: true,
    targetWidth: 19,
    voxelSize: 0.055,
    bodyColor: YELLOW,
    palette: [DARK, 0x151a20, YELLOW, CYAN, FURNACE_HEAT],
    // One-voxel relief instead of the two-voxel frontOnly inset: the enlarged
    // visor stays framed by charcoal but remains visible at swarm scale.
    frontOnly: [],
    armorColors: [DARK, 0x151a20, YELLOW],
    segments: [
      { from: 0, to: 0.72, depthFactor: 0.42 },
      { from: 0.72, to: 1, depthFactor: 0.34 },
    ],
    // The canonical final sheets already contain the paint-role swap. Their
    // charcoal armor plates protrude two voxels, strengthening only approved
    // roof/front/side macro forms at the 19-column swarm resolution.
    raisedColors: [DARK],
    raisedTopFraction: 0.32,
    topFootprintLegs: {
      ref: 'assets/2d/ref-furnace-mite-top-v1.png',
      bodyWidthFraction: 0.58,
      bodyDepthFraction: 0.58,
      clearThroughY: 5,
      radius: 1,
      jointY: [3, 5],
      shaftY: [1, 3],
      footY: [0, 1],
      shaftColor: YELLOW,
      jointColor: DARK,
      footColor: DARK,
    },
    topCrucible: {
      ref: 'assets/2d/ref-furnace-mite-top-v1.png',
      centerX: 0.5,
      // The approved top sheet places the crucible behind the body centre.
      centerZ: 0.31,
      widthFraction: 0.32,
      depthFraction: 0.28,
      rimThickness: 1,
      rimHeight: 2,
      rimColor: DARK,
      innerColor: FURNACE_HEAT,
      // One source-shell layer down, plus the two raised rim layers: visibly
      // hot from the gameplay camera while remaining a genuine open cavity.
      cavityDepth: 1,
    },
    // Measured from the four approved sheets after their reduction to the
    // 19-column swarm grid. This stabilizes only the visor/frame and vents;
    // silhouette, volume and gameplay size remain reference-driven.
    macroSurfaceDetails: {
      paintDepth: 1,
      frontPlateDepth: 2,
      frontInset: 3,
      visorColor: CYAN,
      frameColor: DARK,
      ventColor: FURNACE_HEAT,
      front: {
        // Wide two-row brow plus the narrower one-row centre drop visible in
        // the approved front sheet at 19-column resolution.
        visorBands: [
          { x: [4, 14], rows: [6, 7] },
          { x: [6, 12], rows: [8, 8] },
        ],
        // One-cell charcoal outline that follows the visor's lower step.
        frameBands: [
          { x: [3, 15], rows: [5, 5] },
          { x: [3, 3], rows: [6, 7] },
          { x: [15, 15], rows: [6, 7] },
          { x: [3, 5], rows: [8, 8] },
          { x: [13, 15], rows: [8, 8] },
          { x: [5, 13], rows: [9, 9] },
        ],
        // The side sheet supplies the orange vent blocks. Painting them onto
        // the front face would interrupt the approved charcoal outline.
        ventX: [],
        ventRows: [6, 7],
      },
      side: {
        visorZ: [14, 14],
        visorRows: [6, 8],
        frameZ: [13, 16],
        frameRows: [5, 9],
        ventZ: [11, 12],
        ventRows: [6, 7],
      },
      top: {
        visorX: [5, 13],
        visorZ: [16, 17],
        frameX: [4, 14],
        frameZ: [15, 18],
      },
    },
  },
  sparkrunner: {
    kind: 'enemy',
    // v6 (2026-08-04) — HAND-AUTHORED sheets at the model's exact 25x60 voxel
    // resolution (tools/make-sparkrunner-sheets.mjs), so downsampleMap is a
    // lossless 1:1 mapping and 1-cell details survive verbatim. This replaces
    // the Codex-generated v5 set, which had two problems the 45-degree capture
    // made obvious: the "arms" were the outer third of the TORSO SLAB behind a
    // 1-column notch that the depth pass then extruded to full chest depth, so
    // the whole upper body read as one box; and the flat boots gave an enemy
    // that glides at 8.5 u/s nothing to glide ON, which read as hovering.
    ref: 'assets/2d/ref-sparkrunner-front-v6.png',
    sideProfileRef: 'assets/2d/ref-sparkrunner-side-v6.png',
    backPaintRef: 'assets/2d/ref-sparkrunner-back-v6.png',
    // 25 columns (was 21) buys the room for arms that hang CLEAR of the torso
    // behind 2-column gaps; the smaller voxel holds the world footprint at the
    // 0.78 x 1.92u the gameplay radius/scale were tuned around.
    targetWidth: 25,
    voxelSize: 0.032,
    bodyColor: ELECTRIC_CYAN,
    palette: [ELECTRIC_CYAN, DARK, AMBER],
    // Amber is deliberately NOT frontOnly: that path insets it 2 voxels, which
    // swallows the visor at the game's 3/4 camera (the foreman lesson).
    frontOnly: [],
    // Amber is left as a DETAIL colour (armorColors therefore defaults to the
    // body colour alone), so the visor and the hazard bands sink one voxel.
    // Worth recording because the intuition is wrong: promoting amber to
    // armour to make those bands flush was measured at 4760 triangles against
    // 4736 for the recessed version — recessing details is NOT what this model
    // spends its geometry on, so choose inset on looks, not on budget.
    // With a measured side profile these bands only supply each volume's own
    // centre/half-width for the left-right falloff. The middle band spans the
    // ARMS on purpose (cols 0-24); splitting it would treat the forearms as
    // near-centre and extrude them as deep as the chest — exactly the v5 bug.
    // Fractions are picked so `ceil(to * 60)` lands on the intended first row
    // of the next volume: head 0-18, shoulders/arms/torso 19-43, legs 44-59.
    segments: [
      { from: 0, to: 0.31, depthFactor: 0.36 },
      { from: 0.31, to: 0.73, depthFactor: 0.32 },
      { from: 0.73, to: 1, depthFactor: 0.28 },
    ],
    raisedTopFraction: 0.12,
    // Rows 51-59 of the sheet, i.e. grid Y 0-8, under each leg (cols 7-10 and
    // 14-17). Keep in sync with make-sparkrunner-sheets.mjs, which asserts it.
    // Radius 4 against legs authored at half-depth 2 is the whole point: the
    // tyre has to break the strut's silhouette fore and aft or it just reads as
    // a darker boot, which is exactly what a radius-3 first pass did.
    wheels: {
      radius: 4,
      centerY: 4,
      columns: [
        [7, 10],
        [14, 17],
      ],
      tireColor: DARK,
      hubColor: AMBER,
      // 1, not 2. At radius 2 the cap covered five of the wheel face's nine
      // cells and the 3/4 camera read it as a yellow toe rather than a hub.
      hubRadius: 1,
    },
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
    ref: 'assets/2d/ref-drone-front-v2.png',
    // The v2 redesign replaces the old three-slab saucer with a measured
    // central fuselage and attached ducted-fan pods. Use the side sheet for
    // real row depth and flank paint; the back sheet supplies the rear vents.
    sideProfileRef: 'assets/2d/ref-drone-side-v2.png',
    backPaintRef: 'assets/2d/ref-drone-back-v2.png',
    sidePaint: true,
    // Stay inside the swarm budget while preserving the large visor, roof
    // plate and fan apertures. The smaller voxel keeps the old ~0.95u width.
    targetWidth: 21,
    voxelSize: 0.045,
    bodyColor: PINK,
    palette: [PINK, DARK, AMBER],
    frontOnly: [AMBER],
    // Fallback only when the measured side sheet cannot load.
    segments: [
      { from: 0, to: 0.34, depthFactor: 0.28 },
      { from: 0.34, to: 0.82, depthFactor: 0.46 },
      { from: 0.82, to: 1, depthFactor: 0.34 },
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
  // FIELD ENGINEER — new starting-character model (2026-08-03). Built from the
  // hand-authored flat sheets in art/concept/field-engineer/, which audited
  // clean: one contiguous piece each (plus a few 1-3 px specks that vanish in
  // the downsample), an exact 5-colour palette with no antialiasing, and — the
  // part that actually matters — all THREE views share the same content height
  // (730 px), which is what icon-voxelizer needs since it aligns rows by height
  // fraction.
  //
  // Registered as the Field Engineer's live player model and definitively
  // approved in-game after multi-angle and 400+ swarm verification.
  'field-engineer': {
    kind: 'player',
    ref: 'assets/2d/ref-field-engineer-front-v1.png',
    // Measured-profile pipeline. voxelizeMultiView was BUILT AND REJECTED
    // here: the hull cross-product fused the arms and legs into one solid
    // block, exactly the phantom-fill this path exists to avoid.
    // DEPTH comes from a PACK-FREE side sheet (tools/make-field-engineer-
    // depth-sheet.mjs), not from the artist's full side view. sideProfileRef
    // yields ONE half-depth per row and applies it SYMMETRICALLY about the body
    // axis, so the rear-mounted pack was inflating the FRONT of the torso as
    // well: the character read as a barrel, and the arms — which share those
    // rows — inherited ~12 voxels of depth against ~7 of width and came out as
    // fat cylinders. Cutting the pack takes the depth/width ratio from 0.66 to
    // 0.42. runtimeDetails restores the rear pack as dedicated volume;
    // backPaintRef only paints the existing shell and cannot add geometry.
    sideProfileRef: 'assets/2d/ref-field-engineer-side-depth-v1.png',
    backPaintRef: 'assets/2d/ref-field-engineer-back-v1.png',
    // sidePaint is deliberately OFF. It was tried and it speckled the flanks:
    // this side sheet uses navy as a graphic OUTLINE around every shape, so
    // repainting the outer faces from it scatters dark pixels over the hull.
    sidePaint: false,
    // 89 columns. The earlier 45 was chosen from the on-screen pixel budget
    // (the player occupies about 50x58 px at 1080p), but that budget only
    // governs the GAME view — the model is also judged in turnarounds and will
    // front a character-select screen, and at 45 the reference's panel lines
    // and wrist detail were being averaged away. The sheets are drawn at native
    // resolution and are NOT an upscale of a small grid (no lossless downsample
    // factor exists), so this is a chosen fidelity point, not a recovered one.
    targetWidth: 89,
    // 130 rows at 0.0154 keeps the ~2u height the primitive player rig was
    // tuned around, so hitboxes and camera framing are unaffected.
    voxelSize: 0.0154,
    bodyColor: BONE,
    // Palette MEASURED off the sheets: #e8e2d2 cream, #222831 navy, #ff8f2f
    // orange, #162533 deep shadow, #01e6fe cyan. Each is within a few units of
    // an existing cast constant, so the constants are REUSED rather than
    // cloned — five near-duplicate hexes would drift apart over time. Verified
    // the two darks still separate: #162533 lands nearer VISOR_DARK than DARK.
    palette: [BONE, ORANGE, DARK, VISOR_DARK, LOGO_CYAN],
    // Cyan and visor stay out of frontOnly: that path insets 2 voxels and the
    // slot goes black at the game camera angle (the foreman lesson).
    frontOnly: [],
    // Navy counts as ARMOUR: in these sheets it is a graphic OUTLINE around
    // every shape, not a physical recess. Carving it was tried and the whole
    // body came out pitted like a pincushion. The limbs are separated by REAL
    // transparent gaps in the art, not by the outline — see .
    armorColors: [BONE, ORANGE, DARK],
    // THE fix for the fused arms and legs. The reference is deliberately
    // asymmetric (one arm raised holding the tool, the other down), and the
    // symmetrization pass was mirroring solid material into the armpit gaps
    // and packing them shut.
    asymmetric: true,
    runtimeDetails: {
      backpack: {
        size: [0.82, 0.68, 0.28],
        position: [-0.03, 1.18, -0.35],
        bodyColor: BONE,
        trimColor: DARK,
        accentColor: LOGO_CYAN,
        socketCount: 3,
      },
    },
    segments: [
      { from: 0, to: 0.3 }, // helmet
      { from: 0.3, to: 0.68 }, // torso, arms, backpack
      { from: 0.68, to: 1 }, // legs and boots
    ],
    raisedTopFraction: 0,
    previewScale: 2.0,
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
    // scale (Crusher 3.1x) multiplies on top. Gold is a full material (crown
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
  // Foundry container variants (2026-08-18). Same geometry and the same
  // recolor-the-output technique as the orange/mauve pair — the model is reused
  // ON PURPOSE as a cheap test of whether Map 2 needs long cover at all, before
  // any bespoke foundry prop is authored. If the geography earns its place, a
  // purpose-built model replaces these; if it does not, nothing was spent.
  'container-foundry-violet': {
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
      [TEAL_LIGHT]: FOUNDRY_CONTAINER_VIOLET_LIGHT,
      [TEAL]: FOUNDRY_CONTAINER_VIOLET,
      [TEAL_DARK]: FOUNDRY_CONTAINER_VIOLET_DARK,
    },
    previewScale: 0.55,
  },
  'container-foundry-moss': {
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
      [TEAL_LIGHT]: FOUNDRY_CONTAINER_MOSS_LIGHT,
      [TEAL]: FOUNDRY_CONTAINER_MOSS,
      [TEAL_DARK]: FOUNDRY_CONTAINER_MOSS_DARK,
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
  // Map-2 scatter prop (2026-08-17): the Swarm Foundry's power cell — the
  // foundry's counterpart to Map 1's barrel, same role (small, scattered,
  // per-run randomized) with the active-plant vocabulary instead of scrap.
  //
  // MEASURED-PROFILE path (sideProfileRef), NOT 3-view carving — reversed
  // 2026-08-17 after the carved version read as a plain cube in game.
  //
  // The reason is geometric, not tuning: a 2-view visual hull can only make
  // RECTANGULAR cross-sections. At each height it intersects the front
  // silhouette extruded along Z with the side silhouette extruded along X,
  // which is the Cartesian product of two width profiles — a rectangle. It
  // can never cut a corner, so the faceted canister painted into the sheets
  // was thrown away and a cuboid came out.
  //
  // The extrusion path keeps the elliptical per-column falloff
  // (rawDepth = rowMaxHalf * sqrt(1 - t^2)) that makes the barrel read as a
  // drum instead of a crate, while sideProfileRef still takes the per-row
  // depth from the real side sheet — so the cap fins and the stepped plinth
  // keep their measured depth instead of a guessed dome.
  //
  // The upright proportion is a hard constraint, not taste. A squat wide box
  // with dark corner posts and a horizontal mid band is the treasure CHEST
  // (prop-chest-front-v2.png), an interactive reward object — scenery that
  // reads as a chest sends players running at it for nothing. Distinguishing
  // by color alone is not enough: DIRECCION_ARTE rule 1 requires silhouette.
  powercell: {
    kind: 'prop',
    ref: 'assets/2d/prop-powercell-front-v6.png',
    // Back is byte-identical to the front on purpose (same reasoning as the
    // scaffold and container): a faceted canister is front/back symmetric,
    // and props spawn at a random yaw — a dark back face would leave half
    // the cells looking switched off.
    sideProfileRef: 'assets/2d/prop-powercell-side-v6.png',
    backPaintRef: 'assets/2d/prop-powercell-back-v6.png',
    // Outer left/right faces take their colors from the side sheet instead of
    // smearing the front silhouette's edge pixels down the flanks.
    sidePaint: true,
    // Fallback only: sideProfileRef supplies rowMaxHalf for every row. Kept at
    // the barrel's value so a missing side sheet degrades to a drum-proportioned
    // cell rather than a wafer.
    depthFactor: 0.48,
    // 24 columns keeps the two features that would otherwise vanish: the
    // cyan column lands on ~1.5 columns and each fin on ~2.5. At the
    // barrel's 22 the fin gaps started fusing.
    targetWidth: 24,
    // 24 x 0.055 = 1.32m wide, ~1.6m tall — deliberately the barrel's
    // footprint (1.3 x 1.5) so Map 2 navigation feels like Map 1.
    voxelSize: 0.055,
    bodyColor: POWERCELL_FACE,
    palette: [
      POWERCELL_FACE,
      POWERCELL_FLANK,
      POWERCELL_FLANK_DARK,
      POWERCELL_FRAME,
      POWERCELL_RECESS,
      POWERCELL_TERMINAL,
      POWERCELL_CORE,
    ],
    frontOnly: [],
    previewScale: 1.4,
  },
  // Warm oxide recolour of `powercell`: same ref, same classification palette,
  // luminance-matched to the steel ramp so shading depth is unchanged.
  'powercell-rust': {
    kind: 'prop',
    ref: 'assets/2d/prop-powercell-front-v6.png',
    // Back is byte-identical to the front on purpose (same reasoning as the
    // scaffold and container): a faceted canister is front/back symmetric,
    // and props spawn at a random yaw — a dark back face would leave half
    // the cells looking switched off.
    sideProfileRef: 'assets/2d/prop-powercell-side-v6.png',
    backPaintRef: 'assets/2d/prop-powercell-back-v6.png',
    // Outer left/right faces take their colors from the side sheet instead of
    // smearing the front silhouette's edge pixels down the flanks.
    sidePaint: true,
    // Fallback only: sideProfileRef supplies rowMaxHalf for every row. Kept at
    // the barrel's value so a missing side sheet degrades to a drum-proportioned
    // cell rather than a wafer.
    depthFactor: 0.48,
    // 24 columns keeps the two features that would otherwise vanish: the
    // cyan column lands on ~1.5 columns and each fin on ~2.5. At the
    // barrel's 22 the fin gaps started fusing.
    targetWidth: 24,
    // 24 x 0.055 = 1.32m wide, ~1.6m tall — deliberately the barrel's
    // footprint (1.3 x 1.5) so Map 2 navigation feels like Map 1.
    voxelSize: 0.055,
    bodyColor: POWERCELL_FACE,
    palette: [
      POWERCELL_FACE,
      POWERCELL_FLANK,
      POWERCELL_FLANK_DARK,
      POWERCELL_FRAME,
      POWERCELL_RECESS,
      POWERCELL_TERMINAL,
      POWERCELL_CORE,
    ],
    frontOnly: [],
    previewScale: 1.4,
    recolorMap: {
      [POWERCELL_FACE]: POWERCELL_RUST_FACE,
      [POWERCELL_FLANK]: POWERCELL_RUST_FLANK,
      [POWERCELL_FLANK_DARK]: POWERCELL_RUST_FLANK_DARK,
      [POWERCELL_FRAME]: POWERCELL_RUST_FRAME,
    },
  },
  // Pale recolour of `powercell`, the counterpart to Map 1's white barrel: it
  // reads brighter than the other two so the field carries a light note.
  'powercell-bone': {
    kind: 'prop',
    ref: 'assets/2d/prop-powercell-front-v6.png',
    // Back is byte-identical to the front on purpose (same reasoning as the
    // scaffold and container): a faceted canister is front/back symmetric,
    // and props spawn at a random yaw — a dark back face would leave half
    // the cells looking switched off.
    sideProfileRef: 'assets/2d/prop-powercell-side-v6.png',
    backPaintRef: 'assets/2d/prop-powercell-back-v6.png',
    // Outer left/right faces take their colors from the side sheet instead of
    // smearing the front silhouette's edge pixels down the flanks.
    sidePaint: true,
    // Fallback only: sideProfileRef supplies rowMaxHalf for every row. Kept at
    // the barrel's value so a missing side sheet degrades to a drum-proportioned
    // cell rather than a wafer.
    depthFactor: 0.48,
    // 24 columns keeps the two features that would otherwise vanish: the
    // cyan column lands on ~1.5 columns and each fin on ~2.5. At the
    // barrel's 22 the fin gaps started fusing.
    targetWidth: 24,
    // 24 x 0.055 = 1.32m wide, ~1.6m tall — deliberately the barrel's
    // footprint (1.3 x 1.5) so Map 2 navigation feels like Map 1.
    voxelSize: 0.055,
    bodyColor: POWERCELL_FACE,
    palette: [
      POWERCELL_FACE,
      POWERCELL_FLANK,
      POWERCELL_FLANK_DARK,
      POWERCELL_FRAME,
      POWERCELL_RECESS,
      POWERCELL_TERMINAL,
      POWERCELL_CORE,
    ],
    frontOnly: [],
    previewScale: 1.4,
    recolorMap: {
      [POWERCELL_FACE]: POWERCELL_BONE_FACE,
      [POWERCELL_FLANK]: POWERCELL_BONE_FLANK,
      [POWERCELL_FLANK_DARK]: POWERCELL_BONE_FLANK_DARK,
      [POWERCELL_FRAME]: POWERCELL_BONE_FRAME,
    },
  },
  // Map 2 perimeter chimney. Replaces the stackable segment+cap pair, which was
  // abandoned 2026-08-17: to tile, its modules needed perfectly vertical,
  // constant-width sides, and that constraint is exactly what made the towers
  // read as boxes. Measured on the old sheet — row width 768..768 across all
  // 512 rows, i.e. ZERO silhouette variation. This model buys the silhouette
  // back with a stepped plinth, a tapering shaft, protruding flange bands, an
  // external pipe and a flared crown.
  //
  // FRONT-ONLY on purpose, the barrel's path rather than the container's.
  // voxelizeMultiView cannot produce a round section at all: it carves by the
  // intersection of two orthogonal silhouettes, and the visual hull of a
  // cylinder seen front and side IS a square prism. Elliptical extrusion from
  // one sheet is the only route to the cylindrical read the user asked for.
  // It also protects the gap between the pipe and the shaft — a front-only
  // extrusion draws nothing behind a pixel the front shows empty, whereas hull
  // carving would pack that 3.4%-of-bbox hole with phantom voxels (the
  // scaffold lesson, PROMPTS_IMAGENES §7).
  'foundry-stack': {
    kind: 'prop',
    ref: 'assets/2d/prop-foundry-stack-front-v3.png',
    // MEASURED depth and real rear paint, replacing the estimated ellipse.
    // These are sideProfileRef/backPaintRef, NOT refSide/refBack: the latter
    // switch the model to voxelizeMultiView, which would both square off the
    // section and pack the pipe gap with phantom voxels. This pair only
    // modulates the front extrusion, so the round cross-section survives.
    sideProfileRef: 'assets/2d/prop-foundry-stack-side-v2.png',
    backPaintRef: 'assets/2d/prop-foundry-stack-back-v2.png',
    // Outer left/right faces take their colours from the side sheet instead of
    // smearing the front silhouette's edge pixels down the flanks.
    sidePaint: true,
    // 28 columns over a 301px-wide sheet is ~10.75px per column; every feature
    // was widened to clear two columns before this entry was written.
    targetWidth: 28,
    // 28 x 0.093 = 2.60m wide; the sheet's 3.29 aspect makes that ~8.6m tall.
    // world.ts scales instances uniformly for height variety — uniform, never
    // per-axis, so the voxels stay cubes.
    voxelSize: 0.093,
    bodyColor: FOUNDRY_CASING,
    palette: [
      DARKEST_RECESS,
      SHEET_CASING,
      SHEET_PLATE,
      FOUNDRY_TRIM_WHITE,
      FOUNDRY_STACK_SHEET_CONDUIT,
    ],
    // Classify against the sheet's real tones, THEN recolor. Entering the
    // darker values as palette members instead would make them lose to the
    // originals they are meant to replace (the container teal->orange lesson).
    recolorMap: {
      [SHEET_CASING]: FOUNDRY_CASING,
      [SHEET_PLATE]: FOUNDRY_PLATE,
      [FOUNDRY_STACK_SHEET_CONDUIT]: FOUNDRY_TRIM_WHITE,
    },
    frontOnly: [],
    // Fallback only, now that sideProfileRef supplies a measured depth for every
    // row. Kept at the barrel's value so a missing side sheet degrades to a
    // round column rather than a wafer.
    depthFactor: 0.48,
    raisedTopFraction: 0,
    previewScale: 0.5,
  },
  // Warm iron recolour of `foundry-stack`: identical geometry and sheets, a warmer
  // and slightly lighter body (casing luma 45 against the base's 38).
  'foundry-stack-iron': {
    kind: 'prop',
    ref: 'assets/2d/prop-foundry-stack-front-v3.png',
    // MEASURED depth and real rear paint, replacing the estimated ellipse.
    // These are sideProfileRef/backPaintRef, NOT refSide/refBack: the latter
    // switch the model to voxelizeMultiView, which would both square off the
    // section and pack the pipe gap with phantom voxels. This pair only
    // modulates the front extrusion, so the round cross-section survives.
    sideProfileRef: 'assets/2d/prop-foundry-stack-side-v2.png',
    backPaintRef: 'assets/2d/prop-foundry-stack-back-v2.png',
    // Outer left/right faces take their colours from the side sheet instead of
    // smearing the front silhouette's edge pixels down the flanks.
    sidePaint: true,
    // 28 columns over a 301px-wide sheet is ~10.75px per column; every feature
    // was widened to clear two columns before this entry was written.
    targetWidth: 28,
    // 28 x 0.093 = 2.60m wide; the sheet's 3.29 aspect makes that ~8.6m tall.
    // world.ts scales instances uniformly for height variety — uniform, never
    // per-axis, so the voxels stay cubes.
    voxelSize: 0.093,
    bodyColor: FOUNDRY_CASING,
    palette: [
      DARKEST_RECESS,
      SHEET_CASING,
      SHEET_PLATE,
      FOUNDRY_TRIM_WHITE,
      FOUNDRY_STACK_SHEET_CONDUIT,
    ],
    // Classify against the sheet's real tones, THEN recolor. Entering the
    // darker values as palette members instead would make them lose to the
    // originals they are meant to replace (the container teal->orange lesson).
    recolorMap: {
      [SHEET_CASING]: FOUNDRY_IRON_CASING,
      [SHEET_PLATE]: FOUNDRY_IRON_PLATE,
      [FOUNDRY_STACK_SHEET_CONDUIT]: FOUNDRY_TRIM_WHITE,
    },
    frontOnly: [],
    // Fallback only, now that sideProfileRef supplies a measured depth for every
    // row. Kept at the barrel's value so a missing side sheet degrades to a
    // round column rather than a wafer.
    depthFactor: 0.48,
    raisedTopFraction: 0,
    previewScale: 0.5,
  },
  // Graphite recolour of `foundry-stack`: near-neutral and the darkest of the
  // three (casing luma 28), so the ring reads as three different metals.
  'foundry-stack-graphite': {
    kind: 'prop',
    ref: 'assets/2d/prop-foundry-stack-front-v3.png',
    // MEASURED depth and real rear paint, replacing the estimated ellipse.
    // These are sideProfileRef/backPaintRef, NOT refSide/refBack: the latter
    // switch the model to voxelizeMultiView, which would both square off the
    // section and pack the pipe gap with phantom voxels. This pair only
    // modulates the front extrusion, so the round cross-section survives.
    sideProfileRef: 'assets/2d/prop-foundry-stack-side-v2.png',
    backPaintRef: 'assets/2d/prop-foundry-stack-back-v2.png',
    // Outer left/right faces take their colours from the side sheet instead of
    // smearing the front silhouette's edge pixels down the flanks.
    sidePaint: true,
    // 28 columns over a 301px-wide sheet is ~10.75px per column; every feature
    // was widened to clear two columns before this entry was written.
    targetWidth: 28,
    // 28 x 0.093 = 2.60m wide; the sheet's 3.29 aspect makes that ~8.6m tall.
    // world.ts scales instances uniformly for height variety — uniform, never
    // per-axis, so the voxels stay cubes.
    voxelSize: 0.093,
    bodyColor: FOUNDRY_CASING,
    palette: [
      DARKEST_RECESS,
      SHEET_CASING,
      SHEET_PLATE,
      FOUNDRY_TRIM_WHITE,
      FOUNDRY_STACK_SHEET_CONDUIT,
    ],
    // Classify against the sheet's real tones, THEN recolor. Entering the
    // darker values as palette members instead would make them lose to the
    // originals they are meant to replace (the container teal->orange lesson).
    recolorMap: {
      [SHEET_CASING]: FOUNDRY_GRAPHITE_CASING,
      [SHEET_PLATE]: FOUNDRY_GRAPHITE_PLATE,
      [FOUNDRY_STACK_SHEET_CONDUIT]: FOUNDRY_TRIM_WHITE,
    },
    frontOnly: [],
    // Fallback only, now that sideProfileRef supplies a measured depth for every
    // row. Kept at the barrel's value so a missing side sheet degrades to a
    // round column rather than a wafer.
    depthFactor: 0.48,
    raisedTopFraction: 0,
    previewScale: 0.5,
  },
  // Arena containment wall segment. Repeated 30 times per side to enclose the
  // 180-unit arena, which is why 36 columns x 1/6 voxelSize is exactly 6.0 units
  // wide and 12.0 tall — a segment that does not divide the side leaves a sliver.
  //
  // Repetition is CORRECT here, unlike the stackable tower module that failed
  // for the same property. A tower must read tall and varied; a wall IS a
  // repeating straight element. What stops it reading as one flat slab is the
  // step in its TOP edge — a tall pilaster beside a lower panel — so that the
  // run alternates between bays you can see over and columns you cannot.
  //
  // Height 12 is measured, not chosen. With the player at the arena edge the
  // boundary sits 31 units from the camera, and a wall of height H tops out at
  // atan((24 - H) / 31) below horizontal; the frame's top edge is 26.6 degrees.
  // 12 lands at 21.2, so it covers the void band completely and is clipped by
  // the frame, which is what sells it as a structure too big to see the top of.
  //
  // Front-only with a thin depthFactor, the scaffold's recipe: a wall is a flat
  // slab and needs no side sheet, and front-only extrusion cannot fill the
  // notch above the panel with phantom voxels the way hull carving would.
  'arena-wall': {
    kind: 'prop',
    ref: 'assets/2d/prop-arena-wall-front-v1.png',
    targetWidth: 36,
    voxelSize: 1 / 9,
    bodyColor: WALL_PANEL,
    palette: [WALL_RECESS, WALL_PANEL, WALL_RAISED, WALL_BOLT, BONE],
    frontOnly: [],
    // ~1.6 units thick on a 6.0-wide segment. Only the inner face is ever seen
    // — the player cannot leave the arena — so the back is mirrored rather than
    // painted from a sheet.
    depthFactor: 0.26,
    mirrorBack: true,
    raisedTopFraction: 0,
    previewScale: 0.6,
  },
  // Map 1 recolour: cooler and darker, toward the Scrapyard's slate floor.
  'arena-wall-scrapyard': {
    kind: 'prop',
    ref: 'assets/2d/prop-arena-wall-front-v1.png',
    targetWidth: 36,
    voxelSize: 1 / 9,
    bodyColor: WALL_PANEL,
    palette: [WALL_RECESS, WALL_PANEL, WALL_RAISED, WALL_BOLT, BONE],
    recolorMap: {
      [WALL_PANEL]: WALL_M1_PANEL,
      [WALL_RAISED]: WALL_M1_RAISED,
    },
    frontOnly: [],
    depthFactor: 0.26,
    mirrorBack: true,
    raisedTopFraction: 0,
    previewScale: 0.6,
  },
  // Map 2 recolour: darker and warmed a touch, so the barrier belongs to the
  // foundry's ember sky rather than to the Scrapyard's cold one.
  'arena-wall-foundry': {
    kind: 'prop',
    ref: 'assets/2d/prop-arena-wall-front-v1.png',
    targetWidth: 36,
    voxelSize: 1 / 9,
    bodyColor: WALL_PANEL,
    palette: [WALL_RECESS, WALL_PANEL, WALL_RAISED, WALL_BOLT, BONE],
    recolorMap: {
      [WALL_PANEL]: WALL_M2_PANEL,
      [WALL_RAISED]: WALL_M2_RAISED,
    },
    frontOnly: [],
    depthFactor: 0.26,
    mirrorBack: true,
    raisedTopFraction: 0,
    previewScale: 0.6,
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
    // Landmark scale (2026-07-09 user call): the boss door should dwarf the
    // player and read across the arena. Raised 0.12 -> 0.16 on 2026-08-06
    // (~3.6u wide/4.5u tall -> ~4.8u/6.0u) because zero of six recorded human
    // runs ever walked to it. BOSS.totemColliderRadius scales with this.
    voxelSize: 0.16,
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
        asymmetric: def.asymmetric,
        backPaintRef: def.backPaintRef,
        topPaintRef: def.topPaintRef,
        topPaintColors: def.topPaintColors,
        raisedColors: def.raisedColors,
        bodyColor: def.bodyColor,
      });
  if (def.recolorMap) recolorGrid(grid, def.recolorMap);
  for (const region of def.recolorRegions ?? []) recolorGridRegion(grid, region);
  if (def.wheels) stampWheels(grid, def.wheels);
  if (def.topFootprintLegs) stampTopFootprintLegs(grid, def.topFootprintLegs);
  if (def.topCrucible) stampTopCrucible(grid, def.topCrucible);
  if (def.macroSurfaceDetails) stampMacroSurfaceDetails(grid, def.macroSurfaceDetails);
  return grid;
}

/** Restores sheet-approved macro paint after low-resolution projection. Side
 * and top rays recolor their shell; the front fills a shallow plate inside the
 * existing bounds. Everything remains one grid, geometry, mesh and draw call. */
export function stampMacroSurfaceDetails(
  grid: VoxelGrid,
  spec: NonNullable<VoxelModelDef['macroSurfaceDetails']>,
): void {
  const height = grid.length;
  const depth = grid[0]?.length ?? 0;
  const width = grid[0]?.[0]?.length ?? 0;
  if (height === 0 || width === 0 || depth === 0) return;

  const paintFront = (x: number, viewRow: number, color: number) => {
    const y = height - 1 - viewRow;
    if (y < 0 || y >= height || x < 0 || x >= width) return;
    const plateZ = Math.max(0, depth - 1 - spec.frontInset);
    for (let z = plateZ + 1; z < depth; z++) {
      const row = grid[y]?.[z];
      if (row) row[x] = null;
    }
    for (let z = plateZ; z >= Math.max(0, plateZ - spec.frontPlateDepth + 1); z--) {
      const row = grid[y]?.[z];
      if (!row) continue;
      row[x] = color;
    }
  };
  const paintFrontShell = (x: number, viewRow: number, color: number) => {
    const y = height - 1 - viewRow;
    if (y < 0 || y >= height || x < 0 || x >= width) return;
    let painted = 0;
    for (let z = depth - 1; z >= 0; z--) {
      const row = grid[y]?.[z];
      if (row?.[x] == null) continue;
      row[x] = color;
      painted++;
      if (painted >= spec.paintDepth) return;
    }
  };
  const paintSides = (z: number, viewRow: number, color: number) => {
    const y = height - 1 - viewRow;
    if (y < 0 || y >= height || z < 0 || z >= depth) return;
    const row = grid[y]?.[z];
    if (!row) return;
    for (const direction of [1, -1] as const) {
      let painted = 0;
      for (let x = direction > 0 ? 0 : width - 1; x >= 0 && x < width; x += direction) {
        if (row[x] == null) continue;
        row[x] = color;
        painted++;
        if (painted >= spec.paintDepth) break;
      }
    }
  };
  const paintTop = (x: number, z: number, color: number) => {
    if (x < 0 || x >= width || z < 0 || z >= depth) return;
    let painted = 0;
    for (let y = height - 1; y >= 0; y--) {
      const row = grid[y]?.[z];
      if (row?.[x] == null) continue;
      row[x] = color;
      painted++;
      if (painted >= spec.paintDepth) return;
    }
  };
  const paintRect = (
    a: readonly [number, number],
    b: readonly [number, number],
    paint: (a: number, b: number, color: number) => void,
    color: number,
  ) => {
    for (let bv = b[0]; bv <= b[1]; bv++) {
      for (let av = a[0]; av <= a[1]; av++) paint(av, bv, color);
    }
  };

  // Build the inset front plate first. The side register sits one layer behind
  // that plane, so it stays visible in profile without breaking the frontal
  // charcoal outline. The top wrap is registered last.
  for (const band of spec.front.frameBands) paintRect(band.x, band.rows, paintFront, spec.frameColor);
  for (const band of spec.front.visorBands) paintRect(band.x, band.rows, paintFront, spec.visorColor);
  paintRect(spec.side.frameZ, spec.side.frameRows, paintSides, spec.frameColor);
  paintRect(spec.side.visorZ, spec.side.visorRows, paintSides, spec.visorColor);
  paintRect(spec.top.frameX, spec.top.frameZ, paintTop, spec.frameColor);
  paintRect(spec.top.visorX, spec.top.visorZ, paintTop, spec.visorColor);

  for (let row = spec.front.ventRows[0]; row <= spec.front.ventRows[1]; row++) {
    for (const x of spec.front.ventX) paintFrontShell(x, row, spec.ventColor);
  }
  paintRect(spec.side.ventZ, spec.side.ventRows, paintSides, spec.ventColor);
}

/** Replaces the lower extruded leg mass with four face-connected, diagonally
 * splayed corner legs. Every cell remains in the source VoxelGrid, so the
 * resulting enemy is still one BufferGeometry and one InstancedMesh. */
export function stampTopFootprintLegs(
  grid: VoxelGrid,
  spec: NonNullable<VoxelModelDef['topFootprintLegs']>,
): void {
  const height = grid.length;
  const depth = grid[0]?.length ?? 0;
  const width = grid[0]?.[0]?.length ?? 0;
  if (height === 0 || width === 0 || depth === 0) return;

  let xMin = width;
  let xMax = -1;
  let zMin = depth;
  let zMax = -1;
  for (const slice of grid) {
    for (let z = 0; z < slice.length; z++) {
      const row = slice[z];
      if (!row) continue;
      for (let x = 0; x < row.length; x++) {
        if (row[x] == null) continue;
        xMin = Math.min(xMin, x);
        xMax = Math.max(xMax, x);
        zMin = Math.min(zMin, z);
        zMax = Math.max(zMax, z);
      }
    }
  }
  if (xMax < 0 || zMax < 0) return;

  const occupiedWidth = xMax - xMin + 1;
  const occupiedDepth = zMax - zMin + 1;
  const bodyWidth = Math.max(3, Math.round(occupiedWidth * spec.bodyWidthFraction));
  const bodyDepth = Math.max(3, Math.round(occupiedDepth * spec.bodyDepthFraction));
  const centerX = Math.round((xMin + xMax) / 2);
  const centerZ = Math.round((zMin + zMax) / 2);
  const bodyX0 = centerX - Math.floor(bodyWidth / 2);
  const bodyX1 = bodyX0 + bodyWidth - 1;
  const bodyZ0 = centerZ - Math.floor(bodyDepth / 2);
  const bodyZ1 = bodyZ0 + bodyDepth - 1;

  // Remove the sheet-extruded outer lower volume. The central lower hull stays
  // intact; each new joint overlaps its corner to guarantee attachment.
  for (let y = 0; y <= Math.min(height - 1, spec.clearThroughY); y++) {
    for (let z = 0; z < depth; z++) {
      const row = grid[y]?.[z];
      if (!row) continue;
      for (let x = 0; x < width; x++) {
        if (x < bodyX0 || x > bodyX1 || z < bodyZ0 || z > bodyZ1) row[x] = null;
      }
    }
  }

  const paintBlock = (cx: number, cz: number, yRange: readonly [number, number], color: number) => {
    for (let y = Math.max(0, yRange[0]); y <= Math.min(height - 1, yRange[1]); y++) {
      for (let z = Math.max(0, cz - spec.radius); z <= Math.min(depth - 1, cz + spec.radius); z++) {
        const row = grid[y]?.[z];
        if (!row) continue;
        for (let x = Math.max(0, cx - spec.radius); x <= Math.min(width - 1, cx + spec.radius); x++) {
          row[x] = color;
        }
      }
    }
  };

  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      const jointX = sx < 0 ? bodyX0 : bodyX1;
      const jointZ = sz < 0 ? bodyZ0 : bodyZ1;
      const footX = sx < 0 ? xMin + spec.radius : xMax - spec.radius;
      const footZ = sz < 0 ? zMin + spec.radius : zMax - spec.radius;
      const shaftX = Math.round((jointX + footX) / 2);
      const shaftZ = Math.round((jointZ + footZ) / 2);
      paintBlock(jointX, jointZ, spec.jointY, spec.jointColor);
      paintBlock(shaftX, shaftZ, spec.shaftY, spec.shaftColor);
      paintBlock(footX, footZ, spec.footY, spec.footColor);
    }
  }
}

/** Clears a genuine open cavity and raises its rim inside the measured shell.
 * The grid uses [y][z][x]; last Z is the front, so a centreZ below 0.5 places
 * the crucible toward the model's rear exactly as the approved top view does. */
function stampTopCrucible(
  grid: VoxelGrid,
  spec: NonNullable<VoxelModelDef['topCrucible']>,
): void {
  const height = grid.length;
  const depth = grid[0]?.length ?? 0;
  const width = grid[0]?.[0]?.length ?? 0;
  if (height === 0 || width === 0 || depth === 0) return;

  let xMin = width;
  let xMax = -1;
  let zMin = depth;
  let zMax = -1;
  let yTop = -1;
  for (let y = 0; y < height; y++) {
    for (let z = 0; z < depth; z++) {
      const row = grid[y]?.[z];
      if (!row) continue;
      for (let x = 0; x < width; x++) {
        if (row[x] == null) continue;
        xMin = Math.min(xMin, x);
        xMax = Math.max(xMax, x);
        zMin = Math.min(zMin, z);
        zMax = Math.max(zMax, z);
        yTop = Math.max(yTop, y);
      }
    }
  }
  if (yTop < 0) return;

  const occupiedWidth = xMax - xMin + 1;
  const occupiedDepth = zMax - zMin + 1;
  const outerWidth = Math.max(spec.rimThickness * 2 + 1, Math.round(occupiedWidth * spec.widthFraction));
  const outerDepth = Math.max(spec.rimThickness * 2 + 1, Math.round(occupiedDepth * spec.depthFraction));
  const centerX = Math.round(xMin + (occupiedWidth - 1) * spec.centerX);
  const centerZ = Math.round(zMin + (occupiedDepth - 1) * spec.centerZ);
  const outerX0 = Math.max(0, centerX - Math.floor(outerWidth / 2));
  const outerX1 = Math.min(width - 1, outerX0 + outerWidth - 1);
  const outerZ0 = Math.max(0, centerZ - Math.floor(outerDepth / 2));
  const outerZ1 = Math.min(depth - 1, outerZ0 + outerDepth - 1);
  const innerX0 = outerX0 + spec.rimThickness;
  const innerX1 = outerX1 - spec.rimThickness;
  const innerZ0 = outerZ0 + spec.rimThickness;
  const innerZ1 = outerZ1 - spec.rimThickness;
  const heatY = Math.max(0, yTop - spec.cavityDepth);

  // Remove the shell above the heat floor: this is a real cavity, not an
  // orange tile painted on a closed roof.
  for (let y = heatY + 1; y <= yTop; y++) {
    for (let z = innerZ0; z <= innerZ1; z++) {
      const row = grid[y]?.[z];
      if (!row) continue;
      for (let x = innerX0; x <= innerX1; x++) row[x] = null;
    }
  }
  for (let z = innerZ0; z <= innerZ1; z++) {
    const row = grid[heatY]?.[z];
    if (!row) continue;
    for (let x = innerX0; x <= innerX1; x++) row[x] = spec.innerColor;
  }

  // Grow missing layers when the rim rises above the source silhouette.
  while (grid.length <= yTop + spec.rimHeight) {
    grid.push(Array.from({ length: depth }, () => new Array<number | null>(width).fill(null)));
  }
  for (let y = yTop; y < yTop + spec.rimHeight; y++) {
    for (let z = outerZ0; z <= outerZ1; z++) {
      const row = grid[y]?.[z];
      if (!row) continue;
      for (let x = outerX0; x <= outerX1; x++) {
        const rim = x < innerX0 || x > innerX1 || z < innerZ0 || z > innerZ1;
        if (rim) row[x] = spec.rimColor;
      }
    }
  }
}

/** Carves a cylinder into the grid for each wheel (see `wheels` on
 *  VoxelModelDef for why the sheets cannot express one). Everything the sheet
 *  put inside the band is cleared first, so the authored block becomes the
 *  tyre's bounding volume rather than surviving around it. */
function stampWheels(grid: VoxelGrid, spec: NonNullable<VoxelModelDef['wheels']>): void {
  const height = grid.length;
  const depth = grid[0]?.length ?? 0;
  const yFrom = Math.max(0, spec.centerY - spec.radius);
  const yTo = Math.min(height - 1, spec.centerY + spec.radius);
  const rimSq = (spec.radius + 0.5) ** 2;
  const hubSq = (spec.hubRadius + 0.5) ** 2;

  for (const [xFrom, xTo] of spec.columns) {
    // Centre the tyre on the Z the body already occupies here rather than on
    // the grid midpoint: the voxelizer reserves extra FRONT slots for raised
    // details, so the grid is deliberately not symmetric about its centre.
    let zLo = depth;
    let zHi = -1;
    for (let y = yFrom; y <= yTo; y++) {
      for (let z = 0; z < depth; z++) {
        const row = grid[y]?.[z];
        if (!row) continue;
        for (let x = xFrom; x <= xTo; x++) {
          if (row[x] == null) continue;
          if (z < zLo) zLo = z;
          if (z > zHi) zHi = z;
        }
      }
    }
    if (zHi < 0) continue;
    const centerZ = (zLo + zHi) / 2;

    for (let y = yFrom; y <= yTo; y++) {
      const dy = y - spec.centerY;
      for (let z = 0; z < depth; z++) {
        const row = grid[y]?.[z];
        if (!row) continue;
        const dz = z - centerZ;
        const distSq = dy * dy + dz * dz;
        const inside = distSq <= rimSq;
        const isHub = distSq <= hubSq;
        for (let x = xFrom; x <= xTo; x++) {
          if (!inside) {
            row[x] = null;
          } else if (isHub && (x === xFrom || x === xTo)) {
            row[x] = spec.hubColor;
          } else {
            row[x] = spec.tireColor;
          }
        }
      }
    }
  }
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
