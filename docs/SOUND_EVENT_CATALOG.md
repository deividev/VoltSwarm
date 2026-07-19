# Sound Event Catalog — Voltswarm

**Rewritten 2026-07-18** against the settled style foundation. The old
industrial-toy material catalog and its six-prototype gate are SUPERSEDED.

## Style foundation (settled in the 2026-07-18 session — laws, not suggestions)

1. **Modern only, nothing retro** — no chiptune/8-bit/square-arcade timbres,
   in SFX or music (CLAUDE.md rule). Music anchor: **"Neon Horizon"**
   (`docs/MUSIC_PROMPTS.md`), modern electric groove at 118 BPM.
2. **Zero latency** — every enabled event fully preloaded (all variants);
   animation-coupled sounds authored against the REAL animation constants
   (CLAUDE.md rule).
3. **Frequent = invisible** — high-rate sounds are noise-first, dark
   (LP ≤ ~4kHz), short (≤ ~100ms), low peak, 4 rotating micro-variants,
   never pinned to one file.
4. **Asymmetry** — weapon fire and damage feedback never share a gesture
   family (burst vs breakage), or their alternation reads as a rally.
5. **Loudness pyramid** — rewards/dangers (levelup, chest, boss) >
   weapon/ability (0.78) > xp/gold pickups (0.42/0.48) > enemy death
   (0.33, background). Music bed via `AUDIO.music.runLoopVolume`.
6. **Death follows the VFX** — enemies burst into voxel cubes, so deaths are
   cube-debris scatters (modal dice knocks), scalable per enemy size later.

## Status legend

- **DONE** — asset wired in the prototypes manifest and accepted in-game.
- **WIRED** — asset plays in-game; final verdict / long-run polish pending.
- **SILENT HOOK** — the game emits the event; no asset assigned (plays nothing).
- **TYPE ONLY** — event id exists in `AudioEventId`; nothing emits it yet.
- **NO HOOK** — neither event nor emit exists yet.

Current runtime source of truth: `AUDIO.validation.enabledEvents` (config.ts) +
`public/assets/audio/prototypes/manifest.json` (version `phase2-*`).

## 1. Integrated today (the validated foundation)

| Event | Asset (current) | Design | Status |
|---|---|---|---|
| `ui-confirm` | `modern-ui-confirm` x2 | click + warm pluck, 60ms, sharp attack; fired by the UNIVERSAL delegated click listener (all buttons/cards/selects) | DONE |
| `bolt-cannon-fire` | `burst-bolt` x4 | 3-tick electric micro-burst "brrt", peak 0.78, weapon dominates | WIRED (long-run verdict pending) |
| `enemy-death` | `cube-death` x4 | voxel cube burst: pop + dice-knock cluster + rebounds, ≤3kHz, peak 0.33, cooldown 0.16s | WIRED (long-run verdict pending) |
| `xp-pickup` | `pickup-xp` x4 | soft rising blip, 40ms, peak 0.42; accumulator number rides the player | WIRED |
| `gold-pickup` | `pickup-gold` x4 | small metallic clink, 50ms, peak 0.48 | WIRED |
| `levelup-intro` | `levelup-r8` (modern) | fanfare INSIDE the 0.72s LEVEL UP text window: impact → rising run → glory dyad | DONE |
| `levelup-open` | `modern-levelup-open` | draft-open bloom (the original approved gesture, modern voice) | DONE |
| `panel-open` | shares `modern-levelup-open` | scrapper shop open = same "options open up" beat | WIRED |
| `chest-open` | `modern-chest-open` | act 1: mechanical latch pop, 240ms | DONE |
| `chest-spin` | `modern-chest-spin` | act 2: 2.6s riser, one tick per REEL CELL at bezier-solved times, shimmer on final approach | DONE |
| `chest-reveal` | `modern-chest-reveal` | act 3: impact in the flash, arp riding the 0.6s icon rise, top note at settle | DONE |
| `foundation-music` | `music-lead.mp3` = "Neon Horizon" | in-run bed, loops on music bus, ducks on pause/menu | WIRED (provisional lead; more takes planned) |

## 2. Silent hooks (game already emits — next easy wins)

| Event | Trigger | Design brief (style laws apply) |
|---|---|---|
| `run-start` | run begins | short modern power-on rise; hands off to music |
| `menu-enter` | back to main menu | soft settle; sibling of ui-confirm family |
| `pause` / `resume` | pause toggled | tiny down-tick / up-tick pair; music duck already handles weight |
| `player-hit` | player damaged | PRIORITY sound: dark thump + alarm hint, must cut through everything |
| `shield-block` | barrier absorbs a hit | electric shield zap-crack; distinct from player-hit (no pain) |
| `merchant-arrival` | scrapper lands (banner) | arrival whoosh-thunk + brass hint; stereo allowed (sparse) |
| `shop-purchase` | item bought | confident accept clunk + small bloom (money leaves, power arrives) |
| `boss-awaken` | portal spawns boss (banner) | big telegraphed hit; pairs with portal VFX |
| `boss-defeat` | boss dies (banner) | biggest cube-burst in the game + victory bloom |
| `run-victory` / `run-defeat` | results screen | paired stingers: bloom-up vs power-down; may duck music |

## 3. Type-only events (id exists, emit missing)

| Event | Where the emit belongs |
|---|---|
| `ui-back` | back buttons / Escape closes (delegated listener could route it) |
| `levelup-pick` | card chosen in draft (distinct from generic ui-confirm?) — decide if needed |
| `weapon-activation` | generic weapon proc — probably replaced by per-weapon events (below) |
| `boss-attack` | boss telegraphs (Crusher slam, Tesla grid) |

## 4. No hook yet — full-game needs (Phase 5+ scale-out)

### Weapons (10 remaining; bolt done). Per weapon: fire/activation + optional loop/impact.
Laws: asymmetry vs deaths, frequent=invisible, keyed loops per owner (never per projectile).

| Weapon | Gesture sketch |
|---|---|
| Pulse | capacitor charge-release ring (one-shot) |
| Saw Blades | keyed spin loop + contact ticks |
| Welder | keyed arc loop, intensity payload |
| Hydraulic Press | servo drop + slam (r5 candidates exist as reference) |
| Tire | launch scrub + rolling loop (nearest-N) |
| Oil Sprayer | viscous drop, aggregate |
| Acid | throw pop + pool bubble loop (keyed) |
| Turbine | tornado loop, intensity payload |
| Junk Ricochet | throw + bounce pings (nearest bounce only) |
| Dismantler | triple claw swipe |

### Mods with audible procs (13 permanent + 4 consumables)
One proc-group cooldown; VoxelBurst VFX already gives each mod a color — audio
gives each FAMILY a gesture, not 17 unique sounds: burst-procs, aura-loops,
tint-states, pickup-consumables (Repair/Volt Cache/Frenzy/Overdrive).

### Enemies & elites
- Gunner projectile + Tesla Titan star: DANGER telegraphs — audible, distinct.
- Roller charge wind-up; Drone density hum (ONE aggregate loop, never per-drone).
- Elite death: bigger cube burst (lower, denser — parametric from `cube-death`).
- Basic mob deaths stay GENERIC (decision 2026-07-18: per-type death adds no
  attributable information at swarm scale; size-scaling is a cheap later win).

### Bosses & portal
- Portal: idle loop (keyed) → telegraph strobe ticks → eruption burst.
- Per-boss attack set (Crusher slam, Tesla grid charge) + shared awaken/defeat.

### World / meta
- Map ambience bed per map (scrapyard first) — ONE keyed stereo loop, quiet.
- Music states: menu theme ("Overdrive Protocol" candidate), boss layer,
  results sting; more combat beds from the Neon Horizon prompt (2-3 rotating).
- Chest deny (can't afford), shop leave/deny, socket fill, upgrade discard,
  banner generic whoosh, low-HP warning loop (careful: annoyance risk).

## Production notes

- All current assets are DSP-generated by `tools/audio/prototype-*.mjs`
  (deterministic, seeds in-script) — regenerate, never hand-edit wavs.
- ElevenLabs (`tools/audio/elevenlabs-sfx*.mjs`, key in `.env`) remains the
  texture-rich alternative; every timing-critical asset must be trimmed to its
  animation window.
- Storm rules unchanged: voice caps, cooldowns, aggregation, keyed loops
  (`AUDIO.voiceCaps`, `AUDIO.cooldownS`).
- The legacy pack under `assets/audio/sfx/` + `paths.finalManifest` is still
  the REJECTED tech fixture; final shipping assets will graduate from the
  prototypes manifest into a regenerated final pack with provenance.
