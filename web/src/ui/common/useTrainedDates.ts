import type { ISODate } from '../../domain/types';
import { listSessions } from '../../db';
import { useLive } from '../useLive';

/** Dates that have a session, for the calendar's "trained" tick. Empty until loaded. */
export function useTrainedDates(): ReadonlySet<ISODate> {
  const dates = useLive(async db => new Set((await listSessions(db)).map(s => s.date)), []);
  return dates ?? new Set<ISODate>();
}
