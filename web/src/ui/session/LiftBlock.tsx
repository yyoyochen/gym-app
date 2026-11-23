// One lift in the logger as a spec sheet: name + committed criterion, then a
// mono table of sets. Warm-ups are faded, logged rows carry the pixel check,
// the next set of the lift in focus is the inverted row. Tap a logged row to edit it, a planned
// row to log it adjusted.
import type { EffortScale, SetEntry } from '../../domain/types';
import { formatEffort } from '../../engine';
import { kg, type LiveSlot } from '../../app/coach';
import { PixelIcon } from '../kit';
import { t, te, tn } from '../../i18n';
import { liftRows, shownLabel, type SheetRow } from './logger';
import { MonoNums, loadText, painWhere } from './text';

export interface BlockHandlers {
  /** Log a planned row adjusted (opens the set sheet). */
  adjust: (slot: LiveSlot, row: SheetRow) => void;
  edit: (slot: LiveSlot, s: SetEntry) => void;
  addSet: (slot: LiveSlot) => void;
  swap: (slot: LiveSlot) => void;
  focus: (slot: LiveSlot) => void;
}

function painText(s: SetEntry): string {
  const p = s.pain;
  const pain = p ? t('Pain: {where}, {severity}', { where: painWhere(p), severity: p.severity }) : '';
  return [pain, s.note ?? ''].filter(Boolean).join(t('; '));
}

export function LiftBlock({ slot, scale, h, focused, index, count }: {
  slot: LiveSlot; scale: EffortScale; h: BlockHandlers; focused: boolean; index: number; count: number;
}) {
  const plan = slot.plan;
  const target = plan?.target;
  const { rows } = liftRows(slot);
  const right = !plan ? t('Added, ungraded') : slot.swapped ? t('Swapped, ungraded') : t('Lift {n} of {count}', { n: index, count });
  const name = tn(slot.exercise.name);
  return (
    <section className={`lg-spec${focused ? ' focused' : ''}`} aria-label={name}>
      <div className="lg-spec-hd">
        <button type="button" className="lg-spec-name" data-press="dim" onClick={() => h.focus(slot)} aria-current={focused || undefined}>{name}</button>
        <span>{right}</span>
      </div>
      {target && !slot.swapped && <p className="lg-spec-crit"><MonoNums text={target.criterion} /></p>}
      {target && slot.swapped && <p className="lg-spec-crit">{t('Committed: {name}. This slot is logged, not graded.', { name: tn(target.exerciseName) })}</p>}
      {target && !slot.swapped && <p className="lg-spec-floor">{t('Effort floor {floor}', { floor: te(plan!.floorLabel) })}</p>}
      <div className="lg-spec-rows">
        {rows.map(r => <Row key={r.key} r={!focused && r.state === 'next' ? { ...r, state: 'todo' } : r} scale={scale} bw={slot.exercise.bodyweightFactor} onTap={() => (r.set ? h.edit(slot, r.set) : h.adjust(slot, r))} />)}
        {slot.stopped && <p className="lg-spec-stop">{t('Stopped for today.')}</p>}
      </div>
      {!focused && slot.nudge && <p className={`note nudge ${slot.nudge.kind}`}>{slot.nudge.kind === 'stop' ? t('// Stop: {text}', { text: te(slot.nudge.text) }) : t('// Note: {text}', { text: te(slot.nudge.text) })}</p>}
      <div className="lg-spec-foot">
        <button type="button" className="btn quiet" onClick={() => h.addSet(slot)}><PixelIcon name="plus" />{t('Add set')}</button>
        {plan && !slot.work.length && <button type="button" className="btn quiet" onClick={() => h.swap(slot)}>{t('Swap lift')}</button>}
      </div>
    </section>
  );
}

function Row({ r, scale, bw, onTap }: { r: SheetRow; scale: EffortScale; bw: number; onTap: () => void }) {
  const s = r.set;
  const effort = r.rir !== undefined && !r.warm ? formatEffort(r.rir, scale) : '';
  const icon = s ? (s.pain ? 'pain' : 'check') : null;
  const what = s ? t('Logged, edit') : r.state === 'next' ? t('Next set, adjust and log') : t('Planned, adjust and log');
  const label = shownLabel(r);
  return (
    <>
      <button type="button" data-press="row" onClick={onTap}
        className={`lg-row ${r.state}${r.warm ? ' warm' : ''}${s && !r.warm && !r.met ? ' short' : ''}${s && Date.now() - s.loggedAt < 1500 ? ' fresh' : ''}`}
        aria-label={effort
          ? t('{label}: {w} kilograms × {reps} at {effort}. {what}', { label, w: kg(r.weight), reps: r.reps, effort, what })
          : t('{label}: {w} kilograms × {reps}. {what}', { label, w: kg(r.weight), reps: r.reps, what })}>
        <span className="k">{label}</span>
        <span className="v">{loadText(r.weight, bw)} × {r.reps}{s?.failed && <span className="x"> ✕</span>}</span>
        <span className="e">{effort}</span>
        <span className="i">{icon && <PixelIcon name={icon} />}</span>
      </button>
      {s && (s.pain || s.note) && <p className="lg-row-note">{painText(s)}</p>}
    </>
  );
}
