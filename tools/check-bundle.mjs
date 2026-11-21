#!/usr/bin/env node
// Fails if a production bundle contains preview-only code: the dev hook
// (window.__gymbro, web/src/dev/previewHook.ts) or the kit gallery (#/kit). Run after `vite build web`.
// Usage: node tools/check-bundle.mjs [distDir]   (default: dist)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'dist';
const hits = [];
const walk = d => {
  for (const name of readdirSync(d)) {
    const p = join(d, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|html|mjs)$/.test(name) && /__gymbro|installPreviewHook|kit-gallery/.test(readFileSync(p, 'utf8'))) hits.push(p);
  }
};
walk(dir);
if (hits.length) {
  console.error('Bundle check FAILED: the preview dev hook is in a production build:\n  ' + hits.join('\n  '));
  process.exit(1);
}
console.log(`Bundle check passed: no dev hook in ${dir}.`);
