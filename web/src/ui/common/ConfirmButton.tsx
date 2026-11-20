import { useEffect, useState, type ReactNode } from 'react';

/**
 * Two-tap button for irreversible actions: the first tap arms it and shows
 * `confirmLabel`; the second runs `onConfirm`. Disarms after 5 s.
 */
export function ConfirmButton({ children, confirmLabel = 'Tap again to confirm', onConfirm, danger, className = '', disabled }: {
  children: ReactNode; confirmLabel?: string; onConfirm: () => void | Promise<void>; danger?: boolean; className?: string; disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button type="button" disabled={disabled || busy}
      className={`btn ${danger ? 'danger' : ''} ${armed ? 'armed' : ''} ${className}`}
      onClick={async () => {
        if (!armed) { setArmed(true); return; }
        setArmed(false); setBusy(true);
        try { await onConfirm(); } finally { setBusy(false); }
      }}>
      {armed ? confirmLabel : children}
    </button>
  );
}
