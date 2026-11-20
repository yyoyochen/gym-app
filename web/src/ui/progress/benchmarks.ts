// Benchmark loading (precached JSON, relative URL so it works on any Pages
// sub-path and offline) and the plain-language line (spec §3.6).
import { useEffect, useState } from 'react';
import { percentileFor, type BenchmarkData, type BenchLift, type PercentileResult } from '../../benchmarks/lookup';
import type { Profile } from '../../domain/types';
import { kg } from '../../app/coach';

export interface Benchmarks { data: BenchmarkData; attribution: string; dataDate: string }

let cache: Promise<Benchmarks | null> | null = null;

export function loadBenchmarks(): Promise<Benchmarks | null> {
  cache ??= (async () => {
    try {
      const idx = await (await fetch('./benchmarks/index.json')).json() as { latest: string; attribution: string; dataDate: string };
      const data = await (await fetch(`./benchmarks/${idx.latest}`)).json() as BenchmarkData;
      return { data, attribution: idx.attribution, dataDate: idx.dataDate };
    } catch {
      cache = null;
      return null;
    }
  })();
  return cache;
}

export function useBenchmarks(): Benchmarks | null | undefined {
  const [b, setB] = useState<Benchmarks | null | undefined>(undefined);
  useEffect(() => { let alive = true; loadBenchmarks().then(v => alive && setB(v)); return () => { alive = false; }; }, []);
  return b;
}

export const LIFT_WORD: Record<BenchLift, string> = { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift', total: 'Total' };

export interface BenchInput { profile?: Profile; bodyweightKg?: number; year: number }

export function missingForBenchmark(inp: BenchInput): string | null {
  const miss: string[] = [];
  if (!inp.profile?.sex) miss.push('sex');
  if (!inp.profile?.birthYear) miss.push('birth year');
  if (inp.bodyweightKg === undefined) miss.push('bodyweight');
  return miss.length ? `Add ${miss.join(', ')} on Profile to compare.` : null;
}

export function benchPercentile(b: Benchmarks, lift: BenchLift, e1rm: number, inp: BenchInput): PercentileResult | null {
  if (missingForBenchmark(inp)) return null;
  return percentileFor(b.data, {
    sex: inp.profile!.sex!, age: inp.year - inp.profile!.birthYear!, bodyweightKg: inp.bodyweightKg!, lift,
    population: inp.profile!.benchmarkPopulation ?? 'tested', kg: e1rm,
  });
}

export function pctText(p: PercentileResult['percentile']): string {
  if (p === '<5') return 'below the 5th percentile';
  if (p === '>99') return 'above the 99th percentile';
  const n = Math.round(p);
  const suf = n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return `${n}${suf} percentile`;
}

/** "Bench 85 kg e1RM → 41st percentile of tested raw male competitors, 35–39, 80–85 kg." */
export function benchLine(lift: BenchLift, e1rm: number, r: PercentileResult): string {
  const pop = r.population === 'tested' ? 'drug-tested raw' : 'raw';
  const sex = r.bucket.sex === 'M' ? 'male' : 'female';
  const extra = [r.fellBackToAll ? 'tested group too small, all raw lifters used' : '', r.thin ? 'thin bucket' : ''].filter(Boolean).join('; ');
  return `${LIFT_WORD[lift]} ${kg(Math.round(e1rm * 2) / 2)} kg e1RM → ${pctText(r.percentile)} of ${pop} ${sex} competitors, ${r.bucket.ageBand}, ${r.bucket.bodyweightBand}${extra ? ` (${extra})` : ''}.`;
}

export const BENCH_CAVEAT = 'The comparison group is competitive powerlifters, who are stronger than the gym population: a middle percentile here is a strong gym lifter. Meet lifts follow federation rules; gym e1RMs from reps are estimates.';

export function pctNumber(p: PercentileResult['percentile']): number {
  return p === '<5' ? 2 : p === '>99' ? 99.5 : p;
}
