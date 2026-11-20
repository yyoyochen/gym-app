export interface SegOption<T extends string> { value: T; label: string }

/** Segmented control (radio group). */
export function Segmented<T extends string>({ label, options, value, onChange }: {
  label?: string; options: SegOption<T>[]; value: T | undefined; onChange: (v: T) => void;
}) {
  return (
    <div className="stack" role="radiogroup" aria-label={label}>
      {label && <span className="label">{label}</span>}
      <div className="seg">
        {options.map(o => (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value}
            className={`seg-opt${value === o.value ? ' on' : ''}`} onClick={() => onChange(o.value)}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}
