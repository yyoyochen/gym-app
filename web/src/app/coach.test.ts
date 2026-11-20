import { describe, expect, it } from 'vitest';
import { freshDb } from '../db/test-helpers';
import {
  addSet, CommitExistsError, defaultProfile, getCommit, getSessionSets, listSessions, putCommit, saveProfile, saveProgram,
  sealSession, seedCatalog, startSession, type GymDb,
} from '../db';
import { EX, defaultCatalog } from '../domain/catalog';
import { programFromTemplate, DEFAULT_TEMPLATE_ID } from '../domain/templates';
import type { ISODate, PainFlag, SetKind } from '../domain/types';
import { addDays } from '../engine';
import {
  commitSession, effectiveSlot, ghostSets, gradeCommit, gradeSession, nextRotationKey, planToday, platesPerSide,
  sessionView, setsLine, skipSession, todayState, warmupRamp,
} from './coach';

const TODAY: ISODate = '2026-11-21';
/** Local wall-clock instant on an ISO date. */
const at = (iso: ISODate, h = 12, m = 0) => {
  const [y, mo, d] = iso.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m).getTime();
};

async function setup(): Promise<GymDb> {
  const db = freshDb();
  await seedCatalog(db);
  await saveProfile(db, { ...defaultProfile(), sex: 'M', birthYear: 1990 });
  await saveProgram(db, programFromTemplate(DEFAULT_TEMPLATE_ID));
  return db;
}

type S = [weight: number, reps: number, kind: SetKind, rir?: number, pain?: PainFlag];
interface Lift { ex: string; slotOrder: number; sets: S[] }

/** A past, sealed session with its sets. */
async function logSession(db: GymDb, key: string, date: ISODate, lifts: Lift[], hour = 12) {
  const s = await startSession(db, { programSessionKey: key, nameSnapshot: key, date, now: at(date, hour) });
  let t = at(date, hour);
  const names = new Map(defaultCatalog().map(e => [e.id, e.name]));
  for (const l of lifts) {
    for (const [weight, reps, kind, rir, pain] of l.sets) {
      t += 120_000;
      await addSet(db, {
        sessionId: s.id, exerciseId: l.ex, exerciseNameSnapshot: names.get(l.ex) ?? l.ex, slotOrder: l.slotOrder, kind, weight, reps,
        ...(rir !== undefined ? { rir } : {}), ...(pain ? { pain } : {}), loggedAt: t,
      });
    }
  }
  await sealSession(db, s.id, t + 60_000);
  return s;
}

const sessionA = (top = 100, bench = 80, opts: { benchPain?: PainFlag } = {}): Lift[] => [
  { ex: EX.squat, slotOrder: 1, sets: [[top, 2, 'top', 3], [85, 8, 'backoff', 2], [85, 8, 'backoff', 2], [85, 7, 'backoff', 1]] },
  { ex: EX.bench, slotOrder: 2, sets: [[bench, 2, 'top', 2, opts.benchPain], [67.5, 8, 'backoff', 2], [67.5, 8, 'backoff', 2], [67.5, 8, 'backoff', 2]] },
  { ex: 'barbell-row', slotOrder: 3, sets: [[60, 10, 'working', 2], [60, 10, 'working', 2], [60, 9, 'working', 1]] },
  { ex: 'db-lateral-raise', slotOrder: 4, sets: [[10, 15, 'working', 1], [10, 14, 'working', 1], [10, 14, 'working', 1]] },
];
const sessionB = (opts: { ohpPain?: PainFlag } = {}): Lift[] => [
  { ex: EX.deadlift, slotOrder: 1, sets: [[140, 2, 'top', 2], [120, 5, 'backoff', 2], [120, 5, 'backoff', 2]] },
  { ex: EX.ohp, slotOrder: 2, sets: [[55, 2, 'top', 2, opts.ohpPain], [47.5, 8, 'backoff', 2], [47.5, 8, 'backoff', 2], [47.5, 7, 'backoff', 2]] },
];

const targetsOf = (p: Awaited<ReturnType<typeof planToday>>) => p.slots.map(s => s.target);

describe('promise invariant (spec §2.1)', () => {
  it('the targets shown after commit are byte-identical to what was committed, and grading uses commit.targets', async () => {
    const db = await setup();
    await logSession(db, 'A', '2026-11-17', sessionA());
    await logSession(db, 'B', '2026-11-19', sessionB());
    await logSession(db, 'C', '2026-11-20', [{ ex: 'incline-db-bench-press', slotOrder: 1, sets: [[26, 10, 'working', 2]] }]);

    const plan = await planToday(db, TODAY, at(TODAY, 9));
    expect(plan.status).toBe('planned');
    expect(plan.sessionKey).toBe('A');
    const shown = JSON.stringify(targetsOf(plan));
    const session = await commitSession(db, plan, plan.readiness, at(TODAY, 9));
    expect(JSON.stringify((await getCommit(db, session.id))!.targets)).toBe(shown);

    // Log the day, beating everything: today's sets must not move today's promise.
    for (const sp of plan.slots) {
      for (const g of sp.ghost) {
        await addSet(db, { sessionId: session.id, exerciseId: sp.target.exerciseId, exerciseNameSnapshot: sp.target.exerciseName,
          slotOrder: sp.slotOrder, kind: g.kind, weight: g.weight + 10, reps: g.reps + 2, rir: 4, loggedAt: at(TODAY, 10) });
      }
    }
    // Change the program too: a fresh prescription would now differ...
    const prog = programFromTemplate(DEFAULT_TEMPLATE_ID);
    prog.sessions[0].slots[0].params = { ...prog.sessions[0].slots[0].params, repMin: 3, repMax: 4, rirFloor: 4 };
    await saveProgram(db, prog);
    const fresh = await planToday(db, TODAY, at(TODAY, 11), { ignoreOpen: true, sessionKey: 'A' });
    expect(JSON.stringify(targetsOf(fresh))).not.toBe(shown);

    // ...but the display plan is the committed one, byte for byte.
    const again = await planToday(db, TODAY, at(TODAY, 11));
    expect(again.status).toBe('committed');
    expect(again.session?.id).toBe(session.id);
    expect(JSON.stringify(targetsOf(again))).toBe(shown);
    const view = await sessionView(db, session.id);
    expect(JSON.stringify(view!.plan!.slots.map(s => s.target))).toBe(shown);

    // Grading reads commit.targets: each result names the committed target's slot.
    const g = await gradeSession(db, session.id);
    expect(g!.slots.map(s => s.target)).toEqual(JSON.parse(shown));
    expect(g!.total).toBe(4);
  });

  it('logging exactly the ghost rows keeps every promise', async () => {
    const db = await setup();
    await logSession(db, 'A', '2026-11-17', sessionA());
    const plan = await planToday(db, TODAY, at(TODAY, 9), { sessionKey: 'A' });
    const s = await commitSession(db, plan, 'green', at(TODAY, 9));
    for (const sp of plan.slots) {
      for (const w of sp.warmups) {
        await addSet(db, { sessionId: s.id, exerciseId: sp.target.exerciseId, exerciseNameSnapshot: sp.target.exerciseName, slotOrder: sp.slotOrder, kind: 'warmup', weight: w.weight, reps: w.reps });
      }
      for (const gst of sp.ghost) {
        await addSet(db, { sessionId: s.id, exerciseId: sp.target.exerciseId, exerciseNameSnapshot: sp.target.exerciseName, slotOrder: sp.slotOrder, kind: gst.kind, weight: gst.weight, reps: gst.reps, rir: gst.rir });
      }
    }
    const g = (await gradeSession(db, s.id))!;
    expect(g.slots.map(x => x.result.verdict)).toEqual(['hit', 'hit', 'hit', 'hit']);
    expect([g.kept, g.total]).toEqual([4, 4]);
  });

  it('commits are write-once and a committed plan commits to the same session', async () => {
    const db = await setup();
    await logSession(db, 'A', '2026-11-17', sessionA());
    const plan = await planToday(db, TODAY, at(TODAY, 9));
    const s = await commitSession(db, plan, 'green', at(TODAY, 9));
    const shown = await planToday(db, TODAY, at(TODAY, 9, 5));
    expect((await commitSession(db, shown, 'green', at(TODAY, 9, 6))).id).toBe(s.id);
    await expect(putCommit(db, { sessionId: s.id, committedAt: 1, readiness: 'green', targets: [] })).rejects.toBeInstanceOf(CommitExistsError);
    expect(await listSessions(db, { from: TODAY })).toHaveLength(1);
  });

  it('readiness adjusts the targets before commit; a stale plan is rebuilt with the readiness committed', async () => {
    const db = await setup();
    await logSession(db, 'A', '2026-11-17', sessionA());
    const green = await planToday(db, TODAY, at(TODAY, 9), { sessionKey: 'A', readiness: 'green' });
    const red = await planToday(db, TODAY, at(TODAY, 9), { sessionKey: 'A', readiness: 'red' });
    expect(red.slots[0].target.rirFloor).toBe(green.slots[0].target.rirFloor + 1);
    const s = await commitSession(db, green, 'red', at(TODAY, 9));
    const c = (await getCommit(db, s.id))!;
    expect(c.readiness).toBe('red');
    expect(JSON.stringify(c.targets)).toBe(JSON.stringify(targetsOf(red)));
    expect(s.readiness).toBe('red');
  });
});

describe('a day is planned only from earlier days (spec §2.2)', () => {
  it('sets logged today never feed today\'s targets; tomorrow they do', async () => {
    const db = await setup();
    await logSession(db, 'A', '2026-11-17', sessionA(100));
    const before = JSON.stringify(targetsOf(await planToday(db, TODAY, at(TODAY, 8), { sessionKey: 'A' })));
    // An ad-hoc squat session earlier today with a much heavier, easy top set.
    await logSession(db, 'adhoc', TODAY, [{ ex: EX.squat, slotOrder: 1, sets: [[130, 2, 'top', 4]] }], 7);
    const after = await planToday(db, TODAY, at(TODAY, 9), { sessionKey: 'A' });
    expect(JSON.stringify(targetsOf(after))).toBe(before);
    const tomorrow = await planToday(db, addDays(TODAY, 1), at(addDays(TODAY, 1), 9), { sessionKey: 'A' });
    expect(tomorrow.slots[0].target.topWeight).toBe(135);
  });
});

describe('midnight crossing (spec §5.4 bug 5)', () => {
  it('a session started before midnight keeps its date and stays one session', async () => {
    const db = await setup();
    await logSession(db, 'C', '2026-11-18', [{ ex: 'incline-db-bench-press', slotOrder: 1, sets: [[26, 10, 'working', 2]] }]);
    const plan = await planToday(db, TODAY, at(TODAY, 23, 40));
    const s = await commitSession(db, plan, 'green', at(TODAY, 23, 40));
    const sp = plan.slots[0];
    await addSet(db, { sessionId: s.id, exerciseId: sp.target.exerciseId, exerciseNameSnapshot: 'x', slotOrder: 1, kind: 'top', weight: 1, reps: 1, loggedAt: at(TODAY, 23, 55) });
    const next = addDays(TODAY, 1);
    await addSet(db, { sessionId: s.id, exerciseId: sp.target.exerciseId, exerciseNameSnapshot: 'x', slotOrder: 1, kind: 'backoff', weight: 1, reps: 1, loggedAt: at(next, 0, 10) });
    expect(await listSessions(db)).toHaveLength(2);
    expect(await getSessionSets(db, s.id)).toHaveLength(2);
    expect((await listSessions(db, { from: next })).length).toBe(0);
    const p2 = await planToday(db, next, at(next, 0, 12));
    expect(p2.status).toBe('committed');
    expect(p2.session!.id).toBe(s.id);
    expect(p2.session!.date).toBe(TODAY);
    const st = await todayState(db, next, at(next, 0, 12));
    expect(st.gap.kind).toBe('in_progress');
    expect(st.open!.card!.restedLabel).toBe('rested 2:00');
  });
});

describe('gap scenarios → Today state (spec §3.5)', () => {
  async function withLastSessionDaysAgo(days: number) {
    const db = await setup();
    const d0 = addDays(TODAY, -days - 9);
    await logSession(db, 'A', addDays(d0, 0), sessionA());
    await logSession(db, 'B', addDays(d0, 3), sessionB());
    await logSession(db, 'A', addDays(d0, 6), sessionA());
    await logSession(db, 'B', addDays(TODAY, -days), sessionB(), 18);
    return db;
  }

  it('in progress: resume card with lift, set number, last set and silent rested time', async () => {
    const db = await withLastSessionDaysAgo(2);
    const plan = await planToday(db, TODAY, at(TODAY, 9));
    const s = await commitSession(db, plan, 'green', at(TODAY, 9));
    const sp = plan.slots[0];
    await addSet(db, { sessionId: s.id, exerciseId: sp.target.exerciseId, exerciseNameSnapshot: sp.target.exerciseName, slotOrder: 1, kind: 'top', weight: 100, reps: 2, rir: 2, loggedAt: at(TODAY, 9, 10) });
    const st = await todayState(db, TODAY, at(TODAY, 9, 13) + 40_000);
    expect(st.gap.kind).toBe('in_progress');
    expect(st.open!.card).toMatchObject({ exerciseName: sp.target.exerciseName, setNumber: 2, lastSet: { weight: 100, reps: 2, rir: 2 }, restedLabel: 'rested 3:40' });
  });

  it('1 day: under 24 h, yesterday\'s verdict line', async () => {
    const db = await withLastSessionDaysAgo(1);
    const st = await todayState(db, TODAY, at(TODAY, 10));
    expect(st.gap.kind).toBe('under_24h');
    expect(st.lastLine).toMatch(/^Last session: B, yesterday/);
    const p = await planToday(db, TODAY, at(TODAY, 10));
    expect(p.reentry.reentry).toBe('none');
    expect(p.sessionKey).toBe('C');
  });

  it('5 days: short gap, normal plan', async () => {
    const db = await withLastSessionDaysAgo(5);
    const st = await todayState(db, TODAY, at(TODAY, 10));
    expect(st.gap).toEqual({ kind: 'short', days: 5 });
    expect(st.lastLine).toBe('Last session: B, 5 days ago');
    const p = await planToday(db, TODAY, at(TODAY, 10), { sessionKey: 'A' });
    expect(p.reentryNote).toBe('');
    expect(p.slots[0].target.rirFloor).toBe(2);
  });

  it('12 days: re-entry note, anchored on the last session, 3 RIR floor, no jump', async () => {
    const db = await withLastSessionDaysAgo(12);
    const st = await todayState(db, TODAY, at(TODAY, 10));
    expect(st.gap).toEqual({ kind: 'reentry_note', days: 12 });
    const p = await planToday(db, TODAY, at(TODAY, 10), { sessionKey: 'A' });
    expect(p.reentry.reentry).toBe('note');
    expect(p.reentryNote).toMatch(/^12 days since your last session/);
    const squat = p.slots[0].target;
    expect(squat.rirFloor).toBe(3);
    expect(squat.topWeight).toBeLessThanOrEqual(100); // last top was 100 @ 3 RIR: would be +5, held
    expect(p.slots[0].floorLabel).toBe('≥ 3 RIR');
  });

  it('30 days: re-entry block, 3 × 8 at the last logged working weight', async () => {
    const db = await withLastSessionDaysAgo(30);
    const st = await todayState(db, TODAY, at(TODAY, 10));
    expect(st.gap).toEqual({ kind: 'reentry_block', days: 30 });
    const p = await planToday(db, TODAY, at(TODAY, 10), { sessionKey: 'A' });
    expect(p.reentry.reentry).toBe('block');
    for (const sp of p.slots.slice(0, 2)) expect(sp.target).toMatchObject({ rule: 'reentry_block', targetSets: 3, targetReps: 8, model: 'fixed' });
    expect(p.slots[0].target.weight).toBe(85); // the back-off load, not the 100 kg top double
  });

  it('first run: no sessions', async () => {
    const db = await setup();
    expect((await todayState(db, TODAY, at(TODAY))).gap.kind).toBe('first_run');
  });
});

describe('pain (spec §3.3.2, acceptance check 14)', () => {
  it('severity 2 on the left shoulder twice in 10 days regresses bench and OHP 10% with a 3 RIR floor; squat is unaffected', async () => {
    const db = await setup();
    const shoulder: PainFlag = { area: 'shoulder', side: 'left', severity: 2 };
    await logSession(db, 'A', '2026-11-11', sessionA(100, 80, { benchPain: shoulder }));
    await logSession(db, 'B', '2026-11-15', sessionB({ ohpPain: shoulder }));
    const a = await planToday(db, TODAY, at(TODAY), { sessionKey: 'A' });
    const [squat, bench] = a.slots.map(s => s.target);
    expect(bench.rule).toBe('pain_regress');
    expect(bench.weight).toBe(70); // 80 × 0.9 = 72, floored to the 2.5 increment
    expect(bench.rirFloor).toBe(3);
    expect(squat.rule).not.toBe('pain_regress');
    expect(squat.rirFloor).toBe(2);
    expect(squat.topWeight).toBe(105);
    const b = await planToday(db, TODAY, at(TODAY), { sessionKey: 'B' });
    const ohp = b.slots[1].target;
    expect(ohp.rule).toBe('pain_regress');
    expect(ohp.weight).toBe(47.5); // 55 × 0.9 = 49.5 → 47.5
    expect(ohp.rirFloor).toBe(3);
    expect(b.slots[0].target.rule).not.toBe('pain_regress'); // deadlift loads no shoulder
  });
});

describe('rotation', () => {
  it('follows A → B → C; skips are recorded and advance it', async () => {
    const db = await setup();
    expect((await planToday(db, TODAY, at(TODAY))).sessionKey).toBe('A');
    await logSession(db, 'A', '2026-11-17', sessionA());
    const p = await planToday(db, TODAY, at(TODAY));
    expect(p.sessionKey).toBe('B');
    await skipSession(db, p, at(TODAY, 8));
    expect((await planToday(db, TODAY, at(TODAY, 9))).sessionKey).toBe('C');
  });
  it('ignores sessions outside the rotation', () => {
    const prog = programFromTemplate(DEFAULT_TEMPLATE_ID);
    const s = (key: string, date: string) => ({ id: key + date, programSessionKey: key, nameSnapshot: key, date, startedAt: 0, sealed: true });
    expect(nextRotationKey(prog, [s('C', '2026-11-01'), s('import:x', '2026-11-02')], [])).toBe('A');
  });
  it('minimum version keeps only the minimum slots', async () => {
    const db = await setup();
    const p = await planToday(db, TODAY, at(TODAY), { sessionKey: 'A', minimum: true });
    expect(p.slots.map(s => s.target.exerciseId)).toEqual([EX.squat, EX.bench]);
  });
});

describe('slot params', () => {
  it('back-off % from templates (85 = 85%) is normalised for the engine', async () => {
    const prog = programFromTemplate(DEFAULT_TEMPLATE_ID);
    expect(effectiveSlot(prog.sessions[0].slots[0], prog, TODAY).params.backoffPct).toBeCloseTo(0.85);
    const db = await setup();
    await logSession(db, 'A', '2026-11-17', [{ ex: EX.squat, slotOrder: 1, sets: [[100, 2, 'top', 2]] }]);
    const t = (await planToday(db, TODAY, at(TODAY), { sessionKey: 'A' })).slots[0].target;
    expect(t.topWeight).toBe(100);
    expect(t.weight).toBe(85);
  });
});

describe('grading edge cases', () => {
  it('a swapped slot is logged but ungraded; an added lift is ungraded', async () => {
    const db = await setup();
    await logSession(db, 'A', '2026-11-17', sessionA());
    const plan = await planToday(db, TODAY, at(TODAY), { sessionKey: 'A', minimum: true });
    const s = await commitSession(db, plan, 'green', at(TODAY));
    await addSet(db, { sessionId: s.id, exerciseId: 'close-grip-bench-press', exerciseNameSnapshot: 'Close-Grip Bench Press', slotOrder: 2, kind: 'working', weight: 60, reps: 8 });
    await addSet(db, { sessionId: s.id, exerciseId: 'dips', exerciseNameSnapshot: 'Dips', slotOrder: 3, kind: 'working', weight: 0, reps: 12 });
    const g = (await gradeSession(db, s.id))!;
    expect(g.slots[1].ungraded).toBe('swapped to Close-Grip Bench Press');
    expect(g.added).toHaveLength(1);
    expect(g.total).toBe(1);
    expect(g.kept).toBe(0);
    const v = (await sessionView(db, s.id))!;
    expect(v.slots.map(x => [x.slotOrder, x.exercise.id, x.swapped])).toEqual([[1, EX.squat, false], [2, 'close-grip-bench-press', true], [3, 'dips', false]]);
  });

  it('setsLine reads like the ledger', () => {
    const base = { id: 'x', sessionId: 's', exerciseId: 'e', exerciseNameSnapshot: 'E', slotOrder: 1, setOrder: 1, loggedAt: 0 };
    const sets = [
      { ...base, kind: 'warmup' as const, weight: 20, reps: 8 },
      { ...base, kind: 'top' as const, weight: 105, reps: 2, rir: 2 },
      { ...base, kind: 'backoff' as const, weight: 87.5, reps: 8 },
      { ...base, kind: 'backoff' as const, weight: 87.5, reps: 7, failed: true },
    ];
    expect(setsLine(sets, 'rir')).toBe('105 × 2 @ 2 RIR · 87.5 × 8, 7✕');
    expect(setsLine(sets, 'rpe')).toBe('105 × 2 @ RPE 8 · 87.5 × 8, 7✕');
    expect(gradeCommit({ sessionId: 's', committedAt: 0, readiness: 'green', targets: [] }, sets).total).toBe(0);
  });
});

describe('warm-ups and plates', () => {
  const cat = new Map(defaultCatalog().map(e => [e.id, e]));
  it('ramp: bar × 8, 50% × 5, 70% × 3, 85% × 1, rounded to the increment', () => {
    expect(warmupRamp(100, cat.get(EX.squat)!)).toEqual([
      { kind: 'warmup', weight: 20, reps: 8 }, { kind: 'warmup', weight: 50, reps: 5 },
      { kind: 'warmup', weight: 70, reps: 3 }, { kind: 'warmup', weight: 85, reps: 1 },
    ]);
    const bench = warmupRamp(62.5, cat.get(EX.bench)!);
    expect(bench.map(w => w.weight)).toEqual([20, 32.5, 45, 52.5]);
  });
  it('no ramp for isolation, bodyweight or a bar-weight lift; no empty bar for dumbbells', () => {
    expect(warmupRamp(12, cat.get('db-lateral-raise')!)).toEqual([]);
    expect(warmupRamp(10, cat.get('dips')!)).toEqual([]);
    expect(warmupRamp(20, cat.get(EX.bench)!)).toEqual([]);
    expect(warmupRamp(30, cat.get('incline-db-bench-press')!).map(w => w.weight)).toEqual([15, 20, 25]);
  });
  it('ramp steps never reach the work weight and only climb', () => {
    for (const w of [25, 30, 40, 47.5, 140, 222.5]) {
      const r = warmupRamp(w, cat.get(EX.deadlift)!);
      r.forEach((x, i) => { expect(x.weight).toBeLessThan(w); if (i) expect(x.weight).toBeGreaterThan(r[i - 1].weight); });
    }
  });
  it('plates per side from a 20 kg bar', () => {
    const plates = [25, 20, 15, 10, 5, 2.5, 1.25];
    expect(platesPerSide(100, 20, plates)).toMatchObject({ perSide: [25, 15], remainder: 0 });
    expect(platesPerSide(142.5, 20, plates).perSide).toEqual([25, 25, 10, 1.25]);
    expect(platesPerSide(143, 20, plates).remainder).toBeCloseTo(0.5);
    expect(platesPerSide(15, 20, plates).belowBar).toBe(true);
  });
  it('ghost rows pad to the planned sets with effort at the floor', () => {
    const t = { slotId: 's', exerciseId: 'e', exerciseName: 'E', model: 'topset' as const, weight: 85, targetReps: 6, targetSets: 3, rirFloor: 2, topWeight: 100, topReps: 2, addedWeight: false, prevTop: [], isNew: false, criterion: '', why: '', rule: '' };
    expect(ghostSets(t, 4)).toEqual([
      { kind: 'top', weight: 100, reps: 2, rir: 2 },
      { kind: 'backoff', weight: 85, reps: 6, rir: 2 }, { kind: 'backoff', weight: 85, reps: 6, rir: 2 }, { kind: 'backoff', weight: 85, reps: 6, rir: 2 },
    ]);
  });
});
