import { describe, expect, it } from 'vitest';
import type { SetEntry, Target } from '../../domain/types';
import type { LiveSlot, SlotPlan } from '../../app/coach';
import { UNDO_MS, focusSlot, liftRows, nextAction, nextLabel, rowLabelOf, sessionCount, undoable } from './logger';

describe('undoable', () => {
  it('the last logged set can be undone for a short while only', () => {
    expect(undoable({ loggedAt: 1000 }, 1000 + UNDO_MS)).toBe(true);
    expect(undoable({ loggedAt: 1000 }, 1000 + UNDO_MS + 1)).toBe(false);
    expect(undoable(null, 1000)).toBe(false);
  });
});

const target = (o: Partial<Target> = {}): Target => ({
  slotId: 'a1', exerciseId: 'squat', exerciseName: 'Back squat', model: 'topset', weight: 70, targetReps: 6, targetSets: 3, rirFloor: 2,
  topWeight: 90, topReps: 3, addedWeight: false, prevTop: [], isNew: false, criterion: 'Synthetic criterion', why: '', rule: '', ...o,
});
let n = 0;
const logged = (weight: number, reps: number, kind: SetEntry['kind'], extra: Partial<SetEntry> = {}): SetEntry => ({
  id: `s${++n}`, sessionId: 'x', exerciseId: 'squat', exerciseNameSnapshot: 'Back squat', slotOrder: 1, setOrder: n, kind, weight, reps, loggedAt: n, ...extra,
});
function slot(sets: SetEntry[], o: Partial<LiveSlot> = {}, t = target()): LiveSlot {
  const plan = {
    slotOrder: 1, slot: null, exercise: { id: 'squat', name: 'Back squat' }, target: t, plannedSets: 4,
    ghost: [{ kind: 'top', weight: 90, reps: 3, rir: 2 }, ...[1, 2, 3].map(() => ({ kind: 'backoff' as const, weight: 70, reps: 6, rir: 2 }))],
    warmups: [{ kind: 'warmup', weight: 20, reps: 8 }, { kind: 'warmup', weight: 45, reps: 5 }],
    lastTime: '', floorLabel: '≥ 2 RIR', inMinimum: false,
  } as unknown as SlotPlan;
  return { slotOrder: 1, plan, exercise: plan.exercise, sets, work: sets.filter(s => s.kind !== 'warmup'), nudge: null, stopped: false, swapped: false, ...o };
}

describe('logger rows', () => {
  it('fresh lift: warm-ups first, the first one is next; labels W1, Top, 1, 2, 3', () => {
    const { rows, next } = liftRows(slot([]));
    expect(rows.map(r => r.label)).toEqual(['W1', 'W2', 'Top', '1', '2', '3']);
    expect(next).toMatchObject({ label: 'W1', state: 'next', warm: true });
    expect(nextLabel(next!)).toBe('Next: warm-up 1 of 2');
    expect(rows.filter(r => r.state === 'next')).toHaveLength(1);
  });

  it('after the top set, warm-ups left are dropped and the next back-off is current', () => {
    const s = slot([logged(20, 8, 'warmup'), logged(90, 3, 'top', { rir: 2 })]);
    const { rows, next } = liftRows(s);
    expect(rows.map(r => `${r.label}:${r.state}`)).toEqual(['W1:logged', 'Top:logged', '1:next', '2:todo', '3:todo']);
    expect(rows[1].met).toBe(true);
    expect(nextLabel(next!)).toBe('Next: set 2 of 4, back-off');
    expect(rowLabelOf([s], s.sets[1].id)).toEqual({ lift: 'Back squat', label: 'the top set' });
  });

  it('a top set past the effort floor is logged but not met', () => {
    const { rows } = liftRows(slot([logged(90, 3, 'top', { rir: 1 })]));
    expect(rows.find(r => r.label === 'Top')).toMatchObject({ state: 'logged', met: false });
  });

  it('a lowering stop nudge carries the safer weight on the remaining back-offs', () => {
    const s = slot([logged(90, 3, 'top', { rir: 0 })], { nudge: { kind: 'stop', text: 'Drop the load', rule: 'r', suggestWeight: 65 } });
    expect(liftRows(s).rows.filter(r => r.state !== 'logged').map(r => r.weight)).toEqual([65, 65, 65]);
  });

  it('a stopped lift has no planned rows left; a swapped one is ungraded', () => {
    expect(liftRows(slot([logged(90, 3, 'top')], { stopped: true })).next).toBeNull();
    const sw = liftRows(slot([], { swapped: true }));
    expect(sw.rows).toHaveLength(0);
    expect(sw.next).toBeNull();
  });

  it('focus falls through to the first lift with a planned set; the count covers graded lifts only', () => {
    const done = slot([logged(90, 3, 'top'), ...[1, 2, 3].map(() => logged(70, 6, 'backoff'))]);
    const two = { ...slot([]), slotOrder: 2 };
    const added: LiveSlot = { ...slot([logged(10, 10, 'working')]), slotOrder: 3, plan: null };
    expect(focusSlot([done, two, added], 1)?.slotOrder).toBe(2);
    expect(focusSlot([done, two, added], null)?.slotOrder).toBe(2);
    expect(focusSlot([done], 1)).toBeNull();
    expect(sessionCount([done, two, added])).toEqual({ done: 4, planned: 8 });
  });
});

describe('nextAction (a lift with no history)', () => {
  it('0 kg on a non-bodyweight lift: hero is an em dash, the primary action sets the weight instead of logging', () => {
    expect(nextAction({ weight: 0 }, 0)).toEqual({ needsWeight: true, hero: '—', caption: 'set the weight', primaryLabel: 'Set weight' });
  });
  it('0 kg added on a bodyweight lift stays loggable and reads BW', () => {
    expect(nextAction({ weight: 0 }, 1)).toEqual({ needsWeight: false, hero: 'BW', caption: null, primaryLabel: 'Log as planned' });
  });
  it('a planned weight logs as planned', () => {
    expect(nextAction({ weight: 62.5 }, 0)).toEqual({ needsWeight: false, hero: '62.5', caption: null, primaryLabel: 'Log as planned' });
  });
});
