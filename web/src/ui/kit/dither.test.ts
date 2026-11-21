import { describe, expect, it } from 'vitest';
import { ditherBar, ditherBarText, heatLevel, heatmapGrid, heatmapText } from './dither';
import { ICONS, iconRuns } from './icons';

describe('ditherBar', () => {
  it('solid run, ▓▒░ tail, dotted track — always exactly `cells` wide', () => {
    expect(ditherBarText(0.5, 10)).toBe('█████▓▒░··');
    expect(ditherBarText(2 / 3, 28)).toBe('██████████████████▓▒░·······');
    for (const v of [0, 0.01, 0.33, 0.5, 0.97, 1]) for (const n of [1, 3, 12, 28]) expect([...ditherBarText(v, n)]).toHaveLength(n);
  });

  it('0 is an empty track, 1 is all solid, values clamp', () => {
    expect(ditherBarText(0, 6)).toBe('······');
    expect(ditherBarText(-1, 6)).toBe('······');
    expect(ditherBarText(Number.NaN, 6)).toBe('······');
    expect(ditherBarText(1, 6)).toBe('██████');
    expect(ditherBarText(7, 6)).toBe('██████');
  });

  it('the tail is cut short near the end', () => {
    expect(ditherBar(0.9, 10)).toEqual({ solid: '█████████', tail: '▓', track: '' });
    expect(ditherBar(0.8, 10)).toEqual({ solid: '████████', tail: '▓▒', track: '' });
  });
});

describe('heatmap', () => {
  it('levels: fixed thresholds or quartiles of the max', () => {
    expect(heatLevel(0, 20)).toBe(-1);
    expect(heatLevel(12, 30, [13, 17, 24])).toBe(0);
    expect(heatLevel(16, 30, [13, 17, 24])).toBe(1);
    expect(heatLevel(23, 30, [13, 17, 24])).toBe(2);
    expect(heatLevel(29, 30, [13, 17, 24])).toBe(3);
    expect(heatLevel(1, 1)).toBe(3); // a map of sessions reads solid
    expect(heatLevel(5, 20)).toBe(0);
    expect(heatLevel(20, 20)).toBe(3);
  });

  it('lays weeks out Monday-first with Mon/Wed/Fri labels and blank future days', () => {
    // 2026-11-22 is a Sunday, so the last column is a full week.
    const g = heatmapGrid({ counts: { '2026-11-22': 20, '2026-11-16': 10, '2026-11-09': 15 }, weeks: 2, end: '2026-11-22' });
    expect(g.rows.map(r => r.label)).toEqual(['Mon', '', 'Wed', '', 'Fri', '', '']);
    expect(g.rows.map(r => r.day)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(g.rows[0].cells[0].date).toBe('2026-11-09');
    expect(g.rows[6].cells[1].date).toBe('2026-11-22');
    expect(g.rows[6].cells[1].isEnd).toBe(true);
    expect(heatmapText(g)).toBe([
      '    Nov',
      'Mon ▓▒',
      '    ··',
      'Wed ··',
      '    ··',
      'Fri ··',
      '    ··',
      '    ·█',
    ].join('\n'));
  });

  it('days after the end are blank; month labels never collide', () => {
    const g = heatmapGrid({ counts: { '2026-11-18': 3 }, weeks: 12, end: '2026-11-18' }); // Wednesday
    const text = heatmapText(g).split('\n');
    expect(text[3].endsWith('█')).toBe(true);  // Wed row ends on the logged day
    expect(text[4].endsWith(' ')).toBe(true);  // Thu is in the future
    expect(text[0]).toBe('     Sep Oct Nov');
    for (let i = 1; i < g.months.length; i++) expect(g.months[i].week).toBeGreaterThan(g.months[i - 1].week + 3);
  });

  it('week-target marks: met / part / none', () => {
    const counts: Record<string, number> = { '2026-11-16': 1, '2026-11-18': 1, '2026-11-20': 1, '2026-11-10': 1 };
    const g = heatmapGrid({ counts, weeks: 3, end: '2026-11-21', weekTarget: 3 });
    expect(g.weekMarks).toEqual(['none', 'part', 'met']);
    expect(heatmapText(g).split('\n').pop()).toBe('Wk  ·░█');
  });
});

describe('pixel icons', () => {
  it('every icon is 9 × 9 of # and .', () => {
    for (const [name, rows] of Object.entries(ICONS)) {
      expect(rows, name).toHaveLength(9);
      for (const r of rows) expect(r, name).toMatch(/^[#.]{9}$/);
      expect(rows.join('').includes('#'), name).toBe(true);
    }
  });

  it('chevron mirrors back; runs cover exactly the ink pixels', () => {
    expect(ICONS.chevron.map(r => [...r].reverse().join(''))).toEqual(ICONS.back);
    for (const rows of Object.values(ICONS)) {
      const ink = rows.join('').split('').filter(c => c === '#').length;
      expect(iconRuns(rows).reduce((n, r) => n + r.w, 0)).toBe(ink);
    }
  });
});
