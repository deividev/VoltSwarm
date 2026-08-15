import * as THREE from 'three';
import {
  ARENA_HALF_SIZE,
  BARREL_PROP,
  CAMERA,
  CONTAINER_PROP,
  MAPS,
  MEGAFACTORY_MAP,
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
  maps: WorldMapController;
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

  const maps = createWorldMapController(scene);
  // Nothing to avoid yet at construction time — the boss totem doesn't exist
  // until the first startRun(). Real per-run regeneration (avoiding the
  // totem) happens via placeRandomProps(), called again from game.ts.
  const props = placeRandomProps(scene, []);
  return { scene, obstacles: props.obstacles, propMeshes: props.meshes, maps };
}

export interface WorldMapController {
  readonly activeMapId: string;
  /** Rebuilds only map-owned floor/scenery and returns its collision set. */
  setMap(mapId: string): Obstacle[];
}

function createWorldMapController(scene: THREE.Scene): WorldMapController {
  const root = new THREE.Group();
  root.name = 'active-map';
  scene.add(root);
  let generation = 0;
  let activeMapId = '';

  const controller: WorldMapController = {
    get activeMapId() { return activeMapId; },
    setMap(mapId: string): Obstacle[] {
      generation++;
      activeMapId = mapId;
      for (const child of [...root.children]) {
        root.remove(child);
        disposeObject(child);
      }
      if (mapId === MAPS[1].id) return buildMegafactoryMap(root);
      buildScrapyardGround(root, generation, () => generation === controllerGeneration());
      return [];
    },
  };
  const controllerGeneration = (): number => generation;
  controller.setMap(MAPS[0].id);
  return controller;
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

function buildScrapyardGround(
  scene: THREE.Object3D,
  generation: number,
  isCurrent: () => boolean,
): void {
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
  void upgradeGroundTexture(ground, generation, isCurrent);
}

async function upgradeGroundTexture(
  ground: THREE.Mesh,
  _generation: number,
  isCurrent: () => boolean,
): Promise<void> {
  try {
    const texture = await new THREE.TextureLoader().loadAsync(VISUAL.ground.aiTextureUrl);
    // A Map 1 texture may resolve after Map 2 has already replaced its ground.
    // Discard it instead of mutating a disposed material from the old map.
    if (!isCurrent() || !ground.parent) {
      texture.dispose();
      return;
    }
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

function buildMegafactoryMap(root: THREE.Object3D): Obstacle[] {
  const cfg = MEGAFACTORY_MAP;
  const size = ARENA_HALF_SIZE * 2;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    litMaterial({ map: createMegafactoryGroundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  root.add(ground);

  const obstacles: Obstacle[] = [];
  const towerMaterial = litMaterial({ color: cfg.colors.charcoal });
  const trimMaterial = new THREE.MeshBasicMaterial({ color: cfg.colors.cyan });
  for (let index = 0; index < cfg.towerCount; index++) {
    const angle = (index / cfg.towerCount) * Math.PI * 2;
    const heightLerp = (index % 4) / 3;
    const height = THREE.MathUtils.lerp(cfg.towerHeightMin, cfg.towerHeightMax, heightLerp);
    const x = Math.cos(angle) * cfg.perimeterRadius;
    const z = Math.sin(angle) * cfg.perimeterRadius;
    const tower = new THREE.Group();
    tower.position.set(x, 0, z);
    tower.rotation.y = -angle;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(cfg.towerWidth, height, cfg.towerDepth),
      towerMaterial,
    );
    body.position.y = height / 2;
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(cfg.towerWidth * 0.72, 0.32, cfg.towerDepth + 0.08),
      trimMaterial,
    );
    trim.position.y = height * 0.64;
    tower.add(body, trim);
    root.add(tower);
    obstacles.push({ x, z, radius: cfg.towerColliderRadius, blocksFlyers: true });
  }

  const pipeMaterial = new THREE.MeshBasicMaterial({ color: cfg.colors.cyan });
  for (let index = 0; index < cfg.pipeSegments; index++) {
    const angle = (index / cfg.pipeSegments) * Math.PI * 2;
    const next = ((index + 1) / cfg.pipeSegments) * Math.PI * 2;
    const ax = Math.cos(angle) * cfg.perimeterRadius;
    const az = Math.sin(angle) * cfg.perimeterRadius;
    const bx = Math.cos(next) * cfg.perimeterRadius;
    const bz = Math.sin(next) * cfg.perimeterRadius;
    const length = Math.hypot(bx - ax, bz - az);
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(cfg.pipeRadius, cfg.pipeRadius, length, 6),
      pipeMaterial,
    );
    pipe.position.set((ax + bx) / 2, cfg.pipeHeight, (az + bz) / 2);
    pipe.rotation.z = Math.PI / 2;
    pipe.rotation.y = -Math.atan2(bz - az, bx - ax);
    root.add(pipe);
  }

  const heatMaterial = new THREE.MeshBasicMaterial({ color: cfg.colors.heat });
  for (let index = 0; index < cfg.heatLaneCount; index++) {
    const angle = (index / cfg.heatLaneCount) * Math.PI * 2;
    const lane = new THREE.Mesh(
      new THREE.PlaneGeometry(cfg.heatLaneWidth, cfg.heatLaneLength),
      heatMaterial,
    );
    const distance = cfg.openCenterRadius + cfg.heatLaneLength / 2;
    lane.rotation.x = -Math.PI / 2;
    lane.rotation.z = -angle;
    lane.position.set(Math.cos(angle) * distance, 0.025, Math.sin(angle) * distance);
    root.add(lane);
  }
  return obstacles;
}

/** Foundry floor plate: steel plates with tread, bolts, wear and molten heat
 *  scoring, drawn once into a canvas. Seeded so every run gets the same floor,
 *  and TILEABLE — every pass wraps at the edges, or the seam between repeats
 *  would draw a visible grid across the arena. */
function createMegafactoryGroundTexture(): THREE.CanvasTexture {
  const cfg = MEGAFACTORY_MAP;
  const f = cfg.floor;
  const canvas = document.createElement('canvas');
  canvas.width = f.textureSize;
  canvas.height = f.textureSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  const rng = mulberry32(21);
  const size = f.textureSize;
  const plate = size / f.plates;
  const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;
  /** Draws at (x, y) and at its wrapped twins, so a mark straddling an edge
   *  reappears on the opposite side instead of being clipped. */
  const wrapped = (x: number, y: number, draw: (x: number, y: number) => void): void => {
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) draw(x + dx, y + dy);
  };

  // Base plates with per-plate brightness jitter, so the floor never reads as
  // one flat fill the way the first version did.
  const base = cfg.colors.floor;
  const [br, bg, bb] = [(base >> 16) & 255, (base >> 8) & 255, base & 255];
  for (let py = 0; py < f.plates; py++) {
    for (let px = 0; px < f.plates; px++) {
      const jitter = (rng() - 0.5) * f.plateJitter * 2;
      ctx.fillStyle = `rgb(${br + jitter}, ${bg + jitter}, ${bb + jitter})`;
      ctx.fillRect(px * plate, py * plate, plate + 1, plate + 1);
    }
  }

  // Tread plate: diagonal grip ribs on a scattered subset of plates. This is the
  // pass that reads as "industrial metal" rather than "painted concrete".
  ctx.save();
  for (let i = 0; i < f.treadPlates; i++) {
    const px = Math.floor(rng() * f.plates);
    const py = Math.floor(rng() * f.plates);
    const flip = rng() < 0.5;
    ctx.save();
    ctx.beginPath();
    ctx.rect(px * plate, py * plate, plate, plate);
    ctx.clip();
    ctx.strokeStyle = `rgba(96, 116, 132, ${0.05 + rng() * 0.05})`;
    ctx.lineWidth = 2;
    for (let o = -plate; o < plate * 2; o += f.treadSpacingPx) {
      ctx.beginPath();
      ctx.moveTo(px * plate + o, py * plate);
      ctx.lineTo(px * plate + o + (flip ? plate : -plate), py * plate + plate);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();

  // Wear: faint dark smudges. Small and low-alpha or they read as glitches.
  for (let i = 0; i < f.wearBlobs; i++) {
    const r = plate * (0.22 + rng() * 0.5);
    const x = rng() * size;
    const y = rng() * size;
    const ry = r * (0.5 + rng() * 0.7);
    const rot = rng() * Math.PI;
    ctx.fillStyle = `rgba(14, 20, 26, ${0.05 + rng() * 0.05})`;
    wrapped(x, y, (wx, wy) => {
      ctx.beginPath();
      ctx.ellipse(wx, wy, r, ry, rot, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // Heat scoring: molten spill that cooled on the plate. Amber core bleeding to
  // dark scorch — the pass that says FOUNDRY instead of generic factory floor.
  for (let i = 0; i < f.heatStains; i++) {
    const r = plate * (0.35 + rng() * 0.85);
    const x = rng() * size;
    const y = rng() * size;
    wrapped(x, y, (wx, wy) => {
      const grad = ctx.createRadialGradient(wx, wy, 0, wx, wy, r);
      grad.addColorStop(0, `${hex(cfg.colors.heat)}2e`);
      grad.addColorStop(0.55, `${hex(cfg.colors.amber)}14`);
      grad.addColorStop(1, '#0000');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(wx, wy, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // Bright scuffs: chipped steel catching the light. Wrapped like the rest, so
  // one straddling an edge is not sliced in half at the tiling seam.
  for (let i = 0; i < f.scuffs; i++) {
    ctx.fillStyle = `rgba(130, 150, 168, ${0.05 + rng() * 0.07})`;
    const w = 2 + rng() * plate * 0.3;
    const h = 2 + rng() * 3;
    const x = rng() * size;
    const y = rng() * size;
    wrapped(x, y, (wx, wy) => ctx.fillRect(wx, wy, w, h));
  }

  // Cyan inspection lanes: a few plate rows edged as walkways. Sparse on
  // purpose — the cyan is the brand accent and must not carpet the floor.
  ctx.strokeStyle = hex(cfg.colors.cyan);
  for (let i = 0; i < f.conduitLanes; i++) {
    const row = Math.floor(rng() * f.plates);
    const vertical = rng() < 0.5;
    const at = row * plate + plate * 0.5;
    ctx.globalAlpha = 0.14 + rng() * 0.1;
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (vertical) { ctx.moveTo(at, 0); ctx.lineTo(at, size); }
    else { ctx.moveTo(0, at); ctx.lineTo(size, at); }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Seams last, over everything: a dark recess with a lit upper lip, so plates
  // read as separate slabs rather than a drawn grid.
  for (let i = 0; i <= f.plates; i++) {
    const p = Math.round(i * plate) + 0.5;
    ctx.strokeStyle = hex(cfg.colors.seam);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p, 0); ctx.lineTo(p, size);
    ctx.moveTo(0, p); ctx.lineTo(size, p);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(104, 124, 140, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p + 2, 0); ctx.lineTo(p + 2, size);
    ctx.moveTo(0, p + 2); ctx.lineTo(size, p + 2);
    ctx.stroke();
  }

  // Bolt studs at plate corners — the small repeated detail that sells scale.
  const inset = plate * f.boltInset;
  for (let py = 0; py < f.plates; py++) {
    for (let px = 0; px < f.plates; px++) {
      for (const [ox, oy] of [[inset, inset], [plate - inset, inset], [inset, plate - inset], [plate - inset, plate - inset]]) {
        const bx = px * plate + (ox as number);
        const by = py * plate + (oy as number);
        ctx.fillStyle = 'rgba(12, 17, 22, 0.5)';
        ctx.beginPath();
        ctx.arc(bx, by + 1.5, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(122, 142, 158, 0.4)';
        ctx.beginPath();
        ctx.arc(bx, by, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(f.repeats, f.repeats);
  return texture;
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      const mapped = material as THREE.Material & { map?: THREE.Texture | null };
      mapped.map?.dispose();
      material.dispose();
    }
  });
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
