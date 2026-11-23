// Shown on every tab while meta.demoMode is true: a slim inverted bar.
import { getDb, getMeta } from '../db';
import { useLive } from '../ui/useLive';
import { ConfirmButton } from '../ui/common';
import { go } from '../ui/router';
import { exitDemo } from './demo';
import { t } from '../i18n';

export function useDemoMode(): boolean {
  return useLive(db => getMeta(db, 'demoMode'), []) === true;
}

export function DemoBanner() {
  const demo = useDemoMode();
  if (!demo) return null;
  return (
    <div className="demo-bar" role="status">
      <span>{t('Demo data — start my log wipes it')}</span>
      <ConfirmButton danger className="demo-bar-btn" confirmLabel={t('Wipe the demo data and start your own log?')}
        message={t('Every demo session, set and setting is deleted.')} confirmText={t('Wipe demo and start')} onConfirm={async () => {
          await exitDemo(getDb());
          go('onboarding', { replace: true });
        }}>{t('Start my log')}</ConfirmButton>
    </div>
  );
}
