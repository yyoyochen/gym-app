// In-session nudges (spec §3.3): at most one quiet line for the next set. The
// nudge never changes the committed promise. Stop rules (safety) always win
// over push rules (effort).
import type { EffortScale, Exercise, Readiness, SetEntry, Slot, Target } from '../domain/types';
import { formatEffort, formatEffortRange, formatFloor } from './effort';
import { grade } from './models';
import { areaLabel } from './pain';
import { pyG } from './pyformat';
import { floorTo } from './port/strength';
import { workingSets } from './progress';

export interface Nudge {
  kind: 'push' | 'stop' | 'info';
  text: string;
  /** Rule id, for tests and the session record. */
  rule: string;
}

export interface NudgeInput {
  target: Target;
  exercise: Exercise;
  /** This slot's sets logged so far today, in order. Warm-ups are ignored. */
  sets: SetEntry[];
  /** Working sets planned for the slot (see plannedSetCount). */
  plannedSets: number;
  readiness?: Readiness;
  effortScale: EffortScale;
  /** Re-entry session: the last set stays at the 3 RIR floor too. */
  reentry?: boolean;
}

/** Top-set slots plan the top set plus the back-offs. */
export function plannedSetCount(target: Target, slot: Slot): number {
  if (target.model === 'topset') return 1 + (target.targetSets ?? 0);
  return target.targetSets ?? slot.params.sets;
}

const LIGHT_RIR = 3;
const TOO_EASY_RIR = 4;

export function nudge(inp: NudgeInput): Nudge | null {
  const { target: t, exercise, effortScale: scale } = inp;
  const work = workingSets(inp.sets);
  const remaining = inp.plannedSets - work.length;
  const prev = work[work.length - 1];
  const inc = exercise.increment;
  const isTopset = t.model === 'topset';
  const tops = isTopset ? work.filter((s) => s.kind === 'top' || (s === work[0] && !work.some((x) => x.kind === 'top'))) : [];
  const backoffs = isTopset ? work.filter((s) => !tops.includes(s)) : work;

  // ---- stop rules
  const pain = work.find((s) => s.pain && s.pain.severity >= 2)?.pain;
  if (pain) {
    return { kind: 'stop', rule: 'pain_stop',
      text: `Pain flagged (${areaLabel(pain)}, severity ${pain.severity}) — ${exercise.name} stops for today. Next session holds the load and starts with a pain check.` };
  }
  const failedSet = exercise.slotType === 'compound' ? work.find((s) => s.failed) : undefined;
  if (failedSet) {
    const drop = isTopset ? t.weight : floorTo(failedSet.weight * 0.9 + 1e-9, inc);
    return { kind: 'stop', rule: 'failure_drop',
      text: `Rep failure at ${pyG(failedSet.weight)}kg — drop the remaining sets to ${pyG(drop)}kg. Don't repeat ${pyG(failedSet.weight)}kg until next session.` };
  }
  const deep = tops.find((s) => s.rir !== undefined && s.rir < t.rirFloor);
  if (deep) {
    // One RIR past the floor costs 5% on the back-offs, two or more 10%.
    const pct = t.rirFloor - (deep.rir as number) >= 2 ? 0.1 : 0.05;
    const drop = floorTo(t.weight * (1 - pct) + 1e-9, inc);
    return { kind: 'stop', rule: 'top_below_floor',
      text: `Top set at ${formatEffort(deep.rir as number, scale)} is past the floor (${formatFloor(t.rirFloor, scale)}) — no more top sets; back-offs drop to ${pyG(drop)}kg.` };
  }
  if (work.some((s) => s.pain && s.pain.severity === 1)) {
    return { kind: 'info', rule: 'pain_niggle', text: 'Niggle logged — carry on as planned; next session holds the load.' };
  }

  // ---- push rules (none of them offer more work on a red or amber day)
  const green = (inp.readiness ?? 'green') === 'green';
  const lastWasTop = isTopset && prev !== undefined && tops.includes(prev);
  if (lastWasTop && green && tops.length === 1 && prev.rir !== undefined && prev.rir >= Math.max(LIGHT_RIR, t.rirFloor + 1)) {
    const word = (t.topReps ?? 1) === 1 ? 'single' : (t.topReps ?? 1) === 2 ? 'double' : 'top set';
    return { kind: 'push', rule: 'extra_top_offer',
      text: `Top set felt light (${formatEffort(prev.rir, scale)}). Optional: one more ${word} at ${pyG(prev.weight + inc)}kg, still stopping at ${formatFloor(t.rirFloor, scale)}.` };
  }
  if (!t.isNew && work.length && remaining > 0) {
    const g = grade(t, work, scale);
    if (g.verdict === 'hit' || g.verdict === 'beat') {
      return { kind: 'info', rule: 'promise_kept', text: 'Promise kept. Extra sets are a bonus, not required.' };
    }
  }
  if (remaining === 1 && prev && prev.rir !== undefined && prev.rir >= LIGHT_RIR && !lastWasTop) {
    // The last set may go one RIR past the working floor (2 → 1, isolation 1 → 0); not on re-entry.
    const lowRir = inp.reentry ? t.rirFloor : Math.max(0, t.rirFloor - 1);
    const reps = t.targetReps;
    const hi = Math.max(reps, prev.reps + prev.rir - lowRir);
    return { kind: 'push', rule: 'last_set_push',
      text: `Last set — take it to ${formatEffortRange(lowRir, lowRir + 1, scale)}: aim for ${reps === hi ? reps : `${reps}–${hi}`} reps.` };
  }
  if (isTopset && backoffs.length && remaining <= 0
    && backoffs.every((s) => s.reps >= t.targetReps && (s.rir ?? 0) >= TOO_EASY_RIR)) {
    return { kind: 'info', rule: 'too_easy_note', text: 'Too easy — next time +1 increment.' };
  }
  if (inp.readiness === 'red' && !work.length) {
    return { kind: 'info', rule: 'readiness_red', text: `Readiness red — effort floor raised to ${formatFloor(t.rirFloor, scale)}; no extra sets today.` };
  }
  return null;
}
