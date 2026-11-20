// The intentional behaviour changes vs the Python engine. Each test first
// shows the bug in the faithful port ({ faithful: true }), then the fix.
import { describe, expect, it } from 'vitest';
import { exercise, session, set, slot } from './__fixtures__/build';
import { grade, prescribe } from './models';
import { sessionSeries } from './port/analysis';
import { successCriteria } from './port/criteria';
import { scoreLift } from './port/scoring';
import { attemptHistory, workedLoad } from './port/service';
import { strengthTarget } from './port/strength';
import type { LegacySetRow, LegacyTarget } from './port/types';
import { liftSeries } from './progress';

const row = (date: string, weight: number, reps: number, exercise = 'OHP'): LegacySetRow =>
  ({ date, session: 's', exercise, order: 1, set_num: 1, reps, weight });

describe('bug (a): adding weight on the last sets earns the jump', () => {
  // KNOWN-ISSUES: target 5x5 @102.5; 3 sets @102.5 then 2 sets @105, all fives.
  const day = [102.5, 102.5, 102.5, 105, 105].map((w) => row('2026-05-01', w, 5));

  it('faithful port summarises the day by its max and drops the session', () => {
    const h = attemptHistory(day, 'OHP', { faithful: true });
    expect(h).toEqual([[105, [5, 5]]]);
    const t = strengthTarget(h, 'OHP', 2.5, { faithful: true });
    expect(t.is_new).toBe(true); // no jump: "that earns the next jump" was false
  });

  it('fixed: the day is summarised by the worked load, and the 5x5 earns +2.5', () => {
    const h = attemptHistory(day, 'OHP');
    expect(h).toEqual([[102.5, [5, 5, 5, 5, 5]]]);
    const t = strengthTarget(h, 'OHP', 2.5);
    expect(t.weight).toBe(105);
    expect(t.added_weight).toBe(true);
  });

  it('a committed target weight is used as the worked load when known', () => {
    const odd = [100, 100, 102.5, 102.5, 102.5].map((w) => row('2026-05-01', w, 5));
    expect(attemptHistory(odd, 'OHP')).toEqual([[102.5, [5, 5, 5]]]);
    expect(attemptHistory(odd, 'OHP', { plannedWeight: { '2026-05-01': 100 } })).toEqual([[100, [5, 5, 5, 5, 5]]]);
  });

  it('workedLoad: most sets within 10% of the top, ties to the heavier', () => {
    expect(workedLoad([[100, 5], [102.5, 5], [102.5, 5]])).toBe(102.5);
    expect(workedLoad([[100, 5], [100, 5], [102.5, 5]])).toBe(100);
    expect(workedLoad([[100, 5], [102.5, 5]])).toBe(102.5);
    expect(workedLoad([[0, 8], [0, 8]])).toBe(0);
  });

  it('warm-up sets far below the top never become the worked load', () => {
    const ramp = [[20, 5], [20, 5], [20, 5], [40, 3], [60, 5], [60, 5]].map(([w, r]) => row('2026-05-02', w, r));
    expect(attemptHistory(ramp, 'OHP')).toEqual([[60, [5, 5]]]);
  });

  it('the domain prescribe() jumps after that session', () => {
    const ex = exercise({ id: 'ohp', name: 'OHP' });
    const sets = [102.5, 102.5, 102.5, 105, 105].map((w) => set(w, 5, { exerciseId: 'ohp' }));
    const t = prescribe(slot('linear5x5', { sets: 5, repMin: 5, repMax: 5 }, 'ohp'), ex,
      [session('2026-05-01', sets)], { today: '2026-05-04' });
    expect(t.weight).toBe(105);
    expect(t.criterion).toBe('Complete all 5 sets of 5 at 105kg — that earns the next jump.');
  });
});

describe('bug (b): deload fires when the load drifts within a band', () => {
  const drift: [number, number[]][] = [[100, [5, 5, 4, 4, 3]], [102.5, [5, 4, 4, 3, 3]], [100, [5, 5, 5, 4, 4]]];

  it('faithful port counts only exact-weight failures and never deloads', () => {
    const t = strengthTarget(drift, 'Squat', 2.5, { faithful: true });
    expect(t.weight).toBe(100);
    expect(t.rationale).toMatch(/^incomplete last time/);
  });

  it('fixed: three failures within one increment deload 10%', () => {
    const t = strengthTarget(drift, 'Squat', 2.5);
    expect(t.weight).toBe(90);
    expect(t.rationale).toBe('3 straight incomplete sessions at 100kg — deload to 90kg (planned fatigue management)');
  });

  it('a failure more than one increment away still breaks the run', () => {
    const far: [number, number[]][] = [[100, [5, 5, 4, 4, 3]], [110, [5, 4, 4, 3, 3]], [100, [5, 5, 5, 4, 4]]];
    expect(strengthTarget(far, 'Squat', 2.5).weight).toBe(100);
  });
});

describe('bug (c): bodyweight lifts are not frozen at 0 kg', () => {
  const pullups = [0, 0, 0, 0, 0].map((w) => row('2026-05-01', w, 5, 'Pull-ups'));

  it('faithful port drops 0 kg sets, so the lift stays "new" at 0 kg', () => {
    expect(attemptHistory(pullups, 'Pull-ups', { faithful: true, bodyweightFactor: 0.95 })).toEqual([]);
    expect(sessionSeries(pullups, 'Pull-ups')).toEqual([]);
  });

  it('fixed: a 0 kg set is valid work, progression is on added weight', () => {
    const h = attemptHistory(pullups, 'Pull-ups', { bodyweightFactor: 0.95 });
    expect(h).toEqual([[0, [5, 5, 5, 5, 5]]]);
    expect(strengthTarget(h, 'Pull-ups', 2.5).weight).toBe(2.5);
  });

  it('fixed: e1RM uses bodyweight × factor + added', () => {
    const s = sessionSeries(pullups, 'Pull-ups', { bodyweightFactor: 0.95, bodyweightKg: 80 });
    expect(s).toHaveLength(1);
    expect(s[0].e1rm).toBeCloseTo(76 * (1 + 5 / 30), 9);
    expect(s[0].best_set).toEqual([0, 5]); // shown as the logged (added) load
  });

  it('without a bodyweight there is no honest e1RM, but progression still works', () => {
    expect(sessionSeries(pullups, 'Pull-ups', { bodyweightFactor: 0.95 })).toEqual([]);
  });

  it('domain: prescribe and grade on added weight, series on effective load', () => {
    const ex = exercise({ id: 'pu', name: 'Pull-ups', bodyweightFactor: 0.95, increment: 2.5, areasLoaded: ['shoulder', 'elbow'] });
    const sl = slot('linear5x5', { sets: 5, repMin: 5, repMax: 5 }, 'pu');
    const hist = [session('2026-05-01', [0, 0, 0, 0, 0].map((w) => set(w, 5, { exerciseId: 'pu' })))];
    const t = prescribe(sl, ex, hist, { today: '2026-05-04', bodyweightKg: 80 });
    expect(t.isNew).toBe(false);
    expect(t.weight).toBe(2.5);
    const g = grade(t, [1, 2, 3, 4, 5].map(() => set(2.5, 5, { exerciseId: 'pu' })));
    expect(g.verdict).toBe('hit');
    const series = liftSeries(ex, hist, { bodyweightKg: 80 });
    expect(series[0].e1rm).toBeCloseTo(88.667, 3);
  });
});

describe('criterion and grade agree (promise shown == promise graded)', () => {
  const t = (over: Partial<LegacyTarget>): LegacyTarget => ({
    lift: 'L', weight: 100, target_reps: 10, added_weight: false, prev_top: [10], is_new: false,
    rationale: '', target_sets: null, mode: 'hypertrophy', ...over });

  it('hold: "Repeat W x R for 2+ sets" — faithful graded one set as hit; fixed needs two', () => {
    const one: [number, number][] = [[100, 10]];
    expect(successCriteria(t({}))).toMatch(/for 2\+ sets/);
    expect(scoreLift(one, t({}), { faithful: true }).status).toBe('hit');
    expect(scoreLift(one, t({})).status).toBe('missed');
    expect(scoreLift([[100, 10], [100, 10]], t({})).status).toBe('hit');
    expect(scoreLift([[100, 10], [100, 11]], t({})).status).toBe('beat');
  });

  it('chase: faithful said "Beat N" though N graded hit; fixed says "Match or beat N"', () => {
    const c = t({ prev_top: [8, 8, 7] });
    expect(successCriteria(c, { faithful: true })).toBe('Beat 23 total reps at 100kg (last time: [8, 8, 7]).');
    expect(successCriteria(c)).toBe('Match or beat 23 total reps at 100kg (last time: [8, 8, 7]).');
    expect(scoreLift([[100, 8], [100, 8], [100, 7]], c).status).toBe('hit');
  });
});
