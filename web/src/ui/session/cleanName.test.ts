import { describe, expect, it } from 'vitest';
import { cleanSessionName } from './cleanName';

describe('cleanSessionName', () => {
  it('trims and collapses spaces', () => {
    expect(cleanSessionName('  Pull day  ')).toBe('Pull day');
    expect(cleanSessionName('A   B')).toBe('A B');
  });
  it('empty is not a name', () => {
    expect(cleanSessionName('')).toBeNull();
    expect(cleanSessionName('   ')).toBeNull();
  });
  it('at most 40 characters', () => {
    expect(cleanSessionName('x'.repeat(40))).toBe('x'.repeat(40));
    expect(cleanSessionName('x'.repeat(41))).toBeNull();
  });
});
