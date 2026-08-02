// Release guard. Runs automatically as npm's `prepackage` hook, so building the
// installer while a developer instrument is still switched on fails loudly
// instead of shipping a cheat menu or a capture rig to a paying player.
//
// `package:dir` is deliberately NOT guarded — that target exists for quick local
// runs where dev tools are wanted.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(root, 'src', 'config.ts');
const source = readFileSync(configPath, 'utf8');

/** Flags that must read `false` in a release build. `block` scopes the search to
 *  one exported table so a same-named key elsewhere cannot satisfy the check. */
const GUARDED = [
  { block: 'DEV_TOOLS', key: 'unlockPanel', why: 'the main-menu Unlocks panel would ship to players' },
  { block: 'DEV_TOOLS', key: 'auditionKeys', why: 'the F2-F9 SFX audition hotkeys would ship to players' },
  { block: 'DEV_TOOLS', key: 'bossLab', why: 'the B/N boss-lab hotkeys would let players skip to minute 8 with a loaded build' },
  { block: 'DEV_TOOLS', key: 'startingMapSelector', why: 'the development starting-map selector would ship to players' },
  { block: 'RECORDING', key: 'enabled', why: 'the level-up draft is rigged for capture' },
  { block: 'RECORDING', key: 'forceGreenChests', why: 'chest tiers are rigged for capture' },
  { block: 'RECORDING', key: 'forceOrbSiphonReward', why: 'the chest reward is rigged for capture' },
  { block: 'VISUAL', key: 'showFps', why: 'the dev FPS readout would ship to players' },
];

/** Slice one `export const NAME = {...}` table out of the source text. */
function blockOf(name) {
  const start = source.indexOf(`export const ${name}`);
  if (start === -1) return null;
  const rest = source.slice(start + 1);
  const end = rest.indexOf('\nexport const ');
  return end === -1 ? rest : rest.slice(0, end);
}

const problems = [];
for (const { block, key, why } of GUARDED) {
  const body = blockOf(block);
  if (body === null) {
    problems.push(`${block} not found in src/config.ts — the guard cannot verify ${key}.`);
    continue;
  }
  const match = body.match(new RegExp(`\\b${key}\\s*:\\s*(true|false)\\b`));
  if (!match) {
    problems.push(`${block}.${key} not found — the guard cannot verify it.`);
  } else if (match[1] === 'true') {
    problems.push(`${block}.${key} is true — ${why}.`);
  }
}

if (problems.length > 0) {
  console.error('\nRelease flag check FAILED. Packaging aborted.\n');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(`\nEdit ${path.relative(root, configPath)} and run again.\n`);
  process.exit(1);
}

console.log('Release flag check passed: no developer instruments enabled.');
