// Port of gymcli/analysis.py, plus the bodyweight fix (spec §5.4 bug 3).
import type { ISODate } from '../../domain/types';
import { addDays, daysBetween } from '../dates';
import type { LegacySetRow, PR, SessionPoint, WR } from './types';

/** Estimated 1RM. A true single is its own 1RM. */
export function epley(weight: number, reps: number): number {
  if (reps <= 1) return weight;
  return weight * (1 + reps / 30.0);
}

export interface SeriesOptions {
  /** Fraction of bodyweight moved (dips/pull-ups ~0.95). 0 = external load only. */
  bodyweightFactor?: number;
  /** Needed for bodyweight lifts: e1RM is computed on bodyweight × factor + added. */
  bodyweightKg?: number;
  /** e1RM formula; defaults to Epley so ported numbers stay identical. */
  e1rm?: (weight: number, reps: number) => number;
}

/**
 * One SessionPoint per date the lift was trained, chronological.
 *
 * Python dropped every set at 0 kg, which froze bodyweight lifts. With a
 * bodyweight factor the effective load is bodyweight × factor + added, and a
 * 0 kg set is real work. Without a known bodyweight there is no honest e1RM
 * for such a lift, so it yields no points rather than a misleading one.
 */
export function sessionSeries(sets: LegacySetRow[], lift: string, opts: SeriesOptions = {}): SessionPoint[] {
  const factor = opts.bodyweightFactor ?? 0;
  const est = opts.e1rm ?? epley;
  if (factor > 0 && opts.bodyweightKg === undefined) return [];
  const base = factor > 0 ? (opts.bodyweightKg as number) * factor : 0;
  const byDate = new Map<ISODate, WR[]>();
  for (const s of sets) {
    const valid = factor > 0 ? base + s.weight > 0 : s.weight > 0;
    if (s.exercise === lift && valid && s.reps > 0) {
      if (!byDate.has(s.date)) byDate.set(s.date, []);
      byDate.get(s.date)!.push([s.weight, s.reps]);
    }
  }
  const out: SessionPoint[] = [];
  for (const d of [...byDate.keys()].sort()) {
    const day = byDate.get(d)!;
    let top = -Infinity;
    for (const [w] of day) if (w > top) top = w;
    let best = day[0];
    let bestE = est(base + best[0], best[1]);
    for (const x of day.slice(1)) {
      const e = est(base + x[0], x[1]);
      if (e > bestE) { best = x; bestE = e; }
    }
    out.push({ date: d, top_weight: top, best_set: [best[0], best[1]], e1rm: bestE });
  }
  return out;
}

/** Best e1RM within the trailing window; null if nothing qualifies. */
export function bestRecentE1rm(
  sets: LegacySetRow[], lift: string, today: ISODate, windowDays = 60, opts: SeriesOptions = {},
): number | null {
  const series = sessionSeries(sets, lift, opts);
  if (!series.length) return null;
  const cutoff = addDays(today, -windowDays);
  const recent = series.filter((p) => p.date >= cutoff);
  if (!recent.length) return null;
  return Math.max(...recent.map((p) => p.e1rm));
}

/** Sessions that set a new all-time max (top weight or e1RM). */
export function prs(series: SessionPoint[]): PR[] {
  const out: PR[] = [];
  let bestW = -Infinity;
  let bestE = -Infinity;
  for (const p of series) {
    if (p.top_weight > bestW) {
      bestW = p.top_weight;
      out.push({ date: p.date, kind: 'top_weight', value: p.top_weight });
    } else if (p.e1rm > bestE) {
      out.push({ date: p.date, kind: 'e1rm', value: p.e1rm });
    }
    bestE = Math.max(bestE, p.e1rm);
  }
  return out;
}

export function daysStale(series: SessionPoint[], today: ISODate): number | null {
  if (!series.length) return null;
  return daysBetween(series[series.length - 1].date, today);
}
