# Sound Event Catalog — Voltswarm

**Rewritten 2026-07-18** against the settled style foundation. The old
industrial-toy material catalog and its six-prototype gate are SUPERSEDED.

> ⚠️ **PENDING — HIGH PRIORITY (user 2026-07-21): full SFX VOLUME-BALANCE pass.**
> The set is not level-balanced — some sounds sit right, some too low, some too
> high (surfaced when the welder was nearly inaudible over music at ~50%). Must be
> judged IN-GAME over the music bed. Two knobs per sound: `normalize(peak)` in the
> generator + `emit({volume})` at the call site. Target = the loudness pyramid
> (law 5). Current effective-level map lives in memory `sfx-volume-balance-review`.

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
| `chest-reveal` | `modern-chest-reveal` | act 3: impact in the flash, arp riding the 0.6s icon rise, top note at settle. **Fijado a la variante 0 desde `AUDIO.fixedVariantIndex`**: el manifiesto conserva otros candidatos para audición, pero una run normal ya no los sortea. Un pin dev sigue teniendo prioridad. | DONE |
| `foundation-music` | `music-lead.mp3` = "Neon Horizon" | in-run bed, loops on music bus, ducks on pause/menu | WIRED (provisional lead; more takes planned) |
| `menu-music` | `menu-music.mp3` = "Neon Swarm (4)" | title-screen theme, starts on first menu gesture, hands over to the run bed on Play | WIRED |
| `player-hit` | `player-hit` x2 | PRIORITY danger: metallic clang + heavy sub thud + downward stress bend, peak 0.85 | WIRED (batch A, verdict pending) |
| `shield-block` | `shield-block` x2 | positive twin: bright electric deflect crack + barrier ting, no low thud, peak 0.72 | WIRED (batch A, verdict pending) |
| `boss-portal` | `boss-portal` | 2.5s telegraph charge (rising drone + beam-synced strobe pulses + surge), keyed one-shot cut on spawn; fires on `summonJustBegan` | WIRED (batch B, verdict pending) |
| `boss-awaken` | `boss-awaken` | telegraph impact → rising electric power surge → eruption, peak 0.92 | WIRED (batch B, verdict pending) |
| `boss-defeat` | `boss-defeat` | giant cube collapse + triumphant rising synth victory bloom, peak 0.9 | WIRED (batch B, verdict pending) |
| `run-start` | `run-start` | quick power-on rise, hands off to music | WIRED (batch C) |
| `menu-enter` | `menu-enter` | soft settle returning to menu | WIRED (batch C) |
| `pause` / `resume` | `pause` / `resume` | mirrored down-tick / up-tick pair | WIRED (batch C) |
| `run-victory` / `run-defeat` | `run-victory-b` / `run-defeat` | anthem: build → major-chord landing / machine power-down | WIRED (batch C; victory reworked to an anthem) |
| `merchant-arrival` | `merchant-arrival` | whoosh → landing thunk → inviting chime | WIRED (batch D) |
| `shop-purchase` | `shop-purchase` x2 | mechanical accept clunk + rising confirm bloom | WIRED (batch D) |

## 2. Silent hooks — ALL CLEARED ✅

Every hook the game emits now has a wired sound (batches A–D done). The only
remaining event ids are TYPE-ONLY (nothing emits them yet) — see §3. Next:
the closing validation passes, then the Phase 5 catalog scale-out (§4).

## 3. Type-only events (id exists, emit missing)

| Event | Where the emit belongs |
|---|---|
| `ui-back` | back buttons / Escape closes (delegated listener could route it) |
| `levelup-pick` | card chosen in draft (distinct from generic ui-confirm?) — decide if needed |
| `weapon-activation` | generic weapon proc — probably replaced by per-weapon events (below) |
| `boss-attack` | boss telegraphs (Crusher slam, Tesla grid) |

## 4. No hook yet — full-game needs (Phase 5+ scale-out)

### Weapons — hooks wired for ALL 11 (`WEAPON_FIRE_SFX` in game.ts maps each
WeaponId → its own event; weapons without an enabled asset fall back to the
silent `weapon-activation`). Per-weapon events in AudioEventId. Laws: asymmetry
vs deaths, frequent=invisible, keyed loops per owner (never per projectile).

| Weapon | Event | Status / gesture |
|---|---|---|
| Bolt | `bolt-cannon-fire` | DONE (electric burst "brrt") |
| Pulse | `pulse-fire` | WIRED ✓ user-liked: punchy release + full ring + low body |
| Hydraulic Press | `press-slam` | WIRED ✓ user-liked: servo whine drop → heavy slab slam |
| Junk Ricochet | `ricochet-throw` | WIRED ✓ user-liked v4: springy ELECTRIC launch ("dwip" + wobble tail). NOT metal-impact — 3 ping/clank takes failed ("crystal/glass"); electric-spring direction won. **Lesson for remaining weapons: our world is electric, not acoustic-metal.** |
| Saw Blades | `blades-spin` + `blades-loop` + `blades-hit` | DONE (user-accepted 2026-07-21): rev one-shot on the spin-up edge + a **seamless breathing loop** (`blades-loop`, sfx-bus keyed, suspended under overlays) + a **metallic SHEAR hit** (`blades-hit` v7 — resonant-noise shear, NOT modal ring; modal read as "struck glass", same as the ricochet). First sfx-bus keyed loop — see the sfx-loop infra note below. |
| Welder | `welder-beam` | DONE (user-accepted 2026-07-21 "el sonido de arc me vale"): sustained electric-arc LOOP via the sfx-bus keyed-loop path. Beam ignites (acquires target) → `startWeaponLoop`; drops target → `stopWeaponLoop`. Removed from `WEAPON_FIRE_SFX` (its `weaponActivated` fires per tick → would machine-gun a one-shot). |
| Tire | `tire-launch` | WIRED (2026-07-21, v2 pending verdict): "Tire Fire" = burning tire rolls in a line. v1 (rubber scrub + spring) REJECTED — represented nothing of the weapon. v2 = fiery WHOOMP + heavy dark-rubber thud + rolling flame-crackle tail that dopplers away. |
| Oil Sprayer | `oil-drop` | periodic — viscous drop |
| Acid | `acid-throw` | WIRED (2026-07-22, pending verdict): "Acid Drum — lobs drums that burst into a corrosive zone". Lob whoosh → wet BURST/splash → corrosive FIZZ + discrete chemical BUBBLE blips + an energized green edge (palette tie). Chemical fizz+bubble = a signature nobody else has. `prototype-r31-acid.mjs`. **Pool-sizzle loop DONE 2026-07-22 (`acid-loop`, DISTANCE-ATTENUATED):** one shared corrosive sizzle (fizz + bubbles + low hum, seamless) plays while ANY zone lives; its volume fades with the player's distance to the NEAREST pool (world-positioned sound). `prototype-r32-acid-loop.mjs`; config `AUDIO.acidLoop` (baseVolume 0.42, maxHearingDistance 32). |
| Turbine | `turbine-launch` + `turbine-loop` | WIRED (2026-07-22, pending verdict). **Launch (v1 RESTORED):** airy fan spin-up whine + swirling wind-VORTEX whoosh + launch gust + airy top. The v2 "electric energy vortex" was REJECTED ("no me gusta nada") — reverted to the airier v1 the user preferred. `prototype-r30-turbine.mjs`. **Travel-roar LOOP (`turbine-loop`):** a swirling wind roar while any tornado flies, DISTANCE-ATTENUATED to the nearest tornado (the world-distance rule) — it fades as the tornado spins off. `prototype-r33-turbine-loop.mjs`, config `AUDIO.turbineLoop`. Named user-facing unit "vortex" (not "tornado"). |
| Dismantler | `dismantler-swipe` | DONE (user-accepted 2026-07-22): "Heavy claw strike, executes <15% HP". Light STRIKE lead-in + mechanical servo + a DOMINANT, clearly-articulated TRIPLE torn shred ("shk-shk-shk", spaced ~45ms, gritty low-Q rakes) + amber edge. v1's shred was masked under a heavy strike+sub; v2 made the shred lead the mix. Heavier/darker than the light blades-shear so the two don't collide. `prototype-r29-dismantler.mjs`. |

**Sfx-bus keyed-loop infra (added 2026-07-21 for Saw Blades + Welder — the
pattern for ALL continuous weapons).**
- `AudioEvent.bus?: 'sfx' | 'music'` lets a loop pin to the sfx bus (loops used
  to default to the music bus, wrong for weapons: it obeyed the Music slider +
  fought the 2-voice music cap).
- `CombatCtx.startWeaponLoop(id)` / `stopWeaponLoop(id)`; game.ts maps them via
  `WEAPON_LOOP_SFX` — now `{ id, volume }` per weapon (blades quiet 0.22 ambient,
  welder present 0.55 beam — they must NOT share one level). Emits `loop:true,
  bus:'sfx', priority:5` (survives sfx-cap eviction), stops by owner key.
- **Weapon-hit hook:** `CombatCtx.weaponHit(id)` → `WEAPON_HIT_SFX` (blades →
  `blades-hit`), cooldown-throttled so a swarm reads as a steady tick.
- **Frame-driven suspension (single choke point, self-heals every tick):**
  `game.frame()` calls `setSfxLoopsSuspended(state !== 'playing')` — weapon loops
  go silent under ANY overlay; and `setPaused(state ∈ {paused, levelup,
  levelup-intro, chest, shop, ended})` — the run MUSIC ducks under any in-game
  overlay, the same treatment pause already gave it. Both no-op when unchanged.
- **WORLD-DISTANCE ATTENUATION — a RULE (user 2026-07-22).** A sound that happens at a world position AWAY from the player gets quieter with distance (imitating real distance); player-centered fires (bolt/pulse/blades/welder/press/ricochet — the effect originates at/around the player) play at full volume. The player is the listener (`AudioDirector.setListener(px,pz)`, updated each frame in `game.update`). Two mechanisms:
  - **One-shots:** `emit({ pos:{x,z} })` → the director scales volume by `AUDIO.spatial` (linear from 1 at the listener to `minVolume` 0.35 at/beyond `maxHearingDistance` 40 — a floor so your OWN weapon stays audible at range). Threaded via `CombatCtx.weaponActivated(id, x?, z?)`. Applied: **acid-throw** (drum lands away) + **dismantler-swipe** (claw strikes the enemy). Player-centered weapons pass no pos.
  - **Loops:** the weapon drives volume per-frame via `CombatCtx.setWeaponLoopVolume(id, vol)` → `AudioDirector.setLoopVolume(key, vol)` (smooth ramp, coexists with overlay-suspend). Applied: **acid-loop** — AcidWeapon starts it SILENT (no full-volume blip) and each frame sets `AUDIO.acidLoop.baseVolume × (1 − dist/maxHearingDistance)` from the player to the NEAREST live pool (one shared voice, nearest wins).
  - **Future:** any weapon whose effect lives in the world (e.g. a turbine TRAVEL-roar loop for the tornado, projectile impacts) should follow this rule. Turbine's current LAUNCH one-shot fires AT the player, so it's full-volume by design; a travel loop would attenuate.
- **Loop lifecycle bug FIXED 2026-07-21:** `stopLoop` now frees the `keyed` key
  IMMEDIATELY (not on the voice's ~0.16s `onended`), so a quick stop→restart
  (welder re-attack) isn't rejected as a duplicate and left silent. onended's
  identity check guards a reclaimed key.
- **Loop assets must be seamless** — tail→head wrap-crossfade, NO `fadeEdges`
  (`prototype-r26-blades-loop.mjs`, `prototype-r28-welder-loop.mjs`).

**Distinctiveness rule (review 2026-07-21):** only 2 weapon sockets, but any PAIR
can be equipped, so no two sounds may blend. CONTINUOUS loops are the highest
risk (they overlap constantly). Never let two loops share their movement
signature — blades and welder v1 both used a 45 Hz tremolo + slow breath and
blended; welder was rebuilt (crackle-led, no tremolo, epic energy core) to
separate them. blades = low breathing hum; welder = bright energetic beam.

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

## Closing validation (once ALL SFX are wired)

Two passes before audio is declared done, in a real long run with music playing:
1. **Cohesion pass** — listen to every SFX over the Neon Horizon bed; flag any
   that "sounds like another game" (watch the most physical ones: cube death,
   player-hit). No retro, no clash with music or the voxel visuals.
2. **Volume-balance pass** (user-requested 2026-07-19) — re-tune every event's
   peak against the whole mix, not in isolation. The loudness pyramid (law 5)
   is the target; per-event peaks live in the generators + `AUDIO.cooldownS`
   spacing. Adjust and regenerate until nothing fights and nothing hides.

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
