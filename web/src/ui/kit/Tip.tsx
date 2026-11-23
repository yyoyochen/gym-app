// A tip: an accent-outlined note in the page flow, under the thing it
// explains. Never an overlay, never takes focus, never blocks a tap.
import type { ReactNode } from 'react';
import { t } from '../../i18n';

export const tipFooter = (n: number, of: number): string => t('{n} of {of}', { n, of });

export function Tip({ text, footer, onDismiss, children }: { text: string; footer?: string; onDismiss: () => void; children?: ReactNode }) {
  return (
    <div className="tip" role="note" aria-label={t('Tip')}>
      <span className="tip-k">{t('Tip')}</span>
      <p className="tip-text">{text}</p>
      {children}
      <div className="tip-foot">
        <span className="tip-n">{footer ?? ''}</span>
        <button type="button" className="tip-ok" data-press="dim" onClick={onDismiss}>{t('Got it')}</button>
      </div>
    </div>
  );
}
