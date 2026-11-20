import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import { getDb, type GymDb } from '../db';

/** Re-runs `query` whenever the tables it read change (Dexie liveQuery).
 *  Returns undefined until the first result arrives. */
export function useLive<T>(query: (db: GymDb) => Promise<T>, deps: unknown[] = []): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  useEffect(() => {
    const db = getDb();
    const sub = liveQuery(() => query(db)).subscribe({ next: setValue, error: (e) => console.error(e) });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
