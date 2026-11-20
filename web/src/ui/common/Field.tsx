import type { ReactNode } from 'react';

/** Label + control + optional hint/error, stacked. */
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="stack">
      <span className="label">{label}</span>
      {children}
      {hint && !error && <span className="mid">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

/** Plain list of form errors. */
export function Errors({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return <ul className="errors">{errors.map(e => <li key={e}>{e}</li>)}</ul>;
}
