import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { defaultCatalog } from '../domain/catalog';
import { levelsAt, rate, tableThresholds, type GymStandardsData } from './gymStandards';
import { rateExercise, type LiftRating } from './liftRating';

// Made-up table: two bodyweight rows on bench_press.
const base: GymStandardsData = JSON.parse(readFileSync(fileURLToPath(new URL('../../public/standards/gym-standards.json', import.meta.url)), 'utf8'));
const tables = {
  bench_press: { bw: [60, 80], male: [[40, 60, 80, 100, 120], [50, 70, 90, 110, 130]] },
  db_bench: { bw: [60, 80], male: [[10, 20, 30, 40, 50], [10, 20, 30, 40, 50]] },
};
const data: GymStandardsData = { ...base, tables };

describe('rating against a bodyweight table', () => {
  it('interpolates thresholds between bodyweight rows', () => {
    expect(tableThresholds(data, 'bench_press', 'male', 70)).toEqual([45, 65, 85, 105, 125]);
  });
  it('a value on a threshold gets that level', () => {
    expect(rate(data, 'bench_press', 'male', 70, 85)).toEqual({ level: 'intermediate', percentile: 50 });
  });
  it('below beginner scales from 0', () => {
    expect(rate(data, 'bench_press', 'male', 70, 22.5)).toEqual({ level: 'below beginner', percentile: 2.5 });
  });
  it('above elite is 97', () => {
    expect(rate(data, 'bench_press', 'male', 70, 200)?.percentile).toBe(97);
  });
  it('clamps bodyweight outside the table', () => {
    expect(tableThresholds(data, 'bench_press', 'male', 200)).toEqual([50, 70, 90, 110, 130]);
    expect(tableThresholds(data, 'bench_press', 'male', 30)).toEqual([40, 60, 80, 100, 120]);
  });
  it('ignores age on the table path', () => {
    expect(rate(data, 'bench_press', 'male', 70, 85, 60)).toEqual({ level: 'intermediate', percentile: 50 });
  });
  it('female and unknown ids use the model', () => {
    expect(tableThresholds(data, 'bench_press', 'female', 70)).toBeNull();
    expect(tableThresholds(data, 'back_squat', 'male', 70)).toBeNull();
    expect(tableThresholds(base, 'bench_press', 'male', 70)).toBeNull();
    expect(rate(data, 'bench_press', 'female', 70, 50)).toEqual(rate(base, 'bench_press', 'female', 70, 50));
    expect(rate(data, 'back_squat', 'male', 70, 120, 30)).toEqual(rate(base, 'back_squat', 'male', 70, 120, 30));
  });
  it('levelsAt returns the table thresholds', () => {
    expect(levelsAt(data, 'bench_press', 'male', 70)).toEqual({
      unit: 'kg', values: { beginner: 45, novice: 65, intermediate: 85, advanced: 105, elite: 125 },
    });
  });
});

describe('lift ratings name their source', () => {
  const cat = new Map(defaultCatalog().map(e => [e.id, e]));
  const set = (exerciseId: string, weight: number, reps: number) => ({
    id: `${exerciseId}${weight}`, sessionId: 's', exerciseId, exerciseNameSnapshot: exerciseId, slotOrder: 1, setOrder: 1,
    kind: 'working' as const, weight, reps, loggedAt: 0,
  });
  const ctx = { sex: 'male' as const, bodyweightKg: 70 };
  it('a table-rated lift says table; a model one says model', () => {
    const bp = cat.get('barbell-bench-press')!;
    const h = [{ date: '2026-11-20', sets: [set(bp.id, 85, 1)] }];
    expect((rateExercise(data, bp, h, '2026-11-21', ctx) as LiftRating).source).toBe('table');
    expect((rateExercise(base, bp, h, '2026-11-21', ctx) as LiftRating).source).toBe('model');
  });
  it('rates DB bench on per-dumbbell weight, not doubled', () => {
    const db = cat.get('db-bench-press')!;
    const r = rateExercise(data, db, [{ date: '2026-11-20', sets: [set(db.id, 30, 1)] }], '2026-11-21', ctx) as LiftRating;
    expect(r.value).toBeCloseTo(30, 5);
    expect(r.level).toBe('intermediate');
  });
});
