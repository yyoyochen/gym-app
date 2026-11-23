// Coach glue (spec §3.4, §3.5): turns the db into engine inputs and engine
// outputs into what Today, Session and Review show. The engine stays pure;
// this file is the only place that reads the db for a prescription.
//
// The invariant (spec §2.1): a session's targets are computed ONCE, before
// the first set, by planToday(), frozen by commitSession() with putCommit
// (write-once), and from then on every screen reads them back from
// getCommit(). Nothing here re-prescribes a committed session.
import type {
  AppEvent, Commit, EffortScale, Exercise, ISODate, LiftResult, Millis, Program, Readiness,
  Session, SetEntry, Slot, SlotParams, Target,
} from '../domain/types';
import type { GymDb, ProfileRecord, StoredSet } from '../db';
import {
  getActiveProgram, getCommit, getExercise, getExerciseHistory, getLastSession, getMeta, getOpenSession,
  getProfile, getSession, getSessionSets, listBodyweight, listEvents, listExercises, listSessions, listSetsByDate,
  logEvent, putCommit, sealSession, startSession,
} from '../db';
import { guessExercise } from '../domain/catalog';
import {
  addDays, chosenTarget, listTarget, classifyGap, daysBetween, formatFloor, grade, lastSessionLine, lastTimeParts, minimumToKeep, nudge,
  painEventsFromSets, painStatus, prescribe, reentryNote, reentryState, resumeCard, stopsLiftToday,
  type ExerciseSession, type Gap, type LiftSession, type Nudge, type PainStatus, type PlannedSet,
  type ReentryState, type ResumeCard,
} from '../engine';
import { getPlateSettings, type PlateSettings } from './prefs';
import { displayName } from './labels';
import { startingSetFor } from './setup';

const EPS = 1e-9;

/** "82.5", "100" — kg without trailing zeros. */
export function kg(n: number): string {
  return String(Math.round(n * 100) / 100);
}

// ---------------------------------------------------------------- slot params

/** Applies the phase overrides active on `today` to a slot's params. */
export function effectiveSlot(slot: Slot, program: Program | undefined, today: ISODate): Slot {
  let params: SlotParams = { ...slot.params };
  for (const ph of program?.phases ?? []) {
    if (ph.start <= today && today <= ph.end) params = { ...params, ...(ph.overrides?.[slot.model] ?? {}) };
  }
  return { ...slot, params };
}

// ---------------------------------------------------------------- rotation

interface RotationMark { key: string; date: ISODate; at: number }

/**
 * Next program session in the rotation. Recorded sessions AND recorded skips
 * both advance it (a skip is a choice, not a gap). Sessions outside the
 * rotation (imports, ad-hoc) are ignored.
 */
export function nextRotationKey(program: Program, sessions: Session[], skips: AppEvent[]): string | null {
  const rot = program.rotation.filter(k => program.sessions.some(s => s.key === k));
  if (!rot.length) return program.sessions[0]?.key ?? null;
  const marks: RotationMark[] = [
    ...sessions.filter(s => rot.includes(s.programSessionKey)).map(s => ({ key: s.programSessionKey, date: s.date, at: s.startedAt })),
    ...skips.flatMap(e => {
      const d = e.data as { sessionKey?: string; at?: number } | undefined;
      return d?.sessionKey && rot.includes(d.sessionKey) ? [{ key: d.sessionKey, date: e.date, at: d.at ?? 0 }] : [];
    }),
  ].sort((a, b) => (a.date === b.date ? a.at - b.at : a.date < b.date ? -1 : 1));
  const last = marks[marks.length - 1];
  if (!last) return rot[0];
  return rot[(rot.indexOf(last.key) + 1) % rot.length];
}

// ---------------------------------------------------------------- plan

export interface SlotPlan {
  /** 1-based position in the session; sets for this target use this slotOrder. */
  slotOrder: number;
  /** The program slot, when it still exists (display only: set count). */
  slot: Slot | null;
  exercise: Exercise;
  /** THE promise. For a committed session this is commit.targets[i], untouched. */
  target: Target;
  /** Working sets planned (top set included). */
  plannedSets: number;
  /** "As planned", one row per planned working set. Logging exactly these keeps the promise. */
  ghost: PlannedSet[];
  warmups: PlannedSet[];
  /** Last session's working sets for this lift, as parts ([] = first time). */
  lastTime: string[];
  lastNote?: string;
  /** Effort floor in the user's scale, e.g. "≥ 2 RIR". */
  floorLabel: string;
  pain?: PainStatus;
  inMinimum: boolean;
}

export type PlanStatus = 'planned' | 'committed' | 'no_program' | 'empty_session';

export interface DayPlan {
  status: PlanStatus;
  today: ISODate;
  sessionKey: string | null;
  sessionName: string;
  readiness: Readiness;
  minimum: boolean;
  slots: SlotPlan[];
  reentry: ReentryState;
  reentryNote: string;
  /** Days since the previous session date (null: none). */
  gapDays: number | null;
  effortScale: EffortScale;
  session?: Session;
  commit?: Commit;
}

export interface PlanOptions {
  readiness?: Readiness;
  /** Override the rotation (e.g. preview a specific session). */
  sessionKey?: string;
  /** Only the program session's minimum slots. */
  minimum?: boolean;
  /** Ignore an open session and plan fresh (Review's next-session preview). */
  ignoreOpen?: boolean;
}

async function exerciseOf(db: GymDb, id: string, fallbackName?: string): Promise<Exercise> {
  return (await getExercise(db, id)) ?? { ...guessExercise(fallbackName ?? id), id };
}

/** Latest bodyweight on or before `today`. */
async function bodyweightOn(db: GymDb, today: ISODate): Promise<number | undefined> {
  const rows = await listBodyweight(db, { to: today });
  return rows[rows.length - 1]?.kg;
}

/**
 * Plan a day. If a session is open it returns that session's COMMITTED
 * targets as stored (status 'committed'): today's sets never change today's
 * promise, and a session that crossed midnight is still the same session.
 * Otherwise it prescribes the next program session in rotation from days
 * strictly before `today`.
 */
export async function planToday(db: GymDb, today: ISODate, now: Millis, opts: PlanOptions = {}): Promise<DayPlan> {
  void now;
  const [profile, program] = await Promise.all([getProfile(db), getActiveProgram(db)]);
  const effortScale: EffortScale = profile?.effortScale ?? 'rir';
  const pastSessions = (await listSessions(db, { to: addDays(today, -1) }));
  const dates = pastSessions.map(s => s.date);
  const reentry = reentryState(dates, today);
  const lastDate = dates[dates.length - 1];
  const gapDays = lastDate ? daysBetween(lastDate, today) : null;
  const base = { today, reentry, reentryNote: reentryNote(reentry), gapDays, effortScale };

  if (!opts.ignoreOpen) {
    const open = await getOpenSession(db);
    const commit = open && (await getCommit(db, open.id));
    if (open && commit) return committedPlan(db, open, commit, program, effortScale, base);
  }

  if (!program || !program.sessions.length) {
    return { ...base, status: 'no_program', sessionKey: null, sessionName: '', readiness: opts.readiness ?? 'green', minimum: false, slots: [] };
  }
  const all = await listSessions(db);
  const skips = await listEvents(db, { type: 'skip' });
  const key = opts.sessionKey ?? nextRotationKey(program, all, skips);
  const ps = program.sessions.find(s => s.key === key) ?? program.sessions[0];
  const readiness = opts.readiness ?? 'green';
  const minimum = !!opts.minimum && ps.minimumSlotIds.length > 0;
  const slots = minimum ? ps.slots.filter(s => ps.minimumSlotIds.includes(s.id)) : ps.slots;

  const out = await planSlots(db, {
    slots: slots.map(raw => ({ raw, slot: effectiveSlot(raw, program, today) })), today, readiness, effortScale, gapDays, reentry,
    profile, minimumIds: ps.minimumSlotIds,
  });
  return {
    ...base, status: out.length ? 'planned' : 'empty_session', sessionKey: ps.key, sessionName: ps.name, readiness, minimum, slots: out,
  };
}

/**
 * The engine's plan for each slot, the same way for a program session and a
 * one-off workout (app/workout.ts). `chosen` gives a lift a weight the lifter
 * set; its target is then built at that weight (engine chosenTarget), and a
 * lift with no history becomes a plain fixed plan at it.
 */
export async function planSlots(db: GymDb, i: {
  slots: { raw: Slot; slot: Slot; chosen?: number; list?: { weight: number; reps: number }[] }[]; today: ISODate; readiness: Readiness; effortScale: EffortScale;
  gapDays: number | null; reentry: ReentryState; profile: ProfileRecord | undefined; minimumIds: string[];
  /** A one-off workout: count planned sets from the target alone, as the logger will once no program slot exists. */
  slotless?: boolean;
}): Promise<SlotPlan[]> {
  const { today } = i;
  // Pain flags in the last 60 days (the rules look back 14; holds look at the last session).
  const painSets = (await listSetsByDate(db, { from: addDays(today, -60), to: addDays(today, -1) })).filter(s => s.pain);
  const dateOf = new Map(painSets.map(s => [s.sessionId, s.date] as const));
  const painEvents = painEventsFromSets(painSets, id => dateOf.get(id));
  const bodyweightKg = await bodyweightOn(db, today);
  const plates = await getPlateSettings(db);

  const out: SlotPlan[] = [];
  for (const [n, { raw, slot, chosen, list }] of i.slots.entries()) {
    const exercise = await exerciseOf(db, slot.exerciseId);
    const hist = await liftHistory(db, exercise.id, today);
    const pain = painStatus({
      exercise, events: painEvents, today, injuries: i.profile?.injuries ?? [],
      history: hist.map((h): ExerciseSession => ({ date: h.date, sessionId: h.sessionId, exerciseId: exercise.id })),
    });
    const ctx = {
      today, readiness: i.readiness, effortScale: i.effortScale, bodyweightKg, gapDays: i.gapDays,
      reentry: i.reentry.reentry, afterLayoff: i.reentry.afterLayoff, pain, startingSet: startingSetFor(i.profile, exercise.id, today),
    };
    const fresh = !hist.some(h => h.sets.some(s => s.kind !== 'warmup'));
    // A weight on a lift never done before is a plain fixed plan; a top set stays a top set with its back-offs.
    const target = list?.length ? listTarget(slot, exercise, list, ctx) : chosen === undefined ? prescribe(slot, exercise, hist, ctx)
      : chosenTarget(fresh && slot.model !== 'topset' ? { ...slot, model: 'fixed' } : slot, exercise, chosen, ctx);
    out.push(slotPlan(n + 1, i.slotless ? null : raw, exercise, target, hist, i.effortScale, plates, i.minimumIds.includes(raw.id), pain));
  }
  return out;
}

/** One lift's earlier sessions (strictly before `today`), oldest first, with the promise committed each day. */
export async function liftHistory(db: GymDb, exerciseId: string, today: ISODate, limit = 40): Promise<LiftSession[]> {
  const days = await getExerciseHistory(db, exerciseId, { before: today, limit });
  const out: LiftSession[] = [];
  for (const d of days.reverse()) {
    const c = await getCommit(db, d.session.id);
    const target = c?.targets.find(t => t.exerciseId === exerciseId);
    out.push({ date: d.session.date, sessionId: d.session.id, sets: d.sets, ...(target ? { target } : {}) });
  }
  return out;
}

async function committedPlan(
  db: GymDb, session: Session, commit: Commit, program: Program | undefined, effortScale: EffortScale,
  base: Pick<DayPlan, 'today' | 'reentry' | 'reentryNote' | 'gapDays' | 'effortScale'>,
): Promise<DayPlan> {
  const ps = program?.sessions.find(s => s.key === session.programSessionKey);
  const plates = await getPlateSettings(db);
  const slots: SlotPlan[] = [];
  for (const [i, target] of commit.targets.entries()) {
    const exercise = await exerciseOf(db, target.exerciseId, target.exerciseName);
    const hist = await liftHistory(db, exercise.id, session.date, 3);
    const slot = ps?.slots.find(s => s.id === target.slotId) ?? null;
    slots.push(slotPlan(i + 1, slot, exercise, target, hist, effortScale, plates, !!ps?.minimumSlotIds.includes(target.slotId)));
  }
  return {
    ...base, status: 'committed', sessionKey: session.programSessionKey, sessionName: session.nameSnapshot,
    readiness: commit.readiness, minimum: false, slots, session, commit,
  };
}

function slotPlan(
  slotOrder: number, slot: Slot | null, exercise: Exercise, target: Target, hist: LiftSession[], scale: EffortScale,
  plates: PlateSettings, inMinimum: boolean, pain?: PainStatus,
): SlotPlan {
  const plannedSets = plannedSetsFor(target, slot);
  // The last day with working sets: a day with only warm-ups logged (an abandoned session) is not "last time".
  const lastDay = [...hist].reverse().find(h => h.sets.some(x => x.kind !== 'warmup'));
  const lastNote = [...hist].reverse().flatMap(h => h.sets.filter(s => s.note).map(s => s.note as string))[0];
  return {
    slotOrder, slot, exercise, target, plannedSets,
    ghost: ghostSets(target, plannedSets),
    warmups: warmupRamp(target.topWeight ?? target.weight, exercise, plates.barKg),
    lastTime: lastDay ? lastTimeParts(lastDay.sets) : [],
    ...(lastNote ? { lastNote } : {}),
    floorLabel: formatFloor(target.rirFloor, scale),
    ...(pain ? { pain } : {}),
    inMinimum,
  };
}

/** Working sets planned for a target: the top set plus back-offs, or the slot's set count. */
export function plannedSetsFor(t: Target, slot: Slot | null): number {
  if (t.setList) return t.setList.length;
  if (t.model === 'topset') return 1 + (t.targetSets ?? slot?.params.backoffSets ?? 0);
  return t.targetSets ?? slot?.params.sets ?? Math.max(t.prevTop.length, 3);
}

/**
 * The "as planned" rows: minimumToKeep (which grades hit by construction),
 * padded to the planned set count with the target weight × reps. Effort is
 * pre-filled at the floor.
 */
export function ghostSets(t: Target, planned: number): PlannedSet[] {
  const base = minimumToKeep(t);
  const padKind: PlannedSet['kind'] = t.model === 'topset' ? 'backoff' : 'working';
  const rows = base.slice();
  // Extra planned sets repeat the last promised set. Padding with targetReps
  // would put the top of the rep range (12, 20) on a set with no history and
  // make "log as planned" an inflated BEAT.
  const padReps = t.model === 'double' && rows.length ? rows[rows.length - 1].reps : t.targetReps;
  while (rows.length < planned) rows.push({ kind: padKind, weight: t.weight, reps: padReps });
  return rows.map(r => ({ ...r, rir: r.rir ?? t.rirFloor }));
}

// ---------------------------------------------------------------- warm-ups

const NOT_BARBELL = /\b(db|dumbbell|machine|cable|leg press|hack|smith|kettlebell|kb|goblet|lunge|split squat)\b/i;

export function isBarbell(ex: Exercise): boolean {
  return ex.slotType === 'compound' && ex.bodyweightFactor === 0 && !NOT_BARBELL.test(ex.name);
}

/**
 * Warm-up ramp to the top/working weight: bar × 8, 50% × 5, 70% × 3, 85% × 1,
 * rounded to the exercise increment. Steps at or above the work weight, or not
 * heavier than the step before, are dropped. Isolation and bodyweight lifts get
 * none; non-barbell compounds skip the empty bar. Warm-ups are never graded.
 */
export function warmupRamp(work: number, ex: Exercise, barKg = 20): PlannedSet[] {
  if (ex.slotType !== 'compound' || ex.bodyweightFactor > 0 || work <= 0) return [];
  const bar = isBarbell(ex);
  if (bar && work <= barKg + EPS) return [];
  const step = ex.increment > 0 ? ex.increment : 2.5;
  const round = (x: number) => Math.round(x / step) * step;
  const raw: [number, number][] = [
    ...(bar ? [[barKg, 8] as [number, number]] : []),
    [round(work * 0.5), 5], [round(work * 0.7), 3], [round(work * 0.85), 1],
  ];
  const out: PlannedSet[] = [];
  let prev = 0;
  for (const [w, reps] of raw) {
    const ww = bar ? Math.max(w, barKg) : w;
    if (ww <= prev + EPS || ww >= work - EPS || ww <= 0) continue;
    out.push({ kind: 'warmup', weight: Math.round(ww * 100) / 100, reps });
    prev = ww;
  }
  return out;
}

// ---------------------------------------------------------------- plates

export interface PlateLoad {
  bar: number;
  /** Plates for ONE side, heaviest first. */
  perSide: number[];
  /** kg that can't be made with these plates (0 when exact). */
  remainder: number;
  belowBar: boolean;
}

export function platesPerSide(total: number, barKg: number, plates: number[]): PlateLoad {
  if (total < barKg - EPS) return { bar: barKg, perSide: [], remainder: 0, belowBar: true };
  let rem = Math.round(((total - barKg) / 2) * 1000) / 1000;
  const perSide: number[] = [];
  for (const p of [...plates].sort((a, b) => b - a)) {
    while (rem >= p - EPS) { perSide.push(p); rem = Math.round((rem - p) * 1000) / 1000; }
  }
  return { bar: barKg, perSide, remainder: Math.round(rem * 2 * 1000) / 1000, belowBar: false };
}

// ---------------------------------------------------------------- commit / skip

/**
 * Start the session (date pinned to plan.today) and freeze the plan's targets.
 * The readiness is part of the plan: if the caller passes a different one the
 * plan is rebuilt BEFORE committing, so the promise already includes it.
 */
export async function commitSession(db: GymDb, plan: DayPlan, readiness: Readiness, now: Millis): Promise<Session> {
  if (plan.status === 'committed' && plan.session) return plan.session;
  if (plan.status !== 'planned' || !plan.sessionKey) throw new Error('Nothing to commit: no planned session');
  let p = plan;
  if (p.readiness !== readiness) {
    p = await planToday(db, plan.today, now, { readiness, sessionKey: plan.sessionKey, minimum: plan.minimum, ignoreOpen: true });
  }
  const session = await startSession(db, {
    programSessionKey: p.sessionKey!, nameSnapshot: p.minimum ? `${p.sessionName} (minimum)` : p.sessionName,
    readiness, date: p.today, now,
  });
  await putCommit(db, { sessionId: session.id, committedAt: now, readiness, targets: p.slots.map(s => s.target) });
  if (p.reentry.reentry !== 'none') await logEvent(db, p.today, 'reentry', { sessionId: session.id, gapDays: p.reentry.gapDays, kind: p.reentry.reentry });
  return session;
}

/** Record a skip. It advances the rotation and shows on the heatmap as an outlined cell. */
export async function skipSession(db: GymDb, plan: DayPlan, now: Millis): Promise<void> {
  if (!plan.sessionKey) return;
  await logEvent(db, plan.today, 'skip', { sessionKey: plan.sessionKey, name: plan.sessionName, at: now });
}

export async function finishSession(db: GymDb, sessionId: string, now: Millis): Promise<Session> {
  return sealSession(db, sessionId, now);
}

// ---------------------------------------------------------------- grade

export interface SlotGrade {
  slotOrder: number;
  target: Target;
  /** Sets logged in this slot (warm-ups included; grade() ignores them). */
  sets: SetEntry[];
  result: LiftResult;
  /** Set when the slot was swapped to another lift: logged, never graded. */
  ungraded?: string;
}

export interface SessionGrade {
  slots: SlotGrade[];
  /** Lifts added during the session (slotOrder past the commit): logged, ungraded. */
  added: { slotOrder: number; exerciseId: string; name: string; sets: SetEntry[] }[];
  kept: number;
  total: number;
}

export const isKept = (v: LiftResult['verdict']) => v === 'beat' || v === 'hit' || v === 'new';

/** Grade every committed target against that session's sets. Uses commit.targets only. */
export function gradeCommit(commit: Commit, sets: SetEntry[], scale: EffortScale = 'rir'): SessionGrade {
  const slots: SlotGrade[] = commit.targets.map((target, i) => {
    const mine = sets.filter(s => s.slotOrder === i + 1);
    const work = mine.filter(s => s.kind !== 'warmup');
    const other = work.length > 0 && work.every(s => s.exerciseId !== target.exerciseId);
    if (other) {
      const name = work[0].exerciseNameSnapshot;
      return { slotOrder: i + 1, target, sets: mine, ungraded: `swapped to ${name}`,
        result: { slotId: target.slotId, exerciseId: target.exerciseId, verdict: 'new', detail: `swapped to ${name} — logged, not graded` } };
    }
    const result = grade(target, mine.filter(s => s.exerciseId === target.exerciseId), scale);
    return { slotOrder: i + 1, target, sets: mine, result };
  });
  const extraOrders = [...new Set(sets.filter(s => s.slotOrder > commit.targets.length).map(s => s.slotOrder))].sort((a, b) => a - b);
  const added = extraOrders.map(o => {
    const ss = sets.filter(s => s.slotOrder === o);
    return { slotOrder: o, exerciseId: ss[0].exerciseId, name: ss[0].exerciseNameSnapshot, sets: ss };
  });
  const graded = slots.filter(s => !s.ungraded);
  return { slots, added, kept: graded.filter(s => isKept(s.result.verdict)).length, total: graded.length };
}

export async function gradeSession(db: GymDb, sessionId: string): Promise<SessionGrade | null> {
  const [commit, sets, profile] = await Promise.all([getCommit(db, sessionId), getSessionSets(db, sessionId), getProfile(db)]);
  if (!commit) return null;
  return gradeCommit(commit, sets, profile?.effortScale ?? 'rir');
}

/** ["105 × 2 @ 2 RIR", "85 × 8, 8, 7"]: working sets as parts, runs at one weight share it. [] when none. */
export function setsParts(sets: SetEntry[], scale: EffortScale): string[] {
  const work = sets.filter(s => s.kind !== 'warmup');
  if (!work.length) return [];
  const parts: string[] = [];
  let i = 0;
  while (i < work.length) {
    const s = work[i];
    if (s.kind === 'top') {
      parts.push(`${kg(s.weight)} × ${s.reps}${s.rir !== undefined ? ` @ ${scale === 'rpe' ? `RPE ${kg(10 - s.rir)}` : `${kg(s.rir)} RIR`}` : ''}${s.failed ? ' ✕' : ''}`);
      i++;
      continue;
    }
    const w = s.weight;
    const reps: string[] = [];
    while (i < work.length && work[i].weight === w && work[i].kind !== 'top') { reps.push(`${work[i].reps}${work[i].failed ? '✕' : ''}`); i++; }
    parts.push(`${kg(w)} × ${reps.join(', ')}`);
  }
  return parts;
}

// ---------------------------------------------------------------- remind

export interface TodayState {
  gap: Gap;
  open?: { session: Session; card: ResumeCard | null };
  /** "Last session: B, 3 days ago, 4/5 kept" (or without the count for an ungraded import). */
  lastLine?: string;
  last?: Session;
  /** A session finished today: Today leads with it instead of pushing the next one. */
  doneToday?: { session: Session; kept: number; total: number };
}

/** Last activity → gap → what the top of Today shows (§3.5). */
export async function todayState(db: GymDb, today: ISODate, now: Millis): Promise<TodayState> {
  const open = await getOpenSession(db);
  const last = open ?? (await getLastSession(db));
  if (!last) return { gap: classifyGap(undefined, now, today) };
  const sets = await getSessionSets(db, last.id);
  const lastSetAt = sets.reduce<number | undefined>((m, s) => (m === undefined || s.loggedAt > m ? s.loggedAt : m), undefined);
  const gap = classifyGap({ date: last.date, startedAt: last.startedAt, endedAt: last.endedAt, sealed: last.sealed, ...(lastSetAt !== undefined ? { lastSetAt } : {}) }, now, today);
  if (gap.kind === 'in_progress') return { gap, open: { session: last, card: resumeCard(sets, now) }, last };
  const g = await gradeSession(db, last.id);
  const d = daysBetween(last.date, today);
  const ago = d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
  const lastLine = g && g.total ? lastSessionLine(displayName(last.nameSnapshot), last.date, today, g.kept, g.total) : `Last session: ${displayName(last.nameSnapshot)}, ${ago}`;
  const doneToday = last.sealed && last.date === today ? { session: last, kept: g?.kept ?? 0, total: g?.total ?? 0 } : undefined;
  return { gap, lastLine, last, ...(doneToday ? { doneToday } : {}) };
}

export async function backupDue(db: GymDb, now: Millis): Promise<{ due: boolean; days: number | null }> {
  const at = await getMeta(db, 'lastExportAt');
  if (!at) return { due: true, days: null };
  const days = Math.floor((now - at) / 86_400_000);
  return { due: days > 14, days };
}

// ---------------------------------------------------------------- session view

export interface LiveSlot {
  slotOrder: number;
  /** The committed plan for this slot; null for an added lift. */
  plan: SlotPlan | null;
  exercise: Exercise;
  sets: SetEntry[];
  /** Working sets logged. */
  work: SetEntry[];
  nudge: Nudge | null;
  stopped: boolean;
  /** Swapped away from the committed lift (ungraded). */
  swapped: boolean;
}

export interface SessionView {
  session: Session;
  commit: Commit | null;
  plan: DayPlan | null;
  slots: LiveSlot[];
  scale: EffortScale;
  plates: PlateSettings;
  lastSet: SetEntry | null;
  profile?: ProfileRecord;
}

export interface SlotOverrides {
  /** slotOrder → exerciseId chosen before any set was logged. */
  swaps?: Record<number, string>;
  /** Added lifts not yet logged. */
  added?: { slotOrder: number; exerciseId: string }[];
}

/** Everything the logger needs, read from the commit (never re-prescribed). */
export async function sessionView(db: GymDb, sessionId: string, overrides: SlotOverrides = {}): Promise<SessionView | null> {
  const session = await getSession(db, sessionId);
  if (!session) return null;
  const [commit, sets, profile, program, plates] = await Promise.all([
    getCommit(db, sessionId), getSessionSets(db, sessionId), getProfile(db), getActiveProgram(db), getPlateSettings(db),
  ]);
  const scale: EffortScale = profile?.effortScale ?? 'rir';
  const past = await listSessions(db, { to: addDays(session.date, -1) });
  const re = reentryState(past.map(s => s.date), session.date);
  const plan = commit
    ? await committedPlan(db, session, commit, program, scale, { today: session.date, reentry: re, reentryNote: reentryNote(re), gapDays: null, effortScale: scale })
    : null;
  const slots: LiveSlot[] = [];
  for (const sp of plan?.slots ?? []) {
    const mine = sets.filter(s => s.slotOrder === sp.slotOrder);
    const work = mine.filter(s => s.kind !== 'warmup');
    const loggedOther = work.find(s => s.exerciseId !== sp.target.exerciseId);
    const swapId = loggedOther?.exerciseId ?? (work.length ? undefined : overrides.swaps?.[sp.slotOrder]);
    const swapped = !!swapId && swapId !== sp.target.exerciseId;
    const exercise = swapped ? await exerciseOf(db, swapId!, loggedOther?.exerciseNameSnapshot) : sp.exercise;
    const stop = stopsLiftToday(work);
    const n = swapped ? null : nudge({
      target: sp.target, exercise, sets: work, plannedSets: sp.plannedSets, readiness: commit?.readiness,
      effortScale: scale, reentry: re.reentry !== 'none',
    });
    slots.push({ slotOrder: sp.slotOrder, plan: sp, exercise, sets: mine, work, nudge: n, stopped: stop.stop, swapped });
  }
  const committedN = plan?.slots.length ?? 0;
  const extra = new Map<number, string>();
  for (const s of sets) if (s.slotOrder > committedN && !extra.has(s.slotOrder)) extra.set(s.slotOrder, s.exerciseId);
  for (const a of overrides.added ?? []) if (!extra.has(a.slotOrder)) extra.set(a.slotOrder, a.exerciseId);
  for (const [order, exId] of [...extra.entries()].sort((a, b) => a[0] - b[0])) {
    const mine = sets.filter(s => s.slotOrder === order);
    const exercise = await exerciseOf(db, exId, mine[0]?.exerciseNameSnapshot);
    const work = mine.filter(s => s.kind !== 'warmup');
    slots.push({ slotOrder: order, plan: null, exercise, sets: mine, work, nudge: null, stopped: stopsLiftToday(work).stop, swapped: false });
  }
  const lastSet = sets.reduce<SetEntry | null>((a, s) => (!a || s.loggedAt > a.loggedAt ? s : a), null);
  return { session, commit: commit ?? null, plan, slots, scale, plates, lastSet, ...(profile ? { profile } : {}) };
}

/** Does a logged set satisfy its slice of the promise (the lume tick)? */
export function setMeetsPlan(s: SetEntry, planned: PlannedSet | undefined, rirFloor: number): boolean {
  if (!planned || s.failed) return false;
  if (s.weight < planned.weight - EPS || s.reps < planned.reps) return false;
  if (s.kind === 'top' && s.rir !== undefined && s.rir < rirFloor) return false;
  return true;
}

/** Next free slotOrder for an added lift. */
export function nextSlotOrder(view: SessionView): number {
  return Math.max(0, ...view.slots.map(s => s.slotOrder)) + 1;
}

export async function listAllExercises(db: GymDb): Promise<Exercise[]> {
  return listExercises(db);
}

export type { StoredSet };
