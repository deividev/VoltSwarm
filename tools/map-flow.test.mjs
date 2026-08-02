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

test('Map 2 uses the provisional minute-zero pressure baseline', () => {
  const map2 = MAPS.find((map) => map.id === 'megafactory');
  assert.equal(map2?.difficultyOffsetS, 0);
});

test('Map 2 clock starts the provisional finale but cannot complete the run', () => {
  const state = createRunFlowState();
  advanceRunFlow(state, MAPS[0].durationS, MAPS);
  assert.deepEqual(advanceRunFlow(state, MAPS[1].durationS, MAPS), { type: 'start-finale' });
  assert.equal(state.sectorsCleared, 1);
  assert.equal(advanceRunFlow(state, 60, MAPS).type, 'none');
  assert.equal(completeFinale(state, MAPS), true);
  assert.equal(state.sectorsCleared, MAPS.length);
  assert.equal(state.mapIndex + 1, 2);
});

test('Direct Map 2 start records one cleared sector without fabricating Map 1', () => {
  const state = createRunFlowState(1);
  assert.deepEqual(state, {
    mapIndex: 1,
    mapElapsedS: 0,
    totalElapsedS: 0,
    sectorsCleared: 0,
    finaleStarted: false,
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
