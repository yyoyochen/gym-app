// Runs the real converter on the real Strength Level CSV (outside the repo, in
// ../strength_level/). Runs only with GYMBRO_PRIVATE=1 and the file present.
// Checks mapping only: no numbers are printed or written here.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { defaultCatalog } from '../domain/catalog';
import { standardIdFor } from './standardMatch';
import { SL_NAME_TO_STD, convertStrengthLevel } from '../../../tools/standards/strength-level.mjs';

const dir = fileURLToPath(new URL('../../../../strength_level/', import.meta.url));
const csv = existsSync(dir)
  ? readdirSync(dir).filter(f => /^strength_standards_all_kg.*\.csv$/.test(f)).sort((a, b) => statSync(dir + b).mtimeMs - statSync(dir + a).mtimeMs)[0]
  : undefined;
const enabled = process.env.GYMBRO_PRIVATE === '1' && !!csv;

describe.skipIf(!enabled)('private: the real Strength Level CSV converts and maps', () => {
  const res = enabled ? convertStrengthLevel(readFileSync(dir + csv!, 'utf8')) : null;

  it('every exercise name in the map still exists in the CSV and converts to a table', () => {
    const missing = Object.entries(SL_NAME_TO_STD).filter(([, id]) => !res!.tables[id]).map(([name]) => name);
    expect(missing, 'renamed or removed in the CSV: these would silently fall back to the model').toEqual([]);
  });

  it('every catalog lift with a Strength Level equivalent has a table', () => {
    const covered = new Set(Object.values(SL_NAME_TO_STD));
    const gaps = defaultCatalog().filter(e => { const id = standardIdFor(e); return id && covered.has(id) && !res!.tables[id]; }).map(e => e.name);
    expect(gaps).toEqual([]);
  });

  it('each table has matching, sorted bodyweight rows of five finite thresholds', () => {
    for (const [id, t] of Object.entries(res!.tables) as [string, { bw: number[]; male: number[][] }][]) {
      expect(t.bw.length, id).toBe(t.male.length);
      expect([...t.bw].sort((a, b) => a - b), id).toEqual(t.bw);
      for (const row of t.male) {
        expect(row.length, id).toBe(5);
        expect(row.every(Number.isFinite), id).toBe(true);
      }
    }
  });
});
