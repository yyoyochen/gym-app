import { describe, expect, it } from 'vitest';
import { swipeMonths } from './historySwipe';

describe('swipeMonths: a sideways swipe on the Calendar list', () => {
  it('finger right brings in the previous month (it sits to the left)', () => {
    expect(swipeMonths(90, 10)).toBe(-1);
  });
  it('finger left brings in the next month', () => {
    expect(swipeMonths(-90, -5)).toBe(1);
  });
  it('a short or mostly vertical drag (a scroll) changes nothing', () => {
    expect(swipeMonths(40, 0)).toBe(0);
    expect(swipeMonths(90, 80)).toBe(0);
    expect(swipeMonths(0, 300)).toBe(0);
  });
});
