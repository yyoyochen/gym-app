// Schema 2: benchmarkPopulation gains 'gym' (the gym-goer standards default).
import { describe, it, expect } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { openDb, upgradedPopulation, type ProfileRecord } from './schema';
import { defaultProfile, getProfile } from './repo';
import { migrateExport, restoreBackup, undoLastRestore, exportAll, type ExportDoc } from './backup';
import { freshDb } from './test-helpers';

const rec = (pop: string, history: string[] = []): ProfileRecord => ({
  ...defaultProfile(), benchmarkPopulation: pop as ProfileRecord['benchmarkPopulation'], id: 'me',
  history: history.map((h, i) => ({ at: i, profile: { ...defaultProfile(), benchmarkPopulation: h as ProfileRecord['benchmarkPopulation'] } })),
});

describe('upgradedPopulation', () => {
  it("an untouched 'tested' (the old default) becomes 'gym'", () => {
    expect(upgradedPopulation(rec('tested'))).toBe('gym');
    expect(upgradedPopulation(rec('tested', ['tested', 'tested']))).toBe('gym');
    expect(upgradedPopulation({})).toBe('gym');
  });
  it('a choice the user made is kept', () => {
    expect(upgradedPopulation(rec('all'))).toBe('all');
    expect(upgradedPopulation(rec('tested', ['all']))).toBe('tested');
    expect(upgradedPopulation(rec('gym'))).toBe('gym');
  });
  it('new profiles default to gym', () => {
    expect(defaultProfile().benchmarkPopulation).toBe('gym');
  });
});

describe('schema 1 → 2', () => {
  it('IndexedDB upgrade rewrites the stored profile', async () => {
    const o = { indexedDB: new IDBFactory(), IDBKeyRange: IDBKeyRange as unknown as typeof globalThis.IDBKeyRange };
    const v1 = openDb('v2-upgrade', { ...o, upToVersion: 1 });
    await v1.profile.put(rec('tested'));
    v1.close();
    const v2 = openDb('v2-upgrade', o);
    expect((await getProfile(v2))?.benchmarkPopulation).toBe('gym');
    expect(v2.verno).toBe(2);

    const w1 = openDb('v2-keep', { ...o, upToVersion: 1 });
    await w1.profile.put(rec('all'));
    w1.close();
    expect((await getProfile(openDb('v2-keep', o)))?.benchmarkPopulation).toBe('all');
  });

  it('a schema-1 backup restores with the population migrated', async () => {
    const db = freshDb();
    const doc = { ...(await exportAll(db)), schemaVersion: 1, profile: [rec('tested')] } as ExportDoc;
    expect(migrateExport(doc).profile[0].benchmarkPopulation).toBe('gym');
    expect(migrateExport({ ...doc, profile: [rec('all')] }).profile[0].benchmarkPopulation).toBe('all');
    await restoreBackup(db, doc);
    expect((await getProfile(db))?.benchmarkPopulation).toBe('gym');
  });

  it('undo of a restore migrates an older undo copy', async () => {
    const db = freshDb();
    await db.profile.put(rec('tested'));
    await restoreBackup(db, await exportAll(freshDb()));
    const row = await db.undo.get('lastRestore');
    await db.undo.put({ ...row!, snapshot: { ...(row!.snapshot as object), schemaVersion: 1 } });
    await undoLastRestore(db);
    expect((await getProfile(db))?.benchmarkPopulation).toBe('gym');
  });
});
