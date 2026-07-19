import { loadManifest, validateManifest } from './validate.mjs';
const manifest = loadManifest();
const broken = structuredClone(manifest);
broken.events['enemy-death'][0].wav.sha256 = '0'.repeat(64);
broken.events['foundation-music'][0].runtime.format = 'wav';
const failures = validateManifest(broken, { checkFiles: true });
if (failures.length < 2) { console.error('negative fixture did not detect corrupt provenance/export metadata'); process.exit(1); }
console.log('audio negative fixtures passed: corrupt manifest metadata is rejected');
