import type { ReactNode } from 'react';

/**
 * A section of a setup screen: mono label (with an optional action on the
 * right) over its content, set off from the one above by a dotted rule. No box.
 */
export function Group({ label, right, children, className = '' }: { label: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`group ${className}`}>
      <div className="group-hd"><h2 className="label">{label}</h2>{right}</div>
      {children}
    </section>
  );
}

/** The small mono action at the right of a group label ("Edit", "Add"). */
export function GroupAction({ children, onClick, label }: { children: ReactNode; onClick: () => void; label?: string }) {
  return <button type="button" className="hd-act" data-press="dim" aria-label={label} onClick={onClick}>{children}</button>;
}
