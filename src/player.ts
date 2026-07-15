import * as THREE from 'three';
import { ARENA_HALF_SIZE, PLAYER, VISUAL } from './config';
import type { PlayerInput } from './input';
import type { Obstacle } from './world';
import { buildGridGeometry } from './models/voxel-builder';
import { buildModelGrid, VOXEL_MODELS } from './models/registry';
import { litMaterial } from './toon';

export class Player {
  readonly mesh: THREE.Group;
  readonly position = new THREE.Vector3(0, 0, 0);

  maxHp = PLAYER.maxHp;
  hp = PLAYER.maxHp;
  moveSpeed = PLAYER.moveSpeed;
  private invulnTimer = 0;
  /** Orbiting cyan plates: one per active shield charge. They live in their
   *  own group (not under the player mesh) so the player's facing rotation
   *  never snaps them around — the ring only follows position and spins. */
  private readonly shieldGroup = new THREE.Group();
  private readonly shieldPlates: THREE.Mesh[] = [];
  private shieldSpin = 0;
  private walkPhase = 0;
  private shadow: THREE.Mesh | null = null;

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.6, 1.4, 8),
      new THREE.MeshLambertMaterial({ color: 0xe8e3d5 }),
    );
    body.position.y = 0.7;
    this.mesh.add(body);

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.5, 0.7),
      new THREE.MeshLambertMaterial({ color: 0xf2b632 }),
    );
    head.position.y = 1.65;
    this.mesh.add(head);

    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.16, 0.2),
      new THREE.MeshLambertMaterial({ color: 0x1c2a38 }),
    );
    visor.position.set(0, 1.68, -0.3);
    this.mesh.add(visor);

    // Shield plates orbit the player so the charge count is always readable
    // on the character itself, not just in the HUD.
    const plateGeometry = new THREE.BoxGeometry(0.5, 0.7, 0.08);
    const plateMaterial = new THREE.MeshBasicMaterial({
      color: 0x7ee0ff,
      transparent: true,
      opacity: 0.75,
    });
    for (let i = 0; i < PLAYER.maxShieldCharges; i++) {
      const plate = new THREE.Mesh(plateGeometry, plateMaterial);
      plate.visible = false;
      this.shieldGroup.add(plate);
      this.shieldPlates.push(plate);
    }
    scene.add(this.shieldGroup);

    // Blob shadow: anchors the player to the ground; it follows position
    // (not the mesh) so the walk hop doesn't bounce the shadow.
    if (VISUAL.blobShadow.enabled) {
      const shadowGeometry = new THREE.CircleGeometry(
        PLAYER.radius * VISUAL.blobShadow.radiusScale,
        20,
      );
      shadowGeometry.rotateX(-Math.PI / 2);
      this.shadow = new THREE.Mesh(
        shadowGeometry,
        new THREE.MeshBasicMaterial({
          color: 0x000000,
          transparent: true,
          opacity: VISUAL.blobShadow.opacity,
          depthWrite: false,
        }),
      );
      this.shadow.position.y = VISUAL.blobShadow.y;
      scene.add(this.shadow);
    }

    scene.add(this.mesh);

    // The image-derived voxel model loads async and swaps in over the
    // primitives; on failure the primitives simply stay.
    void this.upgradeVoxelModel();
  }

  private async upgradeVoxelModel(): Promise<void> {
    const def = VOXEL_MODELS['player'];
    if (!def) return;
    try {
      const geometry = buildGridGeometry(await buildModelGrid('player'), def.voxelSize);
      // Voxel models face +Z; the player rig faces -Z (see visor placement).
      geometry.rotateY(Math.PI);
      const voxelMesh = new THREE.Mesh(geometry, litMaterial({ vertexColors: true }));
      for (const child of [...this.mesh.children]) {
        this.mesh.remove(child);
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) child.material.dispose();
        }
      }
      this.mesh.add(voxelMesh);
    } catch (error) {
      console.warn('Player voxel model unavailable, keeping primitive rig:', error);
    }
  }

  /** Shows `charges` orbiting shield plates. */
  setShieldCharges(charges: number): void {
    for (let i = 0; i < this.shieldPlates.length; i++) {
      const plate = this.shieldPlates[i];
      if (!plate) continue;
      plate.visible = i < charges;
      const a = this.shieldSpin + (i / this.shieldPlates.length) * Math.PI * 2;
      plate.position.set(Math.cos(a) * 1.15, 1.0, Math.sin(a) * 1.15);
      plate.rotation.y = -a + Math.PI / 2;
    }
  }

  update(dt: number, input: PlayerInput, speedMultiplier = 1, obstacles: Obstacle[] = []): void {
    const axis = input.moveAxis();
    const speed = this.moveSpeed * speedMultiplier;
    this.position.x += axis.x * speed * dt;
    this.position.z += axis.y * speed * dt;
    this.position.x = THREE.MathUtils.clamp(this.position.x, -ARENA_HALF_SIZE, ARENA_HALF_SIZE);
    this.position.z = THREE.MathUtils.clamp(this.position.z, -ARENA_HALF_SIZE, ARENA_HALF_SIZE);

    // Circular push-out against large props: sliding along them, no snagging.
    for (const o of obstacles) {
      const minDist = o.radius + PLAYER.radius;
      const dx = this.position.x - o.x;
      const dz = this.position.z - o.z;
      const dSq = dx * dx + dz * dz;
      if (dSq >= minDist * minDist || dSq < 0.0001) continue;
      const dist = Math.sqrt(dSq);
      this.position.x = o.x + (dx / dist) * minDist;
      this.position.z = o.z + (dz / dist) * minDist;
    }
    this.mesh.position.copy(this.position);

    const moving = axis.x !== 0 || axis.y !== 0;
    if (moving) {
      this.mesh.rotation.y = Math.atan2(axis.x, axis.y) + Math.PI;
    }

    // Walk cycle: a little voxel-toy hop plus a side-to-side rock while
    // moving; settles back to rest when standing still.
    if (moving) {
      this.walkPhase += dt * Math.PI * 2 * PLAYER.walkBobHz * speedMultiplier;
      this.mesh.position.y = Math.abs(Math.sin(this.walkPhase)) * PLAYER.walkBobAmplitude;
      this.mesh.rotation.z = Math.sin(this.walkPhase) * PLAYER.walkRockAmplitude;
    } else {
      this.walkPhase = 0;
      this.mesh.position.y *= Math.max(0, 1 - dt * 12);
      this.mesh.rotation.z *= Math.max(0, 1 - dt * 12);
    }

    if (this.invulnTimer > 0) this.invulnTimer -= dt;
    this.mesh.visible = this.invulnTimer <= 0 || Math.floor(this.invulnTimer * 12) % 2 === 0;
    this.shieldSpin += dt * 1.6;
    this.shieldGroup.position.copy(this.position);
    if (this.shadow) {
      this.shadow.position.set(this.position.x, this.shadow.position.y, this.position.z);
    }
  }

  get invulnerable(): boolean {
    return this.invulnTimer > 0;
  }

  /** Fresh-run state: clears leftover invulnerability from the previous run. */
  reset(): void {
    this.maxHp = PLAYER.maxHp;
    this.hp = PLAYER.maxHp;
    this.moveSpeed = PLAYER.moveSpeed;
    this.position.set(0, 0, 0);
    this.invulnTimer = 0;
    this.mesh.visible = true;
  }

  /** Applies contact damage, respecting the invulnerability window. Returns true if damage landed. */
  takeHit(damage: number): boolean {
    if (this.invulnTimer > 0 || this.hp <= 0) return false;
    this.hp = Math.max(0, this.hp - damage);
    this.invulnTimer = PLAYER.invulnAfterHitS;
    return true;
  }

  get isDead(): boolean {
    return this.hp <= 0;
  }
}
