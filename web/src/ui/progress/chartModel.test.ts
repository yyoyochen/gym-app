import { describe, expect, it } from 'vitest';
import { chartScale, fillWeeks, gapText, stepRuns, ticksWithin } from './chartModel';

const E1 = [126.7, 126.7, 140, 144.7, 151.7, 154, 151.7, 156];
const names = (t: { name: string }[]) => t.map(x => x.name);

describe('ticksWithin', () => {
  it('picks 3–6 nice ticks inside the range', () => {
    expect(ticksWithin(114.03, 187.2)).toEqual([120, 140, 160, 180]);
    expect(ticksWithin(0, 4668)).toEqual([0, 1000, 2000, 3000, 4000]);
    for (const [lo, hi] of [[0, 1], [3, 7.5], [90, 120], [114, 999]] as const) {
      const t = ticksWithin(lo, hi);
      expect(t.length).toBeGreaterThanOrEqual(3);
      expect(t.length).toBeLessThanOrEqual(6);
      for (const v of t) { expect(v).toBeGreaterThanOrEqual(lo); expect(v).toBeLessThanOrEqual(hi); }
    }
  });
  it('a collapsed range gives one tick', () => {
    expect(ticksWithin(5, 5)).toEqual([5]);
  });
});

describe('chartScale', () => {
  it('ceiling 120% of best, floor 90% of lowest; far target pinned, near target in place', () => {
    const s = chartScale({ values: E1, targets: [{ name: 'Your target', value: 165 }, { name: 'Advanced', value: 191.5 }] });
    expect(s.hi).toBeCloseTo(187.2, 1);
    expect(s.lo).toBeCloseTo(114.03, 2);
    expect(names(s.inRange)).toEqual(['Your target']);
    expect(names(s.pinned)).toEqual(['Advanced']);
  });
  it('a target inside the label room or at the ceiling is pinned; one below the floor is dropped', () => {
    const s = chartScale({ values: E1, targets: [{ name: 'Near', value: 180 }, { name: 'Ceil', value: 187.2 }, { name: 'Low', value: 110 }] });
    expect(names(s.pinned)).toEqual(['Near', 'Ceil']);
    expect(s.inRange).toEqual([]);
  });
  it('pinned targets stack nearest first', () => {
    const s = chartScale({ values: E1, targets: [{ name: 'A', value: 200 }, { name: 'B', value: 190 }] });
    expect(names(s.pinned)).toEqual(['B', 'A']);
  });
  it('weekly volume starts at zero', () => {
    const s = chartScale({ values: [3200, 2220, 3850, 3450, 2640, 3890, 3155], zeroBased: true, targets: [] });
    expect(s.lo).toBe(0);
    expect(s.hi).toBeCloseTo(4668, 0);
    expect(s.ticks).toEqual([0, 1000, 2000, 3000, 4000]);
    expect(s.pinned).toEqual([]);
  });
  it('negative values (assisted lifts) stay inside the plot', () => {
    const s = chartScale({ values: [-20, -10], targets: [] });
    expect(s.lo).toBeLessThan(-20);
    expect(s.hi).toBeGreaterThan(-10);
  });
  it('degenerate series never give NaN or a zero-height scale', () => {
    const empty = chartScale({ values: [], targets: [{ name: 'X', value: 10 }] });
    expect(empty.ticks).toEqual([]);
    expect(empty.inRange).toEqual([]);
    expect(empty.pinned).toEqual([]);
    const flat = chartScale({ values: [100, 100], targets: [] });
    expect(flat.hi).toBeGreaterThan(flat.lo);
    const zero = chartScale({ values: [0, 0], zeroBased: true, targets: [] });
    expect(zero.hi).toBeGreaterThan(0);
    for (const s of [empty, flat, zero]) for (const v of [s.lo, s.hi, ...s.ticks]) expect(Number.isNaN(v)).toBe(false);
  });
});

describe('stepRuns', () => {
  it('one run per pair; a long hold is dotted', () => {
    const r = stepRuns([{ date: '2026-04-11', value: 126.7 }, { date: '2026-09-20', value: 126.7 }, { date: '2026-09-25', value: 140 }]);
    expect(r).toEqual([
      { from: '2026-04-11', to: '2026-09-20', value: 126.7, nextValue: 126.7, dotted: true },
      { from: '2026-09-20', to: '2026-09-25', value: 126.7, nextValue: 140, dotted: false },
    ]);
  });
  it('42 days is not dotted, 43 is', () => {
    expect(stepRuns([{ date: '2026-01-01', value: 1 }, { date: '2026-02-12', value: 2 }])[0].dotted).toBe(false);
    expect(stepRuns([{ date: '2026-01-01', value: 1 }, { date: '2026-02-13', value: 2 }])[0].dotted).toBe(true);
  });
  it('one point has no runs', () => {
    expect(stepRuns([{ date: '2026-01-01', value: 1 }])).toEqual([]);
  });
});

describe('fillWeeks', () => {
  it('fills missing Mondays with zero', () => {
    const f = fillWeeks([{ date: '2026-09-14', value: 3200 }, { date: '2026-10-12', value: 3850 }]);
    expect(f.map(p => p.date)).toEqual(['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12']);
    expect(f.map(p => p.value)).toEqual([3200, 0, 0, 0, 3850]);
  });
});

describe('gapText', () => {
  it('signed gap to one decimal, or reached', () => {
    expect(gapText(191.5, 156)).toBe('+35.5');
    expect(gapText(165, 156)).toBe('+9');
    expect(gapText(156, 156)).toBe('reached');
    expect(gapText(140, 156)).toBe('reached');
  });
});

