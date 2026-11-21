// First-run gate: no profile and no sessions → onboarding.
import { useEffect, useState } from 'react';
import { getDb, getProfile, type GymDb } from '../db';
import { go } from '../ui/kit/navigation';

export async function needsOnboarding(db: GymDb): Promise<boolean> {
  if (await getProfile(db)) return false;
  return (await db.sessions.count()) === 0;
}

/**
 * Call at the top of Today. Returns 'checking' until the db answers, then
 * 'ready'; on a first run it replaces the current entry with #/onboarding and returns
 * 'redirecting'. Render nothing (or a blank screen) unless 'ready'.
 */
export function useFirstRunRedirect(): 'checking' | 'ready' | 'redirecting' {
  const [state, setState] = useState<'checking' | 'ready' | 'redirecting'>('checking');
  useEffect(() => {
    let alive = true;
    needsOnboarding(getDb()).then(need => {
      if (!alive) return;
      if (need) {
        setState('redirecting');
        go('onboarding', { replace: true, transition: 'none' });
      } else setState('ready');
    }, () => alive && setState('ready'));
    return () => { alive = false; };
  }, []);
  return state;
}
