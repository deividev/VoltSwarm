import * as THREE from 'three';
import { buildGridGeometry, emptyGrid } from './voxel-builder';
import type { VoxelGrid } from './voxel-builder';

/**
 * Splits a voxel model into animatable parts and poses them.
 *
 * WHY THIS EXISTS: every enemy — bosses included — is drawn as one merged
 * BufferGeometry inside an InstancedMesh, animated only by a per-instance 4x4
 * matrix (enemies.ts). That buys 400+ swarm bots at 60 FPS, but it means a
 * model has no limbs: there is no "arm" object to move, so the only motion
 * available is whole-body rock/scale/bob. enemies.ts even exempts bosses from
 * the swarm's walk rock, with the comment "a waddling king loses its menace".
 *
 * A boss is the one case where the instancing guardrail does not apply: there
 * is only ever ONE on screen. So it can afford to be its own Group of part
 * meshes with a real transform hierarchy. This module builds that rig from the
 * SAME VoxelGrid the single-mesh path uses, so the model stays the single
 * source of truth — no second asset to keep in sync.
 *
 * Parts are carved by axis-aligned bands expressed as FRACTIONS, matching the
 * convention `segments` and `recolorRegions` already use in the registry:
 * `y` runs 0 at the TOP of the model (sheet order), `x` runs 0 at its LEFT.
 */

/** One axis-aligned box in fraction space: `y` from the TOP, `x` from the LEFT. */
export interface RigBand {
  y0: number;
  y1: number;
  x0: number;
  x1: number;
}

export interface RigPartSpec {
  name: string;
  /**
   * The boxes this part claims. MULTIPLE boxes are required, not a nicety: a
   * single rectangle per limb tore this model visibly. The boots flare wider
   * than the shin (rows 85-92 span columns 11-26 while the leg column is
   * 16-30), and the gauntlets hang to row 60 while the arm band ended at 57 —
   * so the boot flare and the bottom of each hand fell outside their limb's
   * box, were swept up by the catch-all torso, and stayed FROZEN while the
   * limb swung. A shoulder also needs a wider box than the forearm, or the
   * arm box grows so wide it steals the thigh lower down.
   */
  bands: RigBand[];
  /** Where this part rotates, as fractions in the same space. */
  pivotY: number;
  pivotX: number;
  /** Parent part name; absent means it hangs off the rig root. */
  parent?: string;
}

export interface RigPart {
  /** Rotate/translate THIS to animate; the mesh inside is pre-offset so the
   *  part turns about its joint instead of about the model origin. */
  pivot: THREE.Group;
  mesh: THREE.Mesh;
  spec: RigPartSpec;
}

export interface Rig {
  root: THREE.Group;
  parts: Record<string, RigPart>;
  /** Model height in world units — used to scale motion amplitudes. */
  height: number;
  /** What each part actually claimed. Surfaced in the preview label so a
   *  mis-carved limb is caught by reading, not by staring at an animation. */
  report: RigCarveReport[];
}

/**
 * Part layout for the humanoid boss (Hazard Marshal). Bands were read off the
 * generated front sheet, not guessed: the gauntlets occupy the outer ~26% of
 * the width from the pauldrons down, and the legs split at mid-width below the
 * belt. `torso` is deliberately last and widest — it collects everything the
 * other bands did not claim, so no voxel is ever dropped.
 */
export const HUMANOID_PARTS: RigPartSpec[] = [
  // ORDER IS PRIORITY: each part claims before the ones below it, and `torso`
  // is last precisely so it collects the leftovers. Get this backwards and the
  // catch-all eats the limbs.
  {
    name: 'head',
    bands: [{ y0: 0, y1: 0.25, x0: 0.33, x1: 0.67 }],
    pivotY: 0.25,
    pivotX: 0.5,
    parent: 'torso',
  },
  {
    name: 'armL',
    bands: [
      { y0: 0.17, y1: 0.3, x0: 0, x1: 0.32 }, // pauldron — wider than the arm
      { y0: 0.3, y1: 0.66, x0: 0, x1: 0.26 }, // forearm + gauntlet, down to row 60
    ],
    pivotY: 0.2,
    pivotX: 0.16,
    parent: 'torso',
  },
  {
    name: 'armR',
    bands: [
      { y0: 0.17, y1: 0.3, x0: 0.68, x1: 1 },
      { y0: 0.3, y1: 0.66, x0: 0.74, x1: 1 },
    ],
    pivotY: 0.2,
    pivotX: 0.84,
    parent: 'torso',
  },
  // Legs take the FULL half-width below the hip so the flared boot comes with
  // them. Safe only because the arms above already claimed their own voxels.
  // y starts at 0.58, not 0.54: any earlier and the pelvis tears off the body.
  // Thigh and shin are SEPARATE parts: without a knee the leg is a rigid plank
  // and no amount of curve tuning stops the walk reading as a mannequin. The
  // split sits at row 72 of 93 (0.775) — just below the knee pad, which spans
  // rows 66-71, so the pad stays whole on the thigh instead of tearing.
  { name: 'legL', bands: [{ y0: 0.58, y1: 0.775, x0: 0, x1: 0.5 }], pivotY: 0.58, pivotX: 0.35 },
  {
    name: 'shinL',
    bands: [{ y0: 0.775, y1: 1, x0: 0, x1: 0.5 }],
    pivotY: 0.775,
    pivotX: 0.36,
    parent: 'legL',
  },
  { name: 'legR', bands: [{ y0: 0.58, y1: 0.775, x0: 0.5, x1: 1 }], pivotY: 0.58, pivotX: 0.65 },
  {
    name: 'shinR',
    bands: [{ y0: 0.775, y1: 1, x0: 0.5, x1: 1 }],
    pivotY: 0.775,
    pivotX: 0.64,
    parent: 'legR',
  },
  { name: 'torso', bands: [{ y0: 0, y1: 1, x0: 0, x1: 1 }], pivotY: 0.55, pivotX: 0.5 },
];

/** Copies only the voxels inside a band into a same-sized empty grid, so every
 *  part keeps the full model's coordinate frame and the pieces reassemble
 *  exactly. `claimed` marks cells already taken by an earlier (higher
 *  priority) part. */
function carve(
  grid: VoxelGrid,
  spec: RigPartSpec,
  claimed: boolean[][][],
  width: number,
  depth: number,
): { part: VoxelGrid; count: number; rows: [number, number]; cols: [number, number] } {
  const height = grid.length;
  const part = emptyGrid(width, height, depth);
  let count = 0;
  let rowLo = Infinity;
  let rowHi = -Infinity;
  let colLo = Infinity;
  let colHi = -Infinity;
  for (const band of spec.bands) {
    // Grid Y runs bottom-up; the spec's Y runs top-down.
    const yTop = Math.floor(height * band.y0);
    const yBot = Math.ceil(height * band.y1);
    const xLo = Math.floor(width * band.x0);
    const xHi = Math.ceil(width * band.x1);
    for (let sy = yTop; sy < yBot; sy++) {
      const gy = height - 1 - sy;
      const slice = grid[gy];
      if (!slice) continue;
      for (let z = 0; z < slice.length; z++) {
        const row = slice[z];
        if (!row) continue;
        for (let x = xLo; x < xHi && x < row.length; x++) {
          const color = row[x];
          if (color == null) continue;
          const claimedRow = claimed[gy]?.[z];
          if (!claimedRow || claimedRow[x]) continue;
          claimedRow[x] = true;
          const dst = part[gy]?.[z];
          if (dst) {
            dst[x] = color;
            count++;
            if (sy < rowLo) rowLo = sy;
            if (sy > rowHi) rowHi = sy;
            if (x < colLo) colLo = x;
            if (x > colHi) colHi = x;
          }
        }
      }
    }
  }
  return {
    part,
    count,
    rows: [rowLo === Infinity ? -1 : rowLo, rowHi === -Infinity ? -1 : rowHi],
    cols: [colLo === Infinity ? -1 : colLo, colHi === -Infinity ? -1 : colHi],
  };
}

/** Per-part carve report. The bug this rig shipped with — frozen boot flares
 *  and frozen gauntlet bottoms welded to the torso — is invisible in a still
 *  and obvious here: the torso's row range simply ran to the bottom of the
 *  model instead of stopping at the hip. */
export interface RigCarveReport {
  name: string;
  voxels: number;
  rows: [number, number];
  cols: [number, number];
}

export function buildRig(
  grid: VoxelGrid,
  voxelSize: number,
  material: THREE.Material,
  specs: RigPartSpec[] = HUMANOID_PARTS,
): Rig {
  const height = grid.length;
  let width = 0;
  let depth = 0;
  for (const slice of grid) {
    depth = Math.max(depth, slice.length);
    for (const row of slice) width = Math.max(width, row.length);
  }

  // Carve in LISTED order — the list IS the priority, limbs before the
  // catch-all torso.
  const claimed: boolean[][][] = Array.from({ length: height }, () =>
    Array.from({ length: depth }, () => new Array<boolean>(width).fill(false)),
  );
  const carved = new Map<string, VoxelGrid>();
  const report: RigCarveReport[] = [];
  for (const spec of specs) {
    const { part, count, rows, cols } = carve(grid, spec, claimed, width, depth);
    report.push({ name: spec.name, voxels: count, rows, cols });
    if (count > 0) carved.set(spec.name, part);
  }

  const root = new THREE.Group();
  const parts: Record<string, RigPart> = {};
  // buildGridGeometry centres X and Z and rests the model on y=0, so a pivot
  // expressed in grid fractions converts to world space the same way.
  const toWorld = (spec: RigPartSpec) =>
    new THREE.Vector3(
      (spec.pivotX * width - width / 2) * voxelSize,
      (1 - spec.pivotY) * height * voxelSize,
      0,
    );

  for (const spec of specs) {
    const partGrid = carved.get(spec.name);
    if (!partGrid) continue;
    const geometry = buildGridGeometry(partGrid, voxelSize);
    const mesh = new THREE.Mesh(geometry, material);
    const pivotPos = toWorld(spec);
    const pivot = new THREE.Group();
    pivot.position.copy(pivotPos);
    // Cancel the pivot offset on the mesh so the part sits where it was
    // authored while rotating about the joint.
    mesh.position.set(-pivotPos.x, -pivotPos.y, -pivotPos.z);
    pivot.add(mesh);
    parts[spec.name] = { pivot, mesh, spec };
  }
  // Attach children after every pivot exists, and subtract the parent's own
  // offset so nesting does not double-translate.
  for (const spec of specs) {
    const part = parts[spec.name];
    if (!part) continue;
    const parent = spec.parent ? parts[spec.parent] : undefined;
    if (parent) {
      part.pivot.position.sub(parent.pivot.position);
      parent.pivot.add(part.pivot);
    } else {
      root.add(part.pivot);
    }
  }

  return { root, parts, height: height * voxelSize, report };
}

export type RigClip = 'idle' | 'walk' | 'hit';

/** Fraction of the cycle a foot spends on the ground. Real walking is ~0.6;
 *  above 0.5 means both feet are down for part of the cycle (double support),
 *  which is exactly what separates a WALK from a run. */
const STANCE = 0.62;
/** Where in the cycle the planted leg is vertical under the body. */
const STANCE_MID = STANCE / 2;
const HIP_SWING = 0.34;
const KNEE_LIFT = 0.78;

/**
 * Hip and knee angles for one leg at cycle phase `p`.
 *
 * THE POINT OF THIS FUNCTION: a sine is the wrong curve, and it is the main
 * reason a procedural walk reads as synthetic. The two halves of a stride are
 * not the same motion. During STANCE the foot is planted and the body vaults
 * over it, so the hip sweeps back at a nearly CONSTANT rate — linear, not
 * eased. During SWING the leg is unloaded and whips forward in ~40% of the
 * time, so it must be both faster and eased at its ends. A sine makes both
 * halves symmetric and slow, which is why the result floats.
 *
 * The knee is what sells it: nearly straight through stance (with a small
 * shock-absorbing dip just after contact), then a big bend mid-swing so the
 * foot clears the ground instead of scything through it.
 */
function gait(p: number): { hip: number; knee: number } {
  // SIGN CONVENTION: the model faces +Z, and a limb hanging down rotated by a
  // POSITIVE rotation.x swings its foot toward -Z, i.e. BACKWARD. So the foot
  // being forward at heel strike is a NEGATIVE hip angle. Getting this
  // backwards makes the stance leg sweep forward under the body — the boss
  // moonwalks, which is subtly wrong in a way that reads as "off" rather than
  // as an obvious bug. Knee stays positive: the heel tucks backward.
  const f = p - Math.floor(p);
  if (f < STANCE) {
    const s = f / STANCE;
    // Planted: foot starts forward and sweeps back at a constant rate.
    const hip = -HIP_SWING * (1 - 2 * s);
    // Absorb the landing over the first third of stance.
    const knee = 0.16 * Math.sin(Math.PI * Math.min(1, s * 3));
    return { hip, knee };
  }
  const s = (f - STANCE) / (1 - STANCE);
  // Unloaded: ease out of the back position and into the next contact.
  const eased = 0.5 - 0.5 * Math.cos(Math.PI * s);
  return { hip: -HIP_SWING * (-1 + 2 * eased), knee: KNEE_LIFT * Math.sin(Math.PI * s) };
}

/** Short asymmetric dip at heel strike (p near 0): fast in, slower out — the
 *  shape of taking weight. Fed twice, half a cycle apart, for both feet. */
function impulse(p: number): number {
  const f = p - Math.floor(p);
  const d = Math.min(f, 1 - f);
  return Math.exp(-d * 26);
}

/**
 * Poses the rig for a clip at time `t` seconds. Deterministic — the same `t`
 * always yields the same pose, which is what lets the GIF capture step frames
 * instead of racing a real-time loop.
 *
 * Amplitudes are deliberately small. This is a BOSS: the reference point is
 * enemies.ts refusing to give bosses the swarm's walk rock because "a
 * waddling king loses its menace". Weight reads through slow, heavy motion
 * with the head staying level, not through big limb throws.
 */
export function poseRig(rig: Rig, t: number, clip: RigClip): void {
  const { parts, height } = rig;
  const torso = parts['torso'];
  const head = parts['head'];
  const armL = parts['armL'];
  const armR = parts['armR'];
  const legL = parts['legL'];
  const legR = parts['legR'];

  // Reset so clips never accumulate.
  for (const p of Object.values(parts)) p.pivot.rotation.set(0, 0, 0);
  rig.root.position.y = 0;
  rig.root.rotation.set(0, 0, 0);

  if (clip === 'idle') {
    // 0.31 Hz — one breath every ~3.2s, which is exactly two walk cycles. Two
    // reasons, not one: a body this heavy should breathe slowly, and making
    // the idle period an exact multiple of the stride lets a side-by-side reel
    // of all three clips loop without any of them jumping at the wrap.
    const breathe = Math.sin(t * Math.PI * 2 * 0.31);
    rig.root.position.y = breathe * height * 0.006;
    if (torso) torso.pivot.rotation.x = breathe * 0.022;
    // Head counter-rotates so it stays level while the chest rises — the
    // single strongest "alive" cue on a heavy silhouette.
    if (head) {
      head.pivot.rotation.x = -breathe * 0.03;
      head.pivot.rotation.y = Math.sin(t * Math.PI * 2 * 0.17) * 0.09;
    }
    // Same 0.31 Hz as the breath, just phase-offset — a second frequency here
    // would reintroduce the wrap jump the breath rate was chosen to avoid.
    const sway = Math.sin(t * Math.PI * 2 * 0.31 + 0.6);
    if (armL) armL.pivot.rotation.x = sway * 0.045;
    if (armR) armR.pivot.rotation.x = sway * 0.045;
    if (legL) legL.pivot.rotation.x = -breathe * 0.008;
    if (legR) legR.pivot.rotation.x = -breathe * 0.008;
    return;
  }

  if (clip === 'walk') {
    const shinL = parts['shinL'];
    const shinR = parts['shinR'];
    // One full gait cycle (two footfalls) per 1/hz seconds.
    const hz = 0.62;
    const p = t * hz;
    const TAU = Math.PI * 2;

    // Left leg leads; the right is exactly half a cycle behind.
    const gl = gait(p);
    const gr = gait(p + 0.5);

    if (legL) legL.pivot.rotation.x = gl.hip;
    if (legR) legR.pivot.rotation.x = gr.hip;
    if (shinL) shinL.pivot.rotation.x = gl.knee;
    if (shinR) shinR.pivot.rotation.x = gr.knee;

    // PELVIS HEIGHT peaks at mid-stance (the body vaults over a straight
    // planted leg) and dips at double support when both legs are splayed —
    // twice per cycle, and NOT a clean sine: the dip is sharper than the rise
    // because the drop is gravity and the rise is muscle.
    const vault = Math.cos(TAU * 2 * (p - STANCE_MID));
    const strike = impulse(p) + impulse(p + 0.5);
    // 0.012 is not a taste value: the hip is ~0.42 of the model's height above
    // the foot, so at HIP_SWING the straight leg shortens its vertical reach by
    // L*(1-cos(0.34)) ~= 0.024h. The pelvis must drop by that much between
    // mid-stance and double support or the planted foot visibly floats.
    rig.root.position.y = (vault * 0.012 - strike * 0.014) * height;

    // WEIGHT SHIFT: the mass leans over whichever foot is planted, once per
    // cycle. Without this a biped reads as two legs on a rail.
    const shift = Math.sin(TAU * (p - 0.1));
    rig.root.position.x = shift * height * 0.012;
    rig.root.rotation.z = -shift * 0.035;

    if (torso) {
      // Constant forward lean = intent; the pulse on top is the effort of
      // each push-off.
      torso.pivot.rotation.x = 0.05 + Math.max(0, -vault) * 0.02;
      // Shoulders counter-rotate against the hips, the classic contralateral
      // twist. It lags the legs slightly — bodies are not rigid.
      torso.pivot.rotation.y = -Math.sin(TAU * (p - 0.08)) * 0.075;
      torso.pivot.rotation.z = shift * 0.02;
    }
    if (head) {
      // The head is the last thing a heavy walker lets move: it cancels most
      // of the torso's twist and lean so the gaze stays locked forward.
      head.pivot.rotation.x = -0.04 - vault * 0.012;
      head.pivot.rotation.y = Math.sin(TAU * (p - 0.08)) * 0.055;
      head.pivot.rotation.z = -shift * 0.025;
    }
    // Arms swing with the OPPOSITE leg and trail it slightly, damped hard:
    // heavy gauntlets have inertia, they do not march.
    const ARM_LAG = 0.06;
    const ARM_DAMP = 0.62;
    if (armL) {
      armL.pivot.rotation.x = gait(p + 0.5 - ARM_LAG).hip * ARM_DAMP;
      armL.pivot.rotation.z = 0.05 + Math.abs(shift) * 0.03;
    }
    if (armR) {
      armR.pivot.rotation.x = gait(p - ARM_LAG).hip * ARM_DAMP;
      armR.pivot.rotation.z = -0.05 - Math.abs(shift) * 0.03;
    }
    return;
  }

  // hit: a single sharp recoil that decays, not a loop.
  const d = Math.max(0, 1 - t / 0.45);
  const shake = Math.sin(t * Math.PI * 2 * 9) * d * d;
  rig.root.rotation.z = shake * 0.05;
  rig.root.position.y = -d * d * height * 0.01;
  if (torso) torso.pivot.rotation.x = -d * 0.16;
  if (head) head.pivot.rotation.x = -d * 0.22;
  if (armL) armL.pivot.rotation.x = d * 0.3;
  if (armR) armR.pivot.rotation.x = d * 0.3;
  if (legL) legL.pivot.rotation.x = -d * 0.05;
  if (legR) legR.pivot.rotation.x = -d * 0.05;
}
