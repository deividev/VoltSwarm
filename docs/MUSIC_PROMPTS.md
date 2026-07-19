# Music Prompts — Suno Provenance

Working log of the Suno prompts behind Voltswarm's music. Every generated take
that survives into the game (or a soundtrack pack) must trace back to an entry
here, per `AUDIO_AUTHORING_PIPELINE.md` (provenance + commercial-license rule:
takes must be generated under a PAID Suno plan).

## ✅ "Neon Horizon" — in-run combat bed (style anchor)

- **Date:** 2026-07-18
- **Status:** current in-game bed (`music-lead.mp3` = base take, 3:23, LRA 3.6).
  Chosen by the user over sisters (1) (real breakdown at 2:02, rejected) and
  (2) (more flourish, lost the in-game A/B).
- **Style prompt:**

```
Driving mid-energy electronic groove instrumental for a colorful action game about endless robot waves. Deep pulsing synth bass arpeggio, punchy steady drum groove with forward drive, catchy flowing modern synth lead melody, clean mix with breathing room between layers. Confident relentless momentum that nods hard without rushing, electric and alive, fun but focused, not frantic, not laid-back, not dark. Steady 118 BPM, constant driving intensity, no breakdowns, seamless loop feel, no vocals.
```

- **Exclude styles:**

```
vocals, chiptune, 8-bit, retro, arcade, synthwave, industrial, hardstyle, drum and bass, dubstep, epic cinematic, orchestral, lo-fi chill, ambient, acoustic
```

- **Why it won (session learnings):** energy bisection landed at 118 BPM
  (132 = "too hectic", 105 = "too paused"); every style-pure direction failed
  (dark industrial, retro machines, synthwave, cartoon funk); user rule:
  NOTHING may sound retro/old.
- **Selection criteria for new takes from this prompt:** LRA ≤ ~4 (constant
  bed, no breakdowns), 3+ minutes, verdict always in-game.

## Candidate pool for more tracks (same prompt, future variety)

Runs last 10+ minutes — plan 2-3 combat beds rotating per run/map, plus a menu
theme. "Overdrive Protocol" (older take, LRA 10, song-structured with
breakdowns) is reserved as a menu/trailer candidate, not a combat bed.

## Album plan — distinct themes, one style (soundtrack DLC candidate)

Method: the Neon Horizon prompt is the fixed DNA (bass arp, driving drums,
modern, constant intensity, no breakdowns, no vocals). Each track swaps ONLY
the scene/character sentence and, where noted, the BPM. One identity axis per
track — never more, or it leaves the family.

Template: take the anchor prompt and replace the first sentence + the lead
description with the row below. Exclude list unchanged for combat beds.

Folder convention (2026-07-19): every generated take goes to
`tmp/music-prototypes/<Track Name>/` — one folder per album slot (`Neon
Horizon`, `Molten Circuit`, `Chrome District`, `Overcharge`, `Assembly Line`,
`Menu`, `Trailer`). Winners get wired into the game; the folder set IS the
album's working tracklist.

| Track (working title) | In-game slot | Replacement identity phrases | BPM |
|---|---|---|---|
| Neon Horizon | Scrapyard bed (DONE) | — anchor as-is — | 118 |
| Molten Circuit | Foundry map bed | "...for a red-hot robot foundry. Heavier grinding bass, hotter and more percussive, hammering rhythmic drive, lead melody lower and more aggressive" | 116 |
| Chrome District | Neon-city map bed | "...for a glowing neon robot city at night. Glossier brighter synth leads, slick bouncing groove, more melodic and luminous" | 122 |
| Overcharge | Boss layer / final waves | "...for a boss showdown against a giant machine. Darker urgent edge, harder driving drums, tension stabs over the pulse — still relentless, no breakdowns" | 126 |
| Assembly Line | Second scrapyard bed (rotation) | "...calm confident groove of a factory that never stops. More hypnotic and stripped back, fewer layers, the bass arp carries everything" | 114 |
| **Neon Swarm (4)** | **Menu theme (WIRED 2026-07-19 as `menu-music.mp3`)** | main-theme prompt (memorable heroic hook, song structure welcome) — 4:14, LRA 4.5, user pick + structural winner of a 6-take batch in `tmp/music-prototypes/Menu/` | ~120 |
| Overdrive Protocol | Trailer candidate (old reserved take, pre-anchor style) | — superseded for menu by Neon Swarm (4); keep only as trailer sparring — | — |

Selection per track: same bar as always (3+ min, LRA ≤ ~4 for beds, verdict
in-game). For the DLC: export masters at full quality, record each take's
prompt + date here, and re-verify Suno commercial terms before publishing
(paid-plan generations only).

## Rejected directions (do not regenerate)

- Dark industrial machine music — "no pega con la escena".
- Chiptune-industrial / 16-bit anything — user no-retro rule (CLAUDE.md).
- Neon synthwave — "fits realistic graphics, not our voxel game".
- Playful cartoon funk — "doesn't fit the visual either".
- 105 BPM laid-back groove — "too paused".
