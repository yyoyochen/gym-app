import type { Plugin } from 'vite';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Every file under `dir`, as forward-slash paths relative to it. */
function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(dir, p).split('\\').join('/'));
    }
  };
  try { walk(dir); } catch { /* no public dir */ }
  return out;
}

/** Files the worker fetches and keeps on first use instead of precaching: the
 *  Chinese fonts, which only 中文 mode asks for (i18n/fonts.ts warms them). */
export const LAZY_ASSET = String.raw`/zh-(sans|pixel)-[^/]*\.woff2$`;

/** What the worker precaches: the app shell, the bundle and public/, minus lazy files. */
export function precacheList(built: string[], publicFiles: string[]): string[] {
  const lazy = new RegExp(LAZY_ASSET);
  return [...new Set(['./', ...built, ...publicFiles])].filter(f => !lazy.test(`/${f}`));
}

// Emits sw.js at build time with the full list of built files baked in, so
// the service worker can precache the whole app for offline use: the bundle
// plus everything in public/ (benchmark tables, manifest, icons). Replaces
// vite-plugin-pwa/Workbox (see docs/DECISIONS.md).
export function swManifest(appVersion: string): Plugin {
  let publicDir = '';
  return {
    name: 'gymbro-sw',
    apply: 'build',
    configResolved(config) { publicDir = config.publicDir; },
    generateBundle(_opts, bundle) {
      const built = Object.keys(bundle).filter(f => !f.endsWith('.map'));
      const files = precacheList(built, listFiles(publicDir));
      // The app version names the cache; the build time keeps two builds of one version apart.
      const version = `${appVersion}-${Date.now().toString(36)}`;
      const template = readFileSync(fileURLToPath(new URL('./sw-template.js', import.meta.url)), 'utf8');
      const source = template.replace('__PRECACHE__', JSON.stringify(files)).replace('__VERSION__', version).replace('__APP_VERSION__', appVersion).replace('__LAZY__', JSON.stringify(LAZY_ASSET));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}
