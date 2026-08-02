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
} from '../src/run-flow.ts';

test('Map 1 transitions without resetting total run progress', () => {
  const state = createRunFlowState();
  assert.equal(advanceRunFlow(state, MAPS[0].durationS - 1, MAPS).type, 'none');
  assert.deepEqual(advanceRunFlow(state, 1, MAPS), { type: 'transition', nextMapIndex: 1 });
  assert.equal(state.totalElapsedS, MAPS[0].durationS);
  assert.equal(state.mapElapsedS, 0);
  assert.equal(state.sectorsCleared, 1);
});

test('Map 2 clock starts the provisional finale but cannot complete the run', () => {
  const state = createRunFlowState();
  advanceRunFlow(state, MAPS[0].durationS, MAPS);
  assert.deepEqual(advanceRunFlow(state, MAPS[1].durationS, MAPS), { type: 'start-finale' });
  assert.equal(state.sectorsCleared, 1);
  assert.equal(advanceRunFlow(state, 60, MAPS).type, 'none');
  completeFinale(state, MAPS);
  assert.equal(state.sectorsCleared, MAPS.length);
});

test('Hazard Marshal has one instanced slot and is excluded from Map 1 boss draw', () => {
  const hazard = ENEMY_TYPES[FINAL_BOSS_TYPE_INDEX];
  assert.equal(hazard?.name, 'Hazard Marshal');
  assert.equal(hazard?.modelKey, 'final-boss');
  assert.equal(hazard?.capacity, 1);
  assert.equal(hazard?.isBoss, true);
  assert.equal(BOSS_TYPE_INDEXES.includes(FINAL_BOSS_TYPE_INDEX), false);
});
