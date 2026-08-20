import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
  assert.equal(DEFEAT_TRANSITION.fatalHitstopS, 0.15);
  assert.equal(DEFEAT_TRANSITION.overloadS, 0.65);
  assert.equal(DEFEAT_TRANSITION.titleRevealS, 0.8);
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


test('the impact beat lasts exactly as long as the health bar takes to empty', async () => {
  // User call 2026-08-20: "queda raro ver que tengo 15 de vida y muero". The
  // fix is two-sided — the bar is pushed to zero on the fatal hit, and the
  // overload waits for it — so these two constants are ONE decision living in
  // two files. Cut against the real stylesheet value, the same rule the audio
  // cues follow: an animation-coupled beat is timed against the animation, not
  // against a number that looked about right.
  const css = await readFile(new URL('../src/ui.css', import.meta.url), 'utf8');
  // The v2 rule wins: it is the later of the two #hp-bar-fill blocks.
  const durations = [...css.matchAll(/#hp-bar-fill\s*\{[^}]*transition:\s*width\s+([\d.]+)s/g)].map(
    (m) => Number(m[1]),
  );
  assert.ok(durations.length > 0, 'the health bar must declare a width transition');
  const drainS = durations[durations.length - 1];
  assert.equal(
    DEFEAT_TRANSITION.fatalHitstopS,
    drainS,
    `the bar drains in ${drainS}s but the overload starts at ${DEFEAT_TRANSITION.fatalHitstopS}s`,
  );
});

test('the fatal hit empties the bar before anything else happens', async () => {
  // updateBars is gated on the run being `playing`, and the fatal path leaves
  // that state in the same frame, so the HUD has to be told explicitly. Without
  // this line the bar keeps the pre-hit health for the whole death beat.
  const gameSource = await readFile(new URL('../src/game.ts', import.meta.url), 'utf8');
  const transition = gameSource.slice(gameSource.indexOf('private beginDefeatTransition('));
  const body = transition.slice(0, transition.indexOf('\n  }'));
  assert.match(body, /this\.hud\.updateBars\(\s*this\.player\.hp,/);
  assert.ok(
    body.indexOf('this.hud.updateBars(') < body.indexOf('this.player.beginDefeatPresentation()'),
    'the bar must be emptied before the chassis presentation is armed',
  );
});
