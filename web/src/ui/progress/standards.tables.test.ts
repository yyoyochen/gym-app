import { describe, expect, it } from 'vitest';
import type { GymStandardsData } from '../../benchmarks/gymStandards';
import { attachTables } from './standards';

const base = { v: 1, loaded: [], bodyweight: [] } as unknown as GymStandardsData;

describe('attachTables (preview-only private table)', () => {
  it('adds the tables from a well-formed file', () => {
    const t = { bench_press: { bw: [60], male: [[1, 2, 3, 4, 5]] } };
    expect(attachTables(base, { source: 'x', tables: t }).tables).toEqual(t);
  });
  it('leaves the data alone for anything else', () => {
    for (const bad of [null, undefined, 'x', {}, { tables: 3 }, { tables: { a: { bw: [1] } } }]) {
      expect(attachTables(base, bad)).toBe(base);
    }
  });
});
