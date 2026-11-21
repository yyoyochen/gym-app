// "Is this set a new best?" — the trigger for the PR moment (ui/kit PrMoment).
// Pure; the caller passes the lift's earlier sets. Not wired yet: the logger
// (screens/Session.tsx, after addSet) and Review are marked TODO(PrMoment).
import { e1rm } from '../engine/progress';
import type { SetKind } from '../domain/types';

export interface BestSet { weight: number; reps: number; kind: SetKind; failed?: boolean }

export interface NewBest {
  /** 'weight' = heaviest completed set ever; 'e1rm' = best estimated 1RM. Weight wins when both. */
  kind: 'weight' | 'e1rm';
  value: number;
  previous: number;
}

const counts = (s: BestSet) => s.kind !== 'warmup' && !s.failed && s.reps >= 1;

/**
 * Compare one just-logged set against every earlier set of the same lift.
 * Warm-ups, failed sets and 0-rep sets never count. The first time a lift is
 * logged there is nothing to beat, so it is never a PR (no noise on import or
 * a new exercise). e1RM must improve by more than `minE1rmGainKg` so rounding
 * doesn't fire it. Bodyweight lifts: pass loads that already include the
 * bodyweight share if you want e1RM to mean the same as on Progress.
 */
export function isNewBest(set: BestSet, prior: readonly BestSet[], opts: { minE1rmGainKg?: number } = {}): NewBest | null {
  if (!counts(set)) return null;
  const earlier = prior.filter(counts);
  if (!earlier.length) return null;
  const maxW = Math.max(...earlier.map(s => s.weight));
  if (set.weight > maxW) return { kind: 'weight', value: set.weight, previous: maxW };
  const best = Math.max(...earlier.map(s => e1rm(s.weight, s.reps)));
  const mine = e1rm(set.weight, set.reps);
  if (mine > best + (opts.minE1rmGainKg ?? 0.05)) return { kind: 'e1rm', value: round1(mine), previous: round1(best) };
  return null;
}

const round1 = (v: number) => Math.round(v * 10) / 10;
