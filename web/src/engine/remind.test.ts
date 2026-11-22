import { describe, expect, it } from 'vitest';
import { session, set } from './__fixtures__/build';
import {
  classifyGap, formatElapsed, lastSessionLine, lastTimeParts, reentryAnchors, reentryNote, reentryState, resumeCard,
} from './remind';

const H = 3_600_000;
const now = Date.UTC(2026, 10, 21, 9);

describe('classifyGap (§3.5)', () => {
  const last = (date: string, endedAt: number, sealed = true) => ({ date, startedAt: endedAt - H, endedAt, sealed });
  it('an open session wins at any gap', () => {
    expect(classifyGap({ date: '2026-11-01', startedAt: now - 20 * 24 * H, sealed: false }, now, '2026-11-21').kind).toBe('in_progress');
  });
  it('<24h, 2–7 d, 8–20 d, 21+ d', () => {
    expect(classifyGap(last('2026-11-20', now - 20 * H), now, '2026-11-21').kind).toBe('under_24h');
    expect(classifyGap(last('2026-11-20', now - 25 * H), now, '2026-11-21').kind).toBe('short');
    expect(classifyGap(last('2026-11-14', now - 7 * 24 * H), now, '2026-11-21')).toEqual({ kind: 'short', days: 7 });
    expect(classifyGap(last('2026-11-13', now - 8 * 24 * H), now, '2026-11-21')).toEqual({ kind: 'reentry_note', days: 8 });
    expect(classifyGap(last('2026-11-01', now - 20 * 24 * H), now, '2026-11-21').kind).toBe('reentry_note');
    expect(classifyGap(last('2026-10-31', now - 21 * 24 * H), now, '2026-11-21').kind).toBe('reentry_block');
  });
  it('first run', () => expect(classifyGap(undefined, now, '2026-11-21').kind).toBe('first_run'));
});

describe('reentryState', () => {
  it('first session after 8–20 days: one re-entry session, then two capped sessions', () => {
    const d = ['2026-10-20', '2026-10-22'];
    expect(reentryState(d, '2026-11-03')).toEqual({ reentry: 'note', afterLayoff: false, gapDays: 12 });
    expect(reentryState([...d, '2026-11-03'], '2026-11-05')).toEqual({ reentry: 'none', afterLayoff: true, gapDays: 12 });
    expect(reentryState([...d, '2026-11-03', '2026-11-05'], '2026-11-07').afterLayoff).toBe(true);
    expect(reentryState([...d, '2026-11-03', '2026-11-05', '2026-11-07'], '2026-11-09')).toEqual({ reentry: 'none', afterLayoff: false, gapDays: null });
  });
  it('21+ days: two re-entry sessions', () => {
    const d = ['2026-09-01'];
    expect(reentryState(d, '2026-10-01').reentry).toBe('block');
    expect(reentryState([...d, '2026-10-01'], '2026-10-03').reentry).toBe('block');
    expect(reentryState([...d, '2026-10-01', '2026-10-03'], '2026-10-05')).toMatchObject({ reentry: 'none', afterLayoff: true });
  });
  it('no layoff, no re-entry', () => {
    expect(reentryState(['2026-11-18'], '2026-11-21')).toEqual({ reentry: 'none', afterLayoff: false, gapDays: null });
    expect(reentryState([], '2026-11-21').reentry).toBe('none');
  });
  it('notes say what changed and why', () => {
    expect(reentryNote({ reentry: 'note', afterLayoff: false, gapDays: 12 })).toMatch(/^12 days since your last session\. Today is anchored on the last logged session/);
    expect(reentryNote({ reentry: 'block', afterLayoff: false, gapDays: 30 })).toMatch(/two sessions of 3 × 8/);
    expect(reentryNote({ reentry: 'none', afterLayoff: false, gapDays: null })).toBe('');
  });
});

describe('anchors and cards', () => {
  it('anchors on the latest logged session per lift, not goals', () => {
    const a = reentryAnchors({
      bench: [session('2026-09-01', [set(90, 5)]), session('2026-10-20', [set(40, 10, { kind: 'warmup' }), set(80, 8), set(80, 8), set(80, 7)])],
      squat: [],
    }, '2026-11-21');
    expect(a).toEqual([{ exerciseId: 'bench', date: '2026-10-20', weight: 80, sets: [{ weight: 80, reps: 8 }, { weight: 80, reps: 8 }, { weight: 80, reps: 7 }] }]);
  });
  it('resume card: lift, next set number, last set, rested time', () => {
    const s = [set(100, 1, { kind: 'top', loggedAt: now - 300_000 }), set(80, 6, { kind: 'backoff', loggedAt: now - 220_000, rir: 2 })];
    expect(resumeCard(s, now)).toEqual({ exerciseName: 'Bench Press', setNumber: 3, lastSet: { weight: 80, reps: 6, rir: 2 },
      restedMs: 220_000, restedLabel: 'rested 3:40' });
    expect(resumeCard([], now)).toBeNull();
  });
  it('formats elapsed time', () => {
    expect(formatElapsed(90_000)).toBe('1:30');
    expect(formatElapsed(3_725_000)).toBe('1:02:05');
    expect(formatElapsed(-5)).toBe('0:00');
  });
  it('last session and last time lines', () => {
    expect(lastSessionLine('B', '2026-11-18', '2026-11-21', 4, 5)).toBe('Last session: B, 3 days ago, 4/5 kept');
    expect(lastSessionLine('A', '2026-11-20', '2026-11-21', 2, 2)).toBe('Last session: A, yesterday, 2/2 kept');
    expect(lastTimeParts([set(80, 8), set(80, 8), set(80, 7)])).toEqual(['80 × 8, 8, 7']);
    expect(lastTimeParts([set(100, 1, { kind: 'top' }), set(82.5, 8), set(82.5, 8)])).toEqual(['100 × 1', '82.5 × 8, 8']);
    expect(lastTimeParts([])).toEqual([]);
  });
});
