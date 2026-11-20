import { describe, expect, it } from 'vitest';
import type { ModelKind, SetEntry, Target } from '../domain/types';
import { exercise, rng, session, set, slot } from './__fixtures__/build';
import { grade, minimumToKeep, prescribe, toLegacy, type LiftSession, type PrescribeContext } from './models';
import type { PainStatus } from './pain';

const bench = exercise();
const ctx = (over: Partial<PrescribeContext> = {}): PrescribeContext => ({ today: '2026-11-21', ...over });
const sets = (w: number, reps: number[], over: Partial<SetEntry> = {}) => reps.map((r) => set(w, r, over));
const top = (w: number, reps: number, rir?: number, over: Partial<SetEntry> = {}) =>
  set(w, reps, { kind: 'top', ...(rir !== undefined ? { rir } : {}), ...over });
const backs = (w: number, reps: number[], rir?: number) =>
  reps.map((r) => set(w, r, { kind: 'backoff', ...(rir !== undefined ? { rir } : {}) }));

describe('prescribe: double progression', () => {
  const sl = slot('double', { sets: 3, repMin: 6, repMax: 8 });

  it('new lift starts from the starting weight and says it is a baseline', () => {
    const t = prescribe(sl, bench, [], ctx({ startingWeight: 60 }));
    expect(t).toMatchObject({ isNew: true, weight: 60, rule: 'baseline', model: 'double', rirFloor: 2 });
    expect(t.criterion).toBe('Log your sets at 60kg — this session sets the baseline.');
  });

  it('chases reps at the same weight, word for word with the old engine', () => {
    const t = prescribe(sl, bench, [session('2026-11-18', sets(80, [8, 7, 7]))], ctx());
    expect(t).toMatchObject({ weight: 80, targetReps: 8, rule: 'double_progression', prevTop: [8, 7, 7] });
    expect(t.why).toBe('stay at 80kg — add a rep toward 8 on every set (last: [8, 7, 7])');
    expect(t.criterion).toBe('Match or beat 22 total reps at 80kg (last time: [8, 7, 7]).');
  });

  it('adds one increment once the ceiling is cleared on 2+ sets', () => {
    const t = prescribe(sl, bench, [session('2026-11-18', sets(80, [8, 8, 8]))], ctx());
    expect(t).toMatchObject({ weight: 82.5, targetReps: 6, addedWeight: true, rule: 'progressive_overload' });
  });

  it('red readiness defers the jump (tired-day autoregulation)', () => {
    const t = prescribe(sl, bench, [session('2026-11-18', sets(80, [8, 8, 8]))], ctx({ readiness: 'red' }));
    expect(t).toMatchObject({ weight: 80, addedWeight: false, rule: 'evidence_threshold', rirFloor: 3 });
    expect(t.why).toMatch(/eased for a tired day/);
  });

  it('a pain hold refuses the jump and says why', () => {
    const pain: PainStatus = { exerciseId: 'bench', hold: true, painCheck: false, regressPct: 0, raiseRir: 0,
      reasons: ['pain flagged on this lift last session (severity 1) — hold the load'] };
    const t = prescribe(sl, bench, [session('2026-11-18', sets(80, [8, 8, 8]))], ctx({ pain }));
    expect(t.weight).toBe(80);
    expect(t.why).toMatch(/held: pain flagged/);
  });

  it('first session after an 8+ day gap: no jump, floor raised', () => {
    const t = prescribe(sl, bench, [session('2026-11-08', sets(80, [8, 8, 8]))], ctx({ gapDays: 13, reentry: 'note' }));
    expect(t.weight).toBe(80);
    expect(t.rirFloor).toBe(3);
  });

  it('never reads today\'s own sets', () => {
    const hist = [session('2026-11-18', sets(80, [8, 7, 7])), session('2026-11-21', sets(80, [8, 8, 8]))];
    expect(prescribe(sl, bench, hist, ctx()).weight).toBe(80);
  });

  it('warm-ups never count', () => {
    const hist = [session('2026-11-18', [...sets(100, [3, 3, 3], { kind: 'warmup' }), ...sets(80, [8, 7, 7])])];
    expect(prescribe(sl, bench, hist, ctx()).weight).toBe(80);
  });
});

describe('prescribe: linear 5x5', () => {
  const sl = slot('linear5x5', { sets: 5, repMin: 5, repMax: 5 });
  it('seeds from recent e1RM when the history is hypertrophy work', () => {
    const t = prescribe(sl, bench, [session('2026-11-18', sets(100, [8, 8, 8]))], ctx());
    expect(t.rule).toBe('training_max_seed');
    expect(t.weight).toBe(100);
    expect(t.why).toBe('seed from recent best (e1RM 126.7kg x 93% training max) — start 5x5 at 100kg');
  });
  it('red readiness eases the load to ~92.5%', () => {
    const t = prescribe(sl, bench, [session('2026-11-18', sets(100, [5, 5, 5, 5, 5]))], ctx({ readiness: 'red' }));
    expect(t.weight).toBe(92.5); // 102.5 × 0.925 = 94.8 → floored to 92.5
  });
});

describe('prescribe: top set + back-offs', () => {
  const sl = slot('topset', { sets: 3, repMin: 6, repMax: 8, topReps: 1, backoffPct: 0.8, backoffSets: 3, rirFloor: 2 });
  const last = (topRir: number | undefined, backReps = [6, 6, 6], over: Partial<SetEntry> = {}) =>
    [session('2026-11-18', [top(100, 1, topRir, over), ...backs(80, backReps)])];

  it('top finished at floor + 1 RIR or more: +1 increment', () => {
    const t = prescribe(sl, bench, last(3), ctx());
    expect(t).toMatchObject({ topWeight: 102.5, rule: 'topset_up', weight: 80, targetReps: 7, targetSets: 3 });
    expect(t.criterion).toBe('Top single at 102.5kg (≥ 2 RIR), then 3 × 7+ at 80kg. Both parts count; a heavier top single at the same effort beats it.');
  });
  it('at the floor: repeat', () => {
    expect(prescribe(sl, bench, last(2), ctx())).toMatchObject({ topWeight: 100, rule: 'topset_repeat' });
  });
  it('below the floor: −1 increment', () => {
    expect(prescribe(sl, bench, last(1), ctx())).toMatchObject({ topWeight: 97.5, rule: 'topset_down' });
  });
  it('failed: −1 increment', () => {
    expect(prescribe(sl, bench, last(3, [6, 6, 6], { failed: true }), ctx())).toMatchObject({ topWeight: 97.5, rule: 'topset_down' });
  });
  it('no effort logged: repeat and ask for a rating', () => {
    expect(prescribe(sl, bench, last(undefined), ctx()).why).toMatch(/no effort logged/);
  });
  it('red readiness holds the top set', () => {
    const t = prescribe(sl, bench, last(3), ctx({ readiness: 'red' }));
    expect(t.topWeight).toBe(100);
    expect(t.rirFloor).toBe(3);
  });
  it('back-offs at the ceiling on every set earn +1 increment and reset reps', () => {
    const t = prescribe(sl, bench, last(2, [8, 8, 8]), ctx());
    expect(t).toMatchObject({ weight: 82.5, targetReps: 6 });
  });
  it('back-offs too easy (4+ RIR) also earn +1 increment (the coach note)', () => {
    const hist = [session('2026-11-18', [top(100, 1, 2), ...backs(80, [6, 6, 6], 4)])];
    expect(prescribe(sl, bench, hist, ctx())).toMatchObject({ weight: 82.5, targetReps: 6 });
  });
  it('back-offs follow the top set down', () => {
    const t = prescribe(sl, bench, last(0), ctx());
    expect(t.topWeight).toBe(97.5);
    expect(t.weight).toBe(77.5);
  });
  it('first top-set session seeds from e1RM at reps + floor', () => {
    const t = prescribe(sl, bench, [session('2026-11-18', sets(100, [5, 5, 5]))], ctx());
    // e1RM 116.7 → single @ 2 RIR ≈ 116.7 / 1.1 = 106.1 → 105, then capped at one increment over 100.
    expect(t.rule).toBe('topset_seed');
    expect(t.topWeight).toBe(102.5);
    expect(t.why).toMatch(/jumps are capped at one increment/);
  });
  it('shows the floor in RPE when that scale is chosen', () => {
    expect(prescribe(sl, bench, last(2), ctx({ effortScale: 'rpe' })).criterion).toMatch(/\(≤ RPE 8\)/);
  });
});

describe('prescribe: fixed, re-entry and pain regression', () => {
  it('fixed holds the last worked weight and never progresses', () => {
    const t = prescribe(slot('fixed', { sets: 3, repMin: 10, repMax: 10 }), bench, [session('2026-11-18', sets(20, [12, 12, 12]))], ctx());
    expect(t).toMatchObject({ model: 'fixed', weight: 20, targetReps: 10, targetSets: 3, rule: 'fixed_hold' });
    expect(t.criterion).toBe('Do 3 × 10 at 20kg — done is the goal; there is no beat.');
  });
  it('21+ day gap: 3 × 8 at the last logged working weight', () => {
    const t = prescribe(slot('double'), bench, [session('2026-10-01', sets(80, [8, 8, 7]))], ctx({ gapDays: 51, reentry: 'block' }));
    expect(t).toMatchObject({ model: 'fixed', weight: 80, targetReps: 8, targetSets: 3, rule: 'reentry_block', rirFloor: 3 });
  });
  it('pain regression takes 10% off and raises the floor', () => {
    const pain: PainStatus = { exerciseId: 'bench', hold: false, painCheck: false, regressPct: 0.1, raiseRir: 1,
      reasons: ['two pain flags (severity 2+) on the left shoulder within 14 days — regress 10% and +1 RIR until a clean session'] };
    const t = prescribe(slot('topset', { topReps: 1, backoffPct: 0.8, backoffSets: 3 }), bench,
      [session('2026-11-18', [top(100, 1, 2), ...backs(80, [6, 6, 6])])], ctx({ pain }));
    expect(t).toMatchObject({ weight: 90, rule: 'pain_regress', rirFloor: 3 });
  });
});

describe('grade', () => {
  const t: Target = {
    slotId: 'x', exerciseId: 'bench', exerciseName: 'Bench Press', model: 'topset', weight: 80, targetReps: 6, repMax: 8,
    targetSets: 3, rirFloor: 2, topWeight: 100, topReps: 1, addedWeight: false, prevTop: [], isNew: false, criterion: '', why: '', rule: '',
  };
  it('topset hit: top within floor + back-offs complete', () => {
    expect(grade(t, [top(100, 1, 2), ...backs(80, [6, 6, 6])]).verdict).toBe('hit');
  });
  it('topset beat: heavier top at the same effort', () => {
    expect(grade(t, [top(102.5, 1, 2), ...backs(80, [6, 6, 6])]).verdict).toBe('beat');
  });
  it('topset missed when the top set went past the floor', () => {
    const g = grade(t, [top(100, 1, 1), ...backs(80, [6, 6, 6])], 'rpe');
    expect(g).toMatchObject({ verdict: 'missed', detail: 'top set at 100kg went past the floor (≤ RPE 8)' });
  });
  it('topset missed when back-offs are short', () => {
    expect(grade(t, [top(100, 1, 2), ...backs(80, [6, 6, 5])]).detail).toBe('top set done; back-offs 2/3 sets of 6 at 80kg');
  });
  it('topset works on logs without set kinds (heaviest set is the top)', () => {
    expect(grade(t, [set(100, 1), ...sets(80, [6, 6, 6])]).verdict).toBe('hit');
  });
  it('fixed is never beat', () => {
    const f: Target = { ...t, model: 'fixed', weight: 20, targetReps: 10, targetSets: 3, topWeight: undefined, topReps: undefined };
    expect(grade(f, sets(25, [15, 15, 15, 15])).verdict).toBe('hit');
    expect(grade(f, sets(20, [10, 10])).verdict).toBe('missed');
  });
  it('warm-ups are ignored', () => {
    const f: Target = { ...t, model: 'fixed', weight: 20, targetReps: 10, targetSets: 2 };
    expect(grade(f, sets(20, [10, 10], { kind: 'warmup' })).verdict).toBe('missed');
  });
  it('toLegacy round-trips the fields the old grader reads', () => {
    expect(toLegacy({ ...t, model: 'linear5x5' }).mode).toBe('strength');
  });
});

describe('property: a session logged exactly as prescribed grades hit', () => {
  const models: ModelKind[] = ['double', 'linear5x5', 'topset', 'fixed'];
  const r = rng(20261121);

  function randomHistory(model: ModelKind): LiftSession[] {
    const out: LiftSession[] = [];
    let w = r.int(16, 60) * 2.5;
    for (let d = 0; d < r.int(0, 5); d++) {
      const date = `2026-10-${String(10 + d * 3).padStart(2, '0')}`;
      const s: SetEntry[] = [];
      if (model === 'topset' && r.next() < 0.8) s.push(top(w, r.pick([1, 1, 2]), r.pick([undefined, 0, 1, 2, 3, 4]), { failed: r.next() < 0.1 }));
      for (let i = 0; i < r.int(1, 5); i++) {
        s.push(set(model === 'topset' ? w * 0.8 : w + r.pick([0, 0, 2.5, -2.5]), r.int(3, 12),
          { kind: model === 'topset' ? 'backoff' : 'working', ...(r.next() < 0.5 ? { rir: r.int(0, 5) } : {}) }));
      }
      out.push(session(date, s));
      w += r.pick([0, 2.5, -2.5]);
    }
    return out;
  }

  for (const model of models) {
    it(`${model}: as prescribed → hit (new → new); one rep short → missed`, () => {
      for (let i = 0; i < 300; i++) {
        const lo = r.pick([5, 6, 8, 10]);
        const sl = slot(model, { sets: r.int(2, 5), repMin: lo, repMax: lo + r.pick([0, 2, 4]), rirFloor: r.pick([1, 2, 3]),
          topReps: r.pick([1, 2, 3]), backoffPct: r.pick([0.75, 0.8, 0.85]), backoffSets: r.int(2, 4) });
        const c = ctx({
          readiness: r.pick(['green', 'amber', 'red'] as const), effortScale: r.pick(['rir', 'rpe'] as const),
          startingWeight: r.pick([undefined, 40]), gapDays: r.pick([null, 2, 9]), bodyweightKg: 80,
        });
        const t = prescribe(sl, bench, randomHistory(model), c);
        const planned = minimumToKeep(t).map((p) => set(p.weight, p.reps, { kind: p.kind, ...(p.rir !== undefined ? { rir: p.rir } : {}) }));
        const g = grade(t, planned, c.effortScale);
        const want = t.isNew ? 'new' : 'hit';
        expect(g.verdict, `${model} #${i}: ${t.criterion} → ${g.detail}`).toBe(want);
        if (!t.isNew && planned[planned.length - 1].reps > 0) {
          const short = planned.map((s, j) => (j === planned.length - 1 ? { ...s, reps: s.reps - 1 } : s));
          expect(grade(t, short, c.effortScale).verdict, `${model} #${i} short: ${t.criterion}`).toBe('missed');
        }
      }
    });
  }
});
