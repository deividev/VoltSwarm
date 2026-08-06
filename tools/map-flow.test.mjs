import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOSS_TYPE_INDEXES,
  ENEMY_TYPES,
  FINAL_BOSS_TYPE_INDEX,
  MAPS,
} from '../src/config.ts';
import {
  advanceRunFlow,
  completeFinale,
  createRunFlowState,
  markMapBossDefeated,
} from '../src/run-flow.ts';

test('Map 1 transitions without resetting total run progress', () => {
  const state = createRunFlowState();
  assert.equal(advanceRunFlow(state, MAPS[0].durationS - 1, MAPS).type, 'none');
  assert.deepEqual(advanceRunFlow(state, 1, MAPS), { type: 'transition', nextMapIndex: 1 });
  assert.equal(state.totalElapsedS, MAPS[0].durationS);
  assert.equal(state.mapElapsedS, 0);
});

test('the clock alone no longer clears a sector', () => {
  // Rule change 2026-08-06: the BOSS clears a sector. Surviving the ten minutes
  // still advances the run — the player is never stopped — but earns no credit.
  const state = createRunFlowState();
  advanceRunFlow(state, MAPS[0].durationS, MAPS);
  assert.equal(state.sectorsCleared, 0);
});

test('killing the map boss clears the sector', () => {
  const state = createRunFlowState();
  advanceRunFlow(state, MAPS[0].durationS - 1, MAPS);
  markMapBossDefeated(state);
  advanceRunFlow(state, 1, MAPS);
  assert.equal(state.sectorsCleared, 1);
});

test('sector credit does not carry across a transition', () => {
  // Clearing sector 1 must not pay for sector 2: the flag resets on transition.
  const state = createRunFlowState();
  markMapBossDefeated(state);
  advanceRunFlow(state, MAPS[0].durationS, MAPS);
  assert.equal(state.sectorsCleared, 1);
  assert.equal(state.mapBossDefeated, false);
});

test('several bosses on one map still clear exactly one sector', () => {
  const state = createRunFlowState();
  markMapBossDefeated(state);
  markMapBossDefeated(state);
  markMapBossDefeated(state);
  advanceRunFlow(state, MAPS[0].durationS, MAPS);
  assert.equal(state.sectorsCleared, 1);
});

test('Map 2 uses the provisional minute-zero pressure baseline', () => {
  const map2 = MAPS.find((map) => map.id === 'megafactory');
  assert.equal(map2?.difficultyOffsetS, 0);
});

test('clearing every sector needs every map boss, not just the finale', () => {
  // DELIBERATE consequence of the 2026-08-06 rule, recorded here so nobody
  // "fixes" it later: skipping the Map 1 boss and then killing the final boss
  // closes the LAST sector but not the arc, so the run reads Sector Cleared
  // rather than Run Complete, and `complete-runs` contracts stay unpaid.
  const skipped = createRunFlowState();
  advanceRunFlow(skipped, MAPS[0].durationS, MAPS);
  assert.deepEqual(advanceRunFlow(skipped, MAPS[1].durationS, MAPS), { type: 'start-finale' });
  assert.equal(skipped.sectorsCleared, 0);
  assert.equal(completeFinale(skipped, MAPS), false);
  assert.equal(skipped.sectorsCleared, 1);

  // Kill both and the arc completes.
  const full = createRunFlowState();
  markMapBossDefeated(full);
  advanceRunFlow(full, MAPS[0].durationS, MAPS);
  assert.deepEqual(advanceRunFlow(full, MAPS[1].durationS, MAPS), { type: 'start-finale' });
  assert.equal(advanceRunFlow(full, 60, MAPS).type, 'none');
  assert.equal(completeFinale(full, MAPS), true);
  assert.equal(full.sectorsCleared, MAPS.length);
  assert.equal(full.mapIndex + 1, 2);
});

test('Direct Map 2 start records one cleared sector without fabricating Map 1', () => {
  const state = createRunFlowState(1);
  assert.deepEqual(state, {
    mapIndex: 1,
    mapElapsedS: 0,
    totalElapsedS: 0,
    sectorsCleared: 0,
    finaleStarted: false,
    mapBossDefeated: false,
  });

  assert.deepEqual(advanceRunFlow(state, MAPS[1].durationS, MAPS), { type: 'start-finale' });
  assert.equal(completeFinale(state, MAPS), false);
  assert.equal(state.sectorsCleared, 1);
  assert.equal(state.mapIndex + 1, 2);
});

test('Hazard Marshal has one instanced slot and is excluded from Map 1 boss draw', () => {
  const hazard = ENEMY_TYPES[FINAL_BOSS_TYPE_INDEX];
  assert.equal(hazard?.name, 'Hazard Marshal');
  assert.equal(hazard?.modelKey, 'final-boss');
  assert.equal(hazard?.capacity, 1);
  assert.equal(hazard?.isBoss, true);
  assert.equal(BOSS_TYPE_INDEXES.includes(FINAL_BOSS_TYPE_INDEX), false);
});
