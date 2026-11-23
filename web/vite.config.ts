import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { swManifest } from './src/sw/plugin';
import { appVersion } from './src/sw/version';

// The version people see (Settings, the update banner) and the service worker's cache key.
// APP_BUILD is set by the Pages workflow to its run number.
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
const APP_VERSION = appVersion(pkg.version, process.env.APP_BUILD);

// No React plugin: esbuild compiles JSX directly (fewer moving pieces).
// Relative base so the build works under any GitHub Pages sub-path.
export default defineConfig({
  base: './',
  esbuild: { jsx: 'automatic' },
  build: { outDir: '../dist', emptyOutDir: true },
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  plugins: [swManifest(APP_VERSION)],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
} as any);
