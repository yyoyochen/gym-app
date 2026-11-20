// Port of gymcli/volume.py and scoring.volume_load_delta_pct.
import { isoWeekKey } from '../dates';
import type { LegacySetRow } from './types';

/**
 * Average sets per muscle per training week (weeks with any mapped set).
 * A set on a multi-muscle lift is split evenly across its muscles.
 */
export function weeklySets(sets: LegacySetRow[], muscleMap: Record<string, string[]>): Record<string, number> {
  const weeks = new Set<string>();
  const totals: Record<string, number> = {};
  for (const s of sets) {
    const muscles = muscleMap[s.exercise];
    if (!muscles || !muscles.length) continue;
    weeks.add(isoWeekKey(s.date));
    const frac = 1.0 / muscles.length;
    for (const m of muscles) totals[m] = (totals[m] ?? 0) + frac;
  }
  const n = Math.max(1, weeks.size);
  const out: Record<string, number> = {};
  for (const [m, v] of Object.entries(totals)) out[m] = v / n;
  return out;
}

/** Weak points under the growth floor (default 6 sets/week). */
export function weakFlags(weekly: Record<string, number>, weakPoints: string[], floor = 6.0): string[] {
  return weakPoints.filter((w) => (weekly[w] ?? 0.0) < floor);
}

export function volumeLoadDeltaPct(thisSession: LegacySetRow[], lastSession: LegacySetRow[]): number | null {
  const a = thisSession.reduce((t, s) => t + s.weight * s.reps, 0);
  const b = lastSession.reduce((t, s) => t + s.weight * s.reps, 0);
  if (b === 0) return null;
  return ((a - b) / b) * 100;
}
