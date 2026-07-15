import * as THREE from 'three';
import { GOLD } from './config';

// In-run currency drops: flat hexagonal gold tokens spinning on Y — the
// universal "coin" read. Deliberately distinct from XP orbs (blue floating
// spheres) and chests (big gold beacon): tiny, flat, spinning, warm gold.
// Same merge-on-spawn pattern as xp-orbs.ts so 400+ kills stay cheap.

interface Token {
  active: boolean;
  x: number;
  z: number;
  value: number;
  flying: boolean;
  speed: number;
}

const tmpMatrix = new THREE.Matrix4();
const tmpRot = new THREE.Matrix4();
const tmpScale = new THREE.Vector3();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

export class GoldSystem {
  private readonly mesh: THREE.InstancedMesh;
  private readonly pool: Token[] = [];
  private spinPhase = 0;

  constructor(scene: THREE.Scene) {
    // Hex "washer": a 6-segment cylinder stood upright like a coin.
    const geometry = new THREE.CylinderGeometry(
      GOLD.tokenRadius,
      GOLD.tokenRadius,
      0.09,
      6,
    );
    geometry.rotateX(Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({ color: 0xf2b632 });
    this.mesh = new THREE.InstancedMesh(geometry, material, GOLD.maxCount);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    for (let i = 0; i < GOLD.maxCount; i++) {
      this.pool.push({ active: false, x: 0, z: 0, value: 0, flying: false, speed: 0 });
      this.mesh.setMatrixAt(i, HIDDEN);
    }
  }

  /** Drops a token, merging into a neighbor when one is close enough. */
  spawn(x: number, z: number, value: number): void {
    const mergeSq = GOLD.mergeRadius * GOLD.mergeRadius;
    for (const token of this.pool) {
      if (!token.active || token.flying) continue;
      const dSq = (token.x - x) * (token.x - x) + (token.z - z) * (token.z - z);
      if (dSq <= mergeSq) {
        token.value += value;
        return;
      }
    }
    const index = this.pool.findIndex((t) => !t.active);
    if (index === -1) {
      // Pool exhausted: fold the value into the oldest token, never lose gold.
      const fallback = this.pool[0];
      if (fallback) fallback.value += value;
      return;
    }
    const token = this.pool[index];
    if (!token) return;
    token.active = true;
    token.x = x;
    token.z = z;
    token.value = value;
    token.flying = false;
    token.speed = 0;
  }

  /** Moves tokens; calls `onCollect` for each token the player absorbs. */
  update(
    dt: number,
    px: number,
    pz: number,
    pickupRange: number,
    onCollect: (value: number) => void,
  ): void {
    this.spinPhase += dt;
    const rangeSq = pickupRange * pickupRange;
    const collectSq = GOLD.collectRadius * GOLD.collectRadius;

    for (let i = 0; i < this.pool.length; i++) {
      const token = this.pool[i];
      if (!token || !token.active) continue;

      let dx = px - token.x;
      let dz = pz - token.z;
      const dSq = dx * dx + dz * dz;

      if (!token.flying && dSq <= rangeSq) token.flying = true;
      if (token.flying) {
        token.speed = Math.min(token.speed + GOLD.flySpeed * 2.5 * dt, GOLD.flySpeed);
        const dist = Math.sqrt(dSq) || 1;
        dx /= dist;
        dz /= dist;
        token.x += dx * token.speed * dt;
        token.z += dz * token.speed * dt;
      }

      if (dSq <= collectSq) {
        token.active = false;
        this.mesh.setMatrixAt(i, HIDDEN);
        onCollect(token.value);
        continue;
      }

      // Merged (fatter) stacks read slightly bigger; constant coin spin.
      const s = Math.min(1 + Math.log2(1 + token.value) * 0.12, 1.8);
      tmpMatrix.makeRotationY(this.spinPhase * 3 + i);
      tmpMatrix.multiply(tmpRot.makeRotationX(Math.PI / 2));
      tmpMatrix.scale(tmpScale.set(s, s, s));
      tmpMatrix.setPosition(token.x, 0.55, token.z);
      this.mesh.setMatrixAt(i, tmpMatrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  reset(): void {
    for (let i = 0; i < this.pool.length; i++) {
      const token = this.pool[i];
      if (token) token.active = false;
      this.mesh.setMatrixAt(i, HIDDEN);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
