import { describe, expect, it } from 'vitest';
import { segmentedChoice } from './Controls';

const opts = [{ value: '0', label: '0' }, { value: '1', label: '1' }, { value: '2', label: '2' }];

describe('segmentedChoice', () => {
  it('picks another segment', () => {
    expect(segmentedChoice(opts, 1, undefined)).toEqual({ change: true, value: '1' });
    expect(segmentedChoice(opts, 2, '1')).toEqual({ change: true, value: '2' });
    expect(segmentedChoice(opts, 2, '1', true)).toEqual({ change: true, value: '2' });
  });
  it('tapping the selected segment does nothing by default', () => {
    expect(segmentedChoice(opts, 1, '1')).toEqual({ change: false });
    expect(segmentedChoice(opts, 1, '1', false)).toEqual({ change: false });
  });
  it('with allowDeselect, tapping the selected segment clears it', () => {
    expect(segmentedChoice(opts, 1, '1', true)).toEqual({ change: true, value: undefined });
  });
  it('ignores an index outside the options', () => {
    expect(segmentedChoice(opts, 5, '1', true)).toEqual({ change: false });
  });
});
