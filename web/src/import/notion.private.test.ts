// Imports the real Notion export (testdata/private, git-ignored). Runs only
// with GYMBRO_PRIVATE=1 and the files present. Expected facts about the log
// live in testdata/private/expected.json, never in this public file.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { freshDb } from '../db/test-helpers';
import { seedCatalog } from '../db/repo';
import { importNotionCsv, parseNotionCsv, readAliasFile } from './notion';
import { parseCsv } from './csv';

const dir = fileURLToPath(new URL('../../../testdata/private/', import.meta.url));
const EXPECTED = `${dir}expected.json`;
const ALIASES = `${dir}exercise-aliases.json`;
const enabled = process.env.GYMBRO_PRIVATE === '1' && existsSync(EXPECTED) && existsSync(ALIASES);
const X = enabled ? JSON.parse(readFileSync(EXPECTED, 'utf8')) : {};
const CSV = `${dir}${X.csv}`;

describe.skipIf(!enabled)('private: real Notion log import', () => {
  it('imports every row, groups sessions, canonicalises exercises; re-import adds nothing', async () => {
    const text = readFileSync(CSV, 'utf8');
    const aliases = readAliasFile(JSON.parse(readFileSync(ALIASES, 'utf8')));
    const dataRows = parseCsv(text).length - 1;
    const parsed = parseNotionCsv(text);
    const pairs = new Set(parsed.rows.map(r => `${r.date}|${r.label}`));

    const db = freshDb();
    await seedCatalog(db);
    const r = await importNotionCsv(db, text, { aliases });

    expect(dataRows).toBe(X.dataRows);
    expect(r.skipped).toEqual([]);
    expect(r.setsAdded).toBe(dataRows);
    expect(await db.sets.count()).toBe(dataRows);
    expect(pairs.size).toBe(X.sessions);
    expect(await db.sessions.count()).toBe(pairs.size);
    const exerciseIds = new Set((await db.sets.toArray()).map(s => s.exerciseId));
    expect(exerciseIds.size).toBe(X.canonicalExercises);
    expect(r.firstDate).toBe(X.firstDate);
    expect(r.lastDate).toBe(X.lastDate);

    console.info(`[private] rows=${dataRows} sessions=${pairs.size} exercises=${exerciseIds.size} ` +
      `blankWeight=${r.blankWeight} blankReps=${r.blankReps} created=${r.exercisesCreated.length}`);

    const again = await importNotionCsv(db, text, { aliases });
    expect(again.setsAdded).toBe(0);
    expect(again.sessionsAdded).toBe(0);
    expect(again.conflicts).toEqual([]);
    expect(await db.sets.count()).toBe(dataRows);
  });
});
