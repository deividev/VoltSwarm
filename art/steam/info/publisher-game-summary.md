# Voltswarm — Publisher Game Summary

> **Publisher recommendation:** Present Voltswarm as a single-player 3D bullet heaven about positioning under pressure and making smart build choices. For the initial Steam page, mark **Partial Controller Support**, not Full, until the packaged Steam build completes the controller test gate below.

## Steam page handoff status — historical snapshot 2026-07-16

The handoff was sent, the publisher created the Steam page, and the page is now under Steam/Valve review. The delivered set contains 9 screenshots, 9 GIFs, current store/library assets, copy, tags, requirements status, and this brief.

**Not confirmed by this historical snapshot:** Valve approval, publication, or Coming Soon visibility. Do not claim a review result, publication date, or live page until externally confirmed. The current verified App ID is `4979220`. “V1 closed” refers to the page-media/copy package and handoff, not the complete game.

## Game summary

**Voltswarm is a single-player 3D bullet heaven in which a lone robot fights an ever-growing swarm of industrial machines.** Weapons aim and fire automatically, so the player concentrates on movement, positioning, threat reading, and build decisions rather than manual aiming.

During a run, the player drafts and upgrades weapons, sockets stat-changing cores, and collects behavior-changing mods. Gold can be spent on chests or at The Scrapper's temporary shop. Optional boss portals let the player deliberately raise the danger and fight large machines such as the Crusher King and Tesla Titan for greater rewards.

The commercial hook is easy to read:

- **Immediate fantasy:** one small robot against a screen-filling machine swarm.
- **Player skill:** survive through movement and positioning; weapons fire automatically.
- **Build depth:** choose weapons, upgrades, cores, and mods carefully because every pick shapes the run.
- **Visual identity:** colorful 3D voxel art with a chunky “industrial toy” look.
- **Escalation:** denser waves, stronger builds, valuable rewards, and optional boss encounters.

This is **not** a crafting or construction game. The player does not build robots or bring scrap to life. “Build” means creating a combat loadout through choices made during the run.

## Short publisher pitch

> A lone robot faces an ever-growing machine swarm in this 3D bullet heaven. Weapons fire automatically, leaving you to master positioning and choose your weapons, upgrades, cores, and mods wisely as the industrial chaos escalates.

## Steam features — what to mark now

| Steam field / feature | Status now | Publisher action | Evidence / limitation |
|---|---|---|---|
| **Single-player** | **IMPLEMENTED** | **Mark** | The game has one local player and one player-controlled robot. |
| **Multiplayer** | **NOT IMPLEMENTED** | **Do not mark** | No multiplayer systems or networking exist. |
| **Online co-op** | **NOT IMPLEMENTED** | **Do not mark** | No online play or co-op exists. |
| **Local co-op / Shared Screen** | **NOT IMPLEMENTED** | **Do not mark** | There is no second player or shared-screen mode. |
| **PvP** | **NOT IMPLEMENTED** | **Do not mark** | No competitive multiplayer exists. |
| **Controller / gamepad input** | **IMPLEMENTED** | Mention gamepad compatibility | Gameplay, interactions, menus, pause, settings, upgrade drafts, chests, shop, and end screens have gamepad paths. Movement and Interact can be rebound. |
| **Partial Controller Support** | **SUPPORTED TODAY** | **Mark for the initial page** | The full in-game flow is implemented and was validated with a DualShock through DirectInput, but the packaged build has not yet passed the planned XInput/controller matrix gate. |
| **Full Controller Support** | **NOT YET VERIFIED FOR STORE CLAIM** | **Do not mark yet** | Functionally close, but do not claim Full until a packaged Steam build is tested from cold launch through settings, a full run, pause, overlays, end screen, and exit without keyboard or mouse. |
| **Steam Achievements** | **20/20 IMPLEMENTED; 20 APP ADMIN ENTRIES CREATED** | **Prepare for launch; confirm publication/icons and RC unlock smoke before final claim** | `ACHIEVEMENT_REGISTRY` and the `steamworks.js` 0.4.0 Steam achievement transport are implemented. The maintainer confirms all 20 matching entries created for App ID `4979220`; Git does not prove publication, icon upload, or a production-build unlock. |
| **Steam Cloud** | **NOT IMPLEMENTED** | **Do not mark** | Settings are saved locally in Electron `userData` with a `localStorage` fallback. There is no Steam Cloud configuration or sync. |
| **Steam Leaderboards** | **NOT IMPLEMENTED / OUTSIDE LAUNCH SCOPE** | **Do not mark or promise** | Reconsider post-launch only if Voltswarm demonstrates sufficient visibility/traction; there is no commitment. |
| **Steam Workshop** | **NOT IMPLEMENTED / NOT PLANNED IN CURRENT ROADMAP** | **Do not mark** | No Workshop, UGC, mod upload/download, or Steamworks Workshop integration exists. |
| **Steam Input API** | **NOT IMPLEMENTED** | **Do not claim** | Gamepad support uses Chromium's Gamepad API, not the Steam Input API. |
| **Other Steamworks product APIs** | **NOT IMPLEMENTED / OUTSIDE LAUNCH SCOPE** | **Do not mark or claim** | User Stats, Rich Presence, Friends/lobbies/networking, Inventory/DLC/microtransactions, and every other non-achievement integration are excluded from launch. Cloud, Workshop, Leaderboards, and Steam Input are likewise excluded. |
| **VR** | **NOT IMPLEMENTED** | **Do not mark** | No VR mode or VR integration exists. |
| **Steam Deck Verified / Playable** | **NOT TESTED** | **Do not claim** | No Deck build or test evidence is recorded. |

## Platform and language

| Item | Current fact | Publisher action |
|---|---|---|
| **Platform** | Windows | Publish Windows support only. Do not announce macOS or Linux. |
| **In-game language** | English | Mark English interface only unless more languages are actually added and tested. |
| **Audio** | Not implemented in the current build | Do not describe music, sound effects, or audio features until the audio phase is complete. Existing volume sliders persist but are not connected to an audio backend. |
| **System requirements** | Not measured | Do not publish guessed CPU, GPU, RAM, or performance requirements. Complete the benchmark template first. |

## Recommended genre and tags

Use the closest tags available in Steamworks, in roughly this order:

1. Bullet Heaven
2. Action Roguelike
3. Roguelite
4. Horde Survival or Survival
5. Singleplayer
6. Action
7. Indie
8. Voxel
9. Robots
10. Sci-fi
11. Top-Down
12. Colorful or Stylized
13. Arcade

Do **not** use Twin Stick Shooter or Shoot 'Em Up: there is no manual aiming. Do not use Crafting, Building, Character Customization, Multiplayer, Co-op, or Online tags.

## Internal notes for publisher

### Controller classification

The code supports a controller-only in-game path, not merely controller movement:

- left stick and d-pad movement;
- rebindable Interact button;
- Start for pause/cancel;
- visible controller focus across the active overlay;
- controller navigation for main menu, unlocks, initial weapon draft, level-up choices, shop, chest reward, pause, settings, and end screen;
- controller adjustment of selects and sliders;
- contextual Back/Resume/Leave/Continue behavior;
- standard-mapping controllers plus a DirectInput translation path used by the tested DualShock.

However, **Partial Controller Support is the honest store selection today** because the remaining verification gate is explicit and unresolved. Before upgrading the page to **Full Controller Support**, test the final packaged Steam build with at least:

- [ ] one XInput controller;
- [ ] the already-supported DualShock/DirectInput path;
- [ ] cold launch to main menu without keyboard or mouse;
- [ ] weapon selection and run start;
- [ ] gameplay movement and every interaction type;
- [ ] level-up, chest, shop, boss summon, pause, and settings overlays;
- [ ] death/end screen, return to menu, and application exit;
- [ ] reconnect/disconnect behavior and visible button prompts.

Known presentation limitation: button labels use Xbox-style A/B/X/Y names even on PlayStation controllers. This does not remove controller functionality, but platform-appropriate glyphs would make a future Full Controller claim stronger.

### Steam achievement status

For launch, Voltswarm uses `steamworks.js` `0.4.0` **exclusively to unlock the 20 achievements**. `ACHIEVEMENT_REGISTRY`, SDK initialization, App ID `4979220`, `electronEnableSteamOverlay`, native packaging, isolated IPC, the API-name allowlist, and the persistent outbox are implemented. SDK/overlay initialization and packaging are auxiliary support for achievement unlocking, not independent Steamworks product features. The maintainer confirms all 20 App Admin entries created; publication of the latest changes, both icon uploads, and a production-build unlock smoke still require external/RC confirmation.

Leaderboards, User Stats, Cloud, Workshop, Rich Presence, Friends/lobbies/networking, Steam Input, Inventory/DLC/microtransactions, and all other Steamworks product APIs are not implemented and are outside launch scope. Reconsider post-launch only if sufficient visibility/traction justifies the investment; there is no commitment.

### Persistence status

Settings, profile/Contracts, run history, and the profile-independent achievement outbox persist locally in Electron `userData`. Steam Cloud synchronization is not implemented and is outside launch scope.

### Requirements status

The system requirements file is intentionally a benchmark template. Requirements must be measured on real hardware with the target high-density swarm before they are supplied to Steamworks.

## Source references

- `docs/PRD.md` — implemented game loop, menu, settings, controller flow, and current out-of-scope systems.
- `docs/ROADMAP_STEAM.md` — Steam achievement verification, persistence, explicitly excluded Steamworks APIs, audio, and release gates.
- `src/input.ts` — keyboard/gamepad actions, DirectInput translation, movement, Interact, and pause input.
- `src/hud.ts` — controller navigation across menus and gameplay overlays.
- `src/game.ts` — per-frame input polling, menu navigation, pause flow, and interactions.
- `src/settings.ts` — rebindable inputs and local settings persistence.
- `electron/main.ts` and `electron/preload.ts` — local persistence and isolated Steam achievement IPC.
- `package.json` — `steamworks.js` 0.4.0 dependency and Windows native packaging configuration.
- `art/steam/info/tags-and-categories.md` — current conservative store-feature guidance.
- `art/steam/info/system-requirements.md` — uncompleted benchmark gate.

## Internal post-handoff status

The one-item-at-a-time cleanup is complete. Approved deletions removed backups, duplicates, regenerable temporary files, and obsolete builds. Retained sources and context include `assets/preview/`, `art/concept/`, `tmp/quantize-portal.mjs`, `tmp/perf-400-output/`, final Steam assets, both v0.1.1 builds, and `art/video/2026-07-16 17-32-04.mp4`.

All temporary capture rigs are disabled. Next: answer Steam review feedback; publish Coming Soon only after confirmed approval; then resume the canonical roadmap. Steamworks APIs beyond achievement unlocking remain outside launch scope and are not promised.
