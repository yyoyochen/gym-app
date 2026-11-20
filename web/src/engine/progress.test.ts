import { describe, expect, it } from 'vitest';
import { exercise, set } from './__fixtures__/build';
import {
  bestRecentE1rm, e1rm, heaviestSingle, liftSeries, pace, prs, recentRate, repPRs, weakFlags, weeklySetsPerMuscle,
  workingSets, type DatedSets,
} from './progress';
import { readinessFromAnswers, autoregulate, legacyReadiness } from './readiness';
import type { LegacyTarget } from './port/types';

const bench = exercise();
const day = (date: string, ...sets: ReturnType<typeof set>[]): DatedSets => ({ date, sets });

describe('e1RM formulas', () => {
  it('a single is its own max', () => {
    for (const f of ['epley', 'brzycki', 'lander', 'oconner'] as const) expect(e1rm(100, 1, f)).toBe(100);
  });
  it('matches the published formulas', () => {
    expect(e1rm(100, 5)).toBeCloseTo(116.667, 3);
    expect(e1rm(100, 5, 'brzycki')).toBeCloseTo(112.5, 3);
    expect(e1rm(100, 5, 'lander')).toBeCloseTo(113.709, 3);
    expect(e1rm(100, 5, 'oconner')).toBeCloseTo(112.5, 3);
  });
  it('falls back to Epley past the Brzycki/Lander pole', () => {
    expect(e1rm(20, 40, 'brzycki')).toBe(e1rm(20, 40));
    expect(e1rm(20, 40, 'lander')).toBe(e1rm(20, 40));
  });
});

describe('series, PRs, best recent', () => {
  const hist = [
    day('2026-09-01', set(40, 5, { kind: 'warmup' }), set(80, 8), set(80, 7)),
    day('2026-10-01', set(85, 6), set(85, 6)),
    day('2026-11-01', set(82.5, 8)),
  ];
  it('one point per session, warm-ups excluded, formula switchable', () => {
    const s = liftSeries(bench, hist);
    expect(s.map((p) => p.top_weight)).toEqual([80, 85, 82.5]);
    expect(s[0].e1rm).toBeCloseTo(80 * (1 + 8 / 30), 9);
    expect(liftSeries(bench, hist, { formula: 'brzycki' })[1].e1rm).toBeCloseTo((85 * 36) / 31, 9);
  });
  it('PRs (ported rule) and best recent e1RM within the window', () => {
    const s = liftSeries(bench, hist);
    expect(prs(s).map((p) => p.kind)).toEqual(['top_weight', 'top_weight', 'e1rm']);
    expect(bestRecentE1rm(s, '2026-11-21', 30)).toBeCloseTo(82.5 * (1 + 8 / 30), 9);
    expect(bestRecentE1rm(s, '2026-11-21', 5)).toBeNull();
  });
  it('rep PRs and heaviest single ignore failed sets and warm-ups', () => {
    const h = [...hist, day('2026-11-10', set(90, 1, { failed: true }), set(87.5, 1))];
    expect(repPRs(bench, h)).toEqual([
      { weight: 80, reps: 8, date: '2026-09-01' }, { weight: 82.5, reps: 8, date: '2026-11-01' },
      { weight: 85, reps: 6, date: '2026-10-01' }, { weight: 87.5, reps: 1, date: '2026-11-10' }]);
    expect(heaviestSingle(bench, h)).toEqual({ weight: 87.5, date: '2026-11-10' });
    expect(workingSets([set(1, 1, { kind: 'warmup' })])).toEqual([]);
  });
});

describe('weekly sets per muscle', () => {
  it('splits multi-muscle lifts and averages over training weeks; flags weak points', () => {
    const exs = { bench: exercise(), dips: exercise({ id: 'dips', muscles: ['chest', 'triceps'] }) };
    const h = [
      day('2026-11-16', set(80, 8), set(80, 8), set(0, 10, { exerciseId: 'dips' }), set(40, 5, { kind: 'warmup' })),
      day('2026-11-23', set(80, 8)),
    ];
    const w = weeklySetsPerMuscle(h, exs);
    expect(w).toEqual({ chest: 1.75, triceps: 0.25 });
    expect(weakFlags(w, ['triceps', 'chest'], 1)).toEqual(['triceps']);
  });
});

describe('pace and feasibility', () => {
  it('needed vs actual with the user\'s own rate', () => {
    const p = pace({ current: 85, target: 90, type: 'reach', today: '2026-11-21', deadline: '2027-03-31', actualPerWeek: 0.5 });
    expect(p.weeksLeft).toBeCloseTo(130 / 7, 9);
    expect(p.neededPerWeek).toBeCloseTo(5 / (130 / 7), 9);
    expect(p.feasibility).toBe('comfortable');
  });
  it('ambitious when the trend covers at least half the gap; unlikely below that', () => {
    const base = { current: 85, target: 95, type: 'reach' as const, today: '2026-11-21', deadline: '2027-01-30' }; // 10 weeks
    expect(pace({ ...base, actualPerWeek: 0.6 }).feasibility).toBe('ambitious');
    expect(pace({ ...base, actualPerWeek: 0.2 }).feasibility).toBe('unlikely');
    expect(pace({ ...base, actualPerWeek: null })).toMatchObject({ feasibility: 'unlikely', assumedFlat: true });
  });
  it('a hold already met is comfortable unless it is slipping', () => {
    const hold = { current: 121, target: 120, type: 'hold' as const, today: '2026-11-21', deadline: '2026-12-31' };
    expect(pace({ ...hold, actualPerWeek: 0 })).toMatchObject({ feasibility: 'comfortable', neededPerWeek: 0 });
    expect(pace({ ...hold, actualPerWeek: -1 }).feasibility).toBe('ambitious');
  });
  it('past the deadline: met or not', () => {
    expect(pace({ current: 90, target: 90, type: 'reach', today: '2027-04-01', deadline: '2027-03-31', actualPerWeek: 0 }).feasibility).toBe('comfortable');
    expect(pace({ current: 80, target: 90, type: 'reach', today: '2027-04-01', deadline: '2027-03-31', actualPerWeek: 0 }).feasibility).toBe('unlikely');
  });
  it('recent rate is a least-squares slope in kg/week, needing 3 points over 14+ days', () => {
    const pts = [0, 7, 14, 21].map((d, i) => ({ date: `2026-11-${String(1 + d).padStart(2, '0')}`, top_weight: 0, best_set: [0, 0] as [number, number], e1rm: 100 + i }));
    expect(recentRate(pts, '2026-11-22')).toBeCloseTo(1, 9);
    expect(recentRate(pts.slice(0, 2), '2026-11-22')).toBeNull();
    expect(recentRate(pts.slice(0, 3).map((p, i) => ({ ...p, date: `2026-11-0${1 + i}` })), '2026-11-22')).toBeNull();
  });
});

describe('readiness', () => {
  it('any poor answer is red, any ok is amber', () => {
    expect(readinessFromAnswers({ sleep: 'good', soreness: 'good', stress: 'good' })).toBe('green');
    expect(readinessFromAnswers({ sleep: 'ok', soreness: 'good', stress: 'good' })).toBe('amber');
    expect(readinessFromAnswers({ sleep: 'poor', soreness: 'ok', stress: 'good' })).toBe('red');
  });
  it('red maps to the old tired day; amber and green change no load', () => {
    const t: LegacyTarget = { lift: 'L', weight: 100, target_reps: 5, added_weight: true, prev_top: [5, 5, 5, 5, 5], is_new: false,
      rationale: 'r', target_sets: 5, mode: 'strength' };
    expect(autoregulate(t, 'red', [5, 5], 2.5).weight).toBe(92.5);
    expect(autoregulate(t, 'amber', [5, 5], 2.5)).toBe(t);
    expect(legacyReadiness('red')).toBe('tired');
    expect(legacyReadiness('green')).toBe('normal');
  });
});
