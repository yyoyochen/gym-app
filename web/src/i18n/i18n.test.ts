import { afterEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { applyLang, langFromLocale } from './lang';
import { fill, t, tn } from './t';
import { tr } from './tr';
import { compileTable, translateWith } from './engine';
import { dayInitials, formatDate, monthLabel } from '../app/dates';
import { createElement } from 'react';

afterEach(() => applyLang('en'));

describe('fill', () => {
  it('puts values into placeholders and leaves unknown ones', () => {
    expect(fill('{n} sets at {w}kg', { n: 3, w: 100 })).toBe('3 sets at 100kg');
    expect(fill('{n} of {m}', { n: 1 })).toBe('1 of {m}');
  });
});

describe('t', () => {
  it('returns the English in English', () => {
    expect(t('Start workout')).toBe('Start workout');
  });
  it('returns the Chinese in Chinese', () => {
    applyLang('zh');
    expect(t('Start workout')).toBe('開始訓練');
    expect(t('Language')).toBe('語言');
  });
  it('falls back to the English when a key has no Chinese', () => {
    applyLang('zh');
    expect(t('A sentence nobody translated')).toBe('A sentence nobody translated');
  });
});

describe('tn', () => {
  it('leaves a name it does not know as typed', () => {
    applyLang('zh');
    expect(tn('My weird cable thing')).toBe('My weird cable thing');
    expect(tn('我的動作')).toBe('我的動作');
  });
});

describe('stored session names', () => {
  it('reads a default session name and a minimum version in Chinese', () => {
    applyLang('zh');
    expect(tn('Session B')).toBe('課表 B');
    expect(tn("Today's workout (minimum)")).toBe('今天的訓練（精簡版）');
  });
});

describe('tr', () => {
  it('places React parts where the translation puts them', () => {
    const link = createElement('a', { href: '#/profile' }, 'Profile');
    expect(renderToStaticMarkup(tr('Add {link} to see your level.', { link }) as never)).toBe('Add <a href="#/profile">Profile</a> to see your level.');
  });
});

describe('engine sentence table', () => {
  const table = compileTable({
    'top {word} at {w}kg failed — down {inc}kg': '最重{word} {w}kg 失敗，下調 {inc}kg',
    '{why} — held for a red readiness day': '{why}，狀態差的日子維持重量',
    double: '雙次',
  });
  it('translates a sentence and carries its values unchanged', () => {
    expect(translateWith(table, 'top double at 102.5kg failed — down 2.5kg')).toBe('最重雙次 102.5kg 失敗，下調 2.5kg');
  });
  it('translates a sentence inside a sentence', () => {
    expect(translateWith(table, 'top double at 100kg failed — down 5kg — held for a red readiness day'))
      .toBe('最重雙次 100kg 失敗，下調 5kg，狀態差的日子維持重量');
  });
  it('skips a match whose values would stay in English and tries the next template', () => {
    const t2 = compileTable({
      'top at {w}kg — add {inc}kg': '最重 {w}kg，加 {inc}kg',
      '{a}; back-offs at {w}kg': '{a}；遞減組 {w}kg',
    });
    expect(translateWith(t2, 'top at 100kg — add 2.5kg; back-offs at 60kg')).toBe('最重 100kg，加 2.5kg；遞減組 60kg');
  });
  it('leaves a sentence it does not know as it is', () => {
    expect(translateWith(table, 'something new the engine says')).toBe('something new the engine says');
  });
  it('writes "x" between numbers as ×', () => {
    expect(translateWith(table, '100kg x 5')).toBe('100kg × 5');
  });
});

describe('language from the phone', () => {
  it('picks Chinese for any zh locale and English otherwise', () => {
    expect(langFromLocale('zh-TW')).toBe('zh');
    expect(langFromLocale('zh-Hant-HK')).toBe('zh');
    expect(langFromLocale('en-GB')).toBe('en');
    expect(langFromLocale(undefined)).toBe('en');
  });
});

describe('dates', () => {
  it('reads the Chinese way in Chinese', () => {
    applyLang('zh');
    expect(formatDate('2026-11-23')).toBe('2026年11月23日 週一');
    expect(formatDate('2026-11-23', { year: false })).toBe('11月23日 週一');
    expect(formatDate('2026-11-23', { weekday: false, year: false })).toBe('11月23日');
    expect(monthLabel(2026, 11)).toBe('2026年11月');
    expect(dayInitials()).toEqual(['一', '二', '三', '四', '五', '六', '日']);
  });
  it('is unchanged in English', () => {
    expect(formatDate('2026-11-23')).toBe('Mon 23 Nov 2026');
    expect(monthLabel(2026, 11)).toBe('November 2026');
    expect(dayInitials()).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
  });
});
