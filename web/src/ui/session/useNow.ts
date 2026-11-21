import { useEffect, useRef, useState } from 'react';
import { scrollPageTo } from '../kit/PageStack';

/** Re-renders every `ms` with the current time. Display only: no alerts, no sounds. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** A screen starts at the top when its key changes (pages are their own scrollers; PageStack restores scroll on pop). */
export function useScrollTop(key: unknown): void {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; } // a fresh page is already at 0; on pop PageStack restores it
    scrollPageTo(0);
  }, [key]);
}
