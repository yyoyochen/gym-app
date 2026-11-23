// Set sheet ("Adjust"): steppers for weight and reps, effort in the user's
// scale (stored as RIR), set kind, a failed toggle, the fixed-list pain flag
// and a note. Kit controls only (Stepper, Segmented, Toggle).
import { useEffect, useState } from 'react';
import type { EffortScale, PainArea, PainFlag, SetKind, Side } from '../../domain/types';
import { Button, ConfirmButton, Segmented, Sheet, Stepper, Toggle } from '../kit';
import { PAIN_AREAS, PAIN_AREA_LABELS, SIDE_LABELS } from '../../app/labels';
import { t } from '../../i18n';

export interface SetDraft {
  weight: number;
  reps: number;
  rir?: number;
  kind: SetKind;
  failed: boolean;
  pain?: PainFlag;
  note: string;
}

const RIR_OPTS = [0, 1, 2, 3, 4, 5];
const RPE_OPTS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
const sides = (): { value: Side; label: string }[] => [
  { value: 'left', label: SIDE_LABELS.left }, { value: 'right', label: SIDE_LABELS.right }, { value: 'both', label: SIDE_LABELS.both }, { value: 'na', label: t('n/a') },
];
/** Pain severity 1–3, as the set sheet and the set editor show it. */
export const severityOptions = (): { value: '1' | '2' | '3'; label: string }[] => [
  { value: '1', label: t('1 niggle') }, { value: '2', label: t('2 changed') }, { value: '3', label: t('3 stopped') },
];

/** Effort as a segmented control. RIR 0–5 (5 = 5+), or RPE; the value is always RIR. */
export function EffortPicker({ rir, scale, onChange }: { rir?: number; scale: EffortScale; onChange: (rir: number | undefined) => void }) {
  const opts = scale === 'rpe'
    ? RPE_OPTS.map(v => ({ value: String(10 - v), label: String(v) }))
    : RIR_OPTS.map(v => ({ value: String(v), label: v === 5 ? '5+' : String(v) }));
  return (
    <Segmented label={scale === 'rpe' ? t('Effort (RPE)') : t('Effort (reps in reserve)')} options={opts}
      value={rir === undefined ? undefined : String(rir)} allowDeselect onChange={v => onChange(v === undefined ? undefined : Number(v))} />
  );
}

export function SetSheet({ open, title, initial, step, scale, onSave, onDelete, onClose, saveLabel }: {
  open: boolean; title: string; initial: SetDraft; step: number; scale: EffortScale;
  onSave: (d: SetDraft) => void | Promise<void>; onDelete?: () => void | Promise<void>; onClose: () => void; saveLabel?: string;
}) {
  const [d, setD] = useState(initial);
  useEffect(() => { if (open) setD(initial); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (patch: Partial<SetDraft>) => setD(x => ({ ...x, ...patch }));
  const pain = d.pain ?? { area: 'shoulder' as PainArea, side: 'na' as Side, severity: 1 as const };
  return (
    <Sheet open={open} title={title} onClose={onClose} detents={['large']}>
      <div className="grid2 steppers">
        <Stepper label={t('Weight')} unit="kg" value={d.weight} step={step} min={-200} onChange={weight => set({ weight })} />
        <Stepper label={t('Reps')} value={d.reps} step={1} min={0} onChange={reps => set({ reps })} />
      </div>
      {d.kind !== 'warmup' && <EffortPicker rir={d.rir} scale={scale} onChange={rir => set({ rir })} />}
      <div className="sheet-toggles">
        <Toggle label={t('Failed')} hint={t('Fewer reps than intended')} checked={d.failed} onChange={failed => set({ failed })} />
        <Toggle label={t('Flag pain')} hint={t('Next session holds the load')} checked={!!d.pain} onChange={on => set({ pain: on ? pain : undefined })} />
      </div>
      {d.pain && (
        <div className="pain-box" aria-label={t('Pain flag')}>
          <span className="label">{t('Pain (area)')}</span>
          <div className="chips">
            {PAIN_AREAS.map(a => (
              <button key={a} type="button" className={`chip${pain.area === a ? ' on' : ''}`} aria-pressed={pain.area === a}
                onClick={() => set({ pain: { ...pain, area: a } })}>{PAIN_AREA_LABELS[a]}</button>
            ))}
          </div>
          <Segmented label={t('Side')} options={sides()} value={pain.side} onChange={side => set({ pain: { ...pain, side } })} />
          <Segmented label={t('Severity')} options={severityOptions()} value={String(pain.severity) as '1' | '2' | '3'}
            onChange={v => set({ pain: { ...pain, severity: Number(v) as 1 | 2 | 3 } })} />
          <input className="field" placeholder={t('Pain note (optional, only for you)')} value={pain.note ?? ''}
            onChange={e => set({ pain: { ...pain, ...(e.target.value ? { note: e.target.value } : { note: undefined }) } })} />
        </div>
      )}
      <input className="field" placeholder={t('Note')} aria-label={t('Note')} value={d.note} onChange={e => set({ note: e.target.value })} />
      <Button variant="primary" block icon="check" onClick={() => onSave(d)}>{saveLabel ?? t('Save')}</Button>
      {onDelete && <ConfirmButton danger className="block" confirmLabel={t('Delete this set?')} onConfirm={onDelete}>{t('Delete set')}</ConfirmButton>}
    </Sheet>
  );
}
