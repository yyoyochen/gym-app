// A tip: an accent-outlined note in the page flow, under the thing it
// explains. Never an overlay, never takes focus, never blocks a tap.
import type { ReactNode } from 'react';

export const tipFooter = (n: number, of: number): string => `${n} of ${of}`;

export function Tip({ text, footer, onDismiss, children }: { text: string; footer?: string; onDismiss: () => void; children?: ReactNode }) {
  return (
    <div className="tip" role="note" aria-label="Tip">
      <span className="tip-k">Tip</span>
      <p className="tip-text">{text}</p>
      {children}
      <div className="tip-foot">
        <span className="tip-n">{footer ?? ''}</span>
        <button type="button" className="tip-ok" data-press="dim" onClick={onDismiss}>Got it</button>
      </div>
    </div>
  );
}
