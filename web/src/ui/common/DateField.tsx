import type { ISODate } from '../../domain/types';

/** Native date input under a mono label; value is ISO YYYY-MM-DD or '' for none. */
export function DateField({ label, value, onChange, min, max }: {
  label: string; value: ISODate | ''; onChange: (v: ISODate | '') => void; min?: ISODate; max?: ISODate;
}) {
  return (
    <label className="field-wrap">
      <span className="label">{label}</span>
      <input type="date" className="field date-field" value={value} min={min} max={max} onChange={e => onChange(e.target.value)} />
    </label>
  );
}
