# Music Prompts — Suno Provenance

Working log of the Suno prompts behind Voltswarm's music. Every generated take
that survives into the game must trace back to an entry here and to the
hash-pinned runtime manifest, per `AUDIO_AUTHORING_PIPELINE.md`. For the
Steam-only launch, private provider receipts, generation URLs/IDs,
account/subscription records, and commercial-entitlement evidence are outside
the launch gate by explicit maintainer risk acceptance. This log does not claim
that those artifacts exist or prove legal entitlement.

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

## ✅ "Neon Swarm Trailer v1" — Steam Demo trailer cue

- **Date:** 2026-08-06
- **Status:** SOURCE PICKED. Master `tmp/music-prototypes/Trailer/Neon Swarm
  Trailer v1.mp3` (3:37, measured 123.0 BPM, bar = 1.9512 s). Two candidate
  windows cut from it; which one ships is decided on the timeline against
  picture, not before:
  - `CUT-A-32bars-65s.mp3` — in 150.17 s, out ~215.5 s, **65.33 s**. 32 bars
    exactly, matches the beat sheet. Opens ~4 dB below full on a 6 s rise.
  - `CUT-B-28bars-57s.mp3` — in 158.01 s, out ~215.5 s, 57.49 s. Opens at full
    drive, costs 8 s of trailer.
- **Prompt:** the **v1** revision in `tmp/music-prototypes/Trailer/PROMPT.md`. A
  v2 revision exists there (open at full drive, decisive final hit) — it was
  generated and **rejected by the user on sound**. Do not re-run it expecting a
  better result.
- **Why it won:** THE ENDING, which is the only property that cannot be fixed by
  cutting. An intro is trimmed away and an arc is reframed, but an ending has to
  already exist. Measured across four takes, only this one has a clean stop:
  full level at 212.5 s, then a **monotonic** decay — the music stops and only
  reverb remains, which is a cut point. The runner-up (`v1(2)`, better arc: 7 s
  breakdown + 9 s build + drop) fails here, because its level RISES again after
  the drop (133.4 s: −17 dB · 134.7 s: −18 dB) — an outro phrase fading out, with
  no accent to cut on.
- **Bonus:** its +11.9 dB transient at 180 s is the largest measured across all
  four takes. In `CUT-A` it lands at window-time 0:29.8, so the chest reveal is
  cut onto it.
- **Selection bar for a trailer cue INVERTS the bed rule:** beds want LRA ≤ ~4
  (constant, no breakdowns); a cue wants high dynamic range and unmistakable
  section boundaries.
- **Kept, do not delete:** the master (both cuts are second-generation MP3 from
  it; re-export as WAV before the final edit) and `Neon Swarm Trailer v1(2).mp3`,
  the only measured fallback — Suno is not reproducible, so it cannot be
  regenerated. Method for measuring takes without ears is in
  `docs/TRAILER_V1_PLAN.md` §5.

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
| **Neon Swarm Trailer v1** | **Trailer cue (SOURCE PICKED 2026-08-06)** | trailer prompt v1 — see the dedicated entry below | 123 |
| Overdrive Protocol | Possible in-game bed (menu/interstitial only) | — superseded for menu by Neon Swarm (4); NOT the trailer cue; LRA 10 fails the ≤~4 bed bar — | — |

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
