# Audio mix acceptance — 0.30.7

**Decision:** accepted by the maintainer on 2026-08-26 after human playtesting.

## Accepted release baseline

- Current runtime-pack selection and reconstruction output.
- Current config-owned music/SFX/master levels.
- Current menu-to-run crossfade and end-of-run music lifecycle.
- Current pause/modal ducking and recovery behavior as experienced in play.

The maintainer reported that the current volumes and overall behavior work well
and approved committing, validating and packaging this version.

## Evidence boundary

No route-by-route notes, diagnostic counters, hardware measurements or
quantitative run results were supplied with the acceptance. This record does not
invent them. Automated integrity, behavior, type, build and release-guard checks
are recorded separately in the release verification output; they prove their own
contracts, not perceived loudness.

## Reopen rule

Any later change to `tools/audio/runtime-pack.json`, the `AUDIO` mix/fade values,
or the music lifecycle in `src/audio.ts`/`src/game.ts` requires a new generated
mix sheet and a fresh maintainer listening decision.
