import { describe, expect, it } from 'vitest';
import { kindAfterWarmupToggle } from './setKind';

describe('kindAfterWarmupToggle', () => {
  it('turning warm-up on makes any set a warm-up', () => {
    expect(kindAfterWarmupToggle('working', true)).toBe('warmup');
    expect(kindAfterWarmupToggle('top', true)).toBe('warmup');
    expect(kindAfterWarmupToggle('backoff', true)).toBe('warmup');
  });
  it('turning it off restores the original kind', () => {
    expect(kindAfterWarmupToggle('top', false)).toBe('top');
    expect(kindAfterWarmupToggle('backoff', false)).toBe('backoff');
    expect(kindAfterWarmupToggle('drop', false)).toBe('drop');
    expect(kindAfterWarmupToggle('working', false)).toBe('working');
  });
  it('a set that was a warm-up turns into a working set when turned off', () => {
    expect(kindAfterWarmupToggle('warmup', false)).toBe('working');
  });
});
