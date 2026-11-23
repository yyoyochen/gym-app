import { describe, expect, it } from 'vitest';
import { calendarLevels, canConfirm, clampDate, dayLabel, markerRects, monthGrid, moveDay, sameDayIn, tabbableDay } from './calendarModel';

const flat = (g: ReturnType<typeof monthGrid>) => g.flat();
const find = (g: ReturnType<typeof monthGrid>, iso: string) => flat(g).find(d => d.iso === iso)!;

describe('monthGrid', () => {
  const g = monthGrid(2026, 11, { today: '2026-11-22', selected: '2026-11-19', max: '2026-11-22', levels: new Map([['2026-11-19', 2 as const]]) });

  it('six Monday-first weeks, padded with the neighbouring months', () => {
    expect(g).toHaveLength(6);
    for (const w of g) expect(w).toHaveLength(7);
    expect(g[0][0]).toMatchObject({ iso: '2026-10-26', inMonth: false });
    expect(g[0][6]).toMatchObject({ iso: '2026-11-01', inMonth: true });
    expect(g[5][6].iso).toBe('2026-12-06');
  });

  it('marks selected, trained, today and disabled days', () => {
    expect(find(g, '2026-11-19')).toMatchObject({ selected: true, level: 2, disabled: false, today: false });
    expect(find(g, '2026-11-22')).toMatchObject({ today: true, disabled: false });
    expect(find(g, '2026-11-23').disabled).toBe(true);
    expect(find(g, '2026-11-18').level).toBeNull();
  });

  it('min disables earlier days only', () => {
    const m = monthGrid(2026, 11, { today: '2026-11-22', min: '2026-11-10' });
    expect(find(m, '2026-11-09').disabled).toBe(true);
    expect(find(m, '2026-11-10').disabled).toBe(false);
  });

  it('February: leap and common years', () => {
    expect(find(monthGrid(2028, 2, { today: '2028-02-01' }), '2028-02-29').inMonth).toBe(true);
    expect(find(monthGrid(2027, 2, { today: '2027-02-01' }), '2027-03-01').inMonth).toBe(false);
  });
});

describe('moveDay', () => {
  it('arrows move by a day or a week', () => {
    expect(moveDay('2026-11-19', 'ArrowLeft')).toBe('2026-11-18');
    expect(moveDay('2026-11-19', 'ArrowRight')).toBe('2026-11-20');
    expect(moveDay('2026-11-19', 'ArrowUp')).toBe('2026-11-12');
    expect(moveDay('2026-11-19', 'ArrowDown')).toBe('2026-11-26');
  });
  it('Page keys move a month and clamp to the month end', () => {
    expect(moveDay('2026-01-31', 'PageDown')).toBe('2026-02-28');
    expect(moveDay('2026-03-31', 'PageUp')).toBe('2026-02-28');
    expect(moveDay('2026-12-15', 'PageDown')).toBe('2027-01-15');
  });
  it('Home and End go to the Monday and Sunday of the week', () => {
    expect(moveDay('2026-11-19', 'Home')).toBe('2026-11-16');
    expect(moveDay('2026-11-19', 'End')).toBe('2026-11-22');
  });
});

describe('dayLabel', () => {
  it('reads the full date, and says when you trained and how much', () => {
    expect(dayLabel('2026-11-19', 2)).toBe('Thursday 19 November 2026, trained, heavy day');
    expect(dayLabel('2026-11-19', 1)).toBe('Thursday 19 November 2026, trained, moderate day');
    expect(dayLabel('2026-11-19', 0)).toBe('Thursday 19 November 2026, trained, light day');
    expect(dayLabel('2026-11-19', null)).toBe('Thursday 19 November 2026');
  });
});

describe('canConfirm', () => {
  it('needs a day inside the range; with requireChange also a different day', () => {
    expect(canConfirm({ sel: '2026-11-17', value: '2026-11-19', max: '2026-11-22', requireChange: true })).toBe(true);
    expect(canConfirm({ sel: '2026-11-19', value: '2026-11-19', max: '2026-11-22', requireChange: true })).toBe(false);
    expect(canConfirm({ sel: '2026-11-19', value: '2026-11-19', max: '2026-11-22' })).toBe(true);
    expect(canConfirm({ sel: '', value: '', max: '2026-11-22' })).toBe(false);
    expect(canConfirm({ sel: '2026-11-25', value: '', max: '2026-11-22' })).toBe(false);
  });
});

describe('clampDate', () => {
  it('pulls a date into [min, max]', () => {
    expect(clampDate('2026-12-30', undefined, '2026-11-22')).toBe('2026-11-22');
    expect(clampDate('2026-01-01', '2026-11-10', '2026-11-22')).toBe('2026-11-10');
    expect(clampDate('2026-11-15', '2026-11-10', '2026-11-22')).toBe('2026-11-15');
  });
});

describe('tabbableDay (the one grid cell that takes Tab)', () => {
  const g = monthGrid(2026, 11, { today: '2026-11-22', max: '2026-11-22' });
  it('the focused day when it is shown and enabled', () => {
    expect(tabbableDay(g, '2026-11-19')).toBe('2026-11-19');
  });
  it('otherwise the first enabled day of the month shown (focus left the month, or sits on a disabled day)', () => {
    expect(tabbableDay(g, '2026-10-05')).toBe('2026-11-01');
    expect(tabbableDay(g, '2026-11-25')).toBe('2026-11-01');
  });
  it('a month with no enabled day has none', () => {
    const none = monthGrid(2026, 12, { today: '2026-11-22', max: '2026-11-22' });
    expect(tabbableDay(none, '2026-12-05')).toBeNull();
  });
});

describe('calendarLevels', () => {
  it('three steps, in thirds of the busiest day', () => {
    const l = calendarLevels(new Map([['2026-11-01', 4], ['2026-11-02', 12], ['2026-11-03', 20]]));
    expect([...l.entries()]).toEqual([['2026-11-01', 0], ['2026-11-02', 1], ['2026-11-03', 2]]);
  });
  it('a session with no sets is still marked, as light', () => {
    expect(calendarLevels(new Map([['2026-11-01', 0], ['2026-11-02', 10]])).get('2026-11-01')).toBe(0);
  });
  it('a single trained day is the heaviest; nothing logged is nothing', () => {
    expect(calendarLevels(new Map([['2026-11-01', 6]])).get('2026-11-01')).toBe(2);
    expect(calendarLevels(new Map()).size).toBe(0);
  });
});

describe('markerRects', () => {
  it('light is three dots, moderate a checker, heavy a solid strip, on a 24 x 8 box', () => {
    expect(markerRects(0)).toEqual([{ x: 0, y: 0, w: 4, h: 4 }, { x: 8, y: 0, w: 4, h: 4 }, { x: 16, y: 0, w: 4, h: 4 }]);
    expect(markerRects(1)).toHaveLength(6);
    expect(markerRects(1)[3]).toEqual({ x: 4, y: 4, w: 4, h: 4 });
    expect(markerRects(2)).toEqual([{ x: 0, y: 0, w: 24, h: 8 }]);
  });
});

describe('sameDayIn: the focused day after a jump of several months', () => {
  it('keeps the day number, clamped to the shorter month', () => {
    expect(sameDayIn('2026-01-31', 1)).toBe('2026-02-28');
    expect(sameDayIn('2026-03-15', -14)).toBe('2025-01-15');
    expect(sameDayIn('2026-11-30', 13)).toBe('2027-12-30');
  });
});
