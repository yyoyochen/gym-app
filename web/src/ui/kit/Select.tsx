// A select in the app's own style: a field showing the current choice that
// opens a list sheet (48 px rows, the chosen row inverted with a pixel check).
// Replaces the native <select>, whose popup ignores the design system.
import { useState } from 'react';
import { PixelIcon } from './PixelIcon';
import { Sheet } from './Sheet';

export interface SelectOption<T extends string> { value: T; label: string; group?: string }

export function Select<T extends string>({ label, value, options, onChange, placeholder = 'Choose…' }: {
  label: string; value: T; options: SelectOption<T>[]; onChange: (v: T) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.value === value);
  let lastGroup: string | undefined;
  return (
    <div className="field-wrap">
      <span className="label">{label}</span>
      <button type="button" className="select-field" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(true)}>
        <span className={current ? '' : 'mid'}>{current ? current.label : placeholder}</span>
        <PixelIcon name="down" scale={1} />
      </button>
      <Sheet open={open} title={label} onClose={() => setOpen(false)} detents={['large']}>
        <div role="listbox" aria-label={label} className="select-list">
          {options.map(o => {
            const heading = o.group && o.group !== lastGroup ? <div className="select-group label" role="presentation">{o.group}</div> : null;
            lastGroup = o.group;
            return (
              <div key={o.value}>
                {heading}
                <button type="button" role="option" aria-selected={o.value === value} data-press="dim"
                  className={`select-opt${o.value === value ? ' on' : ''}`} onClick={() => { onChange(o.value); setOpen(false); }}>
                  <span className="select-check">{o.value === value && <PixelIcon name="check" scale={2} />}</span>
                  {o.label}
                </button>
              </div>
            );
          })}
        </div>
      </Sheet>
    </div>
  );
}
