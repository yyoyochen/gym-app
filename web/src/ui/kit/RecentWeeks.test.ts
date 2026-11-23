import { describe, expect, it } from 'vitest';
import { heatmapGrid } from './dither';
import { recentWeeks } from './RecentWeeks';

const counts = { '2026-10-27': 12, '2026-11-04': 6, '2026-11-16': 20, '2026-11-23': 3 };
const grid = (end: string) => heatmapGrid({ counts, weeks: 52, end, weekTarget: 3 });

describe('recentWeeks', () => {
  it('takes the last 4 weeks, oldest first, Monday to Sunday', () => {
    const r = recentWeeks(grid('2026-11-22'));
    expect(r.days).toHaveLength(4);
    expect(r.days[0][0].date).toBe('2026-10-26');
    expect(r.days[3][0].date).toBe('2026-11-16');
    expect(r.days[3][6].date).toBe('2026-11-22');
    expect(r.marks).toHaveLength(4);
  });
  it('a Sunday today fills the row', () => {
    expect(recentWeeks(grid('2026-11-22')).days[3].every(c => !c.future)).toBe(true);
  });
  it('a Monday today leaves six future days blank', () => {
    const last = recentWeeks(grid('2026-11-23')).days[3];
    expect(last[0].isEnd).toBe(true);
    expect(last.filter(c => c.future)).toHaveLength(6);
  });
  it('levels equal the 52-week grid for the same date', () => {
    const g = grid('2026-11-22');
    const byDate = new Map(g.rows.flatMap(r => r.cells).map(c => [c.date, c.level]));
    for (const c of recentWeeks(g).days.flat()) expect(c.level).toBe(byDate.get(c.date));
  });
  it('counts trained days per week, for the "2/3" next to each row', () => {
    const r = recentWeeks(grid('2026-11-22'));
    expect(r.trained).toEqual([1, 1, 0, 1]);
  });
});
