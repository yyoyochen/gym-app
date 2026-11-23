import { describe, expect, it } from 'vitest';
import type { GoalTarget } from '../../domain/types';
import type { NextStep } from '../../benchmarks/liftRating';
import { liftChartTargets } from './chartTargets';

const SUB = 'conventional_deadlift';
const next: NextStep = { level: 'advanced', value: 191.5, unit: 'kg', added: false };
const goal = (value: number, deadline: string, subject = SUB): GoalTarget => ({ id: `g${value}`, subject, value, type: 'reach', deadline });

describe('liftChartTargets', () => {
  it('e1RM gets the personal goal and the next level, ascending', () => {
    expect(liftChartTargets({ metric: 'e1rm', next, goals: [goal(165, '2027-03-01')], subject: SUB }))
      .toEqual([{ name: 'Your target', value: 165, kind: 'goal' }, { name: 'Advanced', value: 191.5, kind: 'level' }]);
  });

  it('the next level is left out unless it is a plain kg e1RM', () => {
    const goals = [goal(165, '2027-03-01')];
    const only = [{ name: 'Your target', value: 165, kind: 'goal' }];
    expect(liftChartTargets({ metric: 'e1rm', next: { ...next, added: true }, goals, subject: SUB })).toEqual(only);
    expect(liftChartTargets({ metric: 'e1rm', next: { ...next, unit: 'reps' }, goals, subject: SUB })).toEqual(only);
    expect(liftChartTargets({ metric: 'e1rm', next: { ...next, unit: 'seconds' }, goals, subject: SUB })).toEqual(only);
    expect(liftChartTargets({ metric: 'e1rm', next, loadType: 'dumbbell_each', goals, subject: SUB })).toEqual(only);
  });

  it('Top set and Weekly volume get no targets', () => {
    for (const metric of ['top', 'volume'] as const)
      expect(liftChartTargets({ metric, next, goals: [goal(165, '2027-03-01')], subject: SUB })).toEqual([]);
  });

  it('only this lift’s goal counts, and only the earliest deadline', () => {
    const goals = [goal(200, '2027-06-01'), goal(170, '2027-01-15'), goal(150, '2026-12-01', 'back_squat')];
    expect(liftChartTargets({ metric: 'e1rm', next: null, goals, subject: SUB })).toEqual([{ name: 'Your target', value: 170, kind: 'goal' }]);
  });

  it('nothing to show gives no targets', () => {
    expect(liftChartTargets({ metric: 'e1rm', next: undefined, goals: [], subject: SUB })).toEqual([]);
  });
});
