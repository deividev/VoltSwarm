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
  | { type: 'end-run'; outcome: 'defeat'; reason: 'boss-required' }
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

/** Moves the arc state onto `nextMapIndex`: credits the sector just left and
 *  resets the per-map clock, finale latch and boss credit.
 *
 *  Exported so the development jump-to-transition key advances the arc through
 *  the SAME code the real crossing uses — a hand-rolled copy in the dev path
 *  would drift and make the shortcut lie about the state it produces. */
export function enterMap(state: RunFlowState, nextMapIndex: number): void {
  state.sectorsCleared += 1;
  state.mapIndex = nextMapIndex;
  state.mapElapsedS = 0;
  state.finaleStarted = false;
  state.mapBossDefeated = false;
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
    // Map 1's boss is the key to Map 2. Returning a structural action instead
    // of leaving this decision in Game makes the timeout rule deterministic
    // and testable without running the renderer.
    if (!state.mapBossDefeated) {
      return { type: 'end-run', outcome: 'defeat', reason: 'boss-required' };
    }
    // Boss credit and timer survival are both required: one without the other
    // cannot cross this map boundary.
    enterMap(state, nextMapIndex);
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
