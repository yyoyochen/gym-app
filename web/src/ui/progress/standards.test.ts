import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { GymStandardsData } from '../../benchmarks/gymStandards';
import { rateValue } from '../../benchmarks/liftRating';
import { defaultProfile } from '../../db/repo';
import {
  STANDARDS_CAVEAT, confidenceWord, contextText, levelTableText, sourceMeta, missingForStandards, nextText, ordinal, ratedValueText, standardsContext, standingText,
} from './standards';

const data: GymStandardsData = JSON.parse(readFileSync(fileURLToPath(new URL('../../../public/standards/gym-standards.json', import.meta.url)), 'utf8'));
const ctx = { sex: 'male' as const, bodyweightKg: 80, age: 35 };

describe('lifter context', () => {
  it('needs sex and bodyweight; birth year is optional', () => {
    const p = defaultProfile();
    expect(missingForStandards({ profile: p, year: 2026 })).toEqual(['sex', 'bodyweight']);
    expect(standardsContext({ profile: p, bodyweightKg: 80, year: 2026 })).toBeNull();
    expect(standardsContext({ profile: { ...p, sex: 'M' }, bodyweightKg: 80, year: 2026 })).toEqual({ sex: 'male', bodyweightKg: 80 });
    expect(standardsContext({ profile: { ...p, sex: 'F', birthYear: 1991 }, bodyweightKg: 61.5, year: 2026 })).toEqual({ sex: 'female', bodyweightKg: 61.5, age: 35 });
    expect(contextText(ctx)).toBe('male, 80 kg, age 35');
    expect(contextText({ sex: 'female', bodyweightKg: 60 })).toBe('female, 60 kg, no birth year (20–29 table)');
  });
});

describe('plain-language strings', () => {
  it('ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 54.4, 99.6].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '54th', '100th']);
  });

  it('describe what was rated, and the next step', () => {
    const sq = rateValue(data, 'back_squat', 121.3, ctx, 'e1rm')!;
    expect(ratedValueText(sq)).toBe('e1RM 121.5 kg');
    expect(standingText(sq)).toMatch(/^(Novice|Intermediate|Advanced) · \d+(st|nd|rd|th) percentile of gym-goers$/);
    expect(nextText({ level: 'advanced', value: 140.5, unit: 'kg', added: false })).toBe('Advanced at 140.5 kg e1RM');
    expect(nextText({ level: 'elite', value: 42.5, unit: 'kg', added: true })).toBe('Elite at +42.5 kg added');
    expect(nextText({ level: 'novice', value: 5, unit: 'reps', added: false })).toBe('Novice at 5 reps');
    expect(ratedValueText(rateValue(data, 'db_bench', 40, ctx, 'e1rm')!)).toBe('e1RM 40 kg per dumbbell');
    expect(ratedValueText(rateValue(data, 'pull_up', 12, ctx)!)).toBe('12 reps · best set, not a max test');
    expect(ratedValueText(rateValue(data, 'plank', 95, ctx)!)).toBe('95 s · best set (reps read as seconds)');
    expect(ratedValueText(rateValue(data, 'weighted_dip', 0.3, ctx, 'weighted', 24)!)).toBe('+24 kg added e1RM');
  });

  it('level tables in the lift’s own unit', () => {
    expect(levelTableText(rateValue(data, 'pull_up', 12, ctx)!, 80)).toBe('Beginner 1 · Novice 5 · Intermediate 10 · Advanced 16 · Elite 22 reps');
    expect(levelTableText(rateValue(data, 'weighted_pull_up', 0.2, ctx)!, 80)).toBe('Beginner +0 · Novice +8 · Intermediate +24 · Advanced +44 · Elite +68 kg added (1RM)');
    expect(levelTableText(rateValue(data, 'back_squat', 100, { sex: 'male', bodyweightKg: 55 })!, 55)).toBe('Beginner 59.5 · Novice 74 · Intermediate 93 · Advanced 116.5 · Elite 145 kg e1RM');
  });

  it('the caveat names the population and the level percentiles', () => {
    expect(STANDARDS_CAVEAT).toMatch(/gym-goers, not competitors/);
    expect(STANDARDS_CAVEAT).toMatch(/Intermediate ≈ 50th/);
  });
});

describe('benchmark source wording', () => {
  it('names the Strength Level table when a rating came from it', () => {
    expect(confidenceWord({ confidence: 'B', source: 'table' })).toBe('Strength Level table');
    expect(confidenceWord({ confidence: 'B', source: 'model' })).toBe('coaching ratio');
  });
  it('the section subtitle follows the ratings shown', () => {
    expect(sourceMeta([{ source: 'model' }, { source: 'table' }])).toBe('vs Strength Level');
    expect(sourceMeta([{ source: 'model' }])).toBe('vs gym-goers');
    expect(sourceMeta([])).toBe('vs gym-goers');
  });
});
