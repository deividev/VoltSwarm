import * as THREE from 'three';
import { DEFEAT_TRANSITION, VISUAL } from './config';

/**
 * Voxel burst particles: on every kill, a handful of small cubes in the
 * victim's color pop out and fall through the floor. One InstancedMesh for
 * the whole pool (a single draw call); when full, the oldest particle is
 * recycled — with hundreds of kills a minute nobody misses it.
 */

interface Particle {
  life: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spinAxis: number;
  spin: number;
}

const tmpMatrix = new THREE.Matrix4();
const tmpRot = new THREE.Matrix4();
const tmpScale = new THREE.Vector3();
const tmpColor = new THREE.Color();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

export class VoxelBurst {
  private readonly mesh: THREE.InstancedMesh | null = null;
  private readonly pool: Particle[] = [];
  private cursor = 0;

  constructor(scene: THREE.Scene) {
    if (!VISUAL.deathBurst.enabled) return;
    const cfg = VISUAL.deathBurst;
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(cfg.cubeSize, cfg.cubeSize, cfg.cubeSize),
      new THREE.MeshBasicMaterial(),
      cfg.capacity,
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < cfg.capacity; i++) {
      this.mesh.setMatrixAt(i, HIDDEN);
      this.mesh.setColorAt(i, tmpColor.setRGB(1, 1, 1));
      this.pool.push({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spinAxis: 0, spin: 0 });
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    scene.add(this.mesh);
  }

  /** Pops `count` cubes of `color` at (x, z). */
  /** @param y Height the cubes are born at. Defaults to ground level, which is
   *  right for a body coming apart; an effect that leaves a BODY — the
   *  Marshal's chest discharge, its back-mounted launchers — has to start where
   *  that body is, or the two halves of the effect never connect. */
  spawn(x: number, z: number, color: number, count: number, y = 0): void {
    if (!this.mesh) return;
    const cfg = VISUAL.deathBurst;
    for (let i = 0; i < count; i++) {
      const p = this.pool[this.cursor];
      if (!p) continue;
      const angle = Math.random() * Math.PI * 2;
      const speed = cfg.horizontalSpeed * (0.4 + Math.random() * 0.6);
      p.life = cfg.lifeS * (0.7 + Math.random() * 0.3);
      p.x = x;
      p.y = y + 0.4 + Math.random() * 0.5;
      p.z = z;
      p.vx = Math.cos(angle) * speed;
      p.vy = cfg.upwardSpeed * (0.5 + Math.random() * 0.5);
      p.vz = Math.sin(angle) * speed;
      p.spinAxis = Math.random() * Math.PI;
      p.spin = (Math.random() - 0.5) * 14;
      this.mesh.setColorAt(this.cursor, tmpColor.setHex(color));
      this.cursor = (this.cursor + 1) % this.pool.length;
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    if (!this.mesh) return;
    const cfg = VISUAL.deathBurst;
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p || p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0 || p.y < -0.3) {
        p.life = 0;
        this.mesh.setMatrixAt(i, HIDDEN);
        continue;
      }
      p.vy -= cfg.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      // Shrink out over the last stretch of life.
      const s = Math.min(1, p.life / (cfg.lifeS * 0.4));
      tmpMatrix.makeRotationY(p.spinAxis + p.spin * p.life);
      tmpRot.makeRotationX(p.spin * p.life);
      tmpMatrix.multiply(tmpRot);
      tmpMatrix.scale(tmpScale.set(s, s, s));
      tmpMatrix.setPosition(p.x, p.y, p.z);
      this.mesh.setMatrixAt(i, tmpMatrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  reset(): void {
    if (!this.mesh) return;
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (p) p.life = 0;
      this.mesh.setMatrixAt(i, HIDDEN);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/**
 * Presentation-owned voxel sparks for the defeat beat.
 *
 * A SEPARATE pool from VoxelBurst on purpose: during the defeat sequence the
 * battle is frozen, and ticking the shared pool would keep every pre-existing
 * combat particle drifting while enemies stand still — "frozen battle, active
 * defeat beat" is the whole visual contract. Same single-InstancedMesh discipline
 * as the burst pool, with a much smaller capacity because only one chassis ever
 * overloads at a time.
 */
export class DefeatSparks {
  private readonly mesh: THREE.InstancedMesh;
  private readonly pool: Particle[] = [];
  private cursor = 0;

  constructor(scene: THREE.Scene) {
    const cfg = DEFEAT_TRANSITION.overload;
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(cfg.sparkCubeSize, cfg.sparkCubeSize, cfg.sparkCubeSize),
      new THREE.MeshBasicMaterial(),
      cfg.sparkCapacity,
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < cfg.sparkCapacity; i++) {
      this.mesh.setMatrixAt(i, HIDDEN);
      this.mesh.setColorAt(i, tmpColor.setRGB(1, 1, 1));
      this.pool.push({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spinAxis: 0, spin: 0 });
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    scene.add(this.mesh);
  }

  /** Erupts `count` cubes out of the chassis VOLUME (not a point): origins are
   *  scattered through the model's cached bounding box, so the overload reads as
   *  the whole body venting rather than a puff at its feet. */
  emit(
    x: number,
    z: number,
    halfWidth: number,
    height: number,
    color: number,
    count: number,
  ): void {
    const cfg = DEFEAT_TRANSITION.overload;
    for (let i = 0; i < count; i++) {
      const p = this.pool[this.cursor];
      if (!p) continue;
      const angle = Math.random() * Math.PI * 2;
      const radius = halfWidth * Math.sqrt(Math.random());
      const speed = cfg.sparkHorizontalSpeed * (0.35 + Math.random() * 0.65);
      p.life = cfg.sparkLifeS * (0.7 + Math.random() * 0.3);
      p.x = x + Math.cos(angle) * radius;
      p.y = height * (0.15 + Math.random() * 0.85);
      p.z = z + Math.sin(angle) * radius;
      p.vx = Math.cos(angle) * speed;
      // Biased UP: an overload vents, it does not merely scatter.
      p.vy = cfg.sparkUpwardSpeed * (0.55 + Math.random() * 0.45);
      p.vz = Math.sin(angle) * speed;
      p.spinAxis = Math.random() * Math.PI;
      p.spin = (Math.random() - 0.5) * 16;
      this.mesh.setColorAt(this.cursor, tmpColor.setHex(color));
      this.cursor = (this.cursor + 1) % this.pool.length;
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Driven by the defeat presentation tick, never by the gameplay update. */
  update(dt: number): void {
    const cfg = DEFEAT_TRANSITION.overload;
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p || p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0 || p.y < -0.3) {
        p.life = 0;
        this.mesh.setMatrixAt(i, HIDDEN);
        continue;
      }
      p.vy -= cfg.sparkGravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const s = Math.min(1, p.life / (cfg.sparkLifeS * 0.4));
      tmpMatrix.makeRotationY(p.spinAxis + p.spin * p.life);
      tmpRot.makeRotationX(p.spin * p.life);
      tmpMatrix.multiply(tmpRot);
      tmpMatrix.scale(tmpScale.set(s, s, s));
      tmpMatrix.setPosition(p.x, p.y, p.z);
      this.mesh.setMatrixAt(i, tmpMatrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  reset(): void {
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (p) p.life = 0;
      this.mesh.setMatrixAt(i, HIDDEN);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
