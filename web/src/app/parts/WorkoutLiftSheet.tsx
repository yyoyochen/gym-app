// Change one lift of a one-off workout: Top set + back-offs or Straight sets,
// weight, sets, reps; Swap lift or Remove. A weight the lifter changes is kept
// as theirs (the plan is then built at it); sets and reps go into the slot.
import { useState } from 'react';
import type { Slot } from '../../domain/types';
import type { SlotPlan } from '../coach';
import { kg } from '../coach';
import { RIR_FLOOR } from '../../domain/templates';
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

export function WorkoutLiftSheet({ item, plan, onDone, onSwap, onRemove, onClose }: {
  item: DraftSlot; plan: SlotPlan; onDone: (next: DraftSlot) => void; onSwap: () => void; onRemove: () => void; onClose: () => void;
}) {
  const t = plan.target;
  const startKind: Kind = item.slot.model === 'topset' ? 'topset' : 'double';
  const startW = item.weight ?? (t.model === 'topset' ? t.topWeight ?? t.weight : t.weight);
  const p = item.slot.params;
  const [kind, setKind] = useState<Kind>(startKind);
  const [weight, setWeight] = useState(startW);
  const [sets, setSets] = useState(item.slot.model === 'topset' ? p.backoffSets ?? 3 : p.sets);
  const [reps, setReps] = useState(p.repMin);
  const iso = plan.exercise.slotType === 'isolation';
  const inc = p.increment ?? plan.exercise.increment;

  const done = () => {
    const slot = editedSlot(item.slot, kind, sets, reps, iso);
    // The weight is the lifter's once they move it (or had already); 0 means "let the app pick".
    const chosen = (item.weight !== undefined || weight !== startW) && weight > 0;
    const { weight: _old, ...rest } = item;
    void _old;
    onDone(chosen ? { ...rest, slot, weight } : { ...rest, slot });
  };

  return (
    <Sheet open title={plan.exercise.name} onClose={onClose}>
      <Segmented<Kind> label="Plan" value={kind} onChange={setKind}
        options={[{ value: 'topset', label: 'Top set + back-offs' }, { value: 'double', label: 'Straight sets' }]} />
      <Stepper label={kind === 'topset' ? 'Top set weight' : 'Weight'} unit="kg" value={weight} step={inc} min={0} max={500} onChange={setWeight} />
      <div className="grid2 steppers">
        <Stepper label={kind === 'topset' ? 'Back-off sets' : 'Sets'} value={sets} min={1} max={10} onChange={setSets} />
        <Stepper label={kind === 'topset' ? 'Back-off reps' : 'Reps'} value={reps} min={1} max={30} onChange={setReps} />
      </div>
      <p className="note">// Last time: {plan.lastTime.length ? plan.lastTime.join(', ') : 'first time'}{weight > 0 && kind === 'topset' ? `. Back-offs at ${kg(Math.round(weight * (p.backoffPct ?? 75) / 100 / inc) * inc)} kg` : ''}</p>
      <Button variant="primary" block iconEnd="check" onClick={done}>Done</Button>
      <div className="grid2">
        <Button block onClick={onSwap}>Swap lift</Button>
        <ConfirmButton danger className="block" confirmLabel={`Remove ${plan.exercise.name}?`} confirmText="Remove" onConfirm={onRemove}>Remove</ConfirmButton>
      </div>
    </Sheet>
  );
}
