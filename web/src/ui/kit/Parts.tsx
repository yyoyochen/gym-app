// Facts that belong on one line, shown as separate spans with a gap between
// them. The gap is the separator: no middle dot or other glyph (docs/DESIGN.md).
// Screen readers get a hidden comma so the parts don't run together.
import { Fragment } from 'react';

export function Parts({ items, className = '' }: { items: readonly string[]; className?: string }) {
  return (
    <span className={className ? `parts ${className}` : 'parts'}>
      {items.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="sr-only">, </span>}
          <span className="part">{p}</span>
        </Fragment>
      ))}
    </span>
  );
}
