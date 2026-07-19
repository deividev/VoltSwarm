import { spawnSync } from 'node:child_process';
const steps = [
  ['node', ['tools/audio/generate.mjs']],
  ['node', ['tools/audio/validate.mjs']],
  ['node', ['tools/audio/repro.mjs']],
  ['node', ['tools/audio/self-test.mjs']],
];
for (const [command, args] of steps) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('foundation check passed (generation, validation, reproducibility, negative fixtures)');
