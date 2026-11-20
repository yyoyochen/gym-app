// Port of gymcli/strength.py — linear 5x5, plus the load-band deload fix
// (spec §5.4 bug 2).
import { pyFixed, pyG, pyList } from '../pyformat';
import type { Attempt, Faithful, LegacyTarget } from './types';

// Training max = 93% of e1RM: start cycles below true max so early weeks are
// completable and progress comes from adding, not grinding.
export const TM_BUFFER = 0.93;
// Epley inversion: the load a lifter can move for 5 reps given a 1RM.
export const FIVE_RM_FACTOR = 1 + 5 / 30.0;
export const DELOAD_PCT = 0.9;
export const FAILS_BEFORE_DELOAD = 3;
export const TARGET_REPS = 5;
export const TARGET_SETS = 5;

export function floorTo(x: number, increment: number): number {
  return Math.trunc(x / increment) * increment;
}

/** First 5x5 working weight from a known e1RM. */
export function seedWeight(e1rm: number, increment: number): number {
  return floorTo((e1rm * TM_BUFFER) / FIVE_RM_FACTOR, increment);
}

/** Does a session's top-weight rep list look like a 5x5 attempt? >=4 sets, all <=6 reps. */
export function isAttempt(reps: number[]): boolean {
  return reps.length >= 4 && reps.every((r) => r <= 6);
}

export function isComplete(reps: number[]): boolean {
  return reps.length >= TARGET_SETS && reps.filter((r) => r >= TARGET_REPS).length >= TARGET_SETS;
}

function mk(lift: string, weight: number, added: boolean, prev: number[], rationale: string, isNew = false): LegacyTarget {
  return { lift, weight, target_reps: TARGET_REPS, added_weight: added, prev_top: prev, is_new: isNew,
    rationale, target_sets: TARGET_SETS, mode: 'strength' };
}

export interface StrengthOptions extends Faithful {
  e1rm?: number | null;
  startingWeight?: number | null;
}

/**
 * Next 5x5 prescription from chronological attempts [(top weight, reps)].
 * Sessions that don't look like 5x5 attempts are ignored.
 */
export function strengthTarget(attempts: Attempt[], lift: string, increment: number, opts: StrengthOptions = {}): LegacyTarget {
  const real = attempts.filter(([, r]) => isAttempt(r));
  const e1rm = opts.e1rm ?? null;
  if (!real.length) {
    if (e1rm !== null) {
      const w = seedWeight(e1rm, increment);
      return mk(lift, w, false, [],
        `seed from recent best (e1RM ${pyFixed(e1rm, 1)}kg x ${pyFixed(TM_BUFFER * 100, 0)}% training max) — start 5x5 at ${pyG(w)}kg`);
    }
    return { lift, weight: opts.startingWeight ?? 0.0, target_reps: TARGET_REPS, added_weight: false, prev_top: [],
      is_new: true, rationale: 'new lift — no history to seed from, start light', target_sets: TARGET_SETS, mode: 'strength' };
  }
  const [lastW, lastReps] = real[real.length - 1];
  if (isComplete(lastReps)) {
    const newW = floorTo(lastW + increment + 1e-9, increment);
    return mk(lift, newW, true, lastReps, `completed 5x5 at ${pyG(lastW)}kg — add ${pyG(increment)}kg (progressive overload)`);
  }
  // Python only counted failures at exactly the last weight, so a lifter who
  // drifted 2.5 kg either side was never deloaded. A failure within one
  // increment of the last attempt is the same load for this purpose.
  const sameLoad = opts.faithful
    ? (w: number) => w === lastW
    : (w: number) => Math.abs(w - lastW) <= increment + 1e-9;
  let fails = 0;
  for (let i = real.length - 1; i >= 0; i--) {
    const [w, reps] = real[i];
    if (sameLoad(w) && !isComplete(reps)) fails += 1;
    else break;
  }
  if (fails >= FAILS_BEFORE_DELOAD) {
    const newW = floorTo(lastW * DELOAD_PCT, increment);
    return mk(lift, newW, false, lastReps,
      `${fails} straight incomplete sessions at ${pyG(lastW)}kg — deload to ${pyG(newW)}kg (planned fatigue management)`);
  }
  return mk(lift, lastW, false, lastReps,
    `incomplete last time (${pyList(lastReps)}) — repeat ${pyG(lastW)}kg and finish all 5x5 (repeated exposure before load increase)`);
}
