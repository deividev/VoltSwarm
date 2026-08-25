# Trailer v1 — Steam Demo launch trailer

> **Status 2026-08-20:** PLANNED / NOT PRODUCED. No footage has been captured,
> no edit or final export exists, and nothing is approved or published. Music
> materials `CUT A/B/C/D` exist, but they are working inputs only and do not imply
> selection, approval or a finished trailer. The 13–20 August execution window
> expired without delivery and must be rebaselined before production resumes.
>
> **Scope:** the Steam Demo (`codex/demo-map1`) only — Scrapyard / Map 1, run
> ends with `Sector Cleared` only after defeating the boss; timeout without boss
> is `Sector Held`. Map 2, Swarm Foundry and Hazard Marshal are full-game
> content. Leaderboards are not implemented and are outside launch scope;
> co-op is also not a current feature. None of them may appear in a single
> frame or a single word of this trailer.

## 1. Goal and constraints

| Field | Value |
|---|---|
| Purpose | Sell the Steam Demo at its launch. Gameplay-first, no cinematic filler. |
| Length | 65 s |
| Format | 1920×1080, 16:9, H.264 MP4 |
| Player promise | A voxel industrial-toy bullet heaven: hundreds of robots converge, you only move, the machine you build does the killing. |
| Visual hook | Swarm density + the chest slot-reel, which is the identity beat against the genre's direct-reveal convention. |
| CTA | Wishlist / demo — exact wording gated on external confirmation (§7). |

**Verify before export:** exact Steam video specs and any event requirements
come from official Steam sources at export time, not from this document.

## 2. Schedule and the ordering rule

**The trailer is captured FROM THE BUILD THAT SHIPS, never before it.** Capturing
on the 12th and then tuning balance until the 19th produces a trailer that shows
a game nobody can download. That is the single non-negotiable ordering rule here.

Second ordering fact: **the trailer does not block the review submission.** Steam
review covers the build and the store assets; the video can be uploaded or
replaced afterwards. That buys the edit ten extra days of slack.

**HISTÓRICO / NO CUMPLIDO:** the dated plan below expired. Do not execute it as
the current schedule; establish a new freeze/capture/edit/export baseline first.

| Historical date | Planned work |
|---|---|
| 06–12 Aug | Demo content and balance. Last day gameplay may change. |
| **13 Aug** | **Freeze the build.** `pnpm package` + `check:release-flags` must pass. |
| 14–15 Aug | Targeted capture against the frozen build (§4). |
| 16–19 Aug | Edit + music. |
| **20 Aug** | **Submit to review.** Hard ceiling. |
| 21–31 Aug | Former rejection buffer; not a promise of delivery or review outcome. |

Music generation (§5) is the only task with no dependency on the frozen build,
so it runs in parallel from 06 Aug and must not fall into the edit window.

## 3. Beat sheet — 65 s

Cold open. No logo, no fade-in, no cinematic. The logo lockup lands at the end.

| Time | Beat | Footage | On-screen text |
|---|---|---|---|
| 0:00–0:03 | **Hook** | Already at peak density. 300+ robots converging on a centered player, weapons firing. | *(none — the screen is the statement)* |
| 0:03–0:11 | **Mechanic proof** | Player weaving, empty-handed, four weapons firing on their own. Reads auto-aim in one shot. | `YOU MOVE. YOUR SCRAP DOES THE KILLING.` |
| 0:11–0:20 | **Build** | Level-up draft, three cards legible, socket filling with the cyan pop. | `EVERY RUN, A DIFFERENT MACHINE` |
| 0:20–0:31 | **Variety** | Five hard cuts, one per musical beat: Bolt · Pulse · Tire Fire · Blades · Vortex. Each VFX visibly distinct. | *(none — the cut is the text)* |
| 0:31–0:39 | **Identity** | Chest roulette uncut: vertical reel descending → white flash → tier god-rays → icon bursting to colour. | `SPEND IT OR DIE WITH IT` |
| 0:39–0:49 | **Escalation** | Telegraphed portal (strobe beam + warning rings) → Crusher King entrance → fight. | `SOMETHING BIGGER IS AWAKE` |
| 0:49–0:58 | **Payoff** | Maximum density, screen full of dying voxel cubes → cut to the `Sector Cleared` title. | *(the HUD itself)* |
| 0:58–1:05 | **CTA** | Logo lockup over `art/steam/image/background-clean-master-3840x2160.png`. | See §7 |

**Editing rule:** no shot runs past 2.5 s except the hook and the payoff. The eye
tires before the ear does.

**CTA art, verified on disk 2026-08-06** (an earlier draft of this plan pointed at
`art/steam/capsule-bg-v2.png`, which the July cleanup deleted — it does not exist
anywhere in the repo):

| Use | File |
|---|---|
| Background | `art/steam/image/background-clean-master-3840x2160.png` |
| Mascot head | `art/steam/image/logo-mascot-v3.png` (transparent RGBA) |
| Wordmark | `art/steam/image/logo-letras-v3.png` (transparent RGBA) |
| Pre-composed alternative | `art/steam/image/library-logo-1280x720.png` — lockup already assembled; fastest route if the CTA does not need its own animation |

`Sector Cleared` is the real demo string — `src/run-history.ts`
(`RUN_OUTCOME_TITLES['sector-cleared']`). It is not invented copy.

**Changed 2026-08-06 — this improves the cut.** The boss now clears the sector,
not the clock, so `Sector Cleared` MEANS the boss died. Two consequences:

- The 0:39–0:49 boss beat and the 0:49–0:58 payoff are now connected by cause
  rather than merely adjacent. Kill it, clear it. Cut them as one movement.
- Surviving ten minutes without the boss gives `Sector Held`, a different title.
  **The trailer must not show that ending** — it is the lesser outcome and would
  read as a downbeat close.

The chest beat also moves ~2 s earlier than the table above shows, so the reel
descends over the music's breakdown and the reveal bursts on its +11.9 dB drop
(§5). Conform the picture to the take, not the take to the table.

## 4. Footage checklist

The approved store assets are **not** usable as source: the 9 GIFs in
`art/steam/gif/` are recompressed and low-framerate, and the 9 PNGs in
`art/steam/screenshots/` are stills. Everything is recaptured at 60 fps from the
frozen build.

Partially covered by the three raw runs in `art/video/Weekly2_31-07_09-08/`
(4:33 / 6:17 / 11:20): large swarm, scrapper shop, player death.

**Must be captured deliberately:**

1. 400+ swarm with the player centered — 10 clean seconds. Hook and payoff both come from here.
2. One uncut chest opening (the full 2.6 s reel transition plus the reveal).
3. Level-up draft with all three cards readable.
4. Five isolated weapon shots, each with enough enemies for the VFX to read.
5. Full boss arc: portal → spawn → fight → kill.
6. The close landing on `Sector Cleared`. **This is no longer "wait for 10:00"**
   — since 2026-08-06 that title requires killing the boss, so shot 6 is captured
   at the end of the same run as shot 5. Waiting out the clock produces
   `Sector Held`, which is the wrong ending for the trailer.

**Capture hygiene — verify in the packaged build, not in the source:**
`VISUAL.showFps=false`, `GOLD.startingGold=0`, every `RECORDING.*` override off,
`DEV_TOOLS` off. `pnpm package` aborts if a dev flag is still on, which is the
check that actually counts.

## 5. Music — RESOLVED 2026-08-06 (source picked, final in-point open)

**Winner: `tmp/music-prototypes/Trailer/Neon Swarm Trailer v1.mp3`** (3:37,
123.0 BPM). Two candidate windows were rendered from it; which one ships is
decided on the timeline against picture, not before.

Two prompt revisions exist in `tmp/music-prototypes/Trailer/PROMPT.md`. The v2
revision (open at full drive, decisive final hit) was generated and **rejected by
the user on sound** — all four surviving takes come from v1 of the prompt. Do not
re-run v2 expecting a better result.

### The selection bar inverts for a trailer cue

In-game beds are chosen for LRA ≤ ~4 — constant energy, no breakdowns. A trailer
cue wants the opposite: high dynamic range and unmistakable section boundaries.
Reject a take when the first drop lands late, the cut point is unfindable when
scrubbing, near-silence runs past ~4 s, or it drifts to cinematic/orchestral or
synthwave (already-rejected directions, `MUSIC_PROMPTS.md:70`).

**The decisive criterion turned out to be the ending, because it is the only part
that cannot be fixed by cutting.** An intro is trimmed away, an arc is reframed, an
ending has to already exist. Measured across the four takes, only the winner has
one: full level at 212.5 s, then a **monotonic** decay — the music stops and only
reverb remains, which is a clean cut point. The runner-up (`v1(2)`, better arc: 7 s
breakdown + 9 s build + drop) fails here — its level rises again after the drop
(133.4 s: −17 dB · 134.7 s: −18 dB), so that is an outro phrase fading out, with no
accent to cut on.

### Measured grid and windows

Beat = 0.488 s → **123.0 BPM** → bar = 1.9512 s. Clean beat anchor at
198.949 + 0.488·k. Last musical hit at **212.61 s**; reverb usable to ~215.5 s.

| Cut | In | Out | Length | Trade |
|---|---|---|---|---|
| `CUT-A-32bars-65s.mp3` | 150.17 s | 215.5 s | **65.33 s** | 32 bars exactly, matches the beat sheet; opens ~4 dB below full on a 6 s rise |
| `CUT-B-28bars-57s.mp3` | 158.01 s | 215.5 s | 57.49 s | opens at full drive; costs 8 s of trailer |

Additional working materials `CUT C` and `CUT D` also exist. None of A/B/C/D is
approved or a final export. A and B are documented below because they were the
measured candidates in this snapshot.

Both measured candidates end identically. Only the opening differs — judge it against a peak-density
shot, which is the whole reason the decision waits for footage.

**This changes §3:** the winner's biggest transient is **+11.9 dB at 180 s**
(the largest measured across all four takes). In `CUT-A` that lands at window-time
**0:29.8**, sitting under a breakdown that runs 0:21–0:29. So the chest beat moves
~2 s earlier than the §3 table shows: the **reel descends over the breakdown** and
the **reveal bursts on the drop**. That is better than the drafted order — the reel
is a build-and-payoff in miniature, and now it rides a real one.

### Housekeeping

Takes must come from a **paid** Suno plan (commercial-licence rule,
`MUSIC_PROMPTS.md:5-6`). **Do not delete `Neon Swarm Trailer v1.mp3`** — both cuts
are second-generation MP3 derived from it, and any third in-point, longer tail or
reframe has to come from that master; re-export it as WAV from Suno before the
final edit. `v1(2)` is retained as the only measured fallback (Suno is not
reproducible). `Overdrive Protocol.mp3` is retained on the user's call as a
possible **in-game** background bed — note its recorded LRA of 10
(`MUSIC_PROMPTS.md:36`) fails the bed bar of ≤ ~4, so it is a menu//interstitial
candidate at best, not a run bed.

**Open provenance debt:** `MUSIC_PROMPTS.md:63` still carries the
`Overdrive Protocol` trailer-candidate row. Replace it with the real winner entry
— prompt, date, file, chosen cut — once A or B is locked, or the log lies.

**If a whole batch lands soft:** regenerate at 126 BPM and swap
`heroic synth lead hook` for `harder driving drums with tension stabs over the
pulse`. That is the `Overcharge` boss-cue DNA, so it raises aggression without
leaving the family. Change nothing else — one axis per batch, or the result is
unattributable.

## 6. Alternate hooks

Kept for the edit, in case the opening does not land:

1. **Cold on the portal.** The strobe beam breaking silence at 0:00, cut to the swarm at 0:02. Sells threat before chaos.
2. **Kill counter.** Locked HUD shot, the 💀 count climbing fast as the swarm enters frame. Sells numeric scale.
3. **One enemy → four hundred.** One second on a lone Sparkrunner, hard cut to the tide. Sells pressure progression in three seconds.

## 7. CTA — gated wording

The current public status of the Steam page requires external confirmation, so
the closing card must not promise anything unverified.

| Confirmed state | Card |
|---|---|
| Demo publicly available | `DEMO OUT NOW` / `WISHLIST VOLTSWARM` |
| Not yet available | `DEMO COMING SOON` / `WISHLIST ON STEAM` |

Both fit the same lockup; only one text layer changes. **Do not cut the CTA until
the fact is confirmed.** The canonical wishlist destination is Steam App ID
`4979220`, which is verified and may be cited.

## 8. Open decisions and risks

**8.1 — RESOLVED 2026-08-06. The boss is now the point of the run.**
It was measured that **0 bosses were summoned across 6 human runs**, including
both that reached 10:00 — the portal was optional, sat 45–65 units out, and
nothing made anyone walk to it. A blind two-judge review of Contracts confirmed
the same thing from the other side: the retention engine's heaviest rewards sat
behind content nobody touched.

Three changes shipped, and they change what this trailer can promise:

- The boss now CLEARS the sector; the clock alone does not. `Sector Cleared` is
  earned, and surviving without the boss gives `Sector Held`.
- The off-screen indicator reads **BOSS** instead of `TOTEM`.
- The portal model is ~33% larger, with its beam, ring and collider scaled to it.

**Still open, and it is the one that decides this beat:** the portal DISTANCE
(`BOSS.totemDistMin/Max`, 45–65) was not changed. Size and naming help it read
once it is on screen; distance decides whether it ever gets there. The weekend
playtest is the falsifiable test — if it comes back with 0 bosses again, distance
is the culprit and the 0:39–0:49 beat is at risk after all.

**8.2 — This trailer is not the S5 marketing beat.**
`MARKETING_PLAN_LAUNCH_2026.md:295` schedules **S5 `Voltswarm - Gameplay Trailer`
for 14–15 Oct**, gated on an approved trailer, with line 311 reserving 28 Sep–11
Oct for a private trailer draft. An August demo-launch trailer moves that two
months earlier. Unresolved: whether this becomes a new earlier beat, replaces S5,
or the two are distinct pieces. The marketing plan has **not** been amended.

**8.3 — Next Fest is not a confirmed fact.**
`MARKETING_PLAN_LAUNCH_2026.md` states in three places (lines 47, 250, 783) that
participation must not be claimed or implied without external confirmation.
October Next Fest is the motivation behind this schedule; it is not a claim this
trailer, the store page, or any post may make.

**8.4 — Internal RC only.**
End of August 2026 is an internal RC target. It is not a public release promise,
a review outcome, or an availability confirmation.
