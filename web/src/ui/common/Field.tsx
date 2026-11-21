import type { ReactNode } from 'react';

/** Quiet mono label over an underlined control, with an optional hint or error. */
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="field-wrap">
      <span className="label">{label}</span>
      {children}
      {hint && !error && <span className="quiet">{hint}</span>}
      {error && <span className="field-error" role="alert">{error}</span>}
    </label>
  );
}

/** Form errors: ink between dashed rules (no red; docs/DESIGN.md §2). */
export function Errors({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return <ul className="errors" role="alert">{errors.map(e => <li key={e}>{e}</li>)}</ul>;
}
