// A one-off workout (docs/superpowers/specs/2026-11-23-plan-todays-workout-design.md):
// the draft being planned (kept in meta for the day), its plan from the
// engine (same per-lift planning as a program session), and Start, which
// locks the plan exactly as shown. It never advances a program's rotation.
import type { GymDb } from '../db';
import {
  getActiveProgram, getMeta, getProfile, listEvents, listExercises, listSessions, listSetsByDate, putCommit, setMeta, startSession,
} from '../db';
import type { GoalKind, ISODate, Millis, Readiness, Session, Target } from '../domain/types';
import { addDays, daysBetween, reentryNote, reentryState } from '../engine';
import { kg, nextRotationKey, planSlots, type DayPlan } from './coach';
import { newId } from '../db/util';
import { GOAL_WEEK_SETS, pickFocus, reasonLine, suggestWorkout, type DraftSlot, type LiftUse, type PartWeek } from './suggest';
import { BODY_PARTS, bodyPartOf, weekBodyPartSets, type BodyPart } from './weekSets';

export interface WorkoutDraft { date: ISODate; focus: BodyPart[]; slots: DraftSlot[] }
export type WorkoutPlan = DayPlan & { reasons: string[] };

/** A one-off workout's session key: not a program session, so the rotation ignores it. */
export const WORKOUT_KEY = 'workout';
export const WORKOUT_NAME = "Today's workout";

/** This week's sets per body part against its target, when each was last trained, and each lift's use in 90 days. */
async function weekState(db: GymDb, today: ISODate) {
  const [profile, program, exercises, weekSets, sets90, sessions, all, skips] = await Promise.all([
    getProfile(db), getActiveProgram(db), listExercises(db, { includeArchived: true }),
    listSetsByDate(db, { from: addDays(today, -7), to: today }), listSetsByDate(db, { from: addDays(today, -90), to: today }),
    listSessions(db, { from: addDays(today, -7), to: today }), listSessions(db), listEvents(db, { type: 'skip' }),
  ]);
  const byId = Object.fromEntries(exercises.map(e => [e.id, e]));
  const goal = profile?.primaryGoal ?? 'maintain';
  const week = weekBodyPartSets({
    sets: weekSets, sessions, exercises: byId, program: program ?? null,
    nextKey: program ? nextRotationKey(program, all, skips) : null, target: profile?.sessionsPerWeekTarget ?? 3, today,
  });
  const last = new Map<BodyPart, ISODate>();
  for (const s of weekSets) {
    const m = byId[s.exerciseId]?.muscles[0];
    const part = m ? bodyPartOf(m) : null;
    if (s.kind === 'warmup' || !part || s.date >= today) continue;
    if (!last.has(part) || last.get(part)! < s.date) last.set(part, s.date);
  }
  const rows: PartWeek[] = BODY_PARTS.map(part => {
    const r = week.find(w => w.part === part);
    return { part, done: r?.done ?? 0, target: r && r.planned > 0 ? r.planned : GOAL_WEEK_SETS[goal][part], lastTrained: last.get(part) ?? null };
  });
  const use = new Map<string, LiftUse>();
  for (const s of sets90) {
    if (s.kind === 'warmup' || s.date >= today) continue;
    const u = use.get(s.exerciseId) ?? { sets90: 0, lastDate: null };
    use.set(s.exerciseId, { sets90: u.sets90 + 1, lastDate: !u.lastDate || u.lastDate < s.date ? s.date : u.lastDate });
  }
  const goalLiftIds = new Set((profile?.targets ?? []).map(t => t.subject).filter(id => id in byId));
  return { profile, exercises, rows, use, goalLiftIds, goal };
}

/** The focus chips' numbers: this week's sets per body part against its target, plus the goal and the Goal Board lifts. */
export async function focusState(db: GymDb, today: ISODate): Promise<{ rows: PartWeek[]; goal: GoalKind; goalLiftIds: Set<string> }> {
  const w = await weekState(db, today);
  return { rows: w.rows, goal: w.goal, goalLiftIds: w.goalLiftIds };
}

/** A fresh suggestion; `focus` overrides the body parts picked from this week. */
export async function suggestDraft(db: GymDb, today: ISODate, focus?: BodyPart[]): Promise<WorkoutDraft> {
  const w = await weekState(db, today);
  const f = focus ?? pickFocus(w.rows, today);
  const slots = suggestWorkout({
    focus: f, rows: w.rows, exercises: w.exercises, use: w.use, goalLiftIds: w.goalLiftIds, goal: w.goal, today,
    ...(w.profile?.maxSessionMinutes ? { maxMinutes: w.profile.maxSessionMinutes } : {}), newId: () => newId('slot'),
  });
  return { date: today, focus: f, slots };
}

/** Today's draft as it was left, else a fresh suggestion (a draft from another day is dropped). */
export async function loadDraft(db: GymDb, today: ISODate): Promise<WorkoutDraft> {
  const d = await getMeta(db, 'workoutDraft');
  return d && d.date === today ? (d as WorkoutDraft) : suggestDraft(db, today);
}

export async function saveDraft(db: GymDb, d: WorkoutDraft): Promise<void> {
  await setMeta(db, 'workoutDraft', d);
}

/** The draft as a plan with the engine's numbers, plus a reason line per lift. */
export async function planWorkout(db: GymDb, d: WorkoutDraft, today: ISODate, now: Millis, opts: { readiness?: Readiness } = {}): Promise<WorkoutPlan> {
  void now;
  const [w, past] = await Promise.all([weekState(db, today), listSessions(db, { to: addDays(today, -1) })]);
  const dates = past.map(s => s.date);
  const reentry = reentryState(dates, today);
  const lastDate = dates[dates.length - 1];
  const gapDays = lastDate ? daysBetween(lastDate, today) : null;
  const readiness = opts.readiness ?? 'green';
  const effortScale = w.profile?.effortScale ?? 'rir';
  const slots = await planSlots(db, {
    slots: d.slots.map(s => ({ raw: s.slot, slot: s.slot, ...(s.weight !== undefined ? { chosen: s.weight } : {}) })),
    today, readiness, effortScale, gapDays, reentry, profile: w.profile, minimumIds: [],
  });
  const reasons = d.slots.map((s, i) => {
    if (s.weight !== undefined) return 'Your weight';
    const row = w.rows.find(r => r.part === s.part) ?? null;
    return reasonLine(row, w.use.get(s.slot.exerciseId)?.lastDate ?? null, w.goalLiftIds.has(s.slot.exerciseId), today, slots[i].exercise.name.toLowerCase());
  });
  return {
    status: slots.length ? 'planned' : 'empty_session', today, sessionKey: WORKOUT_KEY, sessionName: WORKOUT_NAME,
    readiness, minimum: false, slots, reentry, reentryNote: reentryNote(reentry), gapDays, effortScale, reasons,
  };
}

/** Start is offered only with something planned and no other session open. */
export function canStartWorkout(open: Session | null | undefined, plan: { status: string }): boolean {
  return !open && plan.status === 'planned';
}

/** Start: the session and its commit, exactly the targets shown; the draft is dropped. */
export async function commitWorkout(db: GymDb, plan: WorkoutPlan, readiness: Readiness, now: Millis): Promise<Session> {
  if (plan.status !== 'planned') throw new Error('Nothing to start: the workout has no lifts');
  const session = await startSession(db, { programSessionKey: WORKOUT_KEY, nameSnapshot: WORKOUT_NAME, readiness, date: plan.today, now });
  await putCommit(db, { sessionId: session.id, committedAt: now, readiness, targets: plan.slots.map(s => s.target) });
  await db.meta.delete('workoutDraft');
  return session;
}

/** The line under a lift in the builder: "Top 100 × 2, then 3 × 8 at 75", "3 × 8 at 70", or a first time. */
export function planSummary(t: Target, plannedSets: number): string {
  if (t.isNew) return 'First time: pick a weight';
  if (t.model === 'topset' && t.topWeight !== undefined) return `Top ${kg(t.topWeight)} × ${t.topReps ?? 1}, then ${t.targetSets ?? 0} × ${t.targetReps} at ${kg(t.weight)}`;
  return t.weight > 0 ? `${plannedSets} × ${t.targetReps} at ${kg(t.weight)}` : `${plannedSets} × ${t.targetReps}`;
}
