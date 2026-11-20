// Port of gymcli/scoring.py — grade one lift against its target.
import { pyG } from '../pyformat';
import { branch } from './criteria';
import { MIN_SETS_AT_TOP } from './progression';
import { volumeLoadDeltaPct, weakFlags, weeklySets } from './volume';
import type { Faithful, LegacyLiftResult, LegacySetRow, LegacyTarget, Scorecard, WR } from './types';

export function scoreLift(actual: WR[], t: LegacyTarget, opts: Faithful = {}): LegacyLiftResult {
  const res = (status: LegacyLiftResult['status'], detail: string): LegacyLiftResult => ({ lift: t.lift, status, detail });
  const W = pyG(t.weight);
  if (t.is_new) return actual.length ? res('new', 'logged') : res('missed', 'not done');
  if (t.mode === 'strength' && t.target_sets) {
    // Must agree with strength.isComplete: >= target_sets sets with reps >= target_reps.
    const qual = actual.filter(([w, r]) => w >= t.weight && r >= t.target_reps);
    const n = qual.length;
    if (n < t.target_sets) {
      if (!actual.some(([w]) => w >= t.weight)) {
        return res('missed', `0/${t.target_sets} sets of ${t.target_reps} — no set at ${W}kg`);
      }
      return res('missed', `${n}/${t.target_sets} sets of ${t.target_reps} at ${W}kg`);
    }
    const heavier = qual.map(([w]) => w).filter((w) => w > t.weight);
    if (heavier.length) {
      return res('beat', `${n} sets of ${t.target_reps}+ up to ${pyG(Math.max(...heavier))}kg (target ${W}kg)`);
    }
    if (n > t.target_sets) return res('beat', `${n} sets of ${t.target_reps} at ${W}kg (target ${t.target_sets})`);
    return res('hit', `${t.target_sets}x${t.target_reps} at ${W}kg complete`);
  }
  if (t.added_weight) {
    const at = actual.filter(([w]) => w >= t.weight).map(([, r]) => r);
    if (!at.length) return res('missed', `stayed below ${W}kg`);
    const top = Math.max(...at);
    if (top > t.target_reps) return res('beat', `${W}kg x ${top} (target ${t.target_reps})`);
    if (top === t.target_reps) return res('hit', `hit ${W}kg x ${t.target_reps}`);
    return res('missed', `${W}kg x ${top}, needed ${t.target_reps}`);
  }
  if (!opts.faithful && branch(t) === 'hold_cleared') {
    // The criterion says "Repeat W x R for 2+ sets". Python graded this by
    // total reps against last time (often a single set), so one set graded
    // hit while the promise asked for two.
    if (!actual.some(([w]) => w >= t.weight)) return res('missed', 'no working set at target weight');
    const qual = actual.filter(([w, r]) => w >= t.weight && r >= t.target_reps);
    const n = qual.length;
    if (n < MIN_SETS_AT_TOP) return res('missed', `${n}/${MIN_SETS_AT_TOP} sets of ${t.target_reps} at ${W}kg`);
    if (qual.reduce((a, [, r]) => a + r, 0) > MIN_SETS_AT_TOP * t.target_reps) {
      return res('beat', `${n} sets of ${t.target_reps}+ at ${W}kg (target ${MIN_SETS_AT_TOP})`);
    }
    return res('hit', `repeated ${W}kg x ${t.target_reps} for ${MIN_SETS_AT_TOP} sets`);
  }
  const atW = actual.filter(([w]) => w === t.weight).map(([, r]) => r);
  const now = atW.reduce((a, r) => a + r, 0);
  const prev = t.prev_top.reduce((a, r) => a + r, 0);
  if (!atW.length) return res('missed', 'no working set at target weight');
  if (now > prev) return res('beat', `${now} reps vs ${prev} last time`);
  if (now === prev) return res('hit', `matched ${prev} reps`);
  return res('missed', `${now} reps vs ${prev} last time`);
}

export function buildScorecard(
  actualSets: LegacySetRow[], targets: LegacyTarget[], lastSessionSets: LegacySetRow[], allSets: LegacySetRow[],
  muscleMap: Record<string, string[]>, weakPoints: string[], weekSessionCount: number, opts: Faithful = {},
): Scorecard {
  const byLift = new Map<string, WR[]>();
  for (const s of actualSets) {
    if (!byLift.has(s.exercise)) byLift.set(s.exercise, []);
    byLift.get(s.exercise)!.push([s.weight, s.reps]);
  }
  const lifts = targets.map((t) => scoreLift(byLift.get(t.lift) ?? [], t, opts));
  const weekly = weeklySets(allSets, muscleMap);
  return {
    wins: lifts.filter((r) => r.status === 'beat' || r.status === 'hit').length,
    total: lifts.length,
    lifts,
    volume_load_delta_pct: volumeLoadDeltaPct(actualSets, lastSessionSets),
    weekly_muscle: weekly,
    weak_flags: weakFlags(weekly, weakPoints),
    streak: weekSessionCount,
  };
}
