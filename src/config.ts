// Central tuning table for the whole run. Every gameplay number lives here so
// balancing passes never require touching system code.

export const ARENA_HALF_SIZE = 90;
/** How far INSIDE the floor's edge the arena wall stands (2026-08-17).
 *
 *  The wall used to sit exactly on the floor boundary, so its base and the
 *  floor plane's own edge were the same line. Set back, the wall rests ON the
 *  floor and the plane keeps going behind it — the edge of the world is never
 *  visible, and when the near wall fades what shows through is more floor
 *  instead of empty sky.
 *
 *  Movement clamps use it too. That is the point: the visible barrier becomes
 *  the real limit, which is the honest version of "where the floor ends,
 *  movement ends" — an invisible stop short of a visible wall is the bug that
 *  rule exists to prevent. Costs 1 unit of play area per side: enough for the wall to stand ON the
 *  floor rather than on its edge, which is all the overlap needs to be. */
export const ARENA_WALL_INSET = 1;
/** Movement limit for anything that walks: the wall's inner face. */
export const PLAY_HALF_SIZE = ARENA_HALF_SIZE - ARENA_WALL_INSET;

/** Developer instruments that must NEVER reach a paying player. `npm run package`
 *  refuses to build while any of these is true (tools/check-release-flags.mjs),
 *  so leaving one on during a playtest cannot silently ship. */
/** DEV ONLY — the boss lab.
 *
 *  Exists because the feedback loop was the real blocker on boss balance, not
 *  the design: every test cost eight minutes of play to reach a boss, and the
 *  player often died before the fight could be judged at all. That is one
 *  noisy data point per ten minutes against seven interacting variables.
 *
 *  It does NOT isolate the boss. The whole point of the fight is killing it
 *  WHILE the wave is on you, so the lab jumps the run clock — which is what
 *  drives density, enemy types and the HP ramp — and loads a REAL recorded
 *  build rather than a synthetic one. It reproduces minute 8; it just skips
 *  the eight minutes of walking there. */
export const BOSS_LAB = {
  /** Minute of run time to jump to. Drives everything the spawner derives. */
  atMinute: 8,
  /** Which recorded run to load the build from, newest first (0 = latest). */
  buildFromRunIndex: 0,
  /** Fraction of the spawn CAP to pre-fill.
   *
   *  The cap is not the steady state. In a played run the player is killing
   *  continuously, so the live population sits well below `maxActive` — pinning
   *  it at 100% produces a density that never actually occurs, which is what
   *  made the first version of the lab unplayable (playtest 2026-08-01: "me
   *  rodean demasiados y no puedo ni moverme"). */
  fillFraction: 0.55,
  /** Pre-filled bodies are scattered between these distances from the player.
   *
   *  The spawner places everything in ENEMIES.spawnRingMin..Max, so filling
   *  through it dropped the whole population into one ring that then marched
   *  inward together as a closing shell. That is a formation the game never
   *  produces on its own. Real minute-8 enemies are at every stage of their
   *  approach at once, so the lab scatters them across the full range. */
  scatterMin: 6,
  scatterMax: 42,
};

export const DEV_TOOLS: {
  unlockPanel: boolean;
  auditionKeys: boolean;
  bossLab: boolean;
  startingMapSelector: boolean;
  simulateMap1Handoff: boolean;
  mapTransitionKey: boolean;
  finaleKey: boolean;
  fatalHitKey: boolean;
  shortMaps: boolean;
  difficultyReadout: boolean;
} = {
  /** Main-menu "Unlocks" panel. Holds three actions: unlock every
   *  weapon/core/mod and open all sockets directly; settle every contract
   *  through the real payout path (which is what the Contracts screen reads);
   *  and reset progress. Kept as a testing surface now that Contracts have
   *  replaced it as the player-facing progression. */
  unlockPanel: false,
  /** F2-F9 hotkeys that cycle and preview SFX variants in-game while authoring
   *  audio. Turn back on for the full-catalog audio pass. */
  auditionKeys: false,
  /** Boss lab: press B mid-run to jump to BOSS_LAB.atMinute with a recorded
   *  build loaded and a boss summoned on top of you. See BOSS_LAB. */
  bossLab: false,
  /** Starting-map selector shown with the weapon draft. Direct Map 2 starts
   *  are partial-sector development runs, never fabricated full-arc clears. */
  startingMapSelector: false,
  /** Map 2 dev-start: begin a run directly in the Swarm Foundry with the build
   *  from the latest recorded run overlaid, as if a full Map 1 had just been
   *  crossed (heal to full, gold to zero, build and level carried — 0.3). Lets
   *  Map 2 be playtested without clearing Map 1 first. check-release-flags.mjs
   *  fails the build while this is true. */
  simulateMap1Handoff: false,
  /** T mid-run: jump straight to the sector transition — plays the real fade
   *  curtain and lands in the next map with a recorded build overlaid, exactly
   *  like simulateMap1Handoff but WITH the animation. Iterating the transition's
   *  feel otherwise costs a full ten-minute map plus a boss kill. The arc state
   *  advances through run-flow's own enterMap, so the shortcut cannot drift from
   *  the real crossing. check-release-flags.mjs fails the build while this is true. */
  mapTransitionKey: true,
  /** Y mid-run: jump straight to the FINALE — the arena reset plus the Hazard
   *  Marshal's arrival — carrying the live run exactly as T does.
   *
   *  T already reaches it from inside the foundry, but only by winding that
   *  map's clock, so seeing the finale from a fresh run still costs a full Map 1
   *  plus a boss kill plus ten more minutes. Y crosses whatever is left of the
   *  arc through run-flow's own `enterMap` and then arms the same structural
   *  `start-finale`, so the shortcut cannot show a beat players never get.
   *  check-release-flags.mjs fails the build while this is true. */
  finaleKey: true,
  /** K mid-run: apply a guaranteed lethal hit through the REAL damage funnel.
   *  The defeat beat is otherwise only reachable by dying for real, which makes
   *  measuring its phases, audio and freeze rules a matter of luck. It goes
   *  through damagePlayer on purpose — a harness that bypassed the funnel would
   *  verify a path players never take. */
  fatalHitKey: false,
  /** VALIDATION RIG — shortens EVERY map to SHORT_RUN_DURATION_S so a whole arc
   *  (Map 1 boss, transition, Map 2, final boss, ending) can be checked in
   *  minutes instead of twenty. Both maps, not just Map 1: shortening only the
   *  first still leaves a ten-minute wall before the finale.
   *
   *  It is a guarded flag rather than an edited constant on purpose: an edited
   *  constant is invisible and ships. check-release-flags.mjs fails the build
   *  while this is true, so `npm run package` physically cannot produce a
   *  four-minute release. Turn it off when the validation pass is done. */
  shortMaps: false,
  /** Corner readout of the live difficulty state: which map, both clocks, the
   *  difficulty scalar against its map's floor/peak, the enemy HP multiplier,
   *  the contact damage in force and the live body count.
   *
   *  It exists because "did the balance change I just made actually apply?" was
   *  unanswerable in play — the numbers only surfaced in the run history AFTER a
   *  run ended, and a dev shortcut could quietly hand the map a clock nobody
   *  intended. Reading it live turns a guess into a measurement. */
  difficultyReadout: false,
};

/** Map length while DEV_TOOLS.shortMaps is on. Inert otherwise. */
export const SHORT_RUN_DURATION_S = 4 * 60;

/** Renderer-side audio tuning. All voice, cooldown and fade values are config-owned. */
export const AUDIO = {
  /** Events allowed to play. An event missing from this list stays silent even
   *  when the manifest ships an asset for it, so anything audible in a release
   *  is a deliberate choice rather than a leftover. */
  validation: {
    enabledEvents: ['bolt-cannon-fire', 'ui-confirm', 'ui-back', 'ui-focus', 'enemy-death', 'xp-pickup', 'gold-pickup', 'levelup-intro', 'levelup-open', 'panel-open', 'chest-open', 'chest-spin', 'chest-reveal', 'player-hit', 'player-fatal', 'shield-block', 'boss-portal', 'boss-awaken', 'boss-defeat', 'run-start', 'menu-enter', 'pause', 'resume', 'run-victory', 'run-defeat', 'merchant-arrival', 'shop-purchase', 'pulse-fire', 'press-slam', 'ricochet-throw', 'blades-spin', 'blades-loop', 'blades-hit', 'welder-beam', 'tire-launch', 'dismantler-swipe', 'turbine-launch', 'turbine-loop', 'acid-throw', 'acid-loop', 'boss-sweep-charge', 'boss-sweep-warn', 'boss-sweep-fire', 'boss-overload-open', 'boss-overload-erupt', 'boss-volley', 'boss-assembly-open', 'boss-assembly-spawn', 'foundation-music', 'menu-music'] as readonly string[],
  },
  /** Release-owned variant choices. Dev audition pins still override these;
   * events absent here keep their normal random rotation. */
  fixedVariantIndex: {
    'ui-confirm': 0,
    'chest-reveal': 0,
  } as Readonly<Record<string, number>>,
  voiceCaps: { global: 18, sfx: 14, music: 2 },
  cooldownS: {
    /** Spaced out so death debris reads as background rain under the weapon
     *  voice, never as its interleaved reply (tennis-match fix, 2026-07-18). */
    'enemy-death': 0.16, 'xp-pickup': 0.08, 'gold-pickup': 0.08,
    /** Long enough that being surrounded reads as a steady "taking damage"
     *  throb, not machine-gun fire from many simultaneous contacts (2026-07-19). */
    'weapon-activation': 0.14, 'player-hit': 0.4, 'ui-confirm': 0.06, 'ui-back': 0.06, 'ui-focus': 0.075,
    'bolt-cannon-fire': 0.11,
    'pulse-fire': 0.1, 'press-slam': 0.12, 'ricochet-throw': 0.1,
    'blades-spin': 0.1, 'tire-launch': 0.1, 'dismantler-swipe': 0.1, 'turbine-launch': 0.1, 'acid-throw': 0.1,
    /** Throttles a swarm of blade contacts into a steady tick, not a
     *  machine-gun (frequent = invisible). */
    'blades-hit': 0.09,
    /** The overload chain fires four links 0.45s apart. This only stops two
     *  from landing on the same frame if a chain ever overlaps another; the
     *  steps themselves must stay audible as steps, because reading the
     *  sequence is how the attack is dodged. */
    'boss-overload-erupt': 0.12,
  },
  fades: { defaultS: 0.04, pauseDuckS: 0.12, pauseMusicGain: 0.22, menuMusicGain: 0.45 },
  /** Mix-wide calibration sits below the player-facing sliders. The SFX trim
   *  leaves priority weapon cues slightly above the run bed without letting
   *  the complete effects bus overpower it. */
  mix: { sfxBusGain: 0.85 },
  ui: { focusVolume: 0.22, backVolume: 0.58 },
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

/** Main-menu character model preview. This renderer is separate from gameplay,
 * but its quality and cadence remain centrally tunable like every visual. */
export const CHARACTER_MODEL_PREVIEW = {
  maxDevicePixelRatio: 2,
  fieldOfViewDeg: 36,
  nearPlane: 0.1,
  farPlane: 100,
  cameraDistanceScale: 2.4,
  cameraHeightRatio: 0.52,
  targetHeightRatio: 0.48,
  minimumCameraDistance: 3.6,
  spinRadiansPerSecond: 0.22,
  startingRotationRad: -0.3,
  backgroundColor: 0x0b1118,
  hemisphereSkyColor: 0xcfe0ec,
  hemisphereGroundColor: 0x3c4048,
  hemisphereIntensity: 1.25,
  keyLightColor: 0xfff4e0,
  keyLightIntensity: 1.5,
  keyLightPosition: [6, 10, 4] as const,
} as const;


/** Shared placement search. Failed searches skip/delay a spawn rather than
 *  placing an object outside the floor or overlapping occupied space. */
export const SPAWN_PLACEMENT = {
  maxAttempts: 72,
  spiralStep: 1.25,
};

/** Ordered v1 run arc. Map clocks reset at each boundary; total run time does not. */
export const MAPS = [
  {
    id: 'scrapyard',
    number: 1,
    title: 'Scrapyard',
    durationS: DEV_TOOLS.shortMaps ? SHORT_RUN_DURATION_S : 10 * 60,
    /** Map 1 owns the full opening difficulty ramp: from nothing to the ceiling
     *  over 480s, which is the curve every existing playtest was tuned against.
     *  These three numbers reproduce the pre-per-map formula EXACTLY, and that
     *  is the point — decision 0.2 isolates Map 1 from Map 2's recalibration. */
    difficulty: { floor: 0, peak: 1, rampS: 480 },
    /** Swarm contact damage multiplier. Map 1 is the baseline by definition. */
    contactDamageMult: 1,
    /** Boss contact multiplier. Map 1 is the baseline: BOSS.contactDamage is
     *  tuned for this map and the 2026-07-30 lethality measurement was taken
     *  here. */
    bossContactDamageMult: 1,
    /** How fast this map walks through the enemy introductions (`unlockAtS`).
     *  1 = the authored schedule. Map 1 IS that schedule. */
    rosterSpeed: 1,
    /** Cold dead-factory dusk. Deeper at the top and a touch brighter at the
     *  horizon than the single global sky it replaces (top 0e1219 / horizon
     *  1c2a38), which read almost flat: the old pair spanned 22 luma steps, this
     *  one spans 42, so the gradient reads as sky instead of as a dark wall.
     *  The fog takes the horizon colour, which is what makes distance dissolve
     *  into the backdrop instead of ending at a visible line. */
    sky: { topColor: 0x080a0f, horizonColor: 0x24384a },
  },
  {
    id: 'megafactory',
    number: 2,
    title: 'Swarm Foundry',
    durationS: DEV_TOOLS.shortMaps ? SHORT_RUN_DURATION_S : 10 * 60,
    /** The foundry gets its OWN sweep, not a shifted copy of Map 1's.
     *
     *  The offset it replaces (240s into a curve that saturates at 480s) meant
     *  Map 2 hit its ceiling at its own minute 4 and spent its remaining SIX
     *  minutes completely flat — same cadence, same population, same elite
     *  chance. Map 1 only goes flat for its last two.
     *
     *  floor 0.7 opens at the pressure of Map 1's MINUTE 5 (277 live bodies
     *  against Map 1's closing 380) — but carrying Map 1's minute-10 enemy HP,
     *  which never rewinds. The relief is in the body count alone, and that is
     *  the only place it can be: HP continuity across the crossing is the whole
     *  point of the arc clock.
     *
     *  It opened at 0.9 first (346 bodies) and the user's playtest read that as
     *  "basically where Map 1 ended". Correct reading — the crescendo has to be
     *  audible, and a floor that close to the ceiling leaves nothing to climb.
     *  peak 1.15 ends ABOVE anything Map 1 can reach. Values over 1 are already
     *  wired — they multiply live cap, wave size and enemy HP — and until now
     *  only stacked Cursed Core could get there.
     *  rampS 600 spends that climb across the whole map instead of a quarter.
     *
     *  PROVISIONAL: the peak lands ~437 live enemies and the last measured
     *  validation was 430. Real per-frame work is ~1.5 ms against an 8.33 ms
     *  vsync period, so the headroom is there, but confirm with a 400+ pass
     *  before treating this number as settled. */
    difficulty: { floor: 0.7, peak: 1.15, rampS: 600 },
    /** Swarm contact damage multiplier — the ONLY lever that moves the damage
     *  ceiling, because PLAYER.invulnAfterHitS caps swarm DPS at
     *  contactDamage / 0.4 no matter how many bodies are touching. 8 -> 10 here
     *  lifts that cap from 20 to 25 DPS.
     *
     *  Deliberately narrow: it does NOT touch boss contact, boss projectiles or
     *  Gunner shots. Those have their own tuning, and the final boss lives on
     *  this map — folding a map-wide multiplier into it would silently retune an
     *  encounter nobody balanced yet.
     *
     *  1.25 -> 1.5 (2026-08-18, playtest: "the damage still is not enough").
     *  12 is where this stops, and the stop is principled rather than timid: it
     *  is exactly BOSS.contactDamage, so a foundry grunt's touch now costs the
     *  same as a boss's touch. Going past it makes the ambient swarm hit harder
     *  than a boss, which is a statement about bosses, not about Map 2.
     *
     *  If 30 DPS still reads as soft, the next dial is NOT this one — it is
     *  PLAYER.invulnAfterHitS, which the swarm's whole damage ceiling divides by
     *  and which its own comment already names the real difficulty dial. That
     *  one would need a per-map factor it does not have yet.
     *
     *  Set this back to 1 to judge the difficulty curve on its own. */
    contactDamageMult: 1.5,
    /** Bosses hit harder here too, but NOT by the swarm's 1.5.
     *
     *  Riding the swarm factor would put a boss touch at 24, which is 60 DPS —
     *  within a hair of the 62.5 that was measured and rejected in 2026-07-30 as
     *  instant death. 1.25 lands on 20 (50 DPS, 2.0s to die): clearly above the
     *  16.2 of this map's elites, clearly below the number that broke the fight.
     *
     *  Deliberately NOT applied to boss projectiles (BOSS.tesla.projectileDamage
     *  and the finale's discharge). Those are dodgeable telegraphed attacks with
     *  their own tuning, and folding a map multiplier into them would retune a
     *  finale encounter nobody has balanced yet. */
    bossContactDamageMult: 1.25,
    /** The foundry REPLAYS the introductions on its own clock, at 2.5x speed.
     *
     *  Enemy HP still rides the arc clock and never rewinds, so nothing here
     *  makes a body weaker than the one before the crossing — a Voltling opens
     *  Map 2 at 60 HP against the 15 it had in Map 1. What restarts is only WHICH
     *  types appear, and that buys the map an opening of its own: a flood of
     *  basics at foundry density (277 bodies against Map 1's opening 38) instead
     *  of the same six-type soup the player just spent three minutes in.
     *
     *  Why 2.5 and not a full restart: the authored schedule finishes at 420s, so
     *  a 1.0 speed would leave the foundry without its heavies for seven of its
     *  ten minutes. At 2.5 the whole cast is back by 2:48 — long enough to feel
     *  like a fresh escalation, short enough that variety never goes missing.
     *
     *  MEASURED COST: replaying the introductions halves average body HP at the
     *  opening (60 against 110). That is deliberate — the pressure is meant to
     *  come from COUNT here, and it climbs back as the schedule replays. */
    rosterSpeed: 2.5,
    /** Ember dusk over a working foundry. Luminance is deliberately matched to
     *  Map 1's horizon (41 against 39.5) so neither map is brighter than the
     *  other — only WARMER, the same temperature-not-brightness move the tower
     *  recolours use. Unlike a small prop, the sky is a huge unlit area that
     *  never passes through the toon quantiser, so hue survives fully here.
     *
     *  Kept dark and desaturated on purpose: amber and gold are the player's
     *  accent, the coins and the chests, so a bright warm sky would put the
     *  loot language across the whole backdrop. */
    sky: { topColor: 0x0f0c0e, horizonColor: 0x3a2418 },
  },
] as const;

/** Timing of the animated sector-to-sector transition (Game.tickMapTransition).
 *  A dry one-frame world swap read as a hitch, so this fades to black, swaps the
 *  world at full black where the cut can't be seen, holds briefly on the sector
 *  name, then fades back in. */
/** Lengthened 1.55s -> 2.8s after the first playtest (2026-08-15): the original
 *  read as too abrupt for a whole sector change, and its 0.45s hold was not even
 *  long enough to READ the sector name. Most of the extra time went to the hold,
 *  which is the beat that sells the jump as a chapter break rather than a cut. */
export const MAP_TRANSITION = {
  fadeOutS: 0.8,
  holdS: 1.1,
  fadeInS: 0.9,
  /** How long BEFORE the curtain finishes lifting the player's spawn cue fires.
   *
   *  It used to fire at the swap, which is at full black — a whole second and a
   *  half before anything is visible, so the sound had finished before the map
   *  existed. A materialization cue has to arrive just under the picture it
   *  belongs to (user 2026-08-19: "unas milesimas antes de mostrar el mapa"),
   *  which is the same zero-latency rule every other animation-coupled sound in
   *  the game obeys — cut against the real constant, not by ear. */
  spawnCueLeadS: 0.16,
};

export type MapId = (typeof MAPS)[number]['id'];

/** Compatibility alias for tools that intentionally simulate Map 1 only. */
export const RUN_DURATION_S = MAPS[0].durationS;

/** Honest procedural first pass for Map 2. These are layout/render numbers,
 * not claims about final authored assets. The combat centre stays empty while
 * monumental machinery and readable heat/energy lanes live at the perimeter. */
export const MEGAFACTORY_MAP = {
  openCenterRadius: 38,
  /** 72 -> 82 (2026-08-17, user request: push the ring outward). The arena is a
   *  SQUARE of half-size 90, so at the cardinal directions this leaves 8 units
   *  of floor beyond the towers, and far more toward the corners, which sit at
   *  90 * sqrt(2) = 127 from centre. The ring stays circular on purpose — a
   *  square ring would read as a fence rather than as a plant perimeter. */
  perimeterRadius: 82,
  /** 12 -> 28 towers, 7 -> 3.0 wide (2026-08-17). The old towers were 7 wide by
   *  7 deep by 6-10 tall: near CUBES (1.14:1 at mean height), which is why they
   *  read as grey blocks rather than as towers. Height cannot go up — see the
   *  occlusion measurement below — so a tower silhouette can only be bought by
   *  narrowing the base. At 3.0 the aspect is 3.3:1.
   *
   *  MEASURED, and the part that is easy to get wrong: narrowing while adding
   *  proportionally more towers does NOT reduce occlusion. The perimeter arc at
   *  radius 72 is 452.4 units; 12 x 7 and 28 x 3 both occupy ~84 of them, so the
   *  blocked ground AREA is identical. What it buys is blocked DURATION — an
   *  enemy crosses a 3-unit blind band in well under half the time it takes to
   *  cross a 7-unit one. Cutting the area would mean cutting the total width. */
  /** 28 -> 22 (2026-08-17, user request: more air between towers). Spacing is
   *  arc / count, so the wider radius and the lower count compound: 2*pi*72/28
   *  gave 16.2 units centre-to-centre, 2*pi*82/22 gives 23.4. Measured against
   *  a mean tower width of 2.64 (2.6 at the [0.85, 1.0, 1.2] scale average),
   *  the clear gap between neighbours goes 13.6 -> 20.8 units.
   *
   *  Perimeter coverage drops with it: 22 * 2.64 = 58 units of a 515-unit arc,
   *  11.3%, against 13.9% before. Less blocked ground as well as more air. */
  towerCount: 22,
  /** Approx world footprint of the voxel chimney (targetWidth x voxelSize in
   *  registry.ts = 28 x 0.093, and the sheet's 3.29 aspect gives the height) —
   *  sizes the primitive placeholder shown before the model resolves. */
  towerWidth: 2.6,
  towerHeight: 8.6,
  /** UNIFORM scale per instance, cycled around the ring: one model at three
   *  sizes. Per-axis scaling would stretch the voxels into slabs.
   *
   *  MEASURED 2026-08-17, and it overturned the first sizing pass. World aspect
   *  is NOT what the eye judges: the camera sits at (0, 24, 19), an elevation of
   *  atan(24/19) = 51.6 degrees, which projects vertical extent at cos(51.6) =
   *  0.62 while width projects in full — height loses 38% on screen, width loses
   *  nothing. A first pass measured 325 x 476 px in a real capture, 1.46:1,
   *  which is why the towers read as cubes despite a 2-3.3:1 world aspect.
   *  Judge any change to these in SCREEN pixels, not world units.
   *
   *  The tallest lands at 10.3 world units. Occlusion cap: a tower of height H
   *  hides H * 0.79 units of ground behind it at this camera, and enemies spawn
   *  only 32-44 units out, so do not push past ~10.5 without redoing that sum. */
  towerScales: [0.85, 1.0, 1.2],
  /** Three recolours of one model, cycled around the ring so it never reads as
   *  the same object stamped 22 times. Same technique as Map 1's container and
   *  barrel variants: identical geometry and sheets, recoloured output. */
  towerVariants: ['foundry-stack', 'foundry-stack-iron', 'foundry-stack-graphite'] as const,
  /** Half the 2.6 footprint plus margin, multiplied by each instance's scale
   *  in world.ts. Physics, not visuals — it does not follow the model. */
  towerColliderRadius: 1.5,
  // pipeSegments / pipeRadius / pipeHeight and heatLaneCount / heatLaneWidth /
  // heatLaneLength were removed 2026-08-17 along with the geometry they fed.
  // The energised cyan conduits and orange heat channels are now painted into
  // the raster floor instead of stacked over it as flat unlit bands.
  colors: {
    floor: 0x202831,
    seam: 0x111820,
    charcoal: 0x17212a,
    steel: 0x40515d,
    cyan: 0x01e6fe,
    amber: 0xfdb601,
    heat: 0xff6a24,
  },
  /** Foundry floor plate. The first version was a flat fill + grid + one cyan
   *  rectangle, which read as untextured next to Map 1 — Map 1 gets an actual
   *  AI top-down image (VISUAL.ground.aiTextureUrl) and only falls back to its
   *  procedural canvas. This gives Map 2 a procedural floor with the same detail
   *  vocabulary Map 1's fallback uses (seeded jitter, wear, stains, scuffs) plus
   *  foundry-specific passes: tread plate, bolt studs and heat scoring.
   *
   *  Each repeat covers (ARENA_HALF_SIZE * 2) / repeats world units, so plate
   *  size is that divided by `plates` — currently 180/4/16 = 2.8u, readable at
   *  the ~1u scale of the bots instead of the old 0.6u mesh. */
  floor: {
    textureSize: 2048,
    repeats: 4,
    /** Plates per texture repeat. Kept as an exact divisor of textureSize
     *  (2048/16 = 128px) so plate edges, seams and bolts land on whole pixels
     *  instead of drifting sub-pixel across the sheet.
     *
     *  NOT a tiling requirement: measured at full resolution, the wrap
     *  discontinuity is ~0.1 luminance at both 15 and 16 plates — BELOW the
     *  ~0.2 interior pixel-to-pixel variation, i.e. invisible either way. (An
     *  earlier "6x seam" reading came from measuring a 512px downscale of the
     *  sheet, where resampling fakes an edge discontinuity. Measure tileability
     *  at native resolution or the number is meaningless.) */
    plates: 16,
    /** Per-plate brightness jitter, in 0-255 channel units. MEASURED 2026-08-16:
     *  at 9 the plate-to-plate spread was 14.8% of the mean — 4x Map 1's 3.7%
     *  with the same technique — and read as a checkerboard rather than as worn
     *  steel. 4 lands near 6%, slightly above Map 1 because this floor is much
     *  darker (luminance ~40 vs ~55) and needs the extra to stay legible. */
    plateJitter: 4,
    treadPlates: 46,
    treadSpacingPx: 9,
    boltInset: 0.16,
    wearBlobs: 54,
    /** Molten spill scoring — the pass that says "foundry" rather than "floor". */
    heatStains: 16,
    scuffs: 180,
    /** Cyan inspection lanes: a few plate rows lit as walkway edging. */
    conduitLanes: 3,
  },
  /** Map 2 foundry floor: AI-generated top-down texture (2026-08-17), tiled
   *  via RepeatWrapping, with the procedural canvas above as the fallback.
   *
   *  It exists to fix a MEASURED contrast failure, not for decoration. The
   *  procedural floor sits at ~39 mean luminance and the towers' charcoal at
   *  ~31.5 — a ratio of about 1.10:1, so the perimeter structures were
   *  effectively invisible against their own ground. Map 1's shipped raster
   *  measures 64.7, and matching it takes the tower ratio to roughly 1.48:1.
   *  Raising it much further would start eating the saturated cast and the
   *  orange heat lanes, so 62-68 is a ceiling as much as a target. */
  aiTextureUrl: 'assets/2d/ground-megafactory-floor-v14.png',
  /** MEASURED from the first in-game capture, not copied from Map 1. At Map
   *  1's 18 the plates rendered ~5.5 world units across (player ~60px wide at
   *  1u, plate ~330px), more than double the ~2.8u this floor's own procedural
   *  fallback targets as "readable at the ~1u scale of the bots" — big plates
   *  make the arena feel small. 10 lands plates near 3u.
   *
   *  Map 1 uses a different number for the same apparent scale because its
   *  sheet packs a different number of plates per tile; matching the constant
   *  would NOT match the look. */
  worldSizePerRepeat: 20,
} as const;

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
  /** Implements the 2026-07-08 "angular neighbours never share a colour" rule
   *  properly. It used to be approximated by list position, which only held
   *  while scatterPoints returned points in sector order and could not see two
   *  gates that were close on the ground but far apart in the array. */
  variantSeparation: 55,
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
  /** 0 = keep the old independent random draw, so Map 1 looks exactly as it did.
   *
   *  Map 1's barrels have the SAME clumping defect the foundry's power cells
   *  were just fixed for — 36-50 props over three variants produce runs of
   *  identical neighbours by arithmetic, not by bad luck. It is left off only
   *  because the request was scoped to Map 2 and Map 1 is the Demo's map.
   *  Setting this to 20 (the cells' value) fixes it; nothing else is needed. */
  variantSeparation: 0,
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

/** Map-2 scatter prop: the Swarm Foundry's power cells. Same ROLE as Map 1's
 *  barrel (small loose obstacle, count and position randomized per run) with
 *  the active-plant vocabulary instead of scrap, so navigation feel carries
 *  across the sector boundary while the read changes.
 *
 *  Footprint deliberately matches BARREL_PROP (1.3 x 1.5): the swarm dodges
 *  these the same way it dodges drums, so Map 2 is a new look and not new
 *  movement rules to relearn mid-run. */
export const POWERCELL_PROP = {
  /** Approx world footprint of the voxel model (targetWidth x voxelSize in
   *  registry.ts = 24 x 0.055) — sizes the primitive placeholder shown
   *  before the async voxel model resolves. */
  width: 1.32,
  height: 1.6,
  colliderRadius: 0.55,
  /** [28, 40] -> [46, 62] (2026-08-17, user request: more of them, more variety).
   *
   *  The original low count had a reason worth recording rather than silently
   *  overwriting: Map 2 already carries perimeter towers as standing collision,
   *  and the foundry's read is an OPEN combat center (DIRECCION_ARTE, Map 2
   *  visual contract). Two things changed since. The ring moved out from radius
   *  72 to 82, freeing the field it used to crowd, and the cell's collider is
   *  only 0.55 — sixty of them add far less obstruction than one tower.
   *  Comparable to Map 1's barrels at [45, 65], which is the density this is
   *  chasing. */
  countRange: [46, 62] as [number, number],
  minDistFromCenter: 8,
  maxDistFromCenter: ARENA_HALF_SIZE - 4,
  minSeparation: 8,
  /** No two cells within this radius may share a colour (2026-08-18 playtest:
   *  "four or five brown ones next to each other"). At minSeparation 8, a radius
   *  of 20 covers roughly the ring of cells a player sees as "this cluster",
   *  which is the unit the eye actually judges repetition on. */
  variantSeparation: 20,
  /** Clearance kept from the boss totem's summon zone. */
  totemClearance: 8,
  /** Three recolours, the barrel's structure (2026-08-17). The earlier note here
   *  argued one variant was enough at 28-40; at 46-62 the repetition shows, which
   *  is the same threshold that earned the barrel its three.
   *
   *  Steel / oxide / pale rather than three hues: the cyan core stays the shared
   *  identity across all three, so the body tones only have to separate the
   *  props from each other, not carry the map's language. */
  variants: ['powercell', 'powercell-rust', 'powercell-bone'] as const,
};

/** Map-2 cover: the Map 1 container geometry, foundry-coloured, placed as gates.
 *
 *  WHY THIS EXISTS (2026-08-18, user request after playing the new density): the
 *  foundry had no long cover at all. Its power cells carry the same 0.55 collider
 *  as a Map 1 barrel — decoration, not terrain — and its chimneys are 7-10 thin
 *  posts. With 277-437 bodies on the field there was nowhere to brace against.
 *
 *  WHY THE CONTAINER SHAPE AND NOT SOMETHING BIGGER: the ask was for a larger
 *  prop, but larger in HEIGHT is the one direction already measured as harmful.
 *  This camera hides `height * 0.79` units of ground behind an object, so the
 *  7.31-tall chimney blanks 5.8 units while the 3.0-tall container blanks 2.4.
 *  The foundry already owns the tall silhouette; what it lacked was something
 *  LONG and LOW you can run along. The gate layout (two containers with a gap)
 *  is the part that actually creates terrain — scattered singles are noise that
 *  eats shots without splitting the swarm.
 *
 *  THE COST, stated plainly: obstacles block the PLAYER's weapons too, through
 *  hasLineOfSight in weapons.ts, and aiming is automatic so a blocked shot is
 *  simply a lost one. That is why the count starts BELOW Map 1's 10-13.
 *
 *  PROVISIONAL: reusing Map 1's model is a deliberate cheap test of whether the
 *  foundry wants this geography at all. If it does, a purpose-built foundry prop
 *  replaces it; if it does not, no art was spent. */
export const FOUNDRY_CONTAINER_PROP = {
  width: 3.1,
  height: 3.0,
  length: 6.0,
  colliderRadius: 1.6,
  colliderOffsets: [-2.1, 0, 2.1],
  /** Wider than Map 1's 4.2: the swarm running these funnels is up to 437 bodies
   *  and the player has no dash, so a corridor sized for Map 1's crowd would be a
   *  trap rather than cover. */
  gapHalf: 5.4,
  /** Below Map 1's [10, 13] on purpose — see the weapon-blocking cost above.
   *  Raise only with a playtest behind it. */
  countRange: [7, 9] as [number, number],
  minDistFromCenter: 18,
  maxDistFromCenter: ARENA_HALF_SIZE - 12,
  minSeparation: 26,
  /** Two gates this close must not share a colour — the playtest found "purple
   *  containers next to literally identical ones". A gate is the biggest
   *  coloured object on the map, so repetition shows here first.
   *
   *  45, and the number is measured rather than picked. Sweeping it over 400
   *  simulated layouts, the share of nearby gate pairs sharing a colour goes
   *  25.1% at radius 35, 19.0% at 45, 30.3% at 60. It gets WORSE past a point
   *  because a radius that swallows the whole arena stops being a local rule and
   *  turns into global count-balancing, which says nothing about what the player
   *  sees in one screen. */
  variantSeparation: 45,
  totemClearance: 12,
  /** Violet and moss, picked from the only two hue windows the project has left
   *  unspoken-for — see the ramp comment in models/registry.ts for the census.
   *  The first pass used steel and iron and was rejected on sight: those are the
   *  power cells' and the chimneys' own colours, so the map gained objects and
   *  no variety. */
  variants: ['container-foundry-violet', 'container-foundry-moss'] as const,
};

/** Extra room scatter props keep from a map's own structures (Map 2's towers).
 *  Their collider is sized for the player and the swarm, not for placement, so
 *  a prop resting exactly on that radius still visually overlaps the tower. */
export const PROP_STRUCTURE_CLEARANCE = 3;

/** Map-2 field prop: the perimeter chimney again, scattered through the play
 *  area at the ring's SMALLEST size (user request 2026-08-17). One model, two
 *  jobs — the ring reads as skyline, these read as cover.
 *
 *  MEASURED CAUTION, recorded because it is the exact failure the perimeter
 *  towers already hit once: at scale 0.85 a pillar stands 7.3 world units tall,
 *  and this camera hides H * 0.79 units of ground behind an object, so each one
 *  blanks ~5.8 units. A Map 1 container is 3.0 tall and blanks 2.4. These are
 *  more than twice as blinding, and unlike the ring they sit where the fighting
 *  happens. The count starts deliberately low so it is cheap to walk back; if a
 *  playtest reports enemies appearing out of nowhere, this is the first suspect.
 */
export const FOUNDRY_PILLAR_PROP = {
  /** Approx world footprint at scale (28 x 0.093 x 0.85 wide, 8.6 x 0.85 tall)
   *  — sizes the primitive placeholder shown before the model resolves. */
  width: 2.21,
  height: 7.31,
  /** Matches the ring's smallest instance. Uniform, never per-axis. */
  modelScale: 0.85,
  colliderRadius: 1.3,
  /** Deliberately sparse. Raise only with a playtest behind it. */
  countRange: [7, 10] as [number, number],
  /** Well clear of the player's spawn: an object this tall next to the start
   *  point would blank the opening approach. */
  minDistFromCenter: 22,
  maxDistFromCenter: ARENA_HALF_SIZE - 26,
  /** Wide, so pillars never form an accidental wall the swarm funnels around. */
  minSeparation: 26,
  /** Comfortably past minSeparation: with only 7-10 pillars on the whole field,
   *  any two visible at once should differ. */
  variantSeparation: 55,
  /** Keeps the boss totem's summon zone open. */
  totemClearance: 12,
  /** Radius the power cells keep from each pillar, so the small prop does not
   *  end up tucked invisibly against the big one. */
  cellClearance: 6,
  variants: ['foundry-stack', 'foundry-stack-iron', 'foundry-stack-graphite'] as const,
};

/** Single source of truth for Barrier Cell gameplay and its shield-plate VFX capacity. */
export const BARRIER_CELL = {
  capacityPerCopy: 1,
  capacityCap: 6,
  /** 8 -> 14 (user playtest 2026-08-19: "en la batalla contra el boss es
   *  imposible que te bajen la vida").
   *
   *  The arithmetic behind the complaint: a charge blocks a FULL hit whatever
   *  it was worth, so the mod's real output is hits-absorbed-per-minute, and at
   *  8s that is 7.5. The Marshal's telegraphed kit lands somewhere near ten
   *  damage events a minute on a player who is moving, so the shield was eating
   *  three quarters of the fight and the six-charge buffer meant the first
   *  half-minute cost nothing at all. 14s puts sustained absorption at 4.3/min
   *  — still the strongest defensive mod in the game, no longer a subscription
   *  to immunity. 14 -> 30 in the same session's next playtest: at 14s it was
   *  still 4.3 absorbed hits a minute against a kit that lands about ten, so
   *  the fight was still being fought through a shield. 30s is 2/min — the mod
   *  now buys you specific moments, not a state.
   *
   *  This is a GLOBAL change, not a boss patch: Barrier Cell is a general mod
   *  and Map 1 feels it too. That is deliberate — the same arithmetic was
   *  always true there, the boss fight is just where it became visible. */
  regenS: 30,
  /** Scaled with the base so the four post-cap copies still land exactly on the
   *  floor — that second stage is the only reason to buy copies 7-10. */
  regenReductionPerExtraCopyS: 3,
  /** Fully stacked stays ~1.7x faster than base, the same shape the curve had
   *  at 8s and at 14s. */
  regenFloorS: 18,
  maxCopies: 10,
};

/** Canonical time conversion for player-facing recovery-rate presentation. */
export const SECONDS_PER_MINUTE = 60;

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
  /** Knockback below this speed is drift, not motion, so it is cut dead.
   *
   *  The swarm's cutoff is 0.05, which for a body being blown away by a
   *  vortex is fine — the long tail IS the effect. On the player it is what
   *  turned a boss ram into "me arrastra en vez de empujarme" (playtest
   *  2026-08-06): the last half second was a 25cm crawl with no animation on
   *  it. An impulse has to stop, and be seen stopping. */
  knockbackStopSpeed: 1.5,
  /** Seconds between passive regen ticks; each tick heals `stats.regen` HP. */
  regenTickS: 10,
  /** Minimum seconds between lifesteal heals. Caps sustain at 1 HP/s no
   *  matter how many enemies an AoE weapon hits per second — without this,
   *  lifesteal builds outheal contact damage inside the swarm. */
  lifestealCooldownS: 1,
  /** Walk-cycle micro-animation (Crossy Road-style hop): bob + body rock. */
  walkBobHz: 3.2,
  walkBobAmplitude: 0.09,
  walkRockAmplitude: 0.06,
};

/** Shared menu-navigation tuning. Kept out of HUD code so keyboard and
 * gamepad traversal use the same deliberate scroll step. */
export const MENU_NAVIGATION = {
  characterSectionScrollPx: 180,
};

/** Instrumentation for the frenzy work: is the player ever actually trapped?
 *
 *  MEASURED 2026-07-30: the global i-frame caps swarm DPS at
 *  contactDamage / invulnAfterHitS = 20, so 4.2x more bodies on the player
 *  deals the SAME damage. Density therefore cannot be read as pressure, and
 *  "lots of enemies nearby" says nothing about whether escape was possible.
 *
 *  So the metric is angular coverage, not a headcount: split the circle around
 *  the player into `sectors` and count how many hold an enemy within
 *  `radius`. Enclosure means no free direction — exactly the state a dash
 *  would exist to answer. Recorded BEFORE the density changes on purpose: the
 *  dash decision needs a before/after, and this cannot be backfilled into runs
 *  that were already played. */
export const PRESSURE_METRICS = {
  /** World units. An enemy beyond this is not blocking an escape route yet. */
  radius: 7,
  /** Angular buckets around the player. 12 → one per 30°. */
  sectors: 12,
  /** Occupied sectors that count as enclosed (no way out).
   *
   *  10 → 9 (2026-07-30). 10 was a guess made before any data existed. The
   *  first three v0.8.0 runs peaked at 9 repeatedly and never once tripped the
   *  counter, while the player reported feeling trapped — and 9 of 12 blocked
   *  leaves a single 30° lane, which is subjectively cornered, especially when
   *  that lane points somewhere you do not want to go. Trusting the guess over
   *  the report would have been backwards.
   *
   *  Runs recorded before this change are NOT comparable on `enclosedS`. */
  enclosedSectors: 9,
  /** HP fraction under which being enclosed is a crisis, not an inconvenience. */
  lowHpFraction: 0.35,
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
    /** Fallback for a map that declares no `sky` of its own; every map in MAPS
     *  currently does. Kept as the historical global pair. */
    topColor: 0x0e1219,
    horizonColor: 0x1c2a38,
    /** Fog distances stay SHARED across maps and are not part of the per-map
     *  palette. They decide how far a player can see the swarm coming, which
     *  makes them a gameplay number, not a mood one — only the colour changes
     *  per map. */
    fogNear: 55,
    fogFar: 95,
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
  /** C1 (2026-07-30): hitstop. Freezes the simulation for a couple of frames
   *  when a batch of enemies dies at once, so a big kill lands as an impact
   *  instead of a quiet number change. Rendering keeps going during the freeze
   *  — screen shake decays on raw time — so it reads as punch, not a stall.
   *
   *  `cooldownS` is the important one: an AoE build clearing 30 bodies a second
   *  would otherwise trigger this every frame and turn the whole game into a
   *  stutter. The freeze has to stay rare enough to mean something. */
  hitstop: {
    enabled: true,
    /** Deaths inside `windowS` required to trigger. Deliberately a short
     *  WINDOW rather than a single frame: early weapons kill one enemy at a
     *  time, so a same-frame test would almost never fire and C1 would be dead
     *  code for most of a run. A burst spread over ~2 frames reads identically
     *  to the player. */
    killsThreshold: 3,
    /** Rolling window the burst has to land inside. */
    windowS: 0.12,
    /** Freeze length. 60ms ≈ 4 frames at 60fps — long enough to feel, short
     *  enough not to read as a hitch. */
    durationS: 0.06,
    /** Minimum gap between freezes. */
    cooldownS: 0.45,
  },
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
    /** Bosses get FEWER, not the same. The counts above are tuned for a body
     *  0.9 units tall that dies in one or two hits; a boss is 9.87 tall, takes
     *  hundreds of hits and is often being hit by several weapons at once, so
     *  the same per-hit spray becomes a permanent fountain. Playtest 2026-08-19:
     *  "las particulas y el bloom al pegarle es demasiado exagerado". */
    bossCount: 1,
    bossCritCount: 2,
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
  /** Ground readability markers (player marker, elite aura, boss aura) are flat
   *  meshes a few centimetres above the floor, so any crate or barrel standing
   *  on that floor occludes them — the ring reads as chopped by grey boxes.
   *  These rings are SIGNALS, not painted decals: "that one is an elite" has to
   *  survive walking behind scenery. Drawing them on top costs a thin overdraw
   *  across the feet of whoever stands on them, which is cheaper than losing
   *  the signal.
   *
   *  Getting this right needs explicit QUEUE ordering, not just a depth flag.
   *  Three.js always draws transparent after opaque, so simply dropping
   *  depthTest on a transparent marker also put it over the player's body. The
   *  markers therefore join the OPAQUE queue (additive blending works without
   *  the `transparent` flag) and the three layers are ordered by hand:
   *
   *      scenery 0  →  markers 1  →  characters 2
   *
   *  so a crate cannot chop the marker, and the marker cannot cover the body
   *  standing on it. Opacity has to be baked into the colours, because
   *  `material.opacity` is ignored outside the transparent queue. */
  groundMarkersOnTop: true,
  /** …with ONE exception: the final boss's telegraphs (wedge, hazard zones,
   *  drop bays). User call 2026-08-20 — "los efectos de los ataques predominan
   *  por encima incluso de los modelos 3d del escenario en vez de representarse
   *  sobre el mapa/suelo". A 4-unit ring around a player reads fine painted
   *  over a crate; a 20-unit wedge painted over a 12-unit foundry chimney reads
   *  as a sheet floating above the map, because the tower stops being IN the
   *  attack and starts being BEHIND it. Depth-testing these puts them back on
   *  the floor: the chimney stands in the zone and occludes its own footprint.
   *  The player, elite and boss rings keep the flag above — that was a separate
   *  playtest call (2026-07-26) about props chopping SMALL markers. */
  bossTelegraphsUnderScenery: true,
  /** Draw order for the three ground layers above. */
  renderOrders: { scenery: 0, groundMarker: 1, character: 2 },
  /** Arena wall occlusion fade. The camera trails the player by CAMERA.offsetZ
   *  and is never clamped, so past z = ARENA_HALF_SIZE - offsetZ it sits OUTSIDE
   *  the near wall and that wall stands between the lens and the player.
   *
   *  Only the side the camera has actually left fades — the other three stay
   *  solid. An earlier attempt made every side a non-occluding backdrop, and the
   *  side walls then had the floor drawing through them, which read as broken.
   *
   *  A fading wall necessarily becomes transparent, and Three draws the entire
   *  transparent queue after every opaque, so the faded side composites OVER the
   *  player rather than behind. That is exactly what an occlusion fade should
   *  look like — the player reads through a tinted pane — but it is the same
   *  queue behaviour that bit the ground markers, so it is deliberate here. */
  arenaWallFade: {
    /** Opacity while fully faded. Low enough to read the player through it,
     *  high enough that the wall itself never disappears. */
    opacity: 0.32,
    /** Camera distance INSIDE the wall plane at which fading begins. */
    startInside: 7,
    /** Camera distance OUTSIDE the plane at which the fade is complete. A band
     *  rather than a switch: a hard cut at the threshold pops. */
    fullOutside: 3,
  },
  /*  cyan/white and unsegmented so it never collides with elite magenta or
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

/** Staged defeat beat: the lethal hit no longer opens the results overlay on
 *  the same frame. Every magnitude of the sequence lives HERE — game.ts, hud.ts,
 *  player.ts, particles.ts and the CSS all read these, so the controller and the
 *  presentation can never drift apart.
 *
 *  Timings are absolute seconds measured from the ACCEPTED fatal hit, not from
 *  each other, so a dropped frame cannot slide the reveals apart. */
export const DEFEAT_TRANSITION = {
  /** Frozen impact on the fatal frame — the beat that says "that one killed
   *  you", and the window the HEALTH BAR uses to empty.
   *
   *  0.1 -> 0.15 (user 2026-08-20): "queda raro ver que tengo 15 de vida y
   *  muero". The bar was never told about the killing blow — `updateBars` is
   *  skipped the moment the state stops being `playing`, and the fatal hit
   *  changes it in the same frame — so the last thing drawn was the health the
   *  player had BEFORE dying, and the chassis overloaded under it. The bar is
   *  pushed to zero now, and this beat is its own CSS transition
   *  (`#hp-bar-fill`, `width 0.15s steps(4)`) so the overload starts on the
   *  frame the bar reaches 0, not over a bar still draining. Frozen by test
   *  against the stylesheet — changing one without the other is the bug. */
  fatalHitstopS: 0.15,
  /** Chassis-overload animation, from the end of the hitstop to the title. */
  overloadS: 0.65,
  /** SYSTEM OVERLOAD + subtitle appear. `run-defeat` is emitted HERE, not on
   *  the contact frame: it is a presentation sting, not the physical hit. */
  titleRevealS: 0.8,
  /** Full results content and the enabled/focused actions. */
  summaryRevealS: 1.2,
  /** Earliest a fresh, debounced confirm may complete the presentation. */
  skipUnlockS: 0.55,
  /** Explicit run-music fade. Deliberately NOT the pause duck, which only
   *  lowers the music and would leave it audible under the sequence. */
  musicFadeS: 0.45,
  /** Single fatal camera impulse. Replaces the ordinary hit shake (0.22) and
   *  sits just under the boss-kill impulse (0.55) so death reads as the
   *  heaviest hit the player takes without becoming a boss-scale event. */
  fatalShakeAmp: 0.5,
  overload: {
    /** Electrical strobe over the chassis. ~12 Hz is fast enough to read as
     *  arcing current and slow enough that individual flashes are visible. */
    strobeHz: 12,
    /** Cycled per strobe step. Amber is the industrial-toy accent, white the
     *  hot core, cyan the player's own electrical language (shield plates,
     *  player marker) — the same three colours the character already owns. */
    flashColors: [0xffc44d, 0xffffff, 0x7ee0ff],
    /** Voxel sparks. Capacity is a hard cap for the dedicated pool; the beat
     *  must not compete with a 400+ swarm frozen behind it. */
    sparkCapacity: 96,
    /** Cubes emitted per second, ramped by overload pressure (see rampPower). */
    sparksPerS: 90,
    /** Pressure curve across the overload: >1 back-loads the emission so the
     *  chassis builds towards the blowout instead of firing evenly. */
    rampPower: 2,
    sparkCubeSize: 0.14,
    sparkUpwardSpeed: 7.5,
    sparkHorizontalSpeed: 3.4,
    sparkGravity: 16,
    sparkLifeS: 0.75,
    /** Final blowout at the title handoff, when the body powers down. */
    blowoutSparks: 34,
  },
} as const;

export type EnemyBehavior = 'chase' | 'roller' | 'gunner' | 'flyer' | 'charger';

export interface EnemyTypeDef {
  name: string;
  /** Explicit registry alias for names that intentionally do not match their
   * model key (Hazard Marshal uses the historical `final-boss` asset slot). */
  modelKey?: string;
  /** Visual-only model substitutions owned by a map. Gameplay identity,
   * behavior, pool slot and InstancedMesh stay unchanged. */
  mapModelKeys?: Partial<Record<MapId, string>>;
  /** Boss identity is semantic, not inferred from an array position. */
  isBoss?: boolean;
  behavior: EnemyBehavior;
  hp: number;
  speed: number;
  scale: number;
  radius: number;
  /** Radius used for TOUCHING the player — contact damage and the body the
   *  player cannot walk through. Defaults to `radius`.
   *
   *  It exists because `radius` does three other jobs (swarm steering, spawn
   *  placement, the aura and shadow discs) and one circle cannot describe a
   *  body that is far wider than it is deep. Measured on the Hazard Marshal:
   *  half-extents 3.24 wide by 1.33 deep against a radius of 3.10, so walking
   *  at its face took damage 1.77 units before touching anything visible —
   *  "me golpea antes de chocar con él" (playtest 2026-08-19). */
  contactRadius?: number;
  xp: number;
  color: number;
  /** Run time (seconds) at which this type joins the spawn pool. */
  unlockAtS: number;
  /** Relative spawn weight once unlocked. */
  weight: number;
  /** Coins dropped when this type pays out, scaling with the arrival ladder so
   *  a late heavy is worth more than a minute-one grunt. Absent falls back to
   *  GOLD.dropAmount. The drop CHANCE stays global — varying both would make
   *  income impossible to reason about. */
  gold?: number;
  /** Heavy bodies other enemies path AROUND rather than pile into. Separation
   *  alone cannot do this: it pushes along the centre-to-centre axis, so a
   *  head-on arrival is shoved backward, never sideways. Costs one entry in
   *  the per-frame avoidance scan per live instance — keep it to the few types
   *  slow enough to actually dam a wave. */
  blocksOthers?: boolean;
  /** Instance budget for this type's InstancedMesh. */
  capacity: number;
}

// Base HP carries the +20% tuning pass from the 2026-07-02 playtest ("too easy").
const VOLTLING_TYPE = {
  name: 'Voltling',
  modelKey: 'voltling',
  mapModelKeys: { megafactory: 'furnace-mite' },
  behavior: 'chase',
  hp: 15,
  speed: 5.5,
  scale: 0.9,
  radius: 0.55,
  xp: 1,
  color: 0xffb400,
  unlockAtS: 0,
  weight: 10,
  gold: 2,
  capacity: 288,
} satisfies EnemyTypeDef;

export const ENEMY_TYPES: EnemyTypeDef[] = [
  VOLTLING_TYPE,
  {
    name: 'Sparkrunner',
    modelKey: 'sparkrunner',
    mapModelKeys: { megafactory: 'axle-runner' },
    behavior: 'chase',
    /** 2.3x a same-moment Voltling — fourth rung of the arrival ladder. */
    hp: 35,
    /** B1: 8 → 11 → 9.5 → 8.5 (the last step 2026-08-01, third time the user
     *  reported it too fast — consistent human feedback beats my arithmetic).
     *
     *  The point is to create the verb "dodge": before this the player outran
     *  everything and standing still was the only way to be hit.
     *
     *  11 matched PLAYER.moveSpeed exactly and the playtest killed it — at
     *  parity the escape margin is 0 u/s, which is not a fast enemy but an
     *  inescapable one. 9.5 left 1.5 u/s and still read as too sticky over
     *  several sessions. 8.5 leaves 2.5 u/s: ~4s to open ten units of gap,
     *  against 3.3s at the original 8 and 6.7s at 9.5. It still chases, it
     *  just stops feeling glued.
     *
     *  Note the bot sweep completely missed this: it circle-strafes and never
     *  attempts to flee, so it measured deaths (which barely moved) and was
     *  blind to "I cannot escape". Do not tune this number from bot data. */
    speed: 8.5,
    scale: 1.1,
    radius: 0.6,
    xp: 4,
    color: 0x2ee6de,
    /** Fourth arrival. At speed 9.5 this is the pressure enemy, so it lands
     *  once the player can already dodge (Roller) and reposition (Drone). */
    unlockAtS: 225,
    /** Was rarer than two types that arrive BEFORE it — an inversion. */
    weight: 3,
    gold: 3,
    capacity: 112,
  },
  {
    name: 'Rustbrute',
    modelKey: 'rustbrute',
    /** 2026-07-30: 'chase' → 'charger'. See RUSTBRUTE for the reasoning. */
    behavior: 'charger',
    /** 96 → 68 (4.5x a same-moment Voltling) — sixth and last rung.
     *
     *  Lowering the base does NOT make it weaker: the global hpRampPerMinute
     *  multiplies every enemy by run time, so moving this type from 4:00 to
     *  7:00 already hands it a bigger multiplier. 96 at 4:00 arrived with 242
     *  effective HP; 68 at 7:00 arrives with 249. Same wall, correct rung.
     *  Keeping 96 would have double-counted the delay and made it a 2x step in
     *  a ladder that climbs ~1.4x per arrival. */
    hp: 68,
    speed: 2.6,
    scale: 1.8,
    radius: 1.15,
    xp: 7,
    color: 0xff4433,
    /** LAST arrival (2026-07-30, user's order). The tank closes the cast, so
     *  the run's final new problem is the heaviest one. */
    unlockAtS: 420,
    weight: 2,
    gold: 6,
    /** The only type slow and wide enough to dam a wave today. */
    blocksOthers: true,
    capacity: 56,
  },
  {
    name: 'Roller',
    modelKey: 'roller',
    behavior: 'roller',
    /** 1.8x a same-moment Voltling — third rung of the arrival ladder. */
    hp: 27,
    speed: 7.5,
    scale: 1.1,
    radius: 0.7,
    xp: 3,
    color: 0xb069ff,
    /** Third arrival. It commits to a heading and overshoots, so in small
     *  numbers it teaches sidestepping without punishing — the right lesson
     *  before the Sparkrunner shows up and actually chases. */
    unlockAtS: 150,
    weight: 3,
    gold: 3,
    capacity: 40,
  },
  // Gunners and drones carry the late-game pressure: projectiles ignore
  // knockback walls and flyers approach with a distinct elevated silhouette.
  {
    name: 'Gunner',
    modelKey: 'gunner',
    mapModelKeys: { megafactory: 'slagcaster' },
    behavior: 'gunner',
    /** 3.2x a same-moment Voltling — fifth rung. Durability is the right axis
     *  for a ranged type: it keeps its distance, so a fragile one just dies to
     *  splash before its projectiles ever matter. */
    hp: 48,
    speed: 4,
    scale: 1.2,
    radius: 0.65,
    xp: 5,
    color: 0x7dd94a,
    /** Fifth arrival. Ranged pressure lands once the player is already busy
     *  managing a chaser. */
    unlockAtS: 315,
    /** 4 → 2 (2026-07-30 weight pass). At 4 it was the SECOND most common
     *  enemy in the final mix — arriving fifth and being the second toughest.
     *  Later and heavier has to mean rarer, or the late swarm stops being a
     *  swarm. Watch this one in play: gunner projectiles ignore knockback, so
     *  this type is the counter to CC builds and must stay present enough to
     *  do that job. */
    weight: 2,
    gold: 4,
    capacity: 48,
  },
  {
    name: 'Drone',
    modelKey: 'drone',
    behavior: 'flyer',
    /** 1.4x a same-moment Voltling — second rung. Barely tougher than the
     *  baseline on purpose: it arrives early and its lesson is POSITIONAL, not
     *  a damage check. */
    hp: 21,
    /** 6.5 → 5.5 (2026-07-30 playtest). A flyer is harder to READ than a
     *  ground unit — it sits off the combat plane, so the player loses the
     *  depth cue that tells them where it will be. Slower gives that read back
     *  without removing the type's job. */
    speed: 5.5,
    scale: 1.0,
    radius: 0.6,
    xp: 2,
    color: 0xff9de2,
    /** SECOND arrival (2026-07-30, user's order). Its elevated silhouette is
     *  the earliest positional lesson, before anything can catch the player;
     *  it still shares enemy and map-obstacle collision with the whole swarm. */
    unlockAtS: 75,
    /** 4 → 3 (2026-07-30 playtest: too many drones arriving at once to read).
     *  Ties the Roller rather than sitting above it — the ladder only needs to
     *  be non-increasing, not strictly falling. */
    weight: 3,
    gold: 2,
    capacity: 56,
  },
  // Bosses: weight 0 keeps them out of the wave spawner; the totem summons
  // them via EnemySystem.spawnAt. Living in the enemy pool means every weapon
  // targets and damages them with zero special-casing.
  // Boss scale rule: a boss must dwarf even the largest elite (elite brute =
  // 1.8 x 1.35 = 2.43) so the visual hierarchy is never ambiguous.
  {
    name: 'Crusher King',
    modelKey: 'crusher-king',
    isBoss: true,
    behavior: 'chase',
    hp: 2600,
    /** Restored 0 → 3 for the 2026-08-10 playtest. This is the live speed —
     *  boss.ts reads it from here, not from BOSS.crusher. Together with
     *  behavior `chase`, it restores the King's historical mobile behavior. */
    speed: 3,
    scale: 3.1,
    radius: 2.6,
    xp: 120,
    color: 0xff4433,
    unlockAtS: Infinity,
    weight: 0,
    capacity: 1,
  },
  {
    name: 'Tesla Titan',
    modelKey: 'tesla-titan',
    isBoss: true,
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
  {
    name: 'Hazard Marshal',
    modelKey: 'final-boss',
    isBoss: true,
    behavior: 'chase',
    /** 7200 -> 36000 -> 100000 (user playtests 2026-08-19). The first human
     *  fight died far too fast for a finale: a late build kills 7200 before the
     *  boss has reached its second phase, so two thirds of the moveset never
     *  happened. x5 was not enough either once the fight had something to do.
     *  Read together with the level clamps below — this is the value at
     *  FINAL_BOSS.hpLevelReference, scaled 0.85-1.6 by the level you arrive at. */
    hp: 100000,
    /** 3.2 -> 4.0 (user playtest 2026-08-19). Still barely a third of the
     *  player's 11, and it CANNOT be the fix on its own: nothing this side of
     *  player speed catches a kiting player, which is why the reinforcement
     *  ring exists. This just stops the body from being trivially outwalked
     *  while the player fights the things it called.
     *
     *  4.0 -> 4.8 (user 2026-08-19). Still 44% of the player's 11: it cannot
     *  catch anyone who keeps running, and it is not supposed to — this buys it
     *  the ability to close on someone who stopped to fight the drops. */
    speed: 4.8,
    scale: 5.2,
    radius: 3.1,
    /** MEASURED, not chosen: the body is 6.48 wide and 2.66 deep, so its
     *  half-extents are 3.24 and 1.33. A circle cannot be right on both — 3.10
     *  overhung the FACE by 1.77 units, and 1.33 would let the player stand
     *  inside its shoulders. 2.2 splits the error: approaching its face you now
     *  overlap the body by 0.17 before it hurts, and at its widest you clip
     *  0.34 into an arm. Both are under half a unit; the old number was a body
     *  and a half of thin air. */
    contactRadius: 2.2,
    xp: 300,
    color: 0xfdb601,
    unlockAtS: Infinity,
    weight: 0,
    capacity: 1,
  },
  /** Finale-only pool for the original Voltling silhouette. Normal Foundry
   *  waves keep type 0 and therefore still resolve to Furnace Mite. A distinct
   *  type is required because each visual roster owns one InstancedMesh; it
   *  avoids per-instance meshes or a per-body model override. Gameplay values
   *  deliberately inherit the canonical Voltling definition. */
  {
    ...VOLTLING_TYPE,
    mapModelKeys: {},
    unlockAtS: Infinity,
    weight: 0,
  },
];

/** Resolves the render model without changing the enemy's gameplay identity. */
export function resolveEnemyModelKey(type: EnemyTypeDef, mapId: MapId): string {
  return type.mapModelKeys?.[mapId] ?? type.modelKey ?? type.name.toLowerCase().replace(/\s+/g, '-');
}

/** Boss identities. Dispatch must ask by identity, never by pool position:
 *  changing the summon roster or its order must not route one boss through
 *  another boss's moveset. */
export const CRUSHER_KING_TYPE_INDEX = 6;
export const TESLA_TITAN_TYPE_INDEX = 7;

/** Pool indexes of the summonable Map 1 bosses (must match ENEMY_TYPES order).
 *
 *  CRUSHER KING REACTIVATED FOR PLAYTEST 2026-08-10 on both variants with its
 *  historical mobile behavior restored (`chase`, speed 3). The speed-0 anchored
 *  experiment and its empty-ram weakness are historical, not current behavior. */
export const BOSS_TYPE_INDEXES = [CRUSHER_KING_TYPE_INDEX, TESLA_TITAN_TYPE_INDEX];

/** Final boss is deliberately outside BOSS_TYPE_INDEXES: Map 1's positional
 * random draw must never select it. It is activated only by the Map 2 finale. */
export const FINAL_BOSS_TYPE_INDEX = 8;

/** Stable gameplay indexes whose Foundry model variants are used by assembly. */
export const VOLTLING_TYPE_INDEX = 0;
export const ROLLER_TYPE_INDEX = 3;
export const FOUNDRY_AXLE_RUNNER_TYPE_INDEX = 1;
export const FOUNDRY_SLAGCASTER_TYPE_INDEX = 4;

/** Original-visual Voltling reserved for the Hazard Marshal's assembly lines.
 *  Appending it after every boss keeps all existing boss identity indexes
 *  stable while giving the finale a separate InstancedMesh on Map 2. */
export const FINALE_VOLTLING_TYPE_INDEX = 9;

export function isBossTypeIndex(typeIndex: number): boolean {
  return ENEMY_TYPES[typeIndex]?.isBoss === true;
}

/** Hazard Marshal — the fixed finale of the arc (docs/PLAN_MAPA2.md §3).
 *
 *  Two separate things live here. ARRIVAL: the Marshal enters when Map 2's
 *  waves end, not through an optional portal, and it is presented with the
 *  SAME telegraph language every Map 1 boss gets. PHASES: the three-phase
 *  moveset of 3.B, cumulative on purpose — each threshold ADDS a verb instead
 *  of replacing the previous one, so the escalation is legible without asking
 *  the player to re-learn the fight twice mid-kill. */
export const FINAL_BOSS = {
  arrival: {
    /** Ring around the PLAYER the Marshal materializes in.
     *
     *  `distMin` is a no-touch guarantee: player radius 0.7 + boss radius 3.1
     *  = 3.8 units of contact, so 15 leaves the arrival outside any chance of
     *  a free hit and still inside the player's reaction space. It matches
     *  BOSS.spawnMinDistFromPlayer's intent (14) for the same reason.
     *
     *  `distMax` is bounded by the FRAME, not by taste. The camera sits at
     *  (0, 24, 19) with a 50 degree vertical fov, which leaves roughly 29
     *  units of visible ground above the player and only ~13 below — the ring
     *  is therefore filtered by a real projection test at placement time
     *  (Game.isPointOnScreen), never by a hardcoded angle that would go wrong
     *  the moment the aspect ratio changes.
     *
     *  15-21 -> 11-15 (2026-08-19), because the frame test grew teeth: it now
     *  checks the whole BODY BOX — head and both flanks — instead of the point
     *  the feet stand on (see bodyHeight/bodyHalfWidth). Measured at 16:9, a
     *  Marshal standing 19 units up-screen projects its head off the top of
     *  the frame: on screen by its feet, decapitated by the edge. Against the
     *  real body the old ring left 8% of its bearings usable at 16:9 and almost
     *  none at 4:3; this one leaves 51%, 39% at 16:10 and 19% at 4:3.
     *
     *  11 is still 2.9x the 3.8 units of contact reach, and nothing can be
     *  standing there when it lands: the arrival telegraphs for 2.5 seconds. */
    distMin: 11,
    distMax: 15,
    /** Height of the Marshal's body in world units, for the frame test.
     *
     *  The camera looks DOWN, so a body's feet and its head are far apart on
     *  screen — checking the ground point alone is what let an arrival lose its
     *  head to the top edge. MEASURED off the live model (geometry bounding box
     *  x instance scale = 9.87), not estimated: the first guess here was 7, and
     *  tools/finale-runtime-check.mjs is what caught it. That check re-measures
     *  every run and fails if the model ever outgrows this number. */
    bodyHeight: 10,
    /** Half the body's width, same job on the horizontal axis: an arrival whose
     *  centre clears the right edge can still have a shoulder outside it. */
    bodyHalfWidth: 3.5,
    /** Free ring around the body ON TOP of its own radius. The Marshal must
     *  land with room to move, not wedged between two foundry pillars: Map 2
     *  scatters 54 props plus a perimeter tower ring, so "somewhere clear" and
     *  "somewhere it can fight" are not the same question. */
    clearance: 3.5,
    /** Fraction of the half-frame kept as a margin in the projection test, so
     *  the arrival can never land flush against the screen edge. 0.15 -> 0.06
     *  once the test started checking the whole body box: the margin used to be
     *  a blunt stand-in for the body's own size, and now that the size is
     *  measured directly, keeping both would reject bearings that read fine. */
    screenMargin: 0.06,
    /** Same telegraph window as a Map 1 summon (BOSS.summonDelayS = 2.5): beam
     *  strobe plus expanding warning rings at the arrival point before the body
     *  exists. Kept as its own number because the finale may want a longer
     *  build-up later without lengthening every totem summon in the game. */
    telegraphS: 2.5,
    /** Nothing the player owns discharges while that telegraph runs (user
     *  2026-08-20). Orbits keep turning and cooldowns keep running — the fight
     *  opens with the salvo they were owed — but no shot, no slab, no acid and
     *  no weapon cue lands on top of the entrance. Only here: on Map 1 the
     *  swarm is still on the player while the portal charges. */
    holdPlayerFire: true,
    /** Placement samples before the arrival gives up and the finale retries on
     *  the next frame (Game.startFinale re-arms the structural trigger). */
    placementAttempts: 96,
  },
  /** The arena the finale is fought in. When Map 2's clock runs out the sector
   *  is RESET behind the same fade curtain a sector crossing uses: the field is
   *  wiped, the player returns to the centre, and the scatter props are rolled
   *  again with the middle of the map left empty. The fight then opens on clean
   *  ground instead of wherever the last ten minutes happened to leave things. */
  arena: {
    /** No scatter prop may stand within this radius of the arena centre.
     *
     *  28 -> 40 (user playtest 2026-08-19: "se puede quedar el boss pillado con
     *  ellos y nos interesa el maximo espacio libre"). 28 covered what the
     *  encounter strictly needs — the arrival ring (15) plus the body and its
     *  clearance (3.1 + 3.5) — but the Marshal is 6.5 wide and steers around
     *  obstacles like everything else, so a prop it clips is a boss that stops
     *  advancing for reasons the player cannot see. 40 is an 80-unit-wide floor
     *  to fight on, and the foundry still reads as itself from there out to the
     *  wall at 89. Map 2's props scatter from 8 (cells), 18 (gates) and 22
     *  (pillars) out to 86, so this pushes them outward rather than deleting
     *  them. */
    clearRadius: 40,
    /** …and the scatter is THINNED on top of that hole. A clear middle with a
     *  dense rim still funnels the fight into the rim the moment either side
     *  moves, and the boss is the one that pays: it is the only body on the
     *  field big enough to snag on a pillar. */
    propDensity: 0.45,
    /** Heal to full when the arena resets.
     *
     *  Same reasoning as the sector crossing (PLAN_MAPA2 0.3): surviving the
     *  foundry's ten minutes is the achievement, and arriving at the climax on
     *  4 HP decides it before it starts. It is a flag rather than a hardcoded
     *  heal because it is a design call, not a mechanic — flip it to false and
     *  the finale becomes a survival test of everything before it. */
    healToFull: true,
  },
  /** The Marshal coming apart, and the pause before the results.
   *
   *  The kill used to open the results screen on the SAME FRAME, so the death
   *  explosion was drawn once and then covered — the payoff of the whole arc
   *  lasted 16 milliseconds (user 2026-08-19). The run is over the instant it
   *  dies; what this buys is the time to watch it happen. */
  victory: {
    /** Total hold before the results screen opens. */
    holdS: 1.6,
    /** The body comes apart in STAGES rather than one puff: a 9.87-unit machine
     *  bursting in a single frame reads as an enemy dying, not as a boss. */
    burstSteps: 5,
    burstStepS: 0.13,
    burstPerStep: 26,
    hotPerStep: 10,
    /** Spread of each stage around the body, so the explosion has volume. */
    spread: 3.2,
    /** Height the debris is thrown from, walking DOWN the body per stage —
     *  it comes apart from the head first, then collapses. */
    topHeight: 8.4,
    color: 0xfdb601,
    hotColor: 0xf8fbff,
    ringColor: 0xff3355,
    ringCubes: 34,
    ringRadius: 6.5,
    shakeAmp: 0.9,
  },
  /** Height of every ground telegraph this fight draws. Just under the player
   *  marker (0.075) so the two never z-fight when the player stands in a zone,
   *  and above the floor plane so a foundry plate cannot swallow it. */
  markerY: 0.06,
  /** HP scales with the level the run arrives at, same contract as BOSS. */
  hpLevelReference: 30,
  hpLevelMin: 0.85,
  hpLevelMax: 1.6,
  /** HP fractions where phase 2 and phase 3 begin. Descending, by LIFE and
   *  never by clock: a fight that changes on a timer punishes a strong build
   *  for killing fast.
   *
   *  Exact thirds (user 2026-08-19). They were already 0.66/0.33, which is
   *  within 0.7% of this — the change is that the intent is now written down
   *  rather than approximated, so nobody later "tidies" them to 0.7/0.35 and
   *  quietly moves where the fight turns. */
  phaseThresholds: [2 / 3, 1 / 3],
  /** The phase change itself: the boss roots, flares, and announces. This is
   *  the rare event the `hit`/stagger clip is reserved for (3.A.2) — routine
   *  damage stays tint-only because it arrives too often for a clip to finish. */
  phaseChange: {
    staggerS: 1.4,
    shakeAmp: 0.5,
    burstColor: 0xfdb601,
    burstCount: 34,
    hotColor: 0xf8fbff,
    hotCount: 12,
    ringColor: 0xff3355,
    ringCubes: 26,
    ringRadius: 5.4,
  },
  /** Baseline discharge, live in every phase — the fight's heartbeat, and the
   *  behavior the provisional integration pass already validated. Cooldown is
   *  indexed BY PHASE, so the same verb tightens as the fight escalates. */
  discharge: {
    cooldownS: [6.5, 5.5, 4.5],
    telegraphS: 1.1,
    projectiles: 16,
    /** 13 -> 18 (measured 2026-08-19). At 13 against a player who runs at 11
     *  the shots close at 2 units per second: from the 15 units they are fired
     *  at, a fleeing player is caught in seven and a half seconds, which is
     *  longer than the shots live. The ring was therefore decoration for
     *  anybody moving away — it could only ever hit someone standing still.
     *  18 closes at 7 and catches them in two. 18 -> 21 (user 2026-08-19) —
     *  10 u/s of closing speed, so the ring is a threat while it crosses rather
     *  than something a runner slowly loses. */
    projectileSpeed: 21,
    /** FRACTION of the player's max HP (user 2026-08-19). Percentages, not flat
     *  numbers: the fight has to read the same at level 10 and at level 45, and
     *  a boss tuned against a 100 HP baseline stops threatening the moment Max
     *  HP cores land. Armor still applies afterwards — this is what the attack
     *  ASKS for, exactly like every other damage source in the game. */
    projectileDamagePct: 0.2,
    shoveRadius: 12,
    shoveForce: 14,
  },
  /** PHASE 1 — sector sweep. A wedge of the floor lights up, aimed at the
   *  player, and then discharges.
   *
   *  Damage is above a boss touch (16) on purpose: this one is telegraphed for
   *  1.3s and has a way out, so paying attention has to be worth more than
   *  tanking it. It is still nowhere near the 62.5 DPS that got a boss's touch
   *  rejected in 2026-07-30, because it fires at most once per cooldown. */
  sweep: {
    firstDelayS: 3.4,
    cooldownS: [7, 6, 4.6],
    telegraphS: 1.3,
    halfAngleDeg: 42,
    radius: 20,
    /** 25% of the player's max HP. See discharge.projectileDamagePct for why
     *  every number in this fight is a fraction now. */
    damagePct: 0.25,
    /** Amber: the Marshal's own body colour, so origin and destination of the
     *  attack wear the same colour (rule of two halves). */
    color: 0xfdb601,
    hotColor: 0xf8fbff,
    /** The discharge LEAVES THE BODY: cubes erupt from the Marshal's chest at
     *  this height before the wave travels down the floor (user 2026-08-19,
     *  "que ese ataque electrico es una descarga que sale del modelo 3d"). The
     *  model is 9.87 tall, so this is roughly its chest. Without it the attack
     *  reads as the FLOOR doing something near a boss that happens to be stood
     *  there — the two-halves rule, which every other effect here obeys. */
    dischargeHeight: 5.6,
    dischargeCount: 26,
    dischargeHotCount: 12,
    /** Cube fans thrown along the arc when it discharges. */
    arcSteps: 9,
    burstPerStep: 3,
    /** How long before the discharge the "about to blow" cue fires. The WAV is
     *  authored to be exactly this long so it PEAKS on the hit — the
     *  zero-latency rule: animation-coupled audio is cut against the real
     *  constant, never by ear. */
    warnLeadS: 0.4,
    /** The blast that replaces the old single puff of cubes. It travels: each
     *  step throws an arc of cubes further out, so the discharge reads as a
     *  wave sweeping down the wedge rather than as one flash at the boss. */
    blastSteps: 4,
    blastStepS: 0.055,
    /** Seconds the marker stays up after firing, flashing white and expanding.
     *  Hiding it on the same frame as the damage is what made the attack look
     *  like it had simply switched off. */
    flashS: 0.18,
    flashScale: 1.06,
    /** Shake on the discharge. Below the boss-summon 0.72: this happens every
     *  few seconds, and a screen that never settles stops meaning anything. */
    shakeAmp: 0.38,
    /** Ground shock ring at the boss, in the two-halves language: the arc is
     *  the destination, this is the origin. */
    ringCubes: 22,
    ringRadius: 4.2,
  },
  /** ASSEMBLY LINES — the Marshal calls in a growing Foundry roster. Live in
   *  EVERY phase; the phase decides how many lines open and which new threat
   *  joins them, not whether any do.
   *
   *  This is the fight's pressure engine, and the reason it exists is measured:
   *  with the ambient waves paused, NOTHING on the field can reach a player who
   *  keeps moving. The boss walks at 4 against a player who runs at 11, its
   *  sweep is telegraphed for 1.3s and its discharge is a 16-shot ring with ~6
   *  units of gap between shots at the range it is fired from. A first human
   *  playtest took literally zero damage across a whole fight. Reinforcements
   *  are what take the player's space away, and only then does the rest of the
   *  kit have something to punish.
   *
   *  They drop AROUND THE PLAYER, not at the perimeter. Perimeter bays were the
   *  first attempt and they never mattered: 46 units of walking at Voltling
   *  speed 5.5 is eight seconds against a player who is already somewhere else. */
  assembly: {
    /** First call of the fight. Short on purpose: the pressure has to arrive
     *  while the player is still reading the boss, not forty seconds in. */
    firstDelayS: 4.5,
    /** Per phase. Tightens as the fight escalates. */
    cooldownS: [8, 6.5, 5],
    /** Ground warning before they land. Long enough to move out of one drop,
     *  short enough that the whole ring cannot be walked out of. */
    telegraphS: 1.4,
    /** Drop points per call, per phase (user 2026-08-19: escalate up to six).
     *  Two is a nudge, four is a box, six is a ring you have to pick a gap in —
     *  at radius 9 six points leave 9.4 units between them, which is passable
     *  for a 1.4-wide player but only if they commit early. */
    dropPoints: [2, 4, 6],
    /** Bodies per drop point, per phase — coming DOWN as the points go up.
     *
     *  Six points at the old five bodies each would be 30 per call every 5s in
     *  phase 3, which is 6 bodies a second on top of a 320 ceiling: the drops
     *  would stop being a beat and become the whole fight, and the boss's own
     *  telegraphed attacks — the part that took three passes to make matter —
     *  would go back to being scenery. At 3 each the pressure still doubles
     *  across the fight (8 -> 12 -> 18 per call) while the SHAPE, not the
     *  volume, is what escalates.
     *
     *  RAISED BACK to 4/5/6 after the user playtested it (2026-08-19): 8 / 20 /
     *  36 bodies per call, 7.2 a second in phase 3. The concern above is on the
     *  record and was overruled by play, which is the right way round — the
     *  ceiling of 320 live bodies is what still stops it becoming a wall. */
    perPoint: [4, 5, 6],
    /** How far from the player each drop opens. Outside contact reach so
     *  nothing materializes on top of them, inside the distance a Voltling can
     *  actually close before the player has left the county. */
    /** Distance from the (led) player each drop opens at, PER PHASE. It grows
     *  with the number of points (user 2026-08-19: "que no se te echen todos
     *  encima de golpe"): six points on a 9-unit ring sit 9 units apart and all
     *  land inside one reaction, while at 14 they sit 14 apart and there is
     *  room to slip between two of them. A Voltling covers that extra distance
     *  in under a second, so the drop still reaches — the fix is spacing, not
     *  distance for its own sake. */
    ringRadius: [9, 11, 14],
    ringRadiusJitter: 2.5,
    /** Fraction of the telegraph the drop LEADS the player by.
     *
     *  Measured, and it is the difference between this attack mattering and not
     *  existing: the telegraph is 1.4s and the player runs at 11, so a ring
     *  drawn around where they stand lands 15 units behind a fleeing player —
     *  further than the ring's own radius of 9. A kiting bot took ZERO hits
     *  before this. Leading by the telegraph puts the box where they are going.
     *  Below 1 on purpose: a perfect lead is unfair, this one can be broken by
     *  turning, which is exactly the skill the attack should ask for. */
    leadFraction: 0.8,
    /** Cap on that lead, so a sprint across the arena cannot fling the drop
     *  into a wall on the far side. */
    leadMax: 13,
    /** One type per drop area, per phase. Earlier threats stay in the roster as
     *  the ring grows: original Voltling + Roller, then Axle Runner, then
     *  Slagcaster. The additional Roller areas preserve the previous pressure
     *  mix while each phase introduces exactly one new Foundry threat. */
    typeIndexesByPhase: [
      [FINALE_VOLTLING_TYPE_INDEX, ROLLER_TYPE_INDEX],
      [
        FINALE_VOLTLING_TYPE_INDEX,
        ROLLER_TYPE_INDEX,
        FOUNDRY_AXLE_RUNNER_TYPE_INDEX,
        ROLLER_TYPE_INDEX,
      ],
      [
        FINALE_VOLTLING_TYPE_INDEX,
        ROLLER_TYPE_INDEX,
        FOUNDRY_AXLE_RUNNER_TYPE_INDEX,
        ROLLER_TYPE_INDEX,
        FOUNDRY_SLAGCASTER_TYPE_INDEX,
        ROLLER_TYPE_INDEX,
      ],
    ],
    /** The drop itself hurts: bodies materialize where the marker was, and
     *  standing in a spawn that was telegraphed for 1.4s should cost something.
     *  Small on purpose — it is a nudge to move, not one of the three attacks:
     *  15% of max HP against the 25% the two signature attacks ask for. */
    damagePct: 0.15,
    /** On TOP of the live wave multiplier (see EnemySystem.waveHpMultiplier).
     *  The Marshal's own reinforcements should outlast an ordinary spawn: they
     *  are there to take space, and a body that dies to one pass of the build
     *  never takes any. Deliberately modest — this is the pressure knob with
     *  the shortest path to unfair, because the drops land ON the player. */
    hpMultiplier: 1.4,
    /** Hard stop: never top the field up past this many live bodies. */
    maxActiveBodies: 320,
    /** Cyan: distinct from the sweep's amber and the overload's red, so the
     *  three telegraphs can never be confused for one another. */
    color: 0x2ee6de,
    markerRadius: 2.8,
  },
  /** PHASE 3 — core overload. A chain of hazard zones erupts outward FROM the
   *  boss along the player's bearing, one after another.
   *
   *  Deliberately anchored to the boss and marching outward: the one previous
   *  ground-zone attempt in this project (Crusher stage C, rejected on sight
   *  2026-08-07) was born 7 units away from a focus the boss had just grabbed
   *  elsewhere, so it read as unrelated. Origin and destination are both on
   *  screen here, and nothing else fires during the chain. */
  overload: {
    cooldownS: 8,
    telegraphS: 1.15,
    zones: 4,
    /** Delay between consecutive zones in the chain — the "sequential" part. */
    zoneStepS: 0.45,
    firstDistance: 6.5,
    stepDistance: 6.5,
    /** THREE PARALLEL LINES with dodge lanes between them (user 2026-08-19),
     *  fanned across the player's bearing rather than one chain at it. Parallel
     *  and not radial on purpose: a radial fan wide enough to leave a lane at
     *  the FIRST zone needs ~88 degrees of spread, which stops reading as one
     *  attack with lanes and becomes three separate attacks. */
    lines: 3,
    /** Lateral gap between line centres. 14 -> 18 (user 2026-08-19: room to
     *  dodge). With the growth below the lanes are now 11.6 / 10.3 / 8.9 / 7.6
     *  units against a player 1.4 wide — still narrowing as the wave travels,
     *  which is the shape that matters, but a lane you can take late instead of
     *  one you have to commit to before the first step lands. Three lines at
     *  this offset span 46 units including the far zones, inside the 80-unit
     *  clear floor the arena reset leaves. */
    lineOffset: 18,
    /** Each zone is BIGGER than the one before it (user 2026-08-19): the blast
     *  grows as it leaves the boss, so the far end of the attack covers more
     *  ground than its root and the lanes narrow with it. */
    zoneRadiusStart: 3.2,
    zoneRadiusEnd: 5.2,
    /** 25% of max HP per link. Four steps of three lines means a player who
     *  reads none of it eats several — the lanes are the counterplay, not a
     *  small number. */
    damagePct: 0.25,
    color: 0xff3355,
    hotColor: 0xf8fbff,
    /** The eruption of ONE link. Raised across the board 2026-08-19: at 16+5
     *  cubes and nothing else it read as a marker switching off, not as a zone
     *  blowing up. Every number here is per-link, so four of them land inside
     *  two seconds — which is exactly why the shake is small and the flash is
     *  short. A big shake four times over is not four times as dramatic, it is
     *  a camera that never settles. */
    burstCount: 30,
    hotCount: 14,
    ringCubes: 18,
    /** Just outside the zone's own radius: the ring shows where it STOPPED.
     *  A multiplier rather than a length, because zones now grow along the
     *  chain and a fixed ring would land inside the far ones. */
    ringRadiusScale: 1.14,
    /** The marker whites out and expands instead of vanishing on the same
     *  frame as the damage — the same treatment the sweep's wedge gets. */
    flashS: 0.16,
    flashScale: 1.35,
    shakeAmp: 0.2,
    /** One missile per zone, fired from the Marshal's BACK racks and arriving
     *  exactly when its zone erupts (user 2026-08-19). The flight time is not a
     *  number here on purpose: it is the zone's own telegraph, so the missile
     *  lands ON the eruption by construction rather than by tuning. */
    missile: {
      /** Launch point: behind the body, at rack height. */
      backOffset: 2.4,
      launchHeight: 6.2,
      /** Peak of the arc above the straight line, as a fraction of the flight
       *  distance. Enough to read as a lob over the swarm, not a mortar. */
      arcHeight: 0.22,
      /** 0.55 -> 0.9. A single small box read as a dot at this camera height;
       *  the body is built from voxel-sized blocks like everything else, so it
       *  has to be big enough for those blocks to be separable on screen. */
      size: 0.9,
      color: 0xff3355,
      hotColor: 0xf8fbff,
      /** Warhead tint — hotter than the body so the NOSE leads the read. */
      noseColor: 0xffd166,
      /** Cubes shed per second along the flight, from the TAIL rather than the
       *  centre: an exhaust plume, not a body shedding pieces. */
      trailPerSecond: 60,
      /** Every Nth trail cube is white-hot, so the plume flickers instead of
       *  being one flat ribbon of colour. */
      trailHotEvery: 3,
      launchBurst: 14,
      /** Rolls around its own axis in flight. Slow — a fast spin on a body this
       *  size reads as a glitch rather than as flight. */
      spinHz: 1.4,
    },
    /** The Marshal itself gets faster for the last third. */
    speedMult: 1.15,
  },
} as const;

export const ENEMIES = {
  spawnRingMin: 32,
  spawnRingMax: 44,
  /** Seconds between spawn waves at difficulty 0 and 1. */
  waveIntervalStartS: 2.8,
  waveIntervalEndS: 0.65,
  /** Enemies per wave at difficulty 0 and 1.
   *  A1 (2026-07-30): 3 → 4. The measured cause of "the game feels static" is
   *  the first two minutes, not the last two. Tried 6 first — too much stacked
   *  on top of the front-loaded curve, which multiplies the same window. */
  waveSizeStart: 4,
  waveSizeEnd: 16,
  /** HP multiplier gained per minute of run time (linear ramp).
   *
   *  0.38 → 0.30 (2026-07-30 playtest: "mucho más difícil que antes incluso
   *  con todo desbloqueado"). Difficulty rose from four directions at once
   *  today — density floor, wave size, a front-loaded curve and a reordered HP
   *  ladder that raised the Sparkrunner 35% and the Gunner 20%. This is the
   *  ONE global lever that eases the whole run proportionally without undoing
   *  any of the relative ordering, which the same playtest said was right. */
  hpRampPerMinute: 0.3,
  /** Spatial-grid cell size for the separation pass. */
  separationCellSize: 2.6,
  /** Exact-overlap recovery uses this epsilon and stable angular stride. */
  coincidentSeparationEpsilon: 0.0001,
  coincidentSeparationAngleStep: 2.399963229728653,
  bossContact: {
    /** Head-on CCD keeps routing momentum without producing a radial snap. */
    headOnTangentFraction: 0.35,
    headOnTangentMax: 0.75,
  },
  obstacleAvoidance: {
    lookAhead: 5,
    clearance: 0.45,
    steerStrength: 1.65,
    bossLookAheadMultiplier: 1.55,
    resolvePasses: 2,
    /** Side selection ignores centreline noise below this magnitude. */
    sideChoiceEpsilon: 0.001,
    /** Baseline tangent contribution before proximity and urgency. */
    minimumSteerWeight: 0.35,
  },
  /** Concurrent-enemy cap at difficulty 0 and 1: waves pause while the field
   *  is saturated, so early builds are never drowned by sheer population.
   *  A1 (2026-07-30): 28 → 45 → 38. The i-frame caps damage RATE at 20 DPS,
   *  but density raises the DUTY CYCLE — more bodies means being in contact
   *  more of the time — so density does add danger, just not the way the cap
   *  suggests. 70 was called too hard, 45 close but still heavy at the very
   *  start. 38 eases only the opening: this is the floor of a lerp to 380, so
   *  lowering it fades out as the run ramps and leaves the CURVE — which the
   *  playtest said was right — untouched. */
  maxActiveStart: 38,
  maxActiveEnd: 380,
};

/** Rustbrute: the heavy. Speed 2.6 made it a moving dam — faster enemies
 *  piled into it because `pushApart` splits overlap 50/50 along the
 *  centre-to-centre axis, so anything arriving head-on is pushed BACKWARD
 *  rather than around. Two fixes, together:
 *
 *  1. `blocksOthers` on the type makes it a dynamic obstacle, so the existing
 *     avoidance pass steers others AROUND it instead of into it.
 *  2. A telegraphed lunge, so being slow is its identity rather than its only
 *     trait — it arrives late but it arrives hard.
 *
 *  Balance: charge speed lands just UNDER PLAYER.moveSpeed, and the lunge is
 *  committed to a straight line. So it nearly catches a player running in a
 *  line, and always misses one who sidesteps. The rooted recovery afterwards
 *  is the reward for reading the telegraph. */
export const RUSTBRUTE = {
  /** Distance at which it commits. */
  chargeRange: 9,
  /** Wind-up. Short on purpose (user: "retraso mínimo") — long enough to read
   *  as a telegraph, short enough that ignoring it still hurts. Paired with a
   *  colour tint so the tell is visual, not just a pause. */
  telegraphS: 0.45,
  /** 2.6 × 4.2 ≈ 10.9, a hair under the player's 11. */
  chargeSpeedMultiplier: 4.2,
  chargeDurationS: 0.55,
  /** Rooted after the lunge — this is the counterplay window. */
  recoverS: 0.7,
  /** Minimum gap between lunges. */
  cooldownS: 2.5,
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

/** Foundry Gunner presentation and its deliberately isolated trial overrides.
 * Shared cooldown, damage and travel speed remain owned by GUNNER above. */
export const SLAGCASTER = {
  /** Foundry-only standoff. At the unchanged 12 u/s projectile speed this
   * leaves roughly 1.17 s of visible travel from the outer edge. */
  preferredDist: 14,
  deployDurationS: 0.72,
  retractDurationS: 0.48,
  fullyDeployedProgress: 0.999,
  /** Brief planted-pose read before the first shot; repeat cadence stays on
   * GUNNER.shootCooldownS. */
  firstShotDelayS: 0.2,
  /** Approximate radius of the approved compact endpoint, used for rolling. */
  rollingRadius: 0.61,
  projectile: {
    /** The visual reaches about 1.05 units across; the smaller collider keeps
     * the hot slag bolt readable without making near misses feel dishonest. */
    visualDiameter: 1.05,
    collisionRadius: 0.42,
    height: 1,
    spinRate: 5.5,
    mantleColor: 0xff6a00,
    emberColor: 0xffa51f,
    hotCoreColor: 0xffd36a,
  },
  /** Semantic-part activation windows over global deployment progress. */
  transform: {
    stagger: {
      shell: [0, 0.58],
      anchors: [0.08, 0.76],
      crucible: [0.2, 0.88],
      cannon: [0.34, 1],
    },
    /** Normalized deployed-bounds cuts used to assign vertices to parts. */
    semantic: {
      anchorMaxY: -0.16,
      anchorMinAbsX: 0.24,
      cannonMaxX: -0.34,
      cannonMinY: -0.12,
      crucibleMinY: 0.58,
    },
  },
} as const;

export type SlagcasterTransformConfig = typeof SLAGCASTER.transform;

export const FLYER = {
  /** 2.6 → 1.1 (2026-07-30 playtest: beams visibly missed drones that were
   *  taking damage, worst with the Welder).
   *
   *  Combat is deliberately 2D — every weapon tests `visibleFrom(px, pz, e.x,
   *  e.z)` and every impact is `spawnBurst(x, z)`, with no Y anywhere in
   *  weapons.ts. That is the right call for an auto-aiming bullet heaven: the
   *  player never aims at height, so hit detection must not care about it.
   *  A drone at 2.6 floated ~2.2 above the plane where combat actually
   *  happens, so the beam was honestly drawn where the hit honestly landed
   *  and the DRONE was the thing out of place. 1.1 still reads as hovering
   *  while keeping the body inside the combat plane.
   *
   *  The alternative — threading a Y through targeting, VFX, the burst pool
   *  and damage numbers for all 11 weapons — buys visual precision nobody
   *  aims with, and risks every weapon's VFX. Not worth it. */
  hoverHeight: 1.1,
  bobAmplitude: 0.4,
};

export const ELITES = {
  /** Elite chance ramps with the unified difficulty scalar. */
  chanceAtMaxDifficulty: 0.05,
  /** Floor so an elite is POSSIBLE as soon as the gate opens. Chance is
   *  `chanceAtMaxDifficulty * difficulty`, and difficulty near the gate is
   *  small, so without a floor the first elite was effectively unreachable
   *  until minutes later — an event the player never learns exists. */
  chanceFloor: 0.01,
  /** 240 → 90 → 135 (2026-07-30 playtest). Elites were impossible for the
   *  first 4 minutes of a 10-minute run, which fights the whole point of
   *  front-loading density: the most memorable event was banned from the
   *  window we are trying to make interesting. 90s landed them before the
   *  player had a build; 2:15 still opens the event far earlier than 4:00.
   *  Paired with the HP ramp below — the gate existed because a flat 6x HP
   *  elite at minute 1 is unkillable, not because elites are wrong early. */
  minRunTimeS: 135,
  /** Kept modest on purpose: elites must never approach boss silhouette size. */
  scaleMultiplier: 1.35,
  /** Elite HP ramps with run time instead of being a flat 6x. At the 90s gate
   *  the player has a level-1..3 weapon, and 6x there is not a fight, it is a
   *  wall that follows you for the rest of the run. Lerps hpMultiplierEarly →
   *  hpMultiplier between minRunTimeS and hpFullAtS. */
  hpMultiplierEarly: 2.5,
  hpMultiplier: 6,
  hpFullAtS: 300,
  xpMultiplier: 6,
  /** Elite payout scales with the difficulty scalar, but only the part ABOVE
   *  1 — and time alone tops out at exactly 1, so this is nonzero only when
   *  the player has stacked Cursed Core. Self-inflicted difficulty pays; the
   *  clock does not. Applied to elite XP and to the elite gold bonus. */
  rewardScalesWithDifficulty: true,
  /** Magenta tint applied through instanceColor. */
  tint: 0xdd55ff,
  /** Behaviors that can roll elite. 'charger' added 2026-07-30: the Rustbrute
   *  moved from 'chase' to 'charger' that day and silently dropped out of the
   *  elite pool as a side effect. This restores it — an elite charger is a
   *  bigger, telegraphed lunge, which is a fine elite. */
  behaviors: ['chase', 'roller', 'charger'] as EnemyBehavior[],
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
    /** 2.4 -> 1.4 (playtest 2026-07-26). Volt Pulse read as weak to start with,
     *  but its damage was not the problem: it needs about four enemies inside
     *  the radius just to match Bolt Cannon, and that density does not exist in
     *  the first minutes — an mid-run weapon handed to a starting player.
     *  Raising damage would inflate the late game, where it is already strong.
     *  The dead air was the real cost: unlike Orbital Blades, where the player
     *  controls contact by moving, Pulse offers nothing to do between shots.
     *  ONE change this pass — damage deliberately untouched. */
    cooldownS: 1.4,
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
    /** Damage per tick at ramp 0.
     *
     *  4 → 3 (2026-08-01 playtest). On paper 4 was fine — 4 / 0.25s = 16 DPS,
     *  identical to Bolt's 12 / 0.75s. The nominal numbers hide the real gap:
     *  a beam NEVER MISSES and has zero downtime, while Bolt fires a
     *  projectile that travels and is wasted whenever its target dies first.
     *  So Bolt's 16 is a ceiling and the Welder's 16 was a floor. Add the 4x
     *  ramp on a held target and it was the strongest thing in the arsenal
     *  before any scaling.
     *
     *  Deliberately NOT touching rampCap: rewarding a held lock is the
     *  weapon's identity and the reason it works on bosses. If it still reads
     *  as too strong, the sharper lever is charging a short spin-up when the
     *  target CHANGES — right now re-aggro is free, which quietly contradicts
     *  a design built around commitment. */
    damage: 3,
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

/** Weapons that are benched: their code, icon, VFX and upgrade branches all
 *  stay intact, but they can never enter play through ANY door — profile
 *  unlocks, the level-up draft, or the dev unlock panel. Re-enabling one is
 *  deleting its entry here (a contract reward queue may also need it back).
 *
 *  Oil Sprayer, benched 2026-07-26: it deals no damage at all, so it reads as
 *  a dead pick in a level-up draft. Kept whole in case it returns redesigned.
 *  Removing it from the contract queue was not enough — a profile that had
 *  already unlocked it kept it forever, and "Unlock everything" handed it back. */
export const DISABLED_WEAPONS = new Set<WeaponId>(['oil']);

/** The single question every weapon pool must ask before offering an id. */
export function isWeaponAvailable(id: WeaponId): boolean {
  return !DISABLED_WEAPONS.has(id);
}

/** Every weapon that can currently reach a player, in registry order. */
export function availableWeaponIds(): WeaponId[] {
  return (Object.keys(WEAPON_INFO) as WeaponId[]).filter(isWeaponAvailable);
}

/** Which weapons HUNT rather than clear.
 *
 *  Splitting the arsenal by role is the fix for bosses being unkillable, and
 *  it is deliberately a build decision rather than a global patch: a loadout
 *  either packs an answer to big targets or it does not. Biasing EVERY weapon
 *  toward the boss would be worse than the bug — the swarm chewing on the
 *  player would become free damage while the whole arsenal stared past it.
 *
 *  The hunters are the single-target weapons that already carry an explicit
 *  `range` (bolt 26, welder 14, dismantler 12) — they were designed to pick
 *  one thing and commit. Clearers (pulse, blades, tire, press, acid, turbine,
 *  ricochet) keep pure nearest-first, so the swarm still gets answered.
 *
 *  The value is how much closer a boss "reads" to a hunter: 3 means a boss at
 *  18 units beats trash at 10. It never extends a weapon's actual reach.
 *
 *  Applied at exactly three call sites in weapons.ts — Bolt's volley loop,
 *  the Welder's beam lock and the Dismantler's strike. Grep BOSS_TARGET_BIAS
 *  to find them; a registry Set here would just be a second place to forget to
 *  update. */
export const BOSS_TARGET_BIAS = 3;

/** The bias EVERY other weapon gets.
 *
 *  Hunters-only was wrong as shipped, and a playtest found it immediately: the
 *  run had Turbine and Ricochet, so the fix did nothing and the boss stayed
 *  untouchable. That matters more than it sounds, because killing a boss is a
 *  MANDATORY progression gate — the only additional weapon socket sits behind it. A
 *  required gate must never depend on drafting one of three specific weapons.
 *
 *  So the floor is mild: any build can chip a boss down, a hunter build does
 *  it properly. The difference stays a real build decision without ever being
 *  a lockout. Kept well under the hunter value on purpose — at parity the
 *  whole arsenal would stare past the swarm chewing on the player. */
export const BOSS_TARGET_BIAS_BASE = 1.5;

export const MAX_WEAPON_LEVEL = 20;

/** One Core magnitude per rarity: [gray, green, blue, purple, gold]. */
export type CoreTierMagnitudes = readonly [number, number, number, number, number];

/** Unit definitions, not balance knobs. Percentage ratings use 1.0 as 100%. */
export const STAT_RATING_UNITS = {
  armorFullScale: 1,
} as const;

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
  armor: [0.08, 0.11, 0.15, 0.25, 0.35],
  regen: [1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6],
  'max-hp': [15, 20, 25, 45, 65],
  evasion: [8, 11, 14, 22, 30],
  thorns: [6, 9, 12, 20, 28],
  lifesteal: [0.1, 0.5, 1, 1.5, 2],
  duration: [0.1, 0.13, 0.16, 0.25, 0.35],
  luck: [0.04, 0.08, 0.1, 0.14, 0.2],
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

/** Character tuning. Registry/copy lives in characters.ts; every gameplay
 * magnitude stays here so a balance pass has one source of truth. */
export const CHARACTER_BALANCE = {
  fieldEngineer: {
    maxHp: 110,
    moveSpeed: 11,
    damage: 0.95,
    attackSpeed: 1,
    critChance: 0.05,
    critDamage: 0.5,
    armor: 0.05,
    regen: 0,
    luck: 0,
    fieldRepairFraction: 0.01,
  },
} as const;

export const PROFILE = {
  /** Stable character ids. Contracts may append future characters. */
  unlockedCharacters: ['field-engineer'],
  /** Weapon sockets: 2 default, +1 via contract (max 3). */
  weaponSockets: 2,
  /** Core sockets: 2 default, +2 via contracts (max 4). */
  coreSockets: 2,
  /** Design ceilings — the HUD shows the gap as locked sockets. */
  maxWeaponSockets: 3,
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
    /** Legacy name: force chests to Orb Siphon's intrinsic tier. Keep false outside tests. */
    forceGreenChests: false,
    /** The next eligible chest grants Orb Siphon for XP-vacuum testing. Keep false outside tests. */
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

/** Card tier roll weights (gray→gold) and how fractional Luck rating shifts them upward.
 *  Effective weight = base + luck * luckShift.
 *  A 0.10 Luck rating means 10%, but it is not a direct +10 percentage-point
 *  rarity chance: the shifted weights are normalized by the complete pool.
 *  At 0 Luck, three cards have a 5.881% chance to show any purple/gold card
 *  and a 0.599% chance to show at least one gold card. Common Lucky Gear
 *  raises those chances to about 11.633% and 2.857%, respectively. */
export const TIERS = {
  weights: { gray: 62, green: 27, blue: 9, purple: 1.8, gold: 0.2 },
  luckShift: { gray: 0, green: 0, blue: 45, purple: 35, gold: 20 },
};

export const BOSS = {
  totemDistMin: 45,
  totemDistMax: 65,
  /** Where the NEXT portal rises after a kill, measured from the player.
   *
   *  45-65 is right for the first one: it is a landmark you spot and choose to
   *  walk to, and the walk is the commitment. Charging that same toll again is
   *  pure tax — the discovery beat has already happened, and the run has ten
   *  minutes total. Combined with respawnDelayS, reaching a second boss was
   *  costing roughly a twentieth of the run in transit alone, before the fight.
   *
   *  Roughly half the distance: ~2-3s of walking at PLAYER.moveSpeed, so the
   *  next portal is a destination rather than an expedition. Deliberately not
   *  zero — a portal that lands on top of you is not a place you go. */
  respawnTotemDistMin: 22,
  respawnTotemDistMax: 34,
  /** Radius of the summon zone; inside it the Interact prompt shows.
   *  The key itself is the rebindable 'interact' action (settings). */
  totemActivateRadius: 4.5,
  /** Tracks the portal model's voxelSize (registry.ts). Scaled with it on
   *  2026-08-06 (2.3 -> 3.1) so the player still stops at the slab's face
   *  instead of walking into the widened visual. */
  totemColliderRadius: 3.1,
  respawnRetryS: 1,
  /** Delay between pressing the summon key and the boss appearing (the totem
   *  spins up as the telegraph), and the minimum distance from the player at
   *  which the boss materializes — never on top of them. */
  summonDelayS: 2.5,
  spawnMinDistFromPlayer: 14,
  /** The run continues after a boss kill: a new totem rises after this delay
   *  and each successive boss gets tougher. Chests dropped per boss kill. */
  respawnDelayS: 25,
  /** Boss HP scales with the player's LEVEL at summon time.
   *
   *  Measured 2026-07-30 against 11 real runs: total damage dealt per run
   *  spans p25 = 2,241 to p90 = 95,543 — a 40x spread. A fixed boss HP cannot
   *  serve that. At 2,600 flat the boss had MORE hp than a below-median run
   *  deals in its entire ten minutes, while a strong build erased it in
   *  seconds. There was no correct number to pick, which is why balancing it
   *  by feel kept failing.
   *
   *  So the listed `hp` is now the value at `hpLevelReference`, scaled by the
   *  player's level and clamped. Summon at 12 and you fight a level-12 boss.
   *  The clamps matter as much as the slope: the floor stops an early summon
   *  from being free, and the ceiling stops a level-40 run from turning the
   *  fight into a sponge. */
  hpLevelReference: 24,
  hpLevelMin: 0.35,
  hpLevelMax: 1.6,
  respawnHpGrowth: 1.6,
  chestsOnKill: 3,
  /** 25 → 12 (2026-07-30). This is a regression fix, not a nerf.
   *
   *  The global i-frame means contact damage is really damage PER 0.4s window,
   *  so 25 was 62.5 DPS — three times deadlier than being buried in the entire
   *  swarm (capped at 20 DPS no matter how many bodies touch you). Standing
   *  next to a boss killed a full-health player in 1.6 seconds, against the
   *  ~30 seconds of committed damage needed to kill one. No amount of thinning
   *  or shoving the swarm could close a 19x gap, because the swarm was never
   *  what was killing the player.
   *
   *  It reads as an oversight rather than intent: PLAYER.invulnAfterHitS went
   *  0.85 → 0.4 in the 2026-07-05 playtest, which silently DOUBLED boss
   *  contact DPS, and this number was never revisited. 12 restores roughly the
   *  original 29 DPS. Touching a boss is still by far the worst thing on the
   *  field — it just stops being instant death.
   *
   *  12 -> 16 (2026-08-18). NOT a reversal of the above: that fix was calibrated
   *  against a swarm capped at 20 DPS, and the Map 2 work moved that cap. The
   *  relationship 12 was protecting — "a boss touch is the worst thing on the
   *  field" — had quietly broken: the strongest ambient hit in the game (a Map 2
   *  elite, 8 x 1.35 x 1.5 = 16.2) had grown PAST a boss's touch.
   *
   *  16 restores the ordering in Map 1 with room to spare (elite 10.8 -> boss 16,
   *  48% clear) and still dies at 2.5s against the 1.6s that got 25 rejected.
   *  The per-map factor below carries it the rest of the way in Map 2.
   *
   *  The rule this must keep obeying, and the reason the test exists: on EVERY
   *  map, ambient < elite < boss, and a boss must never approach the 62.5 DPS
   *  that made standing next to one an instant loss. */
  contactDamage: 16,
  /** How hard a connecting ram flings the player. Decays with
   *  STATUS.knockbackDecay like every other knockback, so the distance
   *  travelled is roughly force / decay — 30 / 6 = ~5 units, enough to clear
   *  the King's body (2.9) plus the player's (0.7) with margin to spare.
   *
   *  Context (2026-08-06): the player had NO collision with a boss body at all
   *  — refreshCollisionObstacles built its list from props, portal, merchant
   *  and pickups, never from the enemy pool. The King lunges at 22 against a
   *  player who moves 11, so it simply passed through and kept the player
   *  inside its volume for the whole 0.9s lunge. At one hit per 0.4s i-frame
   *  that is up to three hits, 36 HP, with no counterplay.
   *
   *  The fling is LATERAL, across the lane, never along it: pushing the player
   *  down the charge line just leaves them bulldozed by a faster body.
   *
   *  30/6 first, and it read as a TOW: same 5 units, but spread over a full
   *  second, 95% of it done by 0.5s and the rest a crawl. A shove and a tow
   *  differ by the shape of the curve, not the distance — so the force went up
   *  and the decay up harder, keeping ~4.3 units while collapsing the whole
   *  motion into ~0.24s. Its own decay rather than STATUS.knockbackDecay,
   *  because the swarm wants the opposite curve: bodies blown away should
   *  float, the player should be struck. */
  ramKnockbackForce: 70,
  ramKnockbackDecayPerS: 16,
  /** A ram is not an ordinary graze. Sits between VISUAL.screenShake.hitAmp
   *  (0.22) and bossKillAmp (0.55) — the impulse is sold by the camera as much
   *  as by the displacement. */
  ramShakeAmp: 0.45,
  /** World units the swarm is pushed out of around a live boss.
   *
   *  The boss fight was unwinnable for a structural reason: weapons pick the
   *  nearest enemy, and trash packed against a boss is always nearer than the
   *  boss. Clearing a ring gives the player somewhere to stand where the boss
   *  IS the closest thing — so it fixes the fight from the geometry side while
   *  HUNTER_WEAPONS fixes it from the targeting side.
   *
   *  Reuses the dynamic-obstacle pass built for the Rustbrute, just with a
   *  radius far larger than the body. Keep it modest: too wide and the arena
   *  reads as an artificial bubble instead of a boss shoving its way clear. */
  clearRadius: 7,
  /** Ambient wave output while a boss is alive, as a fraction of normal.
   *
   *  The user proposed this first and I under-weighted it, arguing it treated
   *  the symptom rather than the targeting root cause. Targeting is fixed now,
   *  and the playtest showed the remaining blocker is exactly what they said:
   *  a wall of trash between the player and the boss. The clear ring even made
   *  that worse — repelling bodies out to radius 7 builds a shell right where
   *  the player has to walk in.
   *
   *  0.45 dampens rather than stops. A boss fight should still be a bullet
   *  heaven, and the Crusher's own minions are meant to be the phase's
   *  pressure — that is what makes it read as a fight rather than a duel in an
   *  empty field. */
  /** Ambient wave output while a boss is alive, lerped by difficulty.
   *
   *  A flat fraction was wrong: 45% removes ~40 bodies at minute 2 and ~170 at
   *  minute 9. Same percentage, completely different pressure — and minute 9
   *  is exactly when the player finally has the damage to try a boss. The
   *  dampening now bites HARDER the later the fight happens, so the window to
   *  stand still and commit stays roughly constant across the run.
   *
   *  Never zero: a boss fight should still be a bullet heaven, and the
   *  Crusher's own minions are meant to carry the phase's pressure. */
  spawnDampenEarly: 0.7,
  spawnDampenLate: 0.3,
  /** Radius the Crusher's lunge shoves bodies out of, and how hard.
   *
   *  It SHOVES rather than kills on purpose. Killing would need a death
   *  pipeline here (XP, gold, VFX, and an obvious summon-and-farm exploit);
   *  shoving reuses applyKnockback, reads better — bodies flung off the
   *  boss's path — and does the actual job, which is opening the lane the
   *  player has to stand in. */
  chargeShoveRadius: 4.5,
  chargeShoveForce: 26,
  /** The Tesla shoves on every burst instead, so both bosses speak the same
   *  language: the biggest thing on the field pushes everything else aside. */
  burstShoveRadius: 6,
  burstShoveForce: 18,
  crusher: {
    // No `speed` here. It looked like it lived in this block for months and
    // nothing ever read it — boss.ts takes the base speed straight from
    // ENEMY_TYPES. Same dead-value trap BOSS.tesla.preferredDist carried until
    // 2026-07-30, and a duplicate that disagrees with the live one is worse
    // than no value at all: it silently absorbs the tuning meant for the fight.
    chargeTelegraphS: 0.9,
    chargeSpeed: 22,
    chargeDurationS: 0.9,
    chargeCooldownS: 6,
    minionIntervalS: 10,
    minionCount: 4,
  },
  tesla: {
    // Same dead key removed here; the Tesla's speed is ENEMY_TYPES' too.
    /** 10 → 7 (2026-07-30 playtest: "sigue estando demasiado lejos"), then
     *  7 → 4.5 (2026-08-06).
     *
     *  This value was DEAD until 07-30 — `moveGunner` read GUNNER.preferredDist
     *  for every gunner including the boss, so the Tesla held the grunt's 12
     *  units. Wiring it and dropping to 7 put it inside the reach of the short
     *  weapons (dismantler 12, welder 14) instead of only the long ones.
     *
     *  7 was still exactly wrong, for a reason that had nothing to do with
     *  weapon range: it EQUALS BOSS.clearRadius. The standoff is measured from
     *  the player and the clear ring is measured from the boss, so a Tesla
     *  holding 7 parks the player precisely on the ring's edge — the one place
     *  in the arena where the swarm piles up. Every Tesla fight was fought
     *  standing on the wall of scrap. 4.5 puts the player 2.5 units inside the
     *  clear bubble, with the boss as the nearest thing in front of them.
     *
     *  Do not raise this back toward clearRadius without moving one of the two:
     *  whenever they match, the fight is on the wall again. */
    preferredDist: 4.5,
    /** Only backs off when the player is truly on top of it. Its speed is 2.4
     *  against the player's 11, so retreat was never an escape anyway — this
     *  just stops it shuffling backwards while being shot.
     *
     *  4 → 3.4 with the standoff drop: the gunner holds still between retreat
     *  and preferred, and at [4, 4.5] that band is too thin to sit in. 3.4 also
     *  clears body contact (boss radius 2.5 + player 0.7 = 3.2) by a hair, so
     *  backing off starts before the player is inside it. */
    retreatDist: 3.4,
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
/** A2 (2026-07-30): front-loaded curve. The linear ramp spent its resolution on
 *  the minutes nobody complains about — at 60s it sat at 0.13, so minute 1 was
 *  effectively difficulty zero. `pow(t, 0.65)` roughly doubles the first minute
 *  while leaving minute 8 untouched, since pow(1) is still 1.
 *
 *  Softened 0.65 → 0.78 after the user's playtest called the opening too hard.
 *  0.65 nearly TRIPLED the first 30 seconds and stacked on top of the raised
 *  A1 floor — two multipliers squeezing the same window. */
export const DIFFICULTY_CURVE_EXPONENT = 0.78;

/** One map's difficulty sweep: where it opens, where it closes, and how long it
 *  takes. `peak` above 1 is meaningful — the spawner multiplies live cap, wave
 *  size and enemy HP by anything over 1. */
export interface MapDifficultyCurve {
  readonly floor: number;
  readonly peak: number;
  readonly rampS: number;
}

/** The curve a map falls back to when none is supplied: Map 1's, which is the
 *  historical global formula. Keeps every existing caller bit-identical. */
const DEFAULT_DIFFICULTY_CURVE: MapDifficultyCurve = MAPS[0].difficulty;

export function difficultyScalar(
  mapElapsedS: number,
  cursedBonus: number,
  curve: MapDifficultyCurve = DEFAULT_DIFFICULTY_CURVE,
): number {
  const timeRamp = Math.pow(Math.min(mapElapsedS / curve.rampS, 1), DIFFICULTY_CURVE_EXPONENT);
  const base = curve.floor + (curve.peak - curve.floor) * timeRamp;
  return Math.min(base * (1 + cursedBonus) + cursedBonus * 0.15, 1.6);
}

/** How much of the current difficulty is NOT owed to the clock.
 *
 *  Elite XP and gold pay a bonus for difficulty "above 1" so that stacked
 *  Cursed Core is rewarded and merely surviving is not. That worked only while
 *  1 was also the clock's ceiling. Map 2 now reaches 1.15 on time alone, which
 *  would have quietly handed the foundry a 15% elite-payout raise nobody asked
 *  for. Measuring the excess against the MAP'S peak restores the original rule
 *  on both maps: exactly 1.0 when the clock is the only thing driving pressure. */
export function rewardScalar(difficulty: number, curve: MapDifficultyCurve): number {
  return Math.max(1, difficulty / curve.peak);
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
  /** A complete run is structural now: both sectors, never elapsed time alone. */
  fullRunSectors: MAPS.length,
  fullLoadoutLevel: 25,
  /** One full run landed 625; this is meant to need a strong build, not a miracle. */
  overkillKillsInRun: 800,
  /** Longest run finished carrying ONE weapon and ZERO mods. */
  puristSectors: MAPS.length,
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
