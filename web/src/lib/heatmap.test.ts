import { describe, expect, it } from 'vitest';
import {
  addDaysIso,
  bucketFor,
  buildHeatmap,
  computeMonthLabels,
  epochDaysToIso,
  isoToEpochDays,
  localIsoOf,
  quartileThresholds,
  weekdayOf,
  mondayIndex,
} from './heatmap';

describe('date math (pure string/UTC — no TZ shift)', () => {
  it('round-trips ISO strings through epoch days for every kind of date', () => {
    const dates = [
      '1970-01-01',
      '1999-12-31',
      '2024-02-29', // leap day
      '2026-01-01',
      '2026-08-02',
      '2026-12-31',
    ];
    for (const d of dates) {
      expect(epochDaysToIso(isoToEpochDays(d))).toBe(d);
    }
    expect(isoToEpochDays('1970-01-02')).toBe(1);
  });

  it('computes weekdays without Date-string parsing', () => {
    expect(weekdayOf('1970-01-01')).toBe(4); // Thursday
    expect(weekdayOf('2026-08-01')).toBe(6); // Saturday
    expect(weekdayOf('2026-08-02')).toBe(0); // Sunday
  });

  it('adds days across month and leap boundaries', () => {
    expect(addDaysIso('2026-02-28', 1)).toBe('2026-03-01'); // non-leap
    expect(addDaysIso('2024-02-28', 1)).toBe('2024-02-29'); // leap
    expect(addDaysIso('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDaysIso('2026-08-02', -91)).toBe('2026-05-03');
  });

  it('localIsoOf renders a local Date as its local calendar day', () => {
    // Constructed with local components, so this holds in every timezone.
    expect(localIsoOf(new Date(2026, 7, 2, 23, 59))).toBe('2026-08-02');
    expect(localIsoOf(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
  });
});

describe('intensity buckets', () => {
  it('cuts quartiles over nonzero counts only', () => {
    expect(quartileThresholds([12, 3, 9, 6, 0, 0])).toEqual([3, 6, 9]);
    expect(quartileThresholds([0, 0])).toEqual([0, 0, 0]);
  });

  it('maps edges: 0 sets → 0, min nonzero → 1, max → 4', () => {
    const t = quartileThresholds([3, 6, 9, 12]);
    expect(bucketFor(0, t)).toBe(0);
    expect(bucketFor(3, t)).toBe(1); // min nonzero
    expect(bucketFor(6, t)).toBe(2);
    expect(bucketFor(9, t)).toBe(3);
    expect(bucketFor(12, t)).toBe(4); // max
    expect(bucketFor(40, t)).toBe(4); // anything past q3 saturates
  });

  it('a single trained day lands in bucket 1, never 0', () => {
    const t = quartileThresholds([15]);
    expect(bucketFor(15, t)).toBe(1);
  });
});

describe('buildHeatmap grid alignment', () => {
  // 92-day window ending Sunday 2026-08-02 ⇒ starts Sunday 2026-05-03:
  // column 0 is padded back to Monday 2026-04-27 ⇒ 14 columns, the last full.
  const grid = buildHeatmap('2026-08-02', 92, {
    '2026-05-03': 3,
    '2026-06-10': 6,
    '2026-07-15': 9,
    '2026-08-02': 12,
    '2026-04-30': 99, // before the window — must not affect thresholds
  });

  it('produces Mon-start columns covering exactly the window', () => {
    expect(grid.start).toBe('2026-05-03');
    expect(grid.end).toBe('2026-08-02');
    expect(grid.columns).toHaveLength(14);
    for (const col of grid.columns) expect(col).toHaveLength(7);
    // Padding cells before the start are out of window.
    expect(grid.columns[0][0].date).toBe('2026-04-27');
    expect(grid.columns[0][0].inWindow).toBe(false);
    expect(grid.columns[0][6].date).toBe('2026-05-03');
    expect(grid.columns[0][6].inWindow).toBe(true);
    expect(grid.columns[13][6].date).toBe('2026-08-02');
    expect(grid.columns[13][6].inWindow).toBe(true);
    // Every cell sits in the row matching its weekday (Mon = 0).
    for (const col of grid.columns) {
      col.forEach((cell, row) => expect(mondayIndex(cell.date)).toBe(row));
    }
  });

  it('ignores counts outside the window when bucketing', () => {
    expect(grid.thresholds).toEqual([3, 6, 9]);
    const cell = (date: string) =>
      grid.columns.flat().find((c) => c.date === date)!;
    expect(cell('2026-05-03').bucket).toBe(1);
    expect(cell('2026-06-10').bucket).toBe(2);
    expect(cell('2026-07-15').bucket).toBe(3);
    expect(cell('2026-08-02').bucket).toBe(4);
    expect(cell('2026-05-04').bucket).toBe(0); // untrained day
  });

  it('labels columns where the month of the first day changes', () => {
    // Column first days: Apr 27 · May 4,11,18,25 · Jun 1,8,15,22,29 · Jul 6,13,20,27.
    // Apr (col 0) sits next to May (col 1), so it is dropped.
    expect(grid.monthLabels).toEqual([
      { col: 1, label: 'May' },
      { col: 5, label: 'Jun' },
      { col: 10, label: 'Jul' },
    ]);
  });

  it('drops the column-0 label when the month turns in column 1', () => {
    // end 2026-07-12 (Sun), 14 days ⇒ start Monday 2026-06-29; columns start
    // Jun 29 and Jul 6 ⇒ 'Jun' at col 0 collides with 'Jul' at col 1.
    const tight = buildHeatmap('2026-07-12', 14, {});
    expect(tight.columns[0][0].date).toBe('2026-06-29');
    expect(tight.columns[1][0].date).toBe('2026-07-06');
    expect(tight.monthLabels).toEqual([{ col: 1, label: 'Jul' }]);
    // And the helper alone behaves the same way.
    expect(computeMonthLabels(tight.columns)).toEqual([{ col: 1, label: 'Jul' }]);
  });

  it('marks today (the window end) as a normal in-window cell for outlining', () => {
    const todayCell = grid.columns[13][6];
    expect(todayCell.date).toBe('2026-08-02');
    expect(todayCell.inWindow).toBe(true);
  });
});
