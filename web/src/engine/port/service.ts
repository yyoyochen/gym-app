// Port of the pure orchestration in app/service.py and logsource.last_session_of:
// attempt history, tired-day easing, and per-lift target selection.
import type { ISODate } from '../../domain/types';
import { pyRound } from '../pyformat';
import { bestRecentE1rm } from './analysis';
import { progressionTarget } from './progression';
import { strengthTarget } from './strength';
import type { Attempt, Faithful, LegacySetRow, LegacyTarget, WR } from './types';

// In strength mode only main compounds (fixed-8 lifts) switch to 5x5;
// accessories keep double progression at their own rep target.
export const MAIN_COMPOUND_RANGE: [number, number] = [8, 8];
export const ATTEMPT_SESSIONS = 6;
// Tired day: strength work drops to ~92.5% of the prescribed load; a
// hypertrophy jump is deferred (repeat the last top weight instead).
export const TIRED_STRENGTH_PCT = 0.925;
export const TIRED_SUFFIX = ' — eased for a tired day (autoregulation)';
// A load within 10% of the day's heaviest can be the load the day was worked
// at; anything lighter is ramp-up, even in logs that don't mark warm-ups.
export const WORKED_BAND = 0.9;

/** (weight, reps) of the lift's most recent date. */
export function lastSessionOf(sets: LegacySetRow[], exercise: string): WR[] {
  const rows = sets.filter((s) => s.exercise === exercise);
  if (!rows.length) return [];
  const latest = rows.reduce((m, s) => (s.date > m ? s.date : m), rows[0].date);
  return rows.filter((s) => s.date === latest).map((s) => [s.weight, s.reps]);
}

/**
 * The load a day was worked at: the weight with the most sets among those
 * within WORKED_BAND of the day's top (ties go to the heavier). Python used
 * only the max, so 3 × 5 @ 102.5 + 2 × 5 @ 105 read as "two sets at 105" and
 * the completed 5 × 5 earned nothing.
 */
export function workedLoad(day: WR[]): number {
  const top = Math.max(...day.map(([w]) => w));
  const counts = new Map<number, number>();
  for (const [w] of day) if (w >= top * WORKED_BAND) counts.set(w, (counts.get(w) ?? 0) + 1);
  let best = top;
  let bestN = 0;
  for (const [w, n] of counts) {
    if (n > bestN || (n === bestN && w > best)) { best = w; bestN = n; }
  }
  return best;
}

export interface AttemptOptions extends Faithful {
  limit?: number;
  /** >0 for bodyweight lifts: a 0 kg set is real work, not "no data". */
  bodyweightFactor?: number;
  /** Committed target weight per date; when known it is the worked load. */
  plannedWeight?: Record<ISODate, number>;
}

/** Chronological [(worked load, reps at or above it)] for the lift's recent sessions. */
export function attemptHistory(sets: LegacySetRow[], lift: string, opts: AttemptOptions = {}): Attempt[] {
  const limit = opts.limit ?? ATTEMPT_SESSIONS;
  const bodyweight = !opts.faithful && (opts.bodyweightFactor ?? 0) > 0;
  const byDate = new Map<ISODate, WR[]>();
  for (const s of sets) {
    if (s.exercise === lift && (s.weight > 0 || bodyweight) && s.reps > 0) {
      if (!byDate.has(s.date)) byDate.set(s.date, []);
      byDate.get(s.date)!.push([s.weight, s.reps]);
    }
  }
  const dates = [...byDate.keys()].sort().slice(-limit);
  return dates.map((d) => {
    const day = byDate.get(d)!;
    if (opts.faithful) {
      const topW = Math.max(...day.map(([w]) => w));
      return [topW, day.filter(([w]) => w === topW).map(([, r]) => r)];
    }
    const worked = opts.plannedWeight?.[d] ?? workedLoad(day);
    return [worked, day.filter(([w]) => w >= worked).map(([, r]) => r)];
  });
}

/**
 * Tired-day version of a derived target. Still a plain target, so it is
 * stored, shown and graded like any other promise:
 * - strength: same 5x5 at ~92.5%, floored to the increment;
 * - hypertrophy jump: deferred — repeat the previous top weight at the rep
 *   ceiling (the hold_cleared shape);
 * - anything else: unchanged, there is no load increase to ease.
 */
export function easeTarget(t: LegacyTarget, repRange: [number, number], increment: number): LegacyTarget {
  if (t.is_new) return t;
  if (t.mode === 'strength') {
    const eased = Math.floor((t.weight * TIRED_STRENGTH_PCT) / increment) * increment;
    if (eased <= 0) return t;
    return { ...t, weight: eased, added_weight: false, rationale: t.rationale + TIRED_SUFFIX };
  }
  if (t.added_weight) {
    return { ...t, weight: pyRound((t.weight - increment) * 100) / 100, target_reps: repRange[1],
      added_weight: false, rationale: t.rationale + TIRED_SUFFIX };
  }
  return t;
}

export interface TargetForInput extends Faithful {
  /** Sets strictly before onDate. */
  sets: LegacySetRow[];
  lift: string;
  increment: number;
  goal: string;
  /** The lift's rep range (fixed scheme or phase range). */
  repRange: [number, number];
  startingWeight: number | null;
  onDate: ISODate;
  readiness?: string | null;
  bodyweightFactor?: number;
}

export function targetFor(inp: TargetForInput): LegacyTarget {
  const rr = inp.repRange;
  let t: LegacyTarget;
  if (inp.goal === 'strength' && rr[0] === MAIN_COMPOUND_RANGE[0] && rr[1] === MAIN_COMPOUND_RANGE[1]) {
    const e1rm = bestRecentE1rm(inp.sets, inp.lift, inp.onDate);
    t = strengthTarget(
      attemptHistory(inp.sets, inp.lift, { faithful: inp.faithful, bodyweightFactor: inp.bodyweightFactor }),
      inp.lift, inp.increment, { e1rm, startingWeight: inp.startingWeight, faithful: inp.faithful });
  } else {
    t = progressionTarget(lastSessionOf(inp.sets, inp.lift), rr, inp.increment, inp.lift, inp.startingWeight);
  }
  if (inp.readiness === 'tired') t = easeTarget(t, rr, inp.increment);
  return t;
}
