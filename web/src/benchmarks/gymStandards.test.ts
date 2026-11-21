import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normCdf, normInv } from './normal';
import {
  baseMedian, levelRank, levelsAt, nextLevel, rate, getStandard, LEVEL_NAMES, type GymStandardsData, type Level, type StdSex,
} from './gymStandards';

const read = (rel: string) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'));
const data: GymStandardsData = read('../../public/standards/gym-standards.json');

// Dumped from the source model's rate() / loaded_value() by a throwaway Python
// script outside the repo (seeded grid; see the fixture's _doc).
const P: {
  ids: string[]; levelNames: Level[]; fit: Record<string, [number, number]>;
  cases: [number, number, number, number | null, number, number, number][];
  levels: [number, number, number, number | null, number[]][];
} = read('./__fixtures__/gym-standards-parity.json');
const SEX: StdSex[] = ['male', 'female'];

describe('normal distribution helpers', () => {
  it('Φ and Φ⁻¹ match known values to 1e-12', () => {
    expect(normCdf(0)).toBe(0.5);
    expect(normCdf(1)).toBeCloseTo(0.8413447460685429, 12);
    expect(normCdf(-1.959963984540054)).toBeCloseTo(0.025, 12);
    expect(normCdf(-3)).toBeCloseTo(0.0013498980316301035, 14);
    expect(normInv(0.95)).toBeCloseTo(1.6448536269514715, 12);
    expect(normInv(0.2)).toBeCloseTo(-0.8416212335729142, 12);
    expect(normInv(1e-6)).toBeCloseTo(-4.753424308822899, 10);
    expect(normInv(0.999999)).toBeCloseTo(4.753424308817086, 10);
  });

  it('are inverses across the range', () => {
    for (let p = 0.0005; p < 1; p += 0.0137) expect(normCdf(normInv(p))).toBeCloseTo(p, 12);
    expect(normCdf(-12)).toBe(0);
    expect(normCdf(12)).toBe(1);
    expect(normInv(0)).toBe(-Infinity);
    expect(Number.isNaN(normInv(1.2))).toBe(true);
  });
});

describe('gym-standards.json', () => {
  it('has every exercise of the source model and the model’s full-precision fits', () => {
    expect(data.loaded.length + data.bodyweight.length).toBe(P.ids.length);
    for (const id of P.ids) expect(getStandard(data, id), id).toBeDefined();
    for (const [k, [mu, sigma]] of Object.entries(P.fit)) {
      const [m2, s2] = data.fit[k as keyof typeof data.fit];
      expect(m2).toBeCloseTo(mu, 12);
      expect(s2).toBeCloseTo(sigma, 12);
    }
  });

  it('stays small and carries the population, attribution and licence caveat', () => {
    expect(JSON.stringify(data).length).toBeLessThan(25_000);
    expect(data.meta.population).toMatch(/gym-goers/);
    expect(data.meta.attribution).toMatch(/Symmetric Strength.*FitnessVolt.*CC BY 4\.0/);
    expect(data.meta.licenceNote).toMatch(/not been verified/);
    expect(data.meta.levels.map(l => l[1])).toEqual([5, 20, 50, 80, 95]);
  });
});

describe('rate() parity with the source model', () => {
  it(`matches level exactly and percentile within 0.05 on ${P.cases.length} seeded cases`, () => {
    let worst = 0;
    const bad: string[] = [];
    for (const [i, s, bw, age, v, lvl, pct] of P.cases) {
      const r = rate(data, P.ids[i], SEX[s], bw, v, age);
      const tag = `${P.ids[i]} ${SEX[s]} bw=${bw} age=${age} v=${v}`;
      if (!r) { bad.push(`${tag}: null`); continue; }
      worst = Math.max(worst, Math.abs(r.percentile - pct));
      if (r.level !== P.levelNames[lvl] || Math.abs(r.percentile - pct) > 0.05) bad.push(`${tag}: ${r.level} ${r.percentile} vs ${P.levelNames[lvl]} ${pct}`);
    }
    expect(bad.slice(0, 10)).toEqual([]);
    expect(worst).toBeLessThanOrEqual(0.05);
    console.info(`[parity] ${P.cases.length} cases, worst percentile difference ${worst}`);
  });

  it('levelsAt() matches loaded_value() at every level (relative 1e-8)', () => {
    for (const [i, s, bw, age, kgs] of P.levels) {
      const t = levelsAt(data, P.ids[i], SEX[s], bw, age);
      expect(t?.unit).toBe('kg');
      LEVEL_NAMES.forEach((n, j) => expect(Math.abs(t!.values[n] / kgs[j] - 1), `${P.ids[i]} ${n}`).toBeLessThan(1e-8));
    }
  });
});

describe('model behaviour', () => {
  it('the median lifter is intermediate at the 50th percentile; levels sit on their percentiles', () => {
    const t = levelsAt(data, 'bench_press', 'male', 83)!;
    expect(rate(data, 'bench_press', 'male', 83, t.values.intermediate)!.percentile).toBeCloseTo(50, 1);
    expect(rate(data, 'bench_press', 'male', 83, t.values.elite * 1.001)!.level).toBe('elite');
    expect(rate(data, 'bench_press', 'male', 83, t.values.beginner * 0.99)!.level).toBe('below beginner');
  });

  it('bodyweight scaling is flat outside 45–130 kg', () => {
    expect(baseMedian(data, 'squat', 'male', 150)).toBe(baseMedian(data, 'squat', 'male', 130));
    expect(baseMedian(data, 'squat', 'female', 40)).toBe(baseMedian(data, 'squat', 'female', 45));
    expect(baseMedian(data, 'squat', 'male', 100)).toBeGreaterThan(baseMedian(data, 'squat', 'male', 80));
  });

  it('older lifters need less for the same level; no age = the 20–29 table', () => {
    const young = rate(data, 'deadlift', 'male', 80, 150)!;
    const old = rate(data, 'deadlift', 'male', 80, 150, 55)!;
    expect(old.percentile).toBeGreaterThan(young.percentile);
    expect(rate(data, 'deadlift', 'male', 80, 150, 25)).toEqual(young);
  });

  it('bodyweight tables: interpolation, the 97 cap, zero-rep beginner rows', () => {
    expect(rate(data, 'pull_up', 'male', 80, 10)).toEqual({ level: 'intermediate', percentile: 50 });
    expect(rate(data, 'pull_up', 'male', 80, 13)).toEqual({ level: 'intermediate', percentile: 65 });
    expect(rate(data, 'pull_up', 'male', 80, 40)).toEqual({ level: 'elite', percentile: 97 });
    expect(rate(data, 'pull_up', 'female', 60, 0)).toEqual({ level: 'beginner', percentile: 5 });
    expect(levelsAt(data, 'plank', 'male', 80)).toEqual({ unit: 'seconds', values: { beginner: 20, novice: 45, intermediate: 90, advanced: 150, elite: 240 } });
  });

  it('unknown ids and bad values give null; non-positive loads are below beginner', () => {
    expect(rate(data, 'nope', 'male', 80, 100)).toBeNull();
    expect(levelsAt(data, 'nope', 'male', 80)).toBeNull();
    expect(rate(data, 'bench_press', 'male', 80, NaN)).toBeNull();
    expect(rate(data, 'bench_press', 'male', 80, 0)).toEqual({ level: 'below beginner', percentile: 0 });
  });

  it('nextLevel / levelRank', () => {
    expect(nextLevel('below beginner')).toBe('beginner');
    expect(nextLevel('advanced')).toBe('elite');
    expect(nextLevel('elite')).toBeNull();
    expect(levelRank('below beginner')).toBe(0);
    expect(levelRank('elite')).toBe(5);
  });
});
