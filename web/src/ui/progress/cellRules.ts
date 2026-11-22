// The lift History's set cells, pure. The log has no reliable warm-up flag
// (imported sets are all "working"), so the ramp is inferred for display only:
// a set before the day's heaviest set and lighter than 80% of it. Nothing is
// written back.
import { kg } from '../../app/coach';

export type CellRole = 'top' | 'work' | 'ramp';

/** Same length and order as `sets`. The top is the first set at the heaviest weight. */
export function classifySets(sets: { weight: number; kind: string }[]): CellRole[] {
  const counted = sets.filter(s => s.kind !== 'warmup');
  if (!counted.length) return sets.map(() => 'ramp');
  const top = Math.max(...counted.map(s => s.weight));
  const ti = sets.findIndex(s => s.kind !== 'warmup' && s.weight === top);
  return sets.map((s, i) => (s.kind === 'warmup' ? 'ramp' : i === ti ? 'top' : i < ti && s.weight < 0.8 * top ? 'ramp' : 'work'));
}

/** Weight split for the slots: "82" + ".5"; bodyweight lifts read "BW" or "+10". */
export function cellWeight(weight: number, bodyweightFactor: number): { int: string; dec: string } {
  if (bodyweightFactor > 0 && weight === 0) return { int: 'BW', dec: '' };
  const [i, d] = kg(weight).split('.');
  return { int: `${bodyweightFactor > 0 && weight > 0 ? '+' : ''}${i}`, dec: d ? `.${d}` : '' };
}

export function anyDecimals(sets: { weight: number }[]): boolean {
  return sets.some(s => !Number.isInteger(Math.round(s.weight * 100) / 100));
}
