// Port of gymcli/criteria.py. Success text must mirror scoring.scoreLift
// exactly, so the promise shown before a session is the one graded after.
import { pyG, pyList } from '../pyformat';
import { MIN_SETS_AT_TOP } from './progression';
import type { Faithful, LegacyTarget } from './types';

export type Branch = 'new' | 'strength' | 'strength_seed' | 'added_weight' | 'hold_cleared' | 'chase_reps';

export function branch(t: LegacyTarget): Branch {
  if (t.is_new) return 'new';
  if (t.mode === 'strength') return t.prev_top.length ? 'strength' : 'strength_seed';
  if (t.added_weight) return 'added_weight';
  if (t.prev_top.length && t.prev_top.every((r) => r >= t.target_reps)) return 'hold_cleared';
  return 'chase_reps';
}

export function successCriteria(t: LegacyTarget, opts: Faithful = {}): string {
  const b = branch(t);
  const w = pyG(t.weight);
  if (b === 'new') return `Log your sets at ${w}kg — this session sets the baseline.`;
  if (b === 'strength' || b === 'strength_seed') {
    return `Complete all ${t.target_sets} sets of ${t.target_reps} at ${w}kg — that earns the next jump.`;
  }
  if (b === 'added_weight') {
    return `Hit ${w}kg x ${t.target_reps} on at least one set — reaching the new weight at target reps counts.`;
  }
  if (b === 'hold_cleared') {
    return `Repeat ${w}kg x ${t.target_reps} for ${MIN_SETS_AT_TOP}+ sets — one good set proved you can; two prove it's yours.`;
  }
  const total = t.prev_top.reduce((a, r) => a + r, 0);
  // Python said "Beat N" while matching N graded hit. The text now says what
  // the grade does.
  if (opts.faithful) return `Beat ${total} total reps at ${w}kg (last time: ${pyList(t.prev_top)}).`;
  return `Match or beat ${total} total reps at ${w}kg (last time: ${pyList(t.prev_top)}).`;
}

const PRINCIPLES: Record<Branch, [string, string]> = {
  new: ['baseline', "Establish a baseline before progressing — you can't overload what you haven't measured."],
  added_weight: ['progressive_overload', 'Progressive overload: once the rep target is earned across enough sets, load must rise for further adaptation.'],
  hold_cleared: ['evidence_threshold', `Repeated exposure: ${MIN_SETS_AT_TOP}+ sets at the top weight demonstrate repeatable capacity, not a one-off.`],
  chase_reps: ['double_progression', 'Double progression: build reps to the ceiling at a fixed load, then convert the earned reps into added weight.'],
  strength_seed: ['training_max_seed', 'Training-max buffering: open a strength cycle ~7% below estimated max so early sessions are completable.'],
  strength: ['linear_progression', 'Linear load progression: a completed 5x5 earns a fixed increment; incompletion earns a repeat, not a jump.'],
};

export function why(t: LegacyTarget): { rule: string; principle: string } {
  const [rule, principle] = PRINCIPLES[branch(t)];
  return { rule, principle };
}
