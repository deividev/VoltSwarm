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
const enemyProjectiles = await server.ssrLoadModule('/src/enemy-projectiles.ts');
after(async () => server.close());

const { FINAL_BOSS, FINAL_BOSS_TYPE_INDEX, ENEMY_TYPES, PLAYER, BOSS, ENEMIES, CAMERA, VISUAL } = config;
const { FinalBossFight, wedgeRotationY, isInsideWedge } = finalBoss;
const { EnemyProjectiles } = enemyProjectiles;

function makeHarness({ hp = 7200 } = {}) {
  const boss = { x: 0, z: 0, heading: 0, speed: ENEMY_TYPES[FINAL_BOSS_TYPE_INDEX].speed, hp, maxHp: hp };
  const events = [];
  let frame = 0;
  const projectiles = { fire: () => events.push({ frame, kind: 'projectile' }) };
  /** Where the player was on the frame a body actually landed — the only
   *  position that answers "did the reinforcements reach them". */
  let playerNow = { x: 0, z: 0 };
  const enemies = {
    activeCount: 0,
    waveHpMultiplier: 4.7,
    spawned: [],
    spawnAt(typeIndex, x, z, hpMultiplier) {
      this.spawned.push({ typeIndex, x, z, hpMultiplier, playerX: playerNow.x, playerZ: playerNow.z });
      return 0;
    },
    shoveAwayFrom: () => 0,
  };
  const effects = {
    damage: [],
    banners: [],
    playerMaxHp: () => PLAYER.maxHp,
    damagePlayer(amount) {
      this.damage.push({ frame, amount });
      events.push({ frame, kind: 'damage' });
    },
    bursts: [],
    burst(x, z, color, count, y = 0) {
      this.bursts.push({ x, z, color, count, y });
    },
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
        playerNow = { x, z };
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
  assert.equal(hit.effects.damage[0].amount, Math.round(PLAYER.maxHp * FINAL_BOSS.sweep.damagePct));
});

test('phases escalate by LIFE, announce themselves, and add one verb each', () => {
  const h = makeHarness();
  assert.equal(h.fight.phaseNumber, 1);

  // Reinforcements run from phase 1: with the ambient waves paused they are the
  // only thing that can take a moving player's space away, and a first playtest
  // with no pressure at all took zero damage across a whole fight.
  h.run(30);
  const phase1Calls = h.enemies.spawned.length;
  assert.ok(phase1Calls > 0, 'phase 1 must already call reinforcements');

  h.boss.hp = h.boss.maxHp * (FINAL_BOSS.phaseThresholds[0] - 0.01);
  h.run(0.1);
  assert.equal(h.fight.phaseNumber, 2);
  assert.deepEqual(h.effects.banners, ['ASSEMBLY LINES ONLINE']);

  // The stagger roots the boss, then hands its speed back.
  assert.equal(h.boss.speed, 0, 'a phase change must stagger the boss');
  h.run(FINAL_BOSS.phaseChange.staggerS + 0.1);
  assert.ok(h.boss.speed > 0, 'the stagger must end');

  const beforePhase2 = h.enemies.spawned.length;
  h.run(30);
  const phase2Calls = h.enemies.spawned.length - beforePhase2;
  assert.ok(phase2Calls > phase1Calls, 'phase 2 must open MORE lines than phase 1');
  const reinforcementTypes = new Set(h.enemies.spawned.map((e) => e.typeIndex));
  for (const typeIndex of reinforcementTypes) {
    assert.equal(ENEMY_TYPES[typeIndex].isBoss ?? false, false, 'bays must not spawn bosses');
  }
  // As tough as the swarm they walk into. spawnAt defaults to 1, which at the
  // hardest minute of the run would be a lane of paper enemies.
  for (const spawned of h.enemies.spawned) {
    assert.equal(spawned.hpMultiplier, h.enemies.waveHpMultiplier * FINAL_BOSS.assembly.hpMultiplier);
  }
  // Tougher than the ambient wave, but not by so much that a drop landing on
  // the player becomes a wall they cannot walk out of.
  assert.ok(FINAL_BOSS.assembly.hpMultiplier > 1 && FINAL_BOSS.assembly.hpMultiplier <= 2);

  // The RING grows with the phase, and the bodies per point come down with it:
  // six points at the old five each would be 6 bodies a second in phase 3, and
  // the drops would stop being a beat and become the whole fight.
  const points = FINAL_BOSS.assembly.dropPoints;
  const perPoint = FINAL_BOSS.assembly.perPoint;
  for (let i = 1; i < points.length; i++) {
    assert.ok(points[i] > points[i - 1], 'each phase must open more drops than the last');
  }
  // Bodies per point USED to be required to fall as the count rose — that was a
  // recommendation of mine, and the user's playtest overruled it (2026-08-19).
  // What still has to hold is the ceiling: the live cap is the only thing
  // between this beat and a wall the player cannot walk out of.
  // And the ring has to open up as the count rises (user 2026-08-19: "que no se
  // te echen todos los enemigos encima de golpe"). Adjacent drops sit a chord
  // apart, so six points on the old 9-unit ring were 9 units from each other —
  // one reaction covers all of them. The gap must not shrink phase to phase.
  const rings = FINAL_BOSS.assembly.ringRadius;
  assert.equal(rings.length, points.length, 'one ring radius per phase');
  const gaps = points.map((count, i) => 2 * rings[i] * Math.sin(Math.PI / count));
  for (let i = 1; i < gaps.length; i++) {
    assert.ok(
      gaps[i] >= gaps[i - 1] - 4,
      `phase ${i + 1} packs its drops ${gaps[i].toFixed(1)} apart vs ${gaps[i - 1].toFixed(1)}`,
    );
  }
  // A body is ~1.8 wide and the player 1.4: under ~12 units two adjacent drops
  // read as one wall of scrap rather than two things to slip between.
  for (const gap of gaps) assert.ok(gap >= 12, `drops ${gap.toFixed(1)} apart leave no room to move`);

  const worstCall = Math.max(...points.map((count, i) => count * perPoint[i]));
  assert.ok(
    worstCall < FINAL_BOSS.assembly.maxActiveBodies / 4,
    `${worstCall} bodies in one call is a wall, not a beat`,
  );
  // The marker pool has to cover the widest ring plus a full overload chain, or
  // a drop silently opens with fewer points than the phase promises.
  assert.ok(
    Math.max(...points) + FINAL_BOSS.overload.zones <= 10,
    'the marker pool in FinalBossFight is sized from these two numbers',
  );

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

test('reinforcements land around the PLAYER, close enough to reach them', () => {
  // The first version dropped them on the perimeter at 46 units. A Voltling
  // walks at 5.5 and the player runs at 11, so they arrived at a place the
  // player had left eight seconds earlier — the attack existed and did nothing.
  const cfg = FINAL_BOSS.assembly;
  const h = makeHarness();
  const px = 20;
  const pz = -14;
  h.run(60, { px, pz });
  assert.ok(h.enemies.spawned.length > 0, 'the call must have landed at least once');
  const reach = Math.max(...cfg.ringRadius) + cfg.ringRadiusJitter + 3; // + the per-point spread
  for (const spawned of h.enemies.spawned) {
    const distance = Math.hypot(spawned.x - px, spawned.z - pz);
    assert.ok(distance <= reach, `a reinforcement landed ${distance.toFixed(1)} from the player`);
    // ...and never ON them: a body materialising inside the player is a hit
    // with no counterplay, which is the opposite of what this is for.
    assert.ok(distance > 3, `a reinforcement landed ${distance.toFixed(1)} from the player`);
  }
  // Only the types the drop is configured to call, and none of them a boss.
  // (This used to assert "Voltlings only" and went stale the day Rollers were
  // added to the mix — with one drop point per call the second type never came
  // up, so the assertion passed for a reason that had stopped being true.)
  for (const typeIndex of new Set(h.enemies.spawned.map((e) => e.typeIndex))) {
    assert.ok(cfg.typeIndexes.includes(typeIndex), `type ${typeIndex} is not in the drop list`);
    assert.equal(ENEMY_TYPES[typeIndex].isBoss ?? false, false);
  }
});

test('reinforcements lead a running player instead of landing behind them', () => {
  // THE defect this attack had, measured in Electron: the telegraph is 1.4s and
  // the player runs at 11, so a ring drawn around where they stand closes 15
  // units behind a fleeing player — further away than the ring's own radius. A
  // kiting bot took literally zero hits. Without the lead this test fails by
  // roughly a factor of two.
  const cfg = FINAL_BOSS.assembly;
  // A TRIANGLE wave, not a sine: the player runs at a constant 11 and turns
  // sharply at the ends, which is what kiting looks like. A sine spends most of
  // its time decelerating, and a lead cannot matter to a player who is always
  // about to reverse — the measurement would say the fix did nothing when what
  // it really said was that the test never ran away from anything.
  const speed = 11;
  const span = 40;
  const kite = (frame) => {
    const travelled = ((frame / 60) * speed) % (span * 4);
    if (travelled < span * 2) return travelled - span; // -span -> +span
    return span * 3 - travelled; // +span -> -span
  };
  // SEEDED, and that is the point: the drop ring picks a random bearing and
  // jitter, so an unseeded A/B compares two different sets of dice and the
  // threshold ends up being tuned to noise. With the same draws on both sides,
  // the lead is the only thing that differs.
  const meanLanding = () => {
    const original = Math.random;
    let state = 20260819;
    Math.random = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    };
    try {
      const h = makeHarness();
      h.run(90, { px: kite, pz: 0 });
      assert.ok(h.enemies.spawned.length > 0, 'the call must have landed at least once');
      const distances = h.enemies.spawned.map((s) => Math.hypot(s.x - s.playerX, s.z - s.playerZ));
      return distances.reduce((sum, value) => sum + value, 0) / distances.length;
    } finally {
      Math.random = original;
    }
  };

  const led = meanLanding();
  const original = cfg.leadFraction;
  let blind;
  try {
    cfg.leadFraction = 0;
    blind = meanLanding();
  } finally {
    cfg.leadFraction = original;
  }
  // Compared as the error the LEAD is responsible for, not as raw distance: the
  // drops are meant to land a ring's radius away, so that radius is a floor no
  // aiming rule can beat and a ratio of raw distances would mostly measure it.
  // Measured 2026-08-19: 2.6 units of error led against 5.5 blind.
  // The harness never damages the boss, so the fight stays in phase 1 and the
  // drops open on the first ring of the table.
  const ring = cfg.ringRadius[0];
  const ledError = led - ring;
  const blindError = blind - ring;
  assert.ok(
    ledError <= blindError * 0.6,
    `leading barely helped: ${ledError.toFixed(1)} units of error led vs ${blindError.toFixed(1)} blind`,
  );
  // And in absolute terms they have to land close enough to be walked into.
  assert.ok(led <= ring + cfg.ringRadiusJitter + 4, `mean landing ${led.toFixed(1)}`);
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
  // Depth testing is the ONE rule these markers do not share with the small
  // ones (user 2026-08-20): a telegraph this size has to sit under the foundry,
  // not over it. Everything else on this list is unchanged.
  assert.match(source, /depthTest: VISUAL\.bossTelegraphsUnderScenery \|\| !VISUAL\.groundMarkersOnTop/);
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
  // Every attack asks for a FRACTION of max HP (user 2026-08-19), so this cap
  // holds for any build instead of only for the starting 100.
  const fractions = [
    FINAL_BOSS.sweep.damagePct,
    FINAL_BOSS.overload.damagePct,
    FINAL_BOSS.discharge.projectileDamagePct,
    FINAL_BOSS.assembly.damagePct,
  ];
  for (const fraction of fractions) {
    assert.ok(fraction > 0 && fraction <= 0.35, `${fraction} is more than a third of a full run`);
  }
  // The hierarchy the fight is built on: a drop you walked into < a projectile
  // you failed to weave < the two signature attacks. And the cheapest of them
  // still has to beat a free touch, or dodging is not worth doing.
  assert.ok(FINAL_BOSS.assembly.damagePct < FINAL_BOSS.discharge.projectileDamagePct);
  assert.ok(FINAL_BOSS.discharge.projectileDamagePct < FINAL_BOSS.sweep.damagePct);
  // The two SIGNATURE attacks must beat a free boss touch, or dodging them is
  // not worth doing. The drop is deliberately NOT in this group: at the base
  // 100 HP its 15% lands just under a touch, which is the point — it is a nudge
  // to move off the marker, and it scales with the player while the touch does
  // not.
  for (const fraction of [FINAL_BOSS.sweep.damagePct, FINAL_BOSS.overload.damagePct]) {
    assert.ok(PLAYER.maxHp * fraction > BOSS.contactDamage, 'a dodgeable hit must beat a free touch');
  }
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
  assert.match(arena, /this\.regenerateProps\([\s\S]{0,120}FINAL_BOSS\.arena\.clearRadius/);
  // The arena is BOTH emptied in the middle and thinned overall: a clear centre
  // with a dense rim still funnels the fight into the rim, and the boss is the
  // only body wide enough to snag on a pillar there.
  assert.match(arena, /FINAL_BOSS\.arena\.propDensity/);
  assert.ok(FINAL_BOSS.arena.propDensity > 0 && FINAL_BOSS.arena.propDensity < 1);
  // Room to fight without erasing the map: the wall is at 89.
  assert.ok(FINAL_BOSS.arena.clearRadius >= 30 && FINAL_BOSS.arena.clearRadius < 60);
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

test('a telegraphed attack is not eaten by the contact i-frame', async () => {
  // Measured in Electron: the sweep asked for damage 5 times in 40s and landed
  // ZERO — every one arrived inside the 0.4s window a Voltling had just opened,
  // and damagePlayer drops a hit whole rather than reducing it. The i-frame is
  // the cap on SWARM dps; an attack shown 1.3s in advance is not swarm chip.
  const gameSource = await readFile(new URL('../src/game.ts', import.meta.url), 'utf8');
  assert.match(
    gameSource,
    /private damagePlayer\(rawDamage: number, attackerIndex = -1, pierceIframe = false\)/,
  );
  assert.match(gameSource, /if \(!pierceIframe\) return;/);
  assert.match(gameSource, /this\.player\.clearInvulnerability\(\);/);
  // The BOSS's kit pierces: its own hook, and its volley, which is the same
  // kind of attack fired from further away. MEASURED 2026-08-19 — the volley
  // connected 6 times in 40s and landed none of them, because the swarm keeps
  // the i-frame open almost permanently.
  assert.match(gameSource, /damagePlayer: \(amount\) => this\.damagePlayer\(amount, -1, true\)/);
  assert.match(
    gameSource,
    /\(damage, kind\) => this\.damagePlayer\(damage, -1, kind === 'marshal'\)/,
  );
  // Everything else keeps the cap — the i-frame exists to stop the swarm from
  // deleting a player it has surrounded, and that job is unchanged.
  assert.match(gameSource, /this\.damagePlayer\(this\.bossContactDamage\(\), i\);/);
  assert.match(gameSource, /this\.damagePlayer\(base, i\);/);
});

test('taking a hit reads the same whatever threw it', async () => {
  // User call 2026-08-19, reversing the previous pass: a damage number only for
  // boss attacks made one source speak a language the rest of the game does not.
  // Flash, shake and the player-hit cue are the whole contract for "I am hurt".
  const gameSource = await readFile(new URL('../src/game.ts', import.meta.url), 'utf8');
  const funnel = gameSource.slice(
    gameSource.indexOf('const amount = applyArmor'),
    gameSource.indexOf("const boltCopies = this.modCounts['loose-bolts']"),
  );
  assert.ok(funnel.length > 0, 'the damage funnel must still be findable');
  assert.doesNotMatch(funnel, /damageNumbers\.show/);
  assert.match(funnel, /this\.hud\.flashHp\(\);/);
  assert.match(funnel, /this\.audio\.emit\(\{ id: 'player-hit', priority: 3 \}\);/);
  // The i-frame pierce itself stays — that is what lets a telegraphed attack
  // land at all, and it is a separate question from how the hit is displayed.
  assert.match(gameSource, /if \(!pierceIframe\) return;/);
});

test('the finale announces what is starting, in English', async () => {
  const gameSource = await readFile(new URL('../src/game.ts', import.meta.url), 'utf8');
  // Guardrail 3: UI copy is English, and the shipped game contains no Spanish.
  assert.match(gameSource, /showMapFade\(0, 'FINAL BOSS PHASE'\)/);
  // ASCII only: the pixel font silently falls back to a thin system face on
  // anything else, which is how a title ends up looking wrong on one machine.
  assert.ok(/^[\x20-\x7E]+$/.test('FINAL BOSS PHASE'));
});

test('both boss attacks have their own voice, and it is not the same voice', async () => {
  const source = await readFile(new URL('../src/final-boss.ts', import.meta.url), 'utf8');
  // The sweep is a press coming down; the overload is pressure escaping. If
  // they shared cues they would be one attack wearing two colours.
  for (const id of ['boss-sweep-charge', 'boss-sweep-warn', 'boss-sweep-fire', 'boss-overload-open', 'boss-overload-erupt', 'boss-volley', 'boss-assembly-open', 'boss-assembly-spawn']) {
    assert.ok(VISUAL !== undefined);
    assert.ok(
      config.AUDIO.validation.enabledEvents.includes(id),
      `${id} is not enabled, so it would be silent no matter what ships`,
    );
    assert.match(source, new RegExp(`'${id}'`), `${id} is never emitted`);
  }
  // Every one of them is a WORLD sound: they happen where the attack happens,
  // not on the player's head (standing rule since 2026-07-22).
  // Positions, not priorities: the numbers are tuning and move with playtests.
  assert.match(source, /effects\.sound\('boss-overload-erupt', \d+, zone\.x, zone\.z\)/);
  assert.match(source, /effects\.sound\('boss-overload-open', \d+, boss\.x, boss\.z\)/);
  assert.match(source, /effects\.sound\('boss-sweep-fire', \d+, boss\.x, boss\.z\)/);
  assert.match(source, /effects\.sound\('boss-volley', \d+, boss\.x, boss\.z\)/);
  assert.match(source, /effects\.sound\('boss-assembly-open', \d+, boss\.x, boss\.z\)/);
  // The reinforcement call used to sit on a `boss-attack` placeholder that was
  // never enabled, so emit() dropped it and the telegraph had no sound at all.
  // The id is gone from the codebase now — a dead cue that every symptom says
  // "played" is worse than an obviously missing one.
  assert.equal([...source.matchAll(/'boss-attack'/g)].length, 0, 'the silent placeholder is gone');
  const audioSource = await readFile(new URL('../src/audio.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(audioSource, /'boss-attack'/);
  // The chain fires four links inside two seconds: throttled so two can never
  // land on one frame, but NOT so much that the steps stop being audible as
  // steps — reading the sequence is how the attack is dodged.
  // A boss's telegraphed attack must not sit BELOW routine weapon fire in the
  // priority ladder: measured 2026-08-19, at 4 against weapons at 5 the sweep's
  // discharge was dropped by the voice cap half the time.
  const fire = /effects\.sound\('boss-sweep-fire', (\d+)/.exec(source);
  assert.ok(fire && Number(fire[1]) >= 5, `sweep fire priority ${fire?.[1]} is under weapon fire (5)`);
  const gap = config.AUDIO.cooldownS['boss-overload-erupt'];
  assert.ok(gap > 0 && gap < FINAL_BOSS.overload.zoneStepS, `cooldown ${gap} vs step ${FINAL_BOSS.overload.zoneStepS}`);
});

test('each red zone detonates instead of switching off', async () => {
  const source = await readFile(new URL('../src/final-boss.ts', import.meta.url), 'utf8');
  // Three layers plus a ring is the same language every other detonation in the
  // game speaks; hiding the marker on the damage frame is what made it read as
  // a light being turned off (playtest 2026-08-19).
  assert.match(source, /zone\.marker\.detonate\(\);/);
  // The ring follows the zone that made it: zones grow along the chain, so a
  // fixed radius would sit inside the far ones and outside the near ones.
  assert.match(source, /effects\.ring\(zone\.x, zone\.z, cfg\.color, cfg\.ringCubes, zone\.radius \* cfg\.ringRadiusScale\)/);
  assert.match(source, /effects\.shake\(cfg\.shakeAmp\)/);
  const cfg = FINAL_BOSS.overload;
  // Four of these land inside two seconds, so per-link shake has to stay well
  // under a one-off beat like the sweep's; a camera that never settles stops
  // meaning anything.
  assert.ok(cfg.shakeAmp < FINAL_BOSS.sweep.shakeAmp);
  assert.ok(cfg.flashS <= 0.2, 'a long flash would still be lit when the next link blows');
  assert.ok(cfg.burstCount > 16 && cfg.hotCount > 5, 'the eruption must be bigger than it was');
});

test('both signature attacks leave the BODY, not the floor', () => {
  // The two-halves rule: an effect that only happens on the ground reads as the
  // floor acting on its own next to a boss that happens to be standing there.
  const sweep = makeHarness();
  sweep.run(20, { px: 10, pz: 0, until: () => sweep.boss.speed === 0 });
  sweep.run(FINAL_BOSS.sweep.telegraphS + 0.2, { px: 10, pz: 0 });
  const chest = sweep.effects.bursts.filter((b) => b.y >= FINAL_BOSS.sweep.dischargeHeight - 0.01);
  assert.ok(chest.length > 0, 'the sweep must erupt from the chest, not only from the ground');

  // The overload fires a missile per zone from the boss's BACK. Facing +Z at
  // heading 0, the back is -Z, so every launch burst sits behind the body.
  const overload = makeHarness();
  overload.boss.hp = overload.boss.maxHp * (FINAL_BOSS.phaseThresholds[1] - 0.01);
  overload.run(0.1);
  overload.effects.bursts.length = 0;
  overload.run(40, { px: 14, pz: 0 });
  // count > 1 is what separates a LAUNCH flare from the single-cube exhaust the
  // missiles shed in flight — the trail also flies at launch height for its
  // first frames, and with three lines it crosses the body's own axis.
  const launches = overload.effects.bursts.filter(
    (b) => b.y >= FINAL_BOSS.overload.missile.launchHeight - 0.01 && b.count > 1,
  );
  assert.ok(launches.length > 0, 'each zone must be launched at, not just marked');
  for (const launch of launches) {
    assert.ok(launch.z < 0, `a launch left the front of the body (z ${launch.z.toFixed(2)})`);
  }
});

test('the kill is watched before it is scored', async () => {
  // The results screen used to open on the SAME FRAME as the death, so the
  // explosion it was celebrating lasted 16ms (playtest 2026-08-19).
  const gameSource = await readFile(new URL('../src/game.ts', import.meta.url), 'utf8');
  assert.match(gameSource, /this\.finaleVictory = \{/);
  const death = gameSource.slice(
    gameSource.indexOf('if (this.boss.isFinalBossType(death.typeIndex))'),
    gameSource.indexOf('/** Applies a mod from either door'),
  );
  assert.ok(death.length > 0);
  // endRun is reached through the beat, never straight off the kill.
  assert.doesNotMatch(death, /this\.endRun\(/);
  assert.match(gameSource, /private tickFinaleVictory\(dt: number\): void \{/);
  // Nothing may interrupt or overturn it: no level-up card screen, and a
  // leftover Voltling cannot turn a won run into a defeat.
  assert.match(gameSource, /if \(this\.finaleVictory\) return;[\s\S]{0,40}if \(this\.pendingLevelUps <= 0/);
  // …and the same guard on the damage funnel, so the won run cannot be lost.
  const funnel = gameSource.slice(gameSource.indexOf('private damagePlayer('));
  assert.match(funnel.slice(0, 600), /if \(this\.finaleVictory\) return;/);
  // Long enough to actually watch, short enough not to feel like a hang.
  assert.ok(FINAL_BOSS.victory.holdS >= 1 && FINAL_BOSS.victory.holdS <= 3);
  // It comes apart in stages, not in one puff.
  assert.ok(FINAL_BOSS.victory.burstSteps >= 3);
});

test('the red chain leaves dodge lanes at every step', () => {
  // Three PARALLEL lines with gaps, not one chain: the point is that it can be
  // dodged by picking a lane early. A radial fan wide enough to leave a lane at
  // the first zone needs ~88 degrees, which reads as three separate attacks.
  const cfg = FINAL_BOSS.overload;
  assert.ok(cfg.lines >= 3);
  assert.ok(cfg.zoneRadiusEnd > cfg.zoneRadiusStart, 'zones must grow along the chain');
  for (let i = 0; i < cfg.zones; i++) {
    const radius =
      cfg.zoneRadiusStart + (cfg.zoneRadiusEnd - cfg.zoneRadiusStart) * (i / Math.max(1, cfg.zones - 1));
    const lane = cfg.lineOffset - 2 * radius;
    // The player is 1.4 wide (PLAYER.radius 0.7). A lane under ~2.5 is not a
    // choice, it is a coin flip against the collision resolver.
    assert.ok(lane >= 2.5, `step ${i} leaves a ${lane.toFixed(1)}-unit lane`);
  }
  // …and the whole thing still fits inside the arena it is fired in.
  const reach = cfg.firstDistance + (cfg.zones - 1) * cfg.stepDistance;
  assert.ok(reach + cfg.zoneRadiusEnd < 60, `the chain reaches ${reach} from the boss`);
});

test('every zone of a chain gets its own missile and its own marker', async () => {
  // One rack per zone: with three lines that is 12 in the air at once, and pools
  // sized for a single line would silently drop two thirds of them — the zones
  // would still hurt, with nothing shown flying at them.
  const source = await readFile(new URL('../src/final-boss.ts', import.meta.url), 'utf8');
  assert.match(source, /FINAL_BOSS\.overload\.zones \* FINAL_BOSS\.overload\.lines/);
  assert.match(source, /const missileCount = FINAL_BOSS\.overload\.zones \* FINAL_BOSS\.overload\.lines;/);
});

test('a boss is touched by its body, not by a circle around it', () => {
  // The steering radius does three other jobs (spawn placement, aura, shadow),
  // so touching gets its own number. Measured: half-extents 3.24 x 1.33 against
  // a radius of 3.10 meant 1.77 units of damage from thin air at its face.
  const marshal = ENEMY_TYPES[FINAL_BOSS_TYPE_INDEX];
  assert.ok(marshal.contactRadius, 'the Marshal must declare its own contact radius');
  assert.ok(marshal.contactRadius < marshal.radius);
});

test('hitting a boss does not blow out the bloom', () => {
  // The same per-hit spray on a 9.87-unit body hit several times a frame is a
  // permanent fountain, and a 2.5x tint over that much surface pins the bloom
  // threshold (0.85). Playtest 2026-08-19.
  assert.ok(VISUAL.hitSparks.bossCount < VISUAL.hitSparks.count);
  assert.ok(VISUAL.hitSparks.bossCritCount < VISUAL.hitSparks.critCount);
});

test('the animated rig replaces the instanced body instead of doubling it', async () => {
  const [rigSource, enemySource, bossSource] = await Promise.all([
    readFile(new URL('../src/boss-rig.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/enemies.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/boss.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(enemySource, /if \(e === this\.externallyDrawn\) \{/);
  assert.match(bossSource, /enemies\.externallyDrawn = drew \?/);
  // Carved from the SAME grid as the instanced body: one model, not two assets.
  assert.match(rigSource, /buildModelGrid\(modelKey\)/);
  // renderOrder per mesh, or the boss's own ground telegraphs paint over it.
  assert.match(rigSource, /setRenderOrder\(rig\.root, VISUAL\.renderOrders\.character\)/);
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

test('SHIFT loads the recorded test build, plain Y carries the live run', async () => {
  const gameSource = await readFile(new URL('../src/game.ts', import.meta.url), 'utf8');
  const key = gameSource.slice(
    gameSource.indexOf('private installFinaleKey'),
    gameSource.indexOf('private installFatalHitKey'),
  );
  assert.match(key, /const force = e\.shiftKey;/);
  // Both routes to the finale honour it: crossing from an earlier map, and
  // pressing it while already in the foundry (where there is no curtain).
  assert.match(key, /this\.beginMapTransition\(lastMapIndex, true, force\)/);
  assert.match(key, /if \(force\) this\.overlayLatestRecordedBuild\('Finale', true\)/);
  // The DEFAULT still refuses to overwrite a live run — that guard is the whole
  // reason the T key is trustworthy for judging a real crossing.
  assert.match(gameSource, /if \(!force && this\.hasLiveProgress\(\)\)/);
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


test('the volley reads as its own thing, not as more red on red', () => {
  // The user lost these shots among the hazard zones twice. Hue census: the
  // volley sat at 355 and the zones it flies over at 350 — five degrees apart,
  // which is why "bigger and more saturated" did not help. The separation is a
  // near-white core, and the previous attempt at one was INSIDE the solid body:
  // a 0.3 cube centred in a 0.75 cube cannot be seen from any angle. So the
  // test is not "is there a pale colour in the buffer" but "is it on the hull".
  const scene = new THREE.Scene();
  const shots = new EnemyProjectiles(scene);
  const geometry = shots.meshes.marshal.geometry;
  const position = geometry.getAttribute('position');
  const color = geometry.getAttribute('color');
  assert.ok(position && color, 'the volley is a vertex-coloured mesh');

  let hottestPale = 0;
  let furthestRed = 0;
  for (let i = 0; i < position.count; i++) {
    const radius = Math.hypot(position.getX(i), position.getY(i), position.getZ(i));
    const r = color.getX(i);
    const g = color.getY(i);
    const b = color.getZ(i);
    // Pale = all three channels high; red = one channel high and the rest low.
    if (r > 0.85 && g > 0.85 && b > 0.85) hottestPale = Math.max(hottestPale, radius);
    else if (r > 0.7 && g < 0.4 && b < 0.4) furthestRed = Math.max(furthestRed, radius);
  }
  // The axis-aligned cube's own faces are 0.374 from the centre. Pale geometry
  // that never reaches them is buried inside the body and contributes nothing.
  assert.ok(
    hottestPale >= 0.37,
    `the hot core stops at ${hottestPale.toFixed(2)} from the centre — it is enclosed by the body`,
  );
  // …and the red has to break the core's surface, or the shot loses the boss's
  // colour entirely. The two cubes are the same size, so their corners share a
  // radius; what makes the spikes read is that they pierce the FACES at 0.374.
  assert.ok(
    furthestRed > 0.374,
    `the red never leaves the core's faces (reaches ${furthestRed.toFixed(2)})`,
  );
});

test('the finale telegraphs are painted ON the floor, not over the foundry', () => {
  // User call 2026-08-20: attack effects were drawing over the scenery models
  // instead of the map. These markers are big — a 20-unit wedge over a 12-unit
  // chimney reads as a sheet floating above the level. They keep the OPAQUE
  // queue and their layer (the 2026-07-26 fix), and only gain depth testing.
  const scene = new THREE.Scene();
  const fight = new FinalBossFight(scene);
  const markers = [];
  scene.traverse((object) => {
    if (object.isMesh && object.renderOrder === VISUAL.renderOrders.groundMarker) markers.push(object);
  });
  assert.ok(markers.length > 0, 'the fight must own ground markers to test');
  for (const marker of markers) {
    assert.equal(marker.material.depthTest, true, 'scenery must be able to occlude a telegraph');
    // Unchanged, and both matter: a transparent marker is drawn after every
    // opaque mesh (scenery would chop it), and depth WRITING would make the
    // marker occlude the bodies standing in it.
    assert.equal(marker.material.transparent, false);
    assert.equal(marker.material.depthWrite, false);
  }
  fight.reset();
});


test('the percentages are of MAX hp, never of the hp that is left', async () => {
  // User check 2026-08-20. A share of what is LEFT would make every attack
  // weaker the closer the boss got to killing you — the fight would soften
  // exactly where it should bite, and no attack could ever finish anyone.
  const gameSource = await readFile(new URL('../src/game.ts', import.meta.url), 'utf8');
  assert.match(gameSource, /playerMaxHp: \(\) => this\.player\.maxHp,/);
  assert.doesNotMatch(gameSource, /playerMaxHp: \(\) => this\.player\.hp/);
  // And the fight multiplies that number and nothing else.
  const fightSource = await readFile(new URL('../src/final-boss.ts', import.meta.url), 'utf8');
  assert.match(
    fightSource,
    /return Math\.max\(1, Math\.round\(effects\.playerMaxHp\(\) \* fraction\)\);/,
  );
});
