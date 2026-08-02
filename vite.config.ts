import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { formatDisplayVersion } = createRequire(import.meta.url)('./tools/version-format.cjs') as {
  formatDisplayVersion: (machineVersion: string) => string;
};

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8')) as {
  version: string;
  voltswarmBuild: {
    flavor: string;
    allowedMaps: string[];
    fullGameSteamAppId: number;
    fullGameSteamUrl: string;
  };
};

// Production build excludes the editor: it is imported behind an
// `import.meta.env.DEV` guard so tree-shaking drops it from the Steam bundle.
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_DISPLAY_VERSION__: JSON.stringify(formatDisplayVersion(pkg.version)),
    __BUILD_FLAVOR__: JSON.stringify(pkg.voltswarmBuild.flavor),
    __ALLOWED_MAPS__: JSON.stringify(pkg.voltswarmBuild.allowedMaps),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    // No sourcemaps in shipped builds: they expose the full source and the
    // entire balance table through devtools.
    sourcemap: false,
  },
});
