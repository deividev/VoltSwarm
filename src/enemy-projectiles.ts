import * as THREE from 'three';
import { GUNNER } from './config';

// Shared projectile pool for every enemy that shoots (gunners, Tesla Titan).
// Slow, visible, dodgeable shots — the counterplay is movement.

interface Shot {
  active: boolean;
  x: number;
  z: number;
  vx: number;
  vz: number;
  damage: number;
  life: number;
}

const tmpMatrix = new THREE.Matrix4();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

export class EnemyProjectiles {
  private readonly mesh: THREE.InstancedMesh;
  private readonly pool: Shot[] = [];

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.SphereGeometry(GUNNER.projectileRadius, 6, 4);
    const material = new THREE.MeshBasicMaterial({ color: 0xff5533 });
    this.mesh = new THREE.InstancedMesh(geometry, material, GUNNER.maxProjectiles);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    for (let i = 0; i < GUNNER.maxProjectiles; i++) {
      this.pool.push({ active: false, x: 0, z: 0, vx: 0, vz: 0, damage: 0, life: 0 });
      this.mesh.setMatrixAt(i, HIDDEN);
    }
  }

  fire(x: number, z: number, dirX: number, dirZ: number, speed: number, damage: number): void {
    const index = this.pool.findIndex((s) => !s.active);
    if (index === -1) return;
    const s = this.pool[index];
    if (!s) return;
    s.active = true;
    s.x = x;
    s.z = z;
    s.vx = dirX * speed;
    s.vz = dirZ * speed;
    s.damage = damage;
    s.life = GUNNER.projectileLifetimeS;
  }

  /** Moves shots; calls `onHitPlayer(damage)` when one connects. */
  update(
    dt: number,
    px: number,
    pz: number,
    playerRadius: number,
    onHitPlayer: (damage: number) => void,
  ): void {
    const hitSq = (playerRadius + GUNNER.projectileRadius) ** 2;
    for (let i = 0; i < this.pool.length; i++) {
      const s = this.pool[i];
      if (!s || !s.active) continue;
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      s.life -= dt;
      const dSq = (s.x - px) * (s.x - px) + (s.z - pz) * (s.z - pz);
      if (dSq <= hitSq) {
        onHitPlayer(s.damage);
        s.active = false;
        this.mesh.setMatrixAt(i, HIDDEN);
        continue;
      }
      if (s.life <= 0) {
        s.active = false;
        this.mesh.setMatrixAt(i, HIDDEN);
        continue;
      }
      tmpMatrix.makeTranslation(s.x, 1, s.z);
      this.mesh.setMatrixAt(i, tmpMatrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  reset(): void {
    for (let i = 0; i < this.pool.length; i++) {
      const s = this.pool[i];
      if (s) s.active = false;
      this.mesh.setMatrixAt(i, HIDDEN);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
