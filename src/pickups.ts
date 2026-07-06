import * as THREE from 'three';
import { ARENA_HALF_SIZE, PICKUPS } from './config';
import { litMaterial } from './toon';

// Scrap crates that spawn around the map, separate from level-up choices.
// They give the player a reason to move somewhere instead of kiting in
// circles: walk over a crate to collect its reward.

// Chests mix instant rewards with Megabonk-style general stat boosts (luck,
// area, cursed difficulty) that never appear in the level-up pool.
export type PickupReward =
  | 'repair'
  | 'scrap-cache'
  | 'frenzy'
  | 'haste'
  | 'luck'
  | 'area'
  | 'cursed';

const REWARD_WEIGHTS: [PickupReward, number][] = [
  ['repair', 3],
  ['scrap-cache', 3],
  ['frenzy', 2],
  ['haste', 2],
  ['luck', 2],
  ['area', 2],
  ['cursed', 1],
];

interface PickupSlot {
  active: boolean;
  reward: PickupReward;
  group: THREE.Group;
  crate: THREE.Mesh;
}

export class PickupSystem {
  private readonly slots: PickupSlot[] = [];
  // First crate shows up early so the mechanic is discovered in minute one.
  private spawnTimer = PICKUPS.spawnIntervalS * 0.4;
  private bobPhase = 0;

  constructor(scene: THREE.Scene) {
    const crateGeometry = new THREE.BoxGeometry(1, 1, 1);
    const crateMaterial = litMaterial({
      color: 0xf2b632,
      emissive: 0x6b4d0e,
    });
    // Tall additive beam so crates read from the top-down camera at a distance.
    const beamGeometry = new THREE.CylinderGeometry(0.35, 0.35, 14, 8, 1, true);
    const beamMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd76a,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    for (let i = 0; i < PICKUPS.maxActive; i++) {
      const group = new THREE.Group();
      const crate = new THREE.Mesh(crateGeometry, crateMaterial);
      crate.position.y = 0.8;
      const beam = new THREE.Mesh(beamGeometry, beamMaterial);
      beam.position.y = 7;
      group.add(crate, beam);
      group.visible = false;
      scene.add(group);
      this.slots.push({ active: false, reward: 'repair', group, crate });
    }
  }

  update(
    dt: number,
    px: number,
    pz: number,
    onCollect: (reward: PickupReward) => void,
  ): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = PICKUPS.spawnIntervalS;
      this.spawn(px, pz);
    }

    this.bobPhase += dt;
    for (const slot of this.slots) {
      if (!slot.active) continue;
      slot.crate.rotation.y += dt * 1.2;
      slot.crate.position.y = 0.8 + Math.sin(this.bobPhase * 2.5) * 0.15;

      const dx = slot.group.position.x - px;
      const dz = slot.group.position.z - pz;
      if (dx * dx + dz * dz <= PICKUPS.collectRadius * PICKUPS.collectRadius) {
        slot.active = false;
        slot.group.visible = false;
        onCollect(slot.reward);
      }
    }
  }

  private spawn(px: number, pz: number): void {
    const angle = Math.random() * Math.PI * 2;
    const dist = THREE.MathUtils.lerp(PICKUPS.spawnDistMin, PICKUPS.spawnDistMax, Math.random());
    this.spawnAt(px + Math.cos(angle) * dist, pz + Math.sin(angle) * dist);
  }

  /** Drops a crate at an exact position (elite kills, boss rewards). */
  spawnAt(x: number, z: number): void {
    const slot = this.slots.find((s) => !s.active);
    if (!slot) return; // All crates on the field; wait for one to be collected.
    slot.active = true;
    slot.reward = rollReward();
    slot.group.position.set(
      THREE.MathUtils.clamp(x, -ARENA_HALF_SIZE, ARENA_HALF_SIZE),
      0,
      THREE.MathUtils.clamp(z, -ARENA_HALF_SIZE, ARENA_HALF_SIZE),
    );
    slot.group.visible = true;
  }

  reset(): void {
    for (const slot of this.slots) {
      slot.active = false;
      slot.group.visible = false;
    }
    this.spawnTimer = PICKUPS.spawnIntervalS * 0.4;
  }
}

function rollReward(): PickupReward {
  const total = REWARD_WEIGHTS.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * total;
  for (const [reward, weight] of REWARD_WEIGHTS) {
    roll -= weight;
    if (roll <= 0) return reward;
  }
  return 'repair';
}
