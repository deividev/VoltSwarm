import * as THREE from 'three';
import { XP_ORBS } from './config';

// XP no longer lands in your pocket: enemies drop orbs where they die and the
// player must move into pickup range to vacuum them up. Nearby orbs merge so
// dense kill zones stay cheap to render.

interface Orb {
  active: boolean;
  x: number;
  z: number;
  value: number;
  /** True once inside pickup range — the orb accelerates toward the player. */
  flying: boolean;
  speed: number;
}

const tmpMatrix = new THREE.Matrix4();
const tmpScale = new THREE.Vector3();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

export class XpOrbSystem {
  private readonly mesh: THREE.InstancedMesh;
  private readonly pool: Orb[] = [];
  private bobPhase = 0;

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.OctahedronGeometry(XP_ORBS.orbRadius, 0);
    const material = new THREE.MeshBasicMaterial({ color: 0x51c8ff });
    this.mesh = new THREE.InstancedMesh(geometry, material, XP_ORBS.maxCount);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    for (let i = 0; i < XP_ORBS.maxCount; i++) {
      this.pool.push({ active: false, x: 0, z: 0, value: 0, flying: false, speed: 0 });
      this.mesh.setMatrixAt(i, HIDDEN);
    }
  }

  /** Drops an orb, merging into a neighbor when one is close enough. */
  spawn(x: number, z: number, value: number): void {
    const mergeSq = XP_ORBS.mergeRadius * XP_ORBS.mergeRadius;
    for (const orb of this.pool) {
      if (!orb.active || orb.flying) continue;
      const dSq = (orb.x - x) * (orb.x - x) + (orb.z - z) * (orb.z - z);
      if (dSq <= mergeSq) {
        orb.value += value;
        return;
      }
    }
    const index = this.pool.findIndex((o) => !o.active);
    if (index === -1) {
      // Pool exhausted: fold the value into the oldest orb rather than losing XP.
      const fallback = this.pool[0];
      if (fallback) fallback.value += value;
      return;
    }
    const orb = this.pool[index];
    if (!orb) return;
    orb.active = true;
    orb.x = x;
    orb.z = z;
    orb.value = value;
    orb.flying = false;
    orb.speed = 0;
  }

  /** Moves orbs; calls `onCollect` for each orb the player absorbs. */
  update(dt: number, px: number, pz: number, pickupRange: number, onCollect: (value: number) => void): void {
    this.bobPhase += dt;
    const rangeSq = pickupRange * pickupRange;
    const collectSq = XP_ORBS.collectRadius * XP_ORBS.collectRadius;

    for (let i = 0; i < this.pool.length; i++) {
      const orb = this.pool[i];
      if (!orb || !orb.active) continue;

      let dx = px - orb.x;
      let dz = pz - orb.z;
      const dSq = dx * dx + dz * dz;

      if (!orb.flying && dSq <= rangeSq) orb.flying = true;
      if (orb.flying) {
        orb.speed = Math.min(orb.speed + XP_ORBS.flySpeed * 2.5 * dt, XP_ORBS.flySpeed);
        const dist = Math.sqrt(dSq) || 1;
        dx /= dist;
        dz /= dist;
        orb.x += dx * orb.speed * dt;
        orb.z += dz * orb.speed * dt;
      }

      if (dSq <= collectSq) {
        orb.active = false;
        this.mesh.setMatrixAt(i, HIDDEN);
        onCollect(orb.value);
        continue;
      }

      // Slight scale-up for merged (fatter) orbs, plus an idle bob/spin.
      const s = Math.min(1 + Math.log2(1 + orb.value) * 0.15, 2);
      tmpMatrix.makeRotationY(this.bobPhase * 2 + i);
      tmpMatrix.scale(tmpScale.set(s, s, s));
      tmpMatrix.setPosition(orb.x, 0.6 + Math.sin(this.bobPhase * 3 + i) * 0.12, orb.z);
      this.mesh.setMatrixAt(i, tmpMatrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  reset(): void {
    for (let i = 0; i < this.pool.length; i++) {
      const orb = this.pool[i];
      if (orb) orb.active = false;
      this.mesh.setMatrixAt(i, HIDDEN);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
