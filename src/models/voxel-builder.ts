import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Voxel grid indexed [y][z][x]; cell = color (0xRRGGBB) or null for empty.
 * +Y up, last z row = model front (visor faces +Z per DIRECCION_ARTE rule 4).
 */
export type VoxelGrid = (number | null)[][][];

/**
 * Human-readable layer maps for hand-authored parts (treads, bodies).
 * `layers[y]` is one horizontal slice, bottom to top; rows run along +Z,
 * characters along +X. `.` or space = empty.
 */
export interface VoxelLayersSpec {
  palette: Record<string, number>;
  layers: string[][];
}

export function emptyGrid(width: number, height: number, depth: number): VoxelGrid {
  return Array.from({ length: height }, () =>
    Array.from({ length: depth }, () => new Array<number | null>(width).fill(null)),
  );
}

export function specToGrid(spec: VoxelLayersSpec): VoxelGrid {
  let width = 0;
  let depth = 0;
  for (const layer of spec.layers) {
    depth = Math.max(depth, layer.length);
    for (const row of layer) width = Math.max(width, row.length);
  }
  const grid = emptyGrid(width, spec.layers.length, depth);
  spec.layers.forEach((layer, y) => {
    layer.forEach((row, z) => {
      const gridRow = grid[y]?.[z];
      if (!gridRow) return;
      for (let x = 0; x < row.length; x++) {
        const ch = row.charAt(x);
        if (ch === '.' || ch === ' ') continue;
        const color = spec.palette[ch];
        if (color === undefined) throw new Error(`Voxel char '${ch}' missing from palette`);
        gridRow[x] = color;
      }
    });
  });
  return grid;
}

/** Pastes `src` into `dst` at the given offset (ignores out-of-bounds cells). */
export function pasteGrid(dst: VoxelGrid, src: VoxelGrid, ox: number, oy: number, oz: number): void {
  src.forEach((slice, y) => {
    slice.forEach((row, z) => {
      row.forEach((color, x) => {
        if (color === null) return;
        const dstRow = dst[y + oy]?.[z + oz];
        if (!dstRow) return;
        const tx = x + ox;
        if (tx < 0 || tx >= dstRow.length) return;
        dstRow[tx] = color;
      });
    });
  });
}

export function countGridVoxels(grid: VoxelGrid): number {
  let total = 0;
  for (const slice of grid) for (const row of slice) for (const c of row) if (c !== null) total++;
  return total;
}

function cellAt(grid: VoxelGrid, x: number, y: number, z: number): number | null {
  const row = grid[y]?.[z];
  if (!row || x < 0 || x >= row.length) return null;
  return row[x] ?? null;
}

/**
 * Builds one merged BufferGeometry with vertex colors from a voxel grid,
 * matching the render architecture in enemies.ts (single geometry per type,
 * vertex colors, per-instance tint left to InstancedMesh).
 *
 * Triangle control: interior voxels (no empty neighbor) are dropped, then
 * same-color surface voxels greedily merge into rectangles per Z slice
 * (grow along X first, then extend the run down +Y) — one box per rectangle.
 */
export function buildGridGeometry(grid: VoxelGrid, voxelSize: number): THREE.BufferGeometry {
  const height = grid.length;
  let width = 0;
  let depth = 0;
  for (const slice of grid) {
    depth = Math.max(depth, slice.length);
    for (const row of slice) width = Math.max(width, row.length);
  }
  const offsetX = (width * voxelSize) / 2;
  const offsetZ = (depth * voxelSize) / 2;

  // Surface shell only.
  const shell = emptyGrid(width, height, depth);
  for (let y = 0; y < height; y++) {
    for (let z = 0; z < depth; z++) {
      const shellRow = shell[y]?.[z];
      if (!shellRow) continue;
      for (let x = 0; x < width; x++) {
        const color = cellAt(grid, x, y, z);
        if (color === null) continue;
        const exposed =
          cellAt(grid, x + 1, y, z) === null ||
          cellAt(grid, x - 1, y, z) === null ||
          cellAt(grid, x, y + 1, z) === null ||
          cellAt(grid, x, y - 1, z) === null ||
          cellAt(grid, x, y, z + 1) === null ||
          cellAt(grid, x, y, z - 1) === null;
        if (exposed) shellRow[x] = color;
      }
    }
  }

  const parts: THREE.BufferGeometry[] = [];
  const used = emptyGrid(width, height, depth);
  for (let z = 0; z < depth; z++) {
    for (let y = 0; y < height; y++) {
      let x = 0;
      while (x < width) {
        const color = cellAt(shell, x, y, z);
        if (color === null || cellAt(used, x, y, z) !== null) {
          x++;
          continue;
        }
        let runEnd = x + 1;
        while (
          runEnd < width &&
          cellAt(shell, runEnd, y, z) === color &&
          cellAt(used, runEnd, y, z) === null
        ) {
          runEnd++;
        }
        const runLength = runEnd - x;

        // Grow the X run upward through identical unclaimed rows.
        let runHeight = 1;
        grow: while (y + runHeight < height) {
          for (let gx = x; gx < runEnd; gx++) {
            if (
              cellAt(shell, gx, y + runHeight, z) !== color ||
              cellAt(used, gx, y + runHeight, z) !== null
            ) {
              break grow;
            }
          }
          runHeight++;
        }
        for (let gy = y; gy < y + runHeight; gy++) {
          const usedRow = used[gy]?.[z];
          if (!usedRow) continue;
          for (let gx = x; gx < runEnd; gx++) usedRow[gx] = 1;
        }

        const geometry = new THREE.BoxGeometry(
          runLength * voxelSize,
          runHeight * voxelSize,
          voxelSize,
        );
        geometry.translate(
          (x + runLength / 2) * voxelSize - offsetX,
          (y + runHeight / 2) * voxelSize,
          (z + 0.5) * voxelSize - offsetZ,
        );
        applyVertexColor(geometry, color);
        parts.push(geometry);
        x = runEnd;
      }
    }
  }

  const merged = mergeGeometries(parts);
  if (!merged) throw new Error('Failed to merge voxel geometry');
  return merged;
}

function applyVertexColor(geometry: THREE.BufferGeometry, hex: number): void {
  const color = new THREE.Color(hex);
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}
