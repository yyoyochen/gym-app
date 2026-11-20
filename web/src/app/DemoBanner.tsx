// Shown on every tab while meta.demoMode is true (mount once in App, above the routes).
import { getDb, getMeta } from '../db';
import { useLive } from '../ui/useLive';
import { ConfirmButton } from '../ui/common';
import { go } from '../ui/router';
import { exitDemo } from './demo';

export function useDemoMode(): boolean {
  return useLive(db => getMeta(db, 'demoMode'), []) === true;
}

export function DemoBanner() {
  const demo = useDemoMode();
  if (!demo) return null;
  return (
    <div className="banner demo-banner spread" role="status">
      <span>Demo data — Start my log wipes it</span>
      <ConfirmButton className="primary" confirmLabel="Wipe demo" onConfirm={async () => { await exitDemo(getDb()); go('onboarding'); }}>
        Start my log
      </ConfirmButton>
    </div>
  );
}
