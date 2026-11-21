import { describe, expect, it } from 'vitest';
import { loadText } from './text';

describe('loadText (logger rows and hero)', () => {
  it('reads "—" for 0 kg on a lift that is not a bodyweight lift', () => {
    expect(loadText(0, 0)).toBe('—');
  });
  it('reads "BW" for 0 added load on a bodyweight lift', () => {
    expect(loadText(0, 1)).toBe('BW');
  });
  it('trims trailing zeros otherwise', () => {
    expect(loadText(100, 0)).toBe('100');
    expect(loadText(62.5, 0)).toBe('62.5');
    expect(loadText(10, 1)).toBe('10');
  });
});
