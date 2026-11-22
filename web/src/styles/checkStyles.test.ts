import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkCss, checkStyles, checkTsx } from '../../../tools/check-styles.mjs';

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

  it('uppercase on a non-caps role is a caps violation', () => {
    const r = checkCss('.x { font: var(--text-mono); letter-spacing: var(--track-mono); text-transform: uppercase; }', 'x.css');
    expect(rules(r)).toEqual(['caps']);
  });

  it('custom properties cannot smuggle raw values past the check', () => {
    expect(rules(checkCss('.a { --space-odd: 7px; }', 'a.css'))).toEqual(['token']);
    expect(rules(checkCss('.a { --text-mine: 900 21px/1 serif; }', 'a.css'))).toEqual(['token']);
    expect(rules(checkCss('.a { --c: #f00; }', 'a.css'))).toEqual(['colour']);
    expect(checkCss('.a { --sqheat-days: 30px; }', 'a.css').violations).toEqual([]);
  });

  it('border and outline accept only line tokens', () => {
    expect(rules(checkCss('.a { border-top: var(--anything) solid var(--ink); }', 'a.css'))).toEqual(['border']);
    expect(rules(checkCss('.a { outline: calc(var(--rule-w) * 5) solid var(--ink); }', 'a.css'))).toEqual(['border']);
    expect(checkCss('.a { outline: var(--focus-w) solid var(--accent); border-bottom: var(--hair); }', 'a.css').violations).toEqual([]);
  });

  it('scans nested rule blocks', () => {
    // The outer block's own declarations, before and after a nested block, must be scanned too.
    expect(rules(checkCss('.a { padding: 3px; &:hover { color: var(--ink); } }', 'a.css'))).toEqual(['spacing']);
    expect(rules(checkCss('.a { &:hover { color: var(--ink); } margin: 5px; }', 'a.css'))).toEqual(['spacing']);
    expect(rules(checkCss('@media (min-width: 440px) { .a { gap: 7px; } }', 'a.css'))).toEqual(['spacing']);
  });

  it('spacing calc may only negate, not multiply or divide', () => {
    expect(rules(checkCss('.a { padding: calc(var(--space-half) * 3); }', 'a.css'))).toEqual(['spacing']);
    expect(rules(checkCss('.a { gap: calc(var(--space-4) / 3); }', 'a.css'))).toEqual(['spacing']);
    expect(checkCss('.a { margin: calc(-1 * var(--gutter)) 0; }', 'a.css').violations).toEqual([]);
  });

  it('font weight and family are tokens, and a role block cannot override family', () => {
    expect(rules(checkCss('.a { font-weight: var(--font-other); }', 'a.css'))).toEqual(['font']);
    expect(checkCss('.a { font-weight: var(--font-strong); }', 'a.css').violations).toEqual([]);
    expect(rules(checkCss('.a { font: var(--text-value); font-family: var(--font-mono); }', 'a.css'))).toEqual(['font']);
    expect(checkCss('.a { font-family: var(--font-mono); }', 'a.css').violations).toEqual([]);
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

describe('real styles', () => {
  const src = resolve(__dirname, '..');

  it('real styles: no type violations', () => {
    const v = checkStyles(src).violations.filter(v => ['font', 'tracking', 'caps'].includes(v.rule));
    expect(v.map(x => `${x.file}:${x.line} ${x.rule} ${x.text}`)).toEqual([]);
  });

  it('real styles: zero violations, few allowed', () => {
    const r = checkStyles(src);
    expect(r.violations.map(x => `${x.file}:${x.line} ${x.rule} ${x.text}`)).toEqual([]);
    expect(r.allowed.length).toBeLessThanOrEqual(6);
    for (const a of r.allowed) expect(a.reason.trim(), `${a.file}:${a.line}`).not.toBe('');
  });
});
