// The Hazard Marshal: arrival rules and the three-phase fight.
//
// Driven through vite's SSR loader rather than plain node because src modules
// use extensionless relative imports. The fight itself is headless-safe: it
// builds geometries and materials, never a WebGL context.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import * as THREE from 'three';

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
const config = await server.ssrLoadModule('/src/config.ts');
const finalBoss = await server.ssrLoadModule('/src/final-boss.ts');
after(async () => server.close());

const { FINAL_BOSS, FINAL_BOSS_TYPE_INDEX, ENEMY_TYPES, PLAYER, BOSS, ENEMIES, CAMERA } = config;
const { FinalBossFight, wedgeRotationY, isInsideWedge } = finalBoss;

function makeHarness({ hp = 7200 } = {}) {
  const boss = { x: 0, z: 0, speed: ENEMY_TYPES[FINAL_BOSS_TYPE_INDEX].speed, hp, maxHp: hp };
  const events = [];
  let frame = 0;
  const projectiles = { fire: () => events.push({ frame, kind: 'projectile' }) };
  const enemies = {
    activeCount: 0,
    waveHpMultiplier: 4.7,
    spawned: [],
    spawnAt(typeIndex, x, z, hpMultiplier) {
      this.spawned.push({ typeIndex, x, z, hpMultiplier });
      return 0;
    },
    shoveAwayFrom: () => 0,
  };
  const effects = {
    damage: [],
    banners: [],
    damagePlayer(amount) {
      this.damage.push({ frame, amount });
      events.push({ frame, kind: 'damage' });
    },
    burst: () => {},
    ring: () => {},
    shake: () => {},
    banner(text) {
      this.banners.push(text);
    },
    sound: () => {},
  };
  const scene = new THREE.Scene();
  const fight = new FinalBossFight(scene);
  fight.begin(boss.speed);
  return {
    boss,
    fight,
    scene,
    /** Telegraph meshes currently painted on the floor. */
    litMarkers: () => scene.children.filter((child) => child.visible).length,
    enemies,
    effects,
    events,
    get frame() {
      return frame;
    },
    /** Advances the fight, optionally stopping early on a condition. */
    run(seconds, { px = 40, pz = 0, until = null } = {}) {
      const dt = 1 / 60;
      const steps = Math.round(seconds / dt);
      for (let i = 0; i < steps; i++) {
        frame++;
        const x = typeof px === 'function' ? px(frame) : px;
        const z = typeof pz === 'function' ? pz(frame) : pz;
        fight.update(dt, boss, x, z, projectiles, enemies, [], effects);
        if (until && until()) return true;
      }
      return false;
    },
  };
}

test('the wedge telegraph points exactly where the sweep damages', () => {
  // RingGeometry is authored in XY and rotated into XZ, which flips the sign of
  // the Z term. Getting that wrong paints the warning 90 degrees off the hit —
  // a defect a screenshot cannot catch, because both look like a lit wedge.
  const { halfAngleDeg, radius } = FINAL_BOSS.sweep;
  const half = (halfAngleDeg * Math.PI) / 180;
  const geometry = new THREE.RingGeometry(2.4, radius, 36, 1, -half, half * 2);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry);

  for (const aim of [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
    [Math.SQRT1_2, Math.SQRT1_2],
    [-0.6, 0.8],
  ]) {
    mesh.rotation.y = wedgeRotationY(aim[0], aim[1]);
    mesh.updateMatrixWorld(true);
    // The vertex on the wedge's centre line, at its outer edge.
    const centre = new THREE.Vector3(radius, 0, 0).applyMatrix4(mesh.matrixWorld).normalize();
    assert.ok(
      Math.abs(centre.x - aim[0]) < 1e-6 && Math.abs(centre.z - aim[1]) < 1e-6,
      `wedge aimed at (${aim}) drew toward (${centre.x.toFixed(3)}, ${centre.z.toFixed(3)})`,
    );
  }
});

test('the sweep hit rule matches the wedge it draws', () => {
  const { radius, halfAngleDeg } = FINAL_BOSS.sweep;
  const inside = (x, z) => isInsideWedge(x, z, 0, 0, 1, 0, radius, halfAngleDeg);
  assert.equal(inside(10, 0), true, 'straight ahead, inside reach');
  assert.equal(inside(-10, 0), false, 'directly behind the boss');
  assert.equal(inside(radius + 3, 0), false, 'past the drawn edge');
  // Just inside and just outside the drawn half-angle.
  const justIn = (halfAngleDeg - 2) * (Math.PI / 180);
  const justOut = (halfAngleDeg + 2) * (Math.PI / 180);
  assert.equal(inside(Math.cos(justIn) * 10, Math.sin(justIn) * 10), true);
  assert.equal(inside(Math.cos(justOut) * 10, Math.sin(justOut) * 10), false);
});

test('the sweep locks its aim when the telegraph starts, so it can be dodged', () => {
  const h = makeHarness();
  // Stand inside the future wedge until the boss roots to telegraph.
  const rooted = h.run(20, { px: 10, pz: 0, until: () => h.boss.speed === 0 });
  assert.ok(rooted, 'the sweep must telegraph within its first-delay window');
  // Then walk behind it. The aim is already committed to +X.
  h.run(FINAL_BOSS.sweep.telegraphS + 0.2, { px: -10, pz: 0 });
  assert.equal(h.effects.damage.length, 0, 'a dodged sweep must not connect');

  const hit = makeHarness();
  hit.run(20, { px: 10, pz: 0, until: () => hit.boss.speed === 0 });
  hit.run(FINAL_BOSS.sweep.telegraphS + 0.2, { px: 10, pz: 0 });
  assert.equal(hit.effects.damage.length, 1, 'standing in the lit wedge must cost a hit');
  assert.equal(hit.effects.damage[0].amount, FINAL_BOSS.sweep.damage);
});

test('phases escalate by LIFE, announce themselves, and add one verb each', () => {
  const h = makeHarness();
  assert.equal(h.fight.phaseNumber, 1);

  // Phase 1 must not run assembly lines: the escalation is the whole point.
  h.run(30);
  assert.equal(h.enemies.spawned.length, 0, 'phase 1 must not open assembly bays');

  h.boss.hp = h.boss.maxHp * (FINAL_BOSS.phaseThresholds[0] - 0.01);
  h.run(0.1);
  assert.equal(h.fight.phaseNumber, 2);
  assert.deepEqual(h.effects.banners, ['ASSEMBLY LINES ONLINE']);

  // The stagger roots the boss, then hands its speed back.
  assert.equal(h.boss.speed, 0, 'a phase change must stagger the boss');
  h.run(FINAL_BOSS.phaseChange.staggerS + 0.1);
  assert.ok(h.boss.speed > 0, 'the stagger must end');

  h.run(30);
  assert.ok(h.enemies.spawned.length > 0, 'phase 2 must feed reinforcements');
  const reinforcementTypes = new Set(h.enemies.spawned.map((e) => e.typeIndex));
  for (const typeIndex of reinforcementTypes) {
    assert.equal(ENEMY_TYPES[typeIndex].isBoss ?? false, false, 'bays must not spawn bosses');
  }
  // As tough as the swarm they walk into. spawnAt defaults to 1, which at the
  // hardest minute of the run would be a lane of paper enemies.
  for (const spawned of h.enemies.spawned) {
    assert.equal(spawned.hpMultiplier, h.enemies.waveHpMultiplier);
  }

  h.boss.hp = h.boss.maxHp * (FINAL_BOSS.phaseThresholds[1] - 0.01);
  h.run(0.1);
  assert.equal(h.fight.phaseNumber, 3);
  assert.deepEqual(h.effects.banners, ['ASSEMBLY LINES ONLINE', 'CORE OVERLOAD']);
  h.run(FINAL_BOSS.phaseChange.staggerS + 0.1);
  const base = ENEMY_TYPES[FINAL_BOSS_TYPE_INDEX].speed;
  assert.ok(
    Math.abs(h.boss.speed - base * FINAL_BOSS.overload.speedMult) < 1e-9,
    'phase 3 must apply its speed multiplier',
  );
});

test('phase 3 hazard zones erupt in sequence, from the boss outward', () => {
  const h = makeHarness();
  h.boss.hp = h.boss.maxHp * (FINAL_BOSS.phaseThresholds[1] - 0.01);
  h.run(0.1);
  assert.equal(h.fight.phaseNumber, 3);
  // Stand on the first link of the chain: it is aimed along the player bearing
  // and starts FINAL_BOSS.overload.firstDistance out from the body.
  const px = FINAL_BOSS.overload.firstDistance;
  h.run(40, { px, pz: 0 });
  assert.ok(h.effects.damage.length > 0, 'standing on the chain must cost hits');
});

test('reinforcements never fight the spawner for the live cap', () => {
  const h = makeHarness();
  h.boss.hp = h.boss.maxHp * (FINAL_BOSS.phaseThresholds[0] - 0.01);
  h.run(40);
  const spawnedWhileEmpty = h.enemies.spawned.length;
  assert.ok(spawnedWhileEmpty > 0);

  const full = makeHarness();
  full.enemies.activeCount = FINAL_BOSS.assembly.maxActiveBodies;
  full.boss.hp = full.boss.maxHp * (FINAL_BOSS.phaseThresholds[0] - 0.01);
  full.run(40);
  assert.equal(full.enemies.spawned.length, 0, 'a saturated field must not be topped up');
  // And the ceiling has to sit under the spawner's own, or it is decorative.
  assert.ok(FINAL_BOSS.assembly.maxActiveBodies <= ENEMIES.maxActiveEnd);
});

test('one attack lands at a time', () => {
  // The single ground-zone attack this project rejected on sight (Crusher stage
  // C, 2026-08-07) failed because four events shared one frame and the zone was
  // born outside the focus the rest of the frame had grabbed. Nothing here may
  // fire on the same frame as anything else.
  const h = makeHarness();
  h.boss.hp = h.boss.maxHp * (FINAL_BOSS.phaseThresholds[1] - 0.01);
  h.run(0.1);
  h.run(120, { px: 12, pz: 0 });
  const volleys = new Set();
  for (const event of h.events) {
    if (event.kind !== 'projectile') continue;
    volleys.add(event.frame);
  }
  for (const event of h.events) {
    if (event.kind !== 'damage') continue;
    assert.equal(volleys.has(event.frame), false, 'a hit and a volley shared one frame');
  }
});

test('reset leaves no telegraph painted on the floor', () => {
  // A marker outliving its owner is a lie on the ground: the player dodges a
  // hit that will never come, or worse, learns to ignore the warnings.
  const h = makeHarness();
  assert.equal(h.litMarkers(), 0, 'nothing is lit before the fight starts');
  h.boss.hp = h.boss.maxHp * (FINAL_BOSS.phaseThresholds[1] - 0.01);
  h.run(0.1);
  const lit = h.run(60, { px: 12, pz: 0, until: () => h.litMarkers() > 0 });
  assert.ok(lit, 'the fight must paint telegraphs while it runs');
  h.fight.reset();
  assert.equal(h.litMarkers(), 0, 'reset must clear every telegraph');
});

test('every telegraph obeys the ground-marker render rules', async () => {
  // These rules were learned the hard way twice: Three.js draws the WHOLE
  // transparent queue after every opaque mesh, so a transparent marker gets
  // chopped by scenery; material.opacity is ignored outside that queue, so the
  // fade has to be baked into the colour; and renderOrder is not inherited.
  const source = await readFile(new URL('../src/final-boss.ts', import.meta.url), 'utf8');
  assert.match(source, /transparent: !VISUAL\.groundMarkersOnTop/);
  assert.match(source, /depthTest: !VISUAL\.groundMarkersOnTop/);
  assert.match(source, /renderOrder = VISUAL\.renderOrders\.groundMarker/);
  assert.doesNotMatch(source, /material\.opacity\s*=/);
});

test('the arrival cannot touch the player and must fit the frame', () => {
  const cfg = FINAL_BOSS.arrival;
  const contact = ENEMY_TYPES[FINAL_BOSS_TYPE_INDEX].radius + PLAYER.radius;
  assert.ok(cfg.distMin > contact * 2, 'the arrival must be nowhere near a free touch');
  assert.ok(cfg.distMin <= cfg.distMax);
  // The frame, measured — not guessed. The camera sits at (0, 24, 19) looking
  // at the player with a 50 degree vertical fov, so the visible floor is a
  // lopsided quad: deep above the player, shallow below. distMax has to fit
  // inside the SHALLOW half's sibling directions, which is what the projection
  // test in Game.isPointOnScreen enforces at placement time.
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 200);
  camera.position.set(0, CAMERA.offsetY, CAMERA.offsetZ);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const limit = 1 - cfg.screenMargin;
  const inside = (x, y, z) => {
    const ndc = new THREE.Vector3(x, y, z).project(camera);
    return Math.abs(ndc.x) <= limit && Math.abs(ndc.y) <= limit && ndc.z < 1;
  };
  // The whole body BOX, which is the point: the camera looks down, so a boss
  // whose feet are comfortably in frame can still lose its head to the top
  // edge — and a shoulder to the side edge. Measured, not asserted by eye.
  const visible = (x, z) =>
    [-cfg.bodyHalfWidth, 0, cfg.bodyHalfWidth].every(
      (offset) => inside(x + offset, 0, z) && inside(x + offset, cfg.bodyHeight, z),
    );
  assert.ok(inside(0, 0, -15), 'feet 15 units up-screen are well inside the frame');
  assert.equal(inside(0, cfg.bodyHeight, -15), false, 'and the head at that distance is not');

  // Enough of the ring must survive the rule, or the finale would spend its
  // placement budget failing and fall back to a worse spot most of the time.
  for (const [w, h, floor] of [[16, 9, 0.45], [16, 10, 0.3], [4, 3, 0.15]]) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    let hits = 0;
    let total = 0;
    for (let i = 0; i < 360; i++) {
      const a = (i / 360) * Math.PI * 2;
      for (const d of [cfg.distMin, (cfg.distMin + cfg.distMax) / 2, cfg.distMax]) {
        total++;
        if (visible(Math.cos(a) * d, Math.sin(a) * d)) hits++;
      }
    }
    assert.ok(hits / total >= floor, `${w}:${h} leaves only ${((hits / total) * 100).toFixed(0)}% of the ring usable`);
  }
  camera.aspect = 16 / 9;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  // The behaviour this replaced: a fixed +24 on X was off frame at 16:9.
  assert.equal(visible(24, 0), false, 'the old fixed offset was off screen — keep the projection test');
});

test('no single Marshal attack can delete a full-health player', () => {
  // Telegraphed attacks are allowed to cost more than a boss touch (16) —
  // otherwise dodging is not worth doing — but the 2026-07-30 lesson stands:
  // an attack that kills in a couple of hits reads as unfair, not hard.
  for (const damage of [FINAL_BOSS.sweep.damage, FINAL_BOSS.overload.damage, FINAL_BOSS.discharge.projectileDamage]) {
    assert.ok(damage <= PLAYER.maxHp * 0.35, `${damage} is more than a third of a full run`);
  }
  assert.ok(FINAL_BOSS.sweep.damage > BOSS.contactDamage, 'a dodgeable hit must beat a free touch');
  assert.ok(FINAL_BOSS.overload.damage > BOSS.contactDamage);
});

test('phase tables stay aligned with the number of phases', () => {
  const phases = FINAL_BOSS.phaseThresholds.length + 1;
  assert.equal(FINAL_BOSS.discharge.cooldownS.length, phases);
  assert.equal(FINAL_BOSS.sweep.cooldownS.length, phases);
  for (let i = 1; i < FINAL_BOSS.phaseThresholds.length; i++) {
    assert.ok(
      FINAL_BOSS.phaseThresholds[i] < FINAL_BOSS.phaseThresholds[i - 1],
      'thresholds must descend',
    );
  }
  for (const threshold of FINAL_BOSS.phaseThresholds) {
    assert.ok(threshold > 0 && threshold < 1);
  }
  // Each verb tightens as the fight escalates; nothing may get slower.
  for (const table of [FINAL_BOSS.discharge.cooldownS, FINAL_BOSS.sweep.cooldownS]) {
    for (let i = 1; i < table.length; i++) assert.ok(table[i] <= table[i - 1]);
  }
});

test('the finale is presented the way every other boss is', async () => {
  const [bossSource, gameSource] = await Promise.all([
    readFile(new URL('../src/boss.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/game.ts', import.meta.url), 'utf8'),
  ]);
  // Arrival runs the SHARED summon telegraph (strobing beam + warning rings)
  // and flips summonJustBegan, which is what starts the portal-charge sound.
  assert.match(bossSource, /beginFinalArrival\(/);
  assert.match(bossSource, /this\.state = 'summoning';[\s\S]{0,120}this\.summonJustBegan = true;/);
  // ...and the body appears through the same code path as a totem summon, so
  // the AWAKENS banner, the eruption burst, the shock ring and the shake are
  // literally the same beat, never a second implementation that can drift.
  assert.match(bossSource, /this\.finalFight\.begin\(this\.baseSpeed\);/);
  assert.match(gameSource, /summoned\.toUpperCase\(\)\} AWAKENS/);
  // Placement is a projection through the live camera, not a hardcoded radius.
  assert.match(gameSource, /new THREE\.Vector3\(x, y, z\)\.project\(this\.camera\)/);
  assert.match(gameSource, /beginFinalArrival\([\s\S]{0,240}arrivalFrameScore/);
  // ...and it tests the whole body box, not the point under its feet.
  assert.match(gameSource, /\[-bodyHalfWidth, 0, bodyHalfWidth\]/);
  assert.match(gameSource, /for \(const y of \[0, bodyHeight\]\)/);
  // Among the spots that fit, the best-framed one wins rather than the first.
  assert.match(bossSource, /if \(\(score \?\? 0\) > bestScore\)/);
  // And the old fixed offset is gone for good.
  assert.doesNotMatch(bossSource, /spawnDistance/);
});

test('the finale reopens the sector as an arena before the boss arrives', async () => {
  const gameSource = await readFile(new URL('../src/game.ts', import.meta.url), 'utf8');
  // The curtain is the SAME one a sector crossing uses — the project's own
  // lesson is that a world swap has to happen at full black or the cut is seen.
  assert.match(gameSource, /private startFinale\(\): void \{[\s\S]{0,400}this\.beginFinaleArena\(\);/);
  assert.match(gameSource, /if \(mt\.finale\) this\.openFinaleArena\(\);\s*\n\s*else this\.transitionToMap\(mt\.nextMapIndex\);/);
  // ...but it is NOT a crossing: no sector is credited, no map is swapped, and
  // the arc state is untouched. Calling transitionToMap here would pay out a
  // sector the player has not cleared, since the finale kill is what clears it.
  const arena = gameSource.slice(
    gameSource.indexOf('private openFinaleArena'),
    gameSource.indexOf('private tickPendingFinaleArrival'),
  );
  assert.ok(arena.length > 0, 'openFinaleArena must exist');
  assert.doesNotMatch(arena, /enterMap|sectorsCleared|setMap|this\.gold = 0/);
  assert.match(arena, /this\.regenerateProps\(this\.currentMap\.id, FINAL_BOSS\.arena\.clearRadius\)/);
  // The arrival waits for the curtain to lift: a telegraph strobing behind full
  // black is a beat spent on nobody.
  assert.match(gameSource, /if \(mt\.finale\) this\.pendingFinaleArrival = true;/);
  assert.match(gameSource, /private tickPendingFinaleArrival\(\): void \{[\s\S]{0,200}beginFinalArrival\(/);
  // And a failed placement retries the ARRIVAL, never the curtain — otherwise
  // one finale would reset the sector twice.
  assert.doesNotMatch(gameSource, /this\.runFlow\.finaleStarted = false;\s*\n\s*return;/);
});

test('the finale arena leaves room for the whole encounter', () => {
  const { arena, arrival } = FINAL_BOSS;
  const bossRadius = ENEMY_TYPES[FINAL_BOSS_TYPE_INDEX].radius;
  // The cleared circle has to hold the furthest arrival plus the body that
  // lands there plus its breathing room; anything less and the boss can appear
  // with a pillar in its lap on the edge of the "clean" arena.
  assert.ok(
    arena.clearRadius >= arrival.distMax + bossRadius + arrival.clearance,
    `clearRadius ${arena.clearRadius} does not cover an arrival at ${arrival.distMax}`,
  );
  // But not so wide that the foundry stops looking like the foundry: the arena
  // is a square of half-size 90 and its props scatter out to 86.
  assert.ok(arena.clearRadius < 45, 'a centre this empty would erase the map, not stage it');
});

test('both dev keys reach the finale through the real structural trigger', async () => {
  const gameSource = await readFile(new URL('../src/game.ts', import.meta.url), 'utf8');
  const slice = (from, to) =>
    gameSource.slice(gameSource.indexOf(from), gameSource.indexOf(to));
  const wind = slice('private windClockToFinale', 'private installFinaleKey');
  // Winding the map clock makes advanceRunFlow issue its own 'start-finale'.
  // Calling startFinale() directly would test a path players never take, and
  // would drift from the real one the day the trigger changes.
  assert.match(wind, /this\.runFlow\.mapElapsedS = map\.durationS/);

  const transitionKey = slice('private installMapTransitionKey', 'private windClockToFinale');
  const finaleKey = slice('private installFinaleKey', 'private installFatalHitKey');
  for (const [name, body] of [['T', transitionKey], ['Y', finaleKey]]) {
    assert.match(body, /this\.windClockToFinale\(\)/, `the ${name} key must share the one trigger`);
    assert.doesNotMatch(body, /this\.startFinale\(\)/, `the ${name} key must not call startFinale directly`);
  }
  // Y works from anywhere in the arc, and crosses through run-flow's own
  // enterMap rather than assigning mapIndex behind its back.
  assert.match(finaleKey, /const lastMapIndex = MAPS\.length - 1;/);
  assert.match(finaleKey, /enterMap\(this\.runFlow, lastMapIndex\)/);
  assert.match(finaleKey, /this\.fastForwardArcClockPastMap1\(\)/);
  assert.match(gameSource, /if \(DEV_TOOLS\.finaleKey\) this\.installFinaleKey\(\);/);
});

test('the jump-to-finale key cannot ship', async () => {
  // Guardrail 7: no development instrument reaches a paying player. The guard
  // is an explicit list, so a new flag that nobody adds to it ships silently.
  const guard = await readFile(new URL('./check-release-flags.mjs', import.meta.url), 'utf8');
  assert.match(guard, /key: 'finaleKey'/);
});

test('the ambient waves stop once the finale is inbound', async () => {
  const [gameSource, enemySource] = await Promise.all([
    readFile(new URL('../src/game.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/enemies.ts', import.meta.url), 'utf8'),
  ]);
  // Derived from the run flow every frame: a flag that some path forgets to
  // clear would leave a run permanently unable to spawn anything.
  assert.match(gameSource, /this\.enemies\.wavesPaused = this\.runFlow\.finaleStarted;/);
  // Checked BEFORE the wave timer. A paused spawner that kept counting down
  // would dump a full wave the instant it resumed — which, at the foundry's
  // peak, is sixteen bodies landing on top of the boss fight at once.
  const spawner = enemySource.slice(
    enemySource.indexOf('private updateSpawner'),
    enemySource.indexOf('const t = Math.min(difficulty, 1);'),
  );
  const pauseAt = spawner.indexOf('if (this.wavesPaused) return;');
  const timerAt = spawner.indexOf('this.spawnTimer -= dt;');
  assert.ok(pauseAt > 0 && timerAt > 0);
  assert.ok(pauseAt < timerAt, 'the pause must be checked before the wave timer ticks');
  // The boss's OWN reinforcements must not be caught by it: they go through
  // spawnAt, which the spawner pause does not touch.
  const fightSource = await readFile(new URL('../src/final-boss.ts', import.meta.url), 'utf8');
  assert.match(fightSource, /enemies\.spawnAt\(/);
  assert.doesNotMatch(fightSource, /wavesPaused/);
});
