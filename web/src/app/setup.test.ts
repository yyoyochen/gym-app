import { describe, expect, it } from 'vitest';
import { freshDb } from '../db/test-helpers';
import { addSet, defaultProfile, seedCatalog, sealSession, startSession } from '../db';
import { EX } from '../domain/catalog';
import { programFromTemplate } from '../domain/templates';
import type { Profile, Program } from '../domain/types';
import { mainLifts, pendingStartingSets, startingSetFor, startingSetsFromRows } from './setup';

describe('main lifts asked for in setup', () => {
  it('main lifts per template, program order, first occurrence', () => {
    expect(mainLifts(programFromTemplate('fullbody-abc'))).toEqual([EX.squat, EX.bench, EX.deadlift, EX.ohp]);
    expect(mainLifts(programFromTemplate('upper-lower'))).toEqual([EX.bench, EX.ohp, EX.squat, EX.deadlift]);
    expect(mainLifts(programFromTemplate('linear-5x5'))).toEqual([EX.squat, EX.bench, EX.ohp, EX.deadlift]);
    expect(mainLifts(programFromTemplate('hypertrophy-split'))).toEqual([EX.bench, EX.squat, EX.ohp, EX.deadlift]);
  });
  it('a program with no main lifts asks for none', () => {
    const p = programFromTemplate('fullbody-abc');
    const accessories: Program = { ...p, sessions: p.sessions.filter(s => s.key === 'C') };
    expect(mainLifts(accessories)).toEqual([]);
  });
});

describe('starting sets', () => {
  it('rows become starting sets: skipped and empty dropped, reps clamped 1–12', () => {
    expect(startingSetsFromRows([
      { exerciseId: 'a', weight: 100, reps: 3, skipped: false },
      { exerciseId: 'b', weight: 80, reps: 5, skipped: true },
      { exerciseId: 'c', weight: null, reps: 5, skipped: false },
      { exerciseId: 'd', weight: 60, reps: 20, skipped: false },
      { exerciseId: 'e', weight: 0, reps: 5, skipped: false },
    ], '2026-11-23')).toEqual([
      { exerciseId: 'a', weight: 100, reps: 3, date: '2026-11-23' },
      { exerciseId: 'd', weight: 60, reps: 12, date: '2026-11-23' },
    ]);
  });
  it('startingSetFor skips malformed entries', () => {
    const p = { ...defaultProfile(), startingSets: [
      { exerciseId: 'x', weight: 100, reps: 0, date: '2026-11-23' },
      { exerciseId: 'y', weight: -5, reps: 3, date: '2026-11-23' },
      { exerciseId: 'w', weight: 100, reps: 30, date: '2026-11-23' },
      { exerciseId: 'v', reps: 3, date: '2026-11-23' },
      { exerciseId: 'z', weight: 100, reps: 3, date: '2026-11-23' },
    ] } as unknown as Profile;
    expect(startingSetFor(p, 'x')).toBeUndefined();
    expect(startingSetFor(p, 'y')).toBeUndefined();
    expect(startingSetFor(p, 'w')).toBeUndefined();
    expect(startingSetFor(p, 'v')).toBeUndefined();
    expect(startingSetFor(p, 'z')).toEqual({ weight: 100, reps: 3 });
    expect(startingSetFor(undefined, 'z')).toBeUndefined();
    expect(startingSetFor(defaultProfile(), 'z')).toBeUndefined();
  });
  it('pendingStartingSets drops lifts that have been logged', async () => {
    const db = freshDb();
    await seedCatalog(db);
    const p: Profile = { ...defaultProfile(), startingSets: [
      { exerciseId: EX.squat, weight: 140, reps: 3, date: '2026-11-20' },
      { exerciseId: EX.bench, weight: 100, reps: 3, date: '2026-11-20' },
    ] };
    expect((await pendingStartingSets(db, p)).map(s => s.exerciseId)).toEqual([EX.squat, EX.bench]);
    const s = await startSession(db, { programSessionKey: 'A', nameSnapshot: 'A', date: '2026-11-21', now: 1 });
    await addSet(db, { sessionId: s.id, exerciseId: EX.squat, exerciseNameSnapshot: 'Back Squat', slotOrder: 1, kind: 'working', weight: 130, reps: 3, loggedAt: 2 });
    await sealSession(db, s.id, 3);
    expect((await pendingStartingSets(db, p)).map(s => s.exerciseId)).toEqual([EX.bench]);
  });
});
