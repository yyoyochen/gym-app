import { describe, expect, it } from 'vitest';
import { canConfirm, clampDate, dayLabel, monthGrid, moveDay, tabbableDay } from './calendarModel';

const flat = (g: ReturnType<typeof monthGrid>) => g.flat();
const find = (g: ReturnType<typeof monthGrid>, iso: string) => flat(g).find(d => d.iso === iso)!;

describe('monthGrid', () => {
  const g = monthGrid(2026, 11, { today: '2026-11-22', selected: '2026-11-19', max: '2026-11-22', marked: new Set(['2026-11-19']) });

  it('six Monday-first weeks, padded with the neighbouring months', () => {
    expect(g).toHaveLength(6);
    for (const w of g) expect(w).toHaveLength(7);
    expect(g[0][0]).toMatchObject({ iso: '2026-10-26', inMonth: false });
    expect(g[0][6]).toMatchObject({ iso: '2026-11-01', inMonth: true });
    expect(g[5][6].iso).toBe('2026-12-06');
  });

  it('marks selected, trained, today and disabled days', () => {
    expect(find(g, '2026-11-19')).toMatchObject({ selected: true, marked: true, disabled: false, today: false });
    expect(find(g, '2026-11-22')).toMatchObject({ today: true, disabled: false });
    expect(find(g, '2026-11-23').disabled).toBe(true);
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
  it('reads the full date, and says when you trained', () => {
    expect(dayLabel('2026-11-19', true)).toBe('Thursday 19 November 2026, trained');
    expect(dayLabel('2026-11-19', false)).toBe('Thursday 19 November 2026');
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
