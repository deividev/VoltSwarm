import * as THREE from 'three';
import { GUNNER } from './config';
import { segmentHitsObstacle, type Obstacle } from './world';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Shared projectile pool for every enemy that shoots. Slow, visible,
// dodgeable shots — the counterplay is movement. Two visual identities
// (2026-07-11, both used to be the same orange sphere): the Gunner throws a
// spinning ORANGE voxel shard, the Tesla Titan a bigger BOSS-RED spark star —
// red stays the exclusive boss-danger language (portal, auras, boss bar).

export type EnemyShotKind = 'gunner' | 'tesla';

interface Shot {
  active: boolean;
  kind: EnemyShotKind;
  x: number;
  z: number;
  vx: number;
  vz: number;
  damage: number;
  life: number;
}

const tmpMatrix = new THREE.Matrix4();
const tmpRot = new THREE.Matrix4();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

const GUNNER_SHOT_COLOR = 0xff7a20;
const TESLA_SHOT_COLOR = 0xff3355;

/** Gunner shard: a chunky voxel splinter flying point-first. */
function buildShard(): THREE.BufferGeometry {
  const core = new THREE.BoxGeometry(0.24, 0.24, 0.5);
  const tip = new THREE.BoxGeometry(0.14, 0.14, 0.22);
  tip.translate(0, 0, 0.3);
  return mergeGeometries([core, tip]);
}

/** Tesla star: two nested boxes offset 45° — a crackling energy caltrop. */
function buildSparkStar(): THREE.BufferGeometry {
  const a = new THREE.BoxGeometry(0.44, 0.44, 0.44);
  const b = new THREE.BoxGeometry(0.44, 0.44, 0.44);
  b.rotateY(Math.PI / 4);
  b.rotateX(Math.PI / 4);
  return mergeGeometries([a, b]);
}

export class EnemyProjectiles {
  private readonly meshes: Record<EnemyShotKind, THREE.InstancedMesh>;
  private readonly pool: Shot[] = [];
  private spin = 0;

  constructor(scene: THREE.Scene) {
    const build = (geometry: THREE.BufferGeometry, color: number): THREE.InstancedMesh => {
      const mesh = new THREE.InstancedMesh(
        geometry,
        new THREE.MeshBasicMaterial({ color }),
        GUNNER.maxProjectiles,
      );
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      for (let i = 0; i < GUNNER.maxProjectiles; i++) mesh.setMatrixAt(i, HIDDEN);
      scene.add(mesh);
      return mesh;
    };
    this.meshes = {
      gunner: build(buildShard(), GUNNER_SHOT_COLOR),
      tesla: build(buildSparkStar(), TESLA_SHOT_COLOR),
    };
    for (let i = 0; i < GUNNER.maxProjectiles; i++) {
      this.pool.push({
        active: false,
        kind: 'gunner',
        x: 0,
        z: 0,
        vx: 0,
        vz: 0,
        damage: 0,
        life: 0,
      });
    }
  }

  fire(
    x: number,
    z: number,
    dirX: number,
    dirZ: number,
    speed: number,
    damage: number,
    kind: EnemyShotKind = 'gunner',
  ): void {
    const index = this.pool.findIndex((s) => !s.active);
    if (index === -1) return;
    const s = this.pool[index];
    if (!s) return;
    s.active = true;
    s.kind = kind;
    s.x = x;
    s.z = z;
    s.vx = dirX * speed;
    s.vz = dirZ * speed;
    s.damage = damage;
    s.life = GUNNER.projectileLifetimeS;
  }

  /** Moves shots; calls `onHitPlayer(damage)` when one connects. `onImpact`
   *  fires at the impact point for VFX (shot-colored pop on the player —
   *  the two-halves rule's destination). */
  update(
    dt: number,
    px: number,
    pz: number,
    playerRadius: number,
    obstacles: Obstacle[],
    onHitPlayer: (damage: number) => void,
    onImpact?: (x: number, z: number, color: number) => void,
  ): void {
    this.spin += dt * 7;
    const hitSq = (playerRadius + GUNNER.projectileRadius) ** 2;
    for (let i = 0; i < this.pool.length; i++) {
      const s = this.pool[i];
      if (!s || !s.active) continue;
      const mesh = this.meshes[s.kind];
      const previousX = s.x;
      const previousZ = s.z;
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      s.life -= dt;
      if (
        obstacles.some((obstacle) =>
          segmentHitsObstacle(
            previousX,
            previousZ,
            s.x,
            s.z,
            obstacle,
            GUNNER.projectileRadius,
          ),
        )
      ) {
        onImpact?.(s.x, s.z, s.kind === 'tesla' ? TESLA_SHOT_COLOR : GUNNER_SHOT_COLOR);
        s.active = false;
        mesh.setMatrixAt(i, HIDDEN);
        continue;
      }
      const dSq = (s.x - px) * (s.x - px) + (s.z - pz) * (s.z - pz);
      if (dSq <= hitSq) {
        onImpact?.(s.x, s.z, s.kind === 'tesla' ? TESLA_SHOT_COLOR : GUNNER_SHOT_COLOR);
        onHitPlayer(s.damage);
        s.active = false;
        mesh.setMatrixAt(i, HIDDEN);
        continue;
      }
      if (s.life <= 0) {
        s.active = false;
        mesh.setMatrixAt(i, HIDDEN);
        continue;
      }
      // Shards fly point-first with a slow roll; tesla stars tumble fast.
      tmpMatrix.makeRotationY(Math.atan2(s.vx, s.vz));
      tmpRot.makeRotationZ(this.spin * (s.kind === 'tesla' ? 2 : 1) + i * 1.1);
      tmpMatrix.multiply(tmpRot);
      tmpMatrix.setPosition(s.x, 1, s.z);
      mesh.setMatrixAt(i, tmpMatrix);
      // Keep the OTHER kind's slot hidden — slots are shared across meshes.
      this.meshes[s.kind === 'tesla' ? 'gunner' : 'tesla'].setMatrixAt(i, HIDDEN);
    }
    this.meshes.gunner.instanceMatrix.needsUpdate = true;
    this.meshes.tesla.instanceMatrix.needsUpdate = true;
  }

  reset(): void {
    for (let i = 0; i < this.pool.length; i++) {
      const s = this.pool[i];
      if (s) s.active = false;
      this.meshes.gunner.setMatrixAt(i, HIDDEN);
      this.meshes.tesla.setMatrixAt(i, HIDDEN);
    }
    this.meshes.gunner.instanceMatrix.needsUpdate = true;
    this.meshes.tesla.instanceMatrix.needsUpdate = true;
  }
}
