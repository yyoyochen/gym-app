// Change one lift of a one-off workout: Top set + back-offs or Straight sets,
// weight, sets, reps; Swap lift or Remove. A weight the lifter changes is kept
// as theirs (the plan is then built at it); sets and reps go into the slot.
import { useState } from 'react';
import type { Slot } from '../../domain/types';
import type { SlotPlan } from '../coach';
import { kg } from '../coach';
import { RIR_FLOOR } from '../../domain/templates';
import { backoffWeight } from '../../engine';
import { Button, ConfirmButton, Segmented, Sheet, Stepper } from '../../ui/kit';
import type { DraftSlot } from '../suggest';

type Kind = 'topset' | 'double';

/** The slot after the sheet's choices. For a top set, Sets and Reps are the back-offs. */
export function editedSlot(slot: Slot, kind: Kind, sets: number, reps: number, isolation: boolean): Slot {
  const top = slot.model === 'topset' ? slot.params.topReps ?? 2 : 2;
  const pct = slot.params.backoffPct ?? 75;
  return kind === 'topset'
    ? { ...slot, model: 'topset', params: { sets: 1, topReps: top, backoffSets: sets, backoffPct: pct, repMin: reps, repMax: reps + 2, rirFloor: RIR_FLOOR.top } }
    : { ...slot, model: 'double', params: { sets, repMin: reps, repMax: reps + (isolation ? 3 : 2), rirFloor: isolation ? RIR_FLOOR.isolation : RIR_FLOOR.compound } };
}

interface SheetState { kind: Kind; sets: number; reps: number; weight: number }

/** Done: the lift after the sheet. Untouched fields leave the lift as it was; a moved weight becomes the lifter's. */
export function sheetResult(item: DraftSlot, start: SheetState, now: SheetState, isolation: boolean): DraftSlot {
  const shaped = now.kind !== start.kind || now.sets !== start.sets || now.reps !== start.reps;
  const slot = shaped ? editedSlot(item.slot, now.kind, now.sets, now.reps, isolation) : item.slot;
  // The weight is the lifter's once they move it (or had already); 0 means "let the app pick".
  const chosen = (item.weight !== undefined || now.weight !== start.weight) && now.weight > 0;
  const { weight: _old, ...rest } = item;
  void _old;
  return chosen ? { ...rest, slot, weight: now.weight } : { ...rest, slot };
}

export function WorkoutLiftSheet({ item, plan, onDone, onSwap, onRemove, onClose }: {
  item: DraftSlot; plan: SlotPlan; onDone: (next: DraftSlot) => void; onSwap: () => void; onRemove: () => void; onClose: () => void;
}) {
  const t = plan.target;
  const p = item.slot.params;
  const start: SheetState = {
    kind: item.slot.model === 'topset' ? 'topset' : 'double',
    weight: item.weight ?? (t.model === 'topset' ? t.topWeight ?? t.weight : t.weight),
    sets: item.slot.model === 'topset' ? p.backoffSets ?? 3 : p.sets,
    reps: p.repMin,
  };
  const [kind, setKind] = useState<Kind>(start.kind);
  const [weight, setWeight] = useState(start.weight);
  const [sets, setSets] = useState(start.sets);
  const [reps, setReps] = useState(start.reps);
  const iso = plan.exercise.slotType === 'isolation';
  const inc = p.increment ?? plan.exercise.increment;

  const done = () => onDone(sheetResult(item, start, { kind, sets, reps, weight }, iso));

  return (
    <Sheet open title={plan.exercise.name} onClose={onClose}>
      <Segmented<Kind> label="Plan" value={kind} onChange={setKind}
        options={[{ value: 'topset', label: 'Top set + back-offs' }, { value: 'double', label: 'Straight sets' }]} />
      <Stepper label={kind === 'topset' ? 'Top set weight' : 'Weight'} unit="kg" value={weight} step={inc} min={0} max={500} onChange={setWeight} />
      <div className="grid2 steppers">
        <Stepper label={kind === 'topset' ? 'Back-off sets' : 'Sets'} value={sets} min={1} max={10} onChange={setSets} />
        <Stepper label={kind === 'topset' ? 'Back-off reps' : 'Reps'} value={reps} min={1} max={30} onChange={setReps} />
      </div>
      <p className="note">// Last time: {plan.lastTime.length ? plan.lastTime.join(', ') : 'first time'}{weight > 0 && kind === 'topset' ? `. Back-offs at ${kg(backoffWeight(weight, p.backoffPct ?? 75, inc))} kg` : ''}</p>
      <Button variant="primary" block iconEnd="check" onClick={done}>Done</Button>
      <div className="grid2">
        <Button block onClick={onSwap}>Swap lift</Button>
        <ConfirmButton danger className="block" confirmLabel={`Remove ${plan.exercise.name}?`} confirmText="Remove" onConfirm={onRemove}>Remove</ConfirmButton>
      </div>
    </Sheet>
  );
}
