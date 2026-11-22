// The only set-kind choice a lifter makes: is this set a warm-up? Everything
// else (top set, back-off, working) comes from the plan or the ramp rule.
import type { SetKind } from '../../domain/types';

/** Warm-up on makes the set a warm-up; off restores its original kind (a former warm-up becomes working). */
export function kindAfterWarmupToggle(original: SetKind, on: boolean): SetKind {
  if (on) return 'warmup';
  return original === 'warmup' ? 'working' : original;
}
