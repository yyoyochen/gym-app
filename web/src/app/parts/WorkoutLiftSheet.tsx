// Change one lift of a one-off workout: its sets as one numbered list, in
// order (weight × reps each), + Add a set, then Swap lift or Remove. A list
// left as planned keeps the app's own plan (and its progression); an edited
// list becomes the lifter's plan and is graded set by set.
import { useState } from 'react';
import type { SlotPlan } from '../coach';
import { Button, ConfirmButton, PixelIcon, Sheet } from '../../ui/kit';
import type { DraftSlot } from '../suggest';

export interface SetRow { weight: number; reps: number }

const same = (a: SetRow[], b: SetRow[]) => a.length === b.length && a.every((x, i) => Math.abs(x.weight - b[i].weight) < 1e-9 && x.reps === b[i].reps);

/** Done: an unchanged (or emptied) list leaves the lift as it was; an edited one becomes its plan. */
export function sheetResult(item: DraftSlot, planned: SetRow[], now: SetRow[]): DraftSlot {
  if (!now.length || same(planned, now)) return item;
  const { weight: _w, sets: _s, ...rest } = item;
  void _w; void _s;
  return { ...rest, sets: now };
}

/** + Add a set: a copy of the last set (0 × 8 on an empty list). */
export function addSetRow(list: SetRow[]): SetRow[] {
  const last = list[list.length - 1];
  return [...list, last ? { ...last } : { weight: 0, reps: 8 }];
}

const num = (s: string) => { const v = parseFloat(s.replace(',', '.')); return Number.isFinite(v) && v >= 0 ? v : 0; };

export function WorkoutLiftSheet({ item, plan, onDone, onSwap, onRemove, onClose }: {
  item: DraftSlot; plan: SlotPlan; onDone: (next: DraftSlot) => void; onSwap: () => void; onRemove: () => void; onClose: () => void;
}) {
  // The list as the plan stands now: the lifter's own sets, or the app's planned working sets in order.
  const planned: SetRow[] = item.sets ?? plan.ghost.filter(g => g.kind !== 'warmup').map(g => ({ weight: g.weight, reps: g.reps }));
  const [rows, setRows] = useState<SetRow[]>(planned.map(r => ({ ...r })));
  const edit = (i: number, patch: Partial<SetRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const bw = plan.exercise.bodyweightFactor > 0;

  return (
    <Sheet open title={plan.exercise.name} onClose={onClose}>
      <div className="set-list" role="list" aria-label="Sets in order">
        <div className="set-row set-row-hd" aria-hidden="true"><span /><span className="label">{bw ? 'Added kg' : 'kg'}</span><span /><span className="label">Reps</span><span /></div>
        {rows.map((r, i) => (
          <div key={i} className="set-row" role="listitem">
            <span className="set-n">{i + 1}</span>
            <input className="field tnum" inputMode="decimal" aria-label={`Set ${i + 1} weight`} value={r.weight || ''} placeholder="0"
              onChange={e => edit(i, { weight: num(e.target.value) })} />
            <span className="set-x" aria-hidden="true">×</span>
            <input className="field tnum" inputMode="numeric" aria-label={`Set ${i + 1} reps`} value={r.reps || ''} placeholder="0"
              onChange={e => edit(i, { reps: Math.round(num(e.target.value)) })} />
            <button type="button" className="icon-btn" aria-label={`Remove set ${i + 1}`} data-press="dim" onClick={() => setRows(rows.filter((_, j) => j !== i))}><PixelIcon name="close" scale={1} /></button>
          </div>
        ))}
      </div>
      <Button block icon="plus" onClick={() => setRows(addSetRow(rows))}>Add a set</Button>
      <p className="note">// Last time: {plan.lastTime.length ? plan.lastTime.join(', ') : 'first time'}</p>
      <Button variant="primary" block iconEnd="check" onClick={() => onDone(sheetResult(item, planned, rows.filter(r => r.reps > 0)))}>Done</Button>
      <div className="grid2">
        <Button block onClick={onSwap}>Swap lift</Button>
        <ConfirmButton danger className="block" confirmLabel={`Remove ${plan.exercise.name}?`} confirmText="Remove" onConfirm={onRemove}>Remove</ConfirmButton>
      </div>
    </Sheet>
  );
}
