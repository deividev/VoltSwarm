import * as THREE from 'three';
import { ARENA_HALF_SIZE, BARRIER_CELL, PLAYER, VISUAL } from './config';
import type { PlayerInput } from './input';
import type { Obstacle } from './world';
import { buildGridGeometry } from './models/voxel-builder';
import { buildModelGrid, VOXEL_MODELS } from './models/registry';
import { litMaterial } from './toon';

/** Three.js sorts render items PER MESH and does not inherit renderOrder from a
 *  parent, so setting it on a Group silently does nothing. Every descendant has
 *  to carry it. */
export function setRenderOrder(root: THREE.Object3D, order: number): void {
  root.traverse((child) => {
    child.renderOrder = order;
  });
}

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
  private markerGroup: THREE.Group | null = null;
  private markerRing: THREE.Mesh | null = null;
  private markerGlow: THREE.Mesh | null = null;
  private readonly markerTicks: THREE.Mesh[] = [];
  private markerPulse = 0;

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
    for (let i = 0; i < BARRIER_CELL.capacityCap; i++) {
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

    // Player readability marker: a subtle unsegmented cyan/white ground signal
    // that survives late-game chaos without stealing elite/boss ring language.
    if (VISUAL.playerMarker.enabled) {
      this.markerGroup = new THREE.Group();
      this.markerGroup.position.y = VISUAL.playerMarker.y;
      // Ordered between scenery and characters (see VISUAL.groundMarkersOnTop):
      // a crate cannot chop the marker, and the marker cannot cover the body
      // standing on it.
      // Applied per mesh below as each layer is added (renderOrder is not inherited).
      scene.add(this.markerGroup);

      const glowGeometry = new THREE.CircleGeometry(VISUAL.playerMarker.glowRadius, 32);
      glowGeometry.rotateX(-Math.PI / 2);
      // A plain circle has a HARD rim, so the "glow" read as a flat grey plate
      // stamped on the floor — most obvious at spawn, where the player stands
      // still. Vertex colours fade it to black towards the edge; under additive
      // blending black contributes nothing, which is a true radial falloff
      // without a texture or a second material.
      {
        const position = glowGeometry.getAttribute('position');
        const colors = new Float32Array(position.count * 3);
        const radius = VISUAL.playerMarker.glowRadius;
        for (let i = 0; i < position.count; i++) {
          const dist = Math.hypot(position.getX(i), position.getZ(i));
          // Squared falloff: linear still leaves a visible ring at the rim.
          // Opacity is baked in: material.opacity is ignored in the opaque
          // queue, which is where these markers now live.
          const strength = Math.max(0, 1 - dist / radius) ** 2 * VISUAL.playerMarker.glowOpacity;
          colors[i * 3] = strength;
          colors[i * 3 + 1] = strength;
          colors[i * 3 + 2] = strength;
        }
        glowGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      }
      this.markerGlow = new THREE.Mesh(
        glowGeometry,
        new THREE.MeshBasicMaterial({
          color: VISUAL.playerMarker.glowColor,
          vertexColors: true,
          transparent: !VISUAL.groundMarkersOnTop,
          opacity: VISUAL.playerMarker.glowOpacity,
          depthWrite: false,
          depthTest: !VISUAL.groundMarkersOnTop,
          blending: THREE.AdditiveBlending,
        }),
      );
      this.markerGlow.position.y = 0;
      this.markerGroup.add(this.markerGlow);

      const ringGeometry = new THREE.RingGeometry(
        VISUAL.playerMarker.innerRadius,
        VISUAL.playerMarker.outerRadius,
        48,
      );
      ringGeometry.rotateX(-Math.PI / 2);
      this.markerRing = new THREE.Mesh(
        ringGeometry,
        new THREE.MeshBasicMaterial({
          // Additive in the opaque queue: material.opacity is ignored there, so
          // it has to be baked into the colour.
          color: new THREE.Color(VISUAL.playerMarker.ringColor).multiplyScalar(
            VISUAL.groundMarkersOnTop ? VISUAL.playerMarker.ringOpacity : 1,
          ),
          transparent: !VISUAL.groundMarkersOnTop,
          opacity: VISUAL.playerMarker.ringOpacity,
          depthWrite: false,
          depthTest: !VISUAL.groundMarkersOnTop,
          blending: THREE.AdditiveBlending,
        }),
      );
      this.markerRing.position.y = 0.01;
      this.markerGroup.add(this.markerRing);

      const tickGeometry = new THREE.BoxGeometry(
        VISUAL.playerMarker.tickWidth,
        0.012,
        VISUAL.playerMarker.tickLength,
      );
      const tickMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(VISUAL.playerMarker.tickColor).multiplyScalar(
          VISUAL.groundMarkersOnTop ? VISUAL.playerMarker.tickOpacity : 1,
        ),
        transparent: !VISUAL.groundMarkersOnTop,
        opacity: VISUAL.playerMarker.tickOpacity,
        depthWrite: false,
        depthTest: !VISUAL.groundMarkersOnTop,
        blending: THREE.AdditiveBlending,
      });
      for (let i = 0; i < 4; i++) {
        const tick = new THREE.Mesh(tickGeometry, tickMaterial);
        const a = (i / 4) * Math.PI * 2;
        tick.position.set(
          Math.sin(a) * VISUAL.playerMarker.tickDistance,
          0.025,
          Math.cos(a) * VISUAL.playerMarker.tickDistance,
        );
        tick.rotation.y = a;
        this.markerGroup.add(tick);
        this.markerTicks.push(tick);
      }

      // Every marker mesh, not the group: renderOrder is not inherited.
      if (VISUAL.groundMarkersOnTop) {
        setRenderOrder(this.markerGroup, VISUAL.renderOrders.groundMarker);
      }
    }

    if (VISUAL.groundMarkersOnTop) setRenderOrder(this.mesh, VISUAL.renderOrders.character);
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
      // The swapped-in model must keep the character order too.
      if (VISUAL.groundMarkersOnTop) setRenderOrder(this.mesh, VISUAL.renderOrders.character);
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
    const arenaLimit = ARENA_HALF_SIZE - PLAYER.radius;
    this.position.x = THREE.MathUtils.clamp(this.position.x, -arenaLimit, arenaLimit);
    this.position.z = THREE.MathUtils.clamp(this.position.z, -arenaLimit, arenaLimit);

    // Circular push-out against large props: sliding along them, no snagging.
    for (const o of obstacles) {
      const minDist = o.radius + PLAYER.radius;
      let dx = this.position.x - o.x;
      let dz = this.position.z - o.z;
      const dSq = dx * dx + dz * dz;
      if (dSq >= minDist * minDist) continue;
      if (dSq < 0.0001) {
        dx = 1;
        dz = 0;
      } else {
        const inverseDistance = 1 / Math.sqrt(dSq);
        dx *= inverseDistance;
        dz *= inverseDistance;
      }
      this.position.x = o.x + dx * minDist;
      this.position.z = o.z + dz * minDist;
    }
    this.position.x = THREE.MathUtils.clamp(this.position.x, -arenaLimit, arenaLimit);
    this.position.z = THREE.MathUtils.clamp(this.position.z, -arenaLimit, arenaLimit);
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
    if (this.markerGroup) {
      this.markerPulse += dt * Math.PI * 2 * VISUAL.playerMarker.pulseHz;
      const pulse = 1 + Math.sin(this.markerPulse) * VISUAL.playerMarker.pulseScale;
      this.markerGroup.position.set(this.position.x, VISUAL.playerMarker.y, this.position.z);
      this.markerGroup.rotation.y += dt * Math.PI * 2 * VISUAL.playerMarker.rotateHz;
      if (this.markerGlow) {
        this.markerGlow.scale.setScalar(pulse);
      }
      if (this.markerRing) {
        this.markerRing.scale.setScalar(1 + (pulse - 1) * 0.55);
      }
      for (const tick of this.markerTicks) tick.scale.setScalar(1 + (pulse - 1) * 0.35);
    }
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
    this.setShieldCharges(0);
    this.mesh.visible = true;
    this.markerPulse = 0;
    if (this.markerGroup) {
      this.markerGroup.position.set(0, VISUAL.playerMarker.y, 0);
      this.markerGroup.rotation.set(0, 0, 0);
    }
    if (this.markerGlow) {
      this.markerGlow.scale.setScalar(1);
    }
    if (this.markerRing) {
      this.markerRing.scale.setScalar(1);
    }
    for (const tick of this.markerTicks) tick.scale.setScalar(1);
  }

  /** Map boundary: move to the new arena's safe centre and clear hit timing,
   * while preserving HP/max HP granted by the current build. */
  enterMap(): void {
    this.position.set(0, 0, 0);
    this.invulnTimer = 0;
    this.mesh.visible = true;
    if (this.markerGroup) this.markerGroup.position.set(0, VISUAL.playerMarker.y, 0);
    if (this.shadow) this.shadow.position.set(0, this.shadow.position.y, 0);
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
