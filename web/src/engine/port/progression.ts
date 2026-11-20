// Port of gymcli/progression.py — double progression for hypertrophy work.
import { pyG, pyList, pyRound } from '../pyformat';
import type { LegacyTarget, WR } from './types';

// A single clean top set proves you can do it once, not that you can repeat
// it under fatigue. Require this many sets at the top weight, all hitting the
// ceiling, before treating it as earned evidence to add more weight.
export const MIN_SETS_AT_TOP = 2;

export function progressionTarget(
  history: WR[], repRange: [number, number], increment: number, lift: string,
  startingWeight: number | null = null,
): LegacyTarget {
  const [repMin, repMax] = repRange;
  const base = { lift, target_sets: null, mode: 'hypertrophy' as const };
  if (!history.length) {
    return { ...base, weight: startingWeight ?? 0.0, target_reps: repMin, added_weight: false,
      prev_top: [], is_new: true, rationale: 'new lift — start here and build' };
  }
  const topW = Math.max(...history.map(([w]) => w));
  const topReps = history.filter(([w]) => w === topW).map(([, r]) => r);
  const clearedCeiling = topReps.every((r) => r >= repMax);
  if (clearedCeiling && topReps.length >= MIN_SETS_AT_TOP) {
    const newW = pyRound((topW + increment) * 100) / 100;
    return { ...base, weight: newW, target_reps: repMin, added_weight: true, prev_top: topReps, is_new: false,
      rationale: `topped ${repMax}s across ${topReps.length} sets at ${pyG(topW)}kg — add ${pyG(increment)}kg, reset to ${repMin}` };
  }
  if (clearedCeiling) {
    return { ...base, weight: topW, target_reps: repMax, added_weight: false, prev_top: topReps, is_new: false,
      rationale: `hit ${repMax} at ${pyG(topW)}kg but only ${topReps.length} set(s) — repeat ${pyG(topW)}kg for more sets before adding weight` };
  }
  return { ...base, weight: topW, target_reps: repMax, added_weight: false, prev_top: topReps, is_new: false,
    rationale: `stay at ${pyG(topW)}kg — add a rep toward ${repMax} on every set (last: ${pyList(topReps)})` };
}
