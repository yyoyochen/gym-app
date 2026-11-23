import { afterEach, describe, expect, it } from 'vitest';
import { applyLang } from './lang';
import { tn } from './t';
import { lastLineText } from '../app/coach';
import { sessionNames } from '../ui/session/text';

afterEach(() => applyLang('en'));

describe('tn only translates names the app made', () => {
  it('leaves a name the lifter typed as typed, even when it is a UI word', () => {
    applyLang('zh');
    expect(tn('Back')).toBe('Back');
    expect(tn('Top')).toBe('Top');
    expect(tn('Bench, then curls')).toBe('Bench, then curls');
    expect(tn('Pause squat (minimum)')).toBe('Pause squat (minimum)');
  });
  it('still translates built-in and generated names', () => {
    applyLang('zh');
    expect(tn('Back Squat')).not.toBe('Back Squat');
    expect(tn('Session C')).toBe('課表 C');
    expect(tn("Today's workout (minimum)")).toBe('今天的訓練（精簡版）');
  });
});

describe('last session line', () => {
  it('keeps a session name with commas whole', () => {
    applyLang('zh');
    const line = lastLineText('A: Squat, Bench, Row', '3 天前');
    expect(line).toContain('A：深蹲、臥推、划船');
    expect(line).not.toMatch(/Squat|Row|days/);
  });
  it('reads as before in English', () => {
    expect(lastLineText('A: Squat, Bench, Row', '3 days ago')).toBe('Last session: A: Squat, Bench, Row, 3 days ago');
  });
});

describe('a session name renamed in Chinese', () => {
  it('still splits at a full-width colon', () => {
    expect(sessionNames('A：深蹲 + 臥推x').short).toBe('Session A');
  });
});
