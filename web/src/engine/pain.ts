// Pain-flag rules (spec §3.3.2). The flag is a fixed list (area, side,
// severity), so the rules act on it directly; the free-text note is never read.
import type { Exercise, ISODate, PainArea, PainFlag, Profile, SetEntry, Side } from '../domain/types';
import { daysBetween } from './dates';

export const PAIN_WINDOW_DAYS = 14;
export const PAIN_REGRESS_PCT = 0.1;

export interface PainEvent {
  date: ISODate;
  sessionId: string;
  exerciseId: string;
  flag: PainFlag;
}

/** One session in which an exercise was trained (pain or not). */
export interface ExerciseSession {
  date: ISODate;
  sessionId: string;
  exerciseId: string;
}

export interface PainStatus {
  exerciseId: string;
  /** Next session keeps last session's load (no increase). */
  hold: boolean;
  /** Ask a pain check before the lift. */
  painCheck: boolean;
  /** Fraction to take off the anchor load (0 or 0.10). */
  regressPct: number;
  /** Effort floor raise in RIR (0 or 1). */
  raiseRir: number;
  /** Plain reasons, one per rule that fired. */
  reasons: string[];
}

export function painEventsFromSets(sets: SetEntry[], dateOfSession: (sessionId: string) => ISODate | undefined): PainEvent[] {
  const out: PainEvent[] = [];
  for (const s of sets) {
    const date = s.pain ? dateOfSession(s.sessionId) : undefined;
    if (s.pain && date) out.push({ date, sessionId: s.sessionId, exerciseId: s.exerciseId, flag: s.pain });
  }
  return out;
}

/**
 * Same body part for the rules. A flag without a specific side (both / n.a.)
 * matches either side; left and right shoulders are different areas.
 */
export function sameArea(a: { area: PainArea; side: Side }, b: { area: PainArea; side: Side }): boolean {
  if (a.area !== b.area) return false;
  if (a.side === 'left' || a.side === 'right') return !(b.side === 'left' || b.side === 'right') || a.side === b.side;
  return true;
}

const sideWord = (side: Side) => (side === 'left' || side === 'right' ? `${side} ` : '');
export const areaLabel = (a: { area: PainArea; side: Side }) => `${sideWord(a.side)}${a.area.replace('_', ' ')}`;

/** Severity 2–3 stops the lift for the day. */
export function stopsLiftToday(setsToday: SetEntry[]): { stop: boolean; flag?: PainFlag } {
  const flag = setsToday.find((s) => s.pain && s.pain.severity >= 2)?.pain;
  return flag ? { stop: true, flag } : { stop: false };
}

/**
 * Two severity ≥ 2 flags on the same area within 14 days. Returns the date of
 * the second flag of the latest such pair for each area, which is when the
 * regression starts.
 */
export function areaTriggers(events: PainEvent[]): { area: PainArea; side: Side; date: ISODate }[] {
  const serious = events.filter((e) => e.flag.severity >= 2).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const out = new Map<string, { area: PainArea; side: Side; date: ISODate }>();
  for (let j = 0; j < serious.length; j++) {
    for (let i = 0; i < j; i++) {
      const a = serious[i].flag;
      const b = serious[j].flag;
      // Two flags in one session are one incident, not a repeat.
      if (serious[i].sessionId === serious[j].sessionId) continue;
      if (sameArea(a, b) && daysBetween(serious[i].date, serious[j].date) <= PAIN_WINDOW_DAYS) {
        const side: Side = a.side === b.side ? a.side : (a.side === 'left' || a.side === 'right') ? a.side : b.side;
        out.set(`${a.area}:${side}`, { area: a.area, side, date: serious[j].date });
      }
    }
  }
  return [...out.values()];
}

export interface PainInput {
  exercise: Exercise;
  events: PainEvent[];
  /** Every session (before today) that trained this exercise. */
  history: ExerciseSession[];
  today: ISODate;
  injuries?: Profile['injuries'];
}

/** What the pain rules mean for the next session of one exercise. */
export function painStatus(inp: PainInput): PainStatus {
  const { exercise, today } = inp;
  const events = inp.events.filter((e) => e.date < today);
  const st: PainStatus = { exerciseId: exercise.id, hold: false, painCheck: false, regressPct: 0, raiseRir: 0, reasons: [] };
  const loads = (a: PainArea) => exercise.areasLoaded.includes(a);

  // Flags on this lift in its most recent session: hold the load next time.
  const past = inp.history.filter((h) => h.date < today).sort((a, b) => (a.date < b.date ? -1 : 1));
  const last = past[past.length - 1];
  if (last) {
    const mine = events.filter((e) => e.sessionId === last.sessionId && e.exerciseId === exercise.id);
    const worst = Math.max(0, ...mine.map((e) => e.flag.severity));
    if (worst >= 1) {
      st.hold = true;
      st.reasons.push(`pain flagged on this lift last session (severity ${worst}) — hold the load`);
    }
    if (worst >= 2) st.painCheck = true;
  }

  // Repeated serious flags on an area regress every lift that loads it, until
  // a session of that lift without a flag on the area clears it.
  for (const trig of areaTriggers(events)) {
    if (!loads(trig.area)) continue;
    const cleared = past.some((h) => h.date > trig.date
      && !events.some((e) => e.sessionId === h.sessionId && sameArea(e.flag, trig)));
    if (cleared) continue;
    st.regressPct = PAIN_REGRESS_PCT;
    st.raiseRir = 1;
    st.reasons.push(`two pain flags (severity 2+) on the ${areaLabel(trig)} within ${PAIN_WINDOW_DAYS} days — regress 10% and +1 RIR until a clean session`);
  }

  // Any recent flag on a loaded area raises the effort floor (§3.3.1).
  const recent = events.filter((e) => loads(e.flag.area) && daysBetween(e.date, today) <= PAIN_WINDOW_DAYS);
  if (recent.length && st.raiseRir === 0) {
    st.raiseRir = 1;
    st.reasons.push(`pain on the ${areaLabel(recent[recent.length - 1].flag)} in the last ${PAIN_WINDOW_DAYS} days — +1 RIR`);
  }

  // Profile injuries work like a standing flag: +1 RIR from the start.
  for (const inj of inp.injuries ?? []) {
    if (!loads(inj.area)) continue;
    if (st.raiseRir === 0) st.raiseRir = 1;
    st.reasons.push(`protecting the ${areaLabel(inj)} (profile) — +1 RIR`);
  }
  return st;
}

/** The effort-floor reasons from a pain status, for effort.effortFloor. */
export function painFloorReasons(st: PainStatus | undefined): string[] {
  return st && st.raiseRir > 0 ? st.reasons.filter((r) => r.includes('RIR')) : [];
}
