import type { Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Emits sw.js at build time with the full list of built files baked in, so
// the service worker can precache the whole app for offline use. Replaces
// vite-plugin-pwa/Workbox (see docs/DECISIONS.md).
export function swManifest(): Plugin {
  return {
    name: 'gymbro-sw',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle).filter(f => !f.endsWith('.map'));
      const version = Date.now().toString(36);
      const template = readFileSync(fileURLToPath(new URL('./sw-template.js', import.meta.url)), 'utf8');
      const source = template
        .replace('__PRECACHE__', JSON.stringify(['./', ...files, 'manifest.webmanifest', 'icon.svg']))
        .replace('__VERSION__', version);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}
