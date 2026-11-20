import { useEffect, useState } from 'react';

/** Re-renders every `ms` with the current time. Display only: no alerts, no sounds. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Hash routes keep the scroll position; screens start at the top. */
export function useScrollTop(key: unknown): void {
  useEffect(() => { window.scrollTo(0, 0); }, [key]);
}
