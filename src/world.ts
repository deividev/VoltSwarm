import * as THREE from 'three';
import { ARENA_HALF_SIZE, CAMERA, VISUAL } from './config';
import { litMaterial } from './toon';

// Fixed isometric-style follow camera offset. Top-down enough to read the
// swarm, angled enough to sell the 3D look. Tuning lives in config.CAMERA.
const CAMERA_OFFSET = new THREE.Vector3(0, CAMERA.offsetY, CAMERA.offsetZ);

export function createRenderer(container: HTMLElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);
  return renderer;
}

/** Circular collider for a large prop. Small props stay decorative. */
export interface Obstacle {
  x: number;
  z: number;
  radius: number;
}

export function createScene(): { scene: THREE.Scene; obstacles: Obstacle[] } {
  const scene = new THREE.Scene();
  if (VISUAL.sky.enabled) {
    scene.background = createSkyTexture();
    scene.fog = new THREE.Fog(VISUAL.sky.horizonColor, 55, 95);
  } else {
    scene.background = new THREE.Color(0x151a22);
    scene.fog = new THREE.Fog(0x151a22, 55, 95);
  }

  const hemi = new THREE.HemisphereLight(0xcfe0ec, 0x3c4048, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.5);
  sun.position.set(30, 50, 20);
  scene.add(sun);

  buildGround(scene);
  const obstacles = scatterScrap(scene);
  return { scene, obstacles };
}

function buildGround(scene: THREE.Scene): void {
  // The ground is EXACTLY the playable area: where the floor ends, movement
  // ends. Invisible walls before the visual edge read as a bug.
  const size = ARENA_HALF_SIZE * 2;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshLambertMaterial({ map: createGroundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
}

/** Screen-space vertical gradient used as the scene background: night navy
 *  above fading to the fog's horizon color below. */
function createSkyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  const top = `#${VISUAL.sky.topColor.toString(16).padStart(6, '0')}`;
  const horizon = `#${VISUAL.sky.horizonColor.toString(16).padStart(6, '0')}`;
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, top);
  gradient.addColorStop(1, horizon);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Scrapyard floor plate: slate tiles with seams, wear and muted paint
 *  stains, drawn once into a canvas. Seeded so every run gets the same
 *  floor (layout randomization is a Phase 5 feature). */
function createGroundTexture(): THREE.CanvasTexture {
  const { textureSize, tiles, wearBlobs, paintStains, scuffs } = VISUAL.ground;
  const canvas = document.createElement('canvas');
  canvas.width = textureSize;
  canvas.height = textureSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  const rng = mulberry32(7);
  const tilePx = textureSize / tiles;

  // Base plates with a subtle per-tile brightness jitter.
  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      const jitter = (rng() - 0.5) * 7;
      ctx.fillStyle = `rgb(${50 + jitter}, ${56 + jitter}, ${65 + jitter})`;
      ctx.fillRect(tx * tilePx, ty * tilePx, tilePx + 1, tilePx + 1);
    }
  }

  // Wear: subtle dark smudges — small and faint or they read as glitches.
  for (let i = 0; i < wearBlobs; i++) {
    const r = tilePx * (0.5 + rng() * 1.1);
    ctx.fillStyle = `rgba(22, 26, 32, ${0.03 + rng() * 0.03})`;
    ctx.beginPath();
    ctx.ellipse(
      rng() * textureSize,
      rng() * textureSize,
      r,
      r * (0.5 + rng() * 0.7),
      rng() * Math.PI,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  // Muted paint stains from the prop palette — color variation that never
  // competes with enemy saturation.
  const stainPalette = ['#8a7a3a', '#3f6e6a', '#7a5560', '#5a6a7e', '#6e7a52'];
  for (let i = 0; i < paintStains; i++) {
    const r = tilePx * (0.5 + rng() * 1.4);
    ctx.fillStyle = stainPalette[Math.floor(rng() * stainPalette.length)] ?? '#5a6a7e';
    ctx.globalAlpha = 0.05 + rng() * 0.04;
    ctx.beginPath();
    ctx.ellipse(rng() * textureSize, rng() * textureSize, r, r * 0.8, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Small bright scuffs: chipped paint catching the light.
  for (let i = 0; i < scuffs; i++) {
    ctx.fillStyle = `rgba(122, 134, 148, ${0.05 + rng() * 0.06})`;
    const w = 2 + rng() * tilePx * 0.4;
    ctx.fillRect(rng() * textureSize, rng() * textureSize, w, 2 + rng() * 4);
  }

  // Plate seams on top (replaces the old GridHelper) — hairline thin, close
  // to the old grid's subtlety.
  ctx.strokeStyle = 'rgba(30, 35, 43, 0.5)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= tiles; i++) {
    const p = Math.round(i * tilePx) + 0.5;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, textureSize);
    ctx.moveTo(0, p);
    ctx.lineTo(textureSize, p);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Decorative low-poly junk. Large pieces get circular colliders. */
function scatterScrap(scene: THREE.Scene): Obstacle[] {
  // Painted-machine mid-tones: colorful but duller than enemies so the swarm
  // always pops over the set dressing.
  const palette = [0x8a7a3a, 0x3f6e6a, 0x7a5560, 0x5a6a7e, 0x6e7a52];
  const rng = mulberry32(1337);
  const obstacles: Obstacle[] = [];

  for (let i = 0; i < 90; i++) {
    const kind = Math.floor(rng() * 3);
    const color = palette[Math.floor(rng() * palette.length)] ?? 0x5a5f66;
    const material = litMaterial({ color });
    let mesh: THREE.Mesh;
    let colliderRadius = 0;
    if (kind === 0) {
      const s = 0.6 + rng() * 1.8;
      mesh = new THREE.Mesh(new THREE.BoxGeometry(s, s * (0.4 + rng() * 0.8), s), material);
      mesh.position.y = mesh.scale.y * 0.3;
      if (s > 1.6) colliderRadius = s * 0.65;
    } else if (kind === 1) {
      const r = 0.4 + rng() * 1.0;
      mesh = new THREE.Mesh(new THREE.ConeGeometry(r, r * 2, 5), material);
      mesh.position.y = r;
      if (r > 1.0) colliderRadius = r * 0.9;
    } else {
      const r = 0.3 + rng() * 0.7;
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, r * 2.5, 7), material);
      mesh.position.y = r * 1.25;
      mesh.rotation.z = rng() > 0.5 ? Math.PI / 2 : 0;
    }
    // Keep a clear spawn zone around the arena center; stay inside the floor.
    const angle = rng() * Math.PI * 2;
    const dist = 12 + rng() * (ARENA_HALF_SIZE - 4 - 12);
    mesh.position.x = Math.cos(angle) * dist;
    mesh.position.z = Math.sin(angle) * dist;
    mesh.rotation.y = rng() * Math.PI * 2;
    scene.add(mesh);
    if (colliderRadius > 0 && dist < ARENA_HALF_SIZE) {
      obstacles.push({ x: mesh.position.x, z: mesh.position.z, radius: colliderRadius });
    }
  }
  return obstacles;
}

export function createCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    200,
  );
  camera.position.copy(CAMERA_OFFSET);
  camera.lookAt(0, 0, 0);
  return camera;
}

export function updateCamera(camera: THREE.PerspectiveCamera, target: THREE.Vector3): void {
  camera.position.set(
    target.x + CAMERA_OFFSET.x,
    target.y + CAMERA_OFFSET.y,
    target.z + CAMERA_OFFSET.z,
  );
  camera.lookAt(target.x, 0, target.z);
}

/** Small deterministic PRNG so the scrapyard layout is stable between runs. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
