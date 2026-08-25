# Voltswarm — Steam achievements

> **Status at 0.30.6 (2026-08-25): 20/20 launch achievements are implemented in the game, and the maintainer confirms that the matching 20 entries have been created in Steamworks App Admin for App ID `4979220`.** The repository does not prove that the latest Steamworks changes were published, that every achieved/unachieved icon was uploaded, or that the achievement-unlock flow passed an end-to-end smoke test in a production build. All other Steamworks product APIs are not implemented and are outside launch scope; reconsider post-launch only if the project demonstrates sufficient visibility/traction, with no commitment.

## Status matrix

| Scope | Status | Evidence / boundary |
| --- | --- | --- |
| Canonical catalog | **20/20 implemented** | `src/achievements.ts` → `ACHIEVEMENT_REGISTRY` |
| Runtime predicates and persistent telemetry | **20/20 implemented** | Career/profile facts, terminal run folding, startup retroactivity, and end-of-run evaluation |
| Steam achievement transport | **Implemented** | `steamworks.js` `0.4.0`, isolated Electron IPC, allowlist, and durable outbox; exclusively supports unlocking this catalog |
| Steamworks App Admin entries | **20/20 created** | Maintainer-confirmed for App ID `4979220`; external state is not derivable from Git |
| Steamworks publication of latest changes | **Not evidenced here** | Confirm in App Admin before RC |
| Achieved/unachieved icon upload | **Not evidenced here** | Source masters and 128 px review exports exist in the repository; confirm actual uploads externally |
| Production-build achievement-unlock smoke | **Pending evidence** | Must verify unlock, offline retry, and restart reconciliation through Steam in an RC build; overlay behavior is not a separate feature target |
| Steam leaderboards | **Outside launch scope** | Not implemented, confirmed, or promised; reconsider post-launch only with sufficient visibility/traction |
| Other Steamworks product APIs | **Outside launch scope** | User Stats, Cloud, Workshop, Rich Presence, Friends/lobbies/networking, Steam Input, Inventory/DLC/microtransactions, and every non-achievement integration are not implemented or promised |

### Per-achievement status

| Local ID | Steam API name | Game runtime | App Admin entry |
| --- | --- | --- | --- |
| `ach_first_shift` | `ACH_FIRST_SHIFT` | Implemented | Created (maintainer-confirmed) |
| `ach_cache_opened` | `ACH_CACHE_OPENED` | Implemented | Created (maintainer-confirmed) |
| `ach_systems_online` | `ACH_SYSTEMS_ONLINE` | Implemented | Created (maintainer-confirmed) |
| `ach_first_boss_down` | `ACH_FIRST_BOSS_DOWN` | Implemented | Created (maintainer-confirmed) |
| `ach_foundry_bound` | `ACH_FOUNDRY_BOUND` | Implemented | Created (maintainer-confirmed) |
| `ach_scrapyard_command` | `ACH_SCRAPYARD_COMMAND` | Implemented | Created (maintainer-confirmed) |
| `ach_hazard_contained` | `ACH_HAZARD_CONTAINED` | Implemented | Created (maintainer-confirmed) |
| `ach_full_circuit` | `ACH_FULL_CIRCUIT` | Implemented | Created (maintainer-confirmed) |
| `ach_field_engineer_clear` | `ACH_FIELD_ENGINEER_CLEAR` | Implemented | Created (maintainer-confirmed) |
| `ach_rack_hauler_clear` | `ACH_RACK_HAULER_CLEAR` | Implemented | Created (maintainer-confirmed) |
| `ach_overclocker_clear` | `ACH_OVERCLOCKER_CLEAR` | Implemented | Created (maintainer-confirmed) |
| `ach_first_contract` | `ACH_FIRST_CONTRACT` | Implemented | Created (maintainer-confirmed) |
| `ach_full_capacity` | `ACH_FULL_CAPACITY` | Implemented | Created (maintainer-confirmed) |
| `ach_weapon_level_20` | `ACH_WEAPON_LEVEL_20` | Implemented | Created (maintainer-confirmed) |
| `ach_weapon_mastery` | `ACH_WEAPON_MASTERY` | Implemented | Created (maintainer-confirmed) |
| `ach_four_core_array` | `ACH_FOUR_CORE_ARRAY` | Implemented | Created (maintainer-confirmed) |
| `ach_five_mod_rig` | `ACH_FIVE_MOD_RIG` | Implemented | Created (maintainer-confirmed) |
| `ach_purist` | `ACH_PURIST` | Implemented | Created (maintainer-confirmed) |
| `ach_untouchable` | `ACH_UNTOUCHABLE` | Implemented | Created (maintainer-confirmed) |
| `ach_overkill` | `ACH_OVERKILL` | Implemented | Created (maintainer-confirmed) |

## Steam achievement transport architecture (`steamworks.js` 0.4.0)

1. **One source of truth:** `ACHIEVEMENT_REGISTRY` owns each stable local ID, Steam API name, display metadata, hidden flag, and measurable predicate. The App Admin entries must continue to use those exact API names.
2. **Durable evaluation boundaries:** startup loads `PROFILE`/`LIFETIME`, settles Contracts durably, and then evaluates retroactive achievements. End-of-run evaluation occurs only after both the run/profile write and subsequent Contract-settlement write succeed.
3. **Isolated renderer-to-main IPC:** `electron/preload.ts` exposes only `electronAPI.steam.isAvailable()` and `requestUnlock()` through `contextBridge`; the renderer never receives Node or Steamworks access.
4. **Strict native allowlist:** `electron/achievement-store.ts` accepts only the 20 API names mirrored from the registry. Unknown names return `rejected` before Steam is called.
5. **Crash-safe, profile-independent outbox:** `userData/achievement-sync.json` persists monotonic `pending` and `unlocked` sets. Requests are written to `pending` before any Steam call, so a local profile reset cannot revoke or replay a Steam unlock.
6. **Idempotent activation:** every flush calls `client.achievement.isActivated(name)` before `activate(name)`. If Steam already owns the achievement, the outbox marks it locally unlocked without activating it again.
7. **Offline/restart recovery:** unavailable or failed Steam calls remain pending. The main process flushes on startup and performs three bounded retries after 5, 20, and 60 seconds; a later launch reconciles any remaining work.
8. **App ID and development gating:** packaged builds use App ID `4979220`. Development is inert unless `STEAM_APP_ID` is explicitly supplied, preventing ordinary dev sessions from creating future production unlocks.
9. **Auxiliary SDK/overlay/packaging support:** SDK initialization, App ID resolution, `electronEnableSteamOverlay()`, native Windows `.node`/`.dll` `asarUnpack`, IPC, allowlist, and outbox exist only to support achievement unlocking. The overlay call enables Electron compatibility for the SDK path; Voltswarm does not claim the Steam Overlay as a separate product feature, and RC validation targets the achievement flow rather than an overlay feature smoke.

No other Steamworks product API is implemented for launch. This explicitly excludes Leaderboards, User Stats, Cloud, Workshop, Rich Presence, Friends/lobbies/networking, Steam Input, Inventory/DLC/microtransactions, and any unlisted non-achievement integration. Reconsider only post-launch if sufficient visibility/traction justifies the investment; there is no commitment.

## Steamworks App Admin catalog

The following exact values are the canonical cross-check for the 20 entries that the maintainer confirms are created in App Admin. Creation is not the same as publishing the latest changes, uploading both icon states, or completing production achievement-unlock validation.

### `ACH_FIRST_SHIFT`

- **API Name:** `ACH_FIRST_SHIFT`
- **Display Name:** `First Shift`
- **Description:** `Finish your first recorded run. Victories and defeats both count.`
- **Set By:** Client
- **Hidden:** False
- **Achieved icon:** `art/concept/achievements/achievement-first-shift-v1.png`
- **Unachieved icon:** `art/concept/achievements/achievement-first-shift-locked-v1.png`

### `ACH_CACHE_OPENED`

- **API Name:** `ACH_CACHE_OPENED`
- **Display Name:** `Crack the Cache`
- **Description:** `Open your first paid chest.`
- **Set By:** Client
- **Hidden:** False
- **Achieved icon:** `art/concept/achievements/achievement-crack-the-cache-v1.png`
- **Unachieved icon:** `art/concept/achievements/achievement-crack-the-cache-locked-v1.png`

### `ACH_SYSTEMS_ONLINE`

- **API Name:** `ACH_SYSTEMS_ONLINE`
- **Display Name:** `Systems Online`
- **Description:** `Reach level 10 in a single run.`
- **Set By:** Client
- **Hidden:** False
- **Achieved icon:** `art/concept/achievements/achievement-systems-online-v1.png`
- **Unachieved icon:** `art/concept/achievements/achievement-systems-online-locked-v1.png`

### `ACH_FIRST_BOSS_DOWN`

- **API Name:** `ACH_FIRST_BOSS_DOWN`
- **Display Name:** `Bigger They Fall`
- **Description:** `Defeat your first boss.`
- **Set By:** Client
- **Hidden:** False
- **Achieved icon:** `art/concept/achievements/achievement-bigger-they-fall-v1.png`
- **Unachieved icon:** `art/concept/achievements/achievement-bigger-they-fall-locked-v1.png`

### `ACH_FOUNDRY_BOUND`

- **API Name:** `ACH_FOUNDRY_BOUND`
- **Display Name:** `Foundry Bound`
- **Description:** `Clear Scrapyard and enter Swarm Foundry.`
- **Set By:** Client
- **Hidden:** False
- **Achieved icon:** `art/concept/achievements/achievement-foundry-bound-v1.png`
- **Unachieved icon:** `art/concept/achievements/achievement-foundry-bound-locked-v1.png`

### `ACH_SCRAPYARD_COMMAND`

- **API Name:** `ACH_SCRAPYARD_COMMAND`
- **Display Name:** `Scrapyard Command`
- **Description:** `Defeat both Crusher King and Tesla Titan across your career.`
- **Set By:** Client
- **Hidden:** False
- **Achieved icon:** `art/concept/achievements/achievement-scrapyard-command-v1.png`
- **Unachieved icon:** `art/concept/achievements/achievement-scrapyard-command-locked-v1.png`

### `ACH_HAZARD_CONTAINED`

- **API Name:** `ACH_HAZARD_CONTAINED`
- **Display Name:** `Hazard Contained`
- **Description:** `Defeat the Hazard Marshal.`
- **Set By:** Client
- **Hidden:** True
- **Achieved icon:** `art/concept/achievements/achievement-hazard-contained-v1.png`
- **Unachieved icon:** `art/concept/achievements/achievement-hazard-contained-locked-v1.png`

### `ACH_FULL_CIRCUIT`

- **API Name:** `ACH_FULL_CIRCUIT`
- **Display Name:** `Full Circuit`
- **Description:** `Complete the full run by clearing both sectors in order.`
- **Set By:** Client
- **Hidden:** True
- **Achieved icon:** `art/concept/achievements/achievement-full-circuit-v1.png`
- **Unachieved icon:** `art/concept/achievements/achievement-full-circuit-locked-v1.png`

### `ACH_FIELD_ENGINEER_CLEAR`

- **API Name:** `ACH_FIELD_ENGINEER_CLEAR`
- **Display Name:** `Field Tested`
- **Description:** `Complete the full run as Field Engineer.`
- **Set By:** Client
- **Hidden:** False
- **Achieved icon:** `art/concept/achievements/achievement-field-tested-v1.png`
- **Unachieved icon:** `art/concept/achievements/achievement-field-tested-locked-v1.png`

### `ACH_RACK_HAULER_CLEAR`

- **API Name:** `ACH_RACK_HAULER_CLEAR`
- **Display Name:** `Fully Loaded`
- **Description:** `Complete the full run as Rack Hauler.`
- **Set By:** Client
- **Hidden:** False
- **Achieved icon:** `art/concept/achievements/achievement-fully-loaded-v1.png`
- **Unachieved icon:** `art/concept/achievements/achievement-fully-loaded-locked-v1.png`

### `ACH_OVERCLOCKER_CLEAR`

- **API Name:** `ACH_OVERCLOCKER_CLEAR`
- **Display Name:** `Past Redline`
- **Description:** `Complete the full run as Overclocker.`
- **Set By:** Client
- **Hidden:** False
- **Achieved icon:** `art/concept/achievements/achievement-past-redline-v1.png`
- **Unachieved icon:** `art/concept/achievements/achievement-past-redline-locked-v1.png`

### `ACH_FIRST_CONTRACT`

- **API Name:** `ACH_FIRST_CONTRACT`
- **Display Name:** `Signed and Stamped`
- **Description:** `Complete your first Contract and receive its reward.`
- **Set By:** Client
- **Hidden:** False
- **Achieved icon:** `art/concept/achievements/achievement-signed-and-stamped-v1.png`
- **Unachieved icon:** `art/concept/achievements/achievement-signed-and-stamped-locked-v1.png`

### `ACH_FULL_CAPACITY`

- **API Name:** `ACH_FULL_CAPACITY`
- **Display Name:** `No Empty Sockets`
- **Description:** `Unlock maximum Weapon and Core capacity, plus the extra level-up discard.`
- **Set By:** Client
- **Hidden:** False
- **Achieved icon:** `art/concept/achievements/achievement-no-empty-sockets-v1.png`
- **Unachieved icon:** `art/concept/achievements/achievement-no-empty-sockets-locked-v1.png`

### `ACH_WEAPON_LEVEL_20`

- **API Name:** `ACH_WEAPON_LEVEL_20`
- **Display Name:** `Factory Specification`
- **Description:** `Raise any weapon to level 20 in a single run.`
- **Set By:** Client
- **Hidden:** False
- **Achieved icon:** `art/concept/achievements/achievement-factory-specification-v1.png`
- **Unachieved icon:** `art/concept/achievements/achievement-factory-specification-locked-v1.png`

### `ACH_WEAPON_MASTERY`

- **API Name:** `ACH_WEAPON_MASTERY`
- **Display Name:** `Proven Hardware`
- **Description:** `Deal 50,000 lifetime damage with a single weapon.`
- **Set By:** Client
- **Hidden:** False
- **Achieved icon:** `art/concept/achievements/achievement-proven-hardware-v1.png`
- **Unachieved icon:** `art/concept/achievements/achievement-proven-hardware-locked-v1.png`

### `ACH_FOUR_CORE_ARRAY`

- **API Name:** `ACH_FOUR_CORE_ARRAY`
- **Display Name:** `Core Array`
- **Description:** `Finish a recorded run carrying four distinct Cores.`
- **Set By:** Client
- **Hidden:** False
- **Achieved icon:** `art/concept/achievements/achievement-core-array-v1.png`
- **Unachieved icon:** `art/concept/achievements/achievement-core-array-locked-v1.png`

### `ACH_FIVE_MOD_RIG`

- **API Name:** `ACH_FIVE_MOD_RIG`
- **Display Name:** `Custom Rig`
- **Description:** `Finish a recorded run carrying five distinct Mods.`
- **Set By:** Client
- **Hidden:** False
- **Achieved icon:** `art/concept/achievements/achievement-custom-rig-v1.png`
- **Unachieved icon:** `art/concept/achievements/achievement-custom-rig-locked-v1.png`

### `ACH_PURIST`

- **API Name:** `ACH_PURIST`
- **Display Name:** `Purist`
- **Description:** `Clear both sectors in one run with exactly one weapon and no Mods.`
- **Set By:** Client
- **Hidden:** False
- **Achieved icon:** `art/concept/achievements/achievement-purist-v1.png`
- **Unachieved icon:** `art/concept/achievements/achievement-purist-locked-v1.png`

### `ACH_UNTOUCHABLE`

- **API Name:** `ACH_UNTOUCHABLE`
- **Display Name:** `Untouchable`
- **Description:** `Survive for five minutes in a single run without taking damage.`
- **Set By:** Client
- **Hidden:** False
- **Achieved icon:** `art/concept/achievements/achievement-untouchable-v1.png`
- **Unachieved icon:** `art/concept/achievements/achievement-untouchable-locked-v1.png`

### `ACH_OVERKILL`

- **API Name:** `ACH_OVERKILL`
- **Display Name:** `Overkill`
- **Description:** `Destroy 800 machines in a single run.`
- **Set By:** Client
- **Hidden:** False
- **Achieved icon:** `art/concept/achievements/achievement-overkill-v1.png`
- **Unachieved icon:** `art/concept/achievements/achievement-overkill-locked-v1.png`

## Launch recommendation

Ship **20 single-player achievements**: 16 progression/content achievements and 4 optional mastery challenges. This is broad enough to represent the complete arc without duplicating the 29 Contracts or demanding excessive grind. Multiplayer, leaderboards, Oil Sprayer, speedruns, and requirements the runtime cannot verify are deliberately excluded.

## Master icon direction

Every achieved-state prompt below repeats this direction in full rather than relying on shorthand:

> Create a square Steam achievement icon for Voltswarm, designed to remain immediately readable at very small sizes. Stylized 3D voxel art with an industrial-toy appearance, chunky visible cubic voxel blocks, compact geometry, flat per-face shading, crisp hard stepped edges, and one dominant unmistakable silhouette. Use the current Voltswarm palette: dark graphite and gunmetal foundations, painted construction amber where appropriate, WHITE energy and power light, and only restrained existing gameplay accent colors when truthful to the subject. Use a simple high-contrast background with a subtle radial glow and no environmental clutter. Center the subject with generous negative space and avoid thin details. No text, no letters, no words, no logos, no digits, no written numbers, no UI labels, no watermark, no gore, no blood, and no realistic organic anatomy. Everything must be explicitly constructed as voxel geometry, including particles, energy, smoke, sparks, and lighting accents. No smooth curves, vector-flat blobs, irregular splashes, gradients, photorealism, realistic smoke, or excessive bloom. All-ages appropriate, polished game-achievement presentation.

Energy is **white**, following the current art-direction decision in `docs/DIRECCION_ARTE.md`; cyan is machinery language and must not be used as generic energy.

## Prioritized catalog

### 1. `ach_first_shift` — P0

- **Display name:** `First Shift`
- **Steam description:** `Finish your first recorded run. Victories and defeats both count.`
- **Exact condition:** `LIFETIME.runsFinished >= 1`. Quitting before a recorded ending does not count.
- **Hidden:** No — this is the onboarding objective.
- **Estimated difficulty:** Introductory.
- **Signal:** Existing `LIFETIME.runsFinished`.
- **Implementation:** Implemented locally with Steam API name `ACH_FIRST_SHIFT`. Steamworks App Admin entry creation is maintainer-confirmed; publication, icon upload, and production-build achievement-unlock smoke remain external verification steps.
- **Achieved icon:** `art/concept/achievements/achievement-first-shift-v1.png` (generation master) and `art/concept/achievements/achievement-first-shift-v1-128.png` (small-size review export).
- **Unachieved icon:** `art/concept/achievements/achievement-first-shift-locked-v1.png` (generation master) and `art/concept/achievements/achievement-first-shift-locked-v1-128.png` (small-size review export).
- **Full image prompt:**

> Create a square Steam achievement icon for Voltswarm, designed to remain immediately readable at very small sizes. Stylized 3D voxel art with an industrial-toy appearance, chunky visible cubic voxel blocks, compact geometry, flat per-face shading, crisp hard stepped edges, and one dominant unmistakable silhouette. Use the current Voltswarm palette: dark graphite and gunmetal foundations, painted construction amber where appropriate, WHITE energy and power light, and only restrained existing gameplay accent colors when truthful to the subject. Use a simple high-contrast background with a subtle radial glow and no environmental clutter. Center the subject with generous negative space and avoid thin details. No text, no letters, no words, no logos, no digits, no written numbers, no UI labels, no watermark, no gore, no blood, and no realistic organic anatomy. Everything must be explicitly constructed as voxel geometry, including particles, energy, smoke, sparks, and lighting accents. No smooth curves, vector-flat blobs, irregular splashes, gradients, photorealism, realistic smoke, or excessive bloom. All-ages appropriate, polished game-achievement presentation. Depict one heavy industrial punch-clock token being inserted into a compact scrapyard shift terminal. A fresh WHITE power light activates inside the terminal and releases only a few restrained cubic voxel sparks. The punch-clock terminal and token must read as one compact, unmistakable silhouette.

### 2. `ach_cache_opened` — P0

- **Display name:** `Crack the Cache`
- **Steam description:** `Open your first paid chest.`
- **Exact condition:** Sum of `LIFETIME.chestsByTier` is at least 1.
- **Hidden:** No — it teaches a core economy interaction.
- **Estimated difficulty:** Easy.
- **Signal:** Existing `RunRecordV1.chestsByTier` and `LIFETIME.chestsByTier`.
- **Implementation:** Implemented locally with Steam API name `ACH_CACHE_OPENED`. Only positive tier counts contribute, and the threshold is config-derived. Steamworks App Admin entry creation is maintainer-confirmed; publication, icon upload, and production-build achievement-unlock smoke remain external verification steps.
- **Achieved icon:** `art/concept/achievements/achievement-crack-the-cache-v1.png` (generation master) and `art/concept/achievements/achievement-crack-the-cache-v1-128.png` (small-size review export).
- **Unachieved icon:** `art/concept/achievements/achievement-crack-the-cache-locked-v1.png` (generation master) and `art/concept/achievements/achievement-crack-the-cache-locked-v1-128.png` (small-size review export).
- **Full image prompt:**

> Create a square Steam achievement icon for Voltswarm, designed to remain immediately readable at very small sizes. Stylized 3D voxel art with an industrial-toy appearance, chunky visible cubic voxel blocks, compact geometry, flat per-face shading, crisp hard stepped edges, and one dominant unmistakable silhouette. Use the current Voltswarm palette: dark graphite and gunmetal foundations, painted construction amber where appropriate, WHITE energy and power light, and only restrained existing gameplay accent colors when truthful to the subject. Use a simple high-contrast background with a subtle radial glow and no environmental clutter. Center the subject with generous negative space and avoid thin details. No text, no letters, no words, no logos, no digits, no written numbers, no UI labels, no watermark, no gore, no blood, and no realistic organic anatomy. Everything must be explicitly constructed as voxel geometry, including particles, energy, smoke, sparks, and lighting accents. No smooth curves, vector-flat blobs, irregular splashes, gradients, photorealism, realistic smoke, or excessive bloom. All-ages appropriate, polished game-achievement presentation. Depict one unmistakable Voltswarm industrial chest springing open, built from bronze voxel plates with a central white-lit optical window, releasing a compact burst of golden voxel tokens and white light. Keep the chest as the only dominant object.

### 3. `ach_systems_online` — P0

- **Display name:** `Systems Online`
- **Steam description:** `Reach level 10 in a single run.`
- **Exact condition:** `LIFETIME.bestLevel >= 10`.
- **Hidden:** No — it is an early growth milestone.
- **Estimated difficulty:** Easy.
- **Signal:** Existing `LIFETIME.bestLevel`.
- **Implementation:** Implemented locally with Steam API name `ACH_SYSTEMS_ONLINE`. The level threshold is config-derived, and non-finite ledger values cannot qualify. Steamworks App Admin entry creation is maintainer-confirmed; publication, icon upload, and production-build achievement-unlock smoke remain external verification steps.
- **Achieved icon:** `art/concept/achievements/achievement-systems-online-v1.png` (generation master) and `art/concept/achievements/achievement-systems-online-v1-128.png` (small-size review export).
- **Unachieved icon:** `art/concept/achievements/achievement-systems-online-locked-v1.png` (generation master) and `art/concept/achievements/achievement-systems-online-locked-v1-128.png` (small-size review export).
- **Full image prompt:**

> Create a square Steam achievement icon for Voltswarm, designed to remain immediately readable at very small sizes. Stylized 3D voxel art with an industrial-toy appearance, chunky visible cubic voxel blocks, compact geometry, flat per-face shading, crisp hard stepped edges, and one dominant unmistakable silhouette. Use the current Voltswarm palette: dark graphite and gunmetal foundations, painted construction amber where appropriate, WHITE energy and power light, and only restrained existing gameplay accent colors when truthful to the subject. Use a simple high-contrast background with a subtle radial glow and no environmental clutter. Center the subject with generous negative space and avoid thin details. No text, no letters, no words, no logos, no digits, no written numbers, no UI labels, no watermark, no gore, no blood, and no realistic organic anatomy. Everything must be explicitly constructed as voxel geometry, including particles, energy, smoke, sparks, and lighting accents. No smooth curves, vector-flat blobs, irregular splashes, gradients, photorealism, realistic smoke, or excessive bloom. All-ages appropriate, polished game-achievement presentation. Depict a compact industrial robot power core switching fully online, with stacked white energy segments rising around it and a strong upward pulse of cubic voxel electricity. Do not include numeric level indicators; communicate progression through the ascending energy structure.

### 4. `ach_first_boss_down` — P0

- **Display name:** `Bigger They Fall`
- **Steam description:** `Defeat your first boss.`
- **Exact condition:** `LIFETIME.bossesDefeated >= 1`.
- **Hidden:** No — this marks the first major combat milestone.
- **Estimated difficulty:** Medium.
- **Signal:** Existing `LIFETIME.bossesDefeated`.
- **Implementation:** Implemented locally with Steam API name `ACH_FIRST_BOSS_DOWN`. The boss threshold is config-derived, and only the finite persisted career count from finished runs can qualify. Steamworks App Admin entry creation is maintainer-confirmed; publication, icon upload, and production-build achievement-unlock smoke remain external verification steps.
- **Achieved icon:** `art/concept/achievements/achievement-bigger-they-fall-v1.png` (generation master) and `art/concept/achievements/achievement-bigger-they-fall-v1-128.png` (small-size review export).
- **Unachieved icon:** `art/concept/achievements/achievement-bigger-they-fall-locked-v1.png` (generation master) and `art/concept/achievements/achievement-bigger-they-fall-locked-v1-128.png` (small-size review export).
- **Full image prompt:**

> Create a square Steam achievement icon for Voltswarm, designed to remain immediately readable at very small sizes. Stylized 3D voxel art with an industrial-toy appearance, chunky visible cubic voxel blocks, compact geometry, flat per-face shading, crisp hard stepped edges, and one dominant unmistakable silhouette. Use the current Voltswarm palette: dark graphite and gunmetal foundations, painted construction amber where appropriate, WHITE energy and power light, and only restrained existing gameplay accent colors when truthful to the subject. Use a simple high-contrast background with a subtle radial glow and no environmental clutter. Center the subject with generous negative space and avoid thin details. No text, no letters, no words, no logos, no digits, no written numbers, no UI labels, no watermark, no gore, no blood, and no realistic organic anatomy. Everything must be explicitly constructed as voxel geometry, including particles, energy, smoke, sparks, and lighting accents. No smooth curves, vector-flat blobs, irregular splashes, gradients, photorealism, realistic smoke, or excessive bloom. All-ages appropriate, polished game-achievement presentation. Depict a massive defeated boss helmet resting as an industrial trophy, cracked only as mechanical armor and emitting fading red cubic voxel sparks, while a small white victory beacon shines above it. No severed anatomy and no gore.

### 5. `ach_foundry_bound` — P0

- **Display name:** `Foundry Bound`
- **Steam description:** `Clear Scrapyard and enter Swarm Foundry.`
- **Exact condition:** Enter Map 2, or after run settlement `LIFETIME.maxMapsReached >= 2`.
- **Hidden:** No — Swarm Foundry is part of the complete-game arc.
- **Estimated difficulty:** Medium.
- **Signal:** Existing `map_transition` event and `LIFETIME.maxMapsReached`.
- **Implementation:** Implemented locally with Steam API name `ACH_FOUNDRY_BOUND`. Unlocking uses only the finite, monotonic `LIFETIME.maxMapsReached` value persisted from a finished run; the live transition event is not an award source. The threshold is config-derived. Steamworks App Admin entry creation is maintainer-confirmed; publication, icon upload, and production-build achievement-unlock smoke remain external verification steps.
- **Achieved icon:** `art/concept/achievements/achievement-foundry-bound-v1.png` (generation master) and `art/concept/achievements/achievement-foundry-bound-v1-128.png` (small-size review export).
- **Unachieved icon:** `art/concept/achievements/achievement-foundry-bound-locked-v1.png` (generation master) and `art/concept/achievements/achievement-foundry-bound-locked-v1-128.png` (small-size review export).
- **Full image prompt:**

> Create a square Steam achievement icon for Voltswarm, designed to remain immediately readable at very small sizes. Stylized 3D voxel art with an industrial-toy appearance, chunky visible cubic voxel blocks, compact geometry, flat per-face shading, crisp hard stepped edges, and one dominant unmistakable silhouette. Use the current Voltswarm palette: dark graphite and gunmetal foundations, painted construction amber where appropriate, WHITE energy and power light, and only restrained existing gameplay accent colors when truthful to the subject. Use a simple high-contrast background with a subtle radial glow and no environmental clutter. Center the subject with generous negative space and avoid thin details. No text, no letters, no words, no logos, no digits, no written numbers, no UI labels, no watermark, no gore, no blood, and no realistic organic anatomy. Everything must be explicitly constructed as voxel geometry, including particles, energy, smoke, sparks, and lighting accents. No smooth curves, vector-flat blobs, irregular splashes, gradients, photorealism, realistic smoke, or excessive bloom. All-ages appropriate, polished game-achievement presentation. Depict a single monumental voxel gateway transforming from cold scrapyard steel on one side into a glowing amber foundry threshold on the other, with a white energy path crossing through its center. The gateway must form one bold, readable silhouette.

### 6. `ach_scrapyard_command` — P0

- **Display name:** `Scrapyard Command`
- **Steam description:** `Defeat both Crusher King and Tesla Titan across your career.`
- **Exact condition:** `LIFETIME.bossTypesDefeated` contains both exact persisted runtime identities `Crusher King` and `Tesla Titan`. These are the current `ENEMY_TYPES[].name` strings recorded by `BossSystem.defeatedTypes`, not the model keys `crusher-king` and `tesla-titan`.
- **Hidden:** No — this promotes boss variety across runs.
- **Estimated difficulty:** Medium.
- **Signal:** Existing `LIFETIME.bossTypesDefeated`.
- **Implementation:** Implemented locally with Steam API name `ACH_SCRAPYARD_COMMAND`. The required persisted identity set is config-owned, order-independent, duplicate-safe, and malformed non-array ledgers cannot qualify. Steamworks App Admin entry creation is maintainer-confirmed; publication, icon upload, and production-build achievement-unlock smoke remain external verification steps.
- **Achieved icon:** `art/concept/achievements/achievement-scrapyard-command-v1.png` (generation master) and `art/concept/achievements/achievement-scrapyard-command-v1-128.png` (small-size review export).
- **Unachieved icon:** `art/concept/achievements/achievement-scrapyard-command-locked-v1.png` (generation master) and `art/concept/achievements/achievement-scrapyard-command-locked-v1-128.png` (small-size review export).
- **Full image prompt:**

> Create a square Steam achievement icon for Voltswarm, designed to remain immediately readable at very small sizes. Stylized 3D voxel art with an industrial-toy appearance, chunky visible cubic voxel blocks, compact geometry, flat per-face shading, crisp hard stepped edges, and one dominant unmistakable silhouette. Use the current Voltswarm palette: dark graphite and gunmetal foundations, painted construction amber where appropriate, WHITE energy and power light, and only restrained existing gameplay accent colors when truthful to the subject. Use a simple high-contrast background with a subtle radial glow and no environmental clutter. Center the subject with generous negative space and avoid thin details. No text, no letters, no words, no logos, no digits, no written numbers, no UI labels, no watermark, no gore, no blood, and no realistic organic anatomy. Everything must be explicitly constructed as voxel geometry, including particles, energy, smoke, sparks, and lighting accents. No smooth curves, vector-flat blobs, irregular splashes, gradients, photorealism, realistic smoke, or excessive bloom. All-ages appropriate, polished game-achievement presentation. Depict a unified trophy made from the heavy crushing jaw plate of Crusher King crossed with the angular electric coil crown of Tesla Titan. Make both boss motifs clearly distinct while joining them into one compact scrapyard command emblem. Tesla energy is white rather than generic cyan.

### 7. `ach_hazard_contained` — P0

- **Display name:** `Hazard Contained`
- **Steam description:** `Defeat the Hazard Marshal.`
- **Exact condition:** `LIFETIME.bossTypesDefeated` contains `Hazard Marshal`.
- **Hidden:** Yes — it conceals the final boss identity until reached.
- **Estimated difficulty:** Hard.
- **Signal:** Existing `LIFETIME.bossTypesDefeated`.
- **Implementation:** Implemented locally with Steam API name `ACH_HAZARD_CONTAINED`. The predicate uses the exact persisted runtime identity `Hazard Marshal`, not the `final-boss` model key; malformed non-array ledgers cannot qualify. Canonical metadata keeps this achievement hidden. Steamworks App Admin entry creation is maintainer-confirmed; publication, icon upload, and production-build achievement-unlock smoke remain external verification steps.
- **Achieved icon:** `art/concept/achievements/achievement-hazard-contained-v1.png` (generation master) and `art/concept/achievements/achievement-hazard-contained-v1-128.png` (small-size review export).
- **Unachieved icon:** `art/concept/achievements/achievement-hazard-contained-locked-v1.png` (generation master) and `art/concept/achievements/achievement-hazard-contained-locked-v1-128.png` (small-size review export).
- **Full image prompt:**

> Create a square Steam achievement icon for Voltswarm, designed to remain immediately readable at very small sizes. Stylized 3D voxel art with an industrial-toy appearance, chunky visible cubic voxel blocks, compact geometry, flat per-face shading, crisp hard stepped edges, and one dominant unmistakable silhouette. Use the current Voltswarm palette: dark graphite and gunmetal foundations, painted construction amber where appropriate, WHITE energy and power light, and only restrained existing gameplay accent colors when truthful to the subject. Use a simple high-contrast background with a subtle radial glow and no environmental clutter. Center the subject with generous negative space and avoid thin details. No text, no letters, no words, no logos, no digits, no written numbers, no UI labels, no watermark, no gore, no blood, and no realistic organic anatomy. Everything must be explicitly constructed as voxel geometry, including particles, energy, smoke, sparks, and lighting accents. No smooth curves, vector-flat blobs, irregular splashes, gradients, photorealism, realistic smoke, or excessive bloom. All-ages appropriate, polished game-achievement presentation. Depict the unmistakable armored faceplate and hazard-light crown of the Hazard Marshal locked inside a heavy white-energy containment clamp, with its red overload glow extinguishing into dark cubic voxel smoke. Keep the final-boss faceplate dominant and menacing but toy-like.

### 8. `ach_full_circuit` — P0

- **Display name:** `Full Circuit`
- **Steam description:** `Complete the full run by clearing both sectors in order.`
- **Exact condition:** `LIFETIME.runsCompleted >= 1`, derived only from `isRunComplete()`.
- **Hidden:** Yes — it conceals the final structural outcome.
- **Estimated difficulty:** Hard.
- **Signal:** Existing `LIFETIME.runsCompleted` and `run-complete` outcome.
- **Implementation:** Implemented locally with Steam API name `ACH_FULL_CIRCUIT`. The config-derived predicate reads only the finite durable `LIFETIME.runsCompleted` ledger. That ledger is folded through `isRunComplete()` from structural sector credit or an explicit `run-complete` outcome; duration, Map 2 arrival, and a Hazard Marshal defeat alone do not qualify. Canonical metadata keeps this achievement hidden. Steamworks App Admin entry creation is maintainer-confirmed; publication, icon upload, and production-build achievement-unlock smoke remain external verification steps.
- **Achieved icon:** `art/concept/achievements/achievement-full-circuit-v1.png` (generation master) and `art/concept/achievements/achievement-full-circuit-v1-128.png` (small-size review export).
- **Unachieved icon:** `art/concept/achievements/achievement-full-circuit-locked-v1.png` (generation master) and `art/concept/achievements/achievement-full-circuit-locked-v1-128.png` (small-size review export).
- **Full image prompt:**

> Create a square Steam achievement icon for Voltswarm, designed to remain immediately readable at very small sizes. Stylized 3D voxel art with an industrial-toy appearance, chunky visible cubic voxel blocks, compact geometry, flat per-face shading, crisp hard stepped edges, and one dominant unmistakable silhouette. Use the current Voltswarm palette: dark graphite and gunmetal foundations, painted construction amber where appropriate, WHITE energy and power light, and only restrained existing gameplay accent colors when truthful to the subject. Use a simple high-contrast background with a subtle radial glow and no environmental clutter. Center the subject with generous negative space and avoid thin details. No text, no letters, no words, no logos, no digits, no written numbers, no UI labels, no watermark, no gore, no blood, and no realistic organic anatomy. Everything must be explicitly constructed as voxel geometry, including particles, energy, smoke, sparks, and lighting accents. No smooth curves, vector-flat blobs, irregular splashes, gradients, photorealism, realistic smoke, or excessive bloom. All-ages appropriate, polished game-achievement presentation. Depict two large industrial sector plates, one scrapyard steel and one molten foundry metal, connected into a closed white electrical circuit around a bright central completion core. The complete loop must be the dominant readable silhouette.

### 9. `ach_field_engineer_clear` — P0

- **Display name:** `Field Tested`
- **Steam description:** `Complete the full run as Field Engineer.`
- **Exact condition:** `LIFETIME.completedCharacterIds` contains `field-engineer`.
- **Hidden:** No.
- **Estimated difficulty:** Hard.
- **Signal:** Existing `LIFETIME.completedCharacterIds`.
- **Implementation:** Implemented locally with Steam API name `ACH_FIELD_ENGINEER_CLEAR`. The config-owned predicate requires the exact stable registered character ID `field-engineer`; malformed ledgers, display names, asset identifiers, and incomplete runs cannot qualify. `completedCharacterIds` is folded only inside the structural `isRunComplete()` branch. Steamworks App Admin entry creation is maintainer-confirmed; publication, icon upload, and production-build achievement-unlock smoke remain external verification steps.
- **Achieved icon:** `art/concept/achievements/achievement-field-tested-v1.png` (generation master) and `art/concept/achievements/achievement-field-tested-v1-128.png` (small-size review export).
- **Unachieved icon:** `art/concept/achievements/achievement-field-tested-locked-v1.png` (generation master) and `art/concept/achievements/achievement-field-tested-locked-v1-128.png` (small-size review export).
- **Full image prompt:**

> Create a square Steam achievement icon for Voltswarm, designed to remain immediately readable at very small sizes. Stylized 3D voxel art with an industrial-toy appearance, chunky visible cubic voxel blocks, compact geometry, flat per-face shading, crisp hard stepped edges, and one dominant unmistakable silhouette. Use the current Voltswarm palette: dark graphite and gunmetal foundations, painted construction amber where appropriate, WHITE energy and power light, and only restrained existing gameplay accent colors when truthful to the subject. Use a simple high-contrast background with a subtle radial glow and no environmental clutter. Center the subject with generous negative space and avoid thin details. No text, no letters, no words, no logos, no digits, no written numbers, no UI labels, no watermark, no gore, no blood, and no realistic organic anatomy. Everything must be explicitly constructed as voxel geometry, including particles, energy, smoke, sparks, and lighting accents. No smooth curves, vector-flat blobs, irregular splashes, gradients, photorealism, realistic smoke, or excessive bloom. All-ages appropriate, polished game-achievement presentation. Depict the approved Field Engineer as a compact frontal voxel bust with the character's distinctive shoulder repair module actively restoring a bright white power node beside the shoulder. Preserve the character's real silhouette and equipment identity; do not add a wrench or any invented handheld tool.

### 10. `ach_rack_hauler_clear` — P0

- **Display name:** `Fully Loaded`
- **Steam description:** `Complete the full run as Rack Hauler.`
- **Exact condition:** `LIFETIME.completedCharacterIds` contains `rack-hauler`.
- **Hidden:** No.
- **Estimated difficulty:** Hard.
- **Signal:** Existing `LIFETIME.completedCharacterIds`.
- **Implementation:** Implemented locally with Steam API name `ACH_RACK_HAULER_CLEAR`. The config-owned predicate requires the exact stable registered character ID `rack-hauler`; malformed ledgers, display names, art references, and incomplete runs cannot qualify. `completedCharacterIds` is folded only inside the structural `isRunComplete()` branch. Steamworks App Admin entry creation is maintainer-confirmed; publication, icon upload, and production-build achievement-unlock smoke remain external verification steps.
- **Achieved icon:** `art/concept/achievements/achievement-fully-loaded-v1.png` (generation master) and `art/concept/achievements/achievement-fully-loaded-v1-128.png` (small-size review export).
- **Unachieved icon:** `art/concept/achievements/achievement-fully-loaded-locked-v1.png` (generation master) and `art/concept/achievements/achievement-fully-loaded-locked-v1-128.png` (small-size review export).
- **Full image prompt:**

> Create a square Steam achievement icon for Voltswarm, designed to remain immediately readable at very small sizes. Stylized 3D voxel art with an industrial-toy appearance, chunky visible cubic voxel blocks, compact geometry, flat per-face shading, crisp hard stepped edges, and one dominant unmistakable silhouette. Use the current Voltswarm palette: dark graphite and gunmetal foundations, painted construction amber where appropriate, WHITE energy and power light, and only restrained existing gameplay accent colors when truthful to the subject. Use a simple high-contrast background with a subtle radial glow and no environmental clutter. Center the subject with generous negative space and avoid thin details. No text, no letters, no words, no logos, no digits, no written numbers, no UI labels, no watermark, no gore, no blood, and no realistic organic anatomy. Everything must be explicitly constructed as voxel geometry, including particles, energy, smoke, sparks, and lighting accents. No smooth curves, vector-flat blobs, irregular splashes, gradients, photorealism, realistic smoke, or excessive bloom. All-ages appropriate, polished game-achievement presentation. Depict the approved Rack Hauler as a compact frontal voxel bust dominated by its wide seafoam shoulder housings and their real visible socket panels, carrying compact abstract industrial modules secured by bright white power clamps. Preserve the real broad character silhouette. Do not add recognizable guns, handheld weapons, or any extra equipment not present on the approved character.

### 11. `ach_overclocker_clear` — P0

- **Display name:** `Past Redline`
- **Steam description:** `Complete the full run as Overclocker.`
- **Exact condition:** `LIFETIME.completedCharacterIds` contains `overclocker`.
- **Hidden:** No.
- **Estimated difficulty:** Very hard.
- **Signal:** Existing `LIFETIME.completedCharacterIds`.
- **Implementation:** Implemented locally with Steam API name `ACH_OVERCLOCKER_CLEAR`. The config-owned predicate requires the exact stable registered character ID `overclocker`; malformed ledgers, display names, art references, and incomplete runs cannot qualify. `completedCharacterIds` is folded only inside the structural `isRunComplete()` branch. Steamworks App Admin entry creation is maintainer-confirmed; publication, icon upload, and production-build achievement-unlock smoke remain external verification steps.
- **Achieved icon:** `art/concept/achievements/achievement-past-redline-v1.png` (generation master) and `art/concept/achievements/achievement-past-redline-v1-128.png` (small-size review export).
- **Unachieved icon:** `art/concept/achievements/achievement-past-redline-locked-v1.png` (generation master) and `art/concept/achievements/achievement-past-redline-locked-v1-128.png` (small-size review export).
- **Full image prompt:**

> Create a square Steam achievement icon for Voltswarm, designed to remain immediately readable at very small sizes. Stylized 3D voxel art with an industrial-toy appearance, chunky visible cubic voxel blocks, compact geometry, flat per-face shading, crisp hard stepped edges, and one dominant unmistakable silhouette. Use the current Voltswarm palette: dark graphite and gunmetal foundations, painted construction amber where appropriate, WHITE energy and power light, and only restrained existing gameplay accent colors when truthful to the subject. Use a simple high-contrast background with a subtle radial glow and no environmental clutter. Center the subject with generous negative space and avoid thin details. No text, no letters, no words, no logos, no digits, no written numbers, no UI labels, no watermark, no gore, no blood, and no realistic organic anatomy. Everything must be explicitly constructed as voxel geometry, including particles, energy, smoke, sparks, and lighting accents. No smooth curves, vector-flat blobs, irregular splashes, gradients, photorealism, realistic smoke, or excessive bloom. All-ages appropriate, polished game-achievement presentation. Depict the approved Overclocker as a slender cream-and-magenta frontal voxel bust, with the actual chest power chamber opened visually to reveal a contained voxel overdrive rotor and cooling stack glowing from white energy into intense amber-red output. Preserve the real character silhouette and color blocking. Do not add external machinery, handheld tools, weapons, cables, or any invented equipment.

### 12. `ach_first_contract` — P0

- **Display name:** `Signed and Stamped`
- **Steam description:** `Complete your first Contract and receive its reward.`
- **Exact condition:** `LIFETIME.completedContracts` contains at least one ID declared by the Contract catalog; only a settled, paid Contract enters this ledger.
- **Hidden:** No — it introduces persistent progression.
- **Estimated difficulty:** Easy.
- **Signal:** Existing completed Contract IDs.
- **Implementation:** Implemented locally with Steam API name `ACH_FIRST_CONTRACT`. The config-derived threshold requires at least one catalog-valid ID in the durable `LIFETIME.completedContracts` ledger. Contract settlement grants the reward before appending that ID, while dry reward queues remain pending. Its persistence result gates achievement evaluation at both startup and run end, so an in-memory settlement whose save failed cannot unlock; malformed IDs, reward-map entries, and unrelated pending state cannot qualify. Steamworks App Admin entry creation is maintainer-confirmed; publication, icon upload, and production-build achievement-unlock smoke remain external verification steps.
- **Achieved icon:** `art/concept/achievements/achievement-signed-and-stamped-v1.png` (generation master) and `art/concept/achievements/achievement-signed-and-stamped-v1-128.png` (small-size review export).
- **Unachieved icon:** `art/concept/achievements/achievement-signed-and-stamped-locked-v1.png` (generation master) and `art/concept/achievements/achievement-signed-and-stamped-locked-v1-128.png` (small-size review export).
- **Full image prompt:**

> Create a square Steam achievement icon for Voltswarm, designed to remain immediately readable at very small sizes. Stylized 3D voxel art with an industrial-toy appearance, chunky visible cubic voxel blocks, compact geometry, flat per-face shading, crisp hard stepped edges, and one dominant unmistakable silhouette. Use the current Voltswarm palette: dark graphite and gunmetal foundations, painted construction amber where appropriate, WHITE energy and power light, and only restrained existing gameplay accent colors when truthful to the subject. Use a simple high-contrast background with a subtle radial glow and no environmental clutter. Center the subject with generous negative space and avoid thin details. No text, no letters, no words, no logos, no digits, no written numbers, no UI labels, no watermark, no gore, no blood, and no realistic organic anatomy. Everything must be explicitly constructed as voxel geometry, including particles, energy, smoke, sparks, and lighting accents. No smooth curves, vector-flat blobs, irregular splashes, gradients, photorealism, realistic smoke, or excessive bloom. All-ages appropriate, polished game-achievement presentation. Depict a thick blank industrial contract plate with no writing, firmly stamped by a mechanical white-lit check seal and ejecting one small unlocked reward module. The physical stamped plate must be the dominant silhouette.

### 13. `ach_full_capacity` — P0

- **Display name:** `No Empty Sockets`
- **Steam description:** `Unlock maximum Weapon and Core capacity, plus the extra level-up discard.`
- **Exact condition:** `PROFILE.weaponSockets`, `PROFILE.coreSockets`, and `PROFILE.levelupDiscards` exactly equal their config-owned release ceilings: 3, 4, and 4 respectively.
- **Hidden:** No — this is the major persistent-progression milestone.
- **Estimated difficulty:** Hard.
- **Signal:** Existing `PROFILE` fields.
- **Implementation:** Implemented locally with Steam API name `ACH_FULL_CAPACITY`. `PROFILE_CAPACITY` is the authoritative source for all three ceilings, including the newly explicit discard ceiling. The predicate requires finite exact equality rather than `>=`; profile normalization rejects malformed, fractional, and over-cap persisted values instead of clamping them into an unlock. Durable completed Contract IDs restore the minimum capacity they legitimately paid, including Untouchable's config-owned extra discard, so a damaged counter cannot revoke an earned reward. Socket and discard rewards also refuse to exceed their config ceilings. Steamworks App Admin entry creation is maintainer-confirmed; publication, icon upload, and production-build achievement-unlock smoke remain external verification steps.
- **Achieved icon:** `art/concept/achievements/achievement-no-empty-sockets-v1.png` (generation master) and `art/concept/achievements/achievement-no-empty-sockets-v1-128.png` (small-size review export).
- **Unachieved icon:** `art/concept/achievements/achievement-no-empty-sockets-locked-v1.png` (generation master) and `art/concept/achievements/achievement-no-empty-sockets-locked-v1-128.png` (small-size review export).
- **Full image prompt:**

> Create a square Steam achievement icon for Voltswarm, designed to remain immediately readable at very small sizes. Stylized 3D voxel art with an industrial-toy appearance, chunky visible cubic voxel blocks, compact geometry, flat per-face shading, crisp hard stepped edges, and one dominant unmistakable silhouette. Use the current Voltswarm palette: dark graphite and gunmetal foundations, painted construction amber where appropriate, WHITE energy and power light, and only restrained existing gameplay accent colors when truthful to the subject. Use a simple high-contrast background with a subtle radial glow and no environmental clutter. Center the subject with generous negative space and avoid thin details. No text, no letters, no words, no logos, no digits, no written numbers, no UI labels, no watermark, no gore, no blood, and no realistic organic anatomy. Everything must be explicitly constructed as voxel geometry, including particles, energy, smoke, sparks, and lighting accents. No smooth curves, vector-flat blobs, irregular splashes, gradients, photorealism, realistic smoke, or excessive bloom. All-ages appropriate, polished game-achievement presentation. Depict one fully populated industrial loadout chassis with every visible socket occupied: chunky weapon couplings across the top, glowing Core sockets below, and one separate discard token locked into the side. No empty holes and no numeric labels.

### 14. `ach_weapon_level_20` — P0

- **Display name:** `Factory Specification`
- **Steam description:** `Raise any weapon to level 20 in a single run.`
- **Exact condition:** Any `LIFETIME.weaponMaxLevel[id] >= 20`.
- **Hidden:** No — it exposes the real weapon ceiling.
- **Estimated difficulty:** Medium.
- **Signal:** Existing `LIFETIME.weaponMaxLevel`.
- **Implementation:** Implemented locally with Steam API name `ACH_WEAPON_LEVEL_20`. The predicate derives the release ceiling from config-owned `MAX_WEAPON_LEVEL`, accepts only finite integer levels belonging to currently playable IDs in the canonical weapon registry, and rejects unknown IDs, malformed values, and the disabled Oil Sprayer. It uses `>=` because `weaponMaxLevel` is a monotonic career maximum: a legitimate historical value above a later release ceiling must not revoke earned progress. Finished-run folding applies the same playable-ID and integer validation before persisting new maxima; profile loading also sanitizes and rewrites contaminated weapon-level ledgers so rejected data cannot become valid after a future registry change. Steamworks App Admin entry creation is maintainer-confirmed; publication, icon upload, and production-build achievement-unlock smoke remain external verification steps.
- **Achieved icon:** `art/concept/achievements/achievement-factory-specification-v1.png` (generation master) and `art/concept/achievements/achievement-factory-specification-v1-128.png` (small-size review export).
- **Unachieved icon:** `art/concept/achievements/achievement-factory-specification-locked-v1.png` (generation master) and `art/concept/achievements/achievement-factory-specification-locked-v1-128.png` (small-size review export).
- **Full image prompt:**

> Create a square Steam achievement icon for Voltswarm, designed to remain immediately readable at very small sizes. Stylized 3D voxel art with an industrial-toy appearance, chunky visible cubic voxel blocks, compact geometry, flat per-face shading, crisp hard stepped edges, and one dominant unmistakable silhouette. Use the current Voltswarm palette: dark graphite and gunmetal foundations, painted construction amber where appropriate, WHITE energy and power light, and only restrained existing gameplay accent colors when truthful to the subject. Use a simple high-contrast background with a subtle radial glow and no environmental clutter. Center the subject with generous negative space and avoid thin details. No text, no letters, no words, no logos, no digits, no written numbers, no UI labels, no watermark, no gore, no blood, and no realistic organic anatomy. Everything must be explicitly constructed as voxel geometry, including particles, energy, smoke, sparks, and lighting accents. No smooth curves, vector-flat blobs, irregular splashes, gradients, photorealism, realistic smoke, or excessive bloom. All-ages appropriate, polished game-achievement presentation. Depict one fully upgraded chunky voxel weapon locked inside a complete segmented white calibration ring, with every segment illuminated and a clean factory-grade energy flare. Do not show digits or written level indicators.

### 15. `ach_weapon_mastery` — P0

- **Display name:** `Proven Hardware`
- **Steam description:** `Deal 50,000 lifetime damage with a single weapon.`
- **Exact condition:** Any `LIFETIME.damageByWeapon[id]` reaches `CONTRACTS.ladders.masteryDamage`, currently 50,000.
- **Hidden:** No — it is visible cumulative progress.
- **Estimated difficulty:** Medium.
- **Signal:** Existing `LIFETIME.damageByWeapon`; threshold remains config-derived.
- **Implementation:** Implemented locally with Steam API name `ACH_WEAPON_MASTERY`. The predicate reuses `CONTRACTS.ladders.masteryDamage` as its authoritative threshold and accepts only finite damage attributed to currently playable IDs in the canonical weapon registry. Fractional nonnegative damage is preserved because the combat funnel records actual applied damage, including fractional damage-over-time ticks. Finished-run folding and profile loading reject unknown IDs, disabled Oil, non-finite values, strings, and negative entries; contaminated durable ledgers are rewritten so invalid identity data cannot become retroactively eligible after a future registry change. Steamworks App Admin entry creation is maintainer-confirmed; publication, icon upload, and production-build achievement-unlock smoke remain external verification steps.
- **Achieved icon:** `art/concept/achievements/achievement-proven-hardware-v1.png` (generation master) and `art/concept/achievements/achievement-proven-hardware-v1-128.png` (small-size review export).
- **Unachieved icon:** `art/concept/achievements/achievement-proven-hardware-locked-v1.png` (generation master) and `art/concept/achievements/achievement-proven-hardware-locked-v1-128.png` (small-size review export).
- **Full image prompt:**

> Create a square Steam achievement icon for Voltswarm, designed to remain immediately readable at very small sizes. Stylized 3D voxel art with an industrial-toy appearance, chunky visible cubic voxel blocks, compact geometry, flat per-face shading, crisp hard stepped edges, and one dominant unmistakable silhouette. Use the current Voltswarm palette: dark graphite and gunmetal foundations, painted construction amber where appropriate, WHITE energy and power light, and only restrained existing gameplay accent colors when truthful to the subject. Use a simple high-contrast background with a subtle radial glow and no environmental clutter. Center the subject with generous negative space and avoid thin details. No text, no letters, no words, no logos, no digits, no written numbers, no UI labels, no watermark, no gore, no blood, and no realistic organic anatomy. Everything must be explicitly constructed as voxel geometry, including particles, energy, smoke, sparks, and lighting accents. No smooth curves, vector-flat blobs, irregular splashes, gradients, photorealism, realistic smoke, or excessive bloom. All-ages appropriate, polished game-achievement presentation. Depict one battle-worn industrial voxel weapon mounted like proven hardware, firing a dense white impact burst into a heavy test plate covered in mechanical dents. Communicate accumulated mastery through the battered plate and stable weapon glow, without numbers.

### 16. `ach_four_core_array` — P0

- **Display name:** `Core Array`
- **Steam description:** `Finish a recorded run carrying four distinct Cores.`
- **Exact condition:** A recorded run contains four distinct IDs in `coreLevels` with positive levels.
- **Hidden:** No — it promotes use of full Core capacity.
- **Estimated difficulty:** Medium.
- **Signal:** Available in `RunRecordV1`, but only while the record remains inside the 250-run history.
- **Telemetry:** Implemented as monotonic `LIFETIME.bestDistinctCoresHeld` for durable retroactivity. New profiles fold it only from terminal run records. Older profiles perform a one-time best-effort backfill from the bounded 250-run history and immediately persist the result; records that already aged out cannot be recovered.
- **Implementation:** Implemented locally with Steam API name `ACH_FOUR_CORE_ARRAY`. The exact threshold derives from the release Core capacity in `PROFILE_CAPACITY.coreSockets`. Folding counts distinct IDs only when they exist in the active `CORE_TITLES` registry and have positive finite integer levels; unknown IDs, duplicate object keys, fractional/non-finite levels, non-terminal records, and impossible over-cap sets do not qualify. Persisted telemetry accepts only finite integers from zero through the release capacity, with malformed values reset or recovered from surviving valid history. Steamworks App Admin entry creation is maintainer-confirmed; publication, icon upload, and production-build achievement-unlock smoke remain external verification steps.
- **Achieved icon:** `art/concept/achievements/achievement-core-array-v1.png` (generation master) and `art/concept/achievements/achievement-core-array-v1-128.png` (small-size review export).
- **Unachieved icon:** `art/concept/achievements/achievement-core-array-locked-v1.png` (generation master) and `art/concept/achievements/achievement-core-array-locked-v1-128.png` (small-size review export).
- **Full image prompt:**

> Create a square Steam achievement icon for Voltswarm, designed to remain immediately readable at very small sizes. Stylized 3D voxel art with an industrial-toy appearance, chunky visible cubic voxel blocks, compact geometry, flat per-face shading, crisp hard stepped edges, and one dominant unmistakable silhouette. Use the current Voltswarm palette: dark graphite and gunmetal foundations, painted construction amber where appropriate, WHITE energy and power light, and only restrained existing gameplay accent colors when truthful to the subject. Use a simple high-contrast background with a subtle radial glow and no environmental clutter. Center the subject with generous negative space and avoid thin details. No text, no letters, no words, no logos, no digits, no written numbers, no UI labels, no watermark, no gore, no blood, and no realistic organic anatomy. Everything must be explicitly constructed as voxel geometry, including particles, energy, smoke, sparks, and lighting accents. No smooth curves, vector-flat blobs, irregular splashes, gradients, photorealism, realistic smoke, or excessive bloom. All-ages appropriate, polished game-achievement presentation. Depict four visually distinct voxel Core orbs locked into a compact cross-shaped industrial array, each with a truthful different internal symbol shape and accent color, all feeding one stable white central conduit. Make the complete Core array the dominant silhouette.

### 17. `ach_five_mod_rig` — P0

- **Display name:** `Custom Rig`
- **Steam description:** `Finish a recorded run carrying five distinct Mods.`
- **Exact condition:** A recorded terminal run contains five distinct permanent-Mod IDs in `modCounts` with positive counts; duplicate copies do not increase the distinct count, and instant consumables never count as carried Mods.
- **Hidden:** No — it promotes variety rather than an exact RNG combination.
- **Estimated difficulty:** Medium.
- **Signal:** Available in `RunRecordV1`, but only while the record remains inside the bounded history.
- **Telemetry:** Implemented as monotonic `LIFETIME.bestDistinctPermanentModsHeld` for durable retroactivity. New profiles fold it only from terminal run records. Older profiles perform a one-time best-effort backfill from the bounded 250-run history and immediately persist the result; records that already aged out cannot be recovered. The never-shipped interim key `bestDistinctModsHeld` is ignored rather than trusted because it mixed consumables with installed hardware.
- **Implementation:** Implemented locally with Steam API name `ACH_FIVE_MOD_RIG`. The threshold lives in `ACHIEVEMENTS.fiveModRig.minimumDistinctMods`; the monotonic maximum may legitimately exceed five because permanent Mods have no socket limit. Folding derives carryable identity from `MOD_REGISTRY[id].kind === 'permanent'` and requires positive finite integer copy counts. The four instant consumables remain reward/run-event counters and never count as installed harness hardware; multiple copies of one permanent Mod count once, while unknown IDs, malformed counts, and non-terminal records do not qualify. Persisted telemetry accepts only finite integers from zero through the registry-derived permanent-Mod count; malformed or impossible values are reset or recovered from surviving valid history without clamp-to-unlock. Steamworks App Admin entry creation is maintainer-confirmed; publication, icon upload, and production-build achievement-unlock smoke remain external verification steps.
- **Achieved icon:** `art/concept/achievements/achievement-custom-rig-v1.png` (generation master) and `art/concept/achievements/achievement-custom-rig-v1-128.png` (small-size review export).
- **Unachieved icon:** `art/concept/achievements/achievement-custom-rig-locked-v1.png` (generation master) and `art/concept/achievements/achievement-custom-rig-locked-v1-128.png` (small-size review export).
- **Full image prompt:**

> Create a square Steam achievement icon for Voltswarm, designed to remain immediately readable at very small sizes. Stylized 3D voxel art with an industrial-toy appearance, chunky visible cubic voxel blocks, compact geometry, flat per-face shading, crisp hard stepped edges, and one dominant unmistakable silhouette. Use the current Voltswarm palette: dark graphite and gunmetal foundations, painted construction amber where appropriate, WHITE energy and power light, and only restrained existing gameplay accent colors when truthful to the subject. Use a simple high-contrast background with a subtle radial glow and no environmental clutter. Center the subject with generous negative space and avoid thin details. No text, no letters, no words, no logos, no digits, no written numbers, no UI labels, no watermark, no gore, no blood, and no realistic organic anatomy. Everything must be explicitly constructed as voxel geometry, including particles, energy, smoke, sparks, and lighting accents. No smooth curves, vector-flat blobs, irregular splashes, gradients, photorealism, realistic smoke, or excessive bloom. All-ages appropriate, polished game-achievement presentation. Depict a single custom industrial harness fitted with five clearly distinct chunky voxel Mod modules, each using a different truthful mechanical silhouette such as relay, coolant tank, trigger block, magnetic coil, and reinforced plate. Connect them with restrained white power traces and avoid written labels.

### 18. `ach_purist` — P1

- **Display name:** `Purist`
- **Steam description:** `Clear both sectors in one run with exactly one weapon and no Mods.`
- **Exact condition:** `LIFETIME.bestPuristSectors` reaches the config-derived current full-sector count (`CONTRACTS.puristSectors`, currently 2). It is earned only by a terminal `isRunComplete()` record with all sectors structurally credited, exactly one positive-level currently playable weapon, and zero installed permanent Mods. Instant consumables do not occupy Mod sockets and do not disqualify the run.
- **Hidden:** No — players must know the condition to attempt it deliberately.
- **Estimated difficulty:** Very hard.
- **Signal:** Implemented as monotonic `LIFETIME.bestPuristSectors`.
- **Telemetry:** The former `bestMinimalSectors` scalar is not trusted because its historical fold counted unknown/disabled weapon keys and treated instant consumables as installed Mods. On first load, the replacement field is backfilled only from surviving bounded run history using current playable-weapon and permanent-Mod registry semantics, then persisted. Evidence already aged out of history cannot be recovered automatically.
- **Implementation:** Implemented locally with Steam API name `ACH_PURIST`. The predicate uses `CONTRACTS.puristSectors`, which derives from the release map roster. Folding rejects partial or non-terminal records, zero or multiple weapons, positive-level disabled Oil, unknown IDs, and malformed/non-finite/fractional levels or counts. Exactly one valid playable weapon qualifies, while any positive permanent Mod disqualifies; valid instant consumable counters are ignored as non-installed run events. Steamworks App Admin entry creation is maintainer-confirmed; publication, icon upload, and production-build achievement-unlock smoke remain external verification steps.
- **Achieved icon:** `art/concept/achievements/achievement-purist-v1.png` (generation master) and `art/concept/achievements/achievement-purist-v1-128.png` (small-size review export).
- **Unachieved icon:** `art/concept/achievements/achievement-purist-locked-v1.png` (generation master) and `art/concept/achievements/achievement-purist-locked-v1-128.png` (small-size review export).
- **Full image prompt:**

> Create a square Steam achievement icon for Voltswarm, designed to remain immediately readable at very small sizes. Stylized 3D voxel art with an industrial-toy appearance, chunky visible cubic voxel blocks, compact geometry, flat per-face shading, crisp hard stepped edges, and one dominant unmistakable silhouette. Use the current Voltswarm palette: dark graphite and gunmetal foundations, painted construction amber where appropriate, WHITE energy and power light, and only restrained existing gameplay accent colors when truthful to the subject. Use a simple high-contrast background with a subtle radial glow and no environmental clutter. Center the subject with generous negative space and avoid thin details. No text, no letters, no words, no logos, no digits, no written numbers, no UI labels, no watermark, no gore, no blood, and no realistic organic anatomy. Everything must be explicitly constructed as voxel geometry, including particles, energy, smoke, sparks, and lighting accents. No smooth curves, vector-flat blobs, irregular splashes, gradients, photorealism, realistic smoke, or excessive bloom. All-ages appropriate, polished game-achievement presentation. Depict one solitary industrial voxel weapon standing upright between two cleared sector plates, surrounded by visibly empty Mod sockets and a clean narrow white energy path. Emphasize deliberate minimalism: one weapon, no additional modules, no clutter.

### 19. `ach_untouchable` — P1

- **Display name:** `Untouchable`
- **Steam description:** `Survive for five minutes in a single run without taking damage.`
- **Exact condition:** finite `LIFETIME.bestFlawlessRunS >= CONTRACTS.flawlessSeconds` (currently 300), folded only from a terminal recorded run with exact `damageTaken === 0`. Legacy records without `damageTaken` are unknown and never count; incomplete or quit runs cannot contribute.
- **Hidden:** No — the condition must be visible.
- **Estimated difficulty:** Very hard.
- **Signal:** Existing monotonic `LIFETIME.bestFlawlessRunS`, now normalized and backfilled strictly from bounded terminal history when absent or malformed.
- **Implementation:** Implemented locally with Steam API name `ACH_UNTOUCHABLE`. The achievement and existing Untouchable Contract share the single authoritative `CONTRACTS.flawlessSeconds` threshold. The runtime damage funnel increments `runDamageTaken` only for actual post-armor HP damage; evasion and Barrier Cell blocks record no damage because the hit does not harm the player. Run finalization copies that counter into `RunRecordV1.damageTaken`. Folding requires a terminal outcome, exact known zero damage, and a finite nonnegative duration; fractional seconds are legitimate because run duration is recorded to millisecond precision. Existing valid monotonic values remain durable, while missing or invalid values are best-effort recovered from surviving history and re-saved. Steamworks App Admin entry creation is maintainer-confirmed; publication, icon upload, and production-build achievement-unlock smoke remain external verification steps.
- **Achieved icon:** `art/concept/achievements/achievement-untouchable-v1.png` (generation master) and `art/concept/achievements/achievement-untouchable-v1-128.png` (small-size review export).
- **Unachieved icon:** `art/concept/achievements/achievement-untouchable-locked-v1.png` (generation master) and `art/concept/achievements/achievement-untouchable-locked-v1-128.png` (small-size review export).
- **Full image prompt:**

> Create a square Steam achievement icon for Voltswarm, designed to remain immediately readable at very small sizes. Stylized 3D voxel art with an industrial-toy appearance, chunky visible cubic voxel blocks, compact geometry, flat per-face shading, crisp hard stepped edges, and one dominant unmistakable silhouette. Use the current Voltswarm palette: dark graphite and gunmetal foundations, painted construction amber where appropriate, WHITE energy and power light, and only restrained existing gameplay accent colors when truthful to the subject. Use a simple high-contrast background with a subtle radial glow and no environmental clutter. Center the subject with generous negative space and avoid thin details. No text, no letters, no words, no logos, no digits, no written numbers, no UI labels, no watermark, no gore, no blood, and no realistic organic anatomy. Everything must be explicitly constructed as voxel geometry, including particles, energy, smoke, sparks, and lighting accents. No smooth curves, vector-flat blobs, irregular splashes, gradients, photorealism, realistic smoke, or excessive bloom. All-ages appropriate, polished game-achievement presentation. Depict a pristine compact industrial robot protected inside a perfectly intact white voxel shield shell while hostile red-orange cubic voxel projectiles narrowly deflect around the outside. The robot and shield must show absolutely no damage, cracks, or impacts.

### 20. `ach_overkill` — P1

- **Display name:** `Overkill`
- **Steam description:** `Destroy 800 machines in a single run.`
- **Exact condition:** finite integer `LIFETIME.bestKillsInRun >= CONTRACTS.overkillKillsInRun` (currently 800), folded only from a terminal recorded run. Quit or incomplete runs and malformed, negative, fractional, or non-finite counts never contribute.
- **Hidden:** No — this is a deliberate density-mastery objective.
- **Estimated difficulty:** Hard.
- **Signal:** Existing monotonic `LIFETIME.bestKillsInRun`, now normalized and backfilled strictly from bounded terminal history when absent or malformed.
- **Implementation:** Implemented locally with Steam API name `ACH_OVERKILL`. The achievement and existing Overkill Contract share the single authoritative `CONTRACTS.overkillKillsInRun` threshold. `Progression.addKill()` runs once from the common `onEnemyDeath()` callback before boss classification, so every destroyed enemy machine counts exactly once: ordinary enemies, elites, summoned reinforcements, and bosses all contribute. Run finalization persists the integer count; quitting only emits abandonment telemetry and never creates or folds a run record. Existing valid monotonic values remain durable, while missing or invalid values are best-effort recovered from surviving terminal history and re-saved. Steamworks App Admin entry creation is maintainer-confirmed; publication, icon upload, and production-build achievement-unlock smoke remain external verification steps.
- **Achieved icon:** `art/concept/achievements/achievement-overkill-v1.png` (generation master) and `art/concept/achievements/achievement-overkill-v1-128.png` (small-size review export).
- **Unachieved icon:** `art/concept/achievements/achievement-overkill-locked-v1.png` (generation master) and `art/concept/achievements/achievement-overkill-locked-v1-128.png` (small-size review export).
- **Full image prompt:**

> Create a square Steam achievement icon for Voltswarm, designed to remain immediately readable at very small sizes. Stylized 3D voxel art with an industrial-toy appearance, chunky visible cubic voxel blocks, compact geometry, flat per-face shading, crisp hard stepped edges, and one dominant unmistakable silhouette. Use the current Voltswarm palette: dark graphite and gunmetal foundations, painted construction amber where appropriate, WHITE energy and power light, and only restrained existing gameplay accent colors when truthful to the subject. Use a simple high-contrast background with a subtle radial glow and no environmental clutter. Center the subject with generous negative space and avoid thin details. No text, no letters, no words, no logos, no digits, no written numbers, no UI labels, no watermark, no gore, no blood, and no realistic organic anatomy. Everything must be explicitly constructed as voxel geometry, including particles, energy, smoke, sparks, and lighting accents. No smooth curves, vector-flat blobs, irregular splashes, gradients, photorealism, realistic smoke, or excessive bloom. All-ages appropriate, polished game-achievement presentation. Depict one compact white-powered player machine at the center of a dense circular swarm of small hostile robot silhouettes, releasing an enormous multi-layer cubic voxel shockwave that breaks the surrounding machines into clean mechanical cubes. No gore and no organic debris.

## Coverage

| Area | Achievements |
| --- | ---: |
| Onboarding and first run | 4 |
| Scrapyard and Swarm Foundry | 2 |
| Bosses, Hazard Marshal, and ending | 3 |
| Playable characters | 3 |
| Contracts and persistent progression | 2 |
| Weapons and mastery | 2 |
| Cores, Mods, and build composition | 2 |
| Optional mastery challenges | 2 |
| **Total** | **20** |

## Runtime coverage

### Existing fields and events

- `LIFETIME.runsFinished`, `runsCompleted`, `bestLevel`, `bossesDefeated`, `bossTypesDefeated`, and `maxMapsReached`.
- `LIFETIME.completedCharacterIds`, `weaponMaxLevel`, `damageByWeapon`, `bestDistinctCoresHeld`, `bestDistinctPermanentModsHeld`, `bestPuristSectors`, `bestFlawlessRunS`, and `bestKillsInRun`.
- `LIFETIME.chestsByTier` and completed Contract IDs.
- `PROFILE.weaponSockets`, `coreSockets`, and `levelupDiscards`.
- `RunRecordV1.coreLevels` and `modCounts`.
- Live `map_transition`, boss defeat, and run completion boundaries.

### Implementation progress

1. **Implemented for achievements 1–20:** canonical typed registry metadata with stable local ID, predicate, display metadata, hidden flag, and Steam API name.
2. **Implemented for Core Array:** monotonic `LIFETIME.bestDistinctCoresHeld`, with bounded-history migration for older saves.
3. **Implemented for Custom Rig:** config-owned threshold plus monotonic `LIFETIME.bestDistinctPermanentModsHeld`, with bounded-history migration for older saves.
4. **Implemented for Purist:** migration-safe `LIFETIME.bestPuristSectors`, strict structural completion, playable-weapon validation, and permanent-Mod-only installed-build semantics.
5. **Implemented for Untouchable:** shared Contract threshold plus terminal, known-zero-damage telemetry normalization and bounded-history recovery.
6. **Implemented for Overkill:** shared Contract threshold plus terminal integer kill telemetry normalization and bounded-history recovery.
7. **Compatibility risk for boss achievements:** the runtime currently persists exact `ENEMY_TYPES[].name` strings, and Scrapyard Command and Hazard Contained intentionally use those existing identities. Before any boss display-name rename, introduce stable IDs and migrate old ledgers so already-earned progress remains retroactive.
8. **Implemented:** profile-independent monotonic `pending` and `unlocked` sets in `achievement-sync.json`.
9. **Implemented for current predicates:** startup evaluation waits for any Contract-settlement save, while end-of-run evaluation requires both the run-ledger save and subsequent Contract-settlement write to confirm durable success.
10. **Implemented:** Steam allowlist, typed IPC result, crash-safe offline outbox, startup reconciliation, and bounded retry.
11. **Implemented:** ordinary development has no achievement transport unless `STEAM_APP_ID` is supplied explicitly; packaged builds use App ID `4979220` and remain protected by the release-flag package gate.

## Steam icon treatment

Steamworks exposes separate **Achieved Icon** and **Unachieved Icon** properties. Hidden achievements do not appear on a player's Community page until unlocked. Valve's public documentation does not currently publish a required pixel dimension, so the exact upload constraint must be confirmed in the Steamworks App Admin before export:

- <https://partner.steamgames.com/doc/features/achievements>
- <https://partner.steamgames.com/doc/features/achievements/ach_guide>

Derive each unachieved icon from the approved achieved composition: preserve the exact silhouette, desaturate it, reduce luminosity, replace active white energy with dim steel-blue, and darken the background. Do not add a padlock or redesign the subject.

## Icon production record

All 20 achieved masters, all 20 unachieved derivatives, and their 128 px review exports are present under `art/concept/achievements/`. This repository evidence does not establish that those files have been uploaded to Steamworks.

1. Family validation: First Shift, Foundry Bound, Field Tested, and Hazard Contained.
2. Narrative group: maps, bosses, and Full Circuit.
3. Character group: the three launch characters at consistent scale and framing.
4. Contract, capacity, weapon-level, and mastery group.
5. Core Array, Custom Rig, and Purist group.
6. Untouchable and Overkill group.
7. Unachieved derivatives generated from the approved compositions.
8. Small-size exports generated; Steamworks upload and final RC presentation checks remain external.

## Risks

- Achievements must be monotonic and re-evaluated from `LIFETIME` on startup.
- Core Array and Custom Rig use durable monotonic fields with bounded-history recovery for older saves.
- Purist legacy evidence can be recovered only while its strict qualifying run remains in bounded history; the unsafe historical scalar is intentionally ignored.
- Missing Untouchable telemetry can be recovered only from surviving history with an explicit `damageTaken: 0`; older records without that field remain unknown by design.
- Missing or malformed Overkill telemetry can be recovered only while a valid terminal integer kill record survives bounded history.
- Missing legacy fields mean unknown, never zero.
- Full Circuit must use structural `isRunComplete()` evidence, never duration or final-boss death alone.
- Local profile reset must never revoke a Steam achievement.
- Steam's offline cache and the local pending queue must reconcile without competing sources of progress.
- Development shortcuts must not grant production achievements.

## Do not create

- Complete all Contracts while active reward queues still contain dry rungs.
- Master or maximize every weapon.
- Any requirement involving disabled Oil Sprayer.
- Collect every Core or every Mod.
- Exact RNG-dependent Mod combinations.
- Attack-specific Hazard Marshal challenges without reliable instrumentation.
- Character-signature activation challenges without durable counters.
- Speedruns before balance is closed.
- Extreme lifetime kill grinds.
- A full-run no-hit requirement.
- Multiplayer or leaderboard achievements.
- Any achievement tied to debug, capture, or recording tools.
