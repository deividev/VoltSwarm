import * as THREE from 'three';
import { buildGridGeometry, countGridVoxels } from './voxel-builder';
import { buildModelGrid, VOXEL_MODELS } from './registry';

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
const geometry = buildGridGeometry(grid, def.voxelSize);

// Hero model, front (+Z visor) angled toward the camera.
const hero = new THREE.Mesh(geometry, material);
hero.scale.setScalar(def.previewScale ?? framing.heroScale);
hero.rotation.y = -0.3 + (orbitDeg * Math.PI) / 180;
scene.add(hero);

if (framing.showRing) {
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2;
    const bot = new THREE.Mesh(geometry, material);
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

const triangles = geometry.getAttribute('position').count / 3;
const label = document.getElementById('info');
if (label) {
  label.textContent =
    `${modelName} (${def.kind}) — ${countGridVoxels(grid)} voxels, ` +
    `${triangles} triangles per instance`;
}

declare global {
  interface Window {
    __previewReady?: boolean;
  }
}
window.__previewReady = true;
