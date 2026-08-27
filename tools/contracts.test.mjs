import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const storage = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  },
};

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
const contracts = await server.ssrLoadModule('/src/contracts.ts');
const config = await server.ssrLoadModule('/src/config.ts');
const profile = await server.ssrLoadModule('/src/profile.ts');
const hud = await server.ssrLoadModule('/src/hud.ts');

const lifetimeBaseline = structuredClone(profile.LIFETIME);
const profileBaseline = structuredClone(config.PROFILE);

function restoreObject(target, saved) {
  for (const key of Object.keys(target)) if (!(key in saved)) delete target[key];
  for (const [key, value] of Object.entries(saved)) {
    if (Array.isArray(target[key]) && Array.isArray(value)) {
      target[key].splice(0, target[key].length, ...structuredClone(value));
    } else {
      target[key] = structuredClone(value);
    }
  }
}

function resetState() {
  restoreObject(profile.LIFETIME, lifetimeBaseline);
  restoreObject(config.PROFILE, profileBaseline);
  storage.clear();
}

function record(id, outcome, {
  weapons = 1,
  mods = 0,
  sectorsCleared = 0,
  durationS = 600,
  characterId = 'field-engineer',
  weaponLevels,
  modCounts,
  damageTaken,
  kills = 0,
} = {}) {
  return {
    id,
    outcome,
    map: { id: 'scrapyard', number: 1, title: 'Scrapyard' },
    characterId,
    sectorsCleared,
    mapsReached: sectorsCleared + 1,
    durationS,
    kills,
    bossesDefeated: sectorsCleared,
    level: 1,
    weaponLevels: weaponLevels ?? (weapons === 0 ? {} : weapons === 1 ? { bolt: 1 } : { bolt: 1, pulse: 1 }),
    weaponDamage: {},
    coreLevels: {},
    modCounts: modCounts ?? (mods === 0 ? {} : { 'coolant-burst': mods }),
    ...(damageTaken !== undefined ? { damageTaken } : {}),
  };
}

afterEach(resetState);
after(async () => server.close());

test('contract catalog exposes Map 2 branch rules and configured mastery copy', () => {
  assert.equal(contracts.ALL_CONTRACTS.length, 29);
  assert.equal(contracts.ACTIVE_CONTRACTS.length, 29);
  const provingGround = contracts.ALL_CONTRACTS.find(({ id }) => id === 'proving-ground');
  assert.deepEqual(provingGround.objective, {
    type: 'distinct-starting-weapons',
    n: config.CONTRACTS.provingGroundWeapons,
  });
  assert.deepEqual(provingGround.reward, { kind: 'character', id: 'rack-hauler' });
  assert.equal(provingGround.latent, undefined);
  const bossHunter = contracts.ALL_CONTRACTS.find(({ id }) => id === 'boss-hunter');
  const expectedBossIds = ['Crusher King', 'Tesla Titan'];
  assert.deepEqual(bossHunter.objective, { type: 'defeat-boss-types', requiredTypes: expectedBossIds });
  assert.deepEqual(bossHunter.reward, { kind: 'socket', slot: 'weapon', index: 3 });
  assert.equal(config.PROFILE.weaponSockets, 2);
  assert.equal(config.PROFILE.maxWeaponSockets, 3);
  assert.deepEqual(contracts.ALL_CONTRACTS.find(({ id }) => id === 'full-loadout').objective,
    { type: 'reach-level', n: config.CONTRACTS.fullLoadoutLevel });
  assert.deepEqual(contracts.ALL_CONTRACTS.find(({ id }) => id === 'overkill').objective,
    { type: 'kills-in-run', n: config.CONTRACTS.overkillKillsInRun });
  assert.deepEqual(contracts.ALL_CONTRACTS.find(({ id }) => id === 'untouchable').objective,
    { type: 'flawless-run', seconds: config.CONTRACTS.flawlessSeconds });
  assert.deepEqual(contracts.ALL_CONTRACTS.find(({ id }) => id ===
    config.PROFILE_CAPACITY_CONTRACT_REWARDS.extraLevelupDiscard.contractId).reward, {
    kind: 'discards',
    n: config.PROFILE_CAPACITY_CONTRACT_REWARDS.extraLevelupDiscard.amount,
  });

  const expectedDamage = config.CONTRACTS.ladders.masteryDamage.toLocaleString('en-US');
  for (const contract of contracts.ALL_CONTRACTS.filter(({ id }) => id.startsWith('arsenal-'))) {
    assert.match(contract.description, new RegExp(`${expectedDamage} lifetime damage`));
  }

  const preview = contracts.previewContractRewards(profile.LIFETIME, {
    unlockedWeapons: [], unlockedCores: [], unlockedMods: [],
  });
  assert.deepEqual(preview['arsenal-1'], { kind: 'weapon', id: contracts.WEAPON_QUEUE[0] });
  assert.equal(preview['arsenal-5'], null);
  assert.deepEqual(preview['scrap-quota-1'], { kind: 'core', id: contracts.CORE_QUEUE[0] });
  assert.deepEqual(preview['endurance-1'], { kind: 'mod', id: contracts.MOD_QUEUE[0] });
  assert.equal(preview['endurance-3'], null);
});

test('multi-weapon progress exposes only valid weapon ids that actually count', () => {
  const mastery = config.CONTRACTS.ladders.masteryDamage;
  const stats = structuredClone(lifetimeBaseline);
  stats.damageByWeapon = { bolt: mastery, pulse: mastery - 1, ghost: mastery * 2, acid: mastery * 2 };
  stats.runsByStartingWeapon = { tire: 1, pulse: 0, ghost: 3 };

  const mastered = { type: 'weapons-mastered', n: 5 };
  assert.deepEqual(contracts.creditedWeaponIds(mastered, stats), ['bolt', 'acid']);
  assert.deepEqual(contracts.progressOf(mastered, stats), { current: 2, target: 5 });

  const started = { type: 'distinct-starting-weapons', n: 3 };
  assert.deepEqual(contracts.creditedWeaponIds(started, stats), ['tire']);
  assert.deepEqual(contracts.progressOf(started, stats), { current: 1, target: 3 });

  profile.LIFETIME.damageByWeapon = stats.damageByWeapon;
  const arsenal = contracts.ALL_CONTRACTS.find(({ id }) => id === 'arsenal-5');
  const evidence = hud.contractWeaponEvidenceHtml(arsenal);
  assert.match(evidence, /COUNTED WEAPONS/);
  assert.match(evidence, />2 \/ 5</);
  assert.match(evidence, /icon-weapon-bolt\.png/);
  assert.match(evidence, /icon-weapon-acid-drum\.png/);
  assert.doesNotMatch(evidence, /icon-weapon-pulse\.png|ghost/);
});

test('socket rewards expose distinct canonical targets and settle once in signature order', () => {
  const secondWind = contracts.ALL_CONTRACTS.find(({ id }) => id === 'second-wind');
  const fullLoadout = contracts.ALL_CONTRACTS.find(({ id }) => id === 'full-loadout');
  const bossHunter = contracts.ALL_CONTRACTS.find(({ id }) => id === 'boss-hunter');
  assert.deepEqual(secondWind.reward, { kind: 'socket', slot: 'core', index: 3 });
  assert.deepEqual(fullLoadout.reward, { kind: 'socket', slot: 'core', index: 4 });
  assert.deepEqual(bossHunter.reward, { kind: 'socket', slot: 'weapon', index: 3 });
  assert.deepEqual(contracts.previewContractRewards()['second-wind'], secondWind.reward);
  assert.deepEqual(contracts.previewContractRewards()['full-loadout'], fullLoadout.reward);

  profile.LIFETIME.runsCompleted = 1;
  profile.LIFETIME.bestLevel = config.CONTRACTS.fullLoadoutLevel;
  const settled = Object.fromEntries(contracts.settleContracts().map(({ contract, granted }) => [contract.id, granted]));
  assert.deepEqual(settled['second-wind'], { kind: 'socket', slot: 'core', index: 3 });
  assert.deepEqual(settled['full-loadout'], { kind: 'socket', slot: 'core', index: 4 });
  assert.equal(config.PROFILE.coreSockets, 4);
  assert.equal(contracts.settleContracts().filter(({ granted }) => granted?.kind === 'socket').length, 0);
});

test('socket settlement refuses gaps and capped malformed rewards without marking them paid', () => {
  assert.equal(contracts.grantReward({ kind: 'socket', slot: 'core', index: 4 }), null);
  assert.equal(config.PROFILE.coreSockets, 2);
  config.PROFILE.coreSockets = config.PROFILE.maxCoreSockets;
  assert.equal(contracts.grantReward({ kind: 'socket', slot: 'core', index: 4 }), null);
  profile.LIFETIME.bestLevel = config.CONTRACTS.fullLoadoutLevel;
  contracts.settleContracts();
  assert.equal(profile.LIFETIME.completedContracts.includes('full-loadout'), false);
});

test('legacy socket records receive canonical indices and completed ids restore their socket floors', () => {
  storage.set('voltswarm:profile', JSON.stringify({
    version: 3,
    weaponSockets: 2,
    coreSockets: 2,
    lifetime: {
      completedContracts: ['second-wind', 'full-loadout', 'boss-hunter'],
      grantedRewards: {
        'second-wind': { kind: 'socket', slot: 'core' },
        'full-loadout': { kind: 'socket', slot: 'core' },
        'boss-hunter': { kind: 'socket', slot: 'weapon' },
      },
    },
  }));
  profile.loadProfile();
  assert.equal(config.PROFILE.coreSockets, 4);
  assert.equal(config.PROFILE.weaponSockets, 3);
  assert.deepEqual(profile.LIFETIME.grantedRewards['second-wind'], { kind: 'socket', slot: 'core', index: 3 });
  assert.deepEqual(profile.LIFETIME.grantedRewards['full-loadout'], { kind: 'socket', slot: 'core', index: 4 });
  assert.deepEqual(profile.LIFETIME.grantedRewards['boss-hunter'], { kind: 'socket', slot: 'weapon', index: 3 });
  profile.LIFETIME.grantedRewards['second-wind'] = { kind: 'socket', slot: 'core' };
  contracts.backfillGrantedRewards();
  assert.deepEqual(profile.LIFETIME.grantedRewards['second-wind'], { kind: 'socket', slot: 'core', index: 3 });
});

test('every active requirement is generated exhaustively from its objective', () => {
  const forbiddenVagueness = /\b(?:full run|every boss|first boss|master(?:ed)?)\b/i;
  for (const contract of contracts.ACTIVE_CONTRACTS) {
    const text = contracts.describeObjective(contract.objective);
    assert.equal(contract.description, text, contract.id);
    assert.doesNotMatch(text, forbiddenVagueness, contract.id);
    const objective = contract.objective;
    if ('n' in objective) assert.ok(text.includes(objective.n.toLocaleString('en-US')), contract.id);
    if ('seconds' in objective) {
      const minutes = Math.floor(objective.seconds / 60);
      const seconds = objective.seconds % 60;
      if (minutes) assert.ok(text.includes(`${minutes} minute`), contract.id);
      if (seconds) assert.ok(text.includes(`${seconds} second`), contract.id);
    }
    if ('requiredTypes' in objective) {
      assert.match(text, new RegExp(`\\b${objective.requiredTypes.length}\\b`), contract.id);
      for (const name of objective.requiredTypes) assert.ok(text.includes(name), `${contract.id}: ${name}`);
    }
    if (objective.type === 'weapons-mastered') {
      assert.ok(text.includes(config.CONTRACTS.ladders.masteryDamage.toLocaleString('en-US')), contract.id);
      assert.match(text, /lifetime damage with/i, contract.id);
      if (objective.n > 1) assert.match(text, /with each of/i, contract.id);
    }
  }
});

test('Map 2 requirements pin both current maps and exact boss identities', () => {
  const bossHunter = contracts.ALL_CONTRACTS.find(({ id }) => id === 'boss-hunter');
  assert.deepEqual(bossHunter.objective.requiredTypes, ['Crusher King', 'Tesla Titan']);
  assert.equal(bossHunter.description,
    'Defeat all 2 distinct boss types: Crusher King, Tesla Titan across your career.');
  assert.equal(contracts.ALL_CONTRACTS.find(({ id }) => id === 'foreman').description,
    'Defeat all 3 distinct boss types: Crusher King, Tesla Titan, Hazard Marshal across your career.');
  assert.equal(contracts.ALL_CONTRACTS.find(({ id }) => id === 'second-wind').description,
    'Complete 1 run by clearing all 2 current sectors in order: Map 1: Scrapyard and Map 2: Swarm Foundry; a partial clear or defeat does not count.');
  assert.equal(contracts.ALL_CONTRACTS.find(({ id }) => id === 'purist').description,
    'Clear all 2 current sectors in a single run—Map 1: Scrapyard and Map 2: Swarm Foundry—while carrying exactly 1 positive-level playable weapon and 0 installed permanent Mods; instant consumables do not occupy Mod sockets, and a partial clear or defeat does not count.');
});

test('Proving Ground grants Rack Hauler once and preserves the live character-id array', () => {
  const unlockedReference = config.PROFILE.unlockedCharacters;
  profile.LIFETIME.runsByStartingWeapon = { bolt: 1, pulse: 1, blades: 1, press: 1 };
  const earned = contracts.settleContracts().find(({ contract }) => contract.id === 'proving-ground');
  assert.deepEqual(earned?.granted, { kind: 'character', id: 'rack-hauler' });
  assert.strictEqual(config.PROFILE.unlockedCharacters, unlockedReference);
  assert.deepEqual(config.PROFILE.unlockedCharacters, ['field-engineer', 'rack-hauler']);
  assert.equal(contracts.settleContracts().some(({ contract }) => contract.id === 'proving-ground'), false);
});

test('Two of a Kind actively grants Overclocker once and preserves the live character-id array', () => {
  const contract = contracts.ALL_CONTRACTS.find((candidate) => candidate.id === 'two-of-a-kind');
  assert.equal(contract.description, contracts.describeObjective(contract.objective));
  assert.deepEqual(contract.objective, {
    type: 'distinct-completed-characters',
    n: config.CONTRACTS.twoOfAKindCharacters,
  });
  assert.deepEqual(contract.reward, { kind: 'character', id: 'overclocker' });
  assert.equal(contract.latent, undefined);
  assert.equal(contracts.ACTIVE_CONTRACTS.includes(contract), true);
  const unlockedReference = config.PROFILE.unlockedCharacters;
  profile.LIFETIME.completedCharacterIds.push('field-engineer', 'rack-hauler');
  assert.deepEqual(contracts.progressOf(contract.objective), { current: 2, target: 2 });
  const earned = contracts.settleContracts().find(({ contract: item }) => item.id === contract.id);
  assert.deepEqual(earned?.granted, { kind: 'character', id: 'overclocker' });
  assert.strictEqual(config.PROFILE.unlockedCharacters, unlockedReference);
  assert.deepEqual(config.PROFILE.unlockedCharacters, ['field-engineer', 'overclocker']);
  assert.equal(contracts.settleContracts().some(({ contract: item }) => item.id === contract.id), false);
});

test('Contract progress cells use exact small targets and fractional normalized large targets', () => {
  const cases = [
    [0, 1], [1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [8, 8], [10, 10], [12, 12],
    [15, 12], [25, 12], [300, 12], [800, 12], [12000, 12],
  ];
  for (const [target, expectedCells] of cases) {
    const progress = hud.contractProgressCells(0, target);
    assert.equal(progress.cellCount, expectedCells, `target ${target} uses its truthful cell count`);
    assert.equal(progress.fills.length, expectedCells);
    assert.ok(progress.fills.every((fill) => fill === 0));
  }

  assert.deepEqual(hud.contractProgressCells(1, 15).fills, [0.8, ...Array(11).fill(0)]);
  assert.deepEqual(hud.contractProgressCells(1, 25).fills, [0.48, ...Array(11).fill(0)]);
  assert.deepEqual(hud.contractProgressCells(200, 800).fills, [1, 1, 1, ...Array(9).fill(0)]);
  assert.deepEqual(hud.contractProgressCells(60, 300).fills, [1, 1, 0.4, ...Array(9).fill(0)]);
  assert.deepEqual(hud.contractProgressCells(1, 1).fills, [1]);
  assert.deepEqual(hud.contractProgressCells(9, 3).fills, [1, 1, 1]);
  assert.deepEqual(hud.contractProgressCells(-1, 3).fills, [0, 0, 0]);
  assert.deepEqual(hud.contractProgressCells(Number.NaN, -1), {
    cellCount: 1, target: 0, current: 0, fills: [0],
  });
  assert.deepEqual(hud.contractProgressCells(Infinity, Number.NaN), {
    cellCount: 1, target: 0, current: 0, fills: [0],
  });
});

test('Contracts HUD exposes an accessible master-detail browser without changing settlement semantics', () => {
  const hudSource = readFileSync(new URL('../src/hud.ts', import.meta.url), 'utf8');
  const cssSource = readFileSync(new URL('../src/ui.css', import.meta.url), 'utf8');
  assert.match(hudSource, /id="contracts-category-filters" class="contracts-category-tabs" role="tablist" aria-label="Contract category"/);
  assert.match(hudSource, /id="contracts-status-filters" class="contracts-status-control" role="group" aria-label="Contract status"/);
  assert.match(hudSource, /id="contracts-list" role="tabpanel" aria-label="Contracts"/);
  assert.match(hudSource, /id="contract-detail" aria-live="polite"/);
  assert.match(hudSource, /private contractStatus: ContractViewStatus = 'active'/);
  assert.match(hudSource, /mustGet\('contracts-button'\)\.addEventListener\('click', \(\) => \{[\s\S]*?this\.contractCategory = 'all';\s*this\.contractStatus = 'active';\s*this\.selectedContractId = null;\s*this\.renderContracts\(\);/);
  const categoryCountBlock = hudSource.match(/for \(const category of CONTRACT_CATEGORIES\) \{([\s\S]*?)const button = document\.createElement\('button'\);/)?.[1];
  assert.ok(categoryCountBlock);
  assert.match(categoryCountBlock, /category\.key === 'all' \|\| rewardCategory\(row\.contract\.reward\) === category\.key/);
  assert.doesNotMatch(categoryCountBlock, /contractStatus|row\.done/);
  const categoryRenderBlock = hudSource.match(/for \(const category of CONTRACT_CATEGORIES\) \{[\s\S]*?categoryHost\.appendChild\(button\);\s*\}/)?.[0];
  assert.ok(categoryRenderBlock);
  assert.match(categoryRenderBlock, /button\.className = 'contracts-filter contracts-category-tab'/);
  assert.match(categoryRenderBlock, /button\.setAttribute\('role', 'tab'\)/);
  assert.match(categoryRenderBlock, /button\.setAttribute\('aria-selected'/);
  assert.doesNotMatch(categoryRenderBlock, /aria-pressed/);
  assert.match(categoryRenderBlock, /contracts-filter-label/);
  assert.match(categoryRenderBlock, /contracts-filter-count/);
  const statusRenderBlock = hudSource.match(/for \(const status of \['active', 'completed'\] as const\) \{[\s\S]*?statusHost\.appendChild\(button\);\s*\}/)?.[0];
  assert.ok(statusRenderBlock);
  assert.match(statusRenderBlock, /button\.className = 'contracts-filter contracts-status-filter contracts-status-segment'/);
  assert.match(statusRenderBlock, /button\.setAttribute\('aria-pressed'/);
  assert.match(statusRenderBlock, /button\.disabled = status === 'completed' && count === 0/);
  assert.match(statusRenderBlock, /contracts-filter-label/);
  assert.match(statusRenderBlock, /contracts-filter-count/);
  assert.match(hudSource, /category\.key === 'character' && count === 0/);
  assert.match(hudSource, /case 'character':[\s\S]*CHARACTER_REGISTRY\[reward\.id\][\s\S]*character\?\.portrait/);
  assert.match(hudSource, /queueMicrotask\([\s\S]*data-contract-status="active"/);
  assert.match(hudSource, /mustGet\('contracts-button'\)\.focus\(\)/);
  assert.match(hudSource, /querySelectorAll<HTMLButtonElement>\(selector\)\)\.filter\(\(button\) => !button\.disabled\)/);
  assert.match(hudSource, /LIFETIME\.completedContracts\.includes\(contract\.id\)/);
  assert.match(hudSource, /row\.done \|\| row\.resolved !== null/);
  assert.match(hudSource, /displayRows\.find\(\(row\) => row\.contract\.id === this\.selectedContractId\)/);
  assert.match(hudSource, /filteredRows\.reduce<ContractViewRow \| null>/);
  assert.match(hudSource, /document\.createElement\('button'\)/);
  assert.match(hudSource, /setAttribute\('aria-pressed'/);
  assert.match(hudSource, /setAttribute\('aria-current'/);
  assert.match(hudSource, /objective\.textContent = describeObjective\(row\.contract\.objective\)/);
  assert.doesNotMatch(hudSource, /contract-desc[^\n]*contract\.description/);
  assert.match(cssSource, /\.contract-row\.done\s*\{[^}]*opacity:\s*1/s);
  assert.match(cssSource, /#contracts-panel\s*\{[^}]*height:\s*min\(720px,\s*calc\(100vh - 48px\)\)[^}]*min-height:\s*0[^}]*overflow:\s*hidden/s);
  assert.doesNotMatch(cssSource, /#contracts-panel\s*\{[^}]*min-height:\s*min\(720px,\s*calc\(100vh - 48px\)\)/s);
  assert.match(cssSource, /\.contracts-status-control\s*\{[^}]*display:\s*flex[^}]*flex:\s*0 0 270px[^}]*overflow:\s*hidden[^}]*border:\s*2px solid/s);
  assert.match(cssSource, /\.overlay \.contracts-status-segment\s*\{[^}]*flex:\s*1 1 50%[^}]*border-left:\s*1px solid[^}]*border-radius:\s*0/s);
  assert.match(cssSource, /\.overlay \.contracts-status-segment:disabled\s*\{[^}]*cursor:\s*default[^}]*opacity:\s*0\.38/s);
  assert.match(cssSource, /\.contracts-category-tabs\s*\{[^}]*overflow-x:\s*auto[^}]*border-bottom:\s*1px solid/s);
  assert.match(cssSource, /\.overlay \.contracts-category-tab\s*\{[^}]*border:\s*0[^}]*background:\s*transparent[^}]*box-shadow:\s*none/s);
  assert.match(cssSource, /\.overlay \.contracts-category-tab\[aria-selected="true"\]::after\s*\{[^}]*background:\s*#3fa9f5/s);
  assert.doesNotMatch(cssSource, /\.contracts-filter\[aria-pressed="true"\]/);
  assert.match(cssSource, /#contracts-browser\s*\{[^}]*min-width:\s*0[^}]*min-height:\s*0[^}]*flex:\s*1 1 0[^}]*overflow:\s*hidden[^}]*width:\s*100%/s);
  assert.match(cssSource, /#contracts-list\s*\{[^}]*min-width:\s*0[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/s);
  assert.match(cssSource, /\.contract-detail\s*\{[^}]*min-width:\s*0[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/s);
  assert.match(cssSource, /\.contract-row\s*\{[^}]*height:\s*62px[^}]*box-sizing:\s*border-box/s);
  assert.match(cssSource, /\.contract-row:focus-visible,[^}]*outline:\s*2px solid #ffffff/s);
  assert.match(cssSource, /\.contracts-filter-count\s*\{[^}]*font-size:\s*8px/s);
  assert.match(cssSource, /@media \(max-width: 900px\)[\s\S]*#contracts-browser\s*\{[^}]*flex-direction:\s*column/);
  assert.doesNotMatch(cssSource, /@media \(max-width: 900px\)[\s\S]*#contracts-panel\s*\{[^}]*overflow-y:\s*auto/);
});

test('Contracts All groups visible rows by tab category without changing canonical order or progress fallback', () => {
  const previews = contracts.previewContractRewards();
  const visible = contracts.ACTIVE_CONTRACTS.filter((contract) => previews[contract.id] !== null);
  const categories = ['character', 'weapon', 'core', 'mod', 'socket', 'other'];
  const grouped = categories.flatMap((category) => visible
    .filter((contract) => contracts.rewardCategory(contract.reward) === category)
    .map(({ id }) => id));

  assert.deepEqual(grouped, [
    'proving-ground',
    'two-of-a-kind',
    'first-blood', 'arsenal-1', 'arsenal-2', 'arsenal-3', 'arsenal-4',
    'scrap-quota-1', 'scrap-quota-2', 'scrap-quota-3', 'scrap-quota-4',
    'veteran-1', 'veteran-2', 'veteran-3', 'veteran-4', 'ascension-1', 'ascension-2',
    'overkill', 'purist', 'foreman', 'endurance-1', 'endurance-2',
    'second-wind', 'boss-hunter', 'full-loadout',
    'untouchable',
  ]);
  for (const category of categories) {
    const tabRows = visible.filter((contract) => contracts.rewardCategory(contract.reward) === category);
    assert.deepEqual(
      grouped.filter((id) => contracts.rewardCategory(contracts.ACTIVE_CONTRACTS.find((contract) => contract.id === id).reward) === category),
      tabRows.map(({ id }) => id),
      category,
    );
  }

  const hudSource = readFileSync(new URL('../src/hud.ts', import.meta.url), 'utf8');
  assert.match(hudSource, /const displayRows = this\.contractCategory === 'all'/);
  assert.match(hudSource, /for \(const row of displayRows\) list\.appendChild\(this\.contractRow\(row\)\)/);
  assert.match(hudSource, /filteredRows\.reduce<ContractViewRow \| null>/);
  assert.doesNotMatch(hudSource, /\}\)\.sort\(\(a, b\) => b\.ratio - a\.ratio\)/);
});

test('every rendered title pairs its objective-aligned challenge with the exact concrete reward', () => {
  const previews = contracts.previewContractRewards();
  for (const contract of contracts.ACTIVE_CONTRACTS) {
    const resolved = previews[contract.id];
    if (resolved === null || resolved === undefined) continue;
    assert.equal(
      contracts.playerFacingContractTitle(contract, resolved),
      `${contract.title} — ${contracts.rewardName(resolved)}`,
      contract.id,
    );
  }

  const levelMilestone = contracts.ALL_CONTRACTS.find(({ id }) => id === 'full-loadout');
  const latentCompletion = contracts.ALL_CONTRACTS.find(({ id }) => id === 'two-of-a-kind');
  assert.equal(levelMilestone.title, 'Level Milestone');
  assert.equal(levelMilestone.objective.type, 'reach-level');
  assert.equal(latentCompletion.title, 'Two of a Kind');
  assert.equal(latentCompletion.objective.type, 'distinct-completed-characters');
  assert.equal(contracts.ALL_CONTRACTS.some(({ title }) => title === 'Full Loadout'), false);
});

test('canonical preview matches simultaneous settlement despite progress sorting', () => {
  config.PROFILE.unlockedCores.splice(0, config.PROFILE.unlockedCores.length,
    ...config.PROFILE.unlockedCores.filter((id) => !contracts.CORE_QUEUE.includes(id)));
  profile.LIFETIME.totalKills = 300;
  profile.LIFETIME.runsFinished = 8;

  const preview = contracts.previewContractRewards();
  assert.deepEqual(preview['scrap-quota-1'], { kind: 'core', id: 'crit-chance' });
  assert.deepEqual(preview['veteran-1'], { kind: 'core', id: 'crit-damage' });
  assert.deepEqual(preview['veteran-2'], { kind: 'core', id: 'duration' });
  assert.equal(
    contracts.playerFacingContractTitle(
      contracts.ALL_CONTRACTS.find(({ id }) => id === 'scrap-quota-1'),
      preview['scrap-quota-1'],
    ),
    'Scrap Quota I — Targeting Chip',
  );
  assert.equal(
    contracts.playerFacingContractTitle(
      contracts.ALL_CONTRACTS.find(({ id }) => id === 'veteran-1'),
      preview['veteran-1'],
    ),
    'Veteran I — Piercing Rounds',
  );
  const settled = Object.fromEntries(contracts.settleContracts().map(({ contract, granted }) => [contract.id, granted]));
  for (const id of ['scrap-quota-1', 'veteran-1', 'veteran-2']) assert.deepEqual(settled[id], preview[id]);
});

test('eleven core rungs consume ten stable ids and leave one dry rung pending', () => {
  config.PROFILE.unlockedCores.splice(0, config.PROFILE.unlockedCores.length,
    ...config.PROFILE.unlockedCores.filter((id) => !contracts.CORE_QUEUE.includes(id)));
  profile.LIFETIME.totalKills = 12_000;
  profile.LIFETIME.runsFinished = 25;
  profile.LIFETIME.bestLevel = 20;

  assert.equal(contracts.previewContractRewards()['ascension-3'], null);
  const settled = contracts.settleContracts();
  assert.equal(settled.filter(({ granted }) => granted?.kind === 'core').length, 10);
  assert.equal(profile.LIFETIME.completedContracts.includes('ascension-3'), false);
  assert.deepEqual(config.PROFILE.unlockedCores.filter((id) => contracts.CORE_QUEUE.includes(id)), contracts.CORE_QUEUE);

  profile.LIFETIME.completedContracts.push('scrap-quota-1');
  profile.LIFETIME.grantedRewards['scrap-quota-1'] = { kind: 'core', id: 'crit-damage' };
  assert.deepEqual(contracts.previewContractRewards()['scrap-quota-1'], { kind: 'core', id: 'crit-damage' });
});

test('backfill recovers stable queue ids in declaration order', () => {
  config.PROFILE.unlockedCores.push('crit-chance', 'crit-damage');
  profile.LIFETIME.completedContracts.push('scrap-quota-1', 'veteran-1');
  contracts.backfillGrantedRewards();
  assert.deepEqual(profile.LIFETIME.grantedRewards['scrap-quota-1'], { kind: 'core', id: 'crit-chance' });
  assert.deepEqual(profile.LIFETIME.grantedRewards['veteran-1'], { kind: 'core', id: 'crit-damage' });
});

test('full-run contracts retain structural Map 2 semantics', () => {
  const secondWind = contracts.ALL_CONTRACTS.find(({ id }) => id === 'second-wind');
  const purist = contracts.ALL_CONTRACTS.find(({ id }) => id === 'purist');
  assert.deepEqual(secondWind.objective, { type: 'complete-runs', n: 1 });
  assert.deepEqual(purist.objective, { type: 'minimal-sectors', n: config.CONTRACTS.puristSectors });

  profile.recordRunInLifetime(record('late-defeat', 'defeat'));
  assert.equal(contracts.progressOf(secondWind.objective).current, 0);
  assert.equal(contracts.progressOf(purist.objective).current, 0);

  profile.recordRunInLifetime(record('complete-with-mod', 'run-complete', {
    mods: 1,
    sectorsCleared: config.MAPS.length,
  }));
  profile.recordRunInLifetime(record('complete-without-weapon', 'run-complete', {
    weapons: 0,
    sectorsCleared: config.MAPS.length,
  }));
  assert.equal(contracts.progressOf(secondWind.objective).current, 2);
  assert.equal(contracts.progressOf(purist.objective).current, 0);

  profile.recordRunInLifetime(record('purist-complete', 'run-complete', {
    sectorsCleared: config.MAPS.length,
    modCounts: { repair: 1, haste: 1, 'scrap-cache': 1, frenzy: 1 },
  }));
  assert.equal(contracts.progressOf(purist.objective).current, config.MAPS.length);
});

test('old lifetime saves normalize missing structural counters to zero', () => {
  storage.set('voltswarm:profile', JSON.stringify({
    version: 3,
    lifetime: { runsFinished: 7, runsSurvived: 2 },
  }));
  profile.loadProfile();
  assert.equal(profile.LIFETIME.runsCompleted, 0);
  assert.equal(profile.LIFETIME.bestPuristSectors, 0);
  assert.deepEqual(profile.LIFETIME.completedCharacterIds, []);
});

test('Untouchable Contract progress uses terminal zero-damage duration and treats legacy absence as unknown', () => {
  const untouchable = contracts.ALL_CONTRACTS.find(({ id }) => id === 'untouchable');
  assert.deepEqual(untouchable.objective, {
    type: 'flawless-run',
    seconds: config.CONTRACTS.flawlessSeconds,
  });
  profile.recordRunInLifetime(record('untouchable-legacy-unknown', 'sector-cleared', {
    durationS: 600,
  }));
  profile.recordRunInLifetime(record('untouchable-damaged', 'sector-cleared', {
    durationS: 600,
    damageTaken: 1,
  }));
  assert.equal(contracts.progressOf(untouchable.objective).current, 0);
  profile.recordRunInLifetime(record('untouchable-flawless', 'sector-cleared', {
    durationS: config.CONTRACTS.flawlessSeconds,
    damageTaken: 0,
  }));
  assert.equal(
    contracts.progressOf(untouchable.objective).current,
    config.CONTRACTS.flawlessSeconds,
  );
});

test('Overkill Contract progress shares terminal integer kill telemetry with the achievement', () => {
  const overkill = contracts.ALL_CONTRACTS.find(({ id }) => id === 'overkill');
  assert.deepEqual(overkill.objective, {
    type: 'kills-in-run',
    n: config.CONTRACTS.overkillKillsInRun,
  });
  profile.recordRunInLifetime(record('overkill-fractional', 'sector-cleared', {
    kills: config.CONTRACTS.overkillKillsInRun + 0.5,
  }));
  assert.equal(contracts.progressOf(overkill.objective).current, 0);
  profile.recordRunInLifetime(record('overkill-terminal', 'sector-cleared', {
    kills: config.CONTRACTS.overkillKillsInRun,
  }));
  assert.equal(
    contracts.progressOf(overkill.objective).current,
    config.CONTRACTS.overkillKillsInRun,
  );
});

test('completed-character ledger is monotonic, idempotent, and ignores incomplete or unknown runs', () => {
  profile.recordRunInLifetime(record('field-complete', 'run-complete', {
    sectorsCleared: config.MAPS.length,
    characterId: 'field-engineer',
  }));
  profile.recordRunInLifetime(record('field-complete', 'run-complete', {
    sectorsCleared: config.MAPS.length,
    characterId: 'field-engineer',
  }));
  profile.recordRunInLifetime(record('rack-defeat', 'defeat', {
    sectorsCleared: config.MAPS.length - 1,
    characterId: 'rack-hauler',
  }));
  profile.recordRunInLifetime(record('unknown-complete', 'run-complete', {
    sectorsCleared: config.MAPS.length,
    characterId: 'unknown-character',
  }));
  profile.recordRunInLifetime(record('rack-complete', 'run-complete', {
    sectorsCleared: config.MAPS.length,
    characterId: 'rack-hauler',
  }));
  profile.recordRunInLifetime(record('overclocker-complete', 'run-complete', {
    sectorsCleared: config.MAPS.length,
    characterId: 'overclocker',
  }));

  assert.deepEqual(profile.LIFETIME.completedCharacterIds, ['field-engineer', 'rack-hauler', 'overclocker']);
  const twoOfAKind = contracts.ALL_CONTRACTS.find(({ id }) => id === 'two-of-a-kind');
  assert.deepEqual(contracts.progressOf(twoOfAKind.objective), { current: 3, target: 2 });

  profile.saveProfile();
  profile.LIFETIME.completedCharacterIds.splice(0);
  profile.loadProfile();
  assert.deepEqual(profile.LIFETIME.completedCharacterIds, ['field-engineer', 'rack-hauler', 'overclocker']);
});

test('Characters, Contracts, and Settings retain their shared UI roles', () => {
  const hudSource = readFileSync(new URL('../src/hud.ts', import.meta.url), 'utf8');
  const cssSource = readFileSync(new URL('../src/ui.css', import.meta.url), 'utf8');
  assert.match(hudSource, /id="settings-panel" class="overlay-panel">\s*<div class="panel-header">Settings<\/div>/);
  assert.match(cssSource, /\.panel-header\s*\{[\s\S]*?font-size:\s*13px;[\s\S]*?color:\s*#ffd24a;/);
  assert.match(cssSource, /\.character-card\.selected\s*\{\s*border-color:\s*#3fa9f5;/);
  assert.match(cssSource, /#settings-sidebar \.settings-tab\.active\s*\{[\s\S]*?border-color:\s*#3fa9f5;/);
  assert.match(cssSource, /\.pad-focus\s*\{[\s\S]*?border-color:\s*#01e6fe !important;[\s\S]*?outline:\s*2px solid #ffffff;/);
  assert.match(cssSource, /\.contracts-status-control\s*\{[\s\S]*?background:\s*rgba\(12, 16, 22, 0\.96\);[\s\S]*?clip-path:/);
  assert.match(cssSource, /\.contract-detail\s*\{[\s\S]*?clip-path:/);
});
