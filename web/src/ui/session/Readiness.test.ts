import { describe, expect, it } from 'vitest';
import { readinessOptions } from './Readiness';

describe('readinessOptions', () => {
  it('sleep reads Good / OK / Poor; soreness and stress read Low / Some / High, best to worst', () => {
    expect(readinessOptions('sleep').map(o => o.label)).toEqual(['Good', 'OK', 'Poor']);
    expect(readinessOptions('soreness').map(o => o.label)).toEqual(['Low', 'Some', 'High']);
    expect(readinessOptions('stress').map(o => o.label)).toEqual(['Low', 'Some', 'High']);
  });
  it('the stored answers stay good / ok / poor', () => {
    for (const k of ['sleep', 'soreness', 'stress'] as const) expect(readinessOptions(k).map(o => o.value)).toEqual(['good', 'ok', 'poor']);
  });
});
