/**
 * Pure phase controller for the staged defeat beat.
 *
 * It owns nothing but time and input edges: no WebGL, no DOM, no audio, and — as
 * with run-flow.ts — no config import either. The timings arrive as an argument
 * so this module stays runnable under plain Node, which is the only way the
 * timing and debounce rules are testable at all.
 *
 * Every boundary is an ABSOLUTE timestamp measured from the accepted fatal hit,
 * so a dropped frame delays a reveal but can never reorder two of them, and one
 * large delta produces exactly the same commands as many small ones.
 */

export interface DefeatTimings {
  /** Frozen impact on the fatal frame. */
  fatalHitstopS: number;
  /** Chassis-overload animation, from the end of the hitstop to the title. */
  overloadS: number;
  /** SYSTEM OVERLOAD + subtitle appear. */
  titleRevealS: number;
  /** Full results content and the enabled actions. */
  summaryRevealS: number;
  /** Earliest a fresh, debounced confirm may complete the presentation. */
  skipUnlockS: number;
}

export type DefeatPhase = 'hitstop' | 'overload' | 'title' | 'summary' | 'ready';

/** One-shot commands for the frame. Each fires exactly once per run. */
export interface DefeatCommands {
  /** Show SYSTEM OVERLOAD / Chassis integrity lost, emit the `run-defeat` sting
   *  and power the chassis down. */
  revealTitle: boolean;
  /** Reveal the full results content and enable the branch-specific actions. */
  revealSummary: boolean;
}

export interface DefeatInput {
  /** A fresh confirm edge this frame (Interact binding, gamepad confirm, or an
   *  intentional pointer/touch press on the transition surface). */
  confirmPressed: boolean;
  /** Whether ANY eligible skip input is currently held. A confirm held from
   *  before the fatal hit must never skip, so the gate only arms once every
   *  eligible input has been released. */
  confirmHeld: boolean;
}

export interface DefeatState {
  phase: DefeatPhase;
  /** Presentation seconds since the accepted fatal hit. Never run time. */
  elapsedS: number;
  titleRevealed: boolean;
  summaryRevealed: boolean;
  /** Release gate. False until every eligible skip input has been seen up. */
  gateArmed: boolean;
  /** True once a skip completed the presentation early (diagnostics/tests). */
  skipped: boolean;
}

export function createDefeatState(): DefeatState {
  return {
    phase: 'hitstop',
    elapsedS: 0,
    titleRevealed: false,
    summaryRevealed: false,
    gateArmed: false,
    skipped: false,
  };
}

/** Overload pressure 0→1 across the chassis-overload window. Drives spark
 *  cadence and strobe duty so the beat BUILDS instead of running flat. */
export function overloadPressure(state: DefeatState, timings: DefeatTimings): number {
  if (timings.overloadS <= 0) return 1;
  return clamp01((state.elapsedS - timings.fatalHitstopS) / timings.overloadS);
}

/** Actions may accept a confirm only when they are visible AND the gate is
 *  armed. This is what stops the press that skipped from also selecting an
 *  action on the same frame. */
export function actionsAcceptInput(state: DefeatState): boolean {
  return state.summaryRevealed && state.gateArmed;
}

/** Browser blur: drop the gate so the focus return cannot synthesize an edge. */
export function disarmDefeatGate(state: DefeatState): void {
  state.gateArmed = false;
}

/**
 * Advances presentation time and returns the one-shot commands for this frame.
 *
 * Order inside a frame matters: the gate is evaluated against the input state
 * BEFORE the skip is tested, so a confirm still held from the fatal frame is
 * rejected on the frame it would otherwise unlock.
 */
export function advanceDefeat(
  state: DefeatState,
  dtS: number,
  timings: DefeatTimings,
  input: DefeatInput = { confirmPressed: false, confirmHeld: false },
): DefeatCommands {
  state.elapsedS += Math.max(0, dtS);

  // The gate arms on release and never on a press: this is the whole defence
  // against "held confirm at death instantly restarts the run".
  if (!input.confirmHeld) state.gateArmed = true;

  const skipAccepted =
    input.confirmPressed &&
    state.gateArmed &&
    !state.summaryRevealed &&
    state.elapsedS >= timings.skipUnlockS;

  if (skipAccepted) {
    state.skipped = true;
    // A skip reveals the FINAL state, so time jumps to the summary boundary and
    // any reveal the sequence had not reached yet still fires below, in order.
    state.elapsedS = Math.max(state.elapsedS, timings.summaryRevealS);
  }

  const commands: DefeatCommands = { revealTitle: false, revealSummary: false };
  if (!state.titleRevealed && state.elapsedS >= timings.titleRevealS) {
    state.titleRevealed = true;
    commands.revealTitle = true;
  }
  if (!state.summaryRevealed && state.elapsedS >= timings.summaryRevealS) {
    state.summaryRevealed = true;
    commands.revealSummary = true;
  }

  // Consume the skip press by re-arming from scratch: the same physical press
  // cannot reach NEW RUN / PLAY AGAIN / MAIN MENU.
  if (skipAccepted) state.gateArmed = false;

  state.phase = phaseOf(state, timings);
  return commands;
}

function phaseOf(state: DefeatState, timings: DefeatTimings): DefeatPhase {
  if (state.summaryRevealed) return state.gateArmed ? 'ready' : 'summary';
  if (state.titleRevealed) return 'title';
  return state.elapsedS < timings.fatalHitstopS ? 'hitstop' : 'overload';
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
