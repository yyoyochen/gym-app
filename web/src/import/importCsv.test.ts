import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { freshDb } from '../db/test-helpers';
import { seedCatalog } from '../db';
import { EX } from '../domain/catalog';
import { importCsv, needsUnit } from './notion';

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), 'utf8');
async function db() { const d = freshDb(); await seedCatalog(d); return d; }

describe('one CSV import for the template, Hevy and Strong', () => {
  it('a Hevy file: warm-ups stay warm-ups, RPE becomes RIR, names land on the catalogue lifts', async () => {
    const d = await db();
    const r = await importCsv(d, fixture('hevy-kg.csv'));
    expect(r.format).toBe('hevy');
    expect(r.sessionsAdded).toBe(3);
    expect(r.skipped).toHaveLength(2);
    const bench = (await d.sets.where('exerciseId').equals(EX.bench).toArray()).sort((a, b) => a.setOrder - b.setOrder);
    expect(bench.map(s => [s.kind, s.weight, s.reps, s.rir])).toEqual([['warmup', 40, 10, undefined], ['working', 80, 5, 1.5], ['working', 80, 6, 0]]);
    expect(await d.sets.where('exerciseId').equals(EX.squat).count()).toBe(1);
    expect((await d.sets.where('exerciseId').equals('pull-up').first())?.weight).toBe(-20);
  });
  it('two Hevy workouts with one title on one day stay two sessions', async () => {
    const d = await db();
    await importCsv(d, fixture('hevy-kg.csv'));
    expect((await d.sessions.where('date').equals('2026-11-18').toArray()).map(s => s.nameSnapshot)).toEqual(['Push Day', 'Push Day']);
  });
  it('re-importing the same file adds nothing', async () => {
    const d = await db();
    await importCsv(d, fixture('hevy-kg.csv'));
    const again = await importCsv(d, fixture('hevy-kg.csv'));
    expect(again.sessionsAdded).toBe(0);
    expect(again.sessionsUnchanged).toBe(3);
  });
  it('pounds are stored as kilograms', async () => {
    const d = await db();
    await importCsv(d, fixture('hevy-lb.csv'));
    expect((await d.sets.where('exerciseId').equals(EX.squat).first())?.weight).toBe(102.06);
  });
  it('needsUnit is true only for a Strong file without a unit; without one, the import refuses', async () => {
    expect(needsUnit(fixture('strong-ios.csv'))).toBe(true);
    expect(needsUnit(fixture('strong-android.csv'))).toBe(false);
    expect(needsUnit(fixture('hevy-lb.csv'))).toBe(false);
    const d = await db();
    await expect(importCsv(d, fixture('strong-ios.csv'))).rejects.toThrow(/kg or lb/);
    const r = await importCsv(d, fixture('strong-ios.csv'), { unit: 'lb' });
    expect(r.format).toBe('strong');
    expect((await d.sets.where('exerciseId').equals(EX.squat).first())?.weight).toBe(43.09);
  });
  it('a Strong Android file imports with its warm-up and drop set', async () => {
    const d = await db();
    const r = await importCsv(d, fixture('strong-android.csv'));
    expect(r.setsAdded).toBe(4);
    expect((await d.sets.toArray()).map(s => s.kind).sort()).toEqual(['drop', 'warmup', 'working', 'working']);
  });
  it('the GymBro template still imports', async () => {
    const d = await db();
    const r = await importCsv(d, fixture('sample-notion.csv'));
    expect(r.format).toBe('gymbro');
    expect(r.sessionsAdded).toBeGreaterThan(0);
  });
  it('an unknown header is refused with the three shapes named', async () => {
    const d = await db();
    await expect(importCsv(d, 'a,b\n1,2\n')).rejects.toThrow(/GymBro template.*Hevy.*Strong/);
  });
});
