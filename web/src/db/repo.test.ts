import { describe, it, expect } from 'vitest';
import { freshDb } from './test-helpers';
import {
  addSet, deleteSet, getSessionSets, startSession, sealSession, putCommit, CommitExistsError, getCommit,
  getExerciseHistory, listSessions, getOpenSession, updateSet, changeSessionDate, deleteSession,
  requestPersist, getMeta, saveProfile, getProfile, defaultProfile, seedCatalog, listExercises,
  findExerciseByName, saveProgram, getActiveProgram, addBodyweight, listBodyweight, logEvent, listEvents,
  type NewSet,
} from './repo';
import { openDb, SCHEMA_VERSION, MIGRATIONS } from './schema';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import type { Commit } from '../domain/types';
import { programFromTemplate } from '../domain/templates';

const set = (sessionId: string, over: Partial<NewSet> = {}): NewSet => ({
  sessionId, exerciseId: 'back-squat', exerciseNameSnapshot: 'Back Squat', slotOrder: 1,
  kind: 'working', weight: 100, reps: 5, loggedAt: 1, ...over,
});

describe('sessions', () => {
  it('pins the date at start from the local clock, so later sets never split the session', async () => {
    const db = freshDb();
    const lateNight = new Date(2026, 10, 20, 23, 50).getTime();
    const s = await startSession(db, { programSessionKey: 'A', nameSnapshot: 'A', now: lateNight });
    expect(s.date).toBe('2026-11-20');
    await addSet(db, set(s.id, { loggedAt: lateNight + 20 * 60_000 })); // after midnight
    const sets = await getSessionSets(db, s.id);
    expect(sets).toHaveLength(1);
    expect((await listSessions(db, { from: '2026-11-21' }))).toHaveLength(0);
  });

  it('seal sets endedAt once; open session lookup ignores sealed ones', async () => {
    const db = freshDb();
    const a = await startSession(db, { programSessionKey: 'A', nameSnapshot: 'A', date: '2026-11-01', now: 10 });
    const b = await startSession(db, { programSessionKey: 'B', nameSnapshot: 'B', date: '2026-11-03', now: 20 });
    expect((await getOpenSession(db))?.id).toBe(b.id);
    const sealed = await sealSession(db, b.id, 99);
    expect(sealed).toMatchObject({ sealed: true, endedAt: 99 });
    expect((await sealSession(db, b.id, 500)).endedAt).toBe(99);
    expect((await getOpenSession(db))?.id).toBe(a.id);
  });

  it('lists by inclusive date range, oldest first', async () => {
    const db = freshDb();
    for (const [d, t] of [['2026-11-05', 3], ['2026-11-01', 1], ['2026-11-03', 2], ['2026-11-09', 4]] as const) {
      await startSession(db, { programSessionKey: 'A', nameSnapshot: d, date: d, now: t });
    }
    const got = await listSessions(db, { from: '2026-11-01', to: '2026-11-05' });
    expect(got.map(s => s.date)).toEqual(['2026-11-01', '2026-11-03', '2026-11-05']);
  });

  it('rejects malformed dates', async () => {
    const db = freshDb();
    await expect(startSession(db, { programSessionKey: 'A', nameSnapshot: 'A', date: '2026-02-30' })).rejects.toThrow();
  });
});

describe('sets', () => {
  it('assigns setOrder = max+1 per slot, even for concurrent writes (old COUNT(*) bug)', async () => {
    const db = freshDb();
    const s = await startSession(db, { programSessionKey: 'A', nameSnapshot: 'A', date: '2026-11-20' });
    const a = await addSet(db, set(s.id));
    const b = await addSet(db, set(s.id));
    await addSet(db, set(s.id, { slotOrder: 2, exerciseId: 'barbell-bench-press' }));
    await deleteSet(db, a.id);
    // After deleting set 1, COUNT(*)+1 would give 2 again and collide with b.
    const c = await addSet(db, set(s.id));
    expect([b.setOrder, c.setOrder]).toEqual([2, 3]);
    const burst = await Promise.all([1, 2, 3, 4, 5].map(() => addSet(db, set(s.id, { slotOrder: 3 }))));
    expect(burst.map(x => x.setOrder).sort()).toEqual([1, 2, 3, 4, 5]);
    const all = await getSessionSets(db, s.id);
    expect(all.map(x => `${x.slotOrder}.${x.setOrder}`)).toEqual(['1.2', '1.3', '2.1', '3.1', '3.2', '3.3', '3.4', '3.5']);
    expect(all[0]).not.toHaveProperty('date');
  });

  it('editing a sealed session marks it edited; setOrder and sessionId are immutable', async () => {
    const db = freshDb();
    const s = await startSession(db, { programSessionKey: 'A', nameSnapshot: 'A', date: '2026-11-20' });
    const x = await addSet(db, set(s.id));
    await sealSession(db, s.id);
    const y = await updateSet(db, x.id, { reps: 6, rir: 2, ...({ setOrder: 9, sessionId: 'zzz' } as object) });
    expect(y).toMatchObject({ reps: 6, rir: 2, setOrder: 1, sessionId: s.id });
    expect((await db.sessions.get(s.id))?.edited).toBe(true);
  });

  it('adding a set to an unknown session throws', async () => {
    await expect(addSet(freshDb(), set('nope'))).rejects.toThrow(/not found/);
  });
});

describe('exercise history', () => {
  it('groups by session newest first, and `before` excludes that day', async () => {
    const db = freshDb();
    const days = ['2026-10-01', '2026-10-04', '2026-10-08'];
    for (const [i, d] of days.entries()) {
      const s = await startSession(db, { programSessionKey: 'A', nameSnapshot: 'A', date: d, now: i });
      await addSet(db, set(s.id, { weight: 100 + i * 5 }));
      await addSet(db, set(s.id, { weight: 100 + i * 5 }));
      await addSet(db, set(s.id, { slotOrder: 2, exerciseId: 'barbell-bench-press' }));
    }
    const h = await getExerciseHistory(db, 'back-squat', { before: '2026-10-08' });
    expect(h.map(d => d.session.date)).toEqual(['2026-10-04', '2026-10-01']);
    expect(h[0].sets.map(s => s.weight)).toEqual([105, 105]);
    expect(await getExerciseHistory(db, 'back-squat', { limit: 1 })).toHaveLength(1);
  });

  it('follows a session date change', async () => {
    const db = freshDb();
    const s = await startSession(db, { programSessionKey: 'A', nameSnapshot: 'A', date: '2026-10-01' });
    await addSet(db, set(s.id));
    await changeSessionDate(db, s.id, '2026-09-20');
    const h = await getExerciseHistory(db, 'back-squat', { before: '2026-09-21' });
    expect(h).toHaveLength(1);
    await deleteSession(db, s.id);
    expect(await db.sets.count()).toBe(0);
  });
});

describe('commits are write-once', () => {
  it('a second commit for the same session throws and keeps the first', async () => {
    const db = freshDb();
    const s = await startSession(db, { programSessionKey: 'A', nameSnapshot: 'A', date: '2026-11-20' });
    const c: Commit = { sessionId: s.id, committedAt: 1, readiness: 'green', targets: [] };
    await putCommit(db, c);
    await expect(putCommit(db, { ...c, committedAt: 2 })).rejects.toBeInstanceOf(CommitExistsError);
    expect((await getCommit(db, s.id))?.committedAt).toBe(1);
  });
  it('requires the session to exist', async () => {
    await expect(putCommit(freshDb(), { sessionId: 'x', committedAt: 1, readiness: 'green', targets: [] })).rejects.toThrow(/not found/);
  });
});

describe('profile, catalog, program, bodyweight, events', () => {
  it('profile keeps dated history of previous versions', async () => {
    const db = freshDb();
    await saveProfile(db, defaultProfile(), 1);
    await saveProfile(db, { ...defaultProfile(), sessionsPerWeekTarget: 4 }, 2);
    const p = await getProfile(db);
    expect(p?.sessionsPerWeekTarget).toBe(4);
    expect(p?.history).toHaveLength(1);
    expect(p?.history[0]).toMatchObject({ at: 2, profile: { sessionsPerWeekTarget: 3 } });
    expect(p?.history[0].profile).not.toHaveProperty('history');
  });

  it('seeds the catalog once without overwriting edits, finds by alias', async () => {
    const db = freshDb();
    const n = await seedCatalog(db);
    expect(n).toBeGreaterThan(40);
    await db.exercises.update('back-squat', { increment: 2.5 });
    expect(await seedCatalog(db)).toBe(0);
    expect((await db.exercises.get('back-squat'))?.increment).toBe(2.5);
    expect((await findExerciseByName(db, 'ohp'))?.id).toBe('overhead-press');
    expect((await listExercises(db)).length).toBe(n);
  });

  it('active program round-trips', async () => {
    const db = freshDb();
    await saveProgram(db, programFromTemplate('upper-lower'));
    await saveProgram(db, programFromTemplate());
    expect((await getActiveProgram(db))?.id).toBe('fullbody-abc');
  });

  it('bodyweight and events by date', async () => {
    const db = freshDb();
    await addBodyweight(db, '2026-11-02', 81);
    await addBodyweight(db, '2026-11-01', 80.5);
    expect((await listBodyweight(db)).map(b => b.kg)).toEqual([80.5, 81]);
    await logEvent(db, '2026-11-03', 'skip', { reason: 'sick' });
    await logEvent(db, '2026-11-04', 'pain');
    expect(await listEvents(db, { type: 'skip' })).toHaveLength(1);
  });
});

describe('persist + schema', () => {
  it('requestPersist is safe without navigator.storage and records the answer', async () => {
    const db = freshDb();
    expect(await requestPersist(db)).toBe(false);
    expect(await getMeta(db, 'persistGranted')).toBe(false);
    const g = globalThis as { navigator?: unknown };
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { value: { storage: { persisted: async () => false, persist: async () => true } }, configurable: true });
    try { expect(await requestPersist()).toBe(true); } finally {
      if (saved) Object.defineProperty(globalThis, 'navigator', saved); else delete g.navigator;
    }
  });

  it('opens at the current schema version', async () => {
    const db = freshDb();
    await db.open();
    expect(db.verno).toBe(SCHEMA_VERSION);
    expect(db.tables.map(t => t.name).sort()).toEqual(
      ['bodyweight', 'commits', 'events', 'exercises', 'meta', 'profile', 'program', 'sessions', 'sets', 'undo'],
    );
  });

  it('runs a migration hook when a later version is added', async () => {
    const idb = new IDBFactory();
    const o = { indexedDB: idb, IDBKeyRange: IDBKeyRange as unknown as typeof globalThis.IDBKeyRange };
    const v1 = openDb('mig', o);
    await v1.bodyweight.add({ id: 'b1', date: '2026-01-01', kg: 80 });
    v1.close();
    const v2 = openDb('mig', {
      ...o,
      migrations: [...MIGRATIONS, {
        version: SCHEMA_VERSION + 1,
        stores: { ...MIGRATIONS[0].stores, bodyweight: 'id, date, kg' },
        upgrade: tx => tx.table('bodyweight').toCollection().modify((b: { kg: number }) => { b.kg = b.kg * 2; }),
      }],
    });
    expect((await v2.bodyweight.get('b1'))?.kg).toBe(160);
    expect(v2.verno).toBe(SCHEMA_VERSION + 1);
  });
});
