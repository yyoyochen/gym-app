#!/usr/bin/env node
// Fails if a production bundle contains preview-only code: the dev hook
// (window.__gymbro, web/src/dev/previewHook.ts), the kit gallery (#/kit) or the
// private Strength Level table loader (strength-level.json). Run after `vite build web`.
// Usage: node tools/check-bundle.mjs [distDir]   (default: dist)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'dist';
const hits = [];
const walk = d => {
  for (const name of readdirSync(d)) {
    const p = join(d, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|html|mjs)$/.test(name) && /__gymbro|installPreviewHook|kit-gallery|strength-level/.test(readFileSync(p, 'utf8'))) hits.push(p);
  }
};
walk(dir);
if (hits.length) {
  console.error('Bundle check FAILED: preview-only code (dev hook, kit gallery or the private strength-level table) is in a production build:\n  ' + hits.join('\n  '));
  process.exit(1);
}

// The dither glyph font must work offline: its @font-face src is either inlined
// into the (precached) CSS as a data: URI, or a file listed in sw.js's precache.
const files = [];
const list = d => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? list(p) : files.push(p); } };
list(dir);
const css = files.filter(f => f.endsWith('.css')).map(f => readFileSync(f, 'utf8')).join('\n');
const face = /@font-face\s*\{[^}]*GymBro Glyph[^}]*\}/.exec(css)?.[0] ?? '';
const src = /url\(\s*["']?([^"')]+)/.exec(face)?.[1] ?? '';
const sw = files.find(f => f.endsWith('sw.js'));
const precached = src && !src.startsWith('data:') && sw && readFileSync(sw, 'utf8').includes(src.replace(/^\/|^\.\//, ''));
if (!face || !(src.startsWith('data:font/woff2') || precached)) {
  console.error(`Bundle check FAILED: the GymBro Glyph font is not available offline (${face ? 'src not precached: ' + src.slice(0, 60) : 'no @font-face in the built CSS'}).`);
  process.exit(1);
}
console.log(`Bundle check passed: no dev hook in ${dir}; GymBro Glyph is offline-ready.`);
