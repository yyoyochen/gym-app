// The Chinese fonts are cut to the characters the app's own text uses
// (tools/fonts/build-zh-fonts.py). A new character in a translation must be in
// that cut, or it would render in a different font.
import { expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const CJK = /[　-〿㐀-䶿一-鿿豈-﫿︰-﹏＀-￯]/g;

it('every Chinese character in the source is in the font cut (else run tools/fonts/build-zh-fonts.py)', () => {
  const used = new Set<string>();
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(n) && !/\.test\./.test(n)) for (const c of readFileSync(p, 'utf8').match(CJK) ?? []) used.add(c);
    }
  };
  walk(SRC);
  const cut = new Set(readFileSync(join(SRC, 'styles/fonts/zh-chars.txt'), 'utf8').trim());
  expect([...used].filter(c => !cut.has(c)).join('')).toBe('');
});
