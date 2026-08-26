import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '../..');
const packPath = resolve(import.meta.dirname, 'runtime-pack.json');
const output = resolve(root, 'tmp/audio-mix-calibration.json');
const packBytes = readFileSync(packPath);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const configSource = readFileSync(resolve(root, 'src/config.ts'), 'utf8');
const audioStart = configSource.indexOf('export const AUDIO =');
const audioEnd = configSource.indexOf('\nexport const ', audioStart + 1);
if (audioStart < 0 || audioEnd < 0) throw new Error('Cannot isolate AUDIO config for mix identity');
const git = (...args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  return result.stdout;
};
const status = git('status', '--porcelain=v1', '--untracked-files=all');
const judgedDiff = git('diff', '--binary', 'HEAD', '--', 'src/audio.ts', 'src/config.ts', 'src/game.ts', 'tools/audio/runtime-pack.json', 'package.json');
const distRoot = resolve(root, 'dist');
const filesBelow = (path) => readdirSync(path).flatMap((name) => {
  const child = resolve(path, name);
  return statSync(child).isDirectory() ? filesBelow(child) : [child];
});
const buildFiles = existsSync(distRoot)
  ? filesBelow(distRoot)
      .sort()
      .map((path) => ({ path: path.slice(root.length + 1).replace(/\\/g, '/'), sha256: hash(readFileSync(path)) }))
  : [];
const report = {
  schema: 'voltswarm-audio-mix-calibration-v1',
  status: 'pending-human-listening',
  createdAt: new Date().toISOString(),
  buildVersion: JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version,
  runtimePackSha256: hash(packBytes),
  audioConfigSha256: hash(configSource.slice(audioStart, audioEnd)),
  sourceIdentity: {
    head: git('rev-parse', 'HEAD').trim(),
    dirty: status.length > 0,
    statusSha256: hash(status),
    judgedDiffSha256: hash(judgedDiff),
  },
  buildIdentity: {
    available: buildFiles.length > 0,
    files: buildFiles,
    sha256: buildFiles.length > 0 ? hash(JSON.stringify(buildFiles)) : null,
  },
  requiredRoutes: [
    { id: 'menu-to-scrapyard', completedRun: false, notes: null },
    { id: 'scrapyard-to-foundry', completedRun: false, notes: null },
    { id: 'foundry-to-hazard-marshal-to-menu', completedRun: false, notes: null },
  ],
  checkpoints: {
    musicCrossfadeMasksNeitherTrack: null,
    weaponLoopsRemainDistinctUnderSwarm: null,
    dangerCuesBeatMusicWithoutClipping: null,
    pickupsAndDeathsRemainBackground: null,
    pauseAndModalDuckRecoverCorrectly: null,
  },
  diagnostics: {
    loadFailures: null,
    leakedVoices: null,
    peakActiveVoices: null,
    evidenceSource: 'window.__voltswarmAudio.diagnostics() in Electron with DEV_TOOLS.audioDiagnostics=true (revert to false after capture)',
  },
  decision: null,
};
mkdirSync(resolve(root, 'tmp'), { recursive: true });
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(`audio mix calibration sheet created: ${output}`);
console.log('Status remains pending-human-listening until a maintainer completes the routes and records a decision.');
