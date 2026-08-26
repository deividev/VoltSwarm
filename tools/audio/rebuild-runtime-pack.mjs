import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const lockPath = resolve(import.meta.dirname, 'runtime-pack.json');
const outputRoot = resolve(root, 'public/assets/audio/sfx');
const legacyRuntimeRoot = resolve(root, 'public/assets/audio/prototypes');
const configPath = resolve(root, 'src/config.ts');

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const repoPath = (path) => resolve(root, path);
const entriesOf = (pack) => Object.values(pack.events ?? {}).flat();
const canonicalSourcePath = (pack, asset, sourceVaultRoot = repoPath(pack.sourceVault)) => resolve(sourceVaultRoot, basename(asset.runtime.path));

function audioConfig() {
  const source = readFileSync(configPath, 'utf8');
  const match = source.match(/enabledEvents:\s*\[([\s\S]*?)\]\s*as readonly string\[\]/);
  if (!match) throw new Error('cannot read AUDIO.validation.enabledEvents from src/config.ts');
  const manifest = source.match(/paths:\s*\{\s*manifest:\s*'([^']+)'/);
  if (!manifest) throw new Error('cannot read AUDIO.paths.manifest from src/config.ts');
  return {
    enabledEvents: [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]),
    manifest: manifest[1],
  };
}

function assertFormat(path, format, bytes) {
  const extension = extname(path).slice(1).toLowerCase();
  if (extension !== format) throw new Error(`${path}: extension does not match declared ${format}`);
  if (format === 'wav') {
    const riff = bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WAVE';
    const fmt = bytes.indexOf(Buffer.from('fmt '), 12);
    const data = bytes.indexOf(Buffer.from('data'), 12);
    if (!riff || fmt < 0 || data < 0 || fmt + 10 > bytes.length || bytes.readUInt16LE(fmt + 8) !== 1) {
      throw new Error(`${path}: invalid PCM WAV structure`);
    }
  }
  if (format === 'ogg') {
    const codec = bytes.includes(Buffer.from('vorbis')) || bytes.includes(Buffer.from('OpusHead'));
    if (bytes.subarray(0, 4).toString() !== 'OggS' || !codec) throw new Error(`${path}: invalid OGG audio structure`);
  }
  if (format === 'mp3') {
    let offset = 0;
    if (bytes.subarray(0, 3).toString() === 'ID3' && bytes.length >= 10) {
      const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
      offset = 10 + size;
    }
    let frame = false;
    for (let index = offset; index + 1 < Math.min(bytes.length, offset + 64 * 1024); index++) {
      if (bytes[index] === 0xff && (bytes[index + 1] & 0xe0) === 0xe0) { frame = true; break; }
    }
    if (!frame) throw new Error(`${path}: MP3 contains no MPEG audio frame`);
  }
}

function validProvenance(source) {
  const provenance = source?.provenance;
  if (!provenance || typeof provenance !== 'object' || Object.keys(provenance).length === 0) return false;
  if (source.origin === 'suno-immutable-master') return Boolean(provenance.catalog && provenance.take && provenance.generatedUnderPaidPlan === true);
  if (source.origin === 'elevenlabs-immutable-master') return Boolean(provenance.recipe && provenance.promptKey && provenance.regeneration === 'non-deterministic-do-not-substitute');
  if (source.origin === 'accepted-procedural-master') return Boolean(provenance.generatorHash || provenance.catalog);
  return false;
}

export function validatePack(pack, { output = outputRoot, checkRuntime = true, sourceVaultRoot = repoPath(pack.sourceVault ?? '') } = {}) {
  const failures = [];
  if (pack?.version !== 'runtime-pack-v1') failures.push('pack version must be runtime-pack-v1');
  if (pack?.sourceVault !== 'audio-masters/runtime') failures.push('sourceVault must be audio-masters/runtime');
  if (!pack?.sourcePathPolicy) failures.push('sourcePathPolicy is required');
  if (pack?.orphanPolicy !== 'exact') failures.push('orphanPolicy must be exact');

  const config = audioConfig();
  if (config.manifest !== 'assets/audio/sfx/manifest.json') failures.push(`AudioDirector manifest path is not canonical: ${config.manifest}`);
  const configured = new Set(config.enabledEvents);
  const declared = new Set(Object.keys(pack?.events ?? {}));
  for (const event of configured) if (!declared.has(event)) failures.push(`enabled event has no asset: ${event}`);
  for (const event of declared) if (!configured.has(event)) failures.push(`pack event is not enabled: ${event}`);

  const runtimeFiles = new Map([['manifest.json', null]]);
  for (const [event, variants] of Object.entries(pack?.events ?? {})) {
    if (!Array.isArray(variants) || variants.length === 0) {
      failures.push(`${event}: no variants`);
      continue;
    }
    for (const [index, asset] of variants.entries()) {
      const label = `${event} v${index + 1}`;
      if (!asset?.source?.path || !asset?.source?.sha256 || !asset?.source?.origin) {
        failures.push(`${label}: incomplete source provenance`);
        continue;
      }
      if (!validProvenance(asset.source)) failures.push(`${label}: invalid source provenance for ${asset.source.origin}`);
      if (!asset?.runtime?.path || !asset?.runtime?.sha256 || !['wav', 'ogg', 'mp3'].includes(asset?.runtime?.format)) {
        failures.push(`${label}: incomplete runtime metadata`);
        continue;
      }
      if (!asset.runtime.path.startsWith('assets/audio/sfx/')) failures.push(`${label}: runtime path must be inside assets/audio/sfx`);
      const name = basename(asset.runtime.path);
      const priorHash = runtimeFiles.get(name);
      if (priorHash && priorHash !== asset.runtime.sha256) failures.push(`${label}: conflicting runtime filename ${name}`);
      runtimeFiles.set(name, asset.runtime.sha256);

      const sourcePath = canonicalSourcePath(pack, asset, sourceVaultRoot);
      if (!existsSync(sourcePath)) {
        failures.push(`${label}: canonical source master missing (${pack.sourceVault}/${name})`);
        continue;
      }
      const sourceBytes = readFileSync(sourcePath);
      if (sha256(sourceBytes) !== asset.source.sha256) failures.push(`${label}: source master hash mismatch`);
      if (asset.runtime.sha256 !== asset.source.sha256) failures.push(`${label}: runtime is not an exact master copy`);
      try { assertFormat(`${pack.sourceVault}/${name}`, asset.runtime.format, sourceBytes); } catch (error) { failures.push(error.message); }

      if (!checkRuntime) continue;
      const runtimePath = resolve(output, name);
      if (!existsSync(runtimePath)) {
        failures.push(`${label}: runtime file missing`);
        continue;
      }
      const runtimeBytes = readFileSync(runtimePath);
      if (sha256(runtimeBytes) !== asset.runtime.sha256) failures.push(`${label}: runtime hash mismatch`);
      try { assertFormat(asset.runtime.path, asset.runtime.format, runtimeBytes); } catch (error) { failures.push(error.message); }
    }
  }

  if (checkRuntime && existsSync(output)) {
    const expectedManifest = JSON.stringify(pack, null, 2) + '\n';
    const runtimeManifest = resolve(output, 'manifest.json');
    if (!existsSync(runtimeManifest) || readFileSync(runtimeManifest, 'utf8') !== expectedManifest) failures.push('runtime manifest differs from canonical pack lock');
    for (const name of readdirSync(output)) if (!runtimeFiles.has(name)) failures.push(`orphan runtime file: ${name}`);
  }
  const vault = sourceVaultRoot;
  if (existsSync(vault)) {
    for (const name of readdirSync(vault)) if (!runtimeFiles.has(name)) failures.push(`orphan canonical source master: ${name}`);
  }
  return failures;
}

export function rebuildRuntimePack() {
  const pack = JSON.parse(readFileSync(lockPath, 'utf8'));
  const sourceFailures = validatePack(pack, { checkRuntime: false });
  if (sourceFailures.length) throw new Error(sourceFailures.join('\n'));

  const parent = dirname(outputRoot);
  const staging = resolve(parent, `.sfx-staging-${process.pid}`);
  const backup = resolve(parent, `.sfx-backup-${process.pid}`);
  rmSync(staging, { recursive: true, force: true });
  rmSync(backup, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  try {
    for (const asset of entriesOf(pack)) copyFileSync(canonicalSourcePath(pack, asset), resolve(staging, basename(asset.runtime.path)));
    writeFileSync(resolve(staging, 'manifest.json'), JSON.stringify(pack, null, 2) + '\n');
    const stagingFailures = validatePack(pack, { output: staging });
    if (stagingFailures.length) throw new Error(stagingFailures.join('\n'));

    if (existsSync(outputRoot)) renameSync(outputRoot, backup);
    try {
      renameSync(staging, outputRoot);
    } catch (error) {
      if (existsSync(backup)) renameSync(backup, outputRoot);
      throw error;
    }
    rmSync(backup, { recursive: true, force: true });
    // The accepted bytes now live in the canonical master vault and sfx output.
    // Keeping the legacy runtime directory would make Vite copy a second,
    // unreferenced pack and revive the prototypes-vs-sfx ambiguity.
    rmSync(legacyRuntimeRoot, { recursive: true, force: true });
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  return pack;
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/tools/audio/rebuild-runtime-pack.mjs')) {
  try {
    const pack = rebuildRuntimePack();
    console.log(`audio runtime pack rebuilt: ${Object.keys(pack.events).length} events, ${entriesOf(pack).length} event variants, exact orphan policy`);
  } catch (error) {
    console.error(`audio runtime pack rebuild failed:\n${error.message}`);
    process.exit(1);
  }
}
