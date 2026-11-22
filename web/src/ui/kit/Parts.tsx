// Facts that belong on one line, shown as separate spans with a gap between
// them. The gap is the separator: no middle dot or other glyph (docs/DESIGN.md).
export function Parts({ items, className = '' }: { items: readonly string[]; className?: string }) {
  return (
    <span className={className ? `parts ${className}` : 'parts'}>
      {items.map((p, i) => <span key={i} className="part">{p}</span>)}
    </span>
  );
}
