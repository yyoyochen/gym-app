import { describe, expect, it } from 'vitest';
import { isNewBest, type BestSet } from './bests';

const w = (weight: number, reps: number, kind: BestSet['kind'] = 'working', failed?: boolean): BestSet => ({ weight, reps, kind, failed });

describe('isNewBest', () => {
  const prior = [w(100, 2, 'top'), w(75, 8, 'backoff'), w(105, 1, 'top')];

  it('heavier than anything before is a weight PR', () => {
    expect(isNewBest(w(107.5, 2, 'top'), prior)).toEqual({ kind: 'weight', value: 107.5, previous: 105 });
  });

  it('same weight, more reps → e1RM PR', () => {
    // best before: 75 × 8 → 95.0; 100 × 2 → 106.7; 105 × 1 → 105 → 106.7
    expect(isNewBest(w(100, 3, 'top'), prior)).toEqual({ kind: 'e1rm', value: 110, previous: 106.7 });
  });

  it('matching a previous best is not a PR', () => {
    expect(isNewBest(w(100, 2, 'top'), prior)).toBeNull();
    expect(isNewBest(w(105, 1, 'top'), prior)).toBeNull();
  });

  it('warm-ups, failed and 0-rep sets never count, either side', () => {
    expect(isNewBest(w(120, 3, 'warmup'), prior)).toBeNull();
    expect(isNewBest(w(120, 3, 'working', true), prior)).toBeNull();
    expect(isNewBest(w(120, 0), prior)).toBeNull();
    expect(isNewBest(w(106, 1), [...prior, w(140, 5, 'warmup'), w(130, 1, 'top', true)])).toEqual({ kind: 'weight', value: 106, previous: 105 });
  });

  it('the first log of a lift is never a PR', () => {
    expect(isNewBest(w(60, 8), [])).toBeNull();
    expect(isNewBest(w(60, 8), [w(40, 10, 'warmup')])).toBeNull();
  });

  it('tiny e1RM gains below the threshold are ignored', () => {
    expect(isNewBest(w(100, 2), [w(100, 2)], { minE1rmGainKg: 0.05 })).toBeNull();
    expect(isNewBest(w(97.5, 3), [w(100, 2)])).toEqual({ kind: 'e1rm', value: 107.3, previous: 106.7 }); // 107.25 vs 106.67
  });
});
