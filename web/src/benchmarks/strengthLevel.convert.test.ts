import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// The converter is a plain Node tool; its pure function is tested here.
import { convertStrengthLevel } from '../../../tools/standards/strength-level.mjs';

const csv = readFileSync(new URL('./__fixtures__/strength-level-sample.csv', import.meta.url), 'utf8');

describe('Strength Level converter', () => {
  const out = convertStrengthLevel(csv);
  it('maps Squat to back_squat with bw rows ascending', () => {
    expect(out.tables.back_squat.bw).toEqual([60, 70, 80]);
    expect(out.tables.back_squat.male[0]).toEqual([40, 60, 80, 100, 120]);
    expect(out.tables.bench_press.bw).toEqual([60, 80]);
  });
  it('skips rows that are not numbers', () => {
    expect(Object.keys(out.tables)).not.toContain('pull_up');
    expect(JSON.stringify(out.tables)).not.toContain('Pull');
  });
  it('lists names it cannot map', () => {
    expect(out.unmapped).toEqual(['Zercher Squat']);
  });
});
