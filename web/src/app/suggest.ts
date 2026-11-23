// A suggested one-off workout (docs/superpowers/specs/2026-11-23-plan-todays-workout-design.md).
// Pure: which body parts are furthest behind this week, which of the lifter's
// own lifts to use for them, and the sets and reps for the goal. Weights come
// later from the engine (app/workout.ts).
import type { Exercise, GoalKind, ISODate, Slot } from '../domain/types';
import { RIR_FLOOR } from '../domain/templates';
import { daysBetween } from './dates';
import { BODY_PARTS, bodyPartLabel, bodyPartOf, type BodyPart } from './weekSets';
import { t } from '../i18n';

/** Weekly working sets per body part when no program sets them. */
const STRENGTH: Record<BodyPart, number> = { Legs: 12, Back: 10, Chest: 8, Shoulders: 6, Arms: 4, Core: 3 };
const SIZE: Record<BodyPart, number> = { Legs: 15, Back: 14, Chest: 12, Shoulders: 10, Arms: 8, Core: 4 };
export const GOAL_WEEK_SETS: Record<GoalKind, Record<BodyPart, number>> = { strength: STRENGTH, maintain: STRENGTH, hypertrophy: SIZE, bodycomp: SIZE };

/** The catalogue lift a body part falls back to when the lifter has none of their own. */
export const FALLBACK_LIFT: Record<BodyPart, string> = {
  Legs: 'back-squat', Chest: 'barbell-bench-press', Back: 'barbell-row', Shoulders: 'overhead-press', Arms: 'db-curl', Core: 'plank',
};

export interface PartWeek { part: BodyPart; done: number; target: number; lastTrained: ISODate | null }
export interface LiftUse { sets90: number; lastDate: ISODate | null }
/** One lift in a workout draft. `sets` is the lifter's own list (it wins); `weight` is an older single chosen weight. */
export interface DraftSlot { slot: Slot; weight?: number; sets?: { weight: number; reps: number }[]; part: BodyPart | null }

/** Trained in the last 2 days (yesterday or the day before). */
const recent = (d: ISODate | null, today: ISODate) => !!d && daysBetween(d, today) <= 2;
/** Tie order: big muscle groups first. */
const ORDER: BodyPart[] = ['Legs', 'Back', 'Chest', 'Shoulders', 'Arms', 'Core'];

/** The `n` body parts furthest behind this week (share of the target done), skipping parts trained in the last 2 days unless too few are left. */
export function pickFocus(rows: PartWeek[], today: ISODate, n = 3): BodyPart[] {
  const share = (r: PartWeek) => (r.target > 0 ? r.done / r.target : Infinity);
  const ranked = rows.filter(r => r.target > 0).sort((a, b) => share(a) - share(b) || ORDER.indexOf(a.part) - ORDER.indexOf(b.part));
  const fresh = ranked.filter(r => !recent(r.lastTrained, today));
  const pick = fresh.length >= n ? fresh.slice(0, n) : [...fresh, ...ranked.filter(r => !fresh.includes(r))].slice(0, n);
  // Back in ranked order, so the furthest behind comes first.
  return ranked.filter(r => pick.includes(r)).map(r => r.part);
}

/** Squat, bench, deadlift and overhead press: the lifts a strength goal gives a top set. */
export const isMain = (ex: Exercise) => ex.benchmarkKey === 'squat' || ex.benchmarkKey === 'bench' || ex.benchmarkKey === 'deadlift' || ex.id === 'overhead-press';

/** The slot a lift gets for the goal (spec call 2). Main lifts on a strength goal get a top set. */
export function slotFor(ex: Exercise, goal: GoalKind, main: boolean, id: string): Slot {
  const iso = ex.slotType === 'isolation';
  const strength = goal === 'strength' || goal === 'maintain';
  const floor = iso ? RIR_FLOOR.isolation : RIR_FLOOR.compound;
  if (main && strength) {
    return { id, exerciseId: ex.id, model: 'topset', params: { sets: 1, topReps: 2, backoffSets: 3, backoffPct: 75, repMin: 8, repMax: 10, rirFloor: RIR_FLOOR.top } };
  }
  const [repMin, repMax] = strength ? (iso ? [12, 15] : [8, 12]) : main ? [6, 10] : iso ? [12, 20] : [10, 15];
  return { id, exerciseId: ex.id, model: 'double', params: { sets: 3, repMin, repMax, rirFloor: floor } };
}

/** Rough length: 3 minutes a working set plus 2 a lift. */
export function estimateMinutes(slots: Slot[]): number {
  return slots.reduce((m, s) => m + 2 + 3 * (s.model === 'topset' ? 1 + (s.params.backoffSets ?? 0) : s.params.sets), 0);
}

export function suggestWorkout(i: {
  focus: BodyPart[]; rows: PartWeek[]; exercises: Exercise[]; use: Map<string, LiftUse>; goalLiftIds: Set<string>;
  goal: GoalKind; today: ISODate; maxMinutes?: number; newId: () => string;
}): DraftSlot[] {
  const byId = new Map(i.exercises.map(e => [e.id, e]));
  const chosen = new Set<string>();
  const partOf = (e: Exercise) => (e.muscles[0] ? bodyPartOf(e.muscles[0]) : null);
  const candidates = (part: BodyPart) => i.exercises
    .filter(e => !e.archived && partOf(e) === part && !chosen.has(e.id))
    .filter(e => (i.use.get(e.id)?.sets90 ?? 0) > 0 || i.goalLiftIds.has(e.id))
    .filter(e => !recent(i.use.get(e.id)?.lastDate ?? null, i.today))
    .sort((a, b) => Number(i.goalLiftIds.has(b.id)) - Number(i.goalLiftIds.has(a.id)) || (i.use.get(b.id)?.sets90 ?? 0) - (i.use.get(a.id)?.sets90 ?? 0));
  const take = (ex: Exercise, part: BodyPart): DraftSlot => {
    chosen.add(ex.id);
    return { slot: slotFor(ex, i.goal, isMain(ex) || i.goalLiftIds.has(ex.id), i.newId()), part };
  };

  const out: DraftSlot[] = [];
  for (const part of i.focus) {
    const ex = candidates(part)[0] ?? (chosen.has(FALLBACK_LIFT[part]) ? undefined : byId.get(FALLBACK_LIFT[part]));
    if (ex) out.push(take(ex, part));
  }
  if (out.length && out.length < 4) {
    const second = candidates(i.focus[0])[0];
    if (second) out.push(take(second, i.focus[0]));
  }
  while (i.maxMinutes && out.length > 1 && estimateMinutes(out.map(d => d.slot)) > i.maxMinutes) out.pop();
  return out;
}

/** "Legs 0 of 15 sets this week, last squat 6 days ago". `lift` is the lift's name in lower case. */
export function reasonLine(row: PartWeek | null, liftLast: ISODate | null, isGoal: boolean, today: ISODate, lift: string): string {
  const days = liftLast ? daysBetween(liftLast, today) : null;
  const since = days === null ? t('first time') : days === 1 ? t('last {lift} yesterday', { lift }) : t('last {lift} {n} days ago', { lift, n: days });
  if (!row) return since.charAt(0).toUpperCase() + since.slice(1);
  const part = bodyPartLabel(row.part);
  if (isGoal) return t('{part} {done} of {target}, Goal Board lift', { part, done: row.done, target: row.target });
  return t('{part} {done} of {target} sets this week, {since}', { part, done: row.done, target: row.target, since });
}

export { BODY_PARTS };
