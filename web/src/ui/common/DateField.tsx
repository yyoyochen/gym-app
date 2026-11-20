import type { ISODate } from '../../domain/types';

/** Native date input; value is ISO YYYY-MM-DD or '' for none. */
export function DateField({ label, value, onChange, min, max }: {
  label: string; value: ISODate | ''; onChange: (v: ISODate | '') => void; min?: ISODate; max?: ISODate;
}) {
  return (
    <label className="stack">
      <span className="label">{label}</span>
      <input type="date" className="field mono" value={value} min={min} max={max} onChange={e => onChange(e.target.value)} />
    </label>
  );
}
