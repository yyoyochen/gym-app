import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { freshDb } from '../db/test-helpers';
import { parseCsv } from './csv';
import { importNotionCsv, parseNotionCsv, parseNotionDate, planNotionImport, canonicalName, readAliasFile } from './notion';
import { getExerciseHistory, seedCatalog } from '../db/repo';

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), 'utf8');
const SAMPLE = fixture('sample-notion.csv');
const REORDERED = fixture('sample-notion-reordered.csv');
const ALIASES = { 'Bench Press': 'Barbell Bench Press', Squat: 'Back Squat' };

describe('csv parser', () => {
  it('handles BOM, quotes, doubled quotes, embedded commas/newlines, CRLF', () => {
    const rows = parseCsv('﻿a,b,c\r\n"x, y","say ""hi""","multi\nline"\r\n\r\n1,,3');
    expect(rows).toEqual([['a', 'b', 'c'], ['x, y', 'say "hi"', 'multi\nline'], ['1', '', '3']]);
  });
});

describe('parseNotionDate', () => {
  it.each([
    ['November 19, 2026', '2026-11-19'],
    ['Nov 9, 2026', '2026-11-09'],
    ['Sept 3, 2026', '2026-09-03'],
    ['3 April 2026', '2026-04-03'],
    ['2026-04-03', '2026-04-03'],
    ['2026/4/3', '2026-04-03'],
    ['January 1, 2026 6:30 AM', '2026-01-01'],
    ['March 4, 2026 → March 5, 2026', '2026-03-04'],
    ['February 30, 2026', null],
    ['Smarch 1, 2026', null],
    ['', null],
  ])('%s → %s', (input, out) => expect(parseNotionDate(input)).toBe(out));

  it('never shifts the day, whatever the timezone (pure string math)', () => {
    // Midnight-adjacent dates are where `new Date(str)` usually goes wrong.
    expect(parseNotionDate('December 31, 2025')).toBe('2025-12-31');
    expect(parseNotionDate('January 1, 2026')).toBe('2026-01-01');
  });
});

describe('parseNotionCsv', () => {
  it('reads every data row, blank fields as null, notes kept', () => {
    const p = parseNotionCsv(SAMPLE);
    expect(p.rows).toHaveLength(10);
    expect(p.skipped).toEqual([]);
    const grindy = p.rows[2];
    expect(grindy).toMatchObject({ date: '2026-03-04', label: 'Lower', exercise: 'Squat', order: 1, set: 3, reps: 4, weight: 70, notes: 'grindy, felt heavy' });
    expect(p.rows[3].weight).toBeNull();
    expect(p.rows[7].reps).toBeNull();
    expect(p.rows[9].notes).toBe('said "easy"');
  });

  it('matches columns by header name, not position', () => {
    const p = parseNotionCsv(REORDERED);
    expect(p.rows.map(r => [r.date, r.label, r.exercise, r.order, r.set, r.reps, r.weight, r.notes])).toEqual([
      ['2026-03-04', 'Lower', 'Squat', 1, 1, 5, 70, ''],
      ['2026-03-04', 'Lower', 'Squat', 1, 2, 5, 70, 'a, b'],
    ]);
  });

  it('skips rows it cannot read, with a reason; requires Date and Exercise columns', () => {
    const header = ['Date', 'Exercise', 'Reps'].join(',');
    const p = parseNotionCsv(`${header}\nsomeday,Squat,5\n"May 1, 2026",,5\n"May 1, 2026",Squat,five\n"May 1, 2026",Squat,5`);
    expect(p.rows).toHaveLength(1);
    expect(p.skipped.map(s => s.line)).toEqual([2, 3, 4]);
    expect(() => parseNotionCsv('Day,Lift\n')).not.toThrow();
    expect(() => parseNotionCsv('When,Lift\n')).toThrow(/Date/);
  });
});

describe('planNotionImport', () => {
  it('groups by date + label (blank label allowed) and keeps Order/Set', () => {
    const plan = planNotionImport(parseNotionCsv(SAMPLE).rows, ALIASES);
    expect(plan.map(s => [s.date, s.label, s.sets.length])).toEqual([
      ['2025-12-31', 'Upper', 1],
      ['2026-03-02', '', 3],
      ['2026-03-02', 'Upper', 1],
      ['2026-03-04', 'Lower', 5],
    ]);
    const lower = plan[3];
    expect(lower.sets.map(s => [s.canonical, s.slotOrder, s.setOrder, s.weight, s.flags])).toEqual([
      ['Back Squat', 1, 1, 70, []], ['Back Squat', 1, 2, 70, []], ['Back Squat', 1, 3, 70, []],
      ['Leg Curl Machine', 2, 1, 0, ['blank_weight']], ['Leg Curl Machine', 2, 2, 35, []],
    ]);
  });

  it('importKey is stable and order-independent, and changes when a row changes', () => {
    const rows = parseNotionCsv(SAMPLE).rows;
    const a = planNotionImport(rows);
    const b = planNotionImport([...rows].reverse());
    expect(a.map(s => s.importKey)).toEqual(b.map(s => s.importKey));
    const edited = rows.map((r, i) => (i === 0 ? { ...r, reps: 6, raw: r.raw + 'x' } : r));
    expect(planNotionImport(edited)[3].importKey).not.toBe(a[3].importKey);
  });

  it('alias lookup is exact first, then case/punctuation-insensitive', () => {
    expect(canonicalName('bench press', ALIASES)).toBe('Barbell Bench Press');
    expect(canonicalName('Front Squat', ALIASES)).toBe('Front Squat');
    expect(readAliasFile({ aliases: { a: 'b', n: 1 } })).toEqual({ a: 'b' });
    expect(() => readAliasFile({})).toThrow();
  });
});

describe('importNotionCsv', () => {
  it('writes sessions + sets, auto-creates unknown exercises, and re-import is a no-op', async () => {
    const db = freshDb();
    await seedCatalog(db);
    const r1 = await importNotionCsv(db, SAMPLE, { aliases: ALIASES });
    expect(r1).toMatchObject({ rowsRead: 10, sessionsAdded: 4, setsAdded: 10, blankWeight: 1, blankReps: 1, firstDate: '2025-12-31', lastDate: '2026-03-04' });
    expect(r1.exercisesCreated.sort()).toEqual(['Leg Curl Machine', 'Zercher Carry Thing']);
    expect(await db.sets.count()).toBe(10);

    const legCurl = (await db.exercises.toArray()).find(e => e.name === 'Leg Curl Machine')!;
    expect(legCurl).toMatchObject({ slotType: 'isolation', increment: 1, areasLoaded: ['knee'] });
    const carry = (await db.exercises.toArray()).find(e => e.name === 'Zercher Carry Thing')!;
    expect(carry.slotType).toBe('compound');

    // OHP resolves to the catalog's Overhead Press and remembers the raw name.
    const ohp = await getExerciseHistory(db, 'overhead-press');
    expect(ohp.map(d => d.sets[0].weight)).toEqual([35, 32.5]);
    expect(ohp[0].sets[0].exerciseNameSnapshot).toBe('OHP');

    const blank = (await db.sets.toArray()).find(s => s.importFlags?.includes('blank_weight'))!;
    expect(blank).toMatchObject({ weight: 0, reps: 12, exerciseNameSnapshot: 'Leg Curl Machine' });
    const sessions = await db.sessions.toArray();
    expect(sessions.every(s => s.sealed && s.importKey?.startsWith('notion:'))).toBe(true);
    expect(sessions.find(s => s.date === '2026-03-02' && s.programSessionKey === 'import:')?.nameSnapshot).toBe('Imported session');

    const r2 = await importNotionCsv(db, SAMPLE, { aliases: ALIASES });
    expect(r2).toMatchObject({ sessionsAdded: 0, setsAdded: 0, sessionsUnchanged: 4, conflicts: [] });
    expect(r2.exercisesCreated).toEqual([]);
    expect(await db.sets.count()).toBe(10);
  });

  it('a changed session on re-import is reported as a conflict, not duplicated', async () => {
    const db = freshDb();
    await importNotionCsv(db, SAMPLE, { aliases: ALIASES });
    const changed = SAMPLE.replace('"grindy, felt heavy"', '"grindy"');
    const r = await importNotionCsv(db, changed, { aliases: ALIASES });
    expect(r.conflicts).toEqual([{ date: '2026-03-04', label: 'Lower' }]);
    expect(r.sessionsUnchanged).toBe(3);
    expect(await db.sets.count()).toBe(10);
  });

  it('the reordered-header variant imports the same way', async () => {
    const db = freshDb();
    const r = await importNotionCsv(db, REORDERED, { aliases: ALIASES });
    expect(r).toMatchObject({ sessionsAdded: 1, setsAdded: 2 });
    expect((await db.sets.toArray()).map(s => s.exerciseId)).toEqual(['back-squat', 'back-squat']);
  });
});
