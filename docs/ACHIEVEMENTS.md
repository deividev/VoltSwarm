# Voltswarm — Steam achievements

> Status: launch catalog under implementation. The first five achievements are implemented locally; the remaining 15 entries are design proposals for human review.

## Implementation status

| Achievement | Runtime | Steamworks App Admin |
|---|---|---|
| `ach_first_shift` / `ACH_FIRST_SHIFT` | Implemented | **Required before release** — not configured or published by this repository change |
| `ach_cache_opened` / `ACH_CACHE_OPENED` | Implemented | **Required before release** — not configured or published by this repository change |
| `ach_systems_online` / `ACH_SYSTEMS_ONLINE` | Implemented | **Required before release** — not configured or published by this repository change |
| `ach_first_boss_down` / `ACH_FIRST_BOSS_DOWN` | Implemented | **Required before release** — not configured or published by this repository change |
| `ach_foundry_bound` / `ACH_FOUNDRY_BOUND` | Implemented | **Required before release** — not configured or published by this repository change |

The canonical Steam metadata lives in `ACHIEVEMENT_REGISTRY`. Achievements are evaluated after profile loading and Contract settlement at startup, and again only after a finished run has been recorded in `LIFETIME` and its profile save has succeeded. The Electron main process accepts only allowlisted API names, persists a crash-safe outbox in `userData/achievement-sync.json`, checks Steam's existing state before activation, queues offline requests, and records local completion so it is not activated again.

The external Steamworks entries still have to be created and published in App Admin with these exact values:

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
- **Implementation:** Implemented locally with Steam API name `ACH_FIRST_SHIFT`. Steamworks App Admin configuration and publication remain external steps.
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
- **Implementation:** Implemented locally with Steam API name `ACH_CACHE_OPENED`. Only positive tier counts contribute, and the threshold is config-derived. Steamworks App Admin configuration and publication remain external steps.
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
- **Implementation:** Implemented locally with Steam API name `ACH_SYSTEMS_ONLINE`. The level threshold is config-derived, and non-finite ledger values cannot qualify. Steamworks App Admin configuration and publication remain external steps.
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
- **Implementation:** Implemented locally with Steam API name `ACH_FIRST_BOSS_DOWN`. The boss threshold is config-derived, and only the finite persisted career count from finished runs can qualify. Steamworks App Admin configuration and publication remain external steps.
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
- **Implementation:** Implemented locally with Steam API name `ACH_FOUNDRY_BOUND`. Unlocking uses only the finite, monotonic `LIFETIME.maxMapsReached` value persisted from a finished run; the live transition event is not an award source. The threshold is config-derived. Steamworks App Admin configuration and publication remain external steps.
- **Achieved icon:** `art/concept/achievements/achievement-foundry-bound-v1.png` (generation master) and `art/concept/achievements/achievement-foundry-bound-v1-128.png` (small-size review export).
- **Unachieved icon:** `art/concept/achievements/achievement-foundry-bound-locked-v1.png` (generation master) and `art/concept/achievements/achievement-foundry-bound-locked-v1-128.png` (small-size review export).
- **Full image prompt:**

> Create a square Steam achievement icon for Voltswarm, designed to remain immediately readable at very small sizes. Stylized 3D voxel art with an industrial-toy appearance, chunky visible cubic voxel blocks, compact geometry, flat per-face shading, crisp hard stepped edges, and one dominant unmistakable silhouette. Use the current Voltswarm palette: dark graphite and gunmetal foundations, painted construction amber where appropriate, WHITE energy and power light, and only restrained existing gameplay accent colors when truthful to the subject. Use a simple high-contrast background with a subtle radial glow and no environmental clutter. Center the subject with generous negative space and avoid thin details. No text, no letters, no words, no logos, no digits, no written numbers, no UI labels, no watermark, no gore, no blood, and no realistic organic anatomy. Everything must be explicitly constructed as voxel geometry, including particles, energy, smoke, sparks, and lighting accents. No smooth curves, vector-flat blobs, irregular splashes, gradients, photorealism, realistic smoke, or excessive bloom. All-ages appropriate, polished game-achievement presentation. Depict a single monumental voxel gateway transforming from cold scrapyard steel on one side into a glowing amber foundry threshold on the other, with a white energy path crossing through its center. The gateway must form one bold, readable silhouette.

### 6. `ach_scrapyard_command` — P0

- **Display name:** `Scrapyard Command`
- **Steam description:** `Defeat both Crusher King and Tesla Titan across your career.`
- **Exact condition:** `LIFETIME.bossTypesDefeated` contains both persisted identities `Crusher King` and `Tesla Titan`.
- **Hidden:** No — this promotes boss variety across runs.
- **Estimated difficulty:** Medium.
- **Signal:** Existing `LIFETIME.bossTypesDefeated`.
- **Full image prompt:**

> Create a square Steam achievement icon for Voltswarm, designed to remain immediately readable at very small sizes. Stylized 3D voxel art with an industrial-toy appearance, chunky visible cubic voxel blocks, compact geometry, flat per-face shading, crisp hard stepped edges, and one dominant unmistakable silhouette. Use the current Voltswarm palette: dark graphite and gunmetal foundations, painted construction amber where appropriate, WHITE energy and power light, and only restrained existing gameplay accent colors when truthful to the subject. Use a simple high-contrast background with a subtle radial glow and no environmental clutter. Center the subject with generous negative space and avoid thin details. No text, no letters, no words, no logos, no digits, no written numbers, no UI labels, no watermark, no gore, no blood, and no realistic organic anatomy. Everything must be explicitly constructed as voxel geometry, including particles, energy, smoke, sparks, and lighting accents. No smooth curves, vector-flat blobs, irregular splashes, gradients, photorealism, realistic smoke, or excessive bloom. All-ages appropriate, polished game-achievement presentation. Depict a unified trophy made from the heavy crushing jaw plate of Crusher King crossed with the angular electric coil crown of Tesla Titan. Make both boss motifs clearly distinct while joining them into one compact scrapyard command emblem. Tesla energy is white rather than generic cyan.

### 7. `ach_hazard_contained` — P0

- **Display name:** `Hazard Contained`
- **Steam description:** `Defeat the Hazard Marshal.`
- **Exact condition:** `LIFETIME.bossTypesDefeated` contains `Hazard Marshal`.
- **Hidden:** Yes — it conceals the final boss identity until reached.
- **Estimated difficulty:** Hard.
- **Signal:** Existing `LIFETIME.bossTypesDefeated`.
- **Full image prompt:**

> Create a square Steam achievement icon for Voltswarm, designed to remain immediately readable at very small sizes. Stylized 3D voxel art with an industrial-toy appearance, chunky visible cubic voxel blocks, compact geometry, flat per-face shading, crisp hard stepped edges, and one dominant unmistakable silhouette. Use the current Voltswarm palette: dark graphite and gunmetal foundations, painted construction amber where appropriate, WHITE energy and power light, and only restrained existing gameplay accent colors when truthful to the subject. Use a simple high-contrast background with a subtle radial glow and no environmental clutter. Center the subject with generous negative space and avoid thin details. No text, no letters, no words, no logos, no digits, no written numbers, no UI labels, no watermark, no gore, no blood, and no realistic organic anatomy. Everything must be explicitly constructed as voxel geometry, including particles, energy, smoke, sparks, and lighting accents. No smooth curves, vector-flat blobs, irregular splashes, gradients, photorealism, realistic smoke, or excessive bloom. All-ages appropriate, polished game-achievement presentation. Depict the unmistakable armored faceplate and hazard-light crown of the Hazard Marshal locked inside a heavy white-energy containment clamp, with its red overload glow extinguishing into dark cubic voxel smoke. Keep the final-boss faceplate dominant and menacing but toy-like.

### 8. `ach_full_circuit` — P0

- **Display name:** `Full Circuit`
- **Steam description:** `Complete the full run by clearing both sectors in order.`
- **Exact condition:** `LIFETIME.runsCompleted >= 1`, derived only from `isRunComplete()`.
- **Hidden:** Yes — it conceals the final structural outcome.
- **Estimated difficulty:** Hard.
- **Signal:** Existing `LIFETIME.runsCompleted` and `run-complete` outcome.
- **Full image prompt:**

> Create a square Steam achievement icon for Voltswarm, designed to remain immediately readable at very small sizes. Stylized 3D voxel art with an industrial-toy appearance, chunky visible cubic voxel blocks, compact geometry, flat per-face shading, crisp hard stepped edges, and one dominant unmistakable silhouette. Use the current Voltswarm palette: dark graphite and gunmetal foundations, painted construction amber where appropriate, WHITE energy and power light, and only restrained existing gameplay accent colors when truthful to the subject. Use a simple high-contrast background with a subtle radial glow and no environmental clutter. Center the subject with generous negative space and avoid thin details. No text, no letters, no words, no logos, no digits, no written numbers, no UI labels, no watermark, no gore, no blood, and no realistic organic anatomy. Everything must be explicitly constructed as voxel geometry, including particles, energy, smoke, sparks, and lighting accents. No smooth curves, vector-flat blobs, irregular splashes, gradients, photorealism, realistic smoke, or excessive bloom. All-ages appropriate, polished game-achievement presentation. Depict two large industrial sector plates, one scrapyard steel and one molten foundry metal, connected into a closed white electrical circuit around a bright central completion core. The complete loop must be the dominant readable silhouette.

### 9. `ach_field_engineer_clear` — P0

- **Display name:** `Field Tested`
- **Steam description:** `Complete the full run as Field Engineer.`
- **Exact condition:** `LIFETIME.completedCharacterIds` contains `field-engineer`.
- **Hidden:** No.
- **Estimated difficulty:** Hard.
- **Signal:** Existing `LIFETIME.completedCharacterIds`.
- **Full image prompt:**

> Create a square Steam achievement icon for Voltswarm, designed to remain immediately readable at very small sizes. Stylized 3D voxel art with an industrial-toy appearance, chunky visible cubic voxel blocks, compact geometry, flat per-face shading, crisp hard stepped edges, and one dominant unmistakable silhouette. Use the current Voltswarm palette: dark graphite and gunmetal foundations, painted construction amber where appropriate, WHITE energy and power light, and only restrained existing gameplay accent colors when truthful to the subject. Use a simple high-contrast background with a subtle radial glow and no environmental clutter. Center the subject with generous negative space and avoid thin details. No text, no letters, no words, no logos, no digits, no written numbers, no UI labels, no watermark, no gore, no blood, and no realistic organic anatomy. Everything must be explicitly constructed as voxel geometry, including particles, energy, smoke, sparks, and lighting accents. No smooth curves, vector-flat blobs, irregular splashes, gradients, photorealism, realistic smoke, or excessive bloom. All-ages appropriate, polished game-achievement presentation. Depict the approved Field Engineer as a compact frontal voxel bust holding an oversized industrial repair wrench across the body, with a repaired white power node glowing beside the shoulder. Preserve the character's real silhouette and equipment identity.

### 10. `ach_rack_hauler_clear` — P0

- **Display name:** `Fully Loaded`
- **Steam description:** `Complete the full run as Rack Hauler.`
- **Exact condition:** `LIFETIME.completedCharacterIds` contains `rack-hauler`.
- **Hidden:** No.
- **Estimated difficulty:** Hard.
- **Signal:** Existing `LIFETIME.completedCharacterIds`.
- **Full image prompt:**

> Create a square Steam achievement icon for Voltswarm, designed to remain immediately readable at very small sizes. Stylized 3D voxel art with an industrial-toy appearance, chunky visible cubic voxel blocks, compact geometry, flat per-face shading, crisp hard stepped edges, and one dominant unmistakable silhouette. Use the current Voltswarm palette: dark graphite and gunmetal foundations, painted construction amber where appropriate, WHITE energy and power light, and only restrained existing gameplay accent colors when truthful to the subject. Use a simple high-contrast background with a subtle radial glow and no environmental clutter. Center the subject with generous negative space and avoid thin details. No text, no letters, no words, no logos, no digits, no written numbers, no UI labels, no watermark, no gore, no blood, and no realistic organic anatomy. Everything must be explicitly constructed as voxel geometry, including particles, energy, smoke, sparks, and lighting accents. No smooth curves, vector-flat blobs, irregular splashes, gradients, photorealism, realistic smoke, or excessive bloom. All-ages appropriate, polished game-achievement presentation. Depict the approved Rack Hauler as a compact frontal voxel bust carrying its distinctive oversized weapon rack, visibly loaded with several chunky industrial weapon modules and held together by bright white power clamps. Preserve the real character silhouette and avoid inventing equipment.

### 11. `ach_overclocker_clear` — P0

- **Display name:** `Past Redline`
- **Steam description:** `Complete the full run as Overclocker.`
- **Exact condition:** `LIFETIME.completedCharacterIds` contains `overclocker`.
- **Hidden:** No.
- **Estimated difficulty:** Very hard.
- **Signal:** Existing `LIFETIME.completedCharacterIds`.
- **Full image prompt:**

> Create a square Steam achievement icon for Voltswarm, designed to remain immediately readable at very small sizes. Stylized 3D voxel art with an industrial-toy appearance, chunky visible cubic voxel blocks, compact geometry, flat per-face shading, crisp hard stepped edges, and one dominant unmistakable silhouette. Use the current Voltswarm palette: dark graphite and gunmetal foundations, painted construction amber where appropriate, WHITE energy and power light, and only restrained existing gameplay accent colors when truthful to the subject. Use a simple high-contrast background with a subtle radial glow and no environmental clutter. Center the subject with generous negative space and avoid thin details. No text, no letters, no words, no logos, no digits, no written numbers, no UI labels, no watermark, no gore, no blood, and no realistic organic anatomy. Everything must be explicitly constructed as voxel geometry, including particles, energy, smoke, sparks, and lighting accents. No smooth curves, vector-flat blobs, irregular splashes, gradients, photorealism, realistic smoke, or excessive bloom. All-ages appropriate, polished game-achievement presentation. Depict the approved Overclocker as a compact frontal voxel bust with its distinctive internal flywheel and cooling assembly glowing from white energy into intense amber-red overdrive, surrounded by controlled cubic voxel sparks. Preserve the real character silhouette and equipment.

### 12. `ach_first_contract` — P0

- **Display name:** `Signed and Stamped`
- **Steam description:** `Complete your first Contract and receive its reward.`
- **Exact condition:** `LIFETIME.completedContracts.length >= 1`; only a settled, paid Contract counts.
- **Hidden:** No — it introduces persistent progression.
- **Estimated difficulty:** Easy.
- **Signal:** Existing completed Contract IDs.
- **Full image prompt:**

> Create a square Steam achievement icon for Voltswarm, designed to remain immediately readable at very small sizes. Stylized 3D voxel art with an industrial-toy appearance, chunky visible cubic voxel blocks, compact geometry, flat per-face shading, crisp hard stepped edges, and one dominant unmistakable silhouette. Use the current Voltswarm palette: dark graphite and gunmetal foundations, painted construction amber where appropriate, WHITE energy and power light, and only restrained existing gameplay accent colors when truthful to the subject. Use a simple high-contrast background with a subtle radial glow and no environmental clutter. Center the subject with generous negative space and avoid thin details. No text, no letters, no words, no logos, no digits, no written numbers, no UI labels, no watermark, no gore, no blood, and no realistic organic anatomy. Everything must be explicitly constructed as voxel geometry, including particles, energy, smoke, sparks, and lighting accents. No smooth curves, vector-flat blobs, irregular splashes, gradients, photorealism, realistic smoke, or excessive bloom. All-ages appropriate, polished game-achievement presentation. Depict a thick blank industrial contract plate with no writing, firmly stamped by a mechanical white-lit check seal and ejecting one small unlocked reward module. The physical stamped plate must be the dominant silhouette.

### 13. `ach_full_capacity` — P0

- **Display name:** `No Empty Sockets`
- **Steam description:** `Unlock maximum Weapon and Core capacity, plus the extra level-up discard.`
- **Exact condition:** `PROFILE.weaponSockets === 3`, `PROFILE.coreSockets === 4`, and `PROFILE.levelupDiscards === 4`.
- **Hidden:** No — this is the major persistent-progression milestone.
- **Estimated difficulty:** Hard.
- **Signal:** Existing `PROFILE` fields.
- **Full image prompt:**

> Create a square Steam achievement icon for Voltswarm, designed to remain immediately readable at very small sizes. Stylized 3D voxel art with an industrial-toy appearance, chunky visible cubic voxel blocks, compact geometry, flat per-face shading, crisp hard stepped edges, and one dominant unmistakable silhouette. Use the current Voltswarm palette: dark graphite and gunmetal foundations, painted construction amber where appropriate, WHITE energy and power light, and only restrained existing gameplay accent colors when truthful to the subject. Use a simple high-contrast background with a subtle radial glow and no environmental clutter. Center the subject with generous negative space and avoid thin details. No text, no letters, no words, no logos, no digits, no written numbers, no UI labels, no watermark, no gore, no blood, and no realistic organic anatomy. Everything must be explicitly constructed as voxel geometry, including particles, energy, smoke, sparks, and lighting accents. No smooth curves, vector-flat blobs, irregular splashes, gradients, photorealism, realistic smoke, or excessive bloom. All-ages appropriate, polished game-achievement presentation. Depict one fully populated industrial loadout chassis with every visible socket occupied: chunky weapon couplings across the top, glowing Core sockets below, and one separate discard token locked into the side. No empty holes and no numeric labels.

### 14. `ach_weapon_level_20` — P0

- **Display name:** `Factory Specification`
- **Steam description:** `Raise any weapon to level 20 in a single run.`
- **Exact condition:** Any `LIFETIME.weaponMaxLevel[id] >= 20`.
- **Hidden:** No — it exposes the real weapon ceiling.
- **Estimated difficulty:** Medium.
- **Signal:** Existing `LIFETIME.weaponMaxLevel`.
- **Full image prompt:**

> Create a square Steam achievement icon for Voltswarm, designed to remain immediately readable at very small sizes. Stylized 3D voxel art with an industrial-toy appearance, chunky visible cubic voxel blocks, compact geometry, flat per-face shading, crisp hard stepped edges, and one dominant unmistakable silhouette. Use the current Voltswarm palette: dark graphite and gunmetal foundations, painted construction amber where appropriate, WHITE energy and power light, and only restrained existing gameplay accent colors when truthful to the subject. Use a simple high-contrast background with a subtle radial glow and no environmental clutter. Center the subject with generous negative space and avoid thin details. No text, no letters, no words, no logos, no digits, no written numbers, no UI labels, no watermark, no gore, no blood, and no realistic organic anatomy. Everything must be explicitly constructed as voxel geometry, including particles, energy, smoke, sparks, and lighting accents. No smooth curves, vector-flat blobs, irregular splashes, gradients, photorealism, realistic smoke, or excessive bloom. All-ages appropriate, polished game-achievement presentation. Depict one fully upgraded chunky voxel weapon locked inside a complete segmented white calibration ring, with every segment illuminated and a clean factory-grade energy flare. Do not show digits or written level indicators.

### 15. `ach_weapon_mastery` — P0

- **Display name:** `Proven Hardware`
- **Steam description:** `Deal 50,000 lifetime damage with a single weapon.`
- **Exact condition:** Any `LIFETIME.damageByWeapon[id]` reaches `CONTRACTS.ladders.masteryDamage`, currently 50,000.
- **Hidden:** No — it is visible cumulative progress.
- **Estimated difficulty:** Medium.
- **Signal:** Existing `LIFETIME.damageByWeapon`; threshold remains config-derived.
- **Full image prompt:**

> Create a square Steam achievement icon for Voltswarm, designed to remain immediately readable at very small sizes. Stylized 3D voxel art with an industrial-toy appearance, chunky visible cubic voxel blocks, compact geometry, flat per-face shading, crisp hard stepped edges, and one dominant unmistakable silhouette. Use the current Voltswarm palette: dark graphite and gunmetal foundations, painted construction amber where appropriate, WHITE energy and power light, and only restrained existing gameplay accent colors when truthful to the subject. Use a simple high-contrast background with a subtle radial glow and no environmental clutter. Center the subject with generous negative space and avoid thin details. No text, no letters, no words, no logos, no digits, no written numbers, no UI labels, no watermark, no gore, no blood, and no realistic organic anatomy. Everything must be explicitly constructed as voxel geometry, including particles, energy, smoke, sparks, and lighting accents. No smooth curves, vector-flat blobs, irregular splashes, gradients, photorealism, realistic smoke, or excessive bloom. All-ages appropriate, polished game-achievement presentation. Depict one battle-worn industrial voxel weapon mounted like proven hardware, firing a dense white impact burst into a heavy test plate covered in mechanical dents. Communicate accumulated mastery through the battered plate and stable weapon glow, without numbers.

### 16. `ach_four_core_array` — P0

- **Display name:** `Core Array`
- **Steam description:** `Finish a recorded run carrying four distinct Cores.`
- **Exact condition:** A recorded run contains four distinct IDs in `coreLevels` with positive levels.
- **Hidden:** No — it promotes use of full Core capacity.
- **Estimated difficulty:** Medium.
- **Signal:** Available in `RunRecordV1`, but only while the record remains inside the 250-run history.
- **Minimal telemetry required:** Add monotonic `LIFETIME.bestDistinctCoresHeld` for durable retroactivity.
- **Full image prompt:**

> Create a square Steam achievement icon for Voltswarm, designed to remain immediately readable at very small sizes. Stylized 3D voxel art with an industrial-toy appearance, chunky visible cubic voxel blocks, compact geometry, flat per-face shading, crisp hard stepped edges, and one dominant unmistakable silhouette. Use the current Voltswarm palette: dark graphite and gunmetal foundations, painted construction amber where appropriate, WHITE energy and power light, and only restrained existing gameplay accent colors when truthful to the subject. Use a simple high-contrast background with a subtle radial glow and no environmental clutter. Center the subject with generous negative space and avoid thin details. No text, no letters, no words, no logos, no digits, no written numbers, no UI labels, no watermark, no gore, no blood, and no realistic organic anatomy. Everything must be explicitly constructed as voxel geometry, including particles, energy, smoke, sparks, and lighting accents. No smooth curves, vector-flat blobs, irregular splashes, gradients, photorealism, realistic smoke, or excessive bloom. All-ages appropriate, polished game-achievement presentation. Depict four visually distinct voxel Core orbs locked into a compact cross-shaped industrial array, each with a truthful different internal symbol shape and accent color, all feeding one stable white central conduit. Make the complete Core array the dominant silhouette.

### 17. `ach_five_mod_rig` — P0

- **Display name:** `Custom Rig`
- **Steam description:** `Finish a recorded run carrying five distinct Mods.`
- **Exact condition:** A recorded run contains five distinct IDs in `modCounts` with positive counts; duplicate copies do not increase the distinct count.
- **Hidden:** No — it promotes variety rather than an exact RNG combination.
- **Estimated difficulty:** Medium.
- **Signal:** Available in `RunRecordV1`, but only while the record remains inside the bounded history.
- **Minimal telemetry required:** Add monotonic `LIFETIME.bestDistinctModsHeld`.
- **Full image prompt:**

> Create a square Steam achievement icon for Voltswarm, designed to remain immediately readable at very small sizes. Stylized 3D voxel art with an industrial-toy appearance, chunky visible cubic voxel blocks, compact geometry, flat per-face shading, crisp hard stepped edges, and one dominant unmistakable silhouette. Use the current Voltswarm palette: dark graphite and gunmetal foundations, painted construction amber where appropriate, WHITE energy and power light, and only restrained existing gameplay accent colors when truthful to the subject. Use a simple high-contrast background with a subtle radial glow and no environmental clutter. Center the subject with generous negative space and avoid thin details. No text, no letters, no words, no logos, no digits, no written numbers, no UI labels, no watermark, no gore, no blood, and no realistic organic anatomy. Everything must be explicitly constructed as voxel geometry, including particles, energy, smoke, sparks, and lighting accents. No smooth curves, vector-flat blobs, irregular splashes, gradients, photorealism, realistic smoke, or excessive bloom. All-ages appropriate, polished game-achievement presentation. Depict a single custom industrial harness fitted with five clearly distinct chunky voxel Mod modules, each using a different truthful mechanical silhouette such as relay, coolant tank, trigger block, magnetic coil, and reinforced plate. Connect them with restrained white power traces and avoid written labels.

### 18. `ach_purist` — P1

- **Display name:** `Purist`
- **Steam description:** `Clear both sectors in one run with exactly one weapon and no Mods.`
- **Exact condition:** `LIFETIME.bestMinimalSectors >= 2`; exactly one positive-level weapon, zero Mods, and both sectors structurally credited.
- **Hidden:** No — players must know the condition to attempt it deliberately.
- **Estimated difficulty:** Very hard.
- **Signal:** Existing `LIFETIME.bestMinimalSectors`.
- **Full image prompt:**

> Create a square Steam achievement icon for Voltswarm, designed to remain immediately readable at very small sizes. Stylized 3D voxel art with an industrial-toy appearance, chunky visible cubic voxel blocks, compact geometry, flat per-face shading, crisp hard stepped edges, and one dominant unmistakable silhouette. Use the current Voltswarm palette: dark graphite and gunmetal foundations, painted construction amber where appropriate, WHITE energy and power light, and only restrained existing gameplay accent colors when truthful to the subject. Use a simple high-contrast background with a subtle radial glow and no environmental clutter. Center the subject with generous negative space and avoid thin details. No text, no letters, no words, no logos, no digits, no written numbers, no UI labels, no watermark, no gore, no blood, and no realistic organic anatomy. Everything must be explicitly constructed as voxel geometry, including particles, energy, smoke, sparks, and lighting accents. No smooth curves, vector-flat blobs, irregular splashes, gradients, photorealism, realistic smoke, or excessive bloom. All-ages appropriate, polished game-achievement presentation. Depict one solitary industrial voxel weapon standing upright between two cleared sector plates, surrounded by visibly empty Mod sockets and a clean narrow white energy path. Emphasize deliberate minimalism: one weapon, no additional modules, no clutter.

### 19. `ach_untouchable` — P1

- **Display name:** `Untouchable`
- **Steam description:** `Survive for five minutes in a single run without taking damage.`
- **Exact condition:** `LIFETIME.bestFlawlessRunS >= 300`, only when `damageTaken === 0`; legacy records without the field are unknown and do not count.
- **Hidden:** No — the condition must be visible.
- **Estimated difficulty:** Very hard.
- **Signal:** Existing `LIFETIME.bestFlawlessRunS`.
- **Full image prompt:**

> Create a square Steam achievement icon for Voltswarm, designed to remain immediately readable at very small sizes. Stylized 3D voxel art with an industrial-toy appearance, chunky visible cubic voxel blocks, compact geometry, flat per-face shading, crisp hard stepped edges, and one dominant unmistakable silhouette. Use the current Voltswarm palette: dark graphite and gunmetal foundations, painted construction amber where appropriate, WHITE energy and power light, and only restrained existing gameplay accent colors when truthful to the subject. Use a simple high-contrast background with a subtle radial glow and no environmental clutter. Center the subject with generous negative space and avoid thin details. No text, no letters, no words, no logos, no digits, no written numbers, no UI labels, no watermark, no gore, no blood, and no realistic organic anatomy. Everything must be explicitly constructed as voxel geometry, including particles, energy, smoke, sparks, and lighting accents. No smooth curves, vector-flat blobs, irregular splashes, gradients, photorealism, realistic smoke, or excessive bloom. All-ages appropriate, polished game-achievement presentation. Depict a pristine compact industrial robot protected inside a perfectly intact white voxel shield shell while hostile red-orange cubic voxel projectiles narrowly deflect around the outside. The robot and shield must show absolutely no damage, cracks, or impacts.

### 20. `ach_overkill` — P1

- **Display name:** `Overkill`
- **Steam description:** `Destroy 800 machines in a single run.`
- **Exact condition:** `LIFETIME.bestKillsInRun` reaches `CONTRACTS.overkillKillsInRun`, currently 800.
- **Hidden:** No — this is a deliberate density-mastery objective.
- **Estimated difficulty:** Hard.
- **Signal:** Existing `LIFETIME.bestKillsInRun`; threshold remains config-derived.
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

## Runtime coverage and remaining work

### Existing fields and events

- `LIFETIME.runsFinished`, `runsCompleted`, `bestLevel`, `bossesDefeated`, `bossTypesDefeated`, and `maxMapsReached`.
- `LIFETIME.completedCharacterIds`, `weaponMaxLevel`, `damageByWeapon`, `bestMinimalSectors`, `bestFlawlessRunS`, and `bestKillsInRun`.
- `LIFETIME.chestsByTier` and completed Contract IDs.
- `PROFILE.weaponSockets`, `coreSockets`, and `levelupDiscards`.
- `RunRecordV1.coreLevels` and `modCounts`.
- Live `map_transition`, boss defeat, and run completion boundaries.

### Implementation progress

1. **Implemented for achievements 1–5:** canonical typed registry metadata with stable local ID, predicate, display metadata, hidden flag, and Steam API name.
2. **Remaining for Core Array:** `LIFETIME.bestDistinctCoresHeld`.
3. **Remaining for Custom Rig:** `LIFETIME.bestDistinctModsHeld`.
4. **Remaining before boss achievements:** stable boss IDs plus migration from persisted display names.
5. **Implemented:** profile-independent monotonic `pending` and `unlocked` sets in `achievement-sync.json`.
6. **Implemented for current predicates:** evaluation after profile load and Contract settlement, and after run recording only when the profile save confirms durable success.
7. **Implemented:** Steam allowlist, typed IPC result, crash-safe offline outbox, startup reconciliation, and bounded retry.
8. **Implemented:** ordinary development has no achievement transport unless `STEAM_APP_ID` is supplied explicitly; packaged builds use App ID `4979220` and remain protected by the release-flag package gate.

## Steam icon treatment

Steamworks exposes separate **Achieved Icon** and **Unachieved Icon** properties. Hidden achievements do not appear on a player's Community page until unlocked. Valve's public documentation does not currently publish a required pixel dimension, so the exact upload constraint must be confirmed in the Steamworks App Admin before export:

- <https://partner.steamgames.com/doc/features/achievements>
- <https://partner.steamgames.com/doc/features/achievements/ach_guide>

Derive each unachieved icon from the approved achieved composition: preserve the exact silhouette, desaturate it, reduce luminosity, replace active white energy with dim steel-blue, and darken the background. Do not add a padlock or redesign the subject.

## Icon production order

1. Validate the family with First Shift, Foundry Bound, Field Tested, and Hazard Contained.
2. Produce the narrative group: maps, bosses, and Full Circuit.
3. Produce all three character icons together for consistent scale and framing.
4. Produce Contract, capacity, weapon-level, and mastery icons.
5. Produce Core Array, Custom Rig, and Purist.
6. Produce Untouchable and Overkill.
7. Generate unachieved derivatives only after all achieved icons are approved.
8. Validate the full set at 128 px and 32 px before final export.

## Risks

- Achievements must be monotonic and re-evaluated from `LIFETIME` on startup.
- Core Array and Custom Rig are not durably retroactive until their monotonic fields exist.
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
