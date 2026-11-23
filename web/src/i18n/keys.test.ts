// Every t()/tr() key in the source has Chinese, with the same {values}; no two
// Chinese files disagree on a key; keys are literal strings.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZH, ZH_ENGINE, ZH_NAMES, ZH_PARTS } from './zh';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const files: string[] = [];
const walk = (d: string) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) { if (!/__fixtures__|[/\\]i18n[/\\]zh$|[/\\]dev$/.test(p)) walk(p); }
    else if (/\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n)) files.push(p);
  }
};
walk(SRC);

const unescape = (s: string, q: string) => s.replace(new RegExp(`\\\\${q}`, 'g'), q).replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
const keys = new Map<string, string>(); // key → first file
const dynamic: string[] = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const rel = relative(SRC, f);
  for (const m of src.matchAll(/\bt[r]?\(\s*'((?:[^'\\]|\\.)*)'/g)) if (!keys.has(unescape(m[1], "'"))) keys.set(unescape(m[1], "'"), rel);
  for (const m of src.matchAll(/\bt[r]?\(\s*"((?:[^"\\]|\\.)*)"/g)) if (!keys.has(unescape(m[1], '"'))) keys.set(unescape(m[1], '"'), rel);
  for (const m of src.matchAll(/\bt[r]?\(\s*`/g)) dynamic.push(`${rel}:${src.slice(0, m.index).split('\n').length}`);
}
const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');

describe('translations', () => {
  it('every key is a literal string', () => {
    expect(dynamic).toEqual([]);
  });
  it('every key has Chinese', () => {
    const missing = [...keys].filter(([k]) => !(k in ZH)).map(([k, f]) => `${f}: ${k}`);
    expect(missing).toEqual([]);
  });
  it('Chinese keeps every {value} of the English', () => {
    const all = { ...ZH, ...ZH_NAMES, ...ZH_ENGINE };
    const bad = Object.entries(all).filter(([en, zh]) => vars(en) !== vars(zh)).map(([en, zh]) => `${en} → ${zh}`);
    expect(bad).toEqual([]);
  });
  it('no two Chinese files disagree', () => {
    const seen = new Map<string, [string, string]>();
    const clash: string[] = [];
    for (const [part, dict] of Object.entries(ZH_PARTS)) for (const [k, v] of Object.entries(dict)) {
      const prev = seen.get(k);
      if (prev && prev[1] !== v) clash.push(`${k}: ${prev[0]} "${prev[1]}" vs ${part} "${v}"`);
      else seen.set(k, [part, v]);
    }
    expect(clash).toEqual([]);
  });
  it('no Chinese entry is left empty or in English', () => {
    const all = { ...ZH, ...ZH_NAMES, ...ZH_ENGINE };
    const bad = Object.entries(all).filter(([, zh]) => !zh.trim() || !/[㐀-鿿]/.test(zh) && /[a-z]{3,}/.test(zh.replace(/\{\w+\}/g, ''))).map(([en]) => en);
    expect(bad).toEqual([]);
  });
});
