#!/usr/bin/env node
// Fails an install started with anything other than pnpm.
//
// This project is pnpm-only. The guard exists because the two package managers
// silently coexisted once: a pnpm-installed `node_modules` sat next to a tracked
// `package-lock.json`, the tree ended up with no `node_modules/.bin`, and every
// binary the scripts call (`tsc`, `vite`, `electron`, `electron-builder`) became
// unresolvable. The build failed on `tsc` with a shell "command not found",
// which points nowhere near the real cause.
//
// Runs as `preinstall`, so it fires before any tree is written. Deliberately
// dependency-free (no `npx only-allow`) so a fresh clone never needs the network
// just to be told which manager to use.

const agent = process.env.npm_config_user_agent ?? '';

// No user agent means this was not started by a package manager at all (a direct
// `node tools/check-package-manager.mjs`, or an installer that does not set it).
// Nothing to judge, so let it through rather than block an unknown-but-valid setup.
if (agent && !agent.startsWith('pnpm/')) {
  const used = agent.split(' ')[0] || 'this package manager';
  console.error(
    `\nThis project uses pnpm. Refusing to install with ${used}.\n\n` +
      '  pnpm install\n\n' +
      'Mixing managers leaves node_modules without a .bin directory and desyncs\n' +
      'the lockfile, which surfaces later as "tsc is not recognized" during build.\n' +
      'If node_modules is already mixed, delete it and run pnpm install again.\n',
  );
  process.exit(1);
}
