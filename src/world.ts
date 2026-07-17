import * as THREE from 'three';
import {
  ARENA_HALF_SIZE,
  BARREL_PROP,
  CAMERA,
  CONTAINER_PROP,
  SCAFFOLD_PROP,
  SPAWN_PLACEMENT,
  VISUAL,
} from './config';
import { buildModelGrid, VOXEL_MODELS } from './models/registry';
import { buildGridGeometry } from './models/voxel-builder';
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
  /** Optional larger radius used only while reserving spawn positions. */
  placementRadius?: number;
  /** Flyers normally ignore map props, but not explicit structures. */
  blocksFlyers?: boolean;
}

/** Nudges (x, z) directly away from any obstacle it's currently inside of,
 *  by `margin` past the obstacle's edge — for things that can't be planned
 *  around in advance (chests spawn wherever the boss happens to die, so
 *  unlike containers/barrels/the totem they can't avoid props ahead of
 *  time; instead this pushes the chest out after the fact). Iterates a few
 *  times in case pushing clear of one obstacle lands inside another. */
export function findClearSpot(
  x: number,
  z: number,
  obstacles: Obstacle[],
  radius: number,
  clearance = 0,
): { x: number; z: number } | null {
  const limit = ARENA_HALF_SIZE - radius - clearance;
  const originX = THREE.MathUtils.clamp(x, -limit, limit);
  const originZ = THREE.MathUtils.clamp(z, -limit, limit);
  if (isClearPosition(originX, originZ, radius, obstacles, clearance)) {
    return { x: originX, z: originZ };
  }
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let attempt = 1; attempt <= SPAWN_PLACEMENT.maxAttempts; attempt++) {
    const distance = SPAWN_PLACEMENT.spiralStep * Math.sqrt(attempt);
    const angle = goldenAngle * attempt;
    const px = originX + Math.cos(angle) * distance;
    const pz = originZ + Math.sin(angle) * distance;
    if (isClearPosition(px, pz, radius, obstacles, clearance)) return { x: px, z: pz };
  }
  return null;
}

export function findRandomClearSpot(
  originX: number,
  originZ: number,
  minDistance: number,
  maxDistance: number,
  radius: number,
  obstacles: Obstacle[],
  clearance = 0,
): { x: number; z: number } | null {
  for (let attempt = 0; attempt < SPAWN_PLACEMENT.maxAttempts; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.sqrt(
      minDistance * minDistance +
        Math.random() * (maxDistance * maxDistance - minDistance * minDistance),
    );
    const x = originX + Math.cos(angle) * distance;
    const z = originZ + Math.sin(angle) * distance;
    if (isClearPosition(x, z, radius, obstacles, clearance)) return { x, z };
  }
  return null;
}

export function isClearPosition(
  x: number,
  z: number,
  radius: number,
  obstacles: Obstacle[],
  clearance = 0,
): boolean {
  const limit = ARENA_HALF_SIZE - radius - clearance;
  if (x < -limit || x > limit || z < -limit || z > limit) return false;
  return obstacles.every((obstacle) => {
    const occupiedRadius = obstacle.placementRadius ?? obstacle.radius;
    const minDistance = occupiedRadius + radius + clearance;
    return (obstacle.x - x) ** 2 + (obstacle.z - z) ** 2 >= minDistance * minDistance;
  });
}

export function segmentHitsObstacle(
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  obstacle: Obstacle,
  padding = 0,
): boolean {
  const segmentX = endX - startX;
  const segmentZ = endZ - startZ;
  const lengthSq = segmentX * segmentX + segmentZ * segmentZ;
  const projection = lengthSq > 0
    ? THREE.MathUtils.clamp(
        ((obstacle.x - startX) * segmentX + (obstacle.z - startZ) * segmentZ) / lengthSq,
        0,
        1,
      )
    : 0;
  const closestX = startX + segmentX * projection;
  const closestZ = startZ + segmentZ * projection;
  const radius = obstacle.radius + padding;
  return (closestX - obstacle.x) ** 2 + (closestZ - obstacle.z) ** 2 <= radius * radius;
}

export function hasLineOfSight(
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  obstacles: Obstacle[],
  padding = 0,
): boolean {
  return !obstacles.some((obstacle) =>
    segmentHitsObstacle(startX, startZ, endX, endZ, obstacle, padding),
  );
}

export function createScene(): {
  scene: THREE.Scene;
  obstacles: Obstacle[];
  propMeshes: THREE.Object3D[];
} {
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
  // Nothing to avoid yet at construction time — the boss totem doesn't exist
  // until the first startRun(). Real per-run regeneration (avoiding the
  // totem) happens via placeRandomProps(), called again from game.ts.
  const props = placeRandomProps(scene, []);
  return { scene, obstacles: props.obstacles, propMeshes: props.meshes };
}

/** Builds a fresh random layout of container gates + barrels, avoiding
 *  whatever's in `avoid` (the boss totem, once it's placed) — user request
 *  2026-07-06: different count/position every playthrough, never walling
 *  off the totem or overlapping between the two prop types. Returns every
 *  mesh added so a caller can `clearProps()` them before regenerating. */
export function placeRandomProps(
  scene: THREE.Scene,
  avoid: AvoidPoint[],
): { obstacles: Obstacle[]; meshes: THREE.Object3D[] } {
  const containers = buildContainerProps(scene, avoid);
  const barrelAvoid: AvoidPoint[] = [
    ...avoid,
    ...containers.centers.map((c) => ({ x: c.x, z: c.z, radius: BARREL_PROP.containerClearance })),
  ];
  const barrels = buildBarrelProps(scene, barrelAvoid);
  const scaffold = SCAFFOLD_PROP.enabled ? buildScaffoldProps(scene) : { obstacles: [], meshes: [] };
  return {
    obstacles: [...containers.obstacles, ...barrels.obstacles, ...scaffold.obstacles],
    meshes: [...containers.meshes, ...barrels.meshes, ...scaffold.meshes],
  };
}

/** Removes and disposes every mesh from a previous placeRandomProps() call —
 *  call before regenerating so the old layout doesn't linger in the scene. */
export function clearProps(scene: THREE.Scene, meshes: THREE.Object3D[]): void {
  for (const mesh of meshes) {
    scene.remove(mesh);
    if (mesh instanceof THREE.Mesh) {
      mesh.geometry.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material.dispose();
    }
  }
}

function buildGround(scene: THREE.Scene): void {
  // The ground is EXACTLY the playable area: where the floor ends, movement
  // ends. Invisible walls before the visual edge read as a bug.
  const size = ARENA_HALF_SIZE * 2;
  // litMaterial() (not plain Lambert) so the floor gets the same 3-step
  // toon quantization as bots/player/props — a lit-but-not-toon floor under
  // toon-shaded entities was the mismatch risk the user flagged.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    litMaterial({ map: createGroundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // AI-generated top-down factory floor loads async and swaps in over the
  // procedural placeholder; on failure the procedural texture simply stays.
  void upgradeGroundTexture(ground);
}

async function upgradeGroundTexture(ground: THREE.Mesh): Promise<void> {
  try {
    const texture = await new THREE.TextureLoader().loadAsync(VISUAL.ground.aiTextureUrl);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    const repeats = (ARENA_HALF_SIZE * 2) / VISUAL.ground.worldSizePerRepeat;
    texture.repeat.set(repeats, repeats);
    const material = ground.material as THREE.MeshToonMaterial | THREE.MeshLambertMaterial;
    material.map?.dispose();
    material.map = texture;
    material.needsUpdate = true;
  } catch (error) {
    console.warn('AI ground texture unavailable, keeping procedural floor:', error);
  }
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

/** A point to steer clear of, with its own clearance radius (e.g. the boss
 *  totem needs more berth than one barrel needs from another). */
export interface AvoidPoint {
  x: number;
  z: number;
  radius: number;
}

/** Random point within one angular slice of the ring — true per-run
 *  randomness (Math.random(), not a fixed seed). */
function randomPointInSector(
  sectorStart: number,
  sectorSize: number,
  minDist: number,
  maxDist: number,
): { x: number; z: number } {
  const angle = sectorStart + Math.random() * sectorSize;
  // Area-uniform sampling: lerp on r^2, not r. Uniform-in-radius bunches
  // points near the center (ring area grows with r^2) and leaves the outer
  // map visibly sparse (user report 2026-07-08).
  const dist = Math.sqrt(
    minDist * minDist + Math.random() * (maxDist * maxDist - minDist * minDist),
  );
  return { x: Math.cos(angle) * dist, z: Math.sin(angle) * dist };
}

/** Scatters `count` points inside [minDist, maxDist] from center, ONE PER
 *  ANGULAR SECTOR (stratified around the full circle) so the map can't end
 *  up with a crowded quadrant and an empty one just by chance — purely
 *  independent random points did exactly that (user report 2026-07-06).
 *  Each point still lands at a random angle+distance WITHIN its own slice,
 *  and keeps at least `minSeparation` from every other generated point and
 *  `radius` from every point in `avoid` (container gates, the boss totem,
 *  ...) — best-effort (20 retries per point), so a crowded arena just ends
 *  up with fewer props rather than violating separation. */
function scatterPoints(
  count: number,
  minDist: number,
  maxDist: number,
  minSeparation: number,
  avoid: AvoidPoint[],
): { x: number; z: number }[] {
  const points: { x: number; z: number }[] = [];
  const sectorSize = (Math.PI * 2) / count;
  // Randomize which sector goes first so it's not always the same compass
  // direction that gets first pick when retries push points to sector edges.
  const sectorOffset = Math.random() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const sectorStart = sectorOffset + i * sectorSize;
    for (let attempt = 0; attempt < SPAWN_PLACEMENT.maxAttempts; attempt++) {
      const point = randomPointInSector(sectorStart, sectorSize, minDist, maxDist);
      const tooCloseToAvoid = avoid.some((p) => Math.hypot(p.x - point.x, p.z - point.z) < p.radius);
      const tooCloseToOwn = points.some(
        (p) => Math.hypot(p.x - point.x, p.z - point.z) < minSeparation,
      );
      if (!tooCloseToAvoid && !tooCloseToOwn) {
        points.push(point);
        break;
      }
    }
  }
  return points;
}

/** Random variant key, excluding up to two already-used neighbor variants so
 *  the same color never appears on adjacent props. Falls back to the full
 *  pool if the exclusions would leave nothing to pick from. */
function pickVariant(
  variants: readonly string[],
  ...exclude: (string | undefined)[]
): string {
  const pool = variants.filter((v) => !exclude.includes(v));
  const source = pool.length > 0 ? pool : variants;
  return source[Math.floor(Math.random() * source.length)] ?? variants[0]!;
}

/** Deliberate chokepoint props: primitive box gates go up immediately (so
 *  colliders are correct from frame one), then swap to the voxelized
 *  container model async — same upgrade pattern as bots/player/ground.
 *  Gate count and layout are randomized per run (user request 2026-07-06),
 *  avoiding whatever's in `avoid` (the boss totem, once it's placed). */
function buildContainerProps(
  scene: THREE.Scene,
  avoid: AvoidPoint[],
): { obstacles: Obstacle[]; centers: { x: number; z: number }[]; meshes: THREE.Object3D[] } {
  const {
    width,
    height,
    length,
    colliderRadius,
    colliderOffsets,
    gapHalf,
    countRange,
    minDistFromCenter,
    maxDistFromCenter,
    minSeparation,
    variants,
  } = CONTAINER_PROP;
  const obstacles: Obstacle[] = [];
  const meshesByVariant = new Map<string, THREE.Mesh[]>();
  const placeholderMaterial = litMaterial({ color: 0x286b68 });

  const gateCount = Math.floor(
    countRange[0] + Math.random() * (countRange[1] - countRange[0] + 1),
  );
  const centers = scatterPoints(gateCount, minDistFromCenter, maxDistFromCenter, minSeparation, avoid);
  // Both containers in a gate share one variant so the wall reads as one
  // consistent structure, not two mismatched halves. Angular neighbors never
  // share a color (2026-07-08 user request): `centers` comes out of
  // scatterPoints in sector order, so the previous gate in the array is the
  // angular neighbor — exclude its variant (and the first gate's, for the
  // last one, since the ring wraps around).
  const gates: { x: number; z: number; angleRad: number; gapHalf: number; variant: string }[] = [];
  for (let i = 0; i < centers.length; i++) {
    const c = centers[i]!;
    gates.push({
      x: c.x,
      z: c.z,
      angleRad: Math.random() * Math.PI * 2,
      gapHalf,
      variant: pickVariant(
        variants,
        gates[i - 1]?.variant,
        i === centers.length - 1 ? gates[0]?.variant : undefined,
      ),
    });
  }

  for (const gate of gates) {
    // The wall runs perpendicular to the corridor's facing direction; each
    // container's long axis (model +Z) lies along the wall.
    const perpX = -Math.sin(gate.angleRad);
    const perpZ = Math.cos(gate.angleRad);
    const wallYaw = Math.atan2(perpX, perpZ);
    // Inner ends sit gapHalf from the corridor center line.
    const centerDist = gate.gapHalf + length / 2;
    for (const side of [1, -1]) {
      const x = gate.x + perpX * centerDist * side;
      const z = gate.z + perpZ * centerDist * side;
      const yaw = wallYaw + side * 0.06;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, length),
        placeholderMaterial,
      );
      mesh.position.set(x, height / 2, z);
      mesh.rotation.y = yaw;
      scene.add(mesh);
      const list = meshesByVariant.get(gate.variant) ?? [];
      list.push(mesh);
      meshesByVariant.set(gate.variant, list);
      // Capsule-approx collision: circles spaced along the long axis.
      for (const offset of colliderOffsets) {
        obstacles.push({
          x: x + Math.sin(yaw) * offset,
          z: z + Math.cos(yaw) * offset,
          radius: colliderRadius,
        });
      }
    }
  }

  void upgradeVariantModels(meshesByVariant, placeholderMaterial);
  return { obstacles, centers, meshes: [...meshesByVariant.values()].flat() };
}

/** Builds each variant's voxel geometry once and assigns it to every mesh
 *  registered under that variant key — shared across container/barrel
 *  variants (2026-07-06 user request: same model, a few different colors
 *  so the map doesn't read as the same object copy-pasted everywhere). */
async function upgradeVariantModels(
  meshesByVariant: Map<string, THREE.Mesh[]>,
  placeholderMaterial: THREE.Material,
): Promise<void> {
  await Promise.all(
    [...meshesByVariant.entries()].map(async ([key, meshes]) => {
      const def = VOXEL_MODELS[key];
      if (!def) return;
      try {
        const grid = await buildModelGrid(key);
        const geometry = buildGridGeometry(grid, def.voxelSize);
        const voxelMaterial = litMaterial({ vertexColors: true });
        for (const mesh of meshes) {
          mesh.geometry.dispose();
          mesh.geometry = geometry;
          mesh.material = voxelMaterial;
          mesh.position.y = 0;
        }
      } catch (error) {
        console.warn(`Voxel model '${key}' unavailable, keeping primitive:`, error);
      }
    }),
  );
  placeholderMaterial.dispose();
}

/** Landmark scaffold towers: thin single-post placeholder up front (mostly
 *  presence, not a real blocker — see-through by design), swapped async to
 *  the voxel lattice model. */
function buildScaffoldProps(scene: THREE.Scene): { obstacles: Obstacle[]; meshes: THREE.Object3D[] } {
  const { width, height, widthScale, depthScale, colliderRadius, placements } = SCAFFOLD_PROP;
  const obstacles: Obstacle[] = [];
  const meshes: THREE.Mesh[] = [];
  const placeholderMaterial = litMaterial({ color: 0x93463a });

  for (const p of placements) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, width), placeholderMaterial);
    mesh.position.set(p.x, height / 2, p.z);
    mesh.rotation.y = p.rotationY;
    mesh.scale.set(widthScale, 1, depthScale);
    scene.add(mesh);
    meshes.push(mesh);
    obstacles.push({ x: p.x, z: p.z, radius: colliderRadius * Math.max(widthScale, depthScale) });
  }

  void upgradeScaffoldModels(meshes, placeholderMaterial);
  return { obstacles, meshes };
}

async function upgradeScaffoldModels(
  meshes: THREE.Mesh[],
  placeholderMaterial: THREE.Material,
): Promise<void> {
  const def = VOXEL_MODELS['scaffold'];
  if (!def) return;
  try {
    const grid = await buildModelGrid('scaffold');
    const geometry = buildGridGeometry(grid, def.voxelSize);
    const voxelMaterial = litMaterial({ vertexColors: true });
    for (const mesh of meshes) {
      mesh.geometry.dispose();
      mesh.geometry = geometry;
      mesh.material = voxelMaterial;
      mesh.position.y = 0;
      mesh.scale.set(SCAFFOLD_PROP.widthScale, 1, SCAFFOLD_PROP.depthScale);
    }
    placeholderMaterial.dispose();
  } catch (error) {
    console.warn('Scaffold voxel model unavailable, keeping primitive boxes:', error);
  }
}

/** Industrial drums scattered around the map — small obstacles, count and
 *  layout randomized per run (user request 2026-07-06), avoiding whatever's
 *  in `avoid` (container gates, the boss totem). */
function buildBarrelProps(
  scene: THREE.Scene,
  avoid: AvoidPoint[],
): { obstacles: Obstacle[]; meshes: THREE.Object3D[] } {
  const {
    width,
    height,
    colliderRadius,
    countRange,
    minDistFromCenter,
    maxDistFromCenter,
    minSeparation,
    variants,
  } = BARREL_PROP;
  const obstacles: Obstacle[] = [];
  const meshesByVariant = new Map<string, THREE.Mesh[]>();
  const placeholderMaterial = litMaterial({ color: 0x7c631b });

  const barrelCount = Math.floor(
    countRange[0] + Math.random() * (countRange[1] - countRange[0] + 1),
  );
  const points = scatterPoints(barrelCount, minDistFromCenter, maxDistFromCenter, minSeparation, avoid);

  for (const p of points) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(width / 2, width / 2, height, 10),
      placeholderMaterial,
    );
    mesh.position.set(p.x, height / 2, p.z);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    scene.add(mesh);
    const variant = variants[Math.floor(Math.random() * variants.length)] ?? variants[0];
    const list = meshesByVariant.get(variant) ?? [];
    list.push(mesh);
    meshesByVariant.set(variant, list);
    obstacles.push({ x: p.x, z: p.z, radius: colliderRadius });
  }

  void upgradeVariantModels(meshesByVariant, placeholderMaterial);
  return { obstacles, meshes: [...meshesByVariant.values()].flat() };
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
