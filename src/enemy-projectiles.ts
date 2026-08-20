import * as THREE from 'three';
import { GUNNER } from './config';
import { segmentHitsObstacle, type Obstacle } from './world';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Shared projectile pool for every enemy that shoots. Slow, visible,
// dodgeable shots — the counterplay is movement. Two visual identities
// (2026-07-11, both used to be the same orange sphere): the Gunner throws a
// spinning ORANGE voxel shard, the Tesla Titan a bigger BOSS-RED spark star —
// red stays the exclusive boss-danger language (portal, auras, boss bar).

export type EnemyShotKind = 'gunner' | 'tesla' | 'marshal';

/** Every kind, so the per-frame slot bookkeeping below cannot forget one. */
const SHOT_KINDS: readonly EnemyShotKind[] = ['gunner', 'tesla', 'marshal'];

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
/** The Marshal's volley. A harder, more saturated red than the Tesla's, because
 *  these shots routinely fly THROUGH the sweep's amber wedge and its blast, and
 *  a pinkish crimson over amber turns into one warm smear. */
const MARSHAL_SHOT_COLOR = 0xff1024;
/** The core of that same shot. MEASURED: the volley sat at hue 355 and the
 *  hazard zones it flies over at hue 350 — five degrees apart, which is why
 *  making it bigger and more saturated did not help. Nearly white is the one
 *  value that separates from every red on this floor without stealing another
 *  system's hue (violet is the Roller's, cyan the drop bays'). */
const MARSHAL_CORE_COLOR = 0xfff2ee;

function impactColor(kind: EnemyShotKind): number {
  if (kind === 'marshal') return MARSHAL_SHOT_COLOR;
  return kind === 'tesla' ? TESLA_SHOT_COLOR : GUNNER_SHOT_COLOR;
}

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

/** Paints a whole geometry one colour, so several can be merged into a single
 *  vertex-coloured mesh. */
function paintGeometry(geometry: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  const tint = new THREE.Color(hex);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** The Marshal's volley: a WHITE-HOT cube pierced by red spikes.
 *
 *  Measured 2026-08-20, after the user reported still losing these shots among
 *  the other red effects: the previous version painted the whole caltrop red
 *  and put a white 0.3 cube at its centre — INSIDE a solid 0.75 cube, so the
 *  one feature meant to separate it could not be seen from any angle. An
 *  enclosed core is not a core, it is deleted geometry.
 *
 *  So the two halves of the star are painted separately instead: the
 *  axis-aligned cube is the hot core and it IS the surface you see, and the
 *  rotated one only pokes its corners through as red spikes. White survives
 *  every background on this floor — a red hazard zone, the amber wedge, its
 *  blast — which flat red does not, and the shot keeps the boss's colour in the
 *  spikes rather than in a silhouette that dissolves into whatever it crosses. */
function buildMarshalStar(): THREE.BufferGeometry {
  const size = 0.44 * 1.7;
  const core = paintGeometry(new THREE.BoxGeometry(size, size, size), MARSHAL_CORE_COLOR);
  const spikes = new THREE.BoxGeometry(size, size, size);
  spikes.rotateY(Math.PI / 4);
  spikes.rotateX(Math.PI / 4);
  return mergeGeometries([core, paintGeometry(spikes, MARSHAL_SHOT_COLOR)]) ?? core;
}

export class EnemyProjectiles {
  private readonly meshes: Record<EnemyShotKind, THREE.InstancedMesh>;
  private readonly pool: Shot[] = [];
  private spin = 0;

  constructor(scene: THREE.Scene) {
    const build = (
      geometry: THREE.BufferGeometry,
      color: number,
      vertexColors = false,
    ): THREE.InstancedMesh => {
      const mesh = new THREE.InstancedMesh(
        geometry,
        vertexColors
          ? new THREE.MeshBasicMaterial({ vertexColors: true })
          : new THREE.MeshBasicMaterial({ color }),
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
      marshal: build(buildMarshalStar(), MARSHAL_SHOT_COLOR, true),
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

  /** Moves shots; calls `onHitPlayer(damage, kind)` when one connects. The kind
   *  travels with the hit because the Marshal's volley is a BOSS attack and is
   *  treated as one on arrival (it pierces the i-frame, like every other thing
   *  the boss telegraphs), while a Gunner's shard is ordinary swarm pressure
   *  and stays capped by it. `onImpact`
   *  fires at the impact point for VFX (shot-colored pop on the player —
   *  the two-halves rule's destination). */
  update(
    dt: number,
    px: number,
    pz: number,
    playerRadius: number,
    obstacles: Obstacle[],
    onHitPlayer: (damage: number, kind: EnemyShotKind) => void,
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
        onImpact?.(s.x, s.z, impactColor(s.kind));
        s.active = false;
        mesh.setMatrixAt(i, HIDDEN);
        continue;
      }
      const dSq = (s.x - px) * (s.x - px) + (s.z - pz) * (s.z - pz);
      if (dSq <= hitSq) {
        onImpact?.(s.x, s.z, impactColor(s.kind));
        onHitPlayer(s.damage, s.kind);
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
      tmpRot.makeRotationZ(this.spin * (s.kind === 'gunner' ? 1 : 2) + i * 1.1);
      tmpMatrix.multiply(tmpRot);
      tmpMatrix.setPosition(s.x, 1, s.z);
      mesh.setMatrixAt(i, tmpMatrix);
      // Keep every OTHER kind's slot hidden — slots are shared across meshes.
      // A loop over SHOT_KINDS rather than a hand-picked pair: the pair stopped
      // covering everything the moment a third kind existed, and the symptom
      // would have been a ghost shot nobody could trace.
      for (const kind of SHOT_KINDS) {
        if (kind !== s.kind) this.meshes[kind].setMatrixAt(i, HIDDEN);
      }
    }
    for (const kind of SHOT_KINDS) this.meshes[kind].instanceMatrix.needsUpdate = true;
  }

  reset(): void {
    for (let i = 0; i < this.pool.length; i++) {
      const s = this.pool[i];
      if (s) s.active = false;
      for (const kind of SHOT_KINDS) this.meshes[kind].setMatrixAt(i, HIDDEN);
    }
    for (const kind of SHOT_KINDS) this.meshes[kind].instanceMatrix.needsUpdate = true;
  }
}
