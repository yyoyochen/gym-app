import { describe, expect, it } from 'vitest';
import { flagText, liftFlag, flagRank } from './liftFlags';

const T = '2026-11-23';
const pts = (rows: [string, number][]) => rows.map(([date, e1rm]) => ({ date, e1rm }));
const dates = (s: { date: string }[]) => s.map(p => p.date);

describe('liftFlag: what needs a look', () => {
  it('a lift never trained says so', () => {
    expect(liftFlag([], [], T)).toEqual({ kind: 'never' });
  });
  it('not trained in 14+ days is missing', () => {
    const s = pts([['2026-10-20', 100], ['2026-10-27', 101], ['2026-11-03', 102], ['2026-11-09', 102]]);
    expect(liftFlag(s, dates(s), T)).toEqual({ kind: 'missing', days: 14 });
  });
  it('13 days is not missing for a weekly lift', () => {
    const s = pts([['2026-10-27', 100], ['2026-11-03', 101], ['2026-11-10', 102]]);
    expect(liftFlag(s, dates(s), T)).toBeNull();
  });
  it('a lift trained every 10 days waits twice that (20 days) before it counts as missing', () => {
    const s = pts([['2026-09-25', 100], ['2026-10-05', 101], ['2026-10-15', 102], ['2026-10-25', 103], ['2026-11-04', 104]]);
    expect(liftFlag(s, dates(s), T)).toBeNull(); // 19 days
    expect(liftFlag(s, dates(s), '2026-11-24')).toEqual({ kind: 'missing', days: 20 });
  });
  it('best e1RM of the last 4 weeks 2% or more under the 4 weeks before is down', () => {
    const s = pts([['2026-10-01', 90], ['2026-10-08', 90], ['2026-11-05', 88], ['2026-11-12', 87], ['2026-11-19', 86]]);
    expect(liftFlag(s, dates(s), T)).toEqual({ kind: 'down', pct: 2 });
  });
  it('a 1% dip is not down; no new best for 6 weeks makes it flat instead', () => {
    const s = pts([['2026-10-08', 100], ['2026-10-20', 100], ['2026-11-12', 99], ['2026-11-19', 99]]);
    expect(liftFlag(s, dates(s), T)).toEqual({ kind: 'flat', weeks: 6 });
  });
  it('a 90-day best 6+ weeks old with 3 sessions since is flat', () => {
    const s = pts([['2026-09-28', 116], ['2026-10-12', 112], ['2026-10-26', 116], ['2026-11-09', 113], ['2026-11-17', 115]]);
    expect(liftFlag(s, dates(s), T)).toEqual({ kind: 'flat', weeks: 8 });
  });
  it('a recent best is not flat', () => {
    const s = pts([['2026-09-28', 110], ['2026-10-12', 112], ['2026-10-26', 113], ['2026-11-09', 114], ['2026-11-17', 116]]);
    expect(liftFlag(s, dates(s), T)).toBeNull();
  });
  it('missing beats down and flat', () => {
    const s = pts([['2026-09-01', 120], ['2026-09-10', 100], ['2026-10-01', 100]]);
    expect(liftFlag(s, dates(s), T)?.kind).toBe('missing');
  });
});

describe('flag words and order', () => {
  it('reads plainly', () => {
    expect(flagText({ kind: 'never' })).toBe('Not trained yet');
    expect(flagText({ kind: 'missing', days: 14 })).toBe('Not trained in 14 days');
    expect(flagText({ kind: 'down', pct: 2 })).toBe('Down 2% in 4 wk');
    expect(flagText({ kind: 'flat', weeks: 8 })).toBe('Flat for 8 wk');
  });
  it('missing, then down, then flat, then never trained, then no flag', () => {
    const order = [null, { kind: 'never' } as const, { kind: 'flat', weeks: 6 } as const, { kind: 'down', pct: 3 } as const, { kind: 'missing', days: 20 } as const]
      .sort((a, b) => flagRank(a) - flagRank(b)).map(f => f?.kind ?? 'none');
    expect(order).toEqual(['missing', 'down', 'flat', 'never', 'none']);
  });
});
