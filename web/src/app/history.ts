// Pure summaries for the History list.
import type { Session, SetEntry } from '../domain/types';

export interface SessionSummary {
  session: Session;
  setCount: number;
  /** Up to `n` lifts in slot order: heaviest set of each ("Back Squat 100 × 5"). */
  top: { exerciseId: string; name: string; weight: number; reps: number }[];
}

export function summarizeSession(session: Session, sets: SetEntry[], n = 3): SessionSummary {
  const best = new Map<string, { exerciseId: string; name: string; weight: number; reps: number; slot: number }>();
  for (const s of sets) {
    if (s.kind === 'warmup') continue;
    const cur = best.get(s.exerciseId);
    if (!cur || s.weight > cur.weight || (s.weight === cur.weight && s.reps > cur.reps)) {
      best.set(s.exerciseId, { exerciseId: s.exerciseId, name: s.exerciseNameSnapshot, weight: s.weight, reps: s.reps, slot: Math.min(cur?.slot ?? Infinity, s.slotOrder) });
    } else if (s.slotOrder < cur.slot) cur.slot = s.slotOrder;
  }
  const top = [...best.values()].sort((a, b) => a.slot - b.slot).slice(0, n).map(({ slot: _s, ...rest }) => { void _s; return rest; });
  return { session, setCount: sets.length, top };
}

/** Group sets by session id. */
export function groupBySession<T extends { sessionId: string }>(sets: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const s of sets) {
    const l = m.get(s.sessionId);
    if (l) l.push(s); else m.set(s.sessionId, [s]);
  }
  return m;
}

/** Consecutive runs of sets for the same slot+exercise, in order (for the detail view). */
export function groupBlocks(sets: SetEntry[]): { key: string; exerciseId: string; name: string; sets: SetEntry[] }[] {
  const out: { key: string; exerciseId: string; name: string; sets: SetEntry[] }[] = [];
  for (const s of sets) {
    const last = out[out.length - 1];
    if (last && last.exerciseId === s.exerciseId && last.sets[0].slotOrder === s.slotOrder) last.sets.push(s);
    else out.push({ key: `${s.slotOrder}:${s.exerciseId}:${s.id}`, exerciseId: s.exerciseId, name: s.exerciseNameSnapshot, sets: [s] });
  }
  return out;
}
