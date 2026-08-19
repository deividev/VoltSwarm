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
  enterMap,
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

test('Map 2 opens above Map 1 while keeping room to ramp', () => {
  // Decision 0.2: the foundry must not restart Map 1's curve from zero (that
  // made it a clone) and must not open already pinned at its ceiling either.
  //
  // The offset this replaces could only ever do one of those two things: it slid
  // a 480s curve forward, so a Map 2 that opened high also SATURATED early and
  // spent its back half flat. A floor/peak/ramp triple is what lets the map open
  // hot AND keep climbing for its whole ten minutes.
  const map2 = MAPS.find((map) => map.id === 'megafactory');
  assert.ok(map2, 'the foundry must remain in the arc');
  assert.ok(map2.difficulty.floor > MAPS[0].difficulty.floor, 'Map 2 must open above Map 1');
  assert.ok(map2.difficulty.peak > map2.difficulty.floor, 'Map 2 must have room to ramp');
  assert.ok(map2.difficulty.peak > MAPS[0].difficulty.peak, 'Map 2 must exceed Map 1 s ceiling');
  // The sweep must span the whole map, not a fraction of it.
  assert.ok(map2.difficulty.rampS >= map2.durationS, 'Map 2 must not go flat before it ends');
  // Values above 1 multiply live cap, wave size and enemy HP; 1.6 is the hard
  // clamp in difficultyScalar, and reaching it on the clock alone would leave
  // Cursed Core with nothing to add.
  assert.ok(map2.difficulty.peak < 1.6, 'Map 2 must leave headroom above the clock');
});

test('Map 2 replays the enemy introductions on its own compressed clock', () => {
  // Staging is separate from strength: enemy HP rides the arc clock and never
  // rewinds, but WHICH types appear restarts, so a new sector gets an opening of
  // its own instead of inheriting the finished cast of the previous map.
  const map2 = MAPS.find((map) => map.id === 'megafactory');
  assert.ok(map2, 'the foundry must remain in the arc');
  assert.ok(map2.rosterSpeed > 1, 'Map 2 must replay the introductions faster than Map 1');
  // The authored schedule must FINISH well inside the map. At 1.0 the last type
  // arrives at 420s and the foundry would spend most of its length short of its
  // heavies; the whole cast should be back in roughly the first third.
  const lastUnlockS = Math.max(
    ...ENEMY_TYPES.filter((type) => type.weight > 0 && Number.isFinite(type.unlockAtS)).map(
      (type) => type.unlockAtS,
    ),
  );
  assert.ok(
    lastUnlockS / map2.rosterSpeed <= map2.durationS / 3,
    'Map 2 must have its full cast back inside the first third',
  );
});

test('Map 1 keeps the exact curve every existing playtest was tuned against', () => {
  // Decision 0.2 isolates Map 1 from Map 2's recalibration. These three numbers
  // reproduce the historical global formula; changing any of them invalidates
  // every recorded run, not just the foundry's.
  assert.deepEqual({ ...MAPS[0].difficulty }, { floor: 0, peak: 1, rampS: 480 });
  assert.equal(MAPS[0].contactDamageMult, 1);
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

test('Game ends the run on the explicit boss-required timeout action, carrying the reason', async () => {
  const gameSource = await readFile(new URL('../src/game.ts', import.meta.url), 'utf8');
  // The reason must reach endRun: the results screen reads it to say OBJECTIVE
  // FAILED instead of the generic death title (decision 0.7).
  assert.match(
    gameSource,
    /if \(flowAction\.type === 'end-run'\) \{\s*this\.endRun\(flowAction\.outcome, flowAction\.reason\);\s*return;/,
  );
  assert.match(gameSource, /private endRun\(outcome: RunOutcome, reason\?: 'boss-required'\)/);
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

test('enterMap is the single definition of crossing, shared by the real path and the dev key', async () => {
  // The dev jump-to-transition key must not hand-roll its own arc advance: a copy
  // would drift and make the shortcut show something players never get.
  const state = createRunFlowState();
  enterMap(state, 1);
  assert.equal(state.mapIndex, 1);
  assert.equal(state.mapElapsedS, 0);
  assert.equal(state.sectorsCleared, 1);
  assert.equal(state.mapBossDefeated, false);
  assert.equal(state.finaleStarted, false);

  const gameSource = await readFile(new URL('../src/game.ts', import.meta.url), 'utf8');
  const key = gameSource.slice(
    gameSource.indexOf('private installMapTransitionKey'),
    gameSource.indexOf('private installFatalHitKey'),
  );
  assert.match(key, /enterMap\(this\.runFlow, nextMapIndex\)/);
  assert.match(key, /this\.beginMapTransition\(nextMapIndex, true\)/);
  // Guarded, and it must refuse to run past the last map.
  assert.match(gameSource, /DEV_TOOLS\.mapTransitionKey\) this\.installMapTransitionKey\(\)/);
  assert.match(key, /nextMapIndex >= MAPS\.length/);
});

test('the transition fades the music on the same curve as the curtain', async () => {
  const gameSource = await readFile(new URL('../src/game.ts', import.meta.url), 'utf8');
  const tick = gameSource.slice(
    gameSource.indexOf('private tickMapTransition'),
    gameSource.indexOf('private transitionToMap'),
  );
  // Music volume is driven by the SAME opacity the curtain uses, so picture and
  // sound cannot drift apart, and it lands exactly on the run level at the end
  // (the per-frame ramp only approaches its target).
  assert.match(tick, /setLoopVolume\('foundation-run-loop', AUDIO\.music\.runLoopVolume \* \(1 - opacity\)\)/);
  assert.match(tick, /setLoopVolume\('foundation-run-loop', AUDIO\.music\.runLoopVolume\)/);
});

test('the sector name announces itself at full black, and can replay', async () => {
  const [gameSource, hudSource, cssSource] = await Promise.all([
    readFile(new URL('../src/game.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/hud.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui.css', import.meta.url), 'utf8'),
  ]);
  // The entrance fires inside the swap block (full black), not when the curtain
  // starts: otherwise the name rides in over the map it is replacing.
  const tick = gameSource.slice(
    gameSource.indexOf('private tickMapTransition'),
    gameSource.indexOf('private transitionToMap'),
  );
  const swapAt = tick.indexOf('this.transitionToMap(mt.nextMapIndex)');
  const announceAt = tick.indexOf('this.hud.playMapFadeLabel()');
  assert.ok(swapAt >= 0 && announceAt > swapAt);
  // Reflow between removing and re-adding the class, or the entrance plays only
  // on the first transition of the session.
  assert.match(hudSource, /playMapFadeLabel\(\): void \{[\s\S]*?void text\.offsetWidth;[\s\S]*?classList\.add\('play'\)/);
  // Stepped, like the defeat title and the chest reel — never a smooth ease.
  assert.match(cssSource, /#map-fade-label\.play \{\s*animation: map-label-in [\d.]+s steps\(\d+\) forwards;/);
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
