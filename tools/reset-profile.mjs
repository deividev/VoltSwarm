// Wipes saved progression so the next launch starts as a brand new player.
// Development only.
//
// Writes EMPTY files rather than deleting them. Deleting looks equivalent but
// is not: loadProfile() reads `electronAPI.loadProfile() ?? localStorage`, and a
// missing file returns null, so the game would fall through and resurrect the
// old save from localStorage — which saveProfile() also writes to. An empty
// file is present, parses, and yields the fresh-profile defaults, so the
// fallback is never consulted.
//
// Both files must be cleared: the career ledger is rebuilt from surviving run
// history at boot, so clearing the profile alone would see every total return.
//
// This is enough on its own since the run-history migration became one-shot.
// Before that, an empty history file looked identical to "never migrated", so
// every reset re-imported the legacy runs from localStorage and the ledger
// rebuilt itself from them — the reset silently undid itself on next launch.
//
// Settings are left alone — resolution and volume are not progression.
//
// Reports every location it inspects, because localStorage is per ORIGIN and
// per Electron user-data dir: a build launched a different way keeps its own
// separate save, and "my progress is not here" is usually that.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
  // `{}` normalises to the fresh-profile defaults, `[]` is an empty history,
  // so neither needs the renderer's default tables duplicated here.
  for (const [file, blank] of [['profile.json', '{}'], ['run-history.json', '[]']]) {
    const path = resolve(dir, file);
    let summary = 'absent';
    if (existsSync(path)) {
      try {
        const data = JSON.parse(readFileSync(path, 'utf8'));
        summary = Array.isArray(data)
          ? `${data.length} runs`
          : `${data.lifetime?.runsFinished ?? 0} runs, ${data.lifetime?.completedContracts?.length ?? 0} contracts`;
      } catch { summary = 'unreadable'; }
    }
    writeFileSync(path, blank);
    console.log(`  ${file.padEnd(18)} CLEARED (was: ${summary})`);
    removed++;
  }
}

console.log(
  removed > 0
    ? `\nCleared ${removed} file(s). The next launch starts from a fresh profile.`
    : '\nNothing to clear.',
);
console.log(
  '\nIf progress you expected is still there, it lives in a store this cannot reach:\n' +
  '  - a browser session (pnpm dev) keeps its own localStorage per origin\n' +
  '  - an Electron run with --user-data-dir keeps its own folder\n' +
  'Run the game from Electron (pnpm electron:start) so it reads these files.',
);
