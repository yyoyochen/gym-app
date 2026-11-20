import { describe, it, expect } from 'vitest';
import { freshDb } from './test-helpers';
import type { GymDb } from './schema';
import {
  addBodyweight, addSet, defaultProfile, logEvent, putCommit, saveProfile, saveProgram, seedCatalog,
  sealSession, setMeta, startSession, getMeta,
} from './repo';
import {
  exportAll, exportBackupJson, restoreBackup, undoLastRestore, validateExport, wipeAll, hasUndo,
  exportSetsCsv, RestoreError, type ExportDoc,
} from './backup';
import { programFromTemplate } from '../domain/templates';
import { parseCsv } from '../import/csv';

async function populate(db: GymDb, tag = 'x') {
  await seedCatalog(db);
  await saveProfile(db, { ...defaultProfile(), sex: 'M', birthYear: 1990 }, 1);
  await saveProfile(db, { ...defaultProfile(), sex: 'M', birthYear: 1990, heightCm: 178 }, 2);
  await saveProgram(db, programFromTemplate());
  const s = await startSession(db, { programSessionKey: 'A', nameSnapshot: `A ${tag}`, date: '2026-11-18', now: 1000 });
  await putCommit(db, {
    sessionId: s.id, committedAt: 1001, readiness: 'green',
    targets: [{
      slotId: 'fullbody-abc.A.1', exerciseId: 'back-squat', exerciseName: 'Back Squat', model: 'topset', weight: 100,
      targetReps: 6, targetSets: 3, rirFloor: 2, topWeight: 115, topReps: 2, addedWeight: false, prevTop: [112.5],
      isNew: false, criterion: 'Top double at 115 @ ≥2 RIR, then 3 × 6 at 100', why: 'Last top double was 2 RIR+1', rule: 'topset_up',
    }],
  });
  await addSet(db, { sessionId: s.id, exerciseId: 'back-squat', exerciseNameSnapshot: 'Back Squat', slotOrder: 1, kind: 'top', weight: 115, reps: 2, rir: 2, loggedAt: 1100 });
  await addSet(db, { sessionId: s.id, exerciseId: 'back-squat', exerciseNameSnapshot: 'Back Squat', slotOrder: 1, kind: 'backoff', weight: 100, reps: 6, rir: 2, note: 'belt, "tight"', pain: { area: 'knee', side: 'left', severity: 1 }, loggedAt: 1200 });
  await sealSession(db, s.id, 2000);
  await addBodyweight(db, '2026-11-18', 80.2);
  await logEvent(db, '2026-11-17', 'skip', { reason: 'tired' });
  await setMeta(db, 'demoMode', false);
}

const strip = (d: ExportDoc) => ({ ...d, exportedAt: '' });

describe('export → wipe → restore', () => {
  it('round-trips every store deep-equal, including commits and profile history', async () => {
    const db = freshDb();
    await populate(db);
    const before = await exportAll(db, 5000);
    expect(before.sets).toHaveLength(2);
    expect(before.commits).toHaveLength(1);
    expect(before.profile[0].history).toHaveLength(1);
    const json = JSON.stringify(before);
    await wipeAll(db);
    expect(await db.sessions.count()).toBe(0);
    await restoreBackup(db, json, 6000);
    const after = await exportAll(db, 5000);
    expect(strip({ ...after, meta: after.meta.filter(m => m.key !== 'lastRestoreAt') })).toEqual(strip(before));
    // and into a different, empty database
    const other = freshDb();
    await restoreBackup(other, before);
    const o = await exportAll(other, 5000);
    expect({ ...o, meta: o.meta.filter(m => m.key !== 'lastRestoreAt') }).toEqual(before);
  });

  it('exportBackupJson records lastExportAt and an export event', async () => {
    const db = freshDb();
    const json = await exportBackupJson(db, Date.UTC(2026, 10, 20, 12));
    expect(JSON.parse(json)).toMatchObject({ format: 'gymbro-backup', schemaVersion: 1, exportedAt: '2026-11-20T12:00:00.000Z' });
    expect(await getMeta(db, 'lastExportAt')).toBe(Date.UTC(2026, 10, 20, 12));
    expect((await db.events.toArray()).map(e => e.type)).toEqual(['export']);
  });

  it('device meta (persistGranted) is neither exported nor overwritten', async () => {
    const db = freshDb();
    await setMeta(db, 'persistGranted', true);
    const doc = await exportAll(db);
    expect(doc.meta.find(m => m.key === 'persistGranted')).toBeUndefined();
    await restoreBackup(db, { ...doc, meta: [...doc.meta, { key: 'persistGranted', value: false }] });
    expect(await getMeta(db, 'persistGranted')).toBe(true);
  });
});

describe('restore safety', () => {
  it('rejects invalid backups and changes nothing', async () => {
    const db = freshDb();
    await populate(db);
    const good = await exportAll(db);
    const bad = { ...good, sets: [...good.sets, { ...good.sets[0], id: 'orphan', sessionId: 'missing' }] };
    await expect(restoreBackup(db, bad)).rejects.toBeInstanceOf(RestoreError);
    await expect(restoreBackup(db, '{not json')).rejects.toBeInstanceOf(RestoreError);
    await expect(restoreBackup(db, { ...good, schemaVersion: 99 })).rejects.toThrow(/newer app/);
    expect(await db.sets.count()).toBe(2);
    expect(await hasUndo(db)).toBe(false);
  });

  it('validate catches duplicates and malformed rows', () => {
    const v = validateExport({
      format: 'gymbro-backup', schemaVersion: 1, exportedAt: '', profile: [], exercises: [], program: [],
      sessions: [{ id: 's', date: '2026-13-01', startedAt: 1, sealed: true }], commits: [], sets: [], bodyweight: [],
      events: [], meta: [],
    });
    expect(v.ok).toBe(false);
    expect(v.errors[0]).toMatch(/sessions\[0\]/);
    expect(validateExport([]).ok).toBe(false);
    expect(validateExport({ format: 'other' }).errors.length).toBeGreaterThan(1);
  });

  it('undoLastRestore puts back exactly what was there, once', async () => {
    const db = freshDb();
    await populate(db, 'mine');
    const mine = await exportAll(db, 1);
    const otherDb = freshDb();
    await populate(otherDb, 'theirs');
    const theirs = await exportAll(otherDb, 1);

    await restoreBackup(db, theirs);
    expect((await db.sessions.toArray())[0].nameSnapshot).toBe('A theirs');
    expect(await hasUndo(db)).toBe(true);
    await undoLastRestore(db);
    const back = await exportAll(db, 1);
    expect(back).toEqual(mine);
    expect(await hasUndo(db)).toBe(false);
    await expect(undoLastRestore(db)).rejects.toThrow(/Nothing to undo/);
  });
});

describe('CSV export', () => {
  it('one row per set, quoted where needed', async () => {
    const db = freshDb();
    await populate(db);
    const csv = await exportSetsCsv(db);
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(3);
    expect(rows[0][0]).toBe('date');
    const h = rows[0];
    const r = Object.fromEntries(h.map((k, i) => [k, rows[2][i]]));
    expect(r).toMatchObject({ date: '2026-11-18', exercise: 'Back Squat', slot: '1', set: '2', kind: 'backoff', weight_kg: '100', reps: '6', rir: '2', pain_area: 'knee', note: 'belt, "tight"' });
  });
});
