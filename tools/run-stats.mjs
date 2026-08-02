// Reads real play data and prints the distributions a balance pass needs.
// Development only — nothing here ships.
//
// Contract thresholds are percentile questions ("what share of runs reach
// this?"), never averages: one disastrous run and one great run average into a
// number no session resembles. So this reports p10/p25/p50/p75/p90 and lets the
// shape of the curve pick the threshold.
//
// Usage:
//   npm run stats                 read the local profile's run-history.json
//   npm run stats -- <file.json>  read an explicit export
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import os from 'node:os';

const DEFAULT_FILE = resolve(os.homedir(), 'AppData/Roaming/voltswarm/run-history.json');
const file = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_FILE;

if (!existsSync(file)) {
  console.error(`No run history at ${file}`);
  console.error('Play at least one run, or pass a path to an exported history.');
  process.exit(1);
}

const history = JSON.parse(readFileSync(file, 'utf8'));
if (!Array.isArray(history) || history.length === 0) {
  console.error('Run history is empty.');
  process.exit(1);
}

const fmt = (n, digits = 0) => Number(n).toFixed(digits).padStart(7);
const pct = (values, p) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index];
};

function distribution(label, values, digits = 0) {
  if (values.length === 0) return;
  console.log(
    `  ${label.padEnd(20)}` +
    `${fmt(Math.min(...values), digits)} ${fmt(pct(values, 25), digits)} ` +
    `${fmt(pct(values, 50), digits)} ${fmt(pct(values, 75), digits)} ` +
    `${fmt(pct(values, 90), digits)} ${fmt(Math.max(...values), digits)}`,
  );
}

console.log(`\nSource: ${file}`);
console.log(`Runs on record: ${history.length}\n`);

// Build versions matter: a threshold calibrated on an old balance table is a
// threshold calibrated on a different game.
const byBuild = {};
for (const r of history) byBuild[r.buildVersion ?? 'unknown'] = (byBuild[r.buildVersion ?? 'unknown'] ?? 0) + 1;
console.log('Runs per build version:');
for (const [v, n] of Object.entries(byBuild).sort()) console.log(`  ${v.padEnd(12)} ${n}`);

const outcomes = {};
for (const r of history) outcomes[r.outcome] = (outcomes[r.outcome] ?? 0) + 1;
console.log('\nOutcomes:');
for (const [o, n] of Object.entries(outcomes).sort()) {
  console.log(`  ${o.padEnd(16)} ${String(n).padStart(4)}  (${Math.round((n / history.length) * 100)}%)`);
}

console.log('\nDistributions           min     p25     p50     p75     p90     max');
distribution('kills / run', history.map((r) => r.kills));
distribution('level reached', history.map((r) => r.level));
distribution('duration (s)', history.map((r) => r.durationS));
distribution('bosses / run', history.map((r) => r.bossesDefeated));
distribution('total damage', history.map((r) => r.totalDamage ?? 0));
// Only over runs that actually carry the field: a record written before the
// counter existed means UNKNOWN, and folding it in as 0 would drag every
// percentile down and quietly produce thresholds nobody can hit.
const withField = (key) => history.filter((r) => typeof r[key] === 'number').map((r) => r[key]);
distribution('damage taken', withField('damageTaken'));
distribution('gold earned', withField('goldEarned'));
distribution('shop purchases', withField('shopPurchases'));

const legacy = history.filter((r) => typeof r.damageTaken !== 'number').length;
if (legacy > 0) {
  console.log(`\n  (${legacy} of ${history.length} runs predate the per-run counters and are excluded from those rows)`);
}

// Cursed: the player VOLUNTARILY raising difficulty. A leaderboard that ignores
// this ranks a +60% run against a +0% run as the same game, so it is reported
// next to kills rather than buried.
const withCursed = history.filter((r) => typeof r.cursedTimeAvg === 'number');
if (withCursed.length > 0) {
  console.log(`\nCursed — self-inflicted difficulty (${withCursed.length} runs carry it)`);
  console.log('                        min     p25     p50     p75     p90     max');
  distribution('cursed at end', withField('cursedFinal').map((v) => v * 100), 1);
  distribution('cursed time-avg', withField('cursedTimeAvg').map((v) => v * 100), 1);

  const cursedRuns = withCursed.filter((r) => (r.cursedTimeAvg ?? 0) > 0.01);
  console.log(`\n  ${cursedRuns.length} of ${withCursed.length} runs took any Cursed at all.`);
  if (cursedRuns.length > 0 && cursedRuns.length < withCursed.length) {
    const clean = withCursed.filter((r) => (r.cursedTimeAvg ?? 0) <= 0.01);
    const medKills = (rows) => pct(rows.map((r) => r.kills), 50);
    console.log('  Median kills, cursed vs not — a leaderboard has to separate these:');
    console.log(`    cursed      ${fmt(medKills(cursedRuns))}   (median time-avg ${(pct(cursedRuns.map((r) => r.cursedTimeAvg), 50) * 100).toFixed(0)}%)`);
    console.log(`    no cursed   ${fmt(medKills(clean))}`);
  }
} else {
  console.log('\nCursed: no run on record carries the cursed counters yet (added v0.8.0).');
}

// Pressure: does the player ever actually get trapped? Enclosure is angular
// coverage, not a headcount, because the global i-frame caps swarm DPS — 4.2x
// more bodies on the player deals the same damage (measured 2026-07-30), so
// density says nothing about whether escape was possible.
//
// This block exists to answer the dash question with a before/after across the
// density changes, which is why it also breaks down per build version. A single
// pooled median would blend the builds and answer nothing.
const withPressure = history.filter((r) => typeof r.enclosedS === 'number');
if (withPressure.length > 0) {
  console.log(`\nPressure — the dash question (${withPressure.length} runs carry it)`);
  console.log('                        min     p25     p50     p75     p90     max');
  distribution('contact (s)', withField('contactS'), 1);
  distribution('enclosed (s)', withField('enclosedS'), 1);
  distribution('enclosed low HP (s)', withField('enclosedLowHpS'), 1);
  distribution('peak sectors /12', withField('peakEnclosedSectors'));
  distribution(
    'enclosed % of run',
    withPressure.filter((r) => r.durationS > 0).map((r) => (r.enclosedS / r.durationS) * 100),
    1,
  );

  const never = withPressure.filter((r) => r.enclosedS === 0).length;
  console.log(`\n  ${never} of ${withPressure.length} runs NEVER enclosed the player once.`);
  console.log('  If that stays near 100% after the density work, a dash has nothing to escape from.');

  const buildRows = {};
  for (const r of withPressure) {
    const key = r.buildVersion ?? 'unknown';
    (buildRows[key] ??= []).push(r);
  }
  if (Object.keys(buildRows).length > 1) {
    console.log('\n  Per build (median — this is the before/after):');
    console.log('    build        runs   enclosed(s)   low HP(s)   peak/12   contact(s)');
    for (const [build, runs] of Object.entries(buildRows).sort()) {
      const med = (key) => pct(runs.map((r) => r[key]).filter((v) => typeof v === 'number'), 50);
      console.log(
        `    ${build.padEnd(12)} ${String(runs.length).padStart(4)}` +
        `   ${fmt(med('enclosedS'), 1)}   ${fmt(med('enclosedLowHpS'), 1)}` +
        `  ${fmt(med('peakEnclosedSectors'))}  ${fmt(med('contactS'), 1)}`,
      );
    }
  }
} else {
  console.log('\nPressure: no run on record carries the enclosure counters yet.');
  console.log('  They start recording in v0.7.0. Runs played before that CANNOT be backfilled —');
  console.log('  record the baseline BEFORE changing enemy density, or there is nothing to compare.');
}

const chests = {};
for (const r of history) {
  for (const [tier, n] of Object.entries(r.chestsByTier ?? {})) chests[tier] = (chests[tier] ?? 0) + n;
}
if (Object.keys(chests).length > 0) {
  console.log('\nChests opened by tier:');
  for (const [tier, n] of Object.entries(chests).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${tier.padEnd(10)} ${String(n).padStart(4)}`);
  }
}

const difficulties = {};
for (const r of history) difficulties[r.difficulty ?? '(unlabelled)'] = (difficulties[r.difficulty ?? '(unlabelled)'] ?? 0) + 1;
console.log('\nRuns per difficulty:');
for (const [d, n] of Object.entries(difficulties).sort()) console.log(`  ${d.padEnd(14)} ${String(n).padStart(4)}`);

const LEGACY_FULL_RUN_SECTORS = 2;
const sectorsCleared = (run) => run.sectorsCleared ?? (
  run.outcome === 'run-complete'
    ? Math.max(LEGACY_FULL_RUN_SECTORS, run.map?.number ?? 0)
    : run.outcome === 'sector-cleared'
      ? Math.max(1, run.map?.number ?? 1)
      : 0
);
const mapsReached = (run) => run.mapsReached ?? Math.max(1, run.map?.number ?? 1);
distribution('sectors cleared', history.map(sectorsCleared));
distribution('maps reached', history.map(mapsReached));

// Completion is structural. A 20-minute defeat in Map 2 is not a completed
// run, while a future balance pass changing map duration must not break stats.
const finished = history.filter((r) => r.outcome === 'run-complete');
if (finished.length > 0) {
  console.log(`\nCompleted full-arc runs only (${finished.length}):`);
  console.log('                        min     p25     p50     p75     p90     max');
  distribution('kills / run', finished.map((r) => r.kills));
  distribution('level reached', finished.map((r) => r.level));
}

console.log('\nLifetime totals:');
const sum = (pick) => history.reduce((t, r) => t + (pick(r) || 0), 0);
console.log(`  runs finished     ${String(history.length).padStart(8)}`);
console.log(`  total kills       ${String(sum((r) => r.kills)).padStart(8)}`);
console.log(`  bosses defeated   ${String(sum((r) => r.bossesDefeated)).padStart(8)}`);
console.log(`  play time         ${String(Math.round(sum((r) => r.durationS) / 60)).padStart(8)} min`);

const damageByWeapon = {};
for (const r of history) {
  for (const [id, d] of Object.entries(r.weaponDamage ?? {})) {
    if (d > 0) damageByWeapon[id] = (damageByWeapon[id] ?? 0) + d;
  }
}
const ranked = Object.entries(damageByWeapon).sort((a, b) => b[1] - a[1]);
if (ranked.length > 0) {
  const total = ranked.reduce((t, [, d]) => t + d, 0);
  console.log('\nLifetime damage by weapon:');
  for (const [id, d] of ranked) {
    console.log(`  ${id.padEnd(12)} ${String(Math.round(d)).padStart(9)}  (${Math.round((d / total) * 100)}%)`);
  }
}

const starts = {};
for (const r of history) if (r.startingWeapon) starts[r.startingWeapon] = (starts[r.startingWeapon] ?? 0) + 1;
if (Object.keys(starts).length > 0) {
  console.log('\nRuns per starting weapon:');
  for (const [id, n] of Object.entries(starts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${id.padEnd(12)} ${String(n).padStart(4)}`);
  }
} else {
  console.log('\nRuns per starting weapon: not recorded yet (field added later; older runs lack it).');
}

// Threshold suggestions. Deliberately expressed as "what share of runs would
// already clear this", because that is the design question, not the number.
console.log('\nThreshold candidates (share of recorded runs that already clear it):');
const kills = history.map((r) => r.kills);
for (const target of [100, 300, 500, 1000, 1500, 2500]) {
  const share = Math.round((kills.filter((k) => k >= target).length / kills.length) * 100);
  console.log(`  ${String(target).padStart(5)} kills in a run   ${String(share).padStart(3)}% of runs`);
}
const levels = history.map((r) => r.level);
for (const target of [10, 15, 20, 25, 30]) {
  const share = Math.round((levels.filter((l) => l >= target).length / levels.length) * 100);
  console.log(`  level ${String(target).padStart(2)} in a run       ${String(share).padStart(3)}% of runs`);
}

if (history.length < 20) {
  console.log(
    `\nWARNING: ${history.length} run(s) is too thin to calibrate from. Percentiles need\n` +
    '         a few dozen runs, from the CURRENT balance table, played by a human.\n' +
    '         Bot sweeps (npm run test:smoke) write to an isolated profile on purpose\n' +
    '         and must never be mixed in: a circle-strafing bot that always takes the\n' +
    '         first card is not a player.',
  );
}
console.log();
