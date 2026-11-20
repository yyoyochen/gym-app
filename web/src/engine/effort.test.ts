import { describe, expect, it } from 'vitest';
import {
  capLoad, DEFAULT_FLOORS, effortFloor, effortRole, formatEffort, formatEffortRange, formatFloor, incrementFor,
  maxLoadJump, rirToRpe, rpeToRir, snapRpe,
} from './effort';
import { exercise } from './__fixtures__/build';

describe('RIR ⇄ RPE', () => {
  it('RPE = 10 − RIR, both ways, half steps kept', () => {
    expect(rirToRpe(2)).toBe(8);
    expect(rpeToRir(8.5)).toBe(1.5);
    expect(rpeToRir(rirToRpe(0.5))).toBe(0.5);
  });
  it('snaps RPE input to half steps between 6 and 10', () => {
    expect(snapRpe(8.3)).toBe(8.5);
    expect(snapRpe(8.2)).toBe(8);
    expect(snapRpe(4)).toBe(6);
    expect(snapRpe(11)).toBe(10);
  });
  it('formats effort in the chosen scale', () => {
    expect(formatEffort(2, 'rir')).toBe('2 RIR');
    expect(formatEffort(1.5, 'rpe')).toBe('RPE 8.5');
    expect(formatEffortRange(1, 2, 'rir')).toBe('1–2 RIR');
    expect(formatEffortRange(1, 2, 'rpe')).toBe('RPE 8–9');
    expect(formatEffortRange(3, 3, 'rpe')).toBe('RPE 7');
    expect(formatFloor(2, 'rir')).toBe('≥ 2 RIR');
    expect(formatFloor(2, 'rpe')).toBe('≤ RPE 8');
  });
});

describe('effort floors (§3.3.1)', () => {
  it('defaults: top 2/2, compound working 2/1, isolation 1/0', () => {
    expect(effortFloor({ role: 'top' })).toMatchObject({ floor: 2, lastSetFloor: 2, raised: false });
    expect(effortFloor({ role: 'working' })).toMatchObject({ floor: 2, lastSetFloor: 1 });
    expect(effortFloor({ role: 'isolation' })).toMatchObject({ floor: 1, lastSetFloor: 0 });
    expect(DEFAULT_FLOORS.top.floor).toBe(2);
  });
  it('each raiser adds +1 RIR, and together they still add only +1', () => {
    expect(effortFloor({ role: 'top', readiness: 'red' }).floor).toBe(3);
    expect(effortFloor({ role: 'top', gapDays: 8 }).floor).toBe(3);
    expect(effortFloor({ role: 'top', gapDays: 7 }).floor).toBe(2);
    expect(effortFloor({ role: 'working', painReasons: ['shoulder'] })).toMatchObject({ floor: 3, lastSetFloor: 2 });
    const all = effortFloor({ role: 'top', readiness: 'red', gapDays: 10, painReasons: ['x'] });
    expect(all.floor).toBe(3);
    expect(all.reasons).toHaveLength(3);
  });
  it('isolation is raised by readiness and pain, not by a gap', () => {
    expect(effortFloor({ role: 'isolation', gapDays: 12 }).floor).toBe(1);
    expect(effortFloor({ role: 'isolation', readiness: 'red' })).toMatchObject({ floor: 2, lastSetFloor: 1 });
  });
  it('re-entry: every compound set at 3 RIR, last set included', () => {
    expect(effortFloor({ role: 'working', reentry: true })).toMatchObject({ floor: 3, lastSetFloor: 3 });
    expect(effortFloor({ role: 'isolation', reentry: true }).floor).toBe(1);
  });
  it('uses the slot\'s own floor when edited', () => {
    expect(effortFloor({ role: 'working', baseFloor: 3 })).toMatchObject({ floor: 3, lastSetFloor: 2 });
  });
  it('maps slots to roles', () => {
    expect(effortRole('topset', 'compound', true)).toBe('top');
    expect(effortRole('topset', 'compound', false)).toBe('working');
    expect(effortRole('double', 'isolation')).toBe('isolation');
  });
});

describe('load jump cap', () => {
  it('one increment normally', () => {
    expect(maxLoadJump({ lastWeight: 100, increment: 2.5 })).toBe(2.5);
    expect(capLoad(102.5, { lastWeight: 100, increment: 2.5 })).toEqual({ weight: 102.5, capped: false, reason: '' });
    expect(capLoad(105, { lastWeight: 100, increment: 2.5 })).toEqual({
      weight: 102.5, capped: true, reason: '105kg refused — jumps are capped at one increment (2.5kg); capped at 102.5kg' });
  });
  it('no jump on the first session back', () => {
    expect(capLoad(102.5, { lastWeight: 100, increment: 2.5, firstSessionBack: true })).toMatchObject({ weight: 100, capped: true });
  });
  it('after a layoff the smaller of one increment and 5% applies', () => {
    expect(maxLoadJump({ lastWeight: 100, increment: 2.5, afterLayoff: true })).toBe(2.5);
    expect(maxLoadJump({ lastWeight: 40, increment: 2.5, afterLayoff: true })).toBe(0); // 5% = 2 kg < one plate step
    expect(maxLoadJump({ lastWeight: 140, increment: 5, afterLayoff: true })).toBe(5);
  });
  it('a lower load is never capped', () => {
    expect(capLoad(90, { lastWeight: 100, increment: 2.5, firstSessionBack: true }).capped).toBe(false);
  });
  it('increment falls back to the exercise', () => {
    expect(incrementFor(exercise({ increment: 5 }))).toBe(5);
    expect(incrementFor(exercise({ increment: 5 }), 1.25)).toBe(1.25);
  });
});
