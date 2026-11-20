import { describe, expect, it } from 'vitest';
import { consistency, markFor, summaryLine, weekStart, yearSummary } from './consistency';

describe('consistency', () => {
  it('weeks start on Sunday, matching the heatmap columns', () => {
    expect(weekStart('2026-11-21')).toBe('2026-11-15'); // Sat → Sun before
    expect(weekStart('2026-11-15')).toBe('2026-11-15');
  });
  it('week marks: full at target, half at min, none below', () => {
    expect([markFor(3, 3, 2), markFor(2, 3, 2), markFor(1, 3, 2), markFor(0, 3, 0)]).toEqual(['full', 'half', 'none', 'none']);
  });
  it('cells count working sets only; skips without a session are outlined; this-week count', () => {
    const sessions = [{ id: 'a', date: '2026-11-16', startedAt: 1 }, { id: 'b', date: '2026-11-18', startedAt: 2 }, { id: 'c', date: '2026-11-10', startedAt: 0 }];
    const sets = [
      { date: '2026-11-16', kind: 'warmup', sessionId: 'a' }, { date: '2026-11-16', kind: 'top', sessionId: 'a' },
      { date: '2026-11-16', kind: 'backoff', sessionId: 'a' }, { date: '2026-11-18', kind: 'working', sessionId: 'b' },
    ];
    const c = consistency({ sets, sessions, skipDates: ['2026-11-20', '2026-11-18'], today: '2026-11-21', weeks: 12, target: 3, min: 2 });
    const cell = (d: string) => c.grid.columns.flat().find(x => x.date === d)!;
    expect(cell('2026-11-16').count).toBe(2);
    expect(cell('2026-11-18').count).toBe(1);
    expect([...c.skipDates]).toEqual(['2026-11-20']);
    expect(c.thisWeek).toBe(2);
    expect(c.weekMarks[c.weekMarks.length - 1]).toBe('half');
    expect(c.weekMarks[c.weekMarks.length - 2]).toBe('none');
    expect(c.sessionByDate['2026-11-16']).toBe('a');
  });
  it('year summary counts finished weeks and the current week only once it is at target', () => {
    const sessions = ['2026-01-05', '2026-01-07', '2026-01-09', '2026-01-12', '2026-01-14', '2026-01-16', '2026-01-20']
      .map(date => ({ date }));
    const s = yearSummary(sessions, '2026-01-21', 3);
    // Weeks from Sun 28 Dec: (0), 4 Jan (3), 11 Jan (3); 18 Jan is current with 1 → not counted.
    expect(s).toEqual({ sessions: 7, weeksAtTarget: 2, weeks: 3, longestRun: 2 });
    expect(summaryLine(s)).toBe('This year: 7 sessions · 2 of 3 weeks at target · longest run 2 weeks');
  });
});
