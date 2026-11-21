import { describe, expect, it } from 'vitest';
import {
  countWord, funComparison, funLine, loadLine, mondayOf, prFlags, niceTicks, pluralLift, tonnage, trainingStats, trendGlyphs, weeklyVolume, weeksSince,
} from './stats';

// Synthetic fixture: three sessions over two weeks.
const sessions = [
  { id: 's1', date: '2030-01-06' }, // Sunday
  { id: 's2', date: '2030-01-08' }, // Tuesday
  { id: 's3', date: '2030-01-13' }, // Sunday
];
const set = (sessionId: string, exerciseId: string, weight: number, reps: number, kind = 'working') => ({ sessionId, exerciseId, weight, reps, kind });
const sets = [
  set('s1', 'squat', 20, 5, 'warmup'), set('s1', 'squat', 100, 5), set('s1', 'squat', 100, 5), set('s1', 'row', 50, 10),
  set('s2', 'row', 50, 10), set('s2', 'row', 50, 10), set('s2', 'dip', 0, 10),
  set('s3', 'squat', 105, 3), set('s3', 'squat', 105, 3),
  set('orphan', 'squat', 999, 1),
];

describe('trainingStats', () => {
  const st = trainingStats(sessions, sets);
  it('counts sessions and every set of known sessions', () => {
    expect(st.sessions).toBe(3);
    expect(st.sets).toBe(9);
    expect(st.setsPerSession).toBe(3);
  });
  it('favourite = most working sets (warm-ups excluded)', () => {
    expect(st.favourite).toEqual({ exerciseId: 'squat', sets: 4 });
  });
  it('busiest day, longest break, first and last', () => {
    expect(st.busiestDay).toBe(0);
    expect(st.longestBreak).toBe(5);
    expect(st.first).toBe('2030-01-06');
    expect(st.last).toBe('2030-01-13');
  });
  it('empty input', () => {
    expect(trainingStats([], [])).toMatchObject({ sessions: 0, sets: 0, setsPerSession: null, favourite: null, busiestDay: null, longestBreak: null, first: null });
  });
  it('two sessions on one date do not make a zero-day break', () => {
    expect(trainingStats([{ id: 'a', date: '2030-02-01' }, { id: 'b', date: '2030-02-01' }], []).longestBreak).toBeNull();
  });
});

describe('tonnage + fun comparison', () => {
  it('sums working weight × reps for the chosen lifts only', () => {
    expect(tonnage(sets, new Set(['squat']))).toBe(100 * 5 * 2 + 105 * 3 * 2 + 999);
    expect(tonnage(sets, new Set(['dip']))).toBe(0);
  });
  it('picks the biggest thing the total covers', () => {
    expect(funComparison(42_300)).toEqual({ tonnes: 42, count: 7, thing: 'elephants', note: 'at 6 t each' });
    expect(funComparison(6_100)?.thing).toBe('elephant');
    expect(funComparison(2_500)).toMatchObject({ tonnes: 2.5, count: 2, thing: 'small cars' });
    expect(funComparison(100)).toBeNull();
    expect(funComparison(0)).toBeNull();
  });
  it('reads as a sentence', () => {
    expect(funLine('squats', '1 Jan', funComparison(42_000)!)).toBe('Your squats since 1 Jan add up to about 42 tonnes: roughly seven elephants (at 6 t each).');
    expect(countWord(14)).toBe('14');
    expect(pluralLift('Back Squat')).toBe('back squats');
    expect(pluralLift('Pull-ups')).toBe('pull-ups');
  });
});

describe('trendGlyphs', () => {
  it('scales the last n values between their own min and max', () => {
    expect(trendGlyphs([1, 2, 3, 4, 5, 6, 7], 4)).toBe('░▒▓█');
    expect(trendGlyphs([10, 10, 10])).toBe('▒▒▒');
    expect(trendGlyphs([])).toBe('');
    expect(trendGlyphs([5, 1])).toBe('█░');
  });
});

describe('weekly volume and weeks', () => {
  it('buckets by ISO week (Monday)', () => {
    expect(mondayOf('2030-01-13')).toBe('2030-01-07');
    expect(mondayOf('2030-01-07')).toBe('2030-01-07');
    const v = weeklyVolume([
      { date: '2030-01-08', sets: [{ kind: 'working', weight: 100, reps: 5 }, { kind: 'warmup', weight: 60, reps: 5 }] },
      { date: '2030-01-10', sets: [{ kind: 'working', weight: 100, reps: 3 }] },
      { date: '2030-01-14', sets: [{ kind: 'top', weight: 110, reps: 1 }, { kind: 'working', weight: 0, reps: 10 }] },
    ]);
    expect(v).toEqual([{ date: '2030-01-07', value: 800 }, { date: '2030-01-14', value: 110 }]);
  });
  it('weeksSince covers first … today in Monday-first columns', () => {
    expect(weeksSince('2030-01-07', '2030-01-13', 1)).toBe(1); // Mon → Sun, same column
    expect(weeksSince('2030-01-06', '2030-01-07', 1)).toBe(2); // Sun → Mon
    expect(weeksSince('2030-01-07', '2030-01-13')).toBe(12); // clamped to min
    expect(weeksSince('2020-01-01', '2030-01-12')).toBe(53); // clamped to max
  });
  it('niceTicks', () => {
    expect(niceTicks(92, 118)).toEqual([90, 100, 110, 120]);
    expect(niceTicks(0, 1000, 3)).toEqual([0, 500, 1000]);
    expect(niceTicks(50, 50).length).toBeGreaterThan(1);
  });
});

describe('loadLine', () => {
  it('groups runs at one load and skips warm-ups', () => {
    const w = (weight: number, reps: number, kind = 'working', failed = false) => ({ weight, reps, kind, failed });
    expect(loadLine([w(20, 5, 'warmup'), w(100, 2, 'top'), w(80, 8), w(80, 8), w(80, 7, 'working', true)])).toBe('100 × 2 · 80 × 8, 8, 7✕');
    expect(loadLine([w(0, 10), w(10, 6)], x => (x === 0 ? 'BW' : `BW+${x}`))).toBe('BW × 10 · BW+10 × 6');
    expect(loadLine([])).toBe('—');
  });
});

describe('prFlags', () => {
  it('marks values that beat every earlier one', () => {
    expect(prFlags([100, 105, 105, 103, 110])).toEqual([false, true, false, false, true]);
    expect(prFlags([])).toEqual([]);
  });
});
