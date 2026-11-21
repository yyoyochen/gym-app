import { describe, expect, it } from 'vitest';
import type { SetEntry, Target } from '../domain/types';
import { exercise, set, slot } from './__fixtures__/build';
import { nudge, plannedSetCount, type NudgeInput } from './nudge';

const bench = exercise();
const curl = exercise({ id: 'curl', name: 'Preacher Curl', slotType: 'isolation', increment: 1.25, rirFloor: undefined } as never);
const topT: Target = {
  slotId: 'slot-bench', exerciseId: 'bench', exerciseName: 'Bench Press', model: 'topset', weight: 80, targetReps: 6, repMax: 8,
  targetSets: 3, rirFloor: 2, topWeight: 100, topReps: 1, addedWeight: false, prevTop: [], isNew: false, criterion: '', why: '', rule: '',
};
const dblT: Target = { ...topT, model: 'double', weight: 80, targetReps: 8, targetSets: null, topWeight: undefined, topReps: undefined, prevTop: [8, 8, 7] };
const top = (w: number, r: number, rir?: number, over: Partial<SetEntry> = {}) => set(w, r, { kind: 'top', ...(rir !== undefined ? { rir } : {}), ...over });
const back = (w: number, r: number, rir?: number, over: Partial<SetEntry> = {}) => set(w, r, { kind: 'backoff', ...(rir !== undefined ? { rir } : {}), ...over });
const run = (over: Partial<NudgeInput>) => nudge({ target: topT, exercise: bench, sets: [], plannedSets: 4, readiness: 'green', effortScale: 'rir', ...over });

describe('nudge: stop rules win', () => {
  it('top set below the floor: no more top sets, back-offs drop (acceptance 2)', () => {
    const n = run({ sets: [top(100, 1, 1)] });
    expect(n).toEqual({ kind: 'stop', rule: 'top_below_floor', suggestWeight: 75, text: 'Top set at 1 RIR is past the floor (≥ 2 RIR) — no more top sets; back-offs drop to 75kg.' });
    expect(run({ sets: [top(100, 1, 1)], effortScale: 'rpe' })!.text)
      .toBe('Top set at RPE 9 is past the floor (≤ RPE 8) — no more top sets; back-offs drop to 75kg.');
  });
  it('two or more RIR past the floor drops back-offs 10%', () => {
    expect(run({ sets: [top(100, 1, 0)] })!.text).toMatch(/drop to 70kg/);
  });
  it('rep failure on a compound drops the remaining sets', () => {
    expect(run({ target: dblT, plannedSets: 3, sets: [set(80, 8), set(80, 5, { failed: true })] })).toMatchObject({
      kind: 'stop', rule: 'failure_drop', text: "Rep failure at 80kg — drop the remaining sets to 70kg. Don't repeat 80kg until next session." });
  });
  it('pain severity 2+ stops the lift and beats every push', () => {
    const n = run({ sets: [top(100, 1, 4, { pain: { area: 'shoulder', side: 'left', severity: 2 } })] });
    expect(n).toMatchObject({ kind: 'stop', rule: 'pain_stop' });
    expect(n!.text).toBe('Pain flagged (left shoulder, severity 2) — Bench Press stops for today. Next session holds the load and starts with a pain check.');
  });
  it('a niggle is info only, but still beats push rules', () => {
    expect(run({ sets: [top(100, 1, 4, { pain: { area: 'elbow', side: 'na', severity: 1 } })] })!.rule).toBe('pain_niggle');
  });
  it('failure on an isolation lift is not a stop', () => {
    const n = run({ target: { ...dblT, exerciseId: 'curl' }, exercise: curl, plannedSets: 3, sets: [set(20, 6, { failed: true })] });
    expect(n?.rule).not.toBe('failure_drop');
  });
});

describe('nudge: push rules', () => {
  it('light top set on a green day offers one extra top set, capped at the floor', () => {
    expect(run({ sets: [top(100, 1, 3)] })).toEqual({ kind: 'push', rule: 'extra_top_offer',
      text: 'Top set felt light (3 RIR). Optional: one more single at 102.5kg, still stopping at ≥ 2 RIR.' });
  });
  it('no extra-set offer when readiness is not green', () => {
    expect(run({ sets: [top(100, 1, 3)], readiness: 'red' })?.rule).not.toBe('extra_top_offer');
    expect(run({ sets: [top(100, 1, 3)], readiness: 'amber' })?.rule).not.toBe('extra_top_offer');
  });
  it('only one extra top set is offered', () => {
    expect(run({ sets: [top(100, 1, 3), top(102.5, 1, 3)] })?.rule).not.toBe('extra_top_offer');
  });
  it('last working set after an easy set: take it to 1–2 RIR with a rep range', () => {
    const n = run({ sets: [top(100, 1, 2), back(80, 6, 3), back(80, 6, 3)] });
    expect(n).toEqual({ kind: 'push', rule: 'last_set_push', text: 'Last set — take it to 1–2 RIR: aim for 6–8 reps.' });
    expect(run({ sets: [top(100, 1, 2), back(80, 6, 3), back(80, 6, 3)], effortScale: 'rpe' })!.text)
      .toBe('Last set — take it to RPE 8–9: aim for 6–8 reps.');
  });
  it('isolation last set may go to 0–1 RIR', () => {
    const t = { ...dblT, exerciseId: 'curl', rirFloor: 1, targetReps: 10 };
    const n = nudge({ target: t, exercise: curl, sets: [set(20, 10, { rir: 3 }), set(20, 10, { rir: 3 })], plannedSets: 3, readiness: 'green', effortScale: 'rir' });
    expect(n!.text).toBe('Last set — take it to 0–1 RIR: aim for 10–13 reps.');
  });
  it('re-entry keeps the last set at the 3 RIR floor', () => {
    const t = { ...topT, rirFloor: 3 };
    const n = run({ target: t, reentry: true, sets: [top(100, 1, 3), back(80, 6, 4), back(80, 6, 4)] });
    expect(n!.text).toMatch(/^Last set — take it to 3–4 RIR/);
  });
  it('promise met with sets to spare', () => {
    const n = run({ target: dblT, plannedSets: 4, sets: [set(80, 8), set(80, 8), set(80, 7)] });
    expect(n).toEqual({ kind: 'info', rule: 'promise_kept', text: 'Promise kept. Extra sets are a bonus, not required.' });
  });
  it('back-offs at prescribed reps with 4+ RIR: coach note for next time', () => {
    const n = run({ sets: [top(100, 1, 2), back(80, 6, 4), back(80, 6, 4), back(80, 6, 4)] });
    expect(n).toEqual({ kind: 'info', rule: 'too_easy_note', text: 'Too easy — next time +1 increment.' });
  });
  it('red readiness says what changed before the first set', () => {
    expect(run({ target: { ...topT, rirFloor: 3 }, readiness: 'red' })).toEqual({ kind: 'info', rule: 'readiness_red',
      text: 'Readiness red — effort floor raised to ≥ 3 RIR; no extra sets today.' });
  });
  it('nothing to say → null', () => {
    expect(run({ sets: [top(100, 1, 2)] })).toBeNull();
  });
  it('planned set count: top set + back-offs', () => {
    expect(plannedSetCount(topT, slot('topset'))).toBe(4);
    expect(plannedSetCount(dblT, slot('double', { sets: 3 }))).toBe(3);
  });
});
