// Parity on the real Notion log. The fixtures live in testdata/private/engine/
// (git-ignored) and are only read with GYMBRO_PRIVATE=1 (npm run test:private);
// everywhere else, including CI, this suite is skipped.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { SetEntry } from '../domain/types';
import { exercise, slot } from './__fixtures__/build';
import { grade, minimumToKeep, prescribe } from './models';
import { checkCase, type ParityCase, type RealLogContext } from './port/harness';
import type { LegacySetRow } from './port/types';

const dir = fileURLToPath(new URL('../../../testdata/private/engine/', import.meta.url));
const file = `${dir}parity-real-log.json`;
const enabled = process.env.GYMBRO_PRIVATE === '1' && existsSync(file);

describe.skipIf(!enabled)('parity with the Python engine on the real log (private)', () => {
  const data = enabled ? JSON.parse(readFileSync(file, 'utf8')) : { cases: [], sets: [], program: {} };
  const ctx: RealLogContext = { sets: data.sets, program: data.program };
  const cases: ParityCase[] = data.cases;
  const byFn = new Map<string, ParityCase[]>();
  for (const c of cases) byFn.set(c.fn, [...(byFn.get(c.fn) ?? []), c]);

  it('loaded the log', () => {
    expect(ctx.sets.length).toBeGreaterThan(1000);
    expect(cases.length).toBeGreaterThan(1000);
  });
  for (const [fn, list] of byFn) {
    it(`${fn} (${list.length} cases, ${list.filter((c) => c.expectChange).length} expectChange)`, () => {
      const errs = list.flatMap((c) => checkCase(c, ctx));
      expect(errs.slice(0, 5).join('\n'), `${errs.length} mismatches`).toBe('');
    });
  }
});

// The new models on real histories: every (session, lift) in the log,
// prescribed under each model, then logged exactly as prescribed, must grade
// hit (or new) — promise shown == promise graded on real data, not just synthetic.
describe.skipIf(!enabled)('new models on the real log (private)', () => {
  const data = enabled ? JSON.parse(readFileSync(file, 'utf8')) : { sets: [] };
  const rows: LegacySetRow[] = data.sets;
  it('as prescribed → hit for every model', () => {
    const byLift = new Map<string, Map<string, SetEntry[]>>();
    rows.forEach((r, i) => {
      const days = byLift.get(r.exercise) ?? new Map<string, SetEntry[]>();
      byLift.set(r.exercise, days);
      const list = days.get(r.date) ?? [];
      days.set(r.date, list);
      list.push({ id: `r${i}`, sessionId: r.date, exerciseId: r.exercise, exerciseNameSnapshot: r.exercise, slotOrder: r.order,
        setOrder: r.set_num, kind: 'working', weight: r.weight, reps: r.reps, loggedAt: i });
    });
    let checked = 0;
    for (const [lift, days] of byLift) {
      const ex = exercise({ id: lift, name: lift, bodyweightFactor: /pull-up|dip|chin/i.test(lift) ? 0.95 : 0 });
      const hist = [...days].map(([date, sets]) => ({ date, sessionId: date, sets }));
      for (const h of hist) {
        for (const model of ['double', 'linear5x5', 'topset', 'fixed'] as const) {
          const t = prescribe(slot(model, { sets: 3, repMin: 6, repMax: 8, topReps: 1, backoffPct: 80, backoffSets: 3 }, lift), ex, hist,
            { today: h.date, bodyweightKg: 80 });
          const planned = minimumToKeep(t).map((p, i) => ({ ...h.sets[0], id: `p${i}`, kind: p.kind, weight: p.weight, reps: p.reps,
            ...(p.rir !== undefined ? { rir: p.rir } : {}) }));
          expect(grade(t, planned).verdict, `${lift} ${h.date} ${model}: ${t.criterion}`).toBe(t.isNew ? 'new' : 'hit');
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});
