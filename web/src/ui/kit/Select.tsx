// A select in the app's own style: a field showing the current choice that
// opens a list sheet (48 px rows, the chosen row inverted with a pixel check).
// Replaces the native <select>, whose popup ignores the design system.
import { useEffect, useId, useRef, useState } from 'react';
import { PixelIcon } from './PixelIcon';
import { Sheet } from './Sheet';

export interface SelectOption<T extends string> { value: T; label: string; group?: string }

export function Select<T extends string>({ label, value, options, onChange, placeholder = 'Choose…' }: {
  label: string; value: T; options: SelectOption<T>[]; onChange: (v: T) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const labelId = useId(), valueId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  // A long list opens with the chosen row in view.
  useEffect(() => { if (open) listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'center' }); }, [open]);
  const current = options.find(o => o.value === value);
  const groups: { name?: string; items: SelectOption<T>[] }[] = [];
  for (const o of options) {
    const last = groups[groups.length - 1];
    if (last && last.name === o.group) last.items.push(o); else groups.push({ ...(o.group ? { name: o.group } : {}), items: [o] });
  }
  return (
    <div className="field-wrap">
      <span className="label" id={labelId}>{label}</span>
      <button type="button" className="select-field" aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`${labelId} ${valueId}`} onClick={() => setOpen(true)}>
        <span id={valueId} className={current ? '' : 'mid'}>{current ? current.label : placeholder}</span>
        <PixelIcon name="down" scale={1} />
      </button>
      <Sheet open={open} title={label} onClose={() => setOpen(false)} detents={['large']}>
        <div role="listbox" aria-label={label} className="select-list" ref={listRef}>
          {groups.map((g, gi) => {
            const rows = g.items.map(o => (
              <button key={o.value} type="button" role="option" aria-selected={o.value === value} data-press="dim"
                className={`select-opt${o.value === value ? ' on' : ''}`} onClick={() => { onChange(o.value); setOpen(false); }}>
                <span className="select-check">{o.value === value && <PixelIcon name="check" scale={2} />}</span>
                {o.label}
              </button>
            ));
            return g.name
              ? <div key={gi} role="group" aria-label={g.name}><div className="select-group label" aria-hidden="true">{g.name}</div>{rows}</div>
              : <div key={gi} role="presentation">{rows}</div>;
          })}
        </div>
      </Sheet>
    </div>
  );
}
