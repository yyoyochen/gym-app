import { describe, expect, it } from 'vitest';
import { loadText, sessionNames } from './text';

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

describe('sessionNames', () => {
  const DOT = '·';
  it('reads the colon form', () => {
    expect(sessionNames('A: Squat + Bench')).toEqual({ short: 'Session A', title: 'Session A, Squat + Bench' });
    expect(sessionNames('U1: Heavy bench')).toEqual({ short: 'Session U1', title: 'Session U1, Heavy bench' });
  });
  it('still reads stored names with the old dot', () => {
    expect(sessionNames(`A ${DOT} Squat + Bench`)).toEqual({ short: 'Session A', title: 'Session A, Squat + Bench' });
  });
  it('long keys keep their own short name', () => {
    expect(sessionNames('Upper 1: Heavy bench')).toEqual({ short: 'Upper 1', title: 'Upper 1: Heavy bench' });
    expect(sessionNames(`Upper 1 ${DOT} Heavy bench`)).toEqual({ short: 'Upper 1', title: `Upper 1 ${DOT} Heavy bench` });
  });
  it('plain names pass through', () => {
    expect(sessionNames('Full body')).toEqual({ short: 'Full body', title: 'Full body' });
  });
});
