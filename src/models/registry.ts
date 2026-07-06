import { voxelizeIcon } from './icon-voxelizer';
import type { VoxelGrid } from './voxel-builder';

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
  kind: 'enemy' | 'boss' | 'player';
  /** Flat front-view reference sheet URL (served from assets/2d/). */
  ref: string;
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
  /** Colors that protrude from the armor (muzzle rings, raised plates). */
  raisedColors?: number[];
  /** Overrides the per-kind hero scale in the preview viewer. */
  previewScale?: number;
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

/** Background swatches shared by every reference sheet. */
const BACKGROUND = [0x10141d, 0x151a22, 0x000000];

export const VOXEL_MODELS: Record<string, VoxelModelDef> = {
  voltling: {
    kind: 'enemy',
    ref: '/assets/2d/ref-voltling-front.png',
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
    ref: '/assets/2d/ref-sparkrunner-front-v2.png',
    // Tall-thin runner at swarm resolution; the v2 reference thickens the
    // antenna and visor so they survive this width. Voxel size keeps it
    // ~1.9u tall like the primitive.
    targetWidth: 17,
    voxelSize: 0.05,
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
    ref: '/assets/2d/ref-rustbrute-front-v2.png',
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
    ref: '/assets/2d/ref-roller-front.png',
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
    ref: '/assets/2d/ref-gunner-front.png',
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
    ref: '/assets/2d/ref-drone-front.png',
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
    ref: '/assets/2d/ref-player-front-v3.png',
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
    ref: '/assets/2d/ref-tesla-titan-front.png',
    // Tall pylon sized to the primitive rig (~2u). The bright-cyan rings
    // are wider than the tower, so they wrap as full slabs on their own;
    // they are also the prime bloom emissives of Phase 1.
    targetWidth: 25,
    voxelSize: 0.048,
    bodyColor: ELECTRIC_CYAN,
    palette: [ELECTRIC_CYAN, CYAN, DARK, AMBER],
    frontOnly: [AMBER],
    armorColors: [ELECTRIC_CYAN],
    segments: [
      { from: 0, to: 0.22, depthFactor: 0.45 },
      { from: 0.22, to: 0.82, depthFactor: 0.4 },
      { from: 0.82, to: 1, depthFactor: 0.34 },
    ],
    raisedTopFraction: 0,
    previewScale: 2.4,
  },
  'crusher-king': {
    kind: 'boss',
    ref: '/assets/2d/ref-crusher-king-front-v2.png',
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
    // king read as a loaf from behind (playtest 2026-07-05).
    segments: [
      { from: 0, to: 0.44, depthFactor: 0.3 },
      { from: 0.44, to: 0.82, depthFactor: 0.25 },
      { from: 0.82, to: 1, depthFactor: 0.22 },
    ],
    raisedTopFraction: 0,
    previewScale: 1.9,
  },
  'volt-warden': {
    kind: 'boss',
    ref: '/assets/2d/ref-volt-warden-front-v2.png',
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
  'final-boss': {
    kind: 'boss',
    ref: '/assets/2d/ref-volt-warden-front.png',
    targetWidth: 41,
    voxelSize: 0.05,
    bodyColor: YELLOW,
    palette: [YELLOW, DARK, CYAN],
    frontOnly: [CYAN],
    segments: [
      { from: 0, to: 0.42, depthFactor: 0.42 },
      { from: 0.42, to: 0.8, depthFactor: 0.32 },
      { from: 0.8, to: 1, depthFactor: 0.26 },
    ],
    raisedTopFraction: 0.12,
    previewScale: 1.5,
  },
};

/** Enemy type name (config.ts) → registry key. */
export function modelKeyForTypeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

export async function buildModelGrid(key: string): Promise<VoxelGrid> {
  const def = VOXEL_MODELS[key];
  if (!def) throw new Error(`No voxel model registered as '${key}'`);
  return voxelizeIcon(def.ref, {
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
    raisedColors: def.raisedColors,
    bodyColor: def.bodyColor,
  });
}
