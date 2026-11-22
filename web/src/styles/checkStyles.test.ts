import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkCss, checkTsx } from '../../../tools/check-styles.mjs';

const fx = (f: string) => readFileSync(resolve(__dirname, '__fixtures__', f), 'utf8');
const rules = (r: { violations: { rule: string }[] }) => r.violations.map(v => v.rule).sort();

describe('style check', () => {
  it('flags each rule once', () => {
    expect(rules(checkCss(fx('bad.css'), 'bad.css'))).toEqual(
      ['border', 'caps', 'colour', 'font', 'radius', 'shadow', 'spacing', 'tracking']);
  });

  it('passes token values', () => {
    const css = `.ok {
  font: var(--text-value);
  letter-spacing: var(--track-value);
  padding: var(--space-2) var(--gutter);
  gap: calc(var(--space-4) + env(safe-area-inset-bottom));
  border-bottom: var(--hair);
  outline: var(--rule-w) solid var(--ink);
  margin: 0;
}
.inh { font: inherit; }`;
    expect(checkCss(css, 'ok.css').violations).toEqual([]);
  });

  it('ds-allow moves a line to allowed', () => {
    const r = checkCss('.p { box-shadow: -1px 0 0 var(--rule); /* ds-allow: page edge during push */ }', 'p.css');
    expect(r.violations).toEqual([]);
    expect(r.allowed[0].reason).toBe('page edge during push');
  });

  it('ds-allow needs a reason', () => {
    const r = checkCss('.p { box-shadow: -1px 0 0 var(--rule); /* ds-allow: */ }', 'p.css');
    expect(rules(r)).toEqual(['shadow']);
  });

  it('tsx inline', () => {
    const r = checkTsx(fx('bad.tsx.txt'), 'bad.tsx');
    expect(r.violations.map(v => [v.rule, v.line])).toEqual([['inline', 3], ['inline', 4]]);
    expect(r.allowed).toHaveLength(1);
    expect(r.allowed[0].reason).toBe('test');
  });
});
