// Small builders for engine tests. Synthetic data only.
import type { Exercise, ModelKind, SetEntry, Slot, SlotParams, Target } from '../../domain/types';
import type { LiftSession } from '../models';

export function exercise(over: Partial<Exercise> = {}): Exercise {
  return {
    id: 'bench', name: 'Bench Press', aliases: [], muscles: ['chest'], areasLoaded: ['shoulder', 'elbow', 'wrist'],
    slotType: 'compound', increment: 2.5, bodyweightFactor: 0, benchmarkKey: 'bench', ...over,
  };
}

export function slot(model: ModelKind, params: Partial<SlotParams> = {}, exerciseId = 'bench'): Slot {
  return { id: `slot-${exerciseId}`, exerciseId, model, params: { sets: 3, repMin: 6, repMax: 8, rirFloor: 2, ...params } };
}

let n = 0;
export function set(weight: number, reps: number, over: Partial<SetEntry> = {}): SetEntry {
  n += 1;
  return {
    id: `set-${n}`, sessionId: 's', exerciseId: 'bench', exerciseNameSnapshot: 'Bench Press', slotOrder: 1, setOrder: n,
    kind: 'working', weight, reps, loggedAt: n * 1000, ...over,
  };
}

export function session(date: string, sets: SetEntry[], target?: Target): LiftSession {
  const sessionId = `sess-${date}`;
  return { date, sessionId, sets: sets.map((s) => ({ ...s, sessionId })), ...(target ? { target } : {}) };
}

/** Deterministic PRNG (mulberry32) for property tests. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)],
  };
}
