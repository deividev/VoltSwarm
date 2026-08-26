import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validatePack } from './rebuild-runtime-pack.mjs';

const root = resolve(import.meta.dirname, '../..');
const pack = JSON.parse(readFileSync(resolve(import.meta.dirname, 'runtime-pack.json'), 'utf8'));
const output = process.argv.includes('--dist')
  ? resolve(root, 'dist/assets/audio/sfx')
  : resolve(root, 'public/assets/audio/sfx');
const failures = validatePack(pack, { output });
if (failures.length) {
  failures.forEach((failure) => console.error(`audio validation: ${failure}`));
  process.exit(1);
}
const variants = Object.values(pack.events).flat().length;
console.log(`audio validation passed: ${Object.keys(pack.events).length} enabled events, ${variants} variants, hashes/formats/provenance/orphans verified (${process.argv.includes('--dist') ? 'dist' : 'public'})`);
