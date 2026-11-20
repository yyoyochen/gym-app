import { defineConfig } from 'vite';
import { swManifest } from './src/sw/plugin';

// No React plugin: esbuild compiles JSX directly (fewer moving pieces).
// Relative base so the build works under any GitHub Pages sub-path.
export default defineConfig({
  base: './',
  esbuild: { jsx: 'automatic' },
  build: { outDir: '../dist', emptyOutDir: true },
  plugins: [swManifest()],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
} as any);
