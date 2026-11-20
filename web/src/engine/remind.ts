// Remind (spec §3.5): what the first screen shows after a gap, and how a
// return after a layoff is anchored. Loads come from the latest logged session
// of each lift, never from goals or old maxes.
import type { ISODate, Millis, SetEntry } from '../domain/types';
import { daysBetween } from './dates';
import type { LiftSession } from './models';
import { pyG } from './pyformat';
import { workedLoad } from './port/service';
import { workingSets } from './progress';

export type GapKind = 'first_run' | 'in_progress' | 'under_24h' | 'short' | 'reentry_note' | 'reentry_block';

export interface LastActivity {
  date: ISODate;
  startedAt: Millis;
  endedAt?: Millis;
  sealed: boolean;
  /** Time of the last logged set, if any. */
  lastSetAt?: Millis;
}

export interface Gap {
  kind: GapKind;
  /** Calendar days from the last session's date to today. */
  days: number | null;
}

export const NOTE_DAYS = 8;
export const BLOCK_DAYS = 21;
const DAY_MS = 86_400_000;

/**
 * The §3.5 table. An open session wins at any gap; under 24 h is measured on
 * the clock, the rest in calendar days (a session late last night is
 * "yesterday" either way).
 */
export function classifyGap(last: LastActivity | undefined, now: Millis, today: ISODate): Gap {
  if (!last) return { kind: 'first_run', days: null };
  const days = daysBetween(last.date, today);
  if (!last.sealed && last.endedAt === undefined) return { kind: 'in_progress', days };
  const lastAt = Math.max(last.endedAt ?? 0, last.lastSetAt ?? 0, last.startedAt);
  if (now - lastAt < DAY_MS) return { kind: 'under_24h', days };
  if (days < NOTE_DAYS) return { kind: 'short', days };
  if (days < BLOCK_DAYS) return { kind: 'reentry_note', days };
  return { kind: 'reentry_block', days };
}

export interface ReentryState {
  /** What prescribe() should do today (PrescribeContext.reentry). */
  reentry: 'none' | 'note' | 'block';
  /** A later session in the return period: jumps capped at 5% too. */
  afterLayoff: boolean;
  /** Length of the layoff that started the return, in days. */
  gapDays: number | null;
}

/** Re-entry block length (two sessions of 3 × 8), then this many capped sessions. */
export const BLOCK_SESSIONS = 2;
export const CAPPED_SESSIONS_AFTER = 2;

/**
 * Where today sits in a return from a layoff, from the dates of past sessions
 * (any lift). The latest gap of 8+ days decides: 8–20 days means one
 * re-entry session, 21+ means two; the next two sessions after that keep the
 * 5% jump cap.
 */
export function reentryState(sessionDates: ISODate[], today: ISODate): ReentryState {
  const dates = [...new Set(sessionDates.filter((d) => d < today))].sort();
  const all = [...dates, today];
  for (let i = all.length - 1; i >= 1; i--) {
    const gap = daysBetween(all[i - 1], all[i]);
    if (gap < NOTE_DAYS) continue;
    const since = all.length - 1 - i; // sessions already done since the return
    const reentrySessions = gap >= BLOCK_DAYS ? BLOCK_SESSIONS : 1;
    if (since < reentrySessions) return { reentry: gap >= BLOCK_DAYS ? 'block' : 'note', afterLayoff: false, gapDays: gap };
    if (since < reentrySessions + CAPPED_SESSIONS_AFTER) return { reentry: 'none', afterLayoff: true, gapDays: gap };
    break;
  }
  return { reentry: 'none', afterLayoff: false, gapDays: null };
}

export interface Anchor {
  exerciseId: string;
  date: ISODate;
  /** The load the latest session was worked at. */
  weight: number;
  sets: { weight: number; reps: number }[];
}

/** Latest logged session per lift — the anchor for re-entry loads. */
export function reentryAnchors(byExercise: Record<string, LiftSession[]>, today: ISODate): Anchor[] {
  const out: Anchor[] = [];
  for (const [exerciseId, sessions] of Object.entries(byExercise)) {
    const past = sessions.filter((s) => s.date < today && workingSets(s.sets).length)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    const last = past[past.length - 1];
    if (!last) continue;
    const sets = workingSets(last.sets).map((s) => ({ weight: s.weight, reps: s.reps }));
    out.push({ exerciseId, date: last.date, weight: workedLoad(sets.map((s) => [s.weight, s.reps])), sets });
  }
  return out;
}

/** The note shown with a re-entry session. */
export function reentryNote(state: ReentryState): string {
  if (state.reentry === 'note') {
    return `${state.gapDays} days since your last session. Today is anchored on the last logged session for each lift, not on goals or old maxes; every compound set stops at 3 RIR. Normal progression resumes next time.`;
  }
  if (state.reentry === 'block') {
    return `${state.gapDays} days since your last session. Re-entry block: two sessions of 3 × 8 at roughly your last logged working weights, then normal progression.`;
  }
  return '';
}

// ---------------------------------------------------------------- cards

/** "3:40", or "1:02:05" past an hour. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export interface ResumeCard {
  exerciseName: string;
  /** The set about to be done (1-based, working sets of the current slot). */
  setNumber: number;
  lastSet: { weight: number; reps: number; rir?: number };
  restedMs: number;
  restedLabel: string;
}

/** Resume card for an open session: where the last logged set left off. */
export function resumeCard(sessionSets: SetEntry[], now: Millis): ResumeCard | null {
  if (!sessionSets.length) return null;
  const last = sessionSets.reduce((a, s) => (s.loggedAt > a.loggedAt ? s : a), sessionSets[0]);
  const slotSets = workingSets(sessionSets.filter((s) => s.slotOrder === last.slotOrder));
  const restedMs = Math.max(0, now - last.loggedAt);
  return {
    exerciseName: last.exerciseNameSnapshot,
    setNumber: slotSets.length + 1,
    lastSet: { weight: last.weight, reps: last.reps, ...(last.rir !== undefined ? { rir: last.rir } : {}) },
    restedMs,
    restedLabel: `rested ${formatElapsed(restedMs)}`,
  };
}

/** "Last session: B, 3 days ago, 4/5 kept" */
export function lastSessionLine(name: string, date: ISODate, today: ISODate, kept: number, total: number): string {
  const d = daysBetween(date, today);
  const ago = d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
  return `Last session: ${name}, ${ago}, ${kept}/${total} kept`;
}

/** "last time: 80 × 8, 8, 7" — runs at the same weight share one number. */
export function lastTimeLine(sets: SetEntry[]): string {
  const work = workingSets(sets);
  if (!work.length) return '';
  const parts: string[] = [];
  let i = 0;
  while (i < work.length) {
    const w = work[i].weight;
    const reps: number[] = [];
    while (i < work.length && work[i].weight === w) reps.push(work[i++].reps);
    parts.push(`${pyG(w)} × ${reps.join(', ')}`);
  }
  return `last time: ${parts.join(' · ')}`;
}
