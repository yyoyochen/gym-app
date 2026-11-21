// PR moment wiring (pure; tested): turns app/bests.ts isNewBest() into the
// data the kit's showPrMoment() shows, for the logger (one just-logged set)
// and for Review (the best new best per lift in a finished session).
import type { ISODate, SetEntry } from '../../domain/types';
import type { PrMomentData } from '../kit/PrMoment';
import { isNewBest, type BestSet, type NewBest } from '../../app/bests';
import { e1rm } from '../../engine/progress';
import { kg } from '../../app/coach';
import { formatDate } from '../../app/dates';

/** An earlier set of the same lift, with the date it was logged on. */
export interface PriorSet extends BestSet { id?: string; date: ISODate }

const counts = (s: BestSet) => s.kind !== 'warmup' && !s.failed && s.reps >= 1;
const one = (v: number) => (Math.round(v * 10) / 10).toFixed(1);

/** The earlier set the new best is measured against (heaviest, or best e1RM). */
function previousSet(best: NewBest, prior: readonly PriorSet[]): PriorSet | undefined {
  const ok = prior.filter(counts);
  const score = (s: PriorSet) => (best.kind === 'weight' ? s.weight : e1rm(s.weight, s.reps));
  return ok.reduce<PriorSet | undefined>((a, s) => (!a || score(s) > score(a) || (score(s) === score(a) && s.date > a.date) ? s : a), undefined);
}

/** Moment data for a set that is a new best, else null. `prior` must not include the set itself. */
export function prMomentFor(set: BestSet, prior: readonly PriorSet[], lift: string): PrMomentData | null {
  const best = isNewBest(set, prior);
  if (!best) return null;
  const prev = previousSet(best, prior);
  const bestE1 = Math.max(...prior.filter(counts).map(s => e1rm(s.weight, s.reps)));
  const mine = e1rm(set.weight, set.reps);
  const pairs = [
    ...(prev ? [{ label: 'Previous best', value: `${kg(prev.weight)} × ${prev.reps}, ${formatDate(prev.date, { weekday: false, year: false })}` }] : []),
    { label: 'e1RM', value: `${one(bestE1)} → ${one(Math.max(mine, bestE1))}` },
  ];
  return {
    value: kg(set.weight),
    unit: `kg × ${set.reps}`,
    caption: best.kind === 'weight' ? 'heaviest set yet' : 'best e1RM yet',
    lift,
    pairs,
  };
}

/** Flatten getExerciseHistory() days into dated prior sets, leaving out `excludeId`. */
export function priorFromHistory(days: { session: { date: ISODate }; sets: SetEntry[] }[], excludeId?: string): PriorSet[] {
  return days.flatMap(d => d.sets.filter(s => s.id !== excludeId).map(s => ({ id: s.id, date: d.session.date, weight: s.weight, reps: s.reps, kind: s.kind, failed: s.failed })));
}

export interface SessionPr { exerciseId: string; lift: string; set: SetEntry; moment: PrMomentData }

/**
 * New bests set in one session: per lift, sets are replayed in the order they
 * were logged against everything before them, and the last one that fired
 * (the biggest) is kept. `priorOf` returns the lift's sets from other sessions.
 */
export function sessionPrs(sets: readonly SetEntry[], sessionDate: ISODate, priorOf: (exerciseId: string) => readonly PriorSet[]): SessionPr[] {
  const byLift = new Map<string, SetEntry[]>();
  for (const s of [...sets].sort((a, b) => a.loggedAt - b.loggedAt)) {
    const l = byLift.get(s.exerciseId);
    if (l) l.push(s); else byLift.set(s.exerciseId, [s]);
  }
  const out: SessionPr[] = [];
  for (const [exerciseId, list] of byLift) {
    const prior: PriorSet[] = [...priorOf(exerciseId)];
    let last: SessionPr | null = null;
    for (const s of list) {
      const m = prMomentFor(s, prior, s.exerciseNameSnapshot);
      if (m) last = { exerciseId, lift: s.exerciseNameSnapshot, set: s, moment: m };
      prior.push({ id: s.id, date: sessionDate, weight: s.weight, reps: s.reps, kind: s.kind, failed: s.failed });
    }
    if (last) out.push(last);
  }
  return out;
}
