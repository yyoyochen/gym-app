import { describe, expect, it } from 'vitest';
import { monthInRange, clampMonth } from './monthYear';

const min = { year: 2026, month: 3 }, max = { year: 2027, month: 12 };

describe('month/year picker range', () => {
  it('a month inside the range is pickable, either end included', () => {
    expect(monthInRange(2026, 3, min, max)).toBe(true);
    expect(monthInRange(2027, 12, min, max)).toBe(true);
    expect(monthInRange(2026, 11, min, max)).toBe(true);
  });
  it('a month before min or after max is not', () => {
    expect(monthInRange(2026, 2, min, max)).toBe(false);
    expect(monthInRange(2028, 1, min, max)).toBe(false);
  });
  it('no bounds means every month', () => {
    expect(monthInRange(1990, 1)).toBe(true);
  });
  it('clamps a month into the range', () => {
    expect(clampMonth({ year: 2025, month: 6 }, min, max)).toEqual(min);
    expect(clampMonth({ year: 2030, month: 6 }, min, max)).toEqual(max);
    expect(clampMonth({ year: 2026, month: 8 }, min, max)).toEqual({ year: 2026, month: 8 });
  });
});
