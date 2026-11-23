// Every sentence the engine (and the app code that saves engine-like text)
// writes, run through the Chinese table: none may be left in English, and
// every number must come through unchanged. Sentences come from the parity
// fixtures (the ported Python engine) and from direct calls that reach every
// template in models, effort, nudge, pain and remind.
import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EffortScale, PainFlag, SetEntry, Target } from '../domain/types';
import { exercise, session, set, slot } from '../engine/__fixtures__/build';
import { runCase, type ParityCase } from '../engine/port/harness';
import {
  capLoad, chosenTarget, describeSets, effortFloor, grade, lastSessionLine, listTarget, nudge, painStatus, prescribe, reentryNote, resumeCard,
  type LiftSession, type NudgeInput, type PainEvent, type PainStatus, type PrescribeContext,
} from '../engine';
import { gradeCommit } from '../app/coach';
import { planSummary } from '../app/workout';
import { applyLang } from './lang';
import { te } from './engine';
import { readable } from '../ui/readable';

// ---------------------------------------------------------------- collect

const out = new Set<string>();
const add = (...xs: (string | undefined | null)[]) => { for (const x of xs) if (x) out.add(x); };
const addTarget = (t: Target) => add(t.criterion, t.why, t.principle);

// 1. Parity fixtures, through the shipped (non-faithful) engine.
const dir = new URL('../engine/__fixtures__/', import.meta.url);
for (const f of readdirSync(dir).filter((n) => /^parity-.*\.json$/.test(n))) {
  const cases: ParityCase[] = JSON.parse(readFileSync(new URL(f, dir), 'utf8')).cases;
  for (const c of cases) {
    if (!['progression_target', 'strength_target', 'score_lift', 'criteria', 'build_scorecard', 'ease_target', 'target_for'].includes(c.fn)) continue;
    const r = runCase(c, { faithful: false }) as any;
    add(r?.criterion, r?.why?.principle, r?.target?.rationale, r?.detail);
    for (const l of r?.lifts ?? []) add(l.detail);
  }
}
const fromFixtures = out.size;

// 2. Direct calls.
const bench = exercise();
const pullup = exercise({ id: 'pullup', name: 'Pull-up', bodyweightFactor: 1, increment: 2.5 });
const ctx = (over: Partial<PrescribeContext> = {}): PrescribeContext => ({ today: '2026-11-21', ...over });
const sets = (w: number, reps: number[], over: Partial<SetEntry> = {}) => reps.map((r) => set(w, r, over));
const top = (w: number, reps: number, rir?: number, over: Partial<SetEntry> = {}) =>
  set(w, reps, { kind: 'top', ...(rir !== undefined ? { rir } : {}), ...over });
const backs = (w: number, reps: number[], rir?: number) => reps.map((r) => set(w, r, { kind: 'backoff', ...(rir !== undefined ? { rir } : {}) }));
const last = (s: SetEntry[], target?: Target): LiftSession[] => [session('2026-11-18', s, target)];
const holdPain: PainStatus = { exerciseId: 'bench', hold: true, painCheck: false, regressPct: 0, raiseRir: 1,
  reasons: ['pain flagged on this lift last session (severity 1) — hold the load'] };
const regressPain = (reasons: string[]): PainStatus => ({ exerciseId: 'bench', hold: true, painCheck: true, regressPct: 0.1, raiseRir: 1, reasons });

// double progression
{
  const sl = slot('double', { sets: 3, repMin: 6, repMax: 8 });
  const P = (h: LiftSession[], c: Partial<PrescribeContext> = {}, ex = bench) => addTarget(prescribe(sl, ex, h, ctx(c)));
  P([], { startingWeight: 60 });
  P([], { startingWeight: 0 });
  P(last(sets(80, [8, 7, 7])));
  P(last(sets(80, [8, 8, 8])));
  P(last([...sets(70, [8, 8]), ...sets(80, [8])]));
  P(last(sets(80, [8, 8, 8])), { readiness: 'red' });
  P(last(sets(80, [8, 8, 8])), { pain: holdPain });
  P([session('2026-11-08', sets(80, [8, 8, 8]))], { gapDays: 13, reentry: 'note' });
  P(last(sets(40, [8, 8, 8])), { afterLayoff: true });
  P(last(sets(0, [8, 7, 7])), {}, pullup);
  P(last(sets(0, [8, 8, 8])), {}, pullup);
  P(last(sets(80, [8, 7, 7])), { pain: regressPain(['two pain flags (severity 2+) on the left shoulder within 14 days — regress 10% and +1 RIR until a clean session']) });
  P(last(sets(80, [8, 7, 7])), { pain: regressPain([]) });
  P([session('2026-10-20', sets(80, [8, 8, 8]))], { gapDays: 32, reentry: 'block' });
  P([], { startingSet: { weight: 100, reps: 5 } });
}
// linear 5x5
{
  const sl = slot('linear5x5', { sets: 5, repMin: 5, repMax: 5 });
  const P = (h: LiftSession[], c: Partial<PrescribeContext> = {}, ex = bench) => addTarget(prescribe(sl, ex, h, ctx(c)));
  P([]);
  P([], { startingWeight: 0 });
  P(last(sets(100, [8, 8, 8])));
  P(last(sets(100, [5, 5, 5, 5, 5])));
  P(last(sets(100, [5, 5, 5, 4, 4])));
  P([session('2026-11-10', sets(100, [5, 5, 4, 4])), session('2026-11-14', sets(100, [5, 5, 4, 4])), session('2026-11-18', sets(100, [5, 4, 4, 4]))]);
  P(last(sets(100, [5, 5, 5, 5, 5])), { readiness: 'red' });
  P(last(sets(10, [8, 8, 8])), { bodyweightKg: 80 }, pullup);
  P(last(sets(80, [12, 12, 12])), { gapDays: 13, reentry: 'note' });
  P(last(sets(80, [12, 12, 12])), { readiness: 'red', gapDays: 13, reentry: 'note' });
  P([], { startingSet: { weight: 100, reps: 5 } });
}
// fixed
{
  const sl = slot('fixed', { sets: 3, repMin: 10, repMax: 10 });
  addTarget(prescribe(sl, bench, [], ctx({ startingWeight: 40 })));
  addTarget(prescribe(sl, bench, last(sets(40, [10, 10, 10])), ctx()));
  addTarget(prescribe(sl, bench, last(sets(0, [10, 10, 10])), ctx()));
  addTarget(prescribe(sl, bench, [], ctx({ startingSet: { weight: 60, reps: 10 } })));
}
// top set + back-offs
for (const topReps of [1, 2, 3, 5]) {
  const sl = slot('topset', { sets: 3, repMin: 6, repMax: 8, topReps, backoffSets: 3, backoffPct: 80 });
  const P = (h: LiftSession[], c: Partial<PrescribeContext> = {}) => addTarget(prescribe(sl, bench, h, ctx(c)));
  P([]);
  P(last(sets(100, [5, 5, 5])));
  P(last(sets(100, [5, 5, 5])), { gapDays: 13, reentry: 'note' });
  P(last(sets(100, [5, 5, 5])), { readiness: 'red' });
  P(last([top(100, topReps, 3), ...backs(80, [6, 6, 6], 4)]));
  P(last([top(100, topReps, undefined, { failed: true }), ...backs(80, [6, 6, 6])]));
  P(last([top(100, topReps, 1), ...backs(80, [6, 6, 6])]));
  P(last([top(100, topReps), ...backs(80, [6, 6, 6])]));
  P(last([top(100, topReps, 3), ...backs(80, [8, 8, 8])]));
  P(last([top(100, topReps, 2), ...backs(80, [6, 6, 6], 4)]));
  P(last([top(100, topReps, 2), ...backs(80, [6, 6, 5], 2)]));
  P(last([top(100, topReps, 3), ...backs(80, [6, 6, 6])]), { readiness: 'red' });
  P([session('2026-11-08', [top(100, topReps, 3), ...backs(80, [6, 6, 6])])], { gapDays: 13, reentry: 'note' });
  P(last([top(100, topReps, 3), ...backs(80, [6, 6, 6])]), { pain: holdPain });
  P(last([top(40, topReps, 3), ...backs(30, [6, 6, 6])]), { afterLayoff: true });
  P(last([top(100, topReps, 3), ...backs(80, [6, 6, 6])]), { effortScale: 'rpe' });
  P([], { startingSet: { weight: 100, reps: 5 } });
  addTarget(chosenTarget(sl, bench, 100, ctx()));
  addTarget(chosenTarget(sl, bench, 100, ctx({ effortScale: 'rpe' })));
}
// grades
{
  const dbl = slot('double', { sets: 3, repMin: 6, repMax: 8 });
  const G = (t: Target, s: SetEntry[], scale: EffortScale = 'rir') => add(grade(t, s, scale).detail);
  const fresh = prescribe(dbl, bench, [], ctx({ startingWeight: 60 }));
  G(fresh, []); G(fresh, sets(60, [8]));
  const chase = prescribe(dbl, bench, last(sets(80, [8, 7, 7])), ctx());
  G(chase, sets(80, [8, 8, 8])); G(chase, sets(80, [8, 7, 7])); G(chase, sets(80, [7, 7, 7])); G(chase, sets(70, [8]));
  const up = prescribe(dbl, bench, last(sets(80, [8, 8, 8])), ctx());
  G(up, sets(82.5, [7])); G(up, sets(82.5, [6])); G(up, sets(82.5, [5])); G(up, sets(80, [8]));
  const hold = prescribe(dbl, bench, last([...sets(70, [8, 8]), ...sets(80, [8])]), ctx());
  G(hold, sets(80, [8, 8])); G(hold, sets(80, [9, 8])); G(hold, sets(80, [8])); G(hold, sets(70, [8]));
  const lin = slot('linear5x5', { sets: 5, repMin: 5, repMax: 5 });
  const five = prescribe(lin, bench, last(sets(100, [5, 5, 5, 5, 5])), ctx());
  G(five, sets(102.5, [5, 5, 5, 5, 5])); G(five, sets(102.5, [5, 5, 5, 5, 5, 5])); G(five, sets(105, [5, 5, 5, 5, 5]));
  G(five, sets(102.5, [5, 5, 5, 4])); G(five, sets(100, [5, 5, 5, 5, 5]));
  const seedD = prescribe(dbl, bench, [], ctx({ startingSet: { weight: 100, reps: 5 } }));
  G(seedD, sets(seedD.weight, [6, 6, 6])); G(seedD, sets(seedD.weight, [7, 6, 6])); G(seedD, sets(seedD.weight, [6]));
  const fix = prescribe(slot('fixed', { sets: 3, repMin: 10, repMax: 10 }), bench, last(sets(40, [10, 10, 10])), ctx());
  G(fix, sets(40, [10, 10, 10])); G(fix, sets(40, [10, 8]));
  const list = listTarget(dbl, bench, [{ weight: 100, reps: 2 }, { weight: 80, reps: 8 }, { weight: 80, reps: 8 }, { weight: 60, reps: 10 }], ctx());
  addTarget(list);
  G(list, [set(100, 2), set(80, 8), set(80, 8), set(60, 10)]); G(list, [set(100, 3), set(80, 8), set(80, 8), set(60, 10)]); G(list, [set(100, 2)]);
  add(describeSets([{ weight: 100, reps: 2 }, { weight: 75, reps: 8 }, { weight: 75, reps: 8 }], ''));
  const ts = slot('topset', { sets: 3, repMin: 6, repMax: 8, topReps: 2, backoffSets: 3, backoffPct: 80 });
  const tt = prescribe(ts, bench, last([top(100, 2, 2), ...backs(80, [6, 6, 6])]), ctx());
  const B = tt.weight, T = tt.topWeight!;
  G(tt, []); G(tt, [top(T - 10, 2, 2)]); G(tt, [top(T, 1, 2)]); G(tt, [top(T, 2, 0)]); G(tt, [top(T, 2, 0)], 'rpe');
  const R = tt.targetReps;
  G(tt, [top(T, 2, 2), ...backs(B, [R, R])]); G(tt, [top(T + 2.5, 2, 2), ...backs(B, [R, R, R])]); G(tt, [top(T, 2, 2), ...backs(B, [R, R, R])]);
}
// app layer: swapped slots, the builder's plan line
{
  const t = prescribe(slot('double'), bench, last(sets(80, [8, 7, 7])), ctx());
  const g = gradeCommit({ sessionId: 's', committedAt: 0, readiness: 'green', targets: [t] }, [set(30, 10, { exerciseId: 'curl', exerciseNameSnapshot: 'Bench Press' })]);
  add(g.slots[0].ungraded, g.slots[0].result.detail);
  const ts = prescribe(slot('topset', { topReps: 2, backoffSets: 3, backoffPct: 80 }), bench, last([top(100, 2, 3), ...backs(80, [6, 6, 6])]), ctx());
  add(planSummary(ts, 4), planSummary(t, 3), planSummary(prescribe(slot('double'), bench, [], ctx()), 3));
  add(planSummary(listTarget(slot('double'), bench, [{ weight: 100, reps: 2 }, { weight: 75, reps: 8 }, { weight: 75, reps: 8 }], ctx()), 3));
  // app/coach.ts commitSession and todayState build these inline.
  add('Bench Press (minimum)', 'Last session: Bench Press, 3 days ago', 'Last session: Bench Press, yesterday');
}
// effort: floor raisers and the jump cap
{
  add(...effortFloor({ role: 'working', reentry: true }).reasons);
  add(...effortFloor({ role: 'working', readiness: 'red', gapDays: 12 }).reasons);
  add(capLoad(105, { lastWeight: 100, increment: 2.5 }).reason);
  add(capLoad(105, { lastWeight: 100, increment: 2.5, firstSessionBack: true }).reason);
  add(capLoad(45, { lastWeight: 40, increment: 2.5, afterLayoff: true }).reason);
  add(capLoad(110, { lastWeight: 100, increment: 2.5, afterLayoff: true }).reason);
}
// nudges
{
  const topT: Target = {
    slotId: 'slot-bench', exerciseId: 'bench', exerciseName: 'Bench Press', model: 'topset', weight: 80, targetReps: 6, repMax: 8,
    targetSets: 3, rirFloor: 2, topWeight: 100, topReps: 1, addedWeight: false, prevTop: [], isNew: false, criterion: '', why: '', rule: '',
  };
  const dblT: Target = { ...topT, model: 'double', weight: 80, targetReps: 8, targetSets: null, topWeight: undefined, topReps: undefined, prevTop: [8, 8, 7] };
  const back = (w: number, r: number, rir?: number) => set(w, r, { kind: 'backoff', ...(rir !== undefined ? { rir } : {}) });
  for (const effortScale of ['rir', 'rpe'] as EffortScale[]) {
    const N = (over: Partial<NudgeInput>) => add(nudge({ target: topT, exercise: bench, sets: [], plannedSets: 4, readiness: 'green', effortScale, ...over })?.text);
    for (const area of ['neck', 'shoulder', 'elbow', 'wrist', 'upper_back', 'lower_back', 'hip', 'knee', 'ankle', 'other'] as PainFlag['area'][]) {
      for (const side of ['left', 'right', 'na'] as PainFlag['side'][]) N({ sets: [top(100, 1, 4, { pain: { area, side, severity: 2 } })] });
    }
    N({ target: dblT, plannedSets: 3, sets: [set(80, 8), set(80, 5, { failed: true })] });
    N({ sets: [top(100, 1, 1)] });
    N({ sets: [top(100, 1, 4, { pain: { area: 'elbow', side: 'na', severity: 1 } })] });
    for (const topReps of [1, 2, 3]) N({ target: { ...topT, topReps }, sets: [top(100, topReps, 4)] });
    N({ target: dblT, plannedSets: 4, sets: [set(80, 9), set(80, 8), set(80, 8)] });
    N({ target: dblT, plannedSets: 3, sets: [set(80, 8, { rir: 3 }), set(80, 7, { rir: 3 })] });
    N({ target: { ...dblT, targetReps: 10 }, plannedSets: 3, sets: [set(80, 8, { rir: 3 }), set(80, 8, { rir: 3 })] });
    N({ sets: [top(100, 1, 2), back(80, 6, 4), back(80, 6, 4), back(80, 6, 4)] });
    N({ readiness: 'red', target: { ...topT, rirFloor: 3 } });
  }
}
// pain rules
{
  const ohp = exercise({ id: 'ohp', name: 'OHP', areasLoaded: ['shoulder', 'upper_back', 'lower_back'] });
  const ev = (date: string, area: PainFlag['area'], side: PainFlag['side'], severity: 1 | 2 | 3, ex = 'ohp'): PainEvent =>
    ({ date, sessionId: `s-${date}`, exerciseId: ex, flag: { area, side, severity } });
  const sess = (date: string) => ({ date, sessionId: `s-${date}`, exerciseId: 'ohp' });
  for (const [area, side] of [['shoulder', 'left'], ['upper_back', 'right'], ['lower_back', 'both']] as [PainFlag['area'], PainFlag['side']][]) {
    add(...painStatus({ exercise: ohp, events: [ev('2026-11-18', area, side, 1)], history: [sess('2026-11-18')], today: '2026-11-21' }).reasons);
    add(...painStatus({ exercise: ohp, events: [ev('2026-11-10', area, side, 2), ev('2026-11-18', area, side, 3)],
      history: [sess('2026-11-10'), sess('2026-11-18')], today: '2026-11-21' }).reasons);
    add(...painStatus({ exercise: ohp, events: [ev('2026-11-12', area, side, 1, 'bench')], history: [sess('2026-11-18')], today: '2026-11-21' }).reasons);
    add(...painStatus({ exercise: ohp, events: [], history: [], today: '2026-11-21', injuries: [{ area, side }] }).reasons);
  }
}
// reminders and cards
{
  add(reentryNote({ reentry: 'note', afterLayoff: false, gapDays: 12 }), reentryNote({ reentry: 'block', afterLayoff: false, gapDays: 30 }));
  add(resumeCard([set(80, 8, { loggedAt: 1000 })], 1000 + 222_000)!.restedLabel);
  for (const d of ['2026-11-21', '2026-11-20', '2026-11-18']) add(lastSessionLine('Bench Press', d, '2026-11-21', 4, 5));
}

// ---------------------------------------------------------------- check

// Names are stored and translated by the names table, not this one.
const NAMES = ['Bench Press', 'Pull-up', 'OHP'];
const ALLOWED = new Set(['kg', 'RPE', 'RIR', 'e1RM', 'PR', 'RM']); // RM: the letters of 1RM
const english = (s: string) => {
  let x = s;
  for (const n of NAMES) x = x.split(n).join('');
  return (x.match(/[A-Za-z][A-Za-z0-9]*/g) ?? []).filter((w) => /[A-Za-z]{2,}/.test(w) && !ALLOWED.has(w));
};
const numbers = (s: string) => (s.match(/\d+(?:\.\d+)?/g) ?? []).filter(Boolean);
const count = (xs: string[]) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>());

describe('engine sentences in Chinese', () => {
  beforeAll(() => applyLang('zh'));
  afterAll(() => applyLang('en'));

  it('collects a wide spread of engine output', () => {
    expect(fromFixtures).toBeGreaterThan(50);
    expect(out.size).toBeGreaterThan(250);
  });

  it('leaves no sentence in English and keeps every number', () => {
    const bad: string[] = [];
    for (const en of [...out].sort()) {
      applyLang('en');
      const shown = readable(en);
      applyLang('zh');
      const zh = readable(en);
      const left = english(zh);
      const need = count(numbers(shown.split('e1RM').join('').split('1RM').join('')));
      const have = count(numbers(zh.split('e1RM').join('').split('1RM').join('')));
      const lost = [...need].filter(([n, k]) => (have.get(n) ?? 0) < k).map(([n]) => n);
      if (left.length || lost.length) bad.push(`${en}\n    → ${zh}${left.length ? `\n    English: ${left.join(' ')}` : ''}${lost.length ? `\n    lost: ${lost.join(' ')}` : ''}`);
    }
    expect(bad.join('\n'), `${bad.length} of ${out.size} sentences`).toBe('');
  });

  it('te() gives the same Chinese as readable() for text readable() leaves alone', () => {
    expect(te('Plan met. Extra sets are a bonus, not required.')).toBe(readable('Plan met. Extra sets are a bonus, not required.'));
  });
});
