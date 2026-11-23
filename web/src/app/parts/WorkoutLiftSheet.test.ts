import { describe, expect, it } from 'vitest';
import { addSetRow, sheetResult, withIds } from './WorkoutLiftSheet';

const slot = { id: 'x', exerciseId: 'barbell-row', model: 'double' as const, params: { sets: 3, repMin: 8, repMax: 12, rirFloor: 2 } };
const planned = [{ weight: 70, reps: 8 }, { weight: 70, reps: 8 }, { weight: 70, reps: 8 }];

describe('sheetResult: pressing Done', () => {
  it('with the list as planned leaves the lift exactly as it was', () => {
    const item = { part: 'Back' as const, slot };
    expect(sheetResult(item, planned, planned.map(x => ({ ...x })))).toEqual(item);
  });
  it('an edited list becomes the plan; a chosen weight from before is dropped', () => {
    const item = { part: 'Back' as const, slot, weight: 60 };
    const now = [{ weight: 72.5, reps: 8 }, { weight: 70, reps: 8 }];
    expect(sheetResult(item, planned, now)).toEqual({ part: 'Back', slot, sets: now });
  });
  it('an empty list is not a plan: the lift stays as it was', () => {
    const item = { part: 'Back' as const, slot };
    expect(sheetResult(item, planned, [])).toEqual(item);
  });
});

describe('addSetRow', () => {
  it('copies the last set', () => {
    expect(addSetRow([{ weight: 135, reps: 2 }, { weight: 100, reps: 8 }])).toEqual([{ weight: 135, reps: 2 }, { weight: 100, reps: 8 }, { weight: 100, reps: 8 }]);
  });
  it('starts at 0 × 8 when empty', () => {
    expect(addSetRow([])).toEqual([{ weight: 0, reps: 8 }]);
  });
});

describe('reordering sets', () => {
  it('the same sets in a new order are an edit, kept in that order', () => {
    const item = { part: 'Back' as const, slot };
    const plan = [{ weight: 80, reps: 5 }, { weight: 60, reps: 8 }, { weight: 60, reps: 8 }];
    const moved = [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }, { weight: 80, reps: 5 }];
    expect(sheetResult(item, plan, moved)).toEqual({ part: 'Back', slot, sets: moved });
  });
  it('rows carry ids so a moved row keeps its own inputs', () => {
    const rows = withIds([{ weight: 80, reps: 5 }, { weight: 60, reps: 8 }]);
    expect(new Set(rows.map(r => r.id)).size).toBe(2);
    expect(rows.map(({ weight, reps }) => ({ weight, reps }))).toEqual([{ weight: 80, reps: 5 }, { weight: 60, reps: 8 }]);
  });
});
