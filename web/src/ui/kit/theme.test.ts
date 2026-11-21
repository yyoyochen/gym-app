import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, THEME_PAPER, isThemePref, resolveTheme } from './theme';
import { confirmQuestion } from './ActionSheet';
import { repeatDelays } from './Controls';
import { ditherOn, DITHER_STEPS } from './PrMoment';

describe('theme resolution', () => {
  it('dark is the default', () => {
    expect(DEFAULT_THEME).toBe('dark');
    expect(resolveTheme(undefined, true)).toBe('dark');
    expect(resolveTheme('nonsense', true)).toBe('dark');
  });
  it('explicit choices ignore the OS; system follows it', () => {
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('system', true)).toBe('light');
    expect(resolveTheme('system', false)).toBe('dark');
  });
  it('theme-color is the paper colour', () => {
    expect(THEME_PAPER).toEqual({ dark: '#1c1724', light: '#fcd0af' });
    expect(isThemePref('system')).toBe(true);
    expect(isThemePref('auto')).toBe(false);
  });
});

describe('kit helpers', () => {
  it('turns legacy two-tap wording into a question', () => {
    expect(confirmQuestion('Tap again to wipe everything')).toBe('Wipe everything?');
    expect(confirmQuestion('Tap again to delete this set.')).toBe('Delete this set?');
    expect(confirmQuestion('Delete this set?')).toBe('Delete this set?');
  });
  it('stepper auto-repeat accelerates to a floor', () => {
    const d = repeatDelays(30);
    expect(d[0]).toBe(500);
    expect(d[1]).toBe(160);
    for (let i = 2; i < d.length; i++) expect(d[i]).toBeLessThanOrEqual(d[i - 1]);
    expect(d[d.length - 1]).toBe(60);
  });
  it('PR dither ends solid and blocks follow ordered-dither thresholds', () => {
    expect(DITHER_STEPS[DITHER_STEPS.length - 1]).toBe(0);
    expect(ditherOn(1, 0, 0)).toBe(true);
    expect(ditherOn(0, 0, 0)).toBe(false);
    // 50% coverage lights exactly half of a 4×4 Bayer tile
    let on = 0;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (ditherOn(0.5, x, y)) on++;
    expect(on).toBe(8);
  });
});
