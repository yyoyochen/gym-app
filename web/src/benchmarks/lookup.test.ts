import { describe, expect, it } from 'vitest';
import { kgAtPercentile, percentileFor, type BenchmarkData } from './lookup';

const P = [5, 10, 25, 50, 75, 90, 95, 99];
// squat 50..120 style curves; each lift 8 values
const sq = [60, 70, 90, 110, 130, 150, 160, 180];
const bn = [40, 50, 60, 80, 100, 115, 125, 140];
const dl = [80, 95, 115, 140, 165, 185, 200, 225];
const tot = [180, 215, 265, 330, 395, 450, 485, 545];
const row = (n: number, thin: number, r: number, k = 1) => [n, thin, r, ...[sq, bn, dl, tot].flat().map((x) => x * k)];

// male, age band 2 (35-39), bw band 7 (80-85)
const data: BenchmarkData = {
  v: 1,
  dataDate: '2026-01-01',
  percentiles: P,
  ageBands: ['<=23', '24-34', '35-39', '40-44', '45-49', '50-54', '55-59', '60+'],
  bw: { min: 45, step: 5, count: 21 },
  lifts: ['sq', 'bn', 'dl', 'total'],
  tested: { 'M.2.7': row(500, 0, 0), 'M.2.8': row(120, 1, 2), 'M.2.0': row(210, 0, 0) },
  all: { 'M.2.7': row(900, 0, 0, 1.1), 'M.2.8': row(400, 0, 1, 1.1) },
};

const base = { sex: 'M' as const, age: 37, bodyweightKg: 82, population: 'tested' as const };

describe('percentileFor', () => {
  it('returns exact stored percentile', () => {
    const r = percentileFor(data, { ...base, lift: 'bench', kg: 80 })!;
    expect(r.percentile).toBe(50);
    expect(r.n).toBe(500);
    expect(r.thin).toBe(false);
    expect(r.fellBackToAll).toBe(false);
    expect(r.bucket).toEqual({ sex: 'M', ageBand: '35-39', bodyweightBand: '80–85 kg', poolRadius: 0 });
  });
  it('interpolates between stored percentiles', () => {
    const r = percentileFor(data, { ...base, lift: 'bench', kg: 90 })!;
    expect(r.percentile).toBeCloseTo(62.5, 5);
  });
  it('clamps below p5 and above p99', () => {
    expect(percentileFor(data, { ...base, lift: 'squat', kg: 40 })!.percentile).toBe('<5');
    expect(percentileFor(data, { ...base, lift: 'squat', kg: 200 })!.percentile).toBe('>99');
    expect(percentileFor(data, { ...base, lift: 'squat', kg: 60 })!.percentile).toBe(5);
    expect(percentileFor(data, { ...base, lift: 'squat', kg: 180 })!.percentile).toBe(99);
  });
  it('reads the right lift curve', () => {
    expect(percentileFor(data, { ...base, lift: 'deadlift', kg: 140 })!.percentile).toBe(50);
    expect(percentileFor(data, { ...base, lift: 'total', kg: 330 })!.percentile).toBe(50);
  });
  it('falls back to all when tested bucket is thin', () => {
    const r = percentileFor(data, { ...base, bodyweightKg: 87, lift: 'bench', kg: 88 })!;
    expect(r.fellBackToAll).toBe(true);
    expect(r.population).toBe('all');
    expect(r.n).toBe(400);
    expect(r.percentile).toBeCloseTo(50, 5); // 80*1.1
    expect(r.bucket.poolRadius).toBe(1);
  });
  it('uses all population when asked, no fallback flag', () => {
    const r = percentileFor(data, { ...base, population: 'all', lift: 'bench', kg: 88 })!;
    expect(r.fellBackToAll).toBe(false);
    expect(r.percentile).toBe(50);
  });
  it('clamps bodyweight to edge bands', () => {
    const r = percentileFor(data, { ...base, bodyweightKg: 40, lift: 'bench', kg: 80 })!;
    expect(r.bucket.bodyweightBand).toBe('<50 kg');
    expect(r.n).toBe(210);
  });
  it('returns null when no data', () => {
    expect(percentileFor(data, { ...base, sex: 'F', lift: 'bench', kg: 50 })).toBeNull();
  });
});

describe('kgAtPercentile', () => {
  it('returns stored and interpolated weights', () => {
    expect(kgAtPercentile(data, { ...base, lift: 'squat', percentile: 50 })!.kg).toBe(110);
    expect(kgAtPercentile(data, { ...base, lift: 'squat', percentile: 62.5 })!.kg).toBe(120);
  });
  it('clamps to 5..99 range', () => {
    expect(kgAtPercentile(data, { ...base, lift: 'squat', percentile: 1 })!.kg).toBe(60);
    expect(kgAtPercentile(data, { ...base, lift: 'squat', percentile: 100 })!.kg).toBe(180);
  });
  it('reports fallback', () => {
    const r = kgAtPercentile(data, { ...base, bodyweightKg: 87, lift: 'squat', percentile: 50 })!;
    expect(r.fellBackToAll).toBe(true);
    expect(r.kg).toBe(121);
  });
});
