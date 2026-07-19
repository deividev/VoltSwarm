# Sound Direction — Voltswarm

## Status and gate

**Canonical direction.** The current generated `ui`/`weapon`/`death`/`pickup`/`boss`/`foundation-music` pack is a **TECH FIXTURE, REJECTED FINAL**. It remains only for routing, telemetry, and benchmark coverage. Existing build/prebuild may mechanically restore this unchanged rejected fixture when ignored local files are missing. Until the user approves this document, `SOUND_EVENT_CATALOG.md`, and the prototype gate below, do not create new final recipes/assets or perform artistic regeneration or replacement.

## Identity

Voltswarm sounds like **premium painted die-cast construction toys operating inside an abandoned futuristic factory**: dense little mechanisms, resilient painted steel, satisfying mechanical closure, and contained electricity. It is playful weight and engineered precision in a dead industrial space—not warfare, not a toy commercial, and not retro arcade.

### Industrial toy, not military sci-fi

Military sci-fi is sharp, threatening, weapon-forward, and oversized: weapon reports, armor impacts, alarms, cinematic sub-booms. Voltswarm is compact, readable, and hand-scale: stamped shells, springs returning, ratchets indexing, small motors loading, relay clicks, coils snapping, and pneumatic/hydraulic releases. Every sound should imply a mechanism someone could hold or repair.

## Material library

| Family | Core gesture | Use |
|---|---|---|
| Painted steel | coated clink, stamped-panel tick, small body resonance | UI, robots, props, chest shell |
| Springs / ratchets | index click, tension twang, pawl return | selection, blades, locks, upgrades |
| Rubber | short roll, tire scrub, compressed bounce | Tire, feet, impact cushioning |
| Relay / coil electricity | relay closure, coil tick, compact arc crack | Bolt, XP, shields, chain effects |
| Hydraulics / pneumatics | valve pop, piston thunk, short air release | Press, merchant, chest, portal |
| Compact motors | geared whirr with stepped RPM | Turbine, Welder, Blades, map machinery |
| Reward brass | small brass latch, coin cup, warm mechanical chime | Gold, chest reveal, merchant reward |

## Mix and spatial hierarchy

- **Frequent combat is mono** and dry: enemy death, XP, Gold, weapon triggers, hits. Reserve stereo for sparse ambience, music, chest/reward moments, results, and portal eruptions.
- Keep frequent transients compact: 40–180 ms; normal reward beats 180–600 ms; only state loops sustain.
- Loudness order: player hurt/boss telegraph > chest reveal/level-up > weapon trigger > enemy death > XP/Gold > ambience. Music ducks under pause and never competes with danger.
- Use intensity layers, not loudness inflation: base mechanism + optional electrical/motor layer as danger, rarity, or enemy density rises.
- Variants: 3–4 materially distinct takes for frequent one-shots; pitch randomization only ±2–4%, never a substitute for variants.

## Storm hard-stops

No per-enemy loops. Use nearest-N, aggregate payload, cooldowns, and keyed loops:

| Source | Policy |
|---|---|
| Enemy deaths / XP / Gold | aggregate bursts; global cooldown; one representative variant at a time |
| Drone / swarm motion | one density-driven aggregate hum, never a loop per drone |
| Blades / Welder / Turbine / Acid / Oil | keyed state loop per weapon owner; intensity payload updates, no duplicate loop |
| Gunner / Roller / boss actions | nearest-N one-shots, boss always wins priority |
| Portal / merchant / chest | one keyed loop/state each; cancel on state exit |

Respect existing `AUDIO.voiceCaps`, event cooldowns, priority admission, and benchmark telemetry before adding any asset family.

## Explicitly forbidden

- Realistic guns, explosions, warfare metal, radio chatter, tactical alarms.
- Gore, squelch, flesh, horror drones, long ominous beds.
- Casino jackpots/slots, fantasy bells/magic, smooth EDM risers, arcade/chiptune bleeps.
- Long reverb tails, high hiss, brittle high-frequency fatigue, wall-of-noise impacts.

## Prototype gate — material first

Produce only these six approval prototypes, then stop for user review: **UI Confirm, XP, Gold, Bolt Cannon, Enemy Death, Chest Reveal/Portal**. Each prototype must demonstrate its material family, 3 variants where frequent, mono/stereo decision, intended cap/cooldown, and an in-game capture at swarm load. Only after approval may their families scale into the catalog.
