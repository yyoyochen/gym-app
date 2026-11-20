// Set editor sheet: steppers for weight/reps, effort in the user's scale
// (stored as RIR), set kind, failed toggle, fixed-list pain flag, note.
import { useEffect, useState } from 'react';
import type { EffortScale, PainArea, PainFlag, SetKind, Side } from '../../domain/types';
import { ConfirmButton, Segmented, Sheet, Stepper } from '../common';
import { PAIN_AREAS, PAIN_AREA_LABELS, SET_KIND_LABELS } from '../../app/labels';

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
const SIDES: { value: Side; label: string }[] = [
  { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }, { value: 'both', label: 'Both' }, { value: 'na', label: 'n/a' },
];
const SEVERITY: { value: '1' | '2' | '3'; label: string }[] = [
  { value: '1', label: '1 niggle' }, { value: '2', label: '2 changed lift' }, { value: '3', label: '3 stopped' },
];

/** Effort chips. RIR 0–5 (5 = 5+), or RPE 6–10 in half steps; the value is always RIR. */
export function EffortPicker({ rir, scale, onChange }: { rir?: number; scale: EffortScale; onChange: (rir: number | undefined) => void }) {
  const opts = scale === 'rpe' ? RPE_OPTS.map(v => ({ label: String(v), rir: 10 - v })) : RIR_OPTS.map(v => ({ label: v === 5 ? '5+' : String(v), rir: v }));
  return (
    <div className="stack">
      <span className="label">Effort · {scale === 'rpe' ? 'RPE' : 'RIR'}</span>
      <div className="effort-chips" role="radiogroup" aria-label={scale === 'rpe' ? 'RPE' : 'Reps in reserve'}>
        {opts.map(o => (
          <button key={o.label} type="button" role="radio" aria-checked={rir === o.rir} className={`chip${rir === o.rir ? ' on' : ''}`}
            onClick={() => onChange(rir === o.rir ? undefined : o.rir)}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

export function SetSheet({ open, title, initial, step, scale, kinds, onSave, onDelete, onClose, saveLabel = 'Save' }: {
  open: boolean; title: string; initial: SetDraft; step: number; scale: EffortScale; kinds: SetKind[];
  onSave: (d: SetDraft) => void | Promise<void>; onDelete?: () => void | Promise<void>; onClose: () => void; saveLabel?: string;
}) {
  const [d, setD] = useState(initial);
  const [painOpen, setPainOpen] = useState(!!initial.pain);
  useEffect(() => { if (open) { setD(initial); setPainOpen(!!initial.pain); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (patch: Partial<SetDraft>) => setD(x => ({ ...x, ...patch }));
  const pain = d.pain ?? { area: 'shoulder' as PainArea, side: 'na' as Side, severity: 1 as const };
  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <div className="grid2 steppers">
        <Stepper label="Weight" unit="kg" value={d.weight} step={step} min={-200} onChange={weight => set({ weight })} />
        <Stepper label="Reps" value={d.reps} step={1} min={0} onChange={reps => set({ reps })} />
      </div>
      <EffortPicker rir={d.rir} scale={scale} onChange={rir => set({ rir })} />
      {kinds.length > 1 && (
        <Segmented label="Set kind" options={kinds.map(k => ({ value: k, label: SET_KIND_LABELS[k] }))} value={d.kind} onChange={kind => set({ kind })} />
      )}
      <label className="row check">
        <input type="checkbox" checked={d.failed} onChange={e => set({ failed: e.target.checked })} />
        <span>Failed — fewer reps than intended</span>
      </label>
      {!painOpen ? (
        <button type="button" className="btn" onClick={() => { setPainOpen(true); set({ pain }); }}>Flag pain</button>
      ) : (
        <div className="pain-box" aria-label="Pain flag">
          <span className="label">Pain · area</span>
          <div className="chips">
            {PAIN_AREAS.map(a => (
              <button key={a} type="button" className={`chip big${pain.area === a ? ' on' : ''}`} aria-pressed={pain.area === a}
                onClick={() => set({ pain: { ...pain, area: a } })}>{PAIN_AREA_LABELS[a]}</button>
            ))}
          </div>
          <Segmented label="Side" options={SIDES} value={pain.side} onChange={side => set({ pain: { ...pain, side } })} />
          <Segmented label="Severity" options={SEVERITY} value={String(pain.severity) as '1' | '2' | '3'}
            onChange={v => set({ pain: { ...pain, severity: Number(v) as 1 | 2 | 3 } })} />
          <input className="field" placeholder="Pain note (optional, only for you)" value={pain.note ?? ''}
            onChange={e => set({ pain: { ...pain, ...(e.target.value ? { note: e.target.value } : { note: undefined }) } })} />
          <button type="button" className="btn" onClick={() => { setPainOpen(false); set({ pain: undefined }); }}>Remove pain flag</button>
        </div>
      )}
      <textarea className="field" placeholder="Note" value={d.note} onChange={e => set({ note: e.target.value })} />
      <button type="button" className="btn primary commit-cta" onClick={() => onSave(d)}>{saveLabel}</button>
      {onDelete && <ConfirmButton danger className="block" confirmLabel="Delete this set?" onConfirm={onDelete}>Delete set</ConfirmButton>}
    </Sheet>
  );
}
