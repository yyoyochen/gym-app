import { describe, expect, it } from 'vitest';
import { dropIndex, moveTo, pressOutcome, shiftFor } from './reorder';

const h = [60, 60, 60, 60]; // four rows, 60 px each

describe('dropIndex: where a dragged row lands', () => {
  it('stays put until it passes half of the next row', () => {
    expect(dropIndex(1, 0, h)).toBe(1);
    expect(dropIndex(1, 29, h)).toBe(1);
    expect(dropIndex(1, 31, h)).toBe(2);
    expect(dropIndex(1, -31, h)).toBe(0);
  });
  it('moves several rows on a long drag and stops at either end', () => {
    expect(dropIndex(0, 95, h)).toBe(2);
    expect(dropIndex(0, 999, h)).toBe(3);
    expect(dropIndex(3, -999, h)).toBe(0);
  });
  it('rows of different heights use their own halves', () => {
    expect(dropIndex(0, 50, [40, 120, 40])).toBe(0);
    expect(dropIndex(0, 61, [40, 120, 40])).toBe(1);
  });
});

describe('shiftFor: how the other rows make room', () => {
  it('rows between the old and new spot slide by the dragged row height', () => {
    expect(shiftFor(2, 0, 2, 60)).toBe(-60);
    expect(shiftFor(1, 0, 2, 60)).toBe(-60);
    expect(shiftFor(3, 0, 2, 60)).toBe(0);
    expect(shiftFor(0, 3, 1, 60)).toBe(0);
    expect(shiftFor(1, 3, 1, 60)).toBe(60);
    expect(shiftFor(2, 3, 1, 60)).toBe(60);
  });
});

describe('moveTo', () => {
  it('moves one item and keeps the rest in order', () => {
    expect(moveTo(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveTo(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
    expect(moveTo(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });
});

describe('pressOutcome: hold to lift a row, move to scroll', () => {
  it('a still hold of 400 ms lifts the row', () => {
    expect(pressOutcome(400, 3)).toBe('lift');
    expect(pressOutcome(399, 0)).toBe('wait');
  });
  it('moving 8 px or more before then is a scroll, never a drag', () => {
    expect(pressOutcome(120, 8)).toBe('scroll');
    expect(pressOutcome(500, 12)).toBe('scroll');
  });
});
