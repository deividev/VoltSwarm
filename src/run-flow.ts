export interface RunFlowMap {
  id: string;
  durationS: number;
}

export interface RunFlowState {
  mapIndex: number;
  mapElapsedS: number;
  totalElapsedS: number;
  sectorsCleared: number;
  finaleStarted: boolean;
  /** Whether a boss died on the CURRENT map. Reset at every transition, because
   *  clearing sector 1 must not pay for sector 2. */
  mapBossDefeated: boolean;
}

export type RunFlowAction =
  | { type: 'none' }
  | { type: 'transition'; nextMapIndex: number }
  | { type: 'start-finale' };

export function createRunFlowState(startMapIndex = 0): RunFlowState {
  return {
    mapIndex: Number.isInteger(startMapIndex) && startMapIndex >= 0 ? startMapIndex : 0,
    mapElapsedS: 0,
    totalElapsedS: 0,
    sectorsCleared: 0,
    finaleStarted: false,
    mapBossDefeated: false,
  };
}

/** Called when a boss dies. Idempotent: several bosses can fall on one map and
 *  the sector is cleared either way. */
export function markMapBossDefeated(state: RunFlowState): void {
  state.mapBossDefeated = true;
}

/** Advances both clocks and returns the one structural action owed this frame.
 * The last map starts its finale once; elapsed time alone never completes a run. */
export function advanceRunFlow(
  state: RunFlowState,
  dt: number,
  maps: readonly RunFlowMap[],
): RunFlowAction {
  if (!Number.isFinite(dt) || dt <= 0) return { type: 'none' };
  const map = maps[state.mapIndex];
  if (!map) throw new Error(`Missing run map at index ${state.mapIndex}.`);
  state.totalElapsedS += dt;
  state.mapElapsedS += dt;
  if (state.mapElapsedS < map.durationS) return { type: 'none' };

  const nextMapIndex = state.mapIndex + 1;
  if (nextMapIndex < maps.length) {
    // The BOSS clears a sector, not the clock (2026-08-06). Surviving the ten
    // minutes still advances the run — the player is not stopped — but it earns
    // no sector credit. Before this, every contract behind `complete-runs` was
    // paid out by waiting, which is why the portal had no pull: zero of six
    // recorded human runs ever walked to it.
    if (state.mapBossDefeated) state.sectorsCleared += 1;
    state.mapIndex = nextMapIndex;
    state.mapElapsedS = 0;
    state.finaleStarted = false;
    state.mapBossDefeated = false;
    return { type: 'transition', nextMapIndex };
  }

  if (!state.finaleStarted) {
    state.finaleStarted = true;
    return { type: 'start-finale' };
  }
  return { type: 'none' };
}

/** The finale kill, not the clock, closes the final sector. Returns whether
 * every sector in the ordered arc was actually cleared during this run. */
export function completeFinale(state: RunFlowState, maps: readonly RunFlowMap[]): boolean {
  if (state.mapIndex !== maps.length - 1 || !state.finaleStarted) {
    throw new Error('Cannot complete a finale that has not started on the final map.');
  }
  state.sectorsCleared = Math.min(maps.length, state.sectorsCleared + 1);
  return state.sectorsCleared === maps.length;
}
