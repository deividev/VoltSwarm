import * as THREE from 'three';
import { buildGridGeometry, countGridVoxels } from './voxel-builder';
import { buildModelGrid, VOXEL_MODELS } from './registry';
import { attachToRigPart, buildRig, poseRig, RIG_PARTS } from './rig';
import type { Rig, RigClip } from './rig';
import { buildRuntimeModelDetails } from './runtime-details';
import { SLAGCASTER } from '../config';
import {
  createSlagcasterTransformMaterial,
  makeSlagcasterTransformGeometry,
  markSlagcasterDeploymentDirty,
  setSlagcasterDeploymentAt,
} from './slagcaster-transform';

/**
 * Standalone voxel model viewer (model-preview.html?model=<registry-key>).
 * Not part of the game bundle — used to review models before approving
 * them. Lighting, background, and fog colors mirror world.ts so the model
 * is judged in the same conditions it will ship in.
 */

// Per-kind framing: enemies show a ring of game-scale instances for swarm
// readability; bosses and the player get a solo close-up.
const FRAMING = {
  enemy: { heroScale: 2.2, cameraHeight: 1.2, showRing: true },
  boss: { heroScale: 0.95, cameraHeight: 1.6, showRing: false },
  player: { heroScale: 2.2, cameraHeight: 1.2, showRing: false },
  prop: { heroScale: 1.4, cameraHeight: 1.2, showRing: false },
} as const;

const params = new URLSearchParams(location.search);
const modelName = params.get('model') ?? 'voltling';
// Orbit angle in degrees for multi-angle review captures (0 = default 3/4
// front view used elsewhere). 90 = right side, 180 = back, 270 = left side.
const orbitDeg = Number(params.get('angle') ?? '0');
const deployProgress = THREE.MathUtils.clamp(Number(params.get('deploy') ?? '0'), 0, 1);
const def = VOXEL_MODELS[modelName];
if (!def) {
  throw new Error(`Unknown model '${modelName}'. Available: ${Object.keys(VOXEL_MODELS).join(', ')}`);
}
const framing = FRAMING[def.kind];

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x151a22);

const hemi = new THREE.HemisphereLight(0xcfe0ec, 0x3c4048, 1.25);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff4e0, 1.5);
sun.position.set(6, 10, 4);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(6, 48),
  new THREE.MeshLambertMaterial({ color: 0x30363f }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const grid = await buildModelGrid(modelName);
const material = new THREE.MeshLambertMaterial({ vertexColors: true });

// ?anim=<clip> builds the PART RIG (src/models/rig.ts) instead of the single
// merged mesh, so limb animation can be reviewed before any of it is wired
// into the game. Time is driven externally via window.__setAnimTime so a GIF
// capture can step exact frames rather than race a real-time loop.
const animParam = params.get('anim');
const clip: RigClip | null =
  animParam === 'idle' || animParam === 'walk' || animParam === 'hit' ? animParam : null;

const hero = new THREE.Group();
let rig: Rig | null = null;
let slagcasterMesh: THREE.InstancedMesh | null = null;
if (clip) {
  // Each model brings its own part layout; proportions differ enough that
  // reusing the boss's bands on another character orphans limbs.
  rig = buildRig(grid, def.voxelSize, material, RIG_PARTS[modelName]);
  hero.add(rig.root);
} else if (def.slagcasterTransform) {
  const closed = VOXEL_MODELS['slagcaster-closed'];
  if (!closed) throw new Error('Slagcaster closed endpoint is not registered');
  const geometry = makeSlagcasterTransformGeometry(
    buildGridGeometry(grid, def.voxelSize),
    1,
    closed.targetWidth * closed.voxelSize,
    SLAGCASTER.transform,
  );
  const transformMaterial = createSlagcasterTransformMaterial(material, SLAGCASTER.transform);
  slagcasterMesh = new THREE.InstancedMesh(geometry, transformMaterial, 1);
  slagcasterMesh.setMatrixAt(0, new THREE.Matrix4());
  setSlagcasterDeploymentAt(slagcasterMesh, 0, deployProgress);
  markSlagcasterDeploymentDirty(slagcasterMesh);
  hero.add(slagcasterMesh);
} else {
  hero.add(new THREE.Mesh(buildGridGeometry(grid, def.voxelSize), material));
}
const runtimeDetails = buildRuntimeModelDetails(
  def,
  (color) => new THREE.MeshLambertMaterial({ color }),
);
if (runtimeDetails) {
  if (rig) attachToRigPart(rig, runtimeDetails);
  else hero.add(runtimeDetails);
}
hero.scale.setScalar(def.previewScale ?? framing.heroScale);
hero.rotation.y = -0.3 + (orbitDeg * Math.PI) / 180;
scene.add(hero);

if (framing.showRing && !def.slagcasterTransform) {
  // Swarm readability ring — always the single merged mesh, never the rig:
  // the rig exists for the one-on-screen boss, not for crowd review.
  const ringGeometry = buildGridGeometry(grid, def.voxelSize);
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2;
    const bot = new THREE.Mesh(ringGeometry, material);
    bot.position.set(Math.cos(angle) * 4.2, 0, Math.sin(angle) * 4.2);
    bot.rotation.y = -angle + Math.PI / 2;
    scene.add(bot);
  }
}

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 4.6, 7.6);
camera.lookAt(0, framing.cameraHeight, 0);

const canvas = document.getElementById('preview-canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(960, 720, false);
camera.aspect = 960 / 720;
camera.updateProjectionMatrix();
renderer.render(scene, camera);

let triangles = 0;
hero.traverse((o) => {
  if (o instanceof THREE.Mesh) triangles += o.geometry.getAttribute('position').count / 3;
});
const label = document.getElementById('info');
if (label) {
  label.textContent =
    `${modelName} (${def.kind}) — ${countGridVoxels(grid)} voxels, ` +
    `${triangles} triangles per instance` +
    (rig
      ? ` — rig: ` +
        rig.report
          .map((r) => `${r.name} ${r.voxels}v rows ${r.rows[0]}-${r.rows[1]}`)
          .join(' | ')
      : '');
}

declare global {
  interface Window {
    __previewReady?: boolean;
    /** Poses the rig at `t` seconds and re-renders. Returns false when the
     *  page was loaded without ?anim, so a capture fails loudly. */
    __setAnimTime?: (t: number) => boolean;
    __setSlagcasterDeploy?: (progress: number) => boolean;
  }
}
window.__setAnimTime = (t: number): boolean => {
  if (!rig || !clip) return false;
  poseRig(rig, t, clip);
  renderer.render(scene, camera);
  return true;
};
window.__setSlagcasterDeploy = (progress: number): boolean => {
  if (!slagcasterMesh) return false;
  setSlagcasterDeploymentAt(slagcasterMesh, 0, progress);
  markSlagcasterDeploymentDirty(slagcasterMesh);
  renderer.render(scene, camera);
  return true;
};
window.__previewReady = true;
