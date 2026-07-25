// Wipes saved progression so the next launch starts as a brand new player.
// Development only.
//
// Deletes profile.json and run-history.json, and BOTH must go: the career
// ledger is rebuilt from surviving run history at boot, so removing the profile
// alone would see every total reappear.
//
// Settings are left alone — resolution and volume are not progression.
//
// Reports every location it inspects, because localStorage is per ORIGIN and
// per Electron user-data dir: a build launched a different way keeps its own
// separate save, and "my progress is not here" is usually that.
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import os from 'node:os';

const roaming = resolve(os.homedir(), 'AppData/Roaming');
const CANDIDATES = [
  resolve(roaming, 'voltswarm'),
  resolve(roaming, 'Voltswarm'),
  resolve(import.meta.dirname, '..', 'tmp/smoke-output/userdata'),
];

const seen = new Set();
let removed = 0;

for (const dir of CANDIDATES) {
  const key = dir.toLowerCase();
  if (seen.has(key)) continue; // Windows paths are case-insensitive.
  seen.add(key);
  if (!existsSync(dir)) continue;

  console.log(`\n${dir}`);
  for (const file of ['profile.json', 'run-history.json']) {
    const path = resolve(dir, file);
    if (!existsSync(path)) {
      console.log(`  ${file.padEnd(18)} absent`);
      continue;
    }
    let summary = '';
    try {
      const data = JSON.parse(readFileSync(path, 'utf8'));
      summary = Array.isArray(data)
        ? `${data.length} runs`
        : `${data.lifetime?.runsFinished ?? 0} runs, ${data.lifetime?.completedContracts?.length ?? 0} contracts`;
    } catch { summary = 'unreadable'; }
    rmSync(path);
    console.log(`  ${file.padEnd(18)} REMOVED (${summary})`);
    removed++;
  }
}

console.log(
  removed > 0
    ? `\nRemoved ${removed} file(s). The next launch starts from a fresh profile.`
    : '\nNothing to remove.',
);
console.log(
  '\nIf progress you expected is still there, it lives in a store this cannot reach:\n' +
  '  - a browser session (npm run dev) keeps its own localStorage per origin\n' +
  '  - an Electron run with --user-data-dir keeps its own folder\n' +
  'The in-game Unlocks panel has a Reset progress button that clears whichever\n' +
  'store the running build is actually using.',
);
