import { describe, it, expect } from 'vitest';
import { readable } from './readable';

describe('readable', () => {
  it('drops Python list brackets', () => expect(readable('Match or beat 16 total reps at 60kg (last time: [8, 8]).')).toBe('Match or beat 16 total reps at 60kg (last time: 8, 8).'));
  it('uses × between numbers', () => expect(readable('top 100kg x 2 within the floor')).toBe('top 100kg × 2 within the floor'));
  it('reads 0 kg as bodyweight', () => expect(readable('Match or beat 32 total reps at 0kg (last time: [8, 8, 8, 8]).')).toBe('Match or beat 32 total reps at bodyweight (last time: 8, 8, 8, 8).'));
  it('baseline sentence without 0 kg', () => expect(readable('Log your sets at 0kg — this session sets the baseline.')).toBe('Log your sets — this session sets the baseline.'));
  it('keeps a 0 kg jump cap as 0 kg', () => expect(readable('after a layoff jumps are capped at 0kg (5% or one increment)')).toBe('after a layoff jumps are capped at 0kg (5% or one increment)'));
  it('leaves normal text alone', () => expect(readable('Top double at 77.5kg (≥ 2 RIR), then 3 × 8+ at 57.5kg.')).toBe('Top double at 77.5kg (≥ 2 RIR), then 3 × 8+ at 57.5kg.'));
});
