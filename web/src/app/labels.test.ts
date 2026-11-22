import { describe, expect, it } from 'vitest';
import { feasibilityWord, formatLoad, isUnloaded } from './labels';

describe('feasibilityWord', () => {
  it('one scale for goal status on every screen', () => {
    expect(feasibilityWord('comfortable')).toBe('on pace');
    expect(feasibilityWord('ambitious')).toBe('behind');
    expect(feasibilityWord('unlikely')).toBe('unlikely');
  });
});

describe('formatLoad', () => {
  it('shows kg for a loaded lift', () => {
    expect(formatLoad(100)).toBe('100');
    expect(formatLoad(62.5, 0)).toBe('62.5');
  });
  it('shows an em dash for 0 kg on a lift that is not a bodyweight lift', () => {
    expect(formatLoad(0)).toBe('—');
    expect(formatLoad(0, 0)).toBe('—');
    expect(`${formatLoad(0, 0)} × 3`).toBe('— × 3');
  });
  it('shows BW forms for bodyweight lifts, including 0 added load', () => {
    expect(formatLoad(0, 1)).toBe('BW');
    expect(formatLoad(0, 0.65)).toBe('BW');
    expect(formatLoad(10, 1)).toBe('BW+10');
    expect(formatLoad(-15, 1)).toBe('BW−15');
  });
  it('isUnloaded is true only for 0 kg without a bodyweight factor', () => {
    expect(isUnloaded(0)).toBe(true);
    expect(isUnloaded(0, 0)).toBe(true);
    expect(isUnloaded(0, 1)).toBe(false);
    expect(isUnloaded(5, 0)).toBe(false);
  });
});
