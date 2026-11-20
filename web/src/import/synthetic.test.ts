import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateDemoLog, DEFAULT_SEED } from '../../../tools/synthetic/generate.mjs';
import { freshDb } from '../db/test-helpers';
import { importNotionCsv, parseNotionCsv } from './notion';
import { listSessions, seedCatalog } from '../db/repo';

const FIXTURE = fileURLToPath(new URL('../../../tools/synthetic/fixtures/demo-log.csv', import.meta.url));
const dayNo = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };

describe('synthetic generator', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    expect(generateDemoLog({ seed: 42 })).toBe(generateDemoLog({ seed: 42 }));
    expect(generateDemoLog({ seed: 42 })).not.toBe(generateDemoLog({ seed: 43 }));
  });

  it('the committed fixture is exactly the default-seed output', () => {
    expect(readFileSync(FIXTURE, 'utf8')).toBe(generateDemoLog({ seed: DEFAULT_SEED }));
  });

  it('imports cleanly: ~9 months, a 12-day and a 21-day gap, blank weights and notes', async () => {
    const text = generateDemoLog();
    const parsed = parseNotionCsv(text);
    expect(parsed.skipped).toEqual([]);
    const db = freshDb();
    await seedCatalog(db);
    const r = await importNotionCsv(db, text);
    expect(r.setsAdded).toBe(parsed.rows.length);
    expect(r.blankWeight).toBeGreaterThan(0);
    expect(parsed.rows.some(x => x.notes.includes(','))).toBe(true);
    const dates = [...new Set((await listSessions(db)).map(s => s.date))];
    const span = dayNo(dates[dates.length - 1]) - dayNo(dates[0]);
    expect(span).toBeGreaterThan(250);
    const gaps = dates.slice(1).map((d, i) => dayNo(d) - dayNo(dates[i]));
    expect(gaps.filter(g => g >= 8).sort((a, b) => a - b)).toEqual([12, 21]);
    // The main lifts resolve to the catalog (benchmark lifts present for the demo).
    const ids = new Set((await db.sets.toArray()).map(s => s.exerciseId));
    for (const id of ['back-squat', 'barbell-bench-press', 'conventional-deadlift', 'overhead-press']) expect(ids.has(id)).toBe(true);
  });
});
