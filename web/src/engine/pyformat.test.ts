import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, fromEpochDay, isoWeek, isoWeekKey, toEpochDay } from './dates';
import { pyFixed, pyG, pyList, pyRound } from './pyformat';

describe('pyFixed', () => {
  it('rounds exact ties to even like Python', () => {
    expect(pyFixed(100.25, 1)).toBe('100.2');
    expect(pyFixed(100.75, 1)).toBe('100.8');
    expect(pyFixed(0.125, 2)).toBe('0.12');
    expect(pyFixed(2.5, 0)).toBe('2');
    expect(pyFixed(3.5, 0)).toBe('4');
    expect(pyFixed(-100.25, 1)).toBe('-100.2');
  });
  it('rounds non-ties normally', () => {
    expect(pyFixed(0.05, 1)).toBe('0.1'); // 0.05 is slightly above 0.05 in binary
    expect(pyFixed(177.33, 1)).toBe('177.3');
    expect(pyFixed(93.00000000000001, 0)).toBe('93');
  });
});

describe('pyG', () => {
  it('drops trailing zeros and keeps six significant digits', () => {
    expect(pyG(100)).toBe('100');
    expect(pyG(102.5)).toBe('102.5');
    expect(pyG(0)).toBe('0');
    expect(pyG(1.25)).toBe('1.25');
    expect(pyG(106.66666666666667)).toBe('106.667');
    expect(pyG(-2.5)).toBe('-2.5');
  });
  it('switches to exponent form outside 1e-4..1e6', () => {
    expect(pyG(1e6)).toBe('1e+06');
    expect(pyG(0.00001)).toBe('1e-05');
    expect(pyG(999999.5)).toBe('1e+06');
  });
});

describe('pyList / pyRound', () => {
  it('formats int lists like Python repr', () => {
    expect(pyList([8, 8, 7])).toBe('[8, 8, 7]');
    expect(pyList([])).toBe('[]');
  });
  it('rounds half to even', () => {
    expect(pyRound(10250.5)).toBe(10250);
    expect(pyRound(10251.5)).toBe(10252);
    expect(pyRound(1.4)).toBe(1);
    expect(pyRound(-0.5) === 0).toBe(true);
  });
});

describe('dates', () => {
  it('round-trips epoch days', () => {
    expect(toEpochDay('1970-01-02')).toBe(1);
    expect(fromEpochDay(toEpochDay('2026-11-21'))).toBe('2026-11-21');
  });
  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-11-01', '2026-11-21')).toBe(20);
  });
  it('computes ISO weeks like Python isocalendar', () => {
    expect(isoWeek('2026-01-01')).toEqual([2026, 1]); // Thursday
    expect(isoWeek('2027-01-01')).toEqual([2026, 53]); // Friday of the last week of 2026
    expect(isoWeek('2024-12-30')).toEqual([2025, 1]);
    expect(isoWeekKey('2026-11-21')).toBe('2026-W47');
  });
});
