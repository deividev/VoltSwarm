import * as THREE from 'three';
import { VISUAL } from './config';

/**
 * Shared lit-material factory for the toon pass: quantizes lighting into a
 * few hard steps (the "painted toy" look) while staying a drop-in Lambert
 * replacement — same options, same vertex-color and instancing support.
 * With VISUAL.toon.enabled off it returns plain Lambert.
 */

let gradientMap: THREE.DataTexture | null = null;

function getGradientMap(): THREE.DataTexture {
  if (!gradientMap) {
    const steps = VISUAL.toon.steps;
    const data = new Uint8Array(steps);
    for (let i = 0; i < steps; i++) {
      // Shadow floor at 45% so the dark step stays readable on the slate
      // ground instead of going black.
      const t = steps > 1 ? i / (steps - 1) : 1;
      data[i] = Math.round(255 * (0.45 + 0.55 * t));
    }
    gradientMap = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
    gradientMap.minFilter = THREE.NearestFilter;
    gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.needsUpdate = true;
  }
  return gradientMap;
}

export function litMaterial(
  options: THREE.MeshLambertMaterialParameters,
): THREE.MeshLambertMaterial | THREE.MeshToonMaterial {
  if (!VISUAL.toon.enabled) return new THREE.MeshLambertMaterial(options);
  return new THREE.MeshToonMaterial({ ...options, gradientMap: getGradientMap() });
}
