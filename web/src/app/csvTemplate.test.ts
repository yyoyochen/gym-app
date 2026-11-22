import { describe, expect, it } from 'vitest';
import { freshDb } from '../db/test-helpers';
import { seedCatalog } from '../db';
import { parseCsv } from '../import/csv';
import { detectFormat } from '../import/formats';
import { importCsv } from '../import/notion';
import { CSV_TEMPLATE } from './csvTemplate';

describe('the CSV template', () => {
  it('is the GymBro template, and its example rows import', async () => {
    expect(detectFormat(parseCsv(CSV_TEMPLATE)[0])).toBe('gymbro');
    const db = freshDb();
    await seedCatalog(db);
    const r = await importCsv(db, CSV_TEMPLATE);
    expect(r).toMatchObject({ format: 'gymbro', sessionsAdded: 1, setsAdded: 3, skipped: [] });
  });
});
