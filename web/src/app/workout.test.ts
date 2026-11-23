import { describe, expect, it } from 'vitest';
import { freshDb } from '../db/test-helpers';
import { addSet, defaultProfile, getCommit, getMeta, saveProfile, saveProgram, sealSession, seedCatalog, startSession, type GymDb } from '../db';
import { EX } from '../domain/catalog';
import { programFromTemplate, DEFAULT_TEMPLATE_ID } from '../domain/templates';
import type { ISODate } from '../domain/types';
import { nextRotationKey, planToday } from './coach';
import { listEvents, listSessions } from '../db';
import { FALLBACK_LIFT } from './suggest';
import { WORKOUT_NAME, canStartWorkout, commitWorkout, draftKey, loadDraft, planSummary, planWorkout, saveDraft, swapLift, type WorkoutDraft } from './workout';

const TODAY: ISODate = '2026-11-23';
const at = (iso: ISODate, h = 12) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, h).getTime(); };

async function fresh(): Promise<GymDb> {
  const db = freshDb();
  await seedCatalog(db);
  await saveProfile(db, { ...defaultProfile(), sex: 'M', birthYear: 1990 });
  return db;
}

async function logRow(db: GymDb, date: ISODate) {
  const s = await startSession(db, { programSessionKey: 'A', nameSnapshot: 'A', date, now: at(date) });
  for (const [i, reps] of [10, 10, 9].entries()) {
    await addSet(db, { sessionId: s.id, exerciseId: 'barbell-row', exerciseNameSnapshot: 'Barbell Row', slotOrder: 1, kind: 'working', weight: 60, reps, rir: 2, loggedAt: at(date) + i * 60_000 });
  }
  await sealSession(db, s.id, at(date) + 600_000);
}

describe('a one-off workout', () => {
  it('a brand-new lifter still gets three lifts from the catalogue, each a first time', async () => {
    const db = await fresh();
    const d = await loadDraft(db, TODAY);
    expect(d.slots.map(s => s.slot.exerciseId)).toEqual([FALLBACK_LIFT.Legs, FALLBACK_LIFT.Back, FALLBACK_LIFT.Chest]);
    const plan = await planWorkout(db, d, TODAY, at(TODAY));
    expect(plan.status).toBe('planned');
    expect(plan.slots.every(s => s.target.isNew)).toBe(true);
    expect(plan.reasons).toHaveLength(3);
  });

  it('a draft left from yesterday is replaced by a fresh suggestion', async () => {
    const db = await fresh();
    const old: WorkoutDraft = { date: '2026-11-22', focus: ['Arms'], slots: [] };
    await saveDraft(db, old);
    const d = await loadDraft(db, TODAY);
    expect(d.date).toBe(TODAY);
    expect(d.slots.length).toBeGreaterThan(0);
  });

  it("today's draft comes back as it was left", async () => {
    const db = await fresh();
    const mine: WorkoutDraft = { date: TODAY, focus: [], slots: [] };
    await saveDraft(db, mine);
    expect(await loadDraft(db, TODAY)).toEqual(mine);
  });

  it('a weight the lifter set is planned at that weight', async () => {
    const db = await fresh();
    await logRow(db, '2026-11-16');
    const d: WorkoutDraft = { date: TODAY, focus: [], slots: [{ part: 'Back', weight: 70, slot: { id: 'x', exerciseId: 'barbell-row', model: 'double', params: { sets: 3, repMin: 8, repMax: 12, rirFloor: 2 } } }] };
    const t = (await planWorkout(db, d, TODAY, at(TODAY))).slots[0].target;
    expect(t).toMatchObject({ rule: 'chosen', weight: 70, model: 'double' });
  });

  it('a weight on a lift never done before is a plain fixed plan', async () => {
    const db = await fresh();
    const d: WorkoutDraft = { date: TODAY, focus: [], slots: [{ part: 'Back', weight: 50, slot: { id: 'x', exerciseId: 'barbell-row', model: 'double', params: { sets: 3, repMin: 8, repMax: 12, rirFloor: 2 } } }] };
    expect((await planWorkout(db, d, TODAY, at(TODAY))).slots[0].target).toMatchObject({ model: 'fixed', weight: 50, targetSets: 3, targetReps: 8 });
  });

  it('no lifts: nothing to start', async () => {
    const db = await fresh();
    const plan = await planWorkout(db, { date: TODAY, focus: [], slots: [] }, TODAY, at(TODAY));
    expect(plan.status).toBe('empty_session');
    expect(canStartWorkout(null, plan)).toBe(false);
  });

  it('Start locks exactly the plan shown, under its own name, and leaves the program rotation alone', async () => {
    const db = await fresh();
    await saveProgram(db, programFromTemplate(DEFAULT_TEMPLATE_ID));
    const program = (await import('../db')).getActiveProgram;
    const before = nextRotationKey((await program(db))!, await listSessions(db), await listEvents(db, { type: 'skip' }));
    const d = await loadDraft(db, TODAY);
    const plan = await planWorkout(db, d, TODAY, at(TODAY));
    expect(canStartWorkout(null, plan)).toBe(true);
    const s = await commitWorkout(db, plan, 'green', at(TODAY));
    expect(s.nameSnapshot).toBe(WORKOUT_NAME);
    expect((await getCommit(db, s.id))!.targets).toEqual(plan.slots.map(x => x.target));
    expect(await getMeta(db, 'workoutDraft')).toBeUndefined();
    const after = await planToday(db, TODAY, at(TODAY, 13));
    expect(after.status).toBe('committed');
    expect(canStartWorkout(s, plan)).toBe(false);
    await sealSession(db, s.id, at(TODAY, 14));
    expect(nextRotationKey((await program(db))!, await listSessions(db), await listEvents(db, { type: 'skip' }))).toBe(before);
  });

  it('main lifts in the suggestion are squat, bench and deadlift style lifts with a top set', async () => {
    const db = await fresh();
    const d = await loadDraft(db, TODAY);
    expect(d.slots.find(s => s.slot.exerciseId === EX.squat)?.slot.model).toBe('topset');
  });
});

describe('planSummary: the line under each lift', () => {
  const base = { slotId: 's', exerciseId: 'e', exerciseName: 'E', rirFloor: 2, addedWeight: false, prevTop: [], criterion: '', why: '', rule: 'x' };
  it('top set then back-offs', () => {
    expect(planSummary({ ...base, model: 'topset', weight: 75, targetReps: 8, targetSets: 3, topWeight: 100, topReps: 2, isNew: false }, 4)).toBe('Top 100 × 2, then 3 × 8 at 75');
  });
  it('straight sets', () => {
    expect(planSummary({ ...base, model: 'double', weight: 70, targetReps: 8, targetSets: null, isNew: false }, 3)).toBe('3 × 8 at 70');
  });
  it('a first time asks for a weight', () => {
    expect(planSummary({ ...base, model: 'double', weight: 0, targetReps: 8, targetSets: null, isNew: true }, 3)).toBe('First time: pick a weight');
  });
  it('bodyweight with nothing added', () => {
    expect(planSummary({ ...base, model: 'double', weight: 0, targetReps: 8, targetSets: null, isNew: false }, 3)).toBe('3 × 8');
  });
});

describe('review fixes', () => {
  const topSlot = { id: 't', exerciseId: EX.squat, model: 'topset' as const, params: { sets: 1, topReps: 2, backoffSets: 3, backoffPct: 75, repMin: 8, repMax: 10, rirFloor: 2 } };

  it('a top-set weight on a lift never done before stays a top set with back-offs', async () => {
    const db = await fresh();
    const t = (await planWorkout(db, { date: TODAY, focus: [], slots: [{ part: 'Legs', weight: 60, slot: topSlot }] }, TODAY, at(TODAY))).slots[0].target;
    expect(t).toMatchObject({ model: 'topset', topWeight: 60, topReps: 2, weight: 45, targetSets: 3, targetReps: 8, rule: 'chosen' });
  });

  it('the plan says which draft it was built from, so a stale one can not be started', async () => {
    const db = await fresh();
    const d = await loadDraft(db, TODAY);
    const plan = await planWorkout(db, d, TODAY, at(TODAY));
    expect(plan.draftKey).toBe(draftKey(d));
    expect(draftKey({ ...d, slots: d.slots.slice(1) })).not.toBe(plan.draftKey);
  });

  it("Today's readiness carries into the plan and the session", async () => {
    const db = await fresh();
    await logRow(db, '2026-11-16');
    const d: WorkoutDraft = { date: TODAY, focus: [], slots: [{ part: 'Back', slot: { id: 'x', exerciseId: 'barbell-row', model: 'double', params: { sets: 3, repMin: 8, repMax: 12, rirFloor: 2 } } }] };
    const green = await planWorkout(db, d, TODAY, at(TODAY));
    const red = await planWorkout(db, d, TODAY, at(TODAY), { readiness: 'red' });
    expect(red.readiness).toBe('red');
    expect(red.slots[0].target.rirFloor).toBeGreaterThan(green.slots[0].target.rirFloor);
    const s = await commitWorkout(db, red, red.readiness, at(TODAY));
    expect((await getCommit(db, s.id))!.readiness).toBe('red');
  });

  it('the set count in the builder is the one the logger shows after Start', async () => {
    const db = await fresh();
    await logRow(db, '2026-11-16');
    await logRow(db, '2026-11-19');
    const d: WorkoutDraft = { date: TODAY, focus: [], slots: [{ part: 'Back', slot: { id: 'x', exerciseId: 'barbell-row', model: 'double', params: { sets: 4, repMin: 8, repMax: 12, rirFloor: 2 } } }] };
    const plan = await planWorkout(db, d, TODAY, at(TODAY));
    await commitWorkout(db, plan, 'green', at(TODAY));
    const logger = await planToday(db, TODAY, at(TODAY, 13));
    expect(logger.slots[0].plannedSets).toBe(plan.slots[0].plannedSets);
  });

  it('swapping a lift re-plans it for the new lift and its body part', () => {
    const item = { part: 'Legs' as const, weight: 100, slot: topSlot };
    const curl = { id: 'db-curl', name: 'DB Curl', aliases: [], muscles: ['biceps'], areasLoaded: [], slotType: 'isolation' as const, increment: 1, bodyweightFactor: 0, benchmarkKey: null };
    const next = swapLift(item, curl, 'maintain', new Set());
    expect(next).toMatchObject({ part: 'Arms', slot: { id: 't', exerciseId: 'db-curl', model: 'double', params: { sets: 3, repMin: 12, repMax: 15 } } });
    expect(next.weight).toBeUndefined();
  });
});
