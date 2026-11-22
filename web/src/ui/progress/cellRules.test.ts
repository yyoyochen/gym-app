import { describe, expect, it } from 'vitest';
import { anyDecimals, cellWeight, classifySets, setCountsText } from './cellRules';

const work = (...ws: number[]) => ws.map(weight => ({ weight, kind: 'working' }));

describe('classifySets', () => {
  it('sets before the top and under 80% of it are the ramp', () => {
    expect(classifySets(work(60, 80, 100, 120, 130, 100))).toEqual(['ramp', 'ramp', 'ramp', 'work', 'top', 'work']);
  });
  it('one set is the top', () => {
    expect(classifySets(work(100))).toEqual(['top']);
  });
  it('the first set at the heaviest weight is the top', () => {
    expect(classifySets(work(100, 100, 100))).toEqual(['top', 'work', 'work']);
    expect(classifySets(work(100, 120, 120))).toEqual(['work', 'top', 'work']);
  });
  it('exactly 80% is work, not ramp', () => {
    expect(classifySets(work(80, 100))).toEqual(['work', 'top']);
  });
  it('bodyweight sets at 0 kg have no ramp', () => {
    expect(classifySets(work(0, 0))).toEqual(['top', 'work']);
  });
  it('bodyweight lifts get no ramp, since the load excludes the body', () => {
    expect(classifySets(work(0, 5, 10, 20), 1)).toEqual(['work', 'work', 'work', 'top']);
    expect(classifySets(work(-25, -20), 1)).toEqual(['work', 'top']);
  });
  it('a logged warm-up is always ramp', () => {
    expect(classifySets([{ weight: 20, kind: 'warmup' }, { weight: 100, kind: 'working' }])).toEqual(['ramp', 'top']);
  });
});

describe('setCountsText', () => {
  it('counts work and ramp sets with the same rule as the cells', () => {
    expect(setCountsText(work(60, 90, 110, 130, 145, 150), 0)).toBe('3 working, 3 ramp');
    expect(setCountsText(work(100, 100, 100), 0)).toBe('3 working');
    expect(setCountsText(work(0, 0, 0, 0), 1)).toBe('4 working');
    expect(setCountsText([{ weight: 20, kind: 'warmup' }, { weight: 100, kind: 'working' }], 0)).toBe('1 working, 1 ramp');
  });
});

describe('cellWeight', () => {
  it('splits whole and decimal parts', () => {
    expect(cellWeight(100, 0)).toEqual({ int: '100', dec: '' });
    expect(cellWeight(82.5, 0)).toEqual({ int: '82', dec: '.5' });
    expect(cellWeight(102.5, 0)).toEqual({ int: '102', dec: '.5' });
  });
  it('bodyweight lifts show BW or the added load', () => {
    expect(cellWeight(0, 1)).toEqual({ int: 'BW', dec: '' });
    expect(cellWeight(10, 1)).toEqual({ int: '+10', dec: '' });
    expect(cellWeight(7.5, 1)).toEqual({ int: '+7', dec: '.5' });
  });
  it('assisted sets (negative load) keep their minus sign', () => {
    expect(cellWeight(-20, 1)).toEqual({ int: '-20', dec: '' });
  });
});

describe('anyDecimals', () => {
  it('is true when any weight has a fraction', () => {
    expect(anyDecimals([{ weight: 100 }, { weight: 82.5 }])).toBe(true);
    expect(anyDecimals([{ weight: 100 }])).toBe(false);
  });
});
