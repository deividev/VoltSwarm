import * as THREE from 'three';
import { CHEST, PICKUPS, RECORDING } from './config';
import { litMaterial } from './toon';
import { rollRarity, type Rarity } from './upgrades';
import { resolveChestTier, TIER_COLORS } from './mods';
import { buildGridGeometry } from './models/voxel-builder';
import { buildModelGrid, VOXEL_MODELS } from './models/registry';
import { findClearSpot, findRandomClearSpot, type Obstacle } from './world';

// Scrap crates that spawn around the map, separate from level-up choices.
// They give the player a reason to move somewhere and spend gold.
//
// 2026-07-09: crates are now PAID and opened with E. Each pins a TIER at spawn
// (so the price is known before opening) and colors its beam by that tier so
// the player reads what they're walking toward. This system owns presence and
// the tier; game.ts owns the E-interaction, the charge and the reel.
interface PickupSlot {
  active: boolean;
  tier: Rarity;
  group: THREE.Group;
  crate: THREE.Mesh;
  crateMat: THREE.MeshLambertMaterial | THREE.MeshToonMaterial;
  beamMat: THREE.MeshBasicMaterial;
  obstacle: Obstacle;
  /** Bob origin: primitive box floats at 0.8; the voxel model sits lower. */
  baseY: number;
}

export interface OpenableChest {
  index: number;
  tier: Rarity;
  /** World position, for the floating interact prompt. */
  x: number;
  z: number;
}

export class PickupSystem {
  private readonly slots: PickupSlot[] = [];
  // First crate shows up early so the mechanic is discovered in minute one.
  private spawnTimer = PICKUPS.spawnIntervalS * 0.4;
  private bobPhase = 0;
  /** Voxel chest geometry per tier — built async, swapped over the primitive. */
  private readonly voxelGeoms = new Map<Rarity, THREE.BufferGeometry>();
  private voxelMat: THREE.Material | null = null;

  constructor(scene: THREE.Scene) {
    const crateGeometry = new THREE.BoxGeometry(1, 1, 1);
    // Tall additive beam so crates read from the top-down camera at a distance.
    const beamGeometry = new THREE.CylinderGeometry(0.35, 0.35, 14, 8, 1, true);

    for (let i = 0; i < PICKUPS.maxActive; i++) {
      const group = new THREE.Group();
      // Per-slot materials so each crate can be tinted by its tier.
      const crateMat = litMaterial({ color: 0xf2b632, emissive: 0x6b4d0e });
      const crate = new THREE.Mesh(crateGeometry, crateMat);
      crate.position.y = 0.8;
      const beamMat = new THREE.MeshBasicMaterial({
        color: 0xffd76a,
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const beam = new THREE.Mesh(beamGeometry, beamMat);
      beam.position.y = 7;
      group.add(crate, beam);
      group.visible = false;
      scene.add(group);
      this.slots.push({
        active: false,
        tier: 'gray',
        group,
        crate,
        crateMat,
        beamMat,
        baseY: 0.8,
        obstacle: {
          x: 0,
          z: 0,
          radius: CHEST.colliderRadius,
          placementRadius: Math.max(
            CHEST.colliderRadius,
            CHEST.minSpawnSeparation - CHEST.colliderRadius,
          ),
          blocksFlyers: true,
        },
      });
    }

    // Image-derived voxel chests load async and swap over the primitives.
    void this.buildVoxelChests();
  }

  private async buildVoxelChests(): Promise<void> {
    const def = VOXEL_MODELS['chest-gray'];
    if (!def) return;
    try {
      const tiers: Rarity[] = ['gray', 'green', 'blue', 'purple', 'gold'];
      for (const tier of tiers) {
        const grid = await buildModelGrid(`chest-${tier}`);
        this.voxelGeoms.set(tier, buildGridGeometry(grid, def.voxelSize));
      }
      this.voxelMat = litMaterial({ vertexColors: true });
      for (const slot of this.slots) {
        if (slot.active) this.applyVoxel(slot);
      }
    } catch (error) {
      console.warn('Chest voxel model unavailable, keeping primitive crates:', error);
    }
  }

  /** Swaps a slot's primitive box for the tier-colored voxel chest. */
  private applyVoxel(slot: PickupSlot): void {
    const geometry = this.voxelGeoms.get(slot.tier);
    if (!geometry || !this.voxelMat) return;
    slot.crate.geometry = geometry;
    slot.crate.material = this.voxelMat;
    slot.baseY = 0.1;
  }

  /** Advances timers/animation and spawns the periodic crate. Collection is
   *  no longer automatic — game.ts opens chests via nearestOpenable + open. */
  update(dt: number, px: number, pz: number, luck: number, obstacles: Obstacle[]): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = PICKUPS.spawnIntervalS;
      this.spawn(px, pz, luck, obstacles);
    }

    this.bobPhase += dt;
    for (const slot of this.slots) {
      if (!slot.active) continue;
      slot.crate.rotation.y += dt * 1.2;
      slot.crate.position.y = slot.baseY + Math.sin(this.bobPhase * 2.5) * 0.15;
    }
  }

  /** Nearest active crate within interaction range of the player, or null. */
  nearestOpenable(px: number, pz: number): OpenableChest | null {
    let best: OpenableChest | null = null;
    let bestSq = CHEST.interactRadius * CHEST.interactRadius;
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (!slot || !slot.active) continue;
      const dx = slot.group.position.x - px;
      const dz = slot.group.position.z - pz;
      const dSq = dx * dx + dz * dz;
      if (dSq <= bestSq) {
        bestSq = dSq;
        best = { index: i, tier: slot.tier, x: slot.group.position.x, z: slot.group.position.z };
      }
    }
    return best;
  }

  /** Consumes a crate after a successful purchase. */
  open(index: number): void {
    const slot = this.slots[index];
    if (!slot) return;
    slot.active = false;
    slot.group.visible = false;
  }

  private spawn(px: number, pz: number, luck: number, obstacles: Obstacle[]): void {
    const spot = findRandomClearSpot(
      px,
      pz,
      PICKUPS.spawnDistMin,
      PICKUPS.spawnDistMax,
      CHEST.colliderRadius,
      obstacles,
      PICKUPS.spawnClearance,
    );
    if (spot) this.spawnAt(spot.x, spot.z, luck, obstacles);
  }

  /** Drops a crate at an exact position (elite kills, boss rewards), rolling
   *  its tier so its price and color are fixed from the moment it appears. */
  spawnAt(x: number, z: number, luck: number, obstacles: Obstacle[]): boolean {
    const slot = this.slots.find((s) => !s.active);
    if (!slot) return false; // All crates on the field; wait for one to be opened.
    const spot = findClearSpot(
      x,
      z,
      obstacles,
      CHEST.colliderRadius,
      PICKUPS.spawnClearance,
    );
    if (!spot) return false;
    slot.active = true;
    // Cap the rolled tier to one that has unlocked mods, so the beam/price a
    // player reads always matches the reward they'll get (no gold chest paying
    // out a purple mod). Self-heals as contracts unlock higher tiers.
    slot.tier = RECORDING.chestTesting.forceGreenChests ? 'green' : resolveChestTier(rollRarity(luck));
    const color = TIER_COLORS[slot.tier];
    slot.crateMat.color.setHex(color); // primitive fallback tint
    slot.beamMat.color.setHex(color); // the tier light — readable at distance
    this.applyVoxel(slot);
    slot.group.position.set(spot.x, 0, spot.z);
    slot.obstacle.x = spot.x;
    slot.obstacle.z = spot.z;
    slot.group.visible = true;
    return true;
  }

  appendObstacles(target: Obstacle[]): void {
    for (const slot of this.slots) {
      if (slot.active) target.push(slot.obstacle);
    }
  }

  reset(): void {
    for (const slot of this.slots) {
      slot.active = false;
      slot.group.visible = false;
    }
    this.spawnTimer = PICKUPS.spawnIntervalS * 0.4;
  }
}
