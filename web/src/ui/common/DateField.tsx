import { useId, useState } from 'react';
import type { ISODate } from '../../domain/types';
import { formatDate } from '../../app/dates';
import { t } from '../../i18n';
import { PixelIcon } from '../kit';
import { DatePickerSheet } from './DatePickerSheet';
import { useTrainedDays } from './useTrainedDays';

/** A date under a mono label; tapping it opens the calendar sheet. Value is ISO YYYY-MM-DD or '' for none. */
export function DateField({ label, value, onChange, min, max, confirmLabel = t('Use this date'), clearable }: {
  label: string; value: ISODate | ''; onChange: (v: ISODate | '') => void; min?: ISODate; max?: ISODate; confirmLabel?: string; clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const labelId = useId(), valueId = useId();
  const levels = useTrainedDays();
  return (
    <div className="field-wrap">
      <span className="label" id={labelId}>{label}</span>
      <button type="button" className="select-field" aria-haspopup="dialog" aria-labelledby={`${labelId} ${valueId}`} onClick={() => setOpen(true)}>
        <span id={valueId} className={value ? '' : 'mid'}>{value ? formatDate(value) : t('Pick a date')}</span>
        <PixelIcon name="down" scale={1} />
      </button>
      {open && (
        <DatePickerSheet open value={value} {...(min ? { min } : {})} {...(max ? { max } : {})} levels={levels} title={label} confirmLabel={confirmLabel}
          onPick={d => { onChange(d); setOpen(false); }} {...(clearable ? { onClear: () => { onChange(''); setOpen(false); } } : {})} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}
