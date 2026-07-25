// Central tuning table for the whole run. Every gameplay number lives here so
// balancing passes never require touching system code.

export const ARENA_HALF_SIZE = 90;

/** Developer instruments that must NEVER reach a paying player. `npm run package`
 *  refuses to build while any of these is true (tools/check-release-flags.mjs),
 *  so leaving one on during a playtest cannot silently ship. */
export const DEV_TOOLS: { unlockPanel: boolean; auditionKeys: boolean } = {
  /** Main-menu "Unlocks" panel: unlocks every weapon/core/mod and opens all
   *  sockets. The Contracts system deletes this panel outright once it lands. */
  unlockPanel: false,
  /** F2-F9 hotkeys that cycle and preview SFX variants in-game while authoring
   *  audio. Turn back on for the full-catalog audio pass. */
  auditionKeys: false,
};

/** Renderer-side audio tuning. All voice, cooldown and fade values are config-owned. */
export const AUDIO = {
  /** Events allowed to play. An event missing from this list stays silent even
   *  when the manifest ships an asset for it, so anything audible in a release
   *  is a deliberate choice rather than a leftover. */
  validation: {
    enabledEvents: ['bolt-cannon-fire', 'ui-confirm', 'enemy-death', 'xp-pickup', 'gold-pickup', 'levelup-intro', 'levelup-open', 'panel-open', 'chest-open', 'chest-spin', 'chest-reveal', 'player-hit', 'shield-block', 'boss-portal', 'boss-awaken', 'boss-defeat', 'run-start', 'menu-enter', 'pause', 'resume', 'run-victory', 'run-defeat', 'merchant-arrival', 'shop-purchase', 'pulse-fire', 'press-slam', 'ricochet-throw', 'blades-spin', 'blades-loop', 'blades-hit', 'welder-beam', 'tire-launch', 'dismantler-swipe', 'turbine-launch', 'turbine-loop', 'acid-throw', 'acid-loop', 'foundation-music', 'menu-music'] as readonly string[],
  },
  voiceCaps: { global: 18, sfx: 14, music: 2 },
  cooldownS: {
    /** Spaced out so death debris reads as background rain under the weapon
     *  voice, never as its interleaved reply (tennis-match fix, 2026-07-18). */
    'enemy-death': 0.16, 'xp-pickup': 0.08, 'gold-pickup': 0.08,
    /** Long enough that being surrounded reads as a steady "taking damage"
     *  throb, not machine-gun fire from many simultaneous contacts (2026-07-19). */
    'weapon-activation': 0.14, 'player-hit': 0.4, 'ui-confirm': 0.06,
    'bolt-cannon-fire': 0.11,
    'pulse-fire': 0.1, 'press-slam': 0.12, 'ricochet-throw': 0.1,
    'blades-spin': 0.1, 'tire-launch': 0.1, 'dismantler-swipe': 0.1, 'turbine-launch': 0.1, 'acid-throw': 0.1,
    /** Throttles a swarm of blade contacts into a steady tick, not a
     *  machine-gun (frequent = invisible). */
    'blades-hit': 0.09,
  },
  fades: { defaultS: 0.04, pauseDuckS: 0.12, pauseMusicGain: 0.22, menuMusicGain: 0.45 },
  /** World-positioned zone loops (acid pool sizzle): the game attenuates the
   *  loop volume by the player's distance to the NEAREST active zone, so it
   *  fades out as the player walks away. Base is the level at distance 0. */
  acidLoop: { baseVolume: 0.42, maxHearingDistance: 32 },
  /** Turbine tornado TRAVEL-roar loop: fades with the player's distance to the
   *  nearest flying tornado (they spin off far across the map). */
  turbineLoop: { baseVolume: 0.4, maxHearingDistance: 40 },
  /** RULE — world-distance attenuation for ONE-SHOTS that happen at a world
   *  position away from the player (impacts/effects that land off the player,
   *  e.g. the acid drum, the dismantler claw). `emit({pos})` scales volume by
   *  the listener's distance. Player-centered fires (bolt/pulse/…) pass no pos =
   *  full. `minVolume` is a floor so your OWN weapon is still audible at range;
   *  beyond `maxHearingDistance` the sound sits at the floor. */
  spatial: { maxHearingDistance: 40, minVolume: 0.35 },
  music: {
    /** Base gain of the in-run music loop. Loud by default — players who find
     *  it strong turn it down with the Music Volume setting (user 2026-07-18). */
    runLoopVolume: 0.8,
    /** Menu theme gain. Compensates fades.menuMusicGain (0.45 duck designed to
     *  quiet RUN music behind menus) so the dedicated menu theme sits near the
     *  run bed's perceived level. */
    menuLoopVolume: 1.5,
  },
  paths: {
    manifest: 'assets/audio/prototypes/manifest.json',
    finalManifest: 'assets/audio/sfx/manifest.json',
  },
  diagnostics: {
    stressEventCount: 10_000,
    stressPriority: 0,
  },
  benchmark: {
    scenario: 'audio-swarm-416',
    seed: 4979220,
    enemyCount: 400,
    typeCounts: [240, 112, 48] as const,
    spawnRadius: 22,
    sacrificeIntervalS: 0.25,
    sacrificeBatch: 4,
  },
} as const;


/** Shared placement search. Failed searches skip/delay a spawn rather than
 *  placing an object outside the floor or overlapping occupied space. */
export const SPAWN_PLACEMENT = {
  maxAttempts: 72,
  spiralStep: 1.25,
};

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
  gapHalf: 4.2,
  /** Random gate count per run, inclusive. Wider openings and stronger
   *  separation keep every boss-sized route traversable. */
  countRange: [10, 13] as [number, number],
  /** Keep clear of the arena center (player spawn) and the outer edge. */
  minDistFromCenter: 18,
  maxDistFromCenter: ARENA_HALF_SIZE - 10,
  /** Minimum distance between gate centers so two funnels never overlap. */
  minSeparation: 24,
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
  /** Random count per run, inclusive. Sparse enough to preserve navigation
   *  lanes between containers and loose props. */
  countRange: [36, 50] as [number, number],
  minDistFromCenter: 8,
  maxDistFromCenter: ARENA_HALF_SIZE - 4,
  /** Minimum distance between barrels. */
  minSeparation: 8,
  /** Clearance kept from a container gate's center — bigger than
   *  minSeparation because a gate's real footprint (2 containers + the
   *  opening) extends well past its center point. */
  containerClearance: 14,
  /** Clearance kept from the boss totem. */
  totemClearance: 8,
  /** Color variants (2026-07-06 user request) — same model, different
   *  registry palette. world.ts picks one at random per drum. Skipped blue:
   *  the scaffold's blue-gray steel already blended into the cool factory
   *  floor palette (same lesson, not repeating the mistake). */
  variants: ['barrel', 'barrel-black', 'barrel-white'] as const,
};

/** Single source of truth for Barrier Cell gameplay and its shield-plate VFX capacity. */
export const BARRIER_CELL = {
  capacityPerCopy: 1,
  capacityCap: 6,
  regenS: 8,
  regenReductionPerExtraCopyS: 1,
  regenFloorS: 4,
  maxCopies: 10,
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
  showFps: false,
  /** Level-up headline beat before the upgrade draft opens. */
  levelUpIntro: {
    enabled: true,
    /** Short enough to keep flow, long enough to read in GIFs/screenshots. */
    durationS: 0.72,
    /** Screen-space offset above the projected player position. */
    screenOffsetY: 92,
  },
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
    aiTextureUrl: 'assets/2d/ground-factory-floor.png',
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
  /** Weapon hit sparks (2026-07-11): every landed weapon hit pops voxel cubes
   *  in the weapon's icon accent at the victim (WEAPON_ACCENT in weapons.ts).
   *  Counts stay tiny — hits are the most frequent event in the game and the
   *  burst pool is shared with deaths/mods. */
  hitSparks: {
    enabled: true,
    count: 2,
    critCount: 5,
  },
  /** Per-weapon in-world VFX knobs (weapon accents live in weapons.ts). */
  weaponVfx: {
    /** Burning-tire flame trail cadence per rolling tire. */
    tireFlameIntervalS: 0.07,
    /** Acid-zone bubbling cadence per active pool. */
    acidBubbleIntervalS: 0.22,
    /** Tornado scrap-debris trail cadence per active tornado. */
    turbineDebrisIntervalS: 0.09,
    /** Ricochet zigzag trail cadence (shared tick, one cube per chunk). */
    ricochetTrailIntervalS: 0.07,
    /** Arc Welder beam: a smooth traveling wave replaces the old per-frame
     *  random jitter (user: the cubes "spun" too fast and hurt to look at).
     *  The arc now undulates like a real welding arc instead of boiling. */
    welderWaveHz: 4.5,
    welderWaveAmp: 0.24,
    /** Phase offset per cube so the wave travels along the beam. */
    welderWavePhase: 0.8,
    /** Acid pool breathes in opacity so it reads as a live corrosive puddle
     *  instead of a flat neon sticker (user feedback). */
    acidPoolOpacityBase: 0.28,
    acidPoolOpacityPulse: 0.14,
    acidPoolPulseHz: 1.3,
    /** Oil drip cadence: a slowed enemy sheds dark oil cubes (+a hazard glint)
     *  so the debuff is unmistakable, not just a subtle body dimming. One drip
     *  event per interval hops across the slowed swarm (perf-safe at 400+). */
    oilDripIntervalS: 0.09,
  },
  /** Mod-behavior VFX (2026-07-11): every permanent mod speaks the VoxelBurst
   *  language (palette cubes, the user-approved style anchor) in ITS icon's
   *  accent color — colors MEASURED from the approved icon PNGs, never
   *  hand-picked (icon↔VFX coherence rule, ROADMAP capture-gate point 1). */
  modVfx: {
    stunBumper: {
      color: 0x40f0f0,
      count: 10,
      /** Continuous crackle while the victim stays stunned. */
      sparkIntervalS: 0.14,
      sparksPerTick: 1,
    },
    /** Amber debris + white-hot core cubes (the icon-recipe mix) so the
     *  impact still pops on yellow-bodied enemies. */
    kickPlate: { color: 0xf0b000, count: 6, hotColor: 0xfff6dc, hotCount: 3 },
    /** Two halves: steel bolts off the player, steel pop per victim — the
     *  bolt IS what hits them (de-collided from Kick Plate's amber, both
     *  trigger on the same "you got hit" event). */
    looseBolts: { boltColor: 0xc9d4de, boltCount: 6, hitColor: 0xc9d4de, hitCount: 4 },
    /** WHITE-ice nova + pop (frost = white family; electric cyan stays the
     *  Stun Bumper's alone). Victims wear the FROST tint + ice crackle. */
    coolantBurst: { color: 0xcfeeff, count: 12, hotColor: 0xeafaff, hotCount: 4, hitCount: 3 },
    /** Lightning-white trail + signal-RED pop on the chained victim — the
     *  trigger IS the crit, so the pop speaks the crit family (the icon's
     *  red reticle emblem), not the shared brand cyan. */
    chainRelay: { color: 0xf8fbff, trailCubes: 4, hitColor: 0xe02010, hitCount: 3 },
    /** Orb-blue burst when the siphon vacuums the map. */
    orbSiphon: { color: 0x10a0f0, count: 24, hotColor: 0xf8fbff, hotCount: 8 },
    /** Signal-red burst + sustained crackle ON THE PLAYER while overcharged. */
    overloadTrigger: { color: 0xe02010, count: 12 },
    /** Violet burst + sustained shimmer ON THE PLAYER while phased out. */
    phaseChassis: { color: 0xb060f0, count: 10 },
    /** Player-state auras (overload/phase) pulse denser than enemy crackle —
     *  a sustained buff on YOU must read at a glance. */
    playerAura: { sparkIntervalS: 0.07, sparksPerTick: 2 },
    /** Brass toot at the player when the scrapper answers the whistle. */
    foremansWhistle: { color: 0xf0c040, count: 10 },
    /** Amber blast + signal-red core (its red T-plunger) — de-collided from
     *  Kick Plate's amber+white by the red accent and the blast size. */
    detonatorRig: { color: 0xffb400, hotColor: 0xe02010, hotCount: 5 },
    /** The stomp is a RING of cubes at the damage radius edge — the only
     *  ring-shaped effect, and it shows the real AoE (gameplay legibility). */
    pistonStompers: { color: 0xffc44d, ringCubes: 12 },
    /** GOLD nova + red core (the icon's coils and crimson heart — the blue
     *  it shipped with predates the coherence rule) + gold pull aura. */
    magnetronHeart: { color: 0xf2b632, hotColor: 0xe02010, hotCount: 6 },
  },
  /** Chest open beat for Steam-capture readability: world burst first, UI reel second. */
  chestVfx: {
    openColor: 0xf2b632,
    openCount: 18,
    hotColor: 0xf8fbff,
    hotCount: 6,
    shakeAmp: 0.14,
    siphonShakeAmp: 0.1,
  },
  /** Boss materialization beat: layered red danger + white-hot core + ground shock ring. */
  bossSummonVfx: {
    eruptionColor: 0xff3355,
    eruptionCount: 40,
    hotColor: 0xf8fbff,
    hotCount: 12,
    ringColor: 0xe02010,
    ringCubes: 30,
    ringRadius: 3.8,
    shakeAmp: 0.72,
  },
  /** Scrapper arrival beat: warm trade signal, distinct from chest gold and boss red. */
  merchantVfx: {
    arrivalColor: 0xffc44d,
    arrivalCount: 26,
    hotColor: 0xf8fbff,
    hotCount: 7,
    ringColor: 0xf0b000,
    ringCubes: 20,
    ringRadius: 2.6,
    shakeAmp: 0.16,
  },
  /** Blob shadows: one dark disc under every entity, anchoring it to the
   *  ground. Radius multiplies the entity's collision radius. */
  blobShadow: {
    enabled: true,
    opacity: 0.32,
    radiusScale: 1.2,
    y: 0.04,
  },
  /** Persistent player readability marker for Steam-scale chaos. Keep it
   *  cyan/white and unsegmented so it never collides with elite magenta or
   *  boss red ring language. */
  playerMarker: {
    enabled: true,
    ringColor: 0x7ee0ff,
    glowColor: 0xf8fbff,
    tickColor: 0xf8fbff,
    ringOpacity: 0.74,
    glowOpacity: 0.16,
    tickOpacity: 0.86,
    innerRadius: 0.68,
    outerRadius: 0.94,
    glowRadius: 1.32,
    tickLength: 0.4,
    tickWidth: 0.08,
    tickDistance: 1.12,
    y: 0.075,
    pulseHz: 1.05,
    pulseScale: 0.1,
    rotateHz: 0.16,
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
  obstacleAvoidance: {
    lookAhead: 5,
    clearance: 0.45,
    steerStrength: 1.65,
    bossLookAheadMultiplier: 1.55,
    resolvePasses: 2,
  },
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
  /** Uniform elite marker: a segmented magenta ring rotating under every
   *  elite — the ONE signal that reads identically on every enemy type.
   *  Pattern language: elite = rotating segmented magenta, boss = solid
   *  double red (never mix them). */
  aura: {
    color: 0xff6bff,
    opacity: 1,
    innerRadius: 0.62,
    outerRadius: 1.0,
    /** Number of arc segments around the ring. */
    arcs: 4,
    /** Filled fraction of each arc slot (the rest is gap). */
    arcFill: 0.62,
    /** Full rotations per second. */
    rotateHz: 0.3,
    /** Ring radius as a multiple of the enemy's collision radius. */
    scale: 1.7,
  },
};

export const XP_ORBS = {
  maxCount: 320,
  /** Orbs closer than this merge their value into one. */
  mergeRadius: 1.6,
  collectRadius: 0.8,
  flySpeed: 22,
  /** Orb Siphon starts map-wide pulls faster and briefly scales orbs up so the wave reads in footage. */
  pullAllStartSpeed: 18,
  pullAllFlashS: 0.45,
  pullAllScaleBoost: 0.55,
  orbRadius: 0.28,
  /** Global multiplier on every dropped orb's value — the single tuning knob
   *  for run-wide XP income (per-enemy xp values stay canonical). Part of the
   *  2026-07-10 economy-generosity pass, judge as one change. */
  valueMult: 1.3,
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
    damagePctPerLevel: 0.1,
    /** Hit-test radius multiplier (scaled by stats.area) for target search. */
    hitRadius: 1.0,
  },
  pulse: {
    cooldownS: 2.4,
    damage: 10,
    radius: 6,
    radiusPctPerLevel: 0.06,
    damagePctPerLevel: 0.1,
  },
  blades: {
    orbitRadius: 3.4,
    rotationSpeed: 2.6,
    damage: 12,
    bladeRadius: 0.7,
    hitCooldownS: 0.5,
    maxBlades: 6,
    baseBlades: 2,
    damagePctPerLevel: 0.1,
  },
  welder: {
    range: 14,
    /** Damage per tick at ramp 0. */
    damage: 4,
    tickS: 0.25,
    /** Damage multiplier gained per second locked on the same target. */
    rampPerSecond: 0.5,
    rampCap: 4,
    rampPctPerLevel: 0.08,
    damagePctPerLevel: 0.1,
  },
  press: {
    cooldownS: 1.8,
    damage: 24,
    /** Crush zone in front of the player (length x width). */
    length: 5,
    width: 3.5,
    widthPctPerLevel: 0.05,
    damagePctPerLevel: 0.12,
  },
  tire: {
    cooldownS: 3.2,
    damage: 18,
    speed: 18,
    radius: 0.8,
    lifetimeS: 2.6,
    maxTires: 12,
    damagePctPerLevel: 0.1,
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
    radiusPctPerLevel: 0.06,
    slowFactor: 0.55,
    /** Slow strengthens by this fraction of base per level, down to the floor
     *  (a fully-leveled oil must never freeze the swarm outright). */
    slowPctPerLevel: 0.04,
    slowFactorFloor: 0.25,
    slowDurationS: 1.0,
    maxPuddles: 24,
  },
  acid: {
    cooldownS: 3.5,
    zoneRadius: 3,
    radiusPctPerLevel: 0.05,
    zoneLifeS: 3,
    dotDps: 10,
    dotDurationS: 2,
    dpsPctPerLevel: 0.1,
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
    damagePctPerLevel: 0.1,
    /** Max distance to search for a launch target. */
    targetRange: 30,
  },
  ricochet: {
    cooldownS: 1.1,
    damage: 14,
    speed: 26,
    bounces: 3,
    bounceRange: 9,
    damagePctPerLevel: 0.1,
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
    thresholdPerLevel: 0.005,
    /** Executing at a third of max HP is already very strong — hard ceiling. */
    thresholdCap: 0.3,
    damagePctPerLevel: 0.12,
  },
};

/** Weapon levels that grant +1 unit (projectile/blade/tire/tornado/bounce).
 *  Quantity freezes past these — the Ammo Feeder core is the only scaler
 *  beyond (docs/DESIGN_MEJORAS.md, Progresión v2). */
export const QUANTITY_MILESTONE_LEVELS = [3, 5];

/** +1 unit per quantity milestone reached at this level. */
export function quantityBonus(level: number): number {
  let bonus = 0;
  for (const l of QUANTITY_MILESTONE_LEVELS) if (level >= l) bonus++;
  return bonus;
}

/** Additive percent-of-base scaling: level 1 = base, each level adds pct. */
export function levelScale(base: number, pctPerLevel: number, level: number): number {
  return base * (1 + pctPerLevel * (level - 1));
}

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
    description: 'Launches vortices that shove the swarm away.',
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

export const MAX_WEAPON_LEVEL = 20;

/** One Core magnitude per rarity: [gray, green, blue, purple, gold]. */
export type CoreTierMagnitudes = readonly [number, number, number, number, number];

/** All Core and Ammo Feeder magnitudes live here, not in the draft system. */
export const CORE_TIER_MAGNITUDES = {
  damage: [0.1, 0.14, 0.18, 0.3, 0.42],
  'attack-speed': [0.1, 0.13, 0.16, 0.25, 0.35],
  'crit-chance': [0.04, 0.05, 0.07, 0.12, 0.17],
  'crit-damage': [0.15, 0.2, 0.25, 0.4, 0.55],
  'move-speed': [0.06, 0.08, 0.1, 0.16, 0.22],
  'attack-range': [0.08, 0.11, 0.14, 0.22, 0.3],
  'pickup-range': [0.2, 0.28, 0.35, 0.6, 0.85],
  'projectile-speed': [0.1, 0.14, 0.18, 0.3, 0.42],
  area: [0.08, 0.11, 0.14, 0.22, 0.3],
  armor: [8, 11, 15, 25, 35],
  regen: [1, 2, 3, 4, 6],
  'max-hp': [15, 20, 25, 45, 65],
  evasion: [8, 11, 14, 22, 30],
  thorns: [6, 9, 12, 20, 28],
  lifesteal: [3, 4, 6, 10, 14],
  duration: [0.1, 0.13, 0.16, 0.25, 0.35],
  luck: [6, 8, 10, 14, 20],
  cursed: [0.06, 0.08, 0.1, 0.14, 0.2],
  'projectile-count': [1, 1, 1, 1, 1],
} as const satisfies Record<string, CoreTierMagnitudes>;

/** Core caps and derived rewards kept with their tier magnitudes. */
export const CORE_BALANCE = {
  cursedXpGainMultiplier: 1.6,
  /** Effective probability ceilings. Values above these cannot improve the
   *  runtime roll, so applications clamp and drafts stop offering the core. */
  probabilityCaps: {
    critChance: 1,
    lifestealPercent: 100,
  },
};

/** Potency added by one owned-weapon level-up card. The per-level config value
 *  is Common; higher tiers follow Megabonk's recurring 1/1.2/1.4/1.6/2 curve. */
export const WEAPON_UPGRADE_TIER_SCALE = {
  gray: 1,
  green: 1.2,
  blue: 1.4,
  purple: 1.6,
  gold: 2,
} as const;

/** Countable unit gained at QUANTITY_MILESTONE_LEVELS, per weapon. Weapons
 *  absent here scale stats only. */
export const WEAPON_QUANTITY_UNIT: Partial<Record<WeaponId, string>> = {
  bolt: 'projectile',
  blades: 'blade',
  tire: 'tire',
  turbine: 'vortex',
  ricochet: 'bounce',
};

/** Every weapon uses specialised upgrade branches. Weapon level still drives
 * Lv3/Lv5 quantity milestones; a branch only scales its named behavior. */
export const BRANCH_WEAPON_IDS = [
  'bolt', 'pulse', 'blades', 'welder', 'press', 'tire', 'oil', 'acid',
  'turbine', 'ricochet', 'dismantler',
] as const;
export type BranchWeaponId = (typeof BRANCH_WEAPON_IDS)[number];
export type WeaponBranchId =
  | 'damage' | 'cycle' | 'size' | 'radius' | 'orbit-radius' | 'rotation-speed'
  | 'width' | 'lifetime' | 'ramp-stability' | 'range' | 'slow-strength'
  | 'duration' | 'knockback' | 'bounce-count' | 'execute-threshold';

export interface WeaponBranchDef {
  title: string;
  stat: string;
  /** Additive fraction of the base behavior per rarity-weighted branch power. */
  perPower: number;
}

export type WeaponBranchLevels = Record<
  BranchWeaponId,
  Partial<Record<WeaponBranchId, number>>
>;

/** Original branch identities built from the same weapon parameters that the
 * runtime reads. Higher rarity multiplies `perPower` via WEAPON_UPGRADE_TIER_SCALE. */
export const WEAPON_BRANCHES = {
  bolt: {
    damage: { title: 'Impact Coil', stat: 'damage', perPower: WEAPONS.bolt.damagePctPerLevel },
    cycle: { title: 'Cycle Relay', stat: 'fire cycle speed', perPower: 0.12 },
    size: { title: 'Bore Expander', stat: 'bolt size', perPower: 0.12 },
  },
  pulse: {
    damage: { title: 'Pulse Capacitor', stat: 'damage', perPower: WEAPONS.pulse.damagePctPerLevel },
    radius: { title: 'Wave Spreader', stat: 'pulse radius', perPower: WEAPONS.pulse.radiusPctPerLevel },
    cycle: { title: 'Charge Relay', stat: 'pulse cycle speed', perPower: 0.12 },
  },
  blades: {
    damage: { title: 'Edge Temper', stat: 'damage', perPower: WEAPONS.blades.damagePctPerLevel },
    'orbit-radius': { title: 'Orbit Spacers', stat: 'orbit radius', perPower: 0.1 },
    'rotation-speed': { title: 'Spin Motor', stat: 'rotation speed', perPower: 0.12 },
  },
  welder: {
    damage: { title: 'Arc Core', stat: 'damage', perPower: WEAPONS.welder.damagePctPerLevel },
    'ramp-stability': { title: 'Lock Brace', stat: 'ramp stability', perPower: WEAPONS.welder.rampPctPerLevel },
    range: { title: 'Cable Extender', stat: 'weld range', perPower: 0.1 },
  },
  press: {
    damage: { title: 'Ram Reinforcement', stat: 'damage', perPower: WEAPONS.press.damagePctPerLevel },
    width: { title: 'Plate Wideners', stat: 'crush width', perPower: WEAPONS.press.widthPctPerLevel },
    cycle: { title: 'Cycle Valve', stat: 'press cycle speed', perPower: 0.12 },
  },
  tire: {
    damage: { title: 'Tread Compound', stat: 'damage', perPower: WEAPONS.tire.damagePctPerLevel },
    size: { title: 'Sidewall Kit', stat: 'tire size', perPower: 0.12 },
    lifetime: { title: 'Trail Fuel', stat: 'travel distance', perPower: 0.12 },
  },
  oil: {
    radius: { title: 'Spread Nozzle', stat: 'puddle radius', perPower: WEAPONS.oil.radiusPctPerLevel },
    'slow-strength': { title: 'Grip Solvent', stat: 'slow strength', perPower: WEAPONS.oil.slowPctPerLevel },
    duration: { title: 'Heavy Blend', stat: 'puddle duration', perPower: 0.12 },
  },
  acid: {
    damage: { title: 'Caustic Mix', stat: 'DoT damage', perPower: WEAPONS.acid.dpsPctPerLevel },
    radius: { title: 'Splash Ring', stat: 'zone radius', perPower: WEAPONS.acid.radiusPctPerLevel },
    cycle: { title: 'Drum Feeder', stat: 'launch cycle speed', perPower: 0.12 },
  },
  turbine: {
    damage: { title: 'Blade Torque', stat: 'damage', perPower: WEAPONS.turbine.damagePctPerLevel },
    radius: { title: 'Intake Collar', stat: 'vortex radius', perPower: 0.1 },
    knockback: { title: 'Gust Piston', stat: 'knockback', perPower: 0.12 },
  },
  ricochet: {
    damage: { title: 'Scrap Weight', stat: 'damage', perPower: WEAPONS.ricochet.damagePctPerLevel },
    'bounce-count': { title: 'Rebound Spring', stat: 'bounce count', perPower: 0.35 },
    cycle: { title: 'Feed Ratchet', stat: 'launch cycle speed', perPower: 0.12 },
  },
  dismantler: {
    damage: { title: 'Jaw Temper', stat: 'damage', perPower: WEAPONS.dismantler.damagePctPerLevel },
    'execute-threshold': { title: 'Cull Sensor', stat: 'execute threshold', perPower: WEAPONS.dismantler.thresholdPerLevel },
    range: { title: 'Reach Linkage', stat: 'claw range', perPower: 0.1 },
  },
} as const satisfies Record<BranchWeaponId, Record<string, WeaponBranchDef>>;

export function isBranchWeapon(id: WeaponId): id is BranchWeaponId {
  return (BRANCH_WEAPON_IDS as readonly WeaponId[]).includes(id);
}

export function weaponBranchEntries(
  id: BranchWeaponId,
): ReadonlyArray<readonly [WeaponBranchId, WeaponBranchDef]> {
  return Object.entries(WEAPON_BRANCHES[id]) as Array<
    readonly [WeaponBranchId, WeaponBranchDef]
  >;
}

export function weaponBranchMultiplier(
  branches: WeaponBranchLevels,
  id: BranchWeaponId,
  branchId: WeaponBranchId,
): number {
  const def = (WEAPON_BRANCHES[id] as Record<string, WeaponBranchDef>)[branchId];
  return 1 + (def?.perPower ?? 0) * (branches[id][branchId] ?? 0);
}

/** Card text and lightweight build labels share this config-driven source. */
export function describeWeaponBranch(
  id: BranchWeaponId,
  branchId: WeaponBranchId,
  level: number,
  potency = 1,
): string {
  const def = (WEAPON_BRANCHES[id] as Record<string, WeaponBranchDef>)[branchId];
  if (!def) return `Lv${level}`;
  const gain = branchId === 'execute-threshold'
    ? `+${(def.perPower * potency * 100).toFixed(1)}pt`
    : `+${Math.round(def.perPower * potency * 100)}%`;
  const parts = [`${gain} ${def.stat}`];
  const unit = WEAPON_QUANTITY_UNIT[id];
  if (unit && QUANTITY_MILESTONE_LEVELS.includes(level)) parts.push(`+1 ${unit}`);
  return `Lv${level}: ${parts.join(' / ')}`;
}

export function describeWeaponBranches(
  id: WeaponId,
  branches: WeaponBranchLevels | undefined,
): string {
  if (!branches || !isBranchWeapon(id)) return '';
  return weaponBranchEntries(id)
    .map(([branchId, def]) => {
      const power = branches[id][branchId] ?? 0;
      return power > 0 ? `${def.title} ${power % 1 === 0 ? power : power.toFixed(1)}` : '';
    })
    .filter(Boolean)
    .join(' / ');
}

/** Card text for reaching `level`: the concrete gains of THAT level, built
 *  from the same config fields the weapons read — never hand-written. */
export function describeWeaponLevel(id: WeaponId, level: number, potency = 1): string {
  const pct = (v: number): string => `+${Math.round(v * potency * 100)}%`;
  const parts: string[] = [];
  switch (id) {
    case 'bolt':
      parts.push(`${pct(WEAPONS.bolt.damagePctPerLevel)} damage`);
      break;
    case 'pulse':
      parts.push(
        `${pct(WEAPONS.pulse.damagePctPerLevel)} damage`,
        `${pct(WEAPONS.pulse.radiusPctPerLevel)} radius`,
      );
      break;
    case 'blades':
      parts.push(`${pct(WEAPONS.blades.damagePctPerLevel)} damage`);
      break;
    case 'welder':
      parts.push(
        `${pct(WEAPONS.welder.damagePctPerLevel)} damage`,
        `${pct(WEAPONS.welder.rampPctPerLevel)} ramp rate`,
      );
      break;
    case 'press':
      parts.push(
        `${pct(WEAPONS.press.damagePctPerLevel)} damage`,
        `${pct(WEAPONS.press.widthPctPerLevel)} width`,
      );
      break;
    case 'tire':
      parts.push(`${pct(WEAPONS.tire.damagePctPerLevel)} damage`);
      break;
    case 'oil':
      parts.push(
        `${pct(WEAPONS.oil.radiusPctPerLevel)} puddle radius`,
        `${pct(WEAPONS.oil.slowPctPerLevel)} slow strength`,
      );
      break;
    case 'acid':
      parts.push(
        `${pct(WEAPONS.acid.dpsPctPerLevel)} acid damage`,
        `${pct(WEAPONS.acid.radiusPctPerLevel)} zone radius`,
      );
      break;
    case 'turbine':
      parts.push(`${pct(WEAPONS.turbine.damagePctPerLevel)} damage`);
      break;
    case 'ricochet':
      parts.push(`${pct(WEAPONS.ricochet.damagePctPerLevel)} damage`);
      break;
    case 'dismantler':
      parts.push(
        `${pct(WEAPONS.dismantler.damagePctPerLevel)} damage`,
        `+${(WEAPONS.dismantler.thresholdPerLevel * potency * 100).toFixed(1)}pt execute threshold`,
      );
      break;
  }
  const unit = WEAPON_QUANTITY_UNIT[id];
  if (unit && QUANTITY_MILESTONE_LEVELS.includes(level)) parts.push(`+1 ${unit}`);
  return `Lv${level}: ${parts.join(' · ')}`;
}

export const PICKUPS = {
  spawnIntervalS: 20,
  maxActive: 6,
  spawnDistMin: 14,
  spawnDistMax: 30,
  spawnClearance: 0.35,
  collectRadius: 1.5,
  frenzyDurationS: 10,
  frenzyDamageMultiplier: 2,
  hasteDurationS: 8,
  hasteSpeedMultiplier: 1.5,
  healFraction: 0.4,
  xpCacheFraction: 0.5,
  // Permanent stat rewards (luck/area/cursed) migrated to the core draft
  // (2026-07-09): chests now hold consumables only. See docs/DESIGN_MEJORAS.md.
};

/** Fresh-profile unlock state — the v1 "new profile" defaults. The future
 *  Contratos de Desguace system (Fase 5) mutates a persisted copy of this;
 *  ALL gating (draft pool, start draft, sockets, mod pool) reads this object
 *  so that swap is a single seam. Canonical default/contract split lives in
 *  docs/DESIGN_MEJORAS.md (weapons 5/6, cores 10/11, mods 11/5). */
/** Non-socket reward used only when owner uniqueness exhausts a draft.
 * 50 Gold matches a boss bonus, compensating a lost late-build choice without
 * changing normal drops, prices, or the fallback trigger. */
export const DRAFT_FALLBACK = {
  salvageDividendGold: 50,
};

export const PROFILE = {
  /** Weapon sockets: 1 default, +1 via contract (max 2). */
  weaponSockets: 1,
  /** Core sockets: 2 default, +2 via contracts (max 4). */
  coreSockets: 2,
  /** Design ceilings — the HUD shows the gap as locked sockets. */
  maxWeaponSockets: 2,
  maxCoreSockets: 4,
  /** Level-up discards per run: skip a draft without picking (2026-07-10).
   *  Lives in PROFILE because contracts may raise it later — the ceiling and
   *  unlock pacing are an open design question (see DESIGN_MEJORAS). */
  levelupDiscards: 3,
  unlockedWeapons: ['bolt', 'pulse', 'blades', 'press', 'tire'] as WeaponId[],
  /** Stat-card ids (upgrades.ts) available in the level-up draft. */
  unlockedCores: [
    'damage',
    'attack-speed',
    'move-speed',
    'max-hp',
    'armor',
    'regen',
    'attack-range',
    'pickup-range',
    'projectile-speed',
    'area',
  ],
  /** Mod ids (mods.ts) available in the chest reel and merchant stock. */
  unlockedMods: [
    'repair',
    'haste',
    'scrap-cache',
    'frenzy',
    'stun-bumper',
    'kick-plate',
    'loose-bolts',
    'detonator-rig',
    'orb-siphon',
    'piston-stompers',
    'barrier-cell',
    'foremans-whistle',
  ],
};

/** Temporary capture-only overrides. Disable after recording Steam footage. */
export const RECORDING = {
  levelUpDraft: {
    /** Always offer the owned weapon, Attack Speed and Projectile Quantity. */
    enabled: false,
    coreRarity: 'gold' as const,
    coreIds: ['attack-speed', 'projectile-count'] as const,
  },
  chestTesting: {
    /** Force green chests to test Orb Siphon without RNG. Keep false outside tests. */
    forceGreenChests: false,
    /** Every opened chest grants Orb Siphon for XP-vacuum testing. Keep false outside tests. */
    forceOrbSiphonReward: false,
  },
};

/** In-run currency (name TBD — icon-first decision 2026-07-09). Tokens merge
 *  like XP orbs so a 400-enemy swarm never floods the ground. */
export const GOLD = {
  startingGold: 0,
  /** 0.2 → 0.25 in the 2026-07-10 economy-generosity pass (+25% income). */
  dropChance: 0.25,
  /** 1 → 2 in the 2026-07-17 affordability pass. This doubles normal-kill
   *  income without increasing pickup density or changing elite/boss rewards. */
  dropAmount: 2,
  eliteBonus: 10,
  bossBonus: 50,
  mergeRadius: 2,
  collectRadius: 1.4,
  flySpeed: 26,
  maxCount: 96,
  tokenRadius: 0.32,
  /** Half-distance between the XP orb and the gold token from one kill, so
   *  the two never spawn overlapping (2026-07-09). */
  dropSeparation: 0.7,
};

/** Crates are now PAID and opened with E (2026-07-09 user call): each rolls a
 *  tier at spawn (so its price is known and shown), reads by tier color, and
 *  costs gold to open. Random-mod-of-that-tier — cheaper than the merchant,
 *  which lets you choose. */
export const CHEST = {
  interactRadius: 2.6,
  colliderRadius: 0.9,
  /** Center-to-center spacing between active chests. */
  minSpawnSeparation: 6,
  /** Chest price = merchant tier price × this (random pick → discounted).
   *  0.6 → 0.5 in the 2026-07-10 economy-generosity pass — chests only, shop
   *  prices deliberately untouched. */
  priceMult: 0.5,
};

/** The scrapper merchant: periodic visits, totem-style random position,
 *  on-screen indicator with a countdown while he sticks around. */
export const MERCHANT = {
  firstVisitS: 120,
  intervalS: 180,
  staysS: 60,
  distMin: 25,
  distMax: 40,
  interactRadius: 2.6,
  colliderRadius: 1.4,
  spawnClearance: 0.6,
  retryDelayS: 1,
  stock: 3,
  /** Prices scale with run time — enemy density ramps, so income ramps. */
  priceRampPerMin: 0.12,
  tierPrices: { gray: 25, green: 45, blue: 80, purple: 140, gold: 240 },
};

/** Permanent Mod parameters. Mods may stack repeatedly, but each definition
 *  may impose a deliberate internal floor or copy cap (for example Barrier Cell). */
export const MODS = {
  barrierCell: BARRIER_CELL,
  stunBumper: { cooldownS: 8, cooldownReduxPerCopyS: 1, cooldownFloorS: 3, stunS: 1.5 },
  kickPlate: { force: 10, forcePerCopy: 5 },
  looseBolts: { bolts: 3, boltsPerCopy: 2, damage: 12, radius: 5 },
  detonatorRig: { kills: 25, killsReduxPerCopy: 5, killsFloor: 10, damage: 45, radius: 3.5 },
  coolantBurst: { radius: 4.5, radiusPerCopy: 1, freezeS: 2 },
  orbSiphon: { hastePerExtraCopyS: 2 },
  chainRelay: { jumps: 3, jumpsPerCopy: 1, radius: 6, damageFraction: 0.5 },
  pistonStompers: { steps: 12, stepsReduxPerCopy: 2, stepsFloor: 6, strideU: 0.9, damage: 22, radius: 3 },
  overloadTrigger: { durationS: 5, durationPerCopyS: 2, attackSpeedMult: 2 },
  phaseChassis: { durationS: 1, durationPerCopyS: 0.4 },
  foremansWhistle: { discountPerExtraCopy: 0.1, discountCap: 0.5 },
  magnetronHeart: {
    cycleS: 45,
    cycleReduxPerCopyS: 5,
    cycleFloorS: 30,
    pullS: 2,
    pullForce: 18,
    novaRadius: 7,
    damagePerEnemy: 1.5,
    damagePerEnemyPerCopy: 0.75,
  },
};

/** Card tier roll weights (gray→gold) and how Luck shifts them upward.
 *  Effective weight = base + luck * luckShift.
 *  At 0 Luck, three cards have a 5.88% chance to show any purple/gold card
 *  and a 0.60% chance to show at least one gold card. */
export const TIERS = {
  weights: { gray: 62, green: 27, blue: 9, purple: 1.8, gold: 0.2 },
  luckShift: { gray: 0, green: 0, blue: 0.45, purple: 0.35, gold: 0.2 },
};

export const BOSS = {
  totemDistMin: 45,
  totemDistMax: 65,
  /** Radius of the summon zone; inside it the Interact prompt shows.
   *  The key itself is the rebindable 'interact' action (settings). */
  totemActivateRadius: 4.5,
  totemColliderRadius: 2.3,
  respawnRetryS: 1,
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

/** Contract thresholds. Every number a contract objective compares against
 *  lives here so recalibration after playtests never touches system code.
 *
 *  CALIBRATION STATUS: placeholders anchored to a single recorded full run
 *  (625 kills, level 22, ~53k damage over 10:00). They need a few dozen human
 *  runs on the CURRENT balance table before they mean anything — read the
 *  distribution with `npm run stats`, not intuition. */
export const CONTRACTS = {
  /** Signature milestones, hand-authored for the moments a player remembers. */
  firstBossKill: 1,
  fullRunSeconds: 595,
  bossHunterKills: 5,
  fullLoadoutLevel: 25,
  /** One full run landed 625; this is meant to need a strong build, not a miracle. */
  overkillKillsInRun: 800,
  /** Longest run finished carrying ONE weapon and ZERO mods. */
  puristSeconds: 595,
  /** Longest run finished without taking a single point of damage. */
  flawlessSeconds: 300,
  provingGroundWeapons: 4,
  twoOfAKindCharacters: 2,

  /** Ladders. Each rung pays out the next entry from its reward queue, so
   *  adding content means appending to the queue, never authoring a contract. */
  ladders: {
    /** Damage with one weapon that counts as "mastered". ~one full run. */
    masteryDamage: 50_000,
    arsenal: [1, 2, 3, 4, 5],
    scrapQuota: [300, 1_500, 5_000, 12_000],
    veteran: [3, 8, 15, 25],
    ascension: [10, 15, 20],
    endurance: [120, 240, 360],
  },
} as const;
