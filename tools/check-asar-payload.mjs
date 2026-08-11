// Fails packaging when anything that is not part of the shipping game lands
// inside app.asar.
//
// This runs as electron-builder's `afterPack` hook, so it aborts BEFORE the
// NSIS installer and the portable exe are written -- the same "the build dies
// rather than shipping garbage" contract as tools/check-release-flags.mjs.
//
// Two classes of garbage have actually reached players' machines here:
//   1. Repo paperwork and tooling (CLAUDE.md, AGENTS.md, docs/, node_modules).
//   2. Art and audio that no shipping code path ever loads -- superseded
//      reference sheets, retired sound variants, rejected fixture packs.
//
// The second class cannot be caught by a path whitelist, because the files sit
// in public/ next to the ones the game does use. So this reads the asar back
// and asks the only question that matters: does any SHIPPED file mention this
// asset? The haystack is the shipped bundle, stylesheet, HTML and JSON
// manifests -- not the repo -- so a generator script under tools/ that merely
// writes an asset does not keep it alive.
//
// When it fails, the fix is always one of two things: wire the asset up, or add
// a `!` negation pattern to `build.files` in package.json. There is deliberately
// no allowlist in this file, so package.json stays the single source of truth
// for what ships.
//
// Usage: automatic via `pnpm package`. Standalone:
//   node tools/check-asar-payload.mjs <path-to-app.asar>
import asar from '@electron/asar';
import { existsSync } from 'node:fs';
import { basename, extname, join, posix, sep } from 'node:path';

/** Directories and files allowed at the top level of the archive. */
const ALLOWED_ROOTS = new Set(['dist', 'electron', 'package.json']);

/** Map 2-only Hazard Marshal reference sheets. The Demo shares the full-game
 * registry source, so its compiled code can still name these paths; its
 * package must never retain the images themselves. */
const DEMO_FORBIDDEN_ASSET_PATHS = new Set([
  'dist/assets/2d/ref-hazard-marshal-front-v1.png',
  'dist/assets/2d/ref-hazard-marshal-side-v1.png',
  'dist/assets/2d/ref-hazard-marshal-back-v1.png',
]);

/** Binary payload that has to justify its presence by being referenced. */
const ASSET_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico',
  '.wav', '.mp3', '.ogg', '.flac', '.m4a',
  '.ttf', '.otf', '.woff', '.woff2',
  '.glb', '.gltf', '.fbx', '.obj',
]);

/** Shipped text the game can reference an asset from. */
const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.css', '.html', '.json']);

/** Paperwork that must never ship, listed so the error names the real files. */
const PAPERWORK_EXTENSIONS = new Set(['.md', '.markdown', '.txt']);

const toPosix = (entry) => entry.replace(/\\/g, '/').replace(/^\/+/, '');

function readEntries(archive) {
  const files = [];
  for (const raw of asar.listPackage(archive, { isPack: false })) {
    const path = toPosix(raw);
    if (!path) continue;
    // listPackage emits directories too; a directory has no extension and no
    // stat entry, so ask the filesystem index instead of guessing from the name.
    let size = null;
    try {
      size = asar.statFile(archive, raw.replace(/^[\\/]+/, ''), false)?.size ?? null;
    } catch {
      continue; // not a file
    }
    if (size === null) continue;
    files.push({ path, size });
  }
  return files;
}

function readText(archive, path) {
  try {
    return asar.extractFile(archive, path.split('/').join(sep)).toString('utf8');
  } catch {
    return '';
  }
}

export function inspectAsar(archive) {
  const files = readEntries(archive);
  const problems = [];

  const paperwork = files.filter((f) => PAPERWORK_EXTENSIONS.has(extname(f.path).toLowerCase()));
  if (paperwork.length > 0) {
    problems.push({
      rule: 'paperwork',
      detail: 'Repo paperwork must never ship (CLAUDE.md, AGENTS.md, READMEs, notes).',
      files: paperwork,
    });
  }

  const vendored = files.filter((f) => f.path.split('/').includes('node_modules'));
  if (vendored.length > 0) {
    problems.push({
      rule: 'node_modules',
      detail: 'Vite bundles every runtime dependency into dist/. A second copy under '
        + 'node_modules/ is dead weight; exclude it with a `!node_modules/<pkg>/**` pattern.',
      files: vendored,
    });
  }

  const strays = files.filter((f) => !ALLOWED_ROOTS.has(f.path.split('/')[0]));
  if (strays.length > 0) {
    problems.push({
      rule: 'unexpected-root',
      detail: `Only ${[...ALLOWED_ROOTS].join(', ')} may appear at the top level of the archive.`,
      files: strays,
    });
  }

  const demoBoundaryLeaks = files.filter((file) => DEMO_FORBIDDEN_ASSET_PATHS.has(file.path));
  if (demoBoundaryLeaks.length > 0) {
    problems.push({
      rule: 'demo-content-boundary',
      detail: 'Map 2-only Hazard Marshal reference sheets must never ship in the Map 1 Demo.',
      files: demoBoundaryLeaks,
    });
  }

  // Everything the shipped app can read a path out of.
  let haystack = '';
  for (const file of files) {
    if (TEXT_EXTENSIONS.has(extname(file.path).toLowerCase())) haystack += readText(archive, file.path);
  }

  const unreferenced = files.filter((file) => {
    if (!ASSET_EXTENSIONS.has(extname(file.path).toLowerCase())) return false;
    return !haystack.includes(basename(file.path));
  });
  if (unreferenced.length > 0) {
    problems.push({
      rule: 'unreferenced-asset',
      detail: 'No shipped script, stylesheet or manifest names these files, so the game '
        + 'cannot load them. Wire them up, or keep them out of the build with a `!` pattern '
        + 'in build.files (they can stay in public/ for the tools that generate them).',
      files: unreferenced,
    });
  }

  const missing = findDanglingReferences(files, haystack)
    .filter((file) => !DEMO_FORBIDDEN_ASSET_PATHS.has(file.path));
  if (missing.length > 0) {
    problems.push({
      rule: 'dangling-reference',
      detail: 'Shipped code asks for these paths but they are NOT in the archive, so they '
        + 'will 404 at runtime. The dev server reads straight from public/, so this breaks '
        + 'ONLY in the packaged build. Almost always a `!` pattern in build.files that now '
        + 'excludes an asset the game started using again -- drop that pattern.',
      files: missing,
    });
  }

  return { files, problems };
}

/** The reverse of `unreferenced-asset`: a path the shipped code loads that no
 *  longer ships. The asset roots are derived from the archive itself (assets/,
 *  fonts/, ...) instead of being hardcoded, so a new top-level asset directory
 *  is covered the day it appears.
 *
 *  Only asset extensions are scanned on purpose. A missing JSON manifest breaks
 *  the game loudly on the first run; a missing PNG is the silent case worth
 *  guarding. It also keeps AUDIO.paths.finalManifest -- dead config naming a
 *  deliberately unshipped manifest -- from raising a false alarm. */
function findDanglingReferences(files, haystack) {
  const shipped = new Set(files.map((f) => f.path));
  const roots = new Set();
  for (const file of files) {
    const [top, second] = file.path.split('/');
    if (top === 'dist' && second && second.includes('.') === false) roots.add(second);
  }
  if (roots.size === 0) return [];

  // Longest extension first, plus a trailing boundary: otherwise `woff` matches
  // the prefix of a real `press-start-2p.woff2` and invents a missing file.
  const extensions = [...ASSET_EXTENSIONS]
    .map((e) => e.slice(1))
    .sort((a, b) => b.length - a.length)
    .join('|');
  const pattern = new RegExp(
    `(?:${[...roots].join('|')})/[A-Za-z0-9_\\-./]+?\\.(?:${extensions})(?![A-Za-z0-9])`,
    'gi',
  );

  const missing = new Map();
  for (const match of haystack.matchAll(pattern)) {
    const path = `dist/${match[0].replace(/^\/+/, '')}`;
    if (!shipped.has(path)) missing.set(path, { path, size: 0 });
  }
  return [...missing.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function report({ files, problems }, archive) {
  const total = files.reduce((sum, f) => sum + f.size, 0);
  const kb = (bytes) => `${(bytes / 1024).toFixed(0)}K`;
  if (problems.length === 0) {
    console.log(`asar payload OK - ${files.length} files, ${(total / 1024 / 1024).toFixed(1)} MB`);
    return true;
  }
  const wasted = problems.reduce((sum, p) => sum + p.files.reduce((s, f) => s + f.size, 0), 0);
  console.error(`\nasar payload check FAILED for ${archive}`);
  console.error(`${problems.length} rule(s) broken, ${(wasted / 1024 / 1024).toFixed(2)} MB of payload that should not ship.\n`);
  for (const problem of problems) {
    console.error(`  [${problem.rule}] ${problem.files.length} file(s)`);
    console.error(`  ${problem.detail}`);
    for (const file of problem.files.slice(0, 25)) console.error(`    ${kb(file.size).padStart(7)}  ${file.path}`);
    if (problem.files.length > 25) console.error(`    ... and ${problem.files.length - 25} more`);
    console.error('');
  }
  return false;
}

/** electron-builder afterPack hook. Named export wins over `default`. */
export async function afterPack(context) {
  const archive = join(context.appOutDir, 'resources', 'app.asar');
  if (!existsSync(archive)) {
    throw new Error(`asar payload check: no archive at ${archive} (asar packing disabled?)`);
  }
  if (!report(inspectAsar(archive), archive)) {
    throw new Error('asar payload check failed - see the rules above. Packaging aborted.');
  }
}

export default afterPack;

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(posix.basename(process.argv[1].replace(/\\/g, '/')));
if (invokedDirectly) {
  const archive = process.argv[2];
  if (!archive || !existsSync(archive)) {
    console.error('Usage: node tools/check-asar-payload.mjs <path-to-app.asar>');
    process.exit(2);
  }
  process.exit(report(inspectAsar(archive), archive) ? 0 : 1);
}
