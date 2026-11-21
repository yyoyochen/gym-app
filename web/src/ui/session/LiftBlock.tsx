// One lift in the logger as a spec sheet: name + committed criterion, then a
// mono table of sets. Warm-ups are faded, logged rows carry the pixel check,
// the next set of the lift in focus is the inverted row. Tap a logged row to edit it, a planned
// row to log it adjusted.
import type { EffortScale, SetEntry, SetKind } from '../../domain/types';
import { formatEffort } from '../../engine';
import { kg, type LiveSlot } from '../../app/coach';
import { PixelIcon } from '../kit';
import { liftRows, type SheetRow } from './logger';
import { MonoNums, loadText } from './text';

export interface BlockHandlers {
  /** Log a planned row adjusted (opens the set sheet). */
  adjust: (slot: LiveSlot, row: SheetRow) => void;
  edit: (slot: LiveSlot, s: SetEntry) => void;
  addSet: (slot: LiveSlot) => void;
  swap: (slot: LiveSlot) => void;
  focus: (slot: LiveSlot) => void;
}

export function kindsFor(slot: LiveSlot): SetKind[] {
  return slot.plan?.target.model === 'topset' && !slot.swapped ? ['top', 'backoff', 'drop', 'warmup'] : ['working', 'drop', 'warmup'];
}

function painText(s: SetEntry): string {
  const p = s.pain;
  const pain = p ? `Pain · ${p.side !== 'na' ? `${p.side} ` : ''}${p.area.replace('_', ' ')} · ${p.severity}` : '';
  return [pain, s.note ?? ''].filter(Boolean).join(' · ');
}

export function LiftBlock({ slot, scale, h, focused, index, count }: {
  slot: LiveSlot; scale: EffortScale; h: BlockHandlers; focused: boolean; index: number; count: number;
}) {
  const plan = slot.plan;
  const t = plan?.target;
  const { rows } = liftRows(slot);
  const right = !plan ? 'Added · ungraded' : slot.swapped ? 'Swapped · ungraded' : `Lift ${index} of ${count}`;
  return (
    <section className={`lg-spec${focused ? ' focused' : ''}`} aria-label={slot.exercise.name}>
      <div className="lg-spec-hd">
        <button type="button" className="lg-spec-name" data-press="dim" onClick={() => h.focus(slot)} aria-current={focused || undefined}>{slot.exercise.name}</button>
        <span>{right}</span>
      </div>
      {t && !slot.swapped && <p className="lg-spec-crit"><MonoNums text={t.criterion} /></p>}
      {t && slot.swapped && <p className="lg-spec-crit">Committed: {t.exerciseName}. This slot is logged, not graded.</p>}
      {t && !slot.swapped && <p className="lg-spec-floor">Effort floor {plan!.floorLabel}</p>}
      <div className="lg-spec-rows">
        {rows.map(r => <Row key={r.key} r={!focused && r.state === 'next' ? { ...r, state: 'todo' } : r} scale={scale} bw={slot.exercise.bodyweightFactor} onTap={() => (r.set ? h.edit(slot, r.set) : h.adjust(slot, r))} />)}
        {slot.stopped && <p className="lg-spec-stop">Stopped for today.</p>}
      </div>
      {!focused && slot.nudge && <p className={`note nudge ${slot.nudge.kind}`}>//{slot.nudge.kind === 'stop' ? 'Stop' : 'Note'} — {slot.nudge.text}</p>}
      <div className="lg-spec-foot">
        <button type="button" className="btn quiet" onClick={() => h.addSet(slot)}><PixelIcon name="plus" />Add set</button>
        {plan && !slot.work.length && <button type="button" className="btn quiet" onClick={() => h.swap(slot)}>Swap lift</button>}
      </div>
    </section>
  );
}

function Row({ r, scale, bw, onTap }: { r: SheetRow; scale: EffortScale; bw: number; onTap: () => void }) {
  const s = r.set;
  const effort = r.rir !== undefined && !r.warm ? formatEffort(r.rir, scale) : '';
  const icon = s ? (s.pain ? 'pain' : 'check') : null;
  const what = s ? 'Logged, edit' : r.state === 'next' ? 'Next set, adjust and log' : 'Planned, adjust and log';
  return (
    <>
      <button type="button" data-press="row" onClick={onTap}
        className={`lg-row ${r.state}${r.warm ? ' warm' : ''}${s && !r.warm && !r.met ? ' short' : ''}${s && Date.now() - s.loggedAt < 1500 ? ' fresh' : ''}`}
        aria-label={`${r.label}: ${kg(r.weight)} kilograms × ${r.reps}${effort ? ` at ${effort}` : ''}. ${what}`}>
        <span className="k">{r.label}</span>
        <span className="v">{loadText(r.weight, bw)} × {r.reps}{s?.failed && <span className="x"> ✕</span>}</span>
        <span className="e">{effort}</span>
        <span className="i">{icon && <PixelIcon name={icon} />}</span>
      </button>
      {s && (s.pain || s.note) && <p className="lg-row-note">{painText(s)}</p>}
    </>
  );
}
