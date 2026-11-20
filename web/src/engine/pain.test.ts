import { describe, expect, it } from 'vitest';
import type { PainFlag } from '../domain/types';
import { exercise, set } from './__fixtures__/build';
import {
  areaTriggers, painEventsFromSets, painFloorReasons, painStatus, sameArea, stopsLiftToday,
  type ExerciseSession, type PainEvent,
} from './pain';

const bench = exercise({ id: 'bench', areasLoaded: ['shoulder', 'elbow', 'wrist'] });
const ohp = exercise({ id: 'ohp', name: 'OHP', areasLoaded: ['shoulder', 'elbow'] });
const squat = exercise({ id: 'squat', name: 'Squat', areasLoaded: ['knee', 'hip', 'lower_back'] });
const flag = (severity: 1 | 2 | 3, area: PainFlag['area'] = 'shoulder', side: PainFlag['side'] = 'left'): PainFlag => ({ area, side, severity });
const ev = (date: string, exerciseId: string, f: PainFlag): PainEvent => ({ date, sessionId: `s-${date}`, exerciseId, flag: f });
const sess = (date: string, exerciseId: string): ExerciseSession => ({ date, sessionId: `s-${date}`, exerciseId });

describe('pain rules (§3.3.2)', () => {
  it('severity 2–3 stops the lift today; severity 1 does not', () => {
    expect(stopsLiftToday([set(80, 8), set(80, 6, { pain: flag(2) })]).stop).toBe(true);
    expect(stopsLiftToday([set(80, 8, { pain: flag(1) })]).stop).toBe(false);
  });

  it('severity 1: next session holds the load for that lift only', () => {
    const events = [ev('2026-11-18', 'bench', flag(1))];
    const b = painStatus({ exercise: bench, events, history: [sess('2026-11-18', 'bench')], today: '2026-11-21' });
    expect(b).toMatchObject({ hold: true, painCheck: false, regressPct: 0, raiseRir: 1 });
    const o = painStatus({ exercise: ohp, events, history: [sess('2026-11-15', 'ohp')], today: '2026-11-21' });
    expect(o.hold).toBe(false);
    expect(o.raiseRir).toBe(1); // still loads a flagged area within 14 days
  });

  it('severity 2: hold + pain check next session', () => {
    const b = painStatus({ exercise: bench, events: [ev('2026-11-18', 'bench', flag(2))], history: [sess('2026-11-18', 'bench')], today: '2026-11-21' });
    expect(b).toMatchObject({ hold: true, painCheck: true });
  });

  it('acceptance 14: two severity-2 left-shoulder flags in 10 days regress bench and OHP, not squat', () => {
    const events = [ev('2026-11-08', 'bench', flag(2)), ev('2026-11-18', 'ohp', flag(2))];
    const history = [sess('2026-11-08', 'bench'), sess('2026-11-08', 'squat'), sess('2026-11-18', 'ohp'), sess('2026-11-18', 'squat')];
    for (const ex of [bench, ohp]) {
      const st = painStatus({ exercise: ex, events, history: history.filter((h) => h.exerciseId === ex.id), today: '2026-11-21' });
      expect(st).toMatchObject({ regressPct: 0.1, raiseRir: 1 });
    }
    const sq = painStatus({ exercise: squat, events, history: history.filter((h) => h.exerciseId === 'squat'), today: '2026-11-21' });
    expect(sq).toMatchObject({ regressPct: 0, raiseRir: 0, hold: false });
  });

  it('flags more than 14 days apart do not trigger the regression', () => {
    expect(areaTriggers([ev('2026-10-01', 'bench', flag(2)), ev('2026-10-20', 'bench', flag(3))])).toEqual([]);
  });

  it('a later session without a flag on the area clears the regression', () => {
    const events = [ev('2026-11-01', 'bench', flag(2)), ev('2026-11-05', 'bench', flag(2))];
    const history = [sess('2026-11-01', 'bench'), sess('2026-11-05', 'bench'), sess('2026-11-09', 'bench')];
    const st = painStatus({ exercise: bench, events, history, today: '2026-11-25' });
    expect(st.regressPct).toBe(0);
    expect(st.hold).toBe(false);
  });

  it('left and right are different areas; "both" matches either', () => {
    expect(sameArea(flag(2, 'shoulder', 'left'), flag(2, 'shoulder', 'right'))).toBe(false);
    expect(sameArea(flag(2, 'shoulder', 'left'), flag(2, 'shoulder', 'both'))).toBe(true);
    expect(sameArea(flag(2, 'knee', 'na'), flag(2, 'knee', 'left'))).toBe(true);
    expect(sameArea(flag(2, 'knee'), flag(2, 'hip'))).toBe(false);
  });

  it('profile injuries add +1 RIR from the start', () => {
    const st = painStatus({ exercise: bench, events: [], history: [], today: '2026-11-21', injuries: [{ area: 'shoulder', side: 'left', since: '2026-09-20' }] });
    expect(st.raiseRir).toBe(1);
    expect(painFloorReasons(st)).toEqual(['protecting the left shoulder (profile) — +1 RIR']);
    expect(painFloorReasons(undefined)).toEqual([]);
  });

  it('builds events from logged sets', () => {
    const s = [set(80, 8, { sessionId: 'a', pain: flag(1) }), set(80, 8, { sessionId: 'a' })];
    expect(painEventsFromSets(s, () => '2026-11-20')).toHaveLength(1);
  });

  it('ignores flags dated today or later (plans come from earlier days)', () => {
    const st = painStatus({ exercise: bench, events: [ev('2026-11-21', 'bench', flag(3))], history: [], today: '2026-11-21' });
    expect(st.raiseRir).toBe(0);
  });
});
