import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFEAT_TRANSITION } from '../src/config.ts';
import {
  actionsAcceptInput,
  advanceDefeat,
  createDefeatState,
  disarmDefeatGate,
  overloadPressure,
} from '../src/defeat-transition.ts';

const RELEASED = { confirmPressed: false, confirmHeld: false };
const HELD = { confirmPressed: false, confirmHeld: true };
const FRESH_PRESS = { confirmPressed: true, confirmHeld: true };

/** Steps in small frames up to `untilS`, returning the accumulated commands. */
function run(state, untilS, input = RELEASED, stepS = 1 / 60) {
  const seen = { revealTitle: 0, revealSummary: 0 };
  while (state.elapsedS < untilS - 1e-9) {
    const commands = advanceDefeat(state, stepS, DEFEAT_TRANSITION, input);
    if (commands.revealTitle) seen.revealTitle++;
    if (commands.revealSummary) seen.revealSummary++;
  }
  return seen;
}

test('the sequence stays in hitstop until the configured freeze ends', () => {
  const state = createDefeatState();
  advanceDefeat(state, DEFEAT_TRANSITION.fatalHitstopS - 0.01, DEFEAT_TRANSITION, RELEASED);
  assert.equal(state.phase, 'hitstop');
  advanceDefeat(state, 0.02, DEFEAT_TRANSITION, RELEASED);
  assert.equal(state.phase, 'overload');
});

test('title and summary reveal exactly once, at their absolute timestamps', () => {
  const state = createDefeatState();
  const beforeTitle = run(state, DEFEAT_TRANSITION.titleRevealS - 0.02);
  assert.equal(beforeTitle.revealTitle, 0);
  assert.equal(state.titleRevealed, false);

  const throughSummary = run(state, DEFEAT_TRANSITION.summaryRevealS + 0.2);
  assert.equal(throughSummary.revealTitle, 1);
  assert.equal(throughSummary.revealSummary, 1);

  // Ticking on cannot fire either reveal a second time.
  const after = run(state, DEFEAT_TRANSITION.summaryRevealS + 1);
  assert.equal(after.revealTitle, 0);
  assert.equal(after.revealSummary, 0);
});

test('one large delta produces the same commands as many small ones', () => {
  const small = createDefeatState();
  const seen = run(small, DEFEAT_TRANSITION.summaryRevealS + 0.1);

  const big = createDefeatState();
  const once = advanceDefeat(big, DEFEAT_TRANSITION.summaryRevealS + 0.1, DEFEAT_TRANSITION, RELEASED);

  assert.deepEqual(once, { revealTitle: true, revealSummary: true });
  assert.equal(seen.revealTitle, 1);
  assert.equal(seen.revealSummary, 1);
  assert.equal(big.phase, small.phase);
});

test('a skip before the unlock window is rejected', () => {
  const state = createDefeatState();
  run(state, DEFEAT_TRANSITION.skipUnlockS - 0.05);
  const commands = advanceDefeat(state, 1 / 60, DEFEAT_TRANSITION, { confirmPressed: true, confirmHeld: false });
  assert.equal(state.skipped, false);
  assert.equal(commands.revealSummary, false);
  assert.equal(state.summaryRevealed, false);
});

test('a skip at the unlock window reveals the final state in one frame', () => {
  const state = createDefeatState();
  run(state, DEFEAT_TRANSITION.skipUnlockS);
  const commands = advanceDefeat(state, 1 / 60, DEFEAT_TRANSITION, { confirmPressed: true, confirmHeld: true });
  assert.equal(state.skipped, true);
  assert.equal(commands.revealTitle, true);
  assert.equal(commands.revealSummary, true);
  assert.equal(state.summaryRevealed, true);
});

test('the press that skipped cannot also activate an action', () => {
  const state = createDefeatState();
  run(state, DEFEAT_TRANSITION.skipUnlockS);
  advanceDefeat(state, 1 / 60, DEFEAT_TRANSITION, FRESH_PRESS);
  assert.equal(state.summaryRevealed, true);
  // Still held after the skip: actions must refuse input.
  assert.equal(actionsAcceptInput(state), false);
  advanceDefeat(state, 1 / 60, DEFEAT_TRANSITION, HELD);
  assert.equal(actionsAcceptInput(state), false);
  // Released: only now can an action be chosen.
  advanceDefeat(state, 1 / 60, DEFEAT_TRANSITION, RELEASED);
  assert.equal(actionsAcceptInput(state), true);
  assert.equal(state.phase, 'ready');
});

test('confirm held from the fatal frame can never skip', () => {
  const state = createDefeatState();
  // Held for the whole sequence, re-pressing edges included.
  run(state, DEFEAT_TRANSITION.summaryRevealS - 0.05, { confirmPressed: true, confirmHeld: true });
  assert.equal(state.skipped, false);
  assert.equal(state.summaryRevealed, false);
});

test('release then a fresh press does skip', () => {
  const state = createDefeatState();
  run(state, DEFEAT_TRANSITION.skipUnlockS, HELD);
  assert.equal(state.skipped, false);
  advanceDefeat(state, 1 / 60, DEFEAT_TRANSITION, RELEASED); // release arms the gate
  advanceDefeat(state, 1 / 60, DEFEAT_TRANSITION, FRESH_PRESS);
  assert.equal(state.skipped, true);
});

test('losing focus disarms the gate so the return cannot act', () => {
  const state = createDefeatState();
  run(state, DEFEAT_TRANSITION.summaryRevealS + 0.1);
  assert.equal(actionsAcceptInput(state), true);
  disarmDefeatGate(state);
  assert.equal(actionsAcceptInput(state), false);
  advanceDefeat(state, 1 / 60, DEFEAT_TRANSITION, HELD);
  assert.equal(actionsAcceptInput(state), false);
  advanceDefeat(state, 1 / 60, DEFEAT_TRANSITION, RELEASED);
  assert.equal(actionsAcceptInput(state), true);
});

test('overload pressure runs 0 to 1 across the overload window only', () => {
  const state = createDefeatState();
  advanceDefeat(state, DEFEAT_TRANSITION.fatalHitstopS, DEFEAT_TRANSITION, RELEASED);
  assert.equal(overloadPressure(state, DEFEAT_TRANSITION), 0);
  advanceDefeat(state, DEFEAT_TRANSITION.overloadS / 2, DEFEAT_TRANSITION, RELEASED);
  assert.ok(Math.abs(overloadPressure(state, DEFEAT_TRANSITION) - 0.5) < 1e-6);
  advanceDefeat(state, DEFEAT_TRANSITION.overloadS, DEFEAT_TRANSITION, RELEASED);
  assert.equal(overloadPressure(state, DEFEAT_TRANSITION), 1);
});

test('the approved timings are the ones the controller runs on', () => {
  assert.equal(DEFEAT_TRANSITION.fatalHitstopS, 0.1);
  assert.equal(DEFEAT_TRANSITION.overloadS, 0.65);
  assert.equal(DEFEAT_TRANSITION.titleRevealS, 0.75);
  assert.equal(DEFEAT_TRANSITION.summaryRevealS, 1.2);
  assert.equal(DEFEAT_TRANSITION.skipUnlockS, 0.55);
  assert.equal(DEFEAT_TRANSITION.musicFadeS, 0.45);
  // The title beat is the end of the overload, not an independent number.
  assert.equal(
    DEFEAT_TRANSITION.fatalHitstopS + DEFEAT_TRANSITION.overloadS,
    DEFEAT_TRANSITION.titleRevealS,
  );
  // A skip must be reachable before the unskipped summary would arrive anyway.
  assert.ok(DEFEAT_TRANSITION.skipUnlockS < DEFEAT_TRANSITION.summaryRevealS);
});
