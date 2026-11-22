// Small shared pieces for the tracking screens (Progress, LiftDetail, History,
// SessionDetail): the spec-sheet section header.
import type { ReactNode } from 'react';

/** Spec-sheet section header: mono caps title left, meta right, ink rule under. */
export function SecHead({ title, meta, right }: { title: ReactNode; meta?: ReactNode; right?: ReactNode }) {
  return (
    <div className="tk-hd">
      <h2>{title}</h2>
      {(meta !== undefined || right) && (
        <span className="tk-hd-r">{meta !== undefined && <span>{meta}</span>}{right}</span>
      )}
    </div>
  );
}
