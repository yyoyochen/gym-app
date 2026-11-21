import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Exercise, SetEntry, SetKind } from '../domain/types';
import type { DatedSets } from '../engine/progress';
import { defaultCatalog, guessExercise } from '../domain/catalog';
import { levelsAt, rate, type GymStandardsData } from './gymStandards';
import { rateExercise, rateTarget, rateValue, type LiftRating } from './liftRating';

const data: GymStandardsData = JSON.parse(readFileSync(fileURLToPath(new URL('../../public/standards/gym-standards.json', import.meta.url)), 'utf8'));
const cat = new Map(defaultCatalog().map(e => [e.id, e]));
const ex = (id: string) => cat.get(id)!;
const TODAY = '2026-11-21';
const ctx = { sex: 'male' as const, bodyweightKg: 80, age: 35 };

let n = 0;
function day(date: string, exercise: Exercise, sets: [number, number, SetKind?, boolean?][]): DatedSets {
  return {
    date,
    sets: sets.map(([weight, reps, kind = 'working', failed], i): SetEntry => ({
      id: `s${n++}`, sessionId: `ses-${date}`, exerciseId: exercise.id, exerciseNameSnapshot: exercise.name, slotOrder: 1, setOrder: i + 1,
      kind, weight, reps, loggedAt: 0, ...(failed ? { failed } : {}),
    })),
  };
}
const rated = (s: ReturnType<typeof rateExercise>): LiftRating => {
  expect(s.kind).toBe('rated');
  return s as LiftRating;
};

describe('rateExercise — loaded lifts', () => {
  it('rates the best e1RM of the last 90 days (Epley), ignoring warm-ups and older sessions', () => {
    const sq = ex('back-squat');
    const h = [
      day('2026-07-01', sq, [[200, 1]]), // outside 90 days
      day('2026-10-01', sq, [[100, 5], [140, 1, 'warmup']]),
      day('2026-11-15', sq, [[110, 3]]),
    ];
    const r = rated(rateExercise(data, sq, h, TODAY, ctx));
    const e1 = 110 * (1 + 3 / 30);
    expect(r).toMatchObject({ standardId: 'back_squat', basis: 'e1rm', confidence: 'A' });
    expect(r.value).toBeCloseTo(e1, 9);
    expect({ level: r.level, percentile: r.percentile }).toEqual(rate(data, 'back_squat', 'male', 80, e1, 35));
  });

  it('next level is the threshold rounded up to 0.5 kg, so reaching it reaches the level', () => {
    const r = rateValue(data, 'bench_press', 75, ctx)!;
    const t = levelsAt(data, 'bench_press', 'male', 80, 35)!;
    expect(r.level).toBe('novice');
    expect(r.next).toEqual({ level: 'intermediate', value: Math.ceil(t.values.intermediate * 2) / 2, unit: 'kg', added: false });
    expect(rate(data, 'bench_press', 'male', 80, r.next!.value, 35)!.level).toBe('intermediate');
    expect(rateValue(data, 'bench_press', 400, ctx)!.next).toBeNull();
  });

  it('dumbbell lifts are rated per dumbbell, as logged', () => {
    const r = rated(rateExercise(data, ex('db-bench-press'), [day('2026-11-10', ex('db-bench-press'), [[30, 10]])], TODAY, ctx));
    expect(r).toMatchObject({ standardId: 'db_bench', loadType: 'dumbbell_each', confidence: 'B' });
    expect(r.value).toBeCloseTo(40, 9);
  });

  it('no sets in 90 days → no-data; no standard → none', () => {
    expect(rateExercise(data, ex('back-squat'), [], TODAY, ctx)).toEqual({ kind: 'no-data', standardId: 'back_squat', standardName: 'Back Squat' });
    expect(rateExercise(data, ex('leg-curl'), [day('2026-11-10', ex('leg-curl'), [[40, 10]])], TODAY, ctx)).toEqual({ kind: 'none' });
    expect(rateExercise(data, guessExercise('Box Jump'), [], TODAY, ctx)).toEqual({ kind: 'none' });
  });
});

describe('rateExercise — bodyweight lifts', () => {
  it('bodyweight-only sets: best set reps on the reps table', () => {
    const pu = ex('pull-up');
    const r = rated(rateExercise(data, pu, [day('2026-11-01', pu, [[0, 8], [0, 12], [0, 15, 'working', true]]), day('2026-11-10', pu, [[-20, 20]])], TODAY, ctx));
    expect(r).toMatchObject({ standardId: 'pull_up', basis: 'reps', value: 12 });
    expect({ level: r.level, percentile: r.percentile }).toEqual(rate(data, 'pull_up', 'male', 80, 12));
    expect(r.next).toEqual({ level: 'advanced', value: 16, unit: 'reps', added: false });
  });

  it('added load: the weighted standard, added e1RM = epley(bw×factor + added, reps) − bw×factor, ÷ bodyweight', () => {
    const dip = ex('dips'); // bodyweightFactor 0.95
    const h = [day('2026-11-01', dip, [[0, 15], [20, 6], [30, 2]])];
    const r = rated(rateExercise(data, dip, h, TODAY, ctx));
    const base = 80 * 0.95;
    const added = Math.max((base + 20) * (1 + 6 / 30) - base, (base + 30) * (1 + 2 / 30) - base);
    expect(r).toMatchObject({ standardId: 'weighted_dip', basis: 'weighted' });
    expect(r.addedKg).toBeCloseTo(added, 9);
    expect(r.value).toBeCloseTo(added / 80, 12);
    expect({ level: r.level, percentile: r.percentile }).toEqual(rate(data, 'weighted_dip', 'male', 80, added / 80));
    expect(r.next?.unit).toBe('kg');
    expect(r.next?.added).toBe(true);
    expect(r.next!.value).toBe(Math.ceil(levelsAt(data, 'weighted_dip', 'male', 80)!.values[r.next!.level] * 80 * 2) / 2);
  });

  it('a lift with no weighted standard rates reps even with load on (push-up)', () => {
    const r = rated(rateExercise(data, ex('push-up'), [day('2026-11-01', ex('push-up'), [[10, 20], [0, 25]])], TODAY, ctx));
    expect(r).toMatchObject({ standardId: 'push_up', basis: 'reps', value: 25 });
  });

  it('holds read logged reps as seconds', () => {
    const r = rated(rateExercise(data, ex('plank'), [day('2026-11-01', ex('plank'), [[0, 60], [0, 95]])], TODAY, ctx));
    expect(r).toMatchObject({ standardId: 'plank', basis: 'seconds', value: 95, level: 'intermediate' });
  });

  it('assisted-only sets are not rated', () => {
    expect(rateExercise(data, ex('chin-up'), [day('2026-11-01', ex('chin-up'), [[-25, 8]])], TODAY, ctx).kind).toBe('no-data');
  });

  it('custom exercises are matched by name', () => {
    const w = guessExercise('Weighted Chin-ups');
    const r = rated(rateExercise(data, w, [day('2026-11-01', w, [[10, 5]])], TODAY, ctx));
    expect(r.standardId).toBe('weighted_chin_up');
  });
});

describe('rateTarget', () => {
  it('loaded targets are 1RMs; pull-up/dip targets are added load', () => {
    expect(rateTarget(data, ex('back-squat'), 140, ctx)).toMatchObject({ basis: 'e1rm', ...rate(data, 'back_squat', 'male', 80, 140, 35) });
    expect(rateTarget(data, ex('pull-up'), 20, ctx)).toMatchObject({ standardId: 'weighted_pull_up', addedKg: 20, ...rate(data, 'weighted_pull_up', 'male', 80, 0.25) });
    expect(rateTarget(data, ex('push-up'), 20, ctx)).toBeNull();
    expect(rateTarget(data, ex('leg-curl'), 50, ctx)).toBeNull();
  });
});
