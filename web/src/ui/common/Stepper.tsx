import { useEffect, useState } from 'react';

interface Props {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  /** Digits after the decimal point shown in the field (default: as needed). */
  decimals?: number;
}

const clamp = (v: number, min?: number, max?: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
const round = (v: number) => Math.round(v * 1000) / 1000;

/** − [value] + with a typed field in mono. Typing commits on blur/Enter. */
export function Stepper({ label, value, onChange, step = 1, min, max, unit, decimals }: Props) {
  const show = (v: number) => (decimals !== undefined ? v.toFixed(decimals) : String(round(v)));
  const [text, setText] = useState(show(value));
  useEffect(() => setText(show(value)), [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = () => {
    const n = Number(text.trim().replace(',', '.'));
    if (text.trim() !== '' && Number.isFinite(n)) onChange(round(clamp(n, min, max)));
    else setText(show(value));
  };
  return (
    <div className="stepper">
      <span className="label">{label}</span>
      <div className="stepper-row">
        <button type="button" className="btn stepper-btn" aria-label={`${label} minus ${step}`}
          disabled={min !== undefined && value <= min} onClick={() => onChange(round(clamp(value - step, min, max)))}>−</button>
        <input className="field mono num-md stepper-input" inputMode="decimal" aria-label={label} value={text}
          onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
        {unit && <span className="mid stepper-unit">{unit}</span>}
        <button type="button" className="btn stepper-btn" aria-label={`${label} plus ${step}`}
          disabled={max !== undefined && value >= max} onClick={() => onChange(round(clamp(value + step, min, max)))}>+</button>
      </div>
    </div>
  );
}
