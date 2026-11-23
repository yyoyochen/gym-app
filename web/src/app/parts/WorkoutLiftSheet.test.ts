import { describe, expect, it } from 'vitest';
import { editedSlot } from './WorkoutLiftSheet';

const dbl = { id: 'x', exerciseId: 'barbell-row', model: 'double' as const, params: { sets: 3, repMin: 8, repMax: 12, rirFloor: 2 } };
const top = { id: 'y', exerciseId: 'back-squat', model: 'topset' as const, params: { sets: 1, topReps: 2, backoffSets: 3, backoffPct: 75, repMin: 8, repMax: 10, rirFloor: 2 } };

describe('editedSlot: the lift sheet choices as a slot', () => {
  it('straight sets: reps is the bottom of the range, top is +2 (+3 for isolation)', () => {
    expect(editedSlot(dbl, 'double', 4, 6, false).params).toMatchObject({ sets: 4, repMin: 6, repMax: 8, rirFloor: 2 });
    expect(editedSlot(dbl, 'double', 3, 12, true).params).toMatchObject({ sets: 3, repMin: 12, repMax: 15, rirFloor: 1 });
  });
  it('top set: Sets and Reps are the back-offs; the top reps and back-off % are kept', () => {
    expect(editedSlot(top, 'topset', 2, 6, false)).toMatchObject({ model: 'topset', params: { sets: 1, topReps: 2, backoffSets: 2, backoffPct: 75, repMin: 6, repMax: 8 } });
  });
  it('switching straight sets to a top set gets a top double at 75%', () => {
    expect(editedSlot(dbl, 'topset', 3, 8, false)).toMatchObject({ model: 'topset', params: { topReps: 2, backoffPct: 75, backoffSets: 3, repMin: 8 } });
  });
  it('keeps the slot id and lift', () => {
    expect(editedSlot(top, 'double', 3, 8, false)).toMatchObject({ id: 'y', exerciseId: 'back-squat', model: 'double' });
  });
});
