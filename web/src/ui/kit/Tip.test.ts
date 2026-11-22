import { describe, expect, it } from 'vitest';
import { tipFooter } from './Tip';

describe('tip', () => {
  it('tip footer counts out of six', () => { expect(tipFooter(3, 6)).toBe('3 of 6'); });
});
