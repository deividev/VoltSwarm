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

const finished = history.filter((r) => r.durationS >= 590);
if (finished.length > 0) {
  console.log(`\nFull 10:00 runs only (${finished.length}):`);
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
