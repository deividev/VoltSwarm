# Multiplayer feasibility — decision gate

**Decision:** investigate multiplayer readiness next; do **not** promise, announce, tag, or ship multiplayer/co-op until this gate is implemented, tested, and ends in **GO**. Public publisher files remain unchanged and correctly state no multiplayer/co-op today.

## Why this is a gate, not a differentiator claim

As checked on 2026-07-17, [Vampire Survivors on Steam](https://store.steampowered.com/app/1794680/Vampire_Survivors/) lists Online Co-op and states local co-op for up to four players. [Megabonk on Steam](https://store.steampowered.com/app/3405340/Megabonk/) is Steam-listed as single-player. Multiplayer may broaden Voltswarm’s appeal, but it is **not** unique against Vampire Survivors.

## Decision path

| Stage | Required outcome | Not implied |
|---|---|---|
| Readiness seam | A simulation can run without renderer, HUD, or audio ownership. | A multiplayer mode exists. |
| Determinism proof | Same seed + same command sequence yields matching snapshot digest. | Internet networking works. |
| GO/NO-GO | Evidence records cost, performance and unresolved design risks. | GO is automatic. |
| First playable if GO | Exactly two-player local split-screen with independent cameras/viewports. | Four-player local, shared-camera tether, or native online. |
| Follow-up if local works | Steam Remote Play Together streams the host’s local split-screen. | Guest account progression. |
| Later explicit decision | Native online peer-host for up to four players, host-authoritative snapshots, one full-screen camera per client. | Hybrid local+online or dedicated servers. |

## Product boundaries (future/unimplemented)

- Future menu target: **Play Solo** and **Play Multiplayer**. Neither label changes the current public single-player truth until implemented and verified.
- The simulation architecture is player-count agnostic for **1–4 `PlayerId`**. This does not promise four-player local: local is exactly 2 players.
- Local 2P uses split-screen with independent cameras/viewports; there is no shared-camera tether. Steam Remote Play Together streams that host split-screen.
- Native online requires later explicit approval: up to 4 players, each client has one full-screen camera, and peer-host authority validates snapshots. Hybrid local+online is out of scope unless separately approved.

## Required seams (future spike; not implemented)

- `RunSimulation`/session owns fixed-tick gameplay state and accepts only timestamped command snapshots.
- The spike proposes a **60 Hz fixed tick** and a **digest checkpoint every 60 ticks**. Both values must be config-owned before implementation; they are gate hypotheses, not current runtime behavior.
- Gameplay RNG is seeded and isolated from presentation/audio randomness.
- Commands carry `PlayerId`; entities have stable IDs, never renderer references.
- Simulation emits a serializable snapshot and stable digest suitable for same-input comparison and debugging.
- Renderer, HUD and `AudioDirector` are observers of simulation state/events; they do not mutate authoritative gameplay state.
- Preserve the existing 400+ enemy performance gate while simulating two local players. Split-screen has multiple render passes, so it needs its own recorded 400+/60 FPS evidence before GO.

## Overlay and viewport decisions for local 2P (must be resolved before GO)

| Overlay/edge case | Required decision evidence |
|---|---|
| Pause | Name the owning `PlayerId`, whether either player can request it, and the resume/leave behavior. |
| Level-up draft | Name the owner and document the deterministic FIFO when both players queue a draft in the same tick; no simultaneous ambiguous input. |
| Chest reel/reward | Name who opens it, who controls Continue, and whether reward/effect is shared or owner-only. |
| Merchant/shop | Name interaction owner, purchase authority, inventory visibility, and behavior when the other player moves or disconnects. |
| Controller disconnect / leave / reconnect | Define pause/autopause policy, input timeout, player state, ownership recovery and rejoin limits. |
| Split-screen cameras/viewports | Define each independent camera’s viewport layout, world bounds, zoom/fallback and off-screen rule; no shared-camera tether exists. |

Exact tuning values for pause windows, timeouts, camera bounds, viewport layout, zoom and input limits must be config-owned; none are chosen until this implementation-gated spike.

## Acceptance checklist for the gate

### Determinism and restoration

- [ ] Headless or renderless simulation runs at the proposed 60 Hz with a recorded seed and command stream; tick/checkpoint constants are declared in config.
- [ ] Same seed plus same command stream produces matching digest at every 60-tick checkpoint across repeated runs.
- [ ] A serialized snapshot restores into a continuation whose subsequent checkpoint digests match the uninterrupted run.
- [ ] A command for each `PlayerId` can move and interact independently without shared implicit input state.
- [ ] Stable entity IDs survive serialization and do not rely on Three.js object identity.
- [ ] Renderer/HUD/audio can be detached without changing the simulation digest.

### Local 2P and decision record

- [ ] Overlay/viewport table above has an explicit, testable decision for every row; all numeric tuning is config-owned.
- [ ] Recorded local-2P split-screen benchmark with 400+ enemies targets 60 FPS and records multiple render passes, tested configuration, average/minimum FPS and failures.
- [ ] Exactly two-player local split-screen with independent cameras/viewports has a performance/rules design proposal, or the evidence explains why it is not viable.
- [ ] A short decision record concludes **GO** or **NO-GO**, with scope, risks and next owner.

## Progression and unlock rules (future modes only)

- **Local / Remote Play:** only the host/local save can persist. Do not claim guest-account progression.
- **Native online, only after approval:** an unlock earned during a session is granted once to every participating player present and eligible at the unlock event. A player leaving keeps earlier grants but receives no later ones. After host-authoritative validation, each client persists its own account; no duplicate grants.

## GO and NO-GO interpretation

**GO** permits only the next scoped target: exactly two-player local split-screen with independent cameras/viewports, then Steam Remote Play Together streaming the host view. Native online peer-host (up to four, one full-screen camera per client) requires separate approval and host-authoritative snapshots; clients submit commands and consume host snapshots. Hybrid local+online and dedicated servers remain out of scope.

**NO-GO** preserves the single-player release plan. The seams may remain if they improve testing or replayability, but no co-op work proceeds and no public copy changes.

## Public truth guardrail

Do not edit `art/steam/info/publisher-game-summary.md` or `art/steam/info/tags-and-categories.md` for this investigation. They remain single-player/no co-op until an implemented and verified feature changes that truth.
