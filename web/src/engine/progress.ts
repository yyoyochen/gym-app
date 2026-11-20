// Track: e1RM, per-lift series, PRs, weekly muscle volume and goal pace.
import type { Exercise, ISODate, SetEntry, TargetType } from '../domain/types';
import { addDays, daysBetween, isoWeekKey } from './dates';
import { prs as legacyPrs, sessionSeries as legacySeries } from './port/analysis';
import type { LegacySetRow, PR, SessionPoint } from './port/types';
import { weakFlags as legacyWeakFlags } from './port/volume';

export type E1rmFormula = 'epley' | 'brzycki' | 'lander' | 'oconner';

/**
 * Estimated 1RM. A single is its own max under every formula. Brzycki and
 * Lander have a pole near 37 reps; past it they fall back to Epley rather
 * than return nonsense.
 */
export function e1rm(weight: number, reps: number, formula: E1rmFormula = 'epley'): number {
  if (reps <= 1) return weight;
  switch (formula) {
    case 'brzycki': return reps < 37 ? (weight * 36) / (37 - reps) : e1rm(weight, reps);
    case 'lander': {
      const d = 101.3 - 2.67123 * reps;
      return d > 0 ? (100 * weight) / d : e1rm(weight, reps);
    }
    case 'oconner': return weight * (1 + 0.025 * reps);
    default: return weight * (1 + reps / 30.0);
  }
}

/** One lift's sets from one session, with the session's date. */
export interface DatedSets {
  date: ISODate;
  sets: SetEntry[];
}

export interface SeriesOptions {
  formula?: E1rmFormula;
  bodyweightKg?: number;
}

/** Working sets only: warm-ups never count for progress (§3.1). */
export function workingSets(sets: SetEntry[]): SetEntry[] {
  return sets.filter((s) => s.kind !== 'warmup');
}

function toRows(exercise: Exercise, history: DatedSets[]): LegacySetRow[] {
  return history.flatMap((h) => workingSets(h.sets).filter((s) => s.exerciseId === exercise.id).map((s) => ({
    date: h.date, session: s.sessionId, exercise: exercise.id, order: s.slotOrder, set_num: s.setOrder, reps: s.reps, weight: s.weight,
  })));
}

/** Per-session points for one lift. Bodyweight lifts need bodyweightKg for e1RM. */
export function liftSeries(exercise: Exercise, history: DatedSets[], opts: SeriesOptions = {}): SessionPoint[] {
  const f = opts.formula ?? 'epley';
  return legacySeries(toRows(exercise, history), exercise.id, {
    bodyweightFactor: exercise.bodyweightFactor, bodyweightKg: opts.bodyweightKg, e1rm: (w, r) => e1rm(w, r, f),
  });
}

export function prs(series: SessionPoint[]): PR[] {
  return legacyPrs(series);
}

/** Best e1RM in the trailing window (default 90 days, the Profile's "from my log"). */
export function bestRecentE1rm(series: SessionPoint[], today: ISODate, windowDays = 90): number | null {
  const cutoff = addDays(today, -windowDays);
  const recent = series.filter((p) => p.date >= cutoff && p.date <= today);
  return recent.length ? Math.max(...recent.map((p) => p.e1rm)) : null;
}

/** Best reps ever done at each weight (the "rep PRs" table). */
export function repPRs(exercise: Exercise, history: DatedSets[]): { weight: number; reps: number; date: ISODate }[] {
  const best = new Map<number, { weight: number; reps: number; date: ISODate }>();
  for (const h of history) {
    for (const s of workingSets(h.sets)) {
      if (s.exerciseId !== exercise.id || s.reps <= 0 || s.failed) continue;
      const cur = best.get(s.weight);
      if (!cur || s.reps > cur.reps) best.set(s.weight, { weight: s.weight, reps: s.reps, date: h.date });
    }
  }
  return [...best.values()].sort((a, b) => a.weight - b.weight);
}

/** Heaviest completed single or better (the "heaviest single" PR). */
export function heaviestSingle(exercise: Exercise, history: DatedSets[]): { weight: number; date: ISODate } | null {
  let out: { weight: number; date: ISODate } | null = null;
  for (const h of history) {
    for (const s of workingSets(h.sets)) {
      if (s.exerciseId === exercise.id && s.reps >= 1 && !s.failed && (!out || s.weight > out.weight)) out = { weight: s.weight, date: h.date };
    }
  }
  return out;
}

/**
 * Average working sets per muscle per training week, split evenly across a
 * lift's muscles (same rule as the ported volume.weekly_sets, minus warm-ups).
 */
export function weeklySetsPerMuscle(history: DatedSets[], exercises: Record<string, Exercise>): Record<string, number> {
  const weeks = new Set<string>();
  const totals: Record<string, number> = {};
  for (const h of history) {
    for (const s of workingSets(h.sets)) {
      const muscles = exercises[s.exerciseId]?.muscles;
      if (!muscles?.length) continue;
      weeks.add(isoWeekKey(h.date));
      for (const m of muscles) totals[m] = (totals[m] ?? 0) + 1 / muscles.length;
    }
  }
  const n = Math.max(1, weeks.size);
  return Object.fromEntries(Object.entries(totals).map(([m, v]) => [m, v / n]));
}

export const weakFlags = legacyWeakFlags;

// ---------------------------------------------------------------- pace

export type Feasibility = 'comfortable' | 'ambitious' | 'unlikely';

/**
 * The user's own recent rate in kg/week: least-squares slope of e1RM over the
 * window. Needs 3 points spread over at least 14 days, or it is noise.
 */
export function recentRate(series: SessionPoint[], today: ISODate, windowDays = 56): number | null {
  const pts = series.filter((p) => p.date <= today && daysBetween(p.date, today) <= windowDays);
  if (pts.length < 3 || daysBetween(pts[0].date, pts[pts.length - 1].date) < 14) return null;
  const xs = pts.map((p) => daysBetween(pts[0].date, p.date));
  const ys = pts.map((p) => p.e1rm);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  return den === 0 ? null : (num / den) * 7;
}

export interface PaceInput {
  current: number;
  target: number;
  type: TargetType;
  today: ISODate;
  deadline: ISODate;
  /** kg/week from recentRate; null when there isn't enough history. */
  actualPerWeek: number | null;
}

export interface Pace {
  weeksLeft: number;
  /** kg/week still needed; 0 for a hold that is already met. */
  neededPerWeek: number;
  actualPerWeek: number | null;
  /** current + actual pace × weeks left (actual taken as flat when unknown). */
  projected: number;
  feasibility: Feasibility;
  /** True when the label had no rate to go on and assumed a flat trend. */
  assumedFlat: boolean;
}

/**
 * Needed vs actual pace and a plain label from the user's own rate, never
 * population norms. "comfortable": the current trend gets there. "ambitious":
 * the trend gets at least half the remaining way, or a met target is slipping.
 * "unlikely": less than that.
 */
export function pace(inp: PaceInput): Pace {
  const weeksLeft = daysBetween(inp.today, inp.deadline) / 7;
  const gap = inp.target - inp.current;
  const actual = inp.actualPerWeek;
  const rate = actual ?? 0;
  const assumedFlat = actual === null;
  if (weeksLeft <= 0) {
    return { weeksLeft: 0, neededPerWeek: 0, actualPerWeek: actual, projected: inp.current,
      feasibility: gap <= 0 ? 'comfortable' : 'unlikely', assumedFlat };
  }
  const needed = gap / weeksLeft;
  const projected = inp.current + rate * weeksLeft;
  let feasibility: Feasibility;
  if (projected >= inp.target - 1e-9) feasibility = 'comfortable';
  else if (gap <= 0) feasibility = 'ambitious'; // met today but trending below by the date
  else if (rate >= needed / 2) feasibility = 'ambitious';
  else feasibility = 'unlikely';
  return { weeksLeft, neededPerWeek: Math.max(0, needed), actualPerWeek: actual, projected, feasibility, assumedFlat };
}
