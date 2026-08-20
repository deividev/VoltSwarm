import * as THREE from 'three';
import { VISUAL } from './config';
import { buildModelGrid, VOXEL_MODELS } from './models/registry';
import { buildRig, poseRig, RIG_PARTS, type Rig, type RigClip } from './models/rig';
import { setRenderOrder } from './player';
import { litMaterial } from './toon';

/**
 * Draws ONE boss as an animated part rig instead of an instanced body.
 *
 * The whole cast is drawn through InstancedMesh — one draw call per type, which
 * is the guardrail that buys 400+ enemies at 60 FPS — and an instance has no
 * limbs: the only motion available is the per-instance matrix. That is why
 * `docs/ANIMACION_RIG.md` allows a rig ONLY where a single instance exists on
 * screen, and the final boss is exactly that case.
 *
 * The rig is carved from the SAME VoxelGrid the instanced body uses, so there
 * is no second asset to keep in sync: swapping the model swaps both.
 */
export class BossRig {
  /** Carries world placement (position, facing, scale). `poseRig` overwrites
   *  the rig root's own transform every frame, so none of that can live there. */
  private readonly holder = new THREE.Group();
  private rig: Rig | null = null;
  private loadingKey: string | null = null;
  private clock = 0;
  /** Time since the one-shot `hit` clip started, or null when it is not playing.
   *  Separate from `clock` because that clip decays from zero rather than
   *  looping — feeding it the running clock would freeze it at its rest pose. */
  private hitClock: number | null = null;

  constructor(scene: THREE.Scene) {
    this.holder.visible = false;
    scene.add(this.holder);
  }

  get ready(): boolean {
    return this.rig !== null;
  }

  /** Builds the rig for `modelKey` once. Safe to call every frame: the model
   *  loads async and the instanced body keeps drawing until it is ready, so a
   *  slow decode degrades to today's behaviour instead of an invisible boss. */
  load(modelKey: string): void {
    if (this.rig || this.loadingKey === modelKey) return;
    const def = VOXEL_MODELS[modelKey];
    const specs = RIG_PARTS[modelKey];
    if (!def || !specs) return;
    this.loadingKey = modelKey;
    void (async () => {
      try {
        const grid = await buildModelGrid(modelKey);
        const rig = buildRig(grid, def.voxelSize, litMaterial({ vertexColors: true }), specs);
        // Per MESH, because renderOrder is not inherited from a Group — the
        // rule that already bit the ground markers. Without it the boss's own
        // telegraphs, which draw at renderOrder 1 with depth testing off, paint
        // straight over its legs.
        if (VISUAL.groundMarkersOnTop) setRenderOrder(rig.root, VISUAL.renderOrders.character);
        this.holder.add(rig.root);
        this.rig = rig;
      } catch (error) {
        console.warn(`Boss rig '${modelKey}' unavailable, keeping the instanced body:`, error);
        this.loadingKey = null;
      }
    })();
  }

  /** Starts the one-shot recoil clip (phase changes and staggers — the rare
   *  events the clip is reserved for; routine damage stays tint-only, because
   *  a boss takes more hits per second than a clip can finish). */
  playHit(): void {
    this.hitClock = 0;
  }

  /** Poses and places the rig. Returns true when it drew, so the caller knows
   *  whether to hide the instanced body this frame. */
  update(
    dt: number,
    x: number,
    z: number,
    heading: number,
    scale: number,
    moving: boolean,
  ): boolean {
    if (!this.rig) return false;
    this.clock += dt;
    let clip: RigClip = moving ? 'walk' : 'idle';
    let time = this.clock;
    if (this.hitClock !== null) {
      this.hitClock += dt;
      // 0.45s is the clip's own decay window (see poseRig).
      if (this.hitClock >= 0.45) this.hitClock = null;
      else {
        clip = 'hit';
        time = this.hitClock;
      }
    }
    poseRig(this.rig, time, clip);
    this.holder.position.set(x, 0, z);
    this.holder.rotation.y = heading;
    this.holder.scale.setScalar(scale);
    this.holder.visible = true;
    return true;
  }

  hide(): void {
    this.holder.visible = false;
    this.hitClock = null;
  }
}
