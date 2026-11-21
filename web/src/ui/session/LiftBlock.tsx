// One lift in the logger: warm-up ramp, set rows in the four LUME states
// (pending / ghost / logged / criterion-met), one nudge line under the active
// set, and the silent rest label under the session's last logged set.
import type { EffortScale, SetEntry, SetKind } from '../../domain/types';
import type { PlannedSet } from '../../engine';
import { formatEffort } from '../../engine';
import { kg, setMeetsPlan, type LiveSlot } from '../../app/coach';
import { CHECK, MonoNums } from './text';

export interface BlockHandlers {
  logPlanned: (slot: LiveSlot, p: PlannedSet) => void;
  openNew: (slot: LiveSlot, p: PlannedSet) => void;
  edit: (slot: LiveSlot, s: SetEntry) => void;
  plates: (weight: number) => void;
  swap: (slot: LiveSlot) => void;
}

export function kindsFor(slot: LiveSlot): SetKind[] {
  return slot.plan?.target.model === 'topset' && !slot.swapped ? ['top', 'backoff', 'drop', 'warmup'] : ['working', 'drop', 'warmup'];
}

const KIND_SHORT: Partial<Record<SetKind, string>> = { top: 'top', backoff: 'b/o', drop: 'drop', warmup: 'warm' };

function Values({ weight, reps, rir, kind, scale, onWeight, onReps, failed, solid }: {
  weight: number; reps: number; rir?: number; kind: SetKind; scale: EffortScale; failed?: boolean; solid?: boolean;
  onWeight: () => void; onReps: () => void;
}) {
  return (
    <div className="vals">
      <button type="button" className={`w-btn${solid ? ' val-solid' : ''}`} onClick={onWeight} aria-label={`${kg(weight)} kilograms, plate calculator`}>{kg(weight)}</button>
      <button type="button" className={`r-btn${solid ? ' val-solid' : ''}`} onClick={onReps} aria-label={solid ? 'Edit set' : 'Adjust, then log'}>
        × {reps}{rir !== undefined && <span className="eff"> @ {formatEffort(rir, scale)}</span>}{failed && <span className="slate"> failed</span>}
      </button>
      {KIND_SHORT[kind] && <span className="kind">{KIND_SHORT[kind]}</span>}
    </div>
  );
}

export function LiftBlock({ slot, scale, h, rested }: {
  slot: LiveSlot; scale: EffortScale; h: BlockHandlers; rested: { setId: string; label: string } | null;
}) {
  const plan = slot.plan;
  const t = plan?.target;
  const warmLogged = slot.sets.filter(s => s.kind === 'warmup');
  const warmLeft = plan && !slot.work.length && !slot.swapped ? plan.warmups.slice(warmLogged.length) : [];
  const ghost = plan && !slot.swapped ? plan.ghost : [];
  const rows = Math.max(slot.work.length, slot.stopped ? slot.work.length : ghost.length);
  const firstGhost = slot.work.length < rows ? slot.work.length : -1;
  const restedRow = (s: SetEntry) => rested && rested.setId === s.id ? <p className="rested">{rested.label}</p> : null;
  const nudgeLine = slot.nudge ? <p className={`nudge ${slot.nudge.kind}`} role="status">{slot.nudge.text}</p> : null;
  const lastPlanned: PlannedSet = slot.work.length
    ? { kind: slot.work[slot.work.length - 1].kind, weight: slot.work[slot.work.length - 1].weight, reps: slot.work[slot.work.length - 1].reps, ...(slot.work[slot.work.length - 1].rir !== undefined ? { rir: slot.work[slot.work.length - 1].rir } : {}) }
    : ghost[ghost.length - 1] ?? { kind: 'working', weight: 0, reps: 8 };

  const loggedRow = (s: SetEntry, label: string, warm = false, met = false) => (
    <div key={s.id}>
      <div className={`set-row logged${warm ? ' warm' : ''}${met ? ' met' : ''}${s.pain && s.pain.severity >= 2 ? ' stopped' : ''}`}>
        <span className="set-n">{label}</span>
        <Values weight={s.weight} reps={s.reps} rir={s.rir} kind={warm ? 'working' : s.kind} scale={scale} failed={s.failed} solid
          onWeight={() => h.plates(s.weight)} onReps={() => h.edit(slot, s)} />
        <button type="button" className="commit-btn" onClick={() => h.edit(slot, s)} aria-label="Logged — edit">{CHECK}</button>
      </div>
      {(s.pain || s.note) && <p className="rested">{s.pain ? `pain · ${s.pain.side !== 'na' ? `${s.pain.side} ` : ''}${s.pain.area.replace('_', ' ')} · ${s.pain.severity}` : ''}{s.pain && s.note ? ' · ' : ''}{s.note ?? ''}</p>}
      {restedRow(s)}
    </div>
  );

  return (
    <section className={`card tick lift-block ${slot.swapped || !plan ? 'tick-new' : 'tick-ghost'}`} aria-label={slot.exercise.name}>
      <div className="lift-head">
        <div className="stack tight">
          <span className="label">{plan ? `Lift ${slot.slotOrder}` : 'Added · ungraded'}{slot.swapped ? ' · swapped, ungraded' : ''}</span>
          <h2 className="heading">{slot.exercise.name}</h2>
        </div>
        {plan && !slot.work.length && <button type="button" className="btn" onClick={() => h.swap(slot)}>Swap</button>}
      </div>
      {t && !slot.swapped && <p className="criterion"><MonoNums text={t.criterion} /></p>}
      {t && slot.swapped && <p className="criterion">Committed: {t.exerciseName}. This slot is logged, not graded.</p>}
      {t && !slot.swapped && <p className="mid line">Effort floor <span className="num-inline">{plan!.floorLabel}</span></p>}

      <div className="set-rows">
        {warmLogged.map((s, i) => loggedRow(s, `W${i + 1}`, true))}
        {warmLeft.map((w, i) => (
          <div key={`w${i}`} className="set-row warm pending">
            <span className="set-n">W{warmLogged.length + i + 1}</span>
            <Values weight={w.weight} reps={w.reps} kind="working" scale={scale} onWeight={() => h.plates(w.weight)} onReps={() => h.openNew(slot, w)} />
            <button type="button" className="commit-btn" onClick={() => h.logPlanned(slot, w)} aria-label={`Log warm-up ${kg(w.weight)} × ${w.reps}`}>{CHECK}</button>
          </div>
        ))}
        {Array.from({ length: rows }, (_, i) => {
          if (i < slot.work.length) return loggedRow(slot.work[i], String(i + 1), false, !slot.swapped && !(slot.work[i].pain && slot.work[i].pain!.severity >= 2) && setMeetsPlan(slot.work[i], ghost[i], t?.rirFloor ?? 0));
          // After a stop rule that lowers the load, the remaining planned rows
          // carry the safer weight, so the one-tap choice is the safe one. The
          // committed promise is unchanged (it is already missed at this point).
          const base = ghost[i];
          const safer = slot.nudge?.kind === 'stop' && slot.nudge.suggestWeight !== undefined && base.kind !== 'top';
          const g = safer ? { ...base, weight: slot.nudge!.suggestWeight! } : base;
          return (
            <div key={`g${i}`}>
              <div className={`set-row ${i === firstGhost ? 'ghost' : 'pending'}`}>
                <span className="set-n">{i + 1}</span>
                <Values weight={g.weight} reps={g.reps} rir={g.rir} kind={g.kind} scale={scale} onWeight={() => h.plates(g.weight)} onReps={() => h.openNew(slot, g)} />
                <button type="button" className="commit-btn" onClick={() => h.logPlanned(slot, g)} aria-label={`Log as planned: ${kg(g.weight)} × ${g.reps}`}>{CHECK}</button>
              </div>
              {i === firstGhost && nudgeLine}
            </div>
          );
        })}
        {firstGhost < 0 && nudgeLine}
        {slot.stopped && !slot.nudge && <p className="nudge stop">Stopped for today.</p>}
        <button type="button" className="add-row" onClick={() => h.openNew(slot, lastPlanned)}>+ Add set</button>
      </div>
    </section>
  );
}
