import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { SlagcasterCannonGeometryConfig, SlagcasterTransformConfig } from '../config';

export const SLAGCASTER_DEPLOY_ATTRIBUTE = 'instanceSlagDeploy';

const LOCAL_ROLL_VECTOR = new THREE.Vector3();
const LOCAL_ROLL_ROTATION = new THREE.Matrix4();
const LOCAL_ROLL_TRANSLATE = new THREE.Matrix4();

/** Semantic topology groups. Kept numeric because the shader receives them as
 * a compact vertex attribute. */
export const SLAGCASTER_PART = {
  shell: 0,
  cannon: 1,
  anchors: 2,
  crucible: 3,
} as const;

export const SLAGCASTER_CANNON_HINT_ATTRIBUTE = 'slagCannonHint';

function cannonBox(
  spec: { readonly size: readonly [number, number, number]; readonly center: readonly [number, number, number] },
  color: number,
  indexed: boolean,
): THREE.BufferGeometry {
  let geometry: THREE.BufferGeometry = new THREE.BoxGeometry(...spec.size);
  geometry.translate(...spec.center);
  const tint = new THREE.Color(color);
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute(SLAGCASTER_CANNON_HINT_ATTRIBUTE, new THREE.BufferAttribute(new Float32Array(count).fill(1), 1));
  if (!indexed) geometry = geometry.toNonIndexed();
  return geometry;
}

/** Builds the muzzle as a stamped voxel RING (see SLAGCASTER.cannonGeometry).
 *
 * Cells are laid out on the body's own voxel lattice and merged into X runs
 * per row and colour, so a ~9-voxel disc costs about 30 boxes instead of 70.
 * Each run spans the ring's full thickness: from the front it shows the sheet's
 * banding, and from the game's top-down camera it shows a dark cylinder edge. */
function muzzleRingBoxes(
  ring: SlagcasterCannonGeometryConfig['muzzleRing'],
  indexed: boolean,
): THREE.BufferGeometry[] {
  const [cx, cy] = ring.center;
  const depth = ring.zTo - ring.zFrom;
  const zCenter = (ring.zFrom + ring.zTo) / 2;
  const half = Math.ceil(ring.outerRadius / ring.voxel);
  const boxes: THREE.BufferGeometry[] = [];

  // Radius bands, outermost first. A cell takes the first band it falls in.
  const bandFor = (r: number): number | null => {
    if (r <= ring.boreRadius) return ring.boreColor;
    if (r <= ring.ringInnerRadius) return ring.rimColor;
    if (r <= ring.ringOuterRadius) return ring.ringColor;
    if (r <= ring.outerRadius) return ring.rimColor;
    return null;
  };

  for (let iy = -half; iy <= half; iy++) {
    const dy = iy * ring.voxel;
    let ix = -half;
    while (ix <= half) {
      const color = bandFor(Math.hypot(ix * ring.voxel, dy));
      if (color == null) {
        ix++;
        continue;
      }
      let end = ix + 1;
      while (end <= half && bandFor(Math.hypot(end * ring.voxel, dy)) === color) end++;
      const runLength = end - ix;
      const box = cannonBox(
        {
          size: [runLength * ring.voxel, ring.voxel, depth],
          center: [cx + (ix + runLength / 2 - 0.5) * ring.voxel, cy + dy, zCenter],
        },
        color,
        indexed,
      );
      boxes.push(box);
      ix = end;
    }
  }
  return boxes;
}

/** Stamps a guaranteed connected cannon into the same deployed geometry. The
 * v3 sheets drive the body silhouette/paint, while these overlapping solids
 * give the lateral cannon real +Z volume instead of a global side-profile
 * extrusion. The merged result remains one topology and one InstancedMesh. */
export function addSlagcasterCannonGeometry(
  deployed: THREE.BufferGeometry,
  config: SlagcasterCannonGeometryConfig,
): THREE.BufferGeometry {
  const basePosition = deployed.getAttribute('position');
  if (!(basePosition instanceof THREE.BufferAttribute)) {
    throw new Error('Slagcaster cannon stamp requires position geometry');
  }
  deployed.setAttribute(
    SLAGCASTER_CANNON_HINT_ATTRIBUTE,
    new THREE.BufferAttribute(new Float32Array(basePosition.count), 1),
  );
  const indexed = deployed.index !== null;
  // Every piece carries its own colour now: the cannon is split by the sheets'
  // own paint, so it can never collapse back into one flat dark mass.
  const solids = [
    config.neck,
    config.barrel,
    config.barrelTopNear,
    config.barrelTopSpine,
    config.barrelTopFar,
    config.barrelStrut,
    config.rootVent,
  ].map((piece) => cannonBox(piece, piece.color, indexed));
  const ring = muzzleRingBoxes(config.muzzleRing, indexed);
  const merged = mergeGeometries([deployed, ...solids, ...ring]);
  for (const box of solids) box.dispose();
  for (const box of ring) box.dispose();
  if (!merged) throw new Error('Slagcaster cannon geometry could not be merged');
  deployed.dispose();
  return merged;
}

/** Rolls the compact pose around its authored sphere centre without moving the
 * enemy's gameplay origin. Deforming poses remain upright: both endpoints are
 * grounded, so their per-vertex interpolation cannot cross the floor. */
export function composeSlagcasterInstanceMatrix(
  target: THREE.Matrix4,
  heading: number,
  rollAngle: number,
  deploymentProgress: number,
  scale: number,
  x: number,
  z: number,
  rollingRadius: number,
): THREE.Matrix4 {
  target.makeRotationY(heading);
  target.scale(LOCAL_ROLL_VECTOR.set(scale, scale, scale));
  if (deploymentProgress <= 0) {
    LOCAL_ROLL_TRANSLATE.makeTranslation(0, rollingRadius, 0);
    target.multiply(LOCAL_ROLL_TRANSLATE);
    LOCAL_ROLL_ROTATION.makeRotationX(rollAngle);
    target.multiply(LOCAL_ROLL_ROTATION);
    LOCAL_ROLL_TRANSLATE.makeTranslation(0, -rollingRadius, 0);
    target.multiply(LOCAL_ROLL_TRANSLATE);
  }
  // Preserve the translation created by T(center) * R * T(-center); replacing
  // the matrix position here would silently restore the old ground pivot.
  LOCAL_ROLL_VECTOR.setFromMatrixPosition(target);
  target.setPosition(
    LOCAL_ROLL_VECTOR.x + x,
    LOCAL_ROLL_VECTOR.y,
    LOCAL_ROLL_VECTOR.z + z,
  );
  return target;
}

export function slagcasterPartProgress(
  partId: number,
  progress: number,
  config: SlagcasterTransformConfig,
): number {
  const range =
    partId > 2.5
      ? config.stagger.crucible
      : partId > 1.5
        ? config.stagger.anchors
        : partId > 0.5
          ? config.stagger.cannon
          : config.stagger.shell;
  const t = THREE.MathUtils.clamp(
    (progress - range[0]) / Math.max(0.0001, range[1] - range[0]),
    0,
    1,
  );
  return t * t * (3 - 2 * t);
}

/** Adds a compact closed pose plus semantic ownership to the deployed endpoint.
 * The deployed mesh remains the single authoritative topology. At progress 0
 * its vertices are wrapped onto the approved closed diameter; at progress 1
 * they return exactly to the deployed technical sheet geometry. */
export function makeSlagcasterTransformGeometry(
  deployed: THREE.BufferGeometry,
  instanceCapacity: number,
  closedDiameter: number,
  config: SlagcasterTransformConfig,
): THREE.BufferGeometry {
  const position = deployed.getAttribute('position');
  if (!(position instanceof THREE.BufferAttribute)) {
    throw new Error('Slagcaster geometry needs a non-interleaved position attribute');
  }
  deployed.computeBoundingBox();
  const bounds = deployed.boundingBox;
  if (!bounds) throw new Error('Slagcaster geometry has no bounds');

  const cannonHint = deployed.getAttribute(SLAGCASTER_CANNON_HINT_ATTRIBUTE);

  // Normalize against the BODY, never the cannon.
  //
  // Every vertex is mapped to the closed ball by the DIRECTION of its
  // normalized position, so whatever sets that normalization decides which
  // part of the ball each vertex covers. Taking it from the whole geometry
  // hands that decision to the longest appendage: measured on the current
  // model, the cannon drags the centre to z 0.3481 against a body whose own
  // centre is 0 and whose half-depth is only 0.4087. Every body vertex then
  // normalizes to nz <= 0.08, the whole shell collapses onto the back
  // hemisphere, and the front of the ball is left with nothing but the
  // cannon's handful of vertices — a visible hole in the rolling pose.
  //
  // Using the body's own bounds also makes the ball independent of how far the
  // cannon reaches, so tuning the gun can never tear the roll open again.
  const bodyBounds = new THREE.Box3();
  const bodyPoint = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    if (cannonHint && cannonHint.getX(i) > 0.5) continue;
    bodyBounds.expandByPoint(bodyPoint.fromBufferAttribute(position, i));
  }
  const normalizeBounds = bodyBounds.isEmpty() ? bounds : bodyBounds;

  const center = normalizeBounds.getCenter(new THREE.Vector3());
  const size = normalizeBounds.getSize(new THREE.Vector3());
  const halfX = Math.max(Number.EPSILON, size.x / 2);
  const halfY = Math.max(Number.EPSILON, size.y / 2);
  const halfZ = Math.max(Number.EPSILON, size.z / 2);
  const radius = closedDiameter / 2;
  const closed = new Float32Array(position.count * 3);
  const parts = new Float32Array(position.count);
  const direction = new THREE.Vector3();

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const nx = (x - center.x) / halfX;
    const ny = (y - center.y) / halfY;
    const nz = (z - center.z) / halfZ;

    let part: number = SLAGCASTER_PART.shell;
    if (cannonHint?.getX(i) > 0.5) {
      part = SLAGCASTER_PART.cannon;
    } else if (ny <= config.semantic.anchorMaxY && Math.abs(nx) >= config.semantic.anchorMinAbsX) {
      part = SLAGCASTER_PART.anchors;
    } else if (nx >= config.semantic.cannonMinX && ny >= config.semantic.cannonMinY) {
      part = SLAGCASTER_PART.cannon;
    } else if (ny >= config.semantic.crucibleMinY) {
      part = SLAGCASTER_PART.crucible;
    }
    parts[i] = part;

    // Every deployed surface vertex receives a stable point on one compact
    // ellipsoid. Keeping the target deterministic avoids geometry swaps and
    // lets hundreds of instances hold unrelated animation progress values.
    direction.set(nx, ny, nz);
    if (direction.lengthSq() < Number.EPSILON) direction.set(0, 1, 0);
    direction.normalize();
    closed[i * 3] = direction.x * radius;
    closed[i * 3 + 1] = radius + direction.y * radius;
    closed[i * 3 + 2] = direction.z * radius;
  }

  deployed.setAttribute('slagClosedPosition', new THREE.BufferAttribute(closed, 3));
  deployed.setAttribute('slagPartId', new THREE.BufferAttribute(parts, 1));
  const progress = new THREE.InstancedBufferAttribute(new Float32Array(instanceCapacity), 1);
  progress.setUsage(THREE.DynamicDrawUsage);
  deployed.setAttribute(SLAGCASTER_DEPLOY_ATTRIBUTE, progress);
  deployed.boundingSphere = null;
  deployed.computeBoundingSphere();
  return deployed;
}

export function createSlagcasterTransformMaterial(
  base: THREE.MeshLambertMaterial | THREE.MeshToonMaterial,
  config: SlagcasterTransformConfig,
): THREE.MeshLambertMaterial | THREE.MeshToonMaterial {
  const material = base.clone();
  const ranges = config.stagger;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec3 slagClosedPosition;
attribute float slagPartId;
attribute float ${SLAGCASTER_DEPLOY_ATTRIBUTE};

float slagPartProgress(float partId, float progress) {
  vec2 range = vec2(${ranges.shell[0].toFixed(6)}, ${ranges.shell[1].toFixed(6)});
  if (partId > 2.5) range = vec2(${ranges.crucible[0].toFixed(6)}, ${ranges.crucible[1].toFixed(6)});
  else if (partId > 1.5) range = vec2(${ranges.anchors[0].toFixed(6)}, ${ranges.anchors[1].toFixed(6)});
  else if (partId > 0.5) range = vec2(${ranges.cannon[0].toFixed(6)}, ${ranges.cannon[1].toFixed(6)});
  float t = clamp((progress - range.x) / max(0.0001, range.y - range.x), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}`,
      )
      .replace(
        '#include <begin_vertex>',
        `float slagT = slagPartProgress(slagPartId, ${SLAGCASTER_DEPLOY_ATTRIBUTE});
vec3 transformed = mix(slagClosedPosition, position, slagT);`,
      );
  };
  material.customProgramCacheKey = () => `slagcaster-transform-v1-${JSON.stringify(ranges)}`;
  return material;
}

export function setSlagcasterDeploymentAt(
  mesh: THREE.InstancedMesh,
  slot: number,
  progress: number,
): boolean {
  const attribute = mesh.geometry.getAttribute(SLAGCASTER_DEPLOY_ATTRIBUTE);
  if (!(attribute instanceof THREE.InstancedBufferAttribute) || slot < 0 || slot >= attribute.count) {
    return false;
  }
  attribute.setX(slot, THREE.MathUtils.clamp(progress, 0, 1));
  return true;
}

export function markSlagcasterDeploymentDirty(mesh: THREE.InstancedMesh): void {
  const attribute = mesh.geometry.getAttribute(SLAGCASTER_DEPLOY_ATTRIBUTE);
  if (attribute instanceof THREE.InstancedBufferAttribute) attribute.needsUpdate = true;
}
