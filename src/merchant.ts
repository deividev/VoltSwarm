import * as THREE from 'three';
import { MERCHANT } from './config';
import { litMaterial } from './toon';
import { buildGridGeometry } from './models/voxel-builder';
import { buildModelGrid, VOXEL_MODELS } from './models/registry';
import type { ModId } from './mods';

// The scrapper merchant: a hunched voxel vendor (front-facing, Camino A
// 2026-07-09) that visits periodically at a totem-style random spot, sticks
// around for a countdown, and sells mods for in-run gold. Game.ts owns the
// schedule and shop logic; this class owns presence and visuals. Primitive
// placeholder shows immediately; the voxel model swaps in async over it.

export class MerchantSystem {
  readonly group: THREE.Group;
  active = false;
  x = 0;
  z = 0;
  /** Run-clock second of the next arrival. */
  nextVisitS = MERCHANT.firstVisitS;
  /** Run-clock second at which he packs up and leaves. */
  leaveAtS = 0;
  /** Mods on sale this visit; purchases splice entries out. */
  stock: ModId[] = [];
  private sway = 0;

  /** Body/head/crate primitives are swapped for the voxel model; the beam
   *  (a warm shop marker readable from across the map) is kept and lives
   *  outside `body` so it survives the swap. */
  private readonly body: THREE.Group;

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    this.body = new THREE.Group();

    // Immediate placeholder: hunched body + crate, replaced by the voxel model.
    const bodyBox = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 1.4, 0.9),
      litMaterial({ color: 0xb87d2e }),
    );
    bodyBox.position.y = 0.7;
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 1.1, 0.8),
      litMaterial({ color: 0x6f5a34 }),
    );
    crate.position.set(0, 1.5, -0.35);
    this.body.add(bodyBox, crate);

    // Warm amber shop beam — the distance marker, same language as chests.
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.34, 9, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffc44d,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    beam.position.y = 4.5;

    this.group.add(this.body, beam);
    this.group.visible = false;
    scene.add(this.group);

    // Voxel model faces +Z toward the fixed camera — no rotation needed.
    void this.upgradeVoxelModel();
  }

  private async upgradeVoxelModel(): Promise<void> {
    const def = VOXEL_MODELS['scrapper'];
    if (!def) return;
    try {
      const geometry = buildGridGeometry(await buildModelGrid('scrapper'), def.voxelSize);
      const voxelMesh = new THREE.Mesh(geometry, litMaterial({ vertexColors: true }));
      for (const child of [...this.body.children]) {
        this.body.remove(child);
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) child.material.dispose();
        }
      }
      this.body.add(voxelMesh);
    } catch (error) {
      console.warn('Scrapper voxel model unavailable, keeping placeholder:', error);
    }
  }

  arrive(x: number, z: number, stock: ModId[], elapsedS: number): void {
    this.active = true;
    this.x = x;
    this.z = z;
    this.stock = stock;
    this.leaveAtS = elapsedS + MERCHANT.staysS;
    this.group.position.set(x, 0, z);
    this.group.visible = true;
  }

  /** Packs up and schedules the next visit (whistle halves the interval). */
  depart(elapsedS: number, intervalScale: number): void {
    this.active = false;
    this.group.visible = false;
    this.stock = [];
    this.nextVisitS = elapsedS + MERCHANT.intervalS * intervalScale;
  }

  remainingS(elapsedS: number): number {
    return Math.max(0, this.leaveAtS - elapsedS);
  }

  /** Idle sway — the non-hostile body language (body only; beam stays put). */
  update(dt: number): void {
    if (!this.active) return;
    this.sway += dt;
    this.body.rotation.y = Math.sin(this.sway * 0.8) * 0.15;
    this.body.rotation.z = Math.sin(this.sway * 1.3) * 0.03;
  }

  reset(): void {
    this.active = false;
    this.group.visible = false;
    this.stock = [];
    this.nextVisitS = MERCHANT.firstVisitS;
  }
}
