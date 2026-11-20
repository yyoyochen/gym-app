// Pure benchmark lookups over the parsed opl-<date>.json (see tools/benchmarks/build.mjs).
// Load-agnostic: callers fetch/parse the JSON and pass it in.

export type Sex = 'M' | 'F';
export type BenchLift = 'squat' | 'bench' | 'deadlift' | 'total';
export type Population = 'tested' | 'all';

export interface BenchmarkData {
  v: number;
  dataDate: string;
  percentiles: number[]; // e.g. [5,10,25,50,75,90,95,99]
  ageBands: string[]; // labels
  bw: { min: number; step: number; count: number };
  lifts: string[]; // storage order; squat, bench, deadlift, total are stored as sq, bn, dl, total
  // key "sex.ageBand.bwBand" -> [n, thin(0/1), poolRadius, ...percentiles for each lift in `lifts` order]
  tested: Record<string, number[]>;
  all: Record<string, number[]>;
}

export interface BucketInfo {
  sex: Sex;
  ageBand: string;
  bodyweightBand: string; // e.g. "80–85 kg", "<50 kg", "145+ kg"
  poolRadius: number; // 0 = own cell, 1/2 = pooled with ±n neighbouring bodyweight bands
}

export interface LookupInput {
  sex: Sex;
  age: number;
  bodyweightKg: number;
  lift: BenchLift;
  population: Population;
}

export interface PercentileResult {
  percentile: number | '<5' | '>99';
  bucket: BucketInfo;
  n: number;
  thin: boolean;
  fellBackToAll: boolean;
  population: Population; // population actually used
}

export interface KgAtPercentileResult {
  kg: number;
  bucket: BucketInfo;
  n: number;
  thin: boolean;
  fellBackToAll: boolean;
  population: Population;
}

const LIFT_INDEX: Record<BenchLift, number> = { squat: 0, bench: 1, deadlift: 2, total: 3 };
const THIN_N = 200;

export function ageBandIndex(age: number): number {
  return age <= 23 ? 0 : age <= 34 ? 1 : age <= 39 ? 2 : age <= 44 ? 3 : age <= 49 ? 4 : age <= 54 ? 5 : age <= 59 ? 6 : 7;
}

export function bwBandIndex(data: BenchmarkData, kg: number): number {
  const { min, step, count } = data.bw;
  return Math.min(count - 1, Math.max(0, Math.floor((kg - min) / step)));
}

function bwLabel(data: BenchmarkData, idx: number): string {
  const { min, step, count } = data.bw;
  if (idx === 0) return `<${min + step} kg`;
  if (idx === count - 1) return `${min + idx * step}+ kg`;
  return `${min + idx * step}–${min + (idx + 1) * step} kg`;
}

interface Resolved {
  row: number[];
  pop: Population;
  fellBack: boolean;
  bucket: BucketInfo;
}

function resolve(data: BenchmarkData, i: Omit<LookupInput, 'lift'>): Resolved | null {
  const a = ageBandIndex(i.age);
  const w = bwBandIndex(data, i.bodyweightKg);
  const key = `${i.sex}.${a}.${w}`;
  const make = (row: number[]): BucketInfo => ({
    sex: i.sex,
    ageBand: data.ageBands[a] ?? String(a),
    bodyweightBand: bwLabel(data, w),
    poolRadius: row[2],
  });
  const allRow = data.all[key];
  if (i.population === 'tested') {
    const t = data.tested[key];
    if (t && t[1] === 0) return { row: t, pop: 'tested', fellBack: false, bucket: make(t) };
    if (allRow) return { row: allRow, pop: 'all', fellBack: true, bucket: make(allRow) };
    if (t) return { row: t, pop: 'tested', fellBack: false, bucket: make(t) }; // thin, nothing better
    return null;
  }
  return allRow ? { row: allRow, pop: 'all', fellBack: false, bucket: make(allRow) } : null;
}

function curve(data: BenchmarkData, row: number[], lift: BenchLift): number[] {
  const k = data.percentiles.length;
  const start = 3 + LIFT_INDEX[lift] * k;
  return row.slice(start, start + k);
}

/** Percentile (0–100) for a lift weight; '<5' / '>99' beyond stored range. Null if no data for this bucket. */
export function percentileFor(data: BenchmarkData, input: LookupInput & { kg: number }): PercentileResult | null {
  const r = resolve(data, input);
  if (!r) return null;
  const ps = data.percentiles;
  const vals = curve(data, r.row, input.lift);
  const kg = input.kg;
  let percentile: number | '<5' | '>99';
  if (kg < vals[0]) percentile = '<5';
  else if (kg > vals[vals.length - 1]) percentile = '>99';
  else {
    percentile = ps[ps.length - 1];
    for (let j = 0; j < vals.length - 1; j++) {
      if (kg <= vals[j + 1]) {
        const span = vals[j + 1] - vals[j];
        const t = span > 0 ? (kg - vals[j]) / span : 0;
        percentile = ps[j] + t * (ps[j + 1] - ps[j]);
        break;
      }
    }
    if (kg === vals[vals.length - 1]) percentile = ps[ps.length - 1];
  }
  return {
    percentile,
    bucket: r.bucket,
    n: r.row[0],
    thin: r.row[1] === 1,
    fellBackToAll: r.fellBack,
    population: r.pop,
  };
}

/** Weight at a percentile (clamped to the stored 5–99 range, interpolated between stored points). */
export function kgAtPercentile(
  data: BenchmarkData,
  input: LookupInput & { percentile: number },
): KgAtPercentileResult | null {
  const r = resolve(data, input);
  if (!r) return null;
  const ps = data.percentiles;
  const vals = curve(data, r.row, input.lift);
  const p = Math.min(ps[ps.length - 1], Math.max(ps[0], input.percentile));
  let kg = vals[vals.length - 1];
  for (let j = 0; j < ps.length - 1; j++) {
    if (p <= ps[j + 1]) {
      const t = (p - ps[j]) / (ps[j + 1] - ps[j]);
      kg = vals[j] + t * (vals[j + 1] - vals[j]);
      break;
    }
  }
  return {
    kg: Math.round(kg * 10) / 10,
    bucket: r.bucket,
    n: r.row[0],
    thin: r.row[1] === 1,
    fellBackToAll: r.fellBack,
    population: r.pop,
  };
}

export { THIN_N };
