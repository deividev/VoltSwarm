// Central tuning table for the whole run. Every gameplay number lives here so
// balancing passes never require touching system code.

export const ARENA_HALF_SIZE = 90;

export const RUN_DURATION_S = 10 * 60;

/** Map-1 tactical prop: shipping-container chokepoints. Each gate is a pair
 *  of containers forming a wall with an opening — a subtle funnel; user
 *  picked "sutil" over "moderado"/"denso" (2026-07-06): few large funnels,
 *  swarm stays visible almost all the time. `gapHalf` is half the opening
 *  between the two containers' inner ends (shared by every gate; position
 *  and facing are randomized per run — see `world.ts:buildContainerProps`,
 *  user request 2026-07-06: different count/layout every playthrough). */
export const CONTAINER_PROP = {
  /** Approx world footprint of the voxel model (front width / side length
   *  in voxels × voxelSize) — sizes the primitive placeholder shown before
   *  the async voxel model loads. Long axis is Z (side-sheet depth). */
  width: 3.1,
  height: 3.0,
  length: 6.0,
  /** Capsule-approx collision: circles spaced along the long axis. */
  colliderRadius: 1.6,
  colliderOffsets: [-2.1, 0, 2.1],
  gapHalf: 2.6,
  /** Random gate count per run, inclusive — raised ~30% from [10,14]
   *  (2026-07-08, user request) after area-uniform scatter fixed the
   *  center-heavy distribution, so extra gates now land in the sparse ring. */
  countRange: [13, 17] as [number, number],
  /** Keep clear of the arena center (player spawn) and the outer edge. */
  minDistFromCenter: 18,
  maxDistFromCenter: ARENA_HALF_SIZE - 10,
  /** Minimum distance between gate centers so two funnels never overlap.
   *  Lowered from 22 to fit the higher count comfortably around the ring. */
  minSeparation: 18,
  /** Clearance kept from the boss totem (placed independently per run in
   *  boss.ts) — a gate must never wall off the totem's summon zone. */
  totemClearance: 10,
  /** Color variants (2026-07-06 user request) — same model, different
   *  registry palette, so the map doesn't read as the same object repeated.
   *  world.ts picks one at random per gate. */
  variants: ['container', 'container-orange', 'container-mauve'] as const,
};

/** Map-1 tactical prop: steel scaffold towers — deliberate CONTRAST to the
 *  container (2026-07-06 user pick): a see-through X-braced lattice landmark
 *  instead of a solid wall, so the swarm stays visible through it. Placed as
 *  single landmarks (not chokepoint gates) away from the container gates. */
export const SCAFFOLD_PROP = {
  /** Pulled from the map 2026-07-06 (user didn't like the read after two
   *  retint/rescale passes) — kept configured, just not spawned for now. */
  enabled: false,
  /** Approx world footprint of the voxel model — sizes the placeholder. */
  width: 1.4,
  height: 3.4,
  /** Non-uniform X/Z stretch (height untouched) — user playtest 2026-07-06
   *  felt the tower read too thin/narrow next to the container; depth was
   *  added in a second pass so the proportions read right from every angle,
   *  not just widened front-on. */
  widthScale: 1.4,
  depthScale: 1.6,
  /** Thin single-post collider: presence, not a real blocker. */
  colliderRadius: 0.6,
  placements: [
    { x: 0, z: 34, rotationY: 0 },
    { x: 40, z: -22, rotationY: Math.PI / 3 },
    { x: -36, z: -8, rotationY: -Math.PI / 5 },
  ],
};

/** Map-1 prop (docs/PROMPTS_IMAGENES.md §7): industrial drums. Bigger and
 *  with a collider (2026-07-06 user request) — small obstacle, not a
 *  chokepoint gate, so count/position are randomized per run just like the
 *  containers (same request: more of both, different every playthrough). */
export const BARREL_PROP = {
  width: 1.3,
  height: 1.5,
  colliderRadius: 0.55,
  /** Random count per run, inclusive — raised ~30% from [45,65]
   *  (2026-07-08, user request) alongside the area-uniform scatter fix. */
  countRange: [60, 85] as [number, number],
  minDistFromCenter: 8,
  maxDistFromCenter: ARENA_HALF_SIZE - 4,
  /** Minimum distance between barrels. */
  minSeparation: 4,
  /** Clearance kept from a container gate's center — bigger than
   *  minSeparation because a gate's real footprint (2 containers + the
   *  opening) extends well past its center point. */
  containerClearance: 10,
  /** Clearance kept from the boss totem. */
  totemClearance: 8,
  /** Color variants (2026-07-06 user request) — same model, different
   *  registry palette. world.ts picks one at random per drum. Skipped blue:
   *  the scaffold's blue-gray steel already blended into the cool factory
   *  floor palette (same lesson, not repeating the mistake). */
  variants: ['barrel', 'barrel-black', 'barrel-white'] as const,
};

export const PLAYER = {
  maxHp: 100,
  moveSpeed: 11,
  radius: 0.7,
  contactDamage: 8,
  /** I-frame window after each hit. This CAPS swarm DPS at contactDamage /
   *  invulnAfterHitS — the real difficulty dial for deep-swarm diving.
   *  0.85 → 0.4 (2026-07-05 playtest: crowds couldn't threaten a full run;
   *  next candidate if still soft: contactDamage). */
  invulnAfterHitS: 0.4,
  /** Seconds between passive regen ticks; each tick heals `stats.regen` HP. */
  regenTickS: 5,
  /** Shield charges: each blocks one full hit; one charge returns per interval. */
  maxShieldCharges: 3,
  shieldRegenS: 8,
  /** Minimum seconds between lifesteal heals. Caps sustain at ~3 HP/s no
   *  matter how many enemies an AoE weapon hits per second — without this,
   *  lifesteal builds outheal contact damage inside the swarm. */
  lifestealCooldownS: 0.35,
  /** Walk-cycle micro-animation (Crossy Road-style hop): bob + body rock. */
  walkBobHz: 3.2,
  walkBobAmplitude: 0.09,
  walkRockAmplitude: 0.06,
};

/** Follow-camera offset from the player. (0, 24, 19) ≈ 52° pitch — tilted
 *  from the original (0, 27, 15) ≈ 61° so enemy faces read on screen while
 *  the swarm stays legible. */
export const CAMERA = {
  offsetY: 24,
  offsetZ: 19,
};

/** Post-processing. Bloom is threshold-based: only emissive unlit materials
 *  (beams, rings, orbs, projectiles, shield plates) exceed it; lit bodies
 *  stay below and never glow. Validate 60 FPS with 400+ enemies whenever
 *  these change. */
export const VISUAL = {
  bloom: {
    enabled: true,
    strength: 0.55,
    radius: 0.35,
    threshold: 0.85,
  },
  /** Sky: vertical gradient background (night navy up top, a hint of cyan
   *  at the horizon) replacing the flat clear color; fog blends into the
   *  horizon color. */
  sky: {
    enabled: true,
    topColor: 0x0e1219,
    horizonColor: 0x1c2a38,
  },
  /** Vignette: soft corner darkening after bloom — centers the eye. */
  vignette: {
    enabled: true,
    /** 0 = none; ~0.4 = subtle. */
    darkness: 0.38,
    /** Radius where darkening starts (1 = screen edge). */
    offset: 1.05,
  },
  /** Dev instrument: live FPS readout, bottom-right corner. */
  showFps: true,
  /** Toon shading: quantizes lighting into hard steps on every lit entity
   *  (bots, player, props, crates) — the painted-toy look. */
  toon: {
    enabled: true,
    steps: 3,
  },
  /** Map-1 ground: procedural canvas texture — plate tiles with seams, wear
   *  blobs and muted paint stains. Deterministic (seeded). */
  ground: {
    textureSize: 2048,
    tiles: 72,
    wearBlobs: 46,
    paintStains: 22,
    scuffs: 170,
    /** Map 1 factory floor: AI-generated top-down panel texture (2026-07-06),
     *  tiled via RepeatWrapping across the arena. worldSizePerRepeat is how
     *  many world units one texture repeat covers — tune so plates read at
     *  a similar scale to the voxel bots (~1u tall). Falls back to the
     *  procedural canvas texture above if the image fails to load. */
    aiTextureUrl: '/assets/2d/ground-factory-floor.png',
    worldSizePerRepeat: 18,
  },
  /** Enemy walk wobble: side-to-side rock while chasing (Crossy Road-style
   *  life). Phase offset per pool slot so the swarm never rocks in sync.
   *  DISABLED by user decision (2026-07-05) — didn't feel right in playtest;
   *  revisit after the weapon-VFX pass before deciding to keep or delete. */
  enemyWobble: {
    enabled: false,
    hz: 3.4,
    rockRad: 0.07,
  },
  /** Screen shake (in world units at the camera): a small kick when the
   *  player takes real damage, a bigger one when a boss dies. Sparingly —
   *  it seasons, it must never nauseate. */
  screenShake: {
    enabled: true,
    hitAmp: 0.22,
    bossKillAmp: 0.55,
    /** Exponential decay rate per second. */
    decayPerS: 7,
  },
  /** Death burst: voxel cubes in the victim's color that pop and fall —
   *  the kill juice. One InstancedMesh pool; oldest particle recycles. */
  deathBurst: {
    enabled: true,
    capacity: 512,
    particlesPerKill: 7,
    particlesPerBossKill: 26,
    cubeSize: 0.16,
    horizontalSpeed: 5.5,
    upwardSpeed: 6,
    gravity: 18,
    lifeS: 0.6,
  },
  /** Blob shadows: one dark disc under every entity, anchoring it to the
   *  ground. Radius multiplies the entity's collision radius. */
  blobShadow: {
    enabled: true,
    opacity: 0.32,
    radiusScale: 1.2,
    y: 0.04,
  },
};

export type EnemyBehavior = 'chase' | 'roller' | 'gunner' | 'flyer';

export interface EnemyTypeDef {
  name: string;
  behavior: EnemyBehavior;
  hp: number;
  speed: number;
  scale: number;
  radius: number;
  xp: number;
  color: number;
  /** Run time (seconds) at which this type joins the spawn pool. */
  unlockAtS: number;
  /** Relative spawn weight once unlocked. */
  weight: number;
  /** Instance budget for this type's InstancedMesh. */
  capacity: number;
}

// Base HP carries the +20% tuning pass from the 2026-07-02 playtest ("too easy").
export const ENEMY_TYPES: EnemyTypeDef[] = [
  {
    name: 'Voltling',
    behavior: 'chase',
    hp: 15,
    speed: 5.5,
    scale: 0.9,
    radius: 0.55,
    xp: 1,
    color: 0xffb400,
    unlockAtS: 0,
    weight: 10,
    capacity: 288,
  },
  {
    name: 'Sparkrunner',
    behavior: 'chase',
    hp: 26,
    speed: 8,
    scale: 1.1,
    radius: 0.6,
    xp: 3,
    color: 0x2ee6de,
    unlockAtS: 120,
    weight: 4,
    capacity: 112,
  },
  {
    name: 'Rustbrute',
    behavior: 'chase',
    hp: 96,
    speed: 2.6,
    scale: 1.8,
    radius: 1.15,
    xp: 6,
    color: 0xff4433,
    unlockAtS: 240,
    weight: 2,
    capacity: 56,
  },
  {
    name: 'Roller',
    behavior: 'roller',
    hp: 34,
    speed: 7.5,
    scale: 1.1,
    radius: 0.7,
    xp: 4,
    color: 0xb069ff,
    unlockAtS: 240,
    weight: 2,
    capacity: 40,
  },
  // Gunners and drones carry the late-game pressure: projectiles ignore
  // knockback walls and flyers ignore separation — the counters to CC builds.
  {
    name: 'Gunner',
    behavior: 'gunner',
    hp: 40,
    speed: 4,
    scale: 1.2,
    radius: 0.65,
    xp: 5,
    color: 0x7dd94a,
    unlockAtS: 300,
    weight: 4,
    capacity: 48,
  },
  {
    name: 'Drone',
    behavior: 'flyer',
    hp: 20,
    speed: 6.5,
    scale: 1.0,
    radius: 0.6,
    xp: 4,
    color: 0xff9de2,
    unlockAtS: 360,
    weight: 3,
    capacity: 56,
  },
  // Bosses: weight 0 keeps them out of the wave spawner; the totem summons
  // them via EnemySystem.spawnAt. Living in the enemy pool means every weapon
  // targets and damages them with zero special-casing.
  // Boss scale rule: a boss must dwarf even the largest elite (elite brute =
  // 1.8 x 1.35 = 2.43) so the visual hierarchy is never ambiguous.
  {
    name: 'Crusher King',
    behavior: 'chase',
    hp: 2600,
    speed: 3,
    scale: 4.6,
    radius: 2.9,
    xp: 120,
    color: 0xff4433,
    unlockAtS: Infinity,
    weight: 0,
    capacity: 1,
  },
  {
    name: 'Tesla Titan',
    behavior: 'gunner',
    hp: 2200,
    speed: 2.4,
    scale: 4.2,
    radius: 2.5,
    xp: 120,
    color: 0x2ee6de,
    unlockAtS: Infinity,
    weight: 0,
    capacity: 1,
  },
];

/** Pool indexes of the summonable bosses (must match ENEMY_TYPES order). */
export const BOSS_TYPE_INDEXES = [6, 7];

export const ENEMIES = {
  spawnRingMin: 32,
  spawnRingMax: 44,
  /** Seconds between spawn waves at difficulty 0 and 1. */
  waveIntervalStartS: 2.8,
  waveIntervalEndS: 0.65,
  /** Enemies per wave at difficulty 0 and 1. */
  waveSizeStart: 3,
  waveSizeEnd: 16,
  /** HP multiplier gained per minute of run time (linear ramp). */
  hpRampPerMinute: 0.38,
  /** Spatial-grid cell size for the separation pass. */
  separationCellSize: 2.6,
  /** Concurrent-enemy cap at difficulty 0 and 1: waves pause while the field
   *  is saturated, so early builds are never drowned by sheer population. */
  maxActiveStart: 28,
  maxActiveEnd: 380,
};

export const ROLLER = {
  /** Radians/second of steering — low enough that it overshoots the player. */
  turnRate: 1.1,
  /** Speed multiplier while charging past its committed line. Peak speed must
   *  stay below the player's base move speed so sidestepping always works. */
  chargeSpeedMultiplier: 1.25,
};

export const GUNNER = {
  preferredDist: 12,
  retreatDist: 9,
  shootCooldownS: 3,
  projectileSpeed: 12,
  projectileDamage: 10,
  projectileRadius: 0.35,
  projectileLifetimeS: 4,
  maxProjectiles: 64,
};

export const FLYER = {
  hoverHeight: 2.6,
  bobAmplitude: 0.4,
};

export const ELITES = {
  /** Elite chance ramps with the unified difficulty scalar. */
  chanceAtMaxDifficulty: 0.05,
  minRunTimeS: 240,
  /** Kept modest on purpose: elites must never approach boss silhouette size. */
  scaleMultiplier: 1.35,
  hpMultiplier: 6,
  xpMultiplier: 6,
  /** Magenta tint applied through instanceColor. */
  tint: 0xdd55ff,
  /** Behaviors that can roll elite. */
  behaviors: ['chase', 'roller'] as EnemyBehavior[],
};

export const XP_ORBS = {
  maxCount: 320,
  /** Orbs closer than this merge their value into one. */
  mergeRadius: 1.6,
  collectRadius: 0.8,
  flySpeed: 22,
  orbRadius: 0.28,
};

export const WEAPONS = {
  // Per-level damage is generous on purpose: the build caps at 2 weapons, so
  // depth (weapon levels) must carry the scaling that breadth cannot.
  bolt: {
    cooldownS: 0.75,
    damage: 12,
    speed: 34,
    range: 26,
    projectileRadius: 0.25,
    maxProjectiles: 128,
    lifetimeS: 1.4,
    /** Extra projectiles gained at these weapon levels. */
    projectilePerLevels: 2,
    damagePerLevel: 4,
    /** Hit-test radius multiplier (scaled by stats.area) for target search. */
    hitRadius: 1.0,
  },
  pulse: {
    cooldownS: 2.4,
    damage: 10,
    radius: 6,
    radiusPerLevel: 0.8,
    damagePerLevel: 6,
  },
  blades: {
    orbitRadius: 3.4,
    rotationSpeed: 2.6,
    damage: 12,
    bladeRadius: 0.7,
    hitCooldownS: 0.5,
    maxBlades: 6,
    damagePerLevel: 6,
  },
  welder: {
    range: 14,
    /** Damage per tick at ramp 0. */
    damage: 4,
    tickS: 0.25,
    /** Damage multiplier gained per second locked on the same target. */
    rampPerSecond: 0.5,
    rampCap: 4,
    rampPerLevel: 0.25,
    damagePerLevel: 2.5,
  },
  press: {
    cooldownS: 1.8,
    damage: 24,
    /** Crush zone in front of the player (length x width). */
    length: 5,
    width: 3.5,
    widthPerLevel: 0.7,
    damagePerLevel: 12,
  },
  tire: {
    cooldownS: 3.2,
    damage: 18,
    speed: 18,
    radius: 0.8,
    lifetimeS: 2.6,
    maxTires: 12,
    damagePerLevel: 8,
    /** Extra tires thrown at these weapon levels. */
    tirePerLevels: 2,
    /** Max distance to search for an aim target when launching. */
    targetRange: 40,
  },
  // Control weapon: zero damage, pure slow — BY DESIGN. Its damage arrives
  // when the future Spark Plug weapon ignites the puddles (see
  // docs/DESIGN_MEJORAS.md); a self-damaging oil would cheapen that synergy.
  oil: {
    dropIntervalS: 0.45,
    puddleLifeS: 4,
    puddleRadius: 1.7,
    radiusPerLevel: 0.3,
    slowFactor: 0.55,
    slowFactorPerLevel: -0.06,
    slowDurationS: 1.0,
    maxPuddles: 24,
  },
  acid: {
    cooldownS: 3.5,
    zoneRadius: 3,
    radiusPerLevel: 0.4,
    zoneLifeS: 3,
    dotDps: 10,
    dotDurationS: 2,
    dpsPerLevel: 4,
    maxZones: 6,
    /** Max distance to search for a target zone location. */
    targetRange: 20,
  },
  turbine: {
    cooldownS: 4,
    damage: 8,
    speed: 10,
    radius: 2.2,
    lifetimeS: 2.2,
    knockbackForce: 12,
    maxTornadoes: 6,
    damagePerLevel: 4,
    /** Max distance to search for a launch target. */
    targetRange: 30,
  },
  ricochet: {
    cooldownS: 1.1,
    damage: 14,
    speed: 26,
    bounces: 3,
    /** Extra bounce gained at these weapon levels. */
    bouncePerLevels: 2,
    bounceRange: 9,
    damagePerLevel: 5,
    maxProjectiles: 32,
    hitRadius: 0.9,
    /** Max distance to search for a launch target. */
    targetRange: 22,
    /** Distance from the player at which an unfired shot despawns. */
    despawnDist: 60,
  },
  // Twist weapon: heavy single-target claw that EXECUTES low-HP enemies.
  dismantler: {
    cooldownS: 1.6,
    damage: 30,
    range: 12,
    executeThreshold: 0.15,
    thresholdPerLevel: 0.02,
    damagePerLevel: 12,
  },
};

/** Status effects: the layer that unlocks control weapons. */
export const STATUS = {
  dotTickS: 0.5,
  /** Knockback velocity decays by this factor per second. */
  knockbackDecay: 6,
};

export type WeaponId =
  | 'bolt'
  | 'pulse'
  | 'blades'
  | 'welder'
  | 'press'
  | 'tire'
  | 'oil'
  | 'acid'
  | 'turbine'
  | 'ricochet'
  | 'dismantler';

export const WEAPON_INFO: Record<WeaponId, { title: string; description: string }> = {
  bolt: { title: 'Bolt Cannon', description: 'Fires bolts at the nearest enemy.' },
  pulse: { title: 'Volt Pulse', description: 'Periodic shockwave around you.' },
  blades: { title: 'Orbital Blades', description: 'Blades orbit you, damaging on contact.' },
  welder: {
    title: 'Arc Welder',
    description: 'Continuous beam. Damage ramps up while locked on the same target.',
  },
  press: {
    title: 'Hydraulic Press',
    description: 'Crushes a lane toward the nearest enemy.',
  },
  tire: { title: 'Tire Fire', description: 'Burning tires roll in a line through everything.' },
  oil: {
    title: 'Oil Sprayer',
    description: 'Leaves oil puddles behind you that slow the swarm. No damage — pure control.',
  },
  acid: {
    title: 'Acid Drum',
    description: 'Lobs drums that burst into a corrosive zone, melting enemies over time.',
  },
  turbine: {
    title: 'Turbine Fan',
    description: 'Launches tornadoes that shove the swarm away.',
  },
  ricochet: {
    title: 'Junk Ricochet',
    description: 'Charged scrap chunks that bounce between enemies.',
  },
  dismantler: {
    title: 'Dismantler',
    description: 'Heavy claw strike. Instantly executes enemies below 15% HP.',
  },
};

export const MAX_WEAPON_LEVEL = 5;

export const PICKUPS = {
  spawnIntervalS: 20,
  maxActive: 6,
  spawnDistMin: 14,
  spawnDistMax: 30,
  collectRadius: 1.5,
  frenzyDurationS: 10,
  frenzyDamageMultiplier: 2,
  hasteDurationS: 8,
  hasteSpeedMultiplier: 1.5,
  healFraction: 0.4,
  xpCacheFraction: 0.5,
  /** General-stat chest rewards (Megabonk-style globals). */
  luckPerChest: 10,
  areaPerChest: 0.1,
  cursedDifficultyPerChest: 0.12,
  cursedXpPerChest: 0.2,
};

export const BOSS = {
  totemDistMin: 45,
  totemDistMax: 65,
  /** Radius of the summon zone; inside it the key prompt shows. */
  totemActivateRadius: 4.5,
  summonKey: 'KeyE',
  summonKeyLabel: 'E',
  /** Delay between pressing the summon key and the boss appearing (the totem
   *  spins up as the telegraph), and the minimum distance from the player at
   *  which the boss materializes — never on top of them. */
  summonDelayS: 2.5,
  spawnMinDistFromPlayer: 14,
  /** The run continues after a boss kill: a new totem rises after this delay
   *  and each successive boss gets tougher. Chests dropped per boss kill. */
  respawnDelayS: 25,
  respawnHpGrowth: 1.6,
  chestsOnKill: 3,
  /** Chests spawn wherever the boss happens to die — a position that can't
   *  be known in advance, so unlike containers/barrels/totem it can't be
   *  avoided ahead of time. Instead, `world.ts:findClearSpot` nudges each
   *  chest away from any obstacle it lands inside of (2026-07-06 user ask:
   *  chests shouldn't spawn overlapping props). */
  chestClearMargin: 0.6,
  contactDamage: 25,
  crusher: {
    speed: 3,
    chargeTelegraphS: 0.9,
    chargeSpeed: 22,
    chargeDurationS: 0.9,
    chargeCooldownS: 6,
    minionIntervalS: 10,
    minionCount: 4,
  },
  tesla: {
    speed: 2.4,
    preferredDist: 10,
    burstCooldownS: 4,
    burstProjectiles: 12,
    projectileSpeed: 10,
    projectileDamage: 14,
  },
};

/** XP required to go from `level` to `level + 1`. Cheap early levels keep the
 *  card cadence high while the build is weak; the exponent bites late so a
 *  10-minute run lands around level ~25-30, not 40+. */
export function xpForLevel(level: number): number {
  return Math.floor(4 + level * 2.5 + Math.pow(level, 1.4));
}

/**
 * Unified difficulty scalar in [0, 1+], the single knob driving spawns, HP and
 * elites: time ramp x (1 + cursed bonus from chests/cards).
 */
export function difficultyScalar(elapsedS: number, cursedBonus: number): number {
  const timeRamp = Math.min(elapsedS / 480, 1);
  return Math.min(timeRamp * (1 + cursedBonus) + cursedBonus * 0.15, 1.6);
}
