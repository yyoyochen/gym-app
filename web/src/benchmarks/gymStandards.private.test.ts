// Coverage of the real log (testdata/private, git-ignored) by the gym-goer
// standards. Runs only with GYMBRO_PRIVATE=1 and the files present. Names and
// numbers from the log are printed, never written into this public file.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { freshDb } from '../db/test-helpers';
import { getExerciseHistory, seedCatalog } from '../db/repo';
import { importNotionCsv, readAliasFile } from '../import/notion';
import { addDays } from '../engine/dates';
import type { GymStandardsData } from './gymStandards';
import { rateExercise } from './liftRating';
import { standardIdFor } from './standardMatch';

const dir = fileURLToPath(new URL('../../../testdata/private/', import.meta.url));
const EXPECTED = `${dir}expected.json`;
const ALIASES = `${dir}exercise-aliases.json`;
const enabled = process.env.GYMBRO_PRIVATE === '1' && existsSync(EXPECTED) && existsSync(ALIASES);
const X = enabled ? JSON.parse(readFileSync(EXPECTED, 'utf8')) : {};
const data: GymStandardsData = JSON.parse(readFileSync(fileURLToPath(new URL('../../public/standards/gym-standards.json', import.meta.url)), 'utf8'));

describe.skipIf(!enabled)('private: gym-goer standards over the real log', () => {
  it('maps most logged exercises to a standard and rates the main lifts', async () => {
    const db = freshDb();
    await seedCatalog(db);
    await importNotionCsv(db, readFileSync(`${dir}${X.csv}`, 'utf8'), { aliases: readAliasFile(JSON.parse(readFileSync(ALIASES, 'utf8'))) });
    const ids = [...new Set((await db.sets.toArray()).map(s => s.exerciseId))];
    const exercises = await Promise.all(ids.map(id => db.exercises.get(id)));
    expect(exercises.length).toBe(X.canonicalExercises);
    const mapped = exercises.filter(e => e && standardIdFor(e));
    const unmapped = exercises.filter(e => e && !standardIdFor(e)).map(e => e!.name);
    console.info(`[private] standards coverage: ${mapped.length} of ${exercises.length} logged exercises; unmapped: ${unmapped.join(', ')}`);
    expect(mapped.length).toBeGreaterThanOrEqual(Math.ceil(exercises.length * 0.6));

    const today = X.lastDate as string;
    const ctx = { sex: X.profile.sex as 'male' | 'female', bodyweightKg: X.profile.bodyweightKg as number, age: Number(today.slice(0, 4)) - (X.profile.birthYear as number) };
    const lines: string[] = [];
    for (const e of exercises) {
      if (!e) continue;
      const raw = await getExerciseHistory(db, e.id, { before: addDays(today, 1) });
      const history = raw.map(d => ({ date: d.session.date, sets: d.sets })).reverse();
      const st = rateExercise(data, e, history, today, ctx);
      if (st.kind === 'rated') lines.push(`${e.name} → ${st.standardId} ${st.basis} ${Math.round(st.value * 100) / 100}${st.addedKg !== undefined ? ` (+${Math.round(st.addedKg * 10) / 10} kg)` : ''}: ${st.level} ${st.percentile}`);
      else lines.push(`${e.name} → ${st.kind}`);
    }
    console.info(`[private] ratings (male, 80 kg, age ${ctx.age}, 90 days to ${today}):\n  ${lines.join('\n  ')}`);
  });
});
