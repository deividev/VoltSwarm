// Release guard. Both package targets call it explicitly so neither an
// installer nor an unpacked demo can bypass identity/content safety checks.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { validateDemoBuildMetadata } = require('./build-metadata.cjs');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(root, 'src', 'config.ts');
const source = readFileSync(configPath, 'utf8');
const packagePath = path.join(root, 'package.json');
const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
const telemetrySource = readFileSync(path.join(root, 'electron', 'telemetry', 'config.ts'), 'utf8');
const electronMainSource = readFileSync(path.join(root, 'electron', 'main.ts'), 'utf8');
const rendererMainSource = readFileSync(path.join(root, 'src', 'main.ts'), 'utf8');

/** Flags that must read `false` in a release build. `block` scopes the search to
 *  one exported table so a same-named key elsewhere cannot satisfy the check. */
const GUARDED = [
  { block: 'DEV_TOOLS', key: 'unlockPanel', why: 'the main-menu Unlocks panel would ship to players' },
  { block: 'DEV_TOOLS', key: 'auditionKeys', why: 'the F2-F9 SFX audition hotkeys would ship to players' },
  { block: 'DEV_TOOLS', key: 'bossLab', why: 'the B/N boss-lab hotkeys would let players skip to minute 8 with a loaded build' },
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
problems.push(...validateDemoBuildMetadata(pkg));
if (pkg.build?.directories?.output !== 'release-demo-map1') {
  problems.push('demo packages must use the isolated release-demo-map1 output directory');
}
if (pkg.build?.nsis?.artifactName !== 'Voltswarm-Demo-${version}-setup.${ext}' ||
    pkg.build?.portable?.artifactName !== 'Voltswarm-Demo-${version}-portable.${ext}') {
  problems.push('demo installer and portable artifacts must use explicit Voltswarm-Demo names');
}
if (!/enabled:\s*false\b/.test(telemetrySource) ||
    !/admittedBuildVersions:\s*\[\]/.test(telemetrySource) ||
    !/resetEpoch:\s*null\b/.test(telemetrySource)) {
  problems.push('demo telemetry must remain disabled with no admitted builds and no reset epoch');
}
if (!/runtime\.flavor\s*===\s*'playtest'/.test(telemetrySource)) {
  problems.push('playtest eligibility must reject non-playtest build flavors');
}
if (!pkg.scripts?.package?.includes('check:release-flags') ||
    !pkg.scripts?.['package:dir']?.includes('check:release-flags')) {
  problems.push('both package and package:dir must run the release guard');
}
if (!electronMainSource.includes("app.setPath('userData'") ||
    !electronMainSource.includes('BUILD_METADATA.userDataDirectory') ||
    !electronMainSource.includes('app.setAppUserModelId(BUILD_METADATA.appId)') ||
    !electronMainSource.includes('const APP_TITLE = BUILD_METADATA.productName')) {
  problems.push('Electron must apply the package-owned demo userData and runtime identity');
}
if (/\bpackageJson\.build\b/.test(electronMainSource)) {
  problems.push('Electron runtime must not read electron-builder packaging configuration');
}
if (!electronMainSource.includes('shell.openExternal(target') ||
    !electronMainSource.includes('fullGameStoreTarget()')) {
  problems.push('wishlist CTA must validate and open only the package-owned Steam target');
}
if (!rendererMainSource.includes("__ALLOWED_MAPS__[0] !== 'scrapyard'")) {
  problems.push('renderer must enforce the packaged Scrapyard-only map contract');
}
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

console.log('Release flag check passed: demo identity, scope, telemetry, CTA, and developer flags are safe.');
