import * as THREE from 'three';
import type { VoxelModelDef } from './registry';

export type RuntimeDetailMaterialFactory = (color: number) => THREE.Material;

function box(
  size: readonly [number, number, number],
  position: readonly [number, number, number],
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  return mesh;
}

/** Builds asymmetric volumes that cannot be encoded by the symmetric
 * measured-profile extrusion. The model definition keeps preview and runtime
 * rendering on the same candidate. */
export function buildRuntimeModelDetails(
  def: VoxelModelDef,
  createMaterial: RuntimeDetailMaterialFactory,
): THREE.Group | null {
  const spec = def.runtimeDetails?.backpack;
  if (!spec) return null;

  const root = new THREE.Group();
  root.name = 'runtime-model-details';
  root.userData.runtimeDetail = 'backpack';
  root.userData.socketCount = spec.socketCount;
  const body = createMaterial(spec.bodyColor);
  const trim = createMaterial(spec.trimColor);
  const accent = createMaterial(spec.accentColor);
  const [width, height, depth] = spec.size;
  const [x, y, z] = spec.position;
  const rearZ = z - depth / 2;

  root.add(box(spec.size, spec.position, body));
  root.add(box([width * 0.92, height * 0.08, depth * 1.08], [x, y - height * 0.42, z], trim));
  root.add(box([width * 0.92, height * 0.08, depth * 1.08], [x, y + height * 0.42, z], trim));

  const socketWidth = width * 0.16;
  const socketGap = width * 0.25;
  const socketY = y + height * 0.24;
  for (let index = 0; index < spec.socketCount; index++) {
    const offset = (index - (spec.socketCount - 1) / 2) * socketGap;
    root.add(box([socketWidth, socketWidth, depth * 0.12], [x + offset, socketY, rearZ - depth * 0.07], trim));
  }

  root.add(box([width * 0.12, height * 0.48, depth * 0.12], [x, y - height * 0.1, rearZ - depth * 0.07], accent));
  root.add(box([width * 0.5, height * 0.07, depth * 0.14], [x, y + height * 0.04, rearZ - depth * 0.08], trim));
  root.add(box([width * 0.5, height * 0.07, depth * 0.14], [x, y - height * 0.3, rearZ - depth * 0.08], trim));
  for (const side of [-1, 1]) {
    const sideX = x + side * (width / 2 + width * 0.025);
    root.add(box([width * 0.05, height * 0.58, depth * 0.62], [sideX, y, z - depth * 0.08], trim));
    root.add(box([width * 0.055, height * 0.17, depth * 0.32], [sideX + side * width * 0.004, y - height * 0.08, rearZ], accent));
  }
  return root;
}

export function disposeRuntimeModel(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    geometries.add(child.geometry);
    if (Array.isArray(child.material)) child.material.forEach((material) => materials.add(material));
    else materials.add(child.material);
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}
