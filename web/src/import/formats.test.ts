import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCsv, parseTable, sniffDelimiter } from './csv';
import { detectFormat, parseHevy, parseHevyDateTime, parseStrong, unitOfStrong } from './formats';

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), 'utf8');
const table = (name: string) => { const t = fixture(name); return parseCsv(t, sniffDelimiter(t)); };

describe('format detection', () => {
  it('knows the three shapes from the header', () => {
    expect(detectFormat(table('hevy-kg.csv')[0])).toBe('hevy');
    expect(detectFormat(table('hevy-lb.csv')[0])).toBe('hevy');
    expect(detectFormat(table('strong-ios.csv')[0])).toBe('strong');
    expect(detectFormat(table('strong-android.csv')[0])).toBe('strong');
    expect(detectFormat(table('strong-android-old.csv')[0])).toBe('strong');
    expect(detectFormat(table('sample-notion.csv')[0])).toBe('gymbro');
    expect(detectFormat(['a', 'b'])).toBeNull();
  });
  it('a Strong unit comes from the header, a per-row column, or nowhere (ask)', () => {
    expect(unitOfStrong(table('strong-ios.csv')[0])).toBeNull();
    expect(unitOfStrong(table('strong-android.csv')[0])).toBe('kg');
    expect(unitOfStrong(['Exercise Name', 'Set Order', 'Weight (lbs)'])).toBe('lb');
    expect(unitOfStrong(table('strong-android-old.csv')[0])).toBe('row');
  });
});

describe('Hevy dates follow the phone locale', () => {
  it('reads day-first, US 12-hour and localised month names', () => {
    expect(parseHevyDateTime('18 Nov 2026, 18:22')).toEqual({ date: '2026-11-18', time: '18:22' });
    expect(parseHevyDateTime('8 Jun 2026, 20:13')).toEqual({ date: '2026-06-08', time: '20:13' });
    expect(parseHevyDateTime('Jun 19, 2026, 9:40 AM')).toEqual({ date: '2026-06-19', time: '09:40' });
    expect(parseHevyDateTime('Oct 1, 2026, 8:28 PM')).toEqual({ date: '2026-10-01', time: '20:28' });
    expect(parseHevyDateTime('Oct 1, 2026, 12:05 AM')).toEqual({ date: '2026-10-01', time: '00:05' });
    expect(parseHevyDateTime('14 ott 2026, 20:39')).toEqual({ date: '2026-10-14', time: '20:39' });
    expect(parseHevyDateTime('5 déc. 2026, 10:00')).toEqual({ date: '2026-12-05', time: '10:00' });
    expect(parseHevyDateTime('3 Mär 2026, 07:00')).toEqual({ date: '2026-03-03', time: '07:00' });
    expect(parseHevyDateTime('31 Feb 2026, 07:00')).toBeNull();
    expect(parseHevyDateTime('yesterday')).toBeNull();
  });
});

describe('Hevy rows', () => {
  const p = parseHevy(table('hevy-kg.csv'));
  const bench = p.rows.filter(r => r.exercise === 'Bench Press (Barbell)');
  it('warm-ups, RPE as RIR, failure sets at 0 RIR, 0-based set_index → 1, 2, 3', () => {
    expect(bench.map(r => [r.set, r.kind, r.weight, r.reps, r.rir])).toEqual([
      [1, 'warmup', 40, 10, undefined], [2, 'working', 80, 5, 1.5], [3, 'working', 80, 6, 0],
    ]);
    expect(bench[0]).toMatchObject({ date: '2026-11-18', label: 'Push Day', order: 1, notes: 'Felt fast\nnext time 82.5' });
  });
  it('assisted weight is negative added load; drop sets are drops; exercise order follows the workout', () => {
    expect(p.rows.find(r => r.exercise === 'Pull Up (Assisted)')).toMatchObject({ weight: -20, order: 2 });
    expect(p.rows.find(r => r.exercise === 'Lateral Raise (Dumbbell)')).toMatchObject({ kind: 'drop', order: 3 });
  });
  it('timed and cardio rows are skipped with a reason', () => {
    expect(p.skipped.map(s => s.reason)).toEqual(['no reps (timed or cardio)', 'no reps (timed or cardio)']);
  });
  it('two workouts with one title on one day keep separate groups; localised dates read', () => {
    const groups = new Set(p.rows.filter(r => r.label === 'Push Day').map(r => r.group));
    expect(groups.size).toBe(2);
    expect(p.rows.find(r => r.exercise === 'Squat (Barbell)')).toMatchObject({ date: '2026-10-14', label: 'Gambe', weight: 120 });
  });
  it('pounds become kilograms', () => {
    const lb = parseHevy(table('hevy-lb.csv'));
    expect(lb.rows.map(r => [r.weight, r.reps, r.rir])).toEqual([[102.06, 5, 2], [142.88, 3, undefined]]);
    expect(lb.rows[0].date).toBe('2026-06-19');
  });
});

describe('Strong rows', () => {
  it('iOS: no unit in the file, so the caller says; rest timers skipped; F is a set at 0 RIR', () => {
    const p = parseStrong(table('strong-ios.csv'), 'kg');
    expect(p.rows.map(r => [r.exercise, r.set, r.weight, r.reps, r.kind, r.rir])).toEqual([
      ['Squat (Barbell)', 1, 95, 5, 'working', undefined],
      ['Squat (Barbell)', 2, 95, 5, 'working', 2],
      ['Bench Press (Barbell)', 1, 60, 8, 'working', undefined],
      ['Bench Press (Barbell)', 2, 60, 6, 'working', 0],
    ]);
    expect(p.rows[0]).toMatchObject({ date: '2026-10-20', label: 'Mix 1A', order: 1 });
    expect(p.skipped.map(s => s.reason)).toEqual(['rest timer']);
    expect(parseStrong(table('strong-ios.csv'), 'lb').rows[0].weight).toBe(43.09);
  });
  it('Android: unit from the header; W warm-up, D drop; rest timer and note rows skipped', () => {
    const p = parseStrong(table('strong-android.csv'), 'lb');
    expect(p.rows.map(r => [r.exercise, r.order, r.set, r.weight, r.reps, r.kind, r.rir])).toEqual([
      ['Romanian Deadlift (Barbell)', 1, 1, 20, 8, 'warmup', undefined],
      ['Romanian Deadlift (Barbell)', 1, 2, 35, 10, 'working', 2.5],
      ['Incline Bench Press (Dumbbell)', 2, 1, 22.5, 12, 'working', undefined],
      ['Incline Bench Press (Dumbbell)', 2, 2, 15, 10, 'drop', undefined],
    ]);
    expect(p.rows[0]).toMatchObject({ label: 'Full body, B', date: '2026-02-17', group: '201' });
    expect(p.skipped.map(s => s.reason)).toEqual(['rest timer', 'note']);
  });
  it('old Android: a unit per row and decimal commas', () => {
    const p = parseStrong(table('strong-android-old.csv'), 'kg');
    expect(p.rows.map(r => r.weight)).toEqual([12.5, 61.23]);
  });
});

describe('older exports', () => {
  it('numeric Hevy dates: day-first unless the file shows otherwise', () => {
    expect(parseHevyDateTime('03/12/2023 11:25')).toEqual({ date: '2023-12-03', time: '11:25' });
    expect(parseHevyDateTime('03/12/2023 11:25', 'mdy')).toEqual({ date: '2023-03-12', time: '11:25' });
    expect(parseHevyDateTime('12/31/2023, 9:05 PM', 'mdy')).toEqual({ date: '2023-12-31', time: '21:05' });
    const p = parseHevy(table('hevy-old.csv'));
    expect(p.rows.map(r => r.date)).toEqual(['2023-12-03', '2024-01-13']);
    const us = parseHevy(parseCsv('title,start_time,exercise_title,set_index,set_type,weight_kg,reps\nA,01/13/2024 10:00,Squat (Barbell),0,normal,100,5\nB,02/03/2024 10:00,Squat (Barbell),0,normal,100,5\n'));
    expect(us.rows.map(r => r.date)).toEqual(['2024-01-13', '2024-02-03']);
  });
  it('a 2018 Strong file: weight column named lbs, rows wrapped in quotes', () => {
    const t = parseTable(fixture('strong-2018.csv'));
    expect(unitOfStrong(t[0])).toBe('lb');
    expect(parseStrong(t, 'kg').rows.map(r => [r.exercise, r.weight, r.reps])).toEqual([['Squat', 6.8, 5], ['Squat', 7.94, 5]]);
  });
});

