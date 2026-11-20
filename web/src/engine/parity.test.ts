// Parity with the retired Python engine, on synthetic fixtures generated from
// it (web/src/engine/__fixtures__/parity-*.json). The fixtures are now the
// reference; regenerate them only from the archived Python repo.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkCase, type ParityCase } from './port/harness';

const dir = new URL('./__fixtures__/', import.meta.url);
const files = readdirSync(dir).filter((f) => /^parity-.*\.json$/.test(f)).sort();

describe('parity with the Python engine', () => {
  it('has fixtures', () => expect(files.length).toBeGreaterThanOrEqual(6));
  it('the checker catches a one-character difference', () => {
    const c: ParityCase = { fn: 'criteria', name: 'self-check', input: { target: {
      lift: 'L', weight: 100, target_reps: 5, added_weight: false, prev_top: [], is_new: true,
      rationale: '', target_sets: 5, mode: 'strength' } },
      output: { criterion: 'Log your sets at 100kg — this session sets the baseline!', why: { rule: 'baseline', principle: '' } } };
    expect(checkCase(c).length).toBe(2);
  });
  for (const f of files) {
    const cases: ParityCase[] = JSON.parse(readFileSync(new URL(f, dir), 'utf8')).cases;
    const byFn = new Map<string, ParityCase[]>();
    for (const c of cases) byFn.set(c.fn, [...(byFn.get(c.fn) ?? []), c]);
    for (const [fn, list] of byFn) {
      const changed = list.filter((c) => c.expectChange).length;
      it(`${f} · ${fn} (${list.length} cases, ${changed} expectChange)`, () => {
        const errs = list.flatMap((c) => checkCase(c));
        expect(errs.slice(0, 5).join('\n'), `${errs.length} mismatches`).toBe('');
      });
    }
  }
});
