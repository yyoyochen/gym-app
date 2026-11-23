import { describe, expect, it } from 'vitest';
import { appVersion, updateText } from './version';

describe('appVersion: the number people see', () => {
  it('a deploy is major.minor from package.json plus the deploy number', () => {
    expect(appVersion('0.1.0', '7')).toBe('0.1.7');
    expect(appVersion('1.2.9', '120')).toBe('1.2.120');
  });
  it('a local build without a deploy number is marked dev', () => {
    expect(appVersion('0.1.0')).toBe('0.1.0-dev');
    expect(appVersion('0.1.0', '')).toBe('0.1.0-dev');
    expect(appVersion('0.1.0', 'abc')).toBe('0.1.0-dev');
  });
});

describe('updateText: the banner wording', () => {
  it('names the new version and the one you have', () => {
    expect(updateText('0.1.8', '0.1.7')).toEqual({ title: 'Version 0.1.8 is ready', action: 'Tap to update (you have 0.1.7)' });
  });
  it('without the new number it still says a version is ready', () => {
    expect(updateText(null, '0.1.7')).toEqual({ title: 'A new version is ready', action: 'Tap to update (you have 0.1.7)' });
  });
});
