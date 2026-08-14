/** Canonical contract-owned socket targets. UI and persistence consume these
 * definitions; neither may infer a target from the profile's current count. */
export type SocketSlot = 'weapon' | 'core';

export interface SocketRewardTarget {
  slot: SocketSlot;
  index: number;
}

const SOCKET_REWARD_TARGETS: Readonly<Record<string, SocketRewardTarget>> = {
  'second-wind': { slot: 'core', index: 3 },
  'full-loadout': { slot: 'core', index: 4 },
  'boss-hunter': { slot: 'weapon', index: 3 },
};

export function socketReward(contractId: string): { kind: 'socket'; slot: SocketSlot; index: number } {
  const target = SOCKET_REWARD_TARGETS[contractId];
  if (!target) throw new Error(`Contract ${contractId} has no canonical socket target.`);
  return { kind: 'socket', ...target };
}

/** Restores the canonical target on legacy reward records which predate
 * explicit socket indices. Known contract ids intentionally win over a stale
 * or hand-edited index. */
export function canonicalSocketReward<T extends { kind: string }>(contractId: string, reward: T): T {
  const target = SOCKET_REWARD_TARGETS[contractId];
  const socket = reward as { slot?: SocketSlot; index?: number };
  if (reward.kind !== 'socket' || !target || socket.slot !== target.slot || socket.index === target.index) return reward;
  return { ...reward, ...target };
}

/** The completed contract ids are the durable source of monotonic socket
 * ownership. A save with a stale count therefore cannot revoke a paid slot. */
export function completedSocketFloor(contractIds: readonly string[], slot: SocketSlot): number | undefined {
  let floor: number | undefined;
  for (const contractId of contractIds) {
    const target = SOCKET_REWARD_TARGETS[contractId];
    if (target?.slot === slot) floor = Math.max(floor ?? 0, target.index);
  }
  return floor;
}
