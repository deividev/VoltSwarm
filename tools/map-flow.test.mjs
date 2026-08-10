import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BOSS_TYPE_INDEXES,
  CRUSHER_KING_TYPE_INDEX,
  ENEMY_TYPES,
  FINAL_BOSS_TYPE_INDEX,
  MAPS,
  TESLA_TITAN_TYPE_INDEX,
} from '../src/config.ts';
import {
  advanceRunFlow,
  completeFinale,
  createRunFlowState,
  markMapBossDefeated,
} from '../src/run-flow.ts';

test('Map 1 transitions only after its boss dies without resetting total run progress', () => {
  const state = createRunFlowState();
  assert.equal(advanceRunFlow(state, MAPS[0].durationS - 1, MAPS).type, 'none');
  markMapBossDefeated(state);
  assert.deepEqual(advanceRunFlow(state, 1, MAPS), { type: 'transition', nextMapIndex: 1 });
  assert.equal(state.totalElapsedS, MAPS[0].durationS);
  assert.equal(state.mapElapsedS, 0);
});

test('Map 1 timeout without its boss ends the run immediately as a defeat', () => {
  const state = createRunFlowState();
  const action = advanceRunFlow(state, MAPS[0].durationS, MAPS);
  assert.deepEqual(action, { type: 'end-run', outcome: 'defeat', reason: 'boss-required' });
  assert.equal(state.sectorsCleared, 0);
  assert.equal(state.mapIndex, 0);
  assert.equal(state.mapElapsedS, MAPS[0].durationS);
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

test('clearing every sector needs the Map 1 boss and the finale', () => {
  const full = createRunFlowState();
  markMapBossDefeated(full);
  advanceRunFlow(full, MAPS[0].durationS, MAPS);
  assert.deepEqual(advanceRunFlow(full, MAPS[1].durationS, MAPS), { type: 'start-finale' });
  assert.equal(advanceRunFlow(full, 60, MAPS).type, 'none');
  assert.equal(completeFinale(full, MAPS), true);
  assert.equal(full.sectorsCleared, MAPS.length);
  assert.equal(full.mapIndex + 1, 2);
});

test('Game ends the run on the explicit boss-required timeout action', async () => {
  const gameSource = await readFile(new URL('../src/game.ts', import.meta.url), 'utf8');
  assert.match(
    gameSource,
    /if \(flowAction\.type === 'end-run'\) \{\s*this\.endRun\(flowAction\.outcome\);\s*return;/,
  );
});

test('persistent mission and enlarged ASCII-safe edge markers stay wired into the HUD', async () => {
  const [hudSource, cssSource] = await Promise.all([
    readFile(new URL('../src/hud.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui.css', import.meta.url), 'utf8'),
  ]);
  assert.match(hudSource, /id="mission" aria-label="Current mission"/);
  assert.match(hudSource, /Survive until time expires/);
  assert.match(hudSource, /Defeat the boss to unlock the next sector/);
  assert.match(hudSource, /updateMission\(mapIndex: number, bossDefeated: boolean, finaleStarted: boolean\)/);
  assert.doesNotMatch(hudSource, /<span class="arrow">[^<]+<\/span>/);
  assert.match(cssSource, /#mission \{[\s\S]*right: 16px;[\s\S]*width: min\(390px, 42vw\);/);
  assert.match(cssSource, /#totem-indicator \.arrow \{[\s\S]*border-bottom: 26px solid #ff3355;/);
  assert.match(cssSource, /#merchant-indicator \.arrow \{[\s\S]*border-bottom: 26px solid #f2b632;/);
  assert.match(cssSource, /#totem-indicator \.label,[\s\S]*font-size: 11px;/);
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

test('Map 1 summon pool contains Crusher King and Tesla Titan only', () => {
  assert.deepEqual(BOSS_TYPE_INDEXES, [CRUSHER_KING_TYPE_INDEX, TESLA_TITAN_TYPE_INDEX]);
  assert.deepEqual(BOSS_TYPE_INDEXES.map((index) => ENEMY_TYPES[index]?.name), [
    'Crusher King',
    'Tesla Titan',
  ]);
  assert.equal(ENEMY_TYPES[CRUSHER_KING_TYPE_INDEX]?.behavior, 'chase');
  assert.equal(ENEMY_TYPES[CRUSHER_KING_TYPE_INDEX]?.speed, 3);
  assert.equal(BOSS_TYPE_INDEXES.includes(FINAL_BOSS_TYPE_INDEX), false);
});
