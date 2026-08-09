# Step A — Defeat Transition Implementation Handoff

> **Status:** APPROVED. Implementation is pending.
>
> **Scope:** Implement the same defeat beat on `codex/map-2` and `codex/demo-map1`, then apply only the branch-specific result actions described below. This document records decisions; it does **not** claim that code, audio, art, or tests already exist.

## Implementation outcome

Replace the current instant jump from lethal damage to the full results overlay with a short, deterministic sequence:

1. Latch defeat and persist the finished run exactly once.
2. Freeze gameplay on the fatal frame.
3. Play a procedural voxel chassis-overload beat around the player.
4. Reveal `SYSTEM OVERLOAD`, then `Chassis integrity lost`.
5. Reveal the existing run summary using `Operational Time` terminology.
6. Enable the correct branch-specific actions.

Defeat is terminal. It must **never** advance to `NEXT MAP`. `NEXT MAP` belongs only to the approved future **Step B: sector completion / Map 1 → Map 2 transition**.

## Scope split

| Scope | Required behavior |
|---|---|
| **Shared: both branches** | Fatal-state latch, persistence ordering, frozen-scene rules, fatal audio routing, music fade, procedural voxel overload, title/subtitle, summary staging, `Operational Time`, input lock, skip timing, held-input debounce, one-shot guards, and shared tests. |
| **Map2/full game only (`codex/map-2`)** | Final actions are `NEW RUN` and `MAIN MENU`. `NEW RUN` enters the current normal new-run selection flow; it does not reuse the dead run and does not select `NEXT MAP`. Keep `runFinalized` as the terminal side-effect guard. |
| **Demo only (`codex/demo-map1`)** | Final actions are `PLAY AGAIN` and `MAIN MENU`. For now, `PLAY AGAIN` uses the Demo's current start flow. When the separately planned final-Demo single-character shortcut exists, `PLAY AGAIN` must respect that shortcut rather than restoring the older multi-step flow. Add the same one-shot finalization protection that Map2 already has. |

## Problem and current behavior

Today, both branches call `endRun('defeat')` as soon as `player.isDead` is observed. `endRun` immediately changes the state to `ended`, emits `run-defeat`, stops the run-music loop, persists the run and profile progression, settles contracts, and opens the complete results overlay. The player therefore receives data before a readable death beat.

Additional constraints found in the current code:

- `damagePlayer()` emits ordinary `player-hit` **before** `Player.takeHit()` reveals whether the hit was fatal.
- Map2 has `runFinalized`; Demo currently does not.
- The normal frame loop renders non-menu states but only advances full simulation in `playing`.
- Existing particles are voxel cubes in one `THREE.InstancedMesh`, and the loaded player is a merged voxel geometry inside `Player.mesh`; there is not one scene object per body voxel.
- `AudioDirector.stopLoop()` uses the generic fade. The approved defeat fade needs an explicit duration.
- The existing end overlay has one `Main Menu` button and displays time as `<time> survived`.
- `PlayerInput` exposes held and edge-triggered action state but has no defeat-specific release gate.

## Goals

- Make defeat legible and emotionally complete without delaying durable run recording.
- Preserve the exact existing run record → telemetry → lifetime ledger → profile save → contract settlement order.
- Keep all timing and presentation magnitudes configurable in `src/config.ts`.
- Reuse procedural voxel rendering and current UI/audio systems; remain safe with a merged player mesh and the 400+ enemy performance target.
- Make repeated callbacks, held input, browser blur, and same-frame competing outcomes deterministic.
- Keep the shared implementation portable between Map2 and Demo.

## Non-goals

- Step B sector completion, Map 1 → Map 2 presentation, or any `NEXT MAP` action.
- Demo final-sector completion presentation or Map2 final-victory presentation.
- The separately planned final-Demo single-character start shortcut.
- New authored art, animation files, music, or SFX assets. Existing manifest entries may be reused only after runtime verification.
- Ragdolls, per-voxel body disassembly, camera cinematics, slow motion, replay, revive, or checkpoint systems.
- Gameplay, balance, run-record schema, contract rules, map timing, or enemy behavior changes.
- Reduced-motion settings work; if added later, it should reduce jitter/flash while preserving the same state timing.

## Approved timing

All values below are initial tuning values and must live in `src/config.ts`. Do not hardcode them in `game.ts`, `hud.ts`, `player.ts`, `audio.ts`, or CSS-generated JavaScript timing.

| Config value | Initial value | Meaning |
|---|---:|---|
| Fatal hitstop | `0.10s` | Immediate frozen impact after the lethal hit. |
| Overload | `0.65s` | Procedural chassis-overload animation after hitstop. |
| Title reveal | `0.75s` | Absolute timestamp from the accepted fatal hit: reveal `SYSTEM OVERLOAD` and its subtitle. |
| Summary reveal | `1.20s` | Absolute timestamp from the accepted fatal hit: reveal the full summary and enable/focus actions. |
| Skip unlock | `0.55s` | Earliest time after defeat begins when a fresh, debounced confirm may skip to the completed summary. |
| Music fade | `0.45s` | Fade the run-music loop from its current gain to silence. |

### Unskipped timeline

| Time from accepted fatal hit | Phase | Required behavior |
|---:|---|---|
| `0.00–0.10s` | Fatal hitstop | Latch defeat, snapshot/persist once, lock input, start the `0.45s` music fade, emit the fatal impact sound, freeze the visible frame, and apply one bounded shake impulse. |
| `0.10–0.75s` | Chassis overload | Keep gameplay frozen. Advance only the presentation tick: merged-mesh-safe player overload and voxel particles. |
| `0.75s` | Title reveal | Show `SYSTEM OVERLOAD` with `Chassis integrity lost`; emit `run-defeat` at this title beat, not on the fatal contact frame. |
| `0.75–1.20s` | Title visible | Keep the title/subtitle visible and continue only presentation animation. Actions remain disabled. |
| `1.20s` | Summary reveal | Reveal the full existing results content with the `Operational Time` label; enable and focus the branch-specific primary action. |
| `≥1.20s` | Await action | Keep the scene frozen until an action is accepted. |

`skipUnlockS` is measured from the accepted fatal hit, not from the title. A valid skip at or after `0.55s` completes the presentation immediately: title, subtitle, full summary, and actions become visible in their final state. The skip press must be consumed and can never activate an action on the same frame.

## Defeat state and persistence ordering

Use explicit defeat phases rather than overloaded timeouts. A suggested state shape is a `defeat-transition` game state plus a small pure phase controller (`hitstop`, `overload`, `title`, `summary`, `ready`). The implementation may use equivalent names, but the transition order and one-shot behavior are fixed.

On the first accepted lethal hit:

1. Determine lethality from the **actual post-armor damage result**, after dodge/shield rules. Do not infer it from raw damage.
2. Latch terminal defeat immediately so no later system in the frame can open a level-up, chest, shop, sector transition, finale, or other terminal outcome.
3. Capture immutable end-of-run facts at the fatal instant. The run clock stops there; presentation time must never increase `durationS`, pressure metrics, damage totals, map elapsed time, or telemetry duration.
4. Set the non-playing defeat-transition state and clear/suspend pending gameplay interactions.
5. Execute terminal persistence exactly once in the existing order:
   1. `saveRunRecord(...)`
   2. `telemetry.endRun(record)`
   3. `recordRunInLifetime(record)`
   4. `saveProfile()`
   5. `settleContracts()`
6. Store the returned record/earned-contract presentation data for the later summary reveal. Do not delay durable persistence until the animation ends.
7. Start presentation audio/visual timing.

Separate **finalization** from **reveal**. `finalizeRun('defeat')` (or an equivalent extraction) owns record/profile/contract side effects; the defeat presenter owns timing and calls the HUD reveal methods. Re-entering either path must be a no-op. Map2's `runFinalized` guard remains authoritative; Demo receives the equivalent guard and resets it when building a new run.

## Frozen-scene contract

During every defeat phase:

- Do not advance `update(dt)` or `advanceRunFlow()`.
- Do not move the player, enemies, projectiles, weapons, pickups, or merchant.
- Do not spawn enemies, attacks, rewards, chests, level-ups, shops, boss events, or map events.
- Do not tick damage-over-time, invulnerability, cooldowns, temporary buffs, regeneration, run clocks, metrics, or telemetry performance samples.
- Do not resolve collision or interaction callbacks.
- Keep rendering the same world and camera so the fatal context remains visible.
- Suspend sustained weapon SFX loops immediately.

Add a **presentation-only tick** driven by clamped raw frame time. It may update only:

- the defeat phase controller;
- the procedural player overload presentation;
- defeat-owned voxel particles;
- the single bounded camera-shake decay;
- HUD title/summary reveal progress;
- skip/action input gates.

Do not call the general `VoxelBurst.update()` blindly if it would animate all pre-existing combat particles during the freeze. Either give defeat particles their own pool/presenter or explicitly define and test which particles are presentation-owned. The visual contract is "frozen battle, active defeat beat," not "all particles continue while gameplay stops."

## Fatal audio and music

- A lethal unblocked hit emits a dedicated fatal-impact cue **instead of** ordinary `player-hit`; it must never emit both.
- Nonlethal hits remain unchanged and continue to emit `player-hit` at the contact frame.
- Shielded or dodged hits cannot enter defeat and retain their current audio behavior.
- `run-defeat` is delayed until the title appears at `0.75s`. It is a presentation sting, not the physical hit.
- Start fading `foundation-run-loop` at `t=0` over exactly `0.45s`. Do not use `setPaused(true)` as the only fade mechanism because its pause duck is semantically different and may leave audible music under the sequence.
- Suspend weapon/SFX loops at `t=0`; do not wait for the next ordinary playing-state update.
- Do not assume a new fatal SFX asset exists. First audit the audio manifest/catalog. If no approved existing cue fits, keep the event hook explicit and document the missing asset instead of silently mapping an unrelated sound.
- Extend `AudioDirector.stopLoop` or add a narrowly named fade method so the caller can request `musicFadeS` without changing fade behavior for every other loop.

## Voxel chassis-overload presentation

The effect must read as an overloaded industrial toy, not gore:

1. During hitstop, flash the player with a brief hot white/amber electrical core and one restrained whole-body shake.
2. During overload, alternate hot amber/white electrical flashes with the player's cyan electrical language; emit compact voxel cube sparks upward/outward from the chassis volume.
3. Build pressure across the `0.65s` overload, then hide or power down the player body at the title handoff. Hide/deactivate shield plates and the player ground marker so they do not imply a living chassis.
4. Keep cubes palette-bound, blocky, and modest in count. No smoke cloud, gore, smooth round particles, or full-screen bloom wash.

The loaded character body is merged geometry. Therefore:

- Never assume one child object per voxel and never detach body children as "pieces."
- Traverse renderable descendants only to apply temporary material/visibility treatment, preserving and restoring original material state for the next run.
- Generate spark origins from a cached local/world bounding box or a small deterministic set of offsets around `Player.position`; do not read back arbitrary GPU vertices every frame.
- Prefer a small dedicated instanced defeat-particle pool, or extend the existing instanced particle system with a distinct defeat mode. Do not create one mesh/material per spark.
- Keep the fallback primitive rig and optional runtime-detail children safe. The effect must work before or after the async voxel-model swap.
- Expose narrow `Player` presentation methods (for example begin/tick/reset defeat presentation) rather than letting `Game` mutate private player visuals.
- Reset visibility, transforms, marker/shield state, and temporary material overrides in `Player.reset()` and any direct-run setup path.

## Camera and shake constraints

- Lock the follow target to the fatal player position for the entire sequence.
- Keep the current camera pitch, distance, field of view, and world framing. No cut, orbit, zoom, dolly, tilt, or target handoff.
- Apply at most one configured fatal impulse at `t=0`; clamp it independently of repeated contact callbacks.
- Continue shake decay on raw/presentation time so hitstop reads as impact rather than a frozen random offset.
- Do not stack the ordinary hit impulse and fatal impulse. The fatal impulse replaces it.
- The camera must settle rather than shake throughout the summary. No sustained random jitter and no CSS shake on the whole results panel.

## HUD copy and summary

The defeat presentation uses exactly:

- Title: `SYSTEM OVERLOAD`
- Subtitle: `Chassis integrity lost`
- Time label: `Operational Time`

Replace defeat wording such as `<time> survived` with an explicit `Operational Time <m:ss>` label. Do not rename persisted fields (`durationS`) or change non-defeat outcome terminology as part of Step A.

The full current summary remains available: map, level, kills, bosses, build, damage report, earned contracts, and playtest feedback. The staged presentation changes when it appears, not what is recorded. Keep reward rows hidden when nothing was earned, as today.

## Input lock, skip, and debounce

- From `t=0` until `skipUnlockS`, ignore all gameplay, pause/back, menu-navigation, confirm, pointer, and touch attempts for transition purposes.
- At defeat entry, consume/clear transient keyboard and gamepad presses and arm a release gate.
- A held movement, Interact, gamepad confirm, Start, mouse button, or touch that began before defeat must not skip, focus-change, or activate an action.
- After `0.55s`, skipping requires a **fresh press after all eligible skip inputs have been released**. Use the live Interact/confirm binding plus an intentional pointer/touch press on the transition surface. Escape/Start remains pause/back and does not skip or exit.
- A skip reveals the final summary state and actions, then re-arms the release gate. The same press cannot select `NEW RUN`, `PLAY AGAIN`, or `MAIN MENU`.
- Actions accept a fresh confirm/click only after they are visible and enabled. Ignore double clicks and repeated gamepad edges once an action has been accepted.
- Browser blur/focus must not synthesize a skip. On blur, clear transient input; after focus, require release before accepting a new edge.
- When actions become ready without a skip, focus the primary action (`NEW RUN` on Map2; `PLAY AGAIN` on Demo) for gamepad/keyboard navigation.

## Branch-specific actions

### Map2/full game

| Action | Result |
|---|---|
| `NEW RUN` | Close the defeat presentation and enter the existing normal character/start-weapon flow for a fresh run. Reset world, defeat presenter, run identity, finalization guard, input gates, audio state, and player presentation through existing reset/build seams. |
| `MAIN MENU` | Use the existing quit/reset-to-menu path, show the main menu, and start menu audio as currently designed. Do not record abandonment because the run was already terminally persisted. |

There is no `NEXT MAP` button or implicit map advance on defeat, whether death occurs on Map 1, Map 2, at a map timeout, or during a boss/finale frame.

### Demo

| Action | Result |
|---|---|
| `PLAY AGAIN` | Close the defeat presentation and use the Demo's current start flow to begin choosing/starting another run. When the separately planned final-Demo single-character shortcut is implemented, route through that canonical start seam so `PLAY AGAIN` respects it. Step A must not build that shortcut early. |
| `MAIN MENU` | Use the Demo's existing reset-to-menu path. Do not record abandonment after terminal persistence. |

The Demo remains Map 1-only. `PLAY AGAIN` starts a fresh Demo run; it never enters Map 2.

## Exact priority and edge-case rules

Apply these rules in order:

1. **Existing terminal latch wins:** if terminal finalization has already completed on a prior frame, later callbacks are ignored. Never rewrite a saved outcome.
2. **Accepted fatal damage wins the active frame:** once actual HP reaches zero, latch defeat synchronously inside the damage funnel before any later map-clock, interaction, level-up, chest, shop, or finale work can run.
3. **Defeat beats a same-frame map boundary:** if lethal damage and map duration completion are both pending in the same update, record defeat on the current map at the fatal timestamp. Do not increment `sectorsCleared`, change `mapIndex`, start the finale, or show `NEXT MAP`.
4. **Defeat beats pending rewards/UI:** discard pending level-up presentation and interaction prompts. Already earned run facts remain in the record; unclaimed UI choices are not auto-selected.
5. **Shield/dodge precede lethality:** a blocked or dodged hit is not fatal. Armor is applied before the post-hit HP check.
6. **One physical hit, one audio path:** fatal cue or `player-hit`, never both. Fatal shake or normal hit shake, never both.
7. **One persistence transaction:** contact overlap, multiple attackers, repeated animation callbacks, skips, and action clicks cannot save, settle, or submit telemetry twice.
8. **Presentation time is not run time:** the frozen sequence never changes the recorded `durationS` or any gameplay counters.
9. **Skip is presentation-only:** it cannot change the record, settle contracts again, change branch behavior, or route to an action by itself.
10. **Reset invalidates stale async work:** delayed audio/model/presentation callbacks from the dead run must not affect the next run or menu. Use a generation/token or equivalent guard where async work is involved.

## Current integration points

These are the audited seams, not claims of completed changes.

| File / symbol | Implementation responsibility |
|---|---|
| `src/config.ts` — `VISUAL`, `AUDIO` | Add all defeat timing, colors, particle counts/speeds, fatal shake, and fade values. Every magnitude belongs here. |
| `src/game.ts` — `GameState`, `frame()`, `update()`, `damagePlayer()`, `endRun()`, `buildRun()`, `quitToMenu()` | Add the defeat-transition state and presentation-only tick; detect fatality inside the damage funnel; split terminal persistence from delayed HUD reveal; enforce priority/one-shot/reset rules; route branch-specific actions. |
| `src/player.ts` — `Player.mesh`, `update()`, `reset()`, `upgradeVoxelModel()` | Provide merged-mesh-safe begin/tick/reset presentation hooks; manage material/visibility, bounding volume, marker, shadow, and shield state without per-voxel assumptions. |
| `src/particles.ts` — `VoxelBurst` or a dedicated presenter | Supply an instanced, presentation-owned voxel spark path that can tick while the battle stays frozen. Avoid per-particle draw calls and avoid animating unrelated combat particles. |
| `src/audio.ts` — `AudioEventId`, `AudioDirector.emit()`, `stopLoop()`, gain ramps | Route fatal versus ordinary hit audio, expose the exact run-music fade duration, stop sustained loops, and guard delayed emissions across reset. |
| `src/hud.ts` — end-overlay markup, constructor event bindings, `showEnd()` | Split title, summary, and action reveal; add subtitle and two actions; update defeat time copy; expose deterministic reveal/skip/focus/reset methods and callbacks. |
| `src/ui.css` — end overlay/result styles | Add phased visibility and voxel-industrial title treatment using classes/state, while retaining readable results layout and focus indication. Durations originate in config/controller, not duplicated magic numbers in CSS. |
| `src/input.ts` — `PlayerInput` edge/held state | Add a narrow transient-clear/release-gate seam if the controller cannot implement robust held-input debounce with current APIs. Preserve rebinding and DirectInput translation. |
| `src/run-history.ts` — `RunOutcome`, `RUN_OUTCOME_TITLES` | Keep `defeat` and record schema unchanged; align the displayed defeat title if the HUD still reads it from this map. |
| `src/run-flow.ts` — `advanceRunFlow()` | No Step A behavior change should be necessary. Tests must prove the defeat controller prevents this function from advancing after a fatal latch. |
| `tools/map-flow.test.mjs` and new focused transition tests | Preserve Map2 flow coverage and add pure timing/priority/one-shot tests. Demo receives equivalent shared coverage. |
| `public/assets/audio/manifest.json` and audio documentation | Audit only during implementation. Do not claim a fatal cue exists. Add/update a manifest event only when an approved asset is actually available. |

### Branch audit note

Map2 uses `currentMap`, `runFlow`, `sectorsCleared`, `mapsReached`, and `runFinalized`. Demo uses a fixed `SCRAPYARD_MAP` and currently lacks Map2's finalization guard. Do not copy Map2 map-flow assumptions into Demo when porting the shared defeat controller.

## Suggested config schema

Names may be adjusted to existing style, but keep one cohesive config object and these exact initial values:

```ts
export const DEFEAT_TRANSITION = {
  fatalHitstopS: 0.10,
  overloadS: 0.65,
  titleRevealS: 0.75,
  summaryRevealS: 1.20,
  skipUnlockS: 0.55,
  musicFadeS: 0.45,
  // Tune only after in-game measurement; values must remain here, not in systems.
  fatalShakeAmp: 0.55,
  overload: {
    primaryColor: 0xffc44d,
    hotColor: 0xffffff,
    electricalColor: 0x7ee0ff,
    // Add approved particle cadence/count/speed values here during implementation.
  },
} as const;
```

`fatalShakeAmp` and the overload magnitudes above are schema examples, **not approved numeric tuning beyond the six required timings**. The implementer must choose initial visual magnitudes in `src/config.ts`, validate them in-game, and document the measurement. Do not treat the example colors as new art assets.

Prefer a pure phase function/controller that takes current phase, elapsed presentation time, and a skip edge, and returns the next phase plus one-shot commands. This makes timing and skip behavior testable without WebGL or the DOM.

## Verification plan

### Automated tests

Add focused tests for:

- phase boundaries/reveals at `0.10`, `0.75`, and `1.20` seconds;
- skip rejection before `0.55s` and acceptance at/after `0.55s`;
- a skip reveals final state without activating an action;
- held input at death cannot skip or select; release plus fresh press can;
- fatal hit selects fatal audio and suppresses `player-hit`/ordinary shake;
- nonfatal, shielded, and dodged hits retain their expected paths;
- finalization/persistence/telemetry/contracts execute once under repeated lethal callbacks;
- record duration/counters remain unchanged while presentation ticks;
- fatal defeat at the Map 1 boundary does not advance `runFlow`, `mapIndex`, or `sectorsCleared`;
- fatal defeat during Map2 finale cannot become `run-complete` and never exposes `NEXT MAP`;
- Map2 actions are exactly `NEW RUN` + `MAIN MENU`;
- Demo actions are exactly `PLAY AGAIN` + `MAIN MENU`;
- Demo gains and resets the one-shot finalization guard;
- reset cancels stale delayed title/audio/presentation callbacks;
- the pure controller behaves consistently under one large frame delta and several small deltas.

Suggested commands after implementation (not run for this planning-only change):

```text
pnpm typecheck
node --test <new defeat-transition test>
pnpm test:map-flow
pnpm test:audio-selection
pnpm build
```

Run the repository's other affected checks and release-flag check as appropriate. Execute equivalent checks on both branches after the port.

### Runtime acceptance

Validate in Electron, not only in a browser or screenshot:

- Force a repeatable lethal hit through a development-only, release-gated harness.
- Measure phase timestamps and music gain in runtime; do not judge timing or audio from a screenshot.
- Confirm the fatal sound lands on impact, ordinary player-hit does not, music reaches silence on the configured fade, and `run-defeat` lands with the title.
- Inspect runtime state to prove enemies/projectiles/run clocks stop while only defeat presentation advances.
- Confirm the player effect works with the loaded merged voxel model, fallback primitive rig, every playable character, active shield charges, and the async model already/incompletely loaded.
- Confirm one run-history entry, one telemetry end, one lifetime update, one profile save effect, and one contract settlement under repeated collision pressure.
- Confirm keyboard, remapped Interact, standard gamepad, DirectInput gamepad, mouse, blur/focus, held input, skip, and double-click behavior.
- Confirm primary focus and both branch-specific actions.
- Confirm death on Map 1 at `9:59.9–10:00.0` remains defeat on Map 1 and never displays or enters `NEXT MAP`.
- Confirm no visible hitch and no meaningful frame-time regression with the 400+ enemy swarm frozen behind the sequence.

## Acceptance checklist

### Shared — both branches

- [ ] Lethal damage enters the staged defeat transition instead of opening results immediately.
- [ ] Run facts are captured at the fatal instant and persisted once in the approved order.
- [ ] Fatal audio replaces ordinary player-hit; delayed `run-defeat` aligns with the title.
- [ ] Run music fades over `0.45s`; sustained weapon loops stop immediately.
- [ ] Gameplay is frozen; only the defined presentation tick advances.
- [ ] The merged player mesh shows a readable, palette-safe voxel overload with no per-voxel scene-object assumption.
- [ ] Camera framing stays fixed and a single bounded shake settles before the summary.
- [ ] Copy is exactly `SYSTEM OVERLOAD`, `Chassis integrity lost`, and `Operational Time`.
- [ ] Unskipped sequence reveals the actionable summary at `1.20s`, matching the approved `1.1–1.3s` target; skip unlocks at `0.55s`.
- [ ] Held input, blur/focus, skip, and repeated clicks cannot trigger unintended actions.
- [ ] No defeat path displays or performs `NEXT MAP`.
- [ ] Existing summary, contracts, feedback, and damage report remain correct.
- [ ] Reset restores all player/HUD/audio/input/presenter state.

### Map2/full game

- [ ] Actions are exactly `NEW RUN` and `MAIN MENU`.
- [ ] `NEW RUN` uses the current normal new-run selection flow.
- [ ] Defeat on either map, including boundary/finale frames, cannot advance sectors or become victory.
- [ ] `runFinalized` still guards every terminal side effect.

### Demo

- [ ] Actions are exactly `PLAY AGAIN` and `MAIN MENU`.
- [ ] `PLAY AGAIN` uses the current Demo start flow today and is routed through the seam that will later respect the final-Demo single-character shortcut.
- [ ] Demo receives an equivalent one-shot finalization guard.
- [ ] The Demo remains Map 1-only and cannot enter Map 2.

## Implementation and port order

1. Start from clean `codex/map-2`.
2. Implement the pure/shared defeat controller, config, input/audio/player presentation seams, shared HUD staging, and automated tests.
3. Add Map2 action wiring and Map2 boundary/finale regression coverage.
4. Run source-mutating normalization, if any, **before** candidate review; then run typecheck/tests/build/runtime validation on the exact candidate.
5. Update the version before each implementation commit and include the raw SemVer in each conventional-commit subject, per repository policy.
6. Port the shared implementation to `codex/demo-map1` without importing Map2-only `runFlow` assumptions.
7. Add Demo `PLAY AGAIN` wiring and the missing one-shot finalization guard.
8. Keep the numeric version core aligned between branches; use the Demo prerelease suffix according to the existing branch convention.
9. Run equivalent automated and Electron runtime acceptance on Demo.
10. Reconcile any shared fixes back to both branches before declaring Step A complete.

Keep commits reviewable: shared controller/tests, shared runtime/HUD presentation, and branch-specific action wiring should remain separable where practical. Do not mix Step B sector-transition work into these commits.

## Documentation required after real implementation

Only after code and runtime verification:

- Update `docs/PRD.md` with the implemented defeat sequence, copy, inputs, actions, and acceptance behavior.
- Update `docs/ROADMAP_STEAM.md` to mark only Step A as implemented/verified; Step B remains future work.
- Update `docs/SOUND_EVENT_CATALOG.md` if fatal-impact or `run-defeat` event wiring, asset status, mix, or verdict changes.
- Update `docs/AUDIO_AUTHORING_PIPELINE.md` only if a new authored/exported asset or provenance entry is actually added.
- Update branch-operational documentation if the current branch/version/status snapshot changes.
- Keep shared product behavior aligned in both Map2 and Demo documentation while preserving branch-specific action labels.

Do not mark this plan or those documents implemented based on code review alone. The final verdict is in-game Electron measurement.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Persistence is delayed or duplicated by presentation callbacks. | Finalize synchronously at fatal latch, store presentation data, and guard it once per run. |
| Existing `player-hit` and fatal sound stack. | Branch on the actual `takeHit` result/post-hit HP before emitting either audio path. |
| Generic pause duck conflicts with the approved music fade. | Add an explicit duration-aware loop/music fade seam and measure the gain. |
| General particle tick makes the supposedly frozen battle move. | Use a presentation-owned pool/mode and tick only that subset. |
| Per-voxel disassembly fails on merged geometry or harms performance. | Use whole-mesh material treatment, cached bounds, and instanced sparks. |
| Async model load changes the body mid-transition or after reset. | Guard model/presentation work by requested model and run generation; reset temporary state. |
| Held confirm skips and immediately restarts. | Clear transient edges, require release, consume the skip, and re-arm before actions. |
| Map boundary and defeat both mutate run flow. | Latch fatality inside the damage funnel and gate all later flow actions on terminal state. |
| Demo port accidentally gains Map2 behavior. | Keep policy/action adapters branch-specific and add explicit no-Map2 assertions. |
| CSS and controller timing drift. | Let the controller/config own timing; CSS responds to phase classes instead of independent delays. |
| Visual effect obscures a 400+ enemy scene or causes a spike. | Cap instanced particles, avoid allocations/material creation during the beat, and profile the maximum swarm. |

## Explicitly out of scope for this handoff

- `NEXT MAP` and all Step B sector-clear presentation.
- Demo completion/end-card work beyond defeat.
- Final Hazard Marshal victory cleanup and final-loot suppression.
- New sound production or approval.
- New image/3D assets.
- Final-Demo character shortcut implementation.
- Any balance, progression, contract, save-schema, map-duration, boss, weapon, enemy, or monetization change.
- Commit, push, PR, packaging, or release work for this planning document.
