import type { ISODate } from '../../domain/types';
import { listSessions } from '../../db';
import { useLive } from '../useLive';
import { calendarLevels, type DayLevel } from './calendarModel';

const EMPTY: ReadonlyMap<ISODate, DayLevel> = new Map();

/** Every day with a session and how much you trained that day (working sets), for the calendar's day markers. Empty until loaded. */
export function useTrainedDays(): ReadonlyMap<ISODate, DayLevel> {
  const levels = useLive(async db => {
    const [sessions, sets] = await Promise.all([listSessions(db), db.sets.toArray()]);
    const dateOf = new Map(sessions.map(s => [s.id, s.date]));
    const counts = new Map<ISODate, number>(sessions.map(s => [s.date, 0]));
    for (const s of sets) {
      const d = dateOf.get(s.sessionId);
      if (d && s.kind !== 'warmup') counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    return calendarLevels(counts);
  }, []);
  return levels ?? EMPTY;
}
