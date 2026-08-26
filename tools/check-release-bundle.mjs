import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const electronDist = join(root, 'electron', 'dist');
const forbidden = [
  '--audio-benchmark',
  'audioBenchmark',
  '__voltswarmAudioBenchmark',
  'startAudioBenchmark',
  'audio-swarm-416',
  'Scrap Swarm',
];

function filesUnder(directory) {
  if (!existsSync(directory)) throw new Error(`Missing release output: ${directory}`);
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...filesUnder(path));
    else if (['.js', '.html', '.json', '.css'].includes(extname(entry.name))) result.push(path);
  }
  return result;
}

const problems = [];
for (const file of [...filesUnder(dist), ...filesUnder(electronDist)]) {
  const source = readFileSync(file, 'utf8');
  for (const token of forbidden) {
    if (source.includes(token)) problems.push(`${file}: contains forbidden production token ${token}`);
  }
  if (/['"]__voltswarm['"]/.test(source)) {
    problems.push(`${file}: exposes the full Game object through __voltswarm`);
  }
}

const html = readFileSync(join(dist, 'index.html'), 'utf8');
if (!/<title>Voltswarm<\/title>/.test(html)) problems.push('dist/index.html does not declare <title>Voltswarm</title>');
if (/<title>\s*Scrap Swarm\s*<\/title>/i.test(html)) problems.push('dist/index.html still declares the retired Scrap Swarm title');

if (problems.length > 0) {
  console.error('\nRelease bundle check FAILED.\n');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log('Release bundle check passed: title is Voltswarm and no benchmark hooks ship.');
