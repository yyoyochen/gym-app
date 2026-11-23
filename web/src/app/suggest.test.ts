import { describe, expect, it } from 'vitest';
import type { Exercise } from '../domain/types';
import { exercise } from '../engine/__fixtures__/build';
import { FALLBACK_LIFT, GOAL_WEEK_SETS, estimateMinutes, pickFocus, reasonLine, slotFor, suggestWorkout, type LiftUse, type PartWeek } from './suggest';

const T = '2026-11-23';
const row = (part: PartWeek['part'], done: number, target: number, lastTrained: string | null = null): PartWeek => ({ part, done, target, lastTrained });

const EXS: Exercise[] = [
  exercise({ id: 'back-squat', name: 'Back Squat', muscles: ['quads'], benchmarkKey: 'squat', increment: 5 }),
  exercise({ id: 'leg-press', name: 'Leg Press', muscles: ['quads'], benchmarkKey: null, increment: 5 }),
  exercise({ id: 'barbell-bench-press', name: 'Barbell Bench Press', muscles: ['chest'], benchmarkKey: 'bench' }),
  exercise({ id: 'barbell-row', name: 'Barbell Row', muscles: ['lats'], benchmarkKey: null }),
  exercise({ id: 'cable-row', name: 'Cable Row', muscles: ['lats'], benchmarkKey: null }),
  exercise({ id: 'db-lateral-raise', name: 'DB Lateral Raise', muscles: ['side_delts'], benchmarkKey: null, slotType: 'isolation', increment: 1 }),
  exercise({ id: 'overhead-press', name: 'Overhead Press', muscles: ['front_delts'], benchmarkKey: null }),
  exercise({ id: 'db-curl', name: 'DB Curl', muscles: ['biceps'], benchmarkKey: null, slotType: 'isolation', increment: 1 }),
  exercise({ id: 'plank', name: 'Plank', muscles: ['core'], benchmarkKey: null, slotType: 'isolation', increment: 1 }),
];
let k = 0;
const newId = () => `s${++k}`;

describe('weekly set targets by goal', () => {
  it('match the spec', () => {
    expect(GOAL_WEEK_SETS.maintain).toEqual({ Legs: 12, Back: 10, Chest: 8, Shoulders: 6, Arms: 4, Core: 3 });
    expect(GOAL_WEEK_SETS.strength).toEqual(GOAL_WEEK_SETS.maintain);
    expect(GOAL_WEEK_SETS.hypertrophy).toEqual({ Legs: 15, Back: 14, Chest: 12, Shoulders: 10, Arms: 8, Core: 4 });
    expect(GOAL_WEEK_SETS.bodycomp).toEqual(GOAL_WEEK_SETS.hypertrophy);
  });
});

describe('pickFocus', () => {
  const rows = [row('Legs', 0, 12), row('Chest', 4, 8), row('Back', 2, 10), row('Shoulders', 6, 6), row('Arms', 4, 4), row('Core', 3, 3)];
  it('the three furthest behind, by share of the target done', () => {
    expect(pickFocus(rows, T)).toEqual(['Legs', 'Back', 'Chest']);
  });
  it('skips a part trained in the last 2 days', () => {
    const r = rows.map(x => (x.part === 'Legs' ? { ...x, lastTrained: '2026-11-22' } : x));
    expect(pickFocus(r, T)).toEqual(['Back', 'Chest', 'Shoulders']);
  });
  it('when everything was trained lately it still picks three, furthest behind first', () => {
    const r = rows.map(x => ({ ...x, lastTrained: '2026-11-22' }));
    expect(pickFocus(r, T)).toEqual(['Legs', 'Back', 'Chest']);
  });
});

describe('slotFor: sets and reps by goal', () => {
  const sq = EXS[0], row_ = EXS[3], lat = EXS[5];
  it('strength / maintain: main lifts top 2 then 3 × 8–10 at 75%; others 3 × 8–12; isolation 3 × 12–15', () => {
    expect(slotFor(sq, 'maintain', true, 'a')).toMatchObject({ model: 'topset', params: { sets: 1, topReps: 2, backoffSets: 3, backoffPct: 75, repMin: 8, repMax: 10 } });
    expect(slotFor(row_, 'strength', false, 'b')).toMatchObject({ model: 'double', params: { sets: 3, repMin: 8, repMax: 12 } });
    expect(slotFor(lat, 'maintain', false, 'c')).toMatchObject({ model: 'double', params: { sets: 3, repMin: 12, repMax: 15 } });
  });
  it('hypertrophy / bodycomp: main 3 × 6–10, others 3 × 10–15, isolation 3 × 12–20', () => {
    expect(slotFor(sq, 'hypertrophy', true, 'a')).toMatchObject({ model: 'double', params: { sets: 3, repMin: 6, repMax: 10 } });
    expect(slotFor(row_, 'bodycomp', false, 'b')).toMatchObject({ model: 'double', params: { sets: 3, repMin: 10, repMax: 15 } });
    expect(slotFor(lat, 'hypertrophy', false, 'c')).toMatchObject({ model: 'double', params: { sets: 3, repMin: 12, repMax: 20 } });
  });
});

describe('suggestWorkout', () => {
  const use = new Map<string, LiftUse>([
    ['back-squat', { sets90: 20, lastDate: '2026-11-17' }],
    ['leg-press', { sets90: 5, lastDate: '2026-11-10' }],
    ['barbell-bench-press', { sets90: 12, lastDate: '2026-11-17' }],
    ['barbell-row', { sets90: 9, lastDate: '2026-11-12' }],
  ]);
  const rows = [row('Legs', 0, 12), row('Chest', 0, 8), row('Back', 0, 10), row('Shoulders', 0, 6), row('Arms', 0, 4), row('Core', 0, 3)];
  const base = { rows, exercises: EXS, use, goalLiftIds: new Set(['barbell-bench-press']), goal: 'maintain' as const, today: T, newId };

  it('one lift per focus part, plus a second for the part furthest behind when under four', () => {
    const d = suggestWorkout({ ...base, focus: ['Legs', 'Chest', 'Back'] });
    expect(d.map(x => x.slot.exerciseId)).toEqual(['back-squat', 'barbell-bench-press', 'barbell-row', 'leg-press']);
    expect(d.map(x => x.slot.model)).toEqual(['topset', 'topset', 'double', 'double']);
    expect(d.map(x => x.part)).toEqual(['Legs', 'Chest', 'Back', 'Legs']);
  });
  it('a lift trained in the last 2 days is skipped for its part', () => {
    const u = new Map(use); u.set('back-squat', { sets90: 20, lastDate: '2026-11-22' });
    expect(suggestWorkout({ ...base, use: u, focus: ['Legs'] })[0].slot.exerciseId).toBe('leg-press');
  });
  it('a part with no history uses the catalogue fallback', () => {
    const d = suggestWorkout({ ...base, use: new Map(), goalLiftIds: new Set(), focus: ['Arms', 'Core', 'Shoulders'] });
    expect(d.slice(0, 3).map(x => x.slot.exerciseId)).toEqual([FALLBACK_LIFT.Arms, FALLBACK_LIFT.Core, FALLBACK_LIFT.Shoulders]);
  });
  it('a session-length cap drops the last lifts until it fits', () => {
    const d = suggestWorkout({ ...base, focus: ['Legs', 'Chest', 'Back'], maxMinutes: 40 });
    expect(estimateMinutes(d.map(x => x.slot))).toBeLessThanOrEqual(40);
    expect(d.length).toBeLessThan(4);
  });
  it('no focus, no lifts', () => {
    expect(suggestWorkout({ ...base, focus: [] })).toEqual([]);
  });
});

describe('estimateMinutes', () => {
  it('3 minutes a working set plus 2 a lift', () => {
    expect(estimateMinutes([slotFor(EXS[0], 'maintain', true, 'a'), slotFor(EXS[3], 'maintain', false, 'b')])).toBe((4 * 3 + 2) + (3 * 3 + 2));
  });
});

describe('reasonLine', () => {
  it('body part progress, then days since the lift', () => {
    expect(reasonLine(row('Legs', 0, 15), '2026-11-17', false, T, 'squat')).toBe('Legs 0 of 15 sets this week, last squat 6 days ago');
  });
  it('a Goal Board lift says so', () => {
    expect(reasonLine(row('Chest', 0, 7), '2026-11-17', true, T, 'bench')).toBe('Chest 0 of 7, Goal Board lift');
  });
  it('a lift never trained is a first time', () => {
    expect(reasonLine(row('Legs', 0, 12), null, false, T, 'squat')).toBe('Legs 0 of 12 sets this week, first time');
  });
  it('yesterday reads as yesterday', () => {
    expect(reasonLine(null, '2026-11-22', false, T, 'squat')).toBe('Last squat yesterday');
  });
});
