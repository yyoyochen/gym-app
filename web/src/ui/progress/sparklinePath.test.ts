import { describe, expect, it } from 'vitest';
import { sparklinePath } from './sparklinePath';

describe('sparklinePath', () => {
  it('a step line through the values, newest point last', () => {
    expect(sparklinePath([1, 2, 3], 72, 22)).toEqual({ d: 'M2,19H36V11H70V3', last: { x: 70, y: 3 } });
  });
  it('all-equal values draw a flat line mid-height', () => {
    expect(sparklinePath([5, 5], 72, 22)).toEqual({ d: 'M2,11H70', last: { x: 70, y: 11 } });
  });
  it('fewer than two values draw nothing', () => {
    expect(sparklinePath([7], 72, 22)).toBeNull();
    expect(sparklinePath([], 72, 22)).toBeNull();
  });
  it('negative values (assisted lifts) scale like any range', () => {
    const p = sparklinePath([-20, -10], 72, 22)!;
    expect(p.d).toBe('M2,19H70V3');
    expect(p.last.y).toBe(3);
  });
});
