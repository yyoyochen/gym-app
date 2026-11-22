// Modeled gym-goer strength standards (docs/STANDARDS-METHODOLOGY.md): a
// TypeScript port of rate() from the source model's build_standards.py, over
// the compact table tools/standards/build.mjs writes to
// web/public/standards/gym-standards.json. Pure: callers load the JSON.
//
// Loaded lifts: 1RM is lognormal around a base-lift median (squat, bench,
// deadlift, OHP) scaled by bodyweight^0.70 (clamped 45–130 kg), sex and age;
// an accessory is its base lift times a fixed ratio at every percentile.
// Bodyweight lifts: a per-sex table of reps / seconds / added-load fraction at
// each level, interpolated linearly between levels.
import { normCdf, normInv } from './normal';

export type StdSex = 'male' | 'female';
export type BaseLift = 'squat' | 'bench' | 'deadlift' | 'ohp';
export type LevelName = 'beginner' | 'novice' | 'intermediate' | 'advanced' | 'elite';
export type Level = LevelName | 'below beginner';
export type Confidence = 'A' | 'B' | 'C';
export type StdUnit = 'kg' | 'reps' | 'seconds' | 'bw_fraction';

export interface LoadedStandard {
  id: string;
  name: string;
  base: BaseLift;
  ratio: number;
  loadType: 'barbell' | 'dumbbell_each' | 'machine' | 'cable' | 'kettlebell';
  unit: 'kg';
  confidence: Confidence;
  note?: string;
}

export interface BodyweightStandard {
  id: string;
  name: string;
  unit: 'reps' | 'seconds' | 'bw_fraction';
  confidence: Confidence;
  note?: string;
  /** Values at beginner, novice, intermediate, advanced, elite. */
  male: number[];
  female: number[];
}

export interface GymStandardsData {
  v: number;
  meta: {
    population: string;
    /** [name, percentile] pairs, beginner → elite. */
    levels: [LevelName, number][];
    confidence: Record<Confidence, string>;
    source: string;
    attribution: string;
    /** Shown as a visible link wherever levels appear (FitnessVolt's CC BY 4.0 condition). */
    attributionUrl: string;
    licenceNote: string;
    loadTypes: string;
  };
  /** Lognormal [mu, sigma] of 1RM in kg for a male at refBw, age 20–29. */
  fit: Record<BaseLift, [number, number]>;
  refBw: Record<StdSex, number>;
  bwExp: number;
  bwClamp: [number, number];
  female: Record<BaseLift, number>;
  /** [fromAge, toAge (exclusive), factor] */
  age: [number, number, number][];
  loaded: LoadedStandard[];
  bodyweight: BodyweightStandard[];
  /**
   * Optional per-standard threshold tables (local testing only: the Strength
   * Level table, loaded in preview builds). Male only; each `male` row is the
   * five level thresholds (kg) at the matching `bw`, ascending.
   */
  tables?: Record<string, { bw: number[]; male: number[][] }>;
}

export const LEVEL_NAMES: LevelName[] = ['beginner', 'novice', 'intermediate', 'advanced', 'elite'];
/** Level thresholds as fractions (beginner ≈ p5 … elite ≈ p95). */
export const LEVEL_P: Record<LevelName, number> = { beginner: 0.05, novice: 0.2, intermediate: 0.5, advanced: 0.8, elite: 0.95 };
export const LEVEL_LABEL: Record<Level, string> = {
  'below beginner': 'Below beginner', beginner: 'Beginner', novice: 'Novice', intermediate: 'Intermediate', advanced: 'Advanced', elite: 'Elite',
};
export const CONFIDENCE_LABEL: Record<Confidence, string> = { A: 'data-anchored', B: 'coaching ratio', C: 'rough' };

export interface Rating { level: Level; /** 0–100, one decimal, like the model. */ percentile: number }

export type StandardDef = ({ kind: 'loaded' } & LoadedStandard) | ({ kind: 'bodyweight' } & BodyweightStandard);

const indexCache = new WeakMap<GymStandardsData, Map<string, StandardDef>>();
function index(data: GymStandardsData): Map<string, StandardDef> {
  let m = indexCache.get(data);
  if (!m) {
    m = new Map<string, StandardDef>();
    for (const e of data.loaded) m.set(e.id, { kind: 'loaded', ...e });
    for (const e of data.bodyweight) m.set(e.id, { kind: 'bodyweight', ...e });
    indexCache.set(data, m);
  }
  return m;
}

export function getStandard(data: GymStandardsData, id: string): StandardDef | undefined {
  return index(data).get(id);
}

export function ageFactor(data: GymStandardsData, age?: number | null): number {
  if (age === undefined || age === null) return 1;
  for (const [lo, hi, f] of data.age) if (lo <= age && age < hi) return f;
  return 1;
}

/** Median 1RM (kg) of a base lift for this sex, bodyweight and age. */
export function baseMedian(data: GymStandardsData, lift: BaseLift, sex: StdSex, bw: number, age?: number | null): number {
  const [mu] = data.fit[lift];
  const [lo, hi] = data.bwClamp;
  const w = Math.min(Math.max(bw, lo), hi);
  let m = Math.exp(mu) * (w / data.refBw[sex]) ** data.bwExp * ageFactor(data, age);
  if (sex === 'female') m *= data.female[lift];
  return m;
}

function levelOf(pct: number): Level {
  let level: Level = 'below beginner';
  for (const n of LEVEL_NAMES) if (pct >= LEVEL_P[n]) level = n;
  return level;
}

/**
 * Level and percentile for a lift (the model's rate()). `value` is kg for
 * loaded lifts (a 1RM or e1RM; per implement for dumbbell_each), reps or
 * seconds for bodyweight lifts, and added load ÷ bodyweight for the weighted
 * (bw_fraction) standards. Null for an unknown id or a non-finite value.
 */
/**
 * The five thresholds from a loaded table for this lifter, or null when there
 * is no table for the id, the lifter is female, or no tables are loaded.
 * Bodyweight is clamped to the table's range and interpolated linearly.
 */
export function tableThresholds(data: GymStandardsData, id: string, sex: StdSex, bodyweightKg: number): number[] | null {
  const t = data.tables?.[id];
  if (!t || sex !== 'male' || !t.bw.length) return null;
  const last = t.bw.length - 1;
  if (bodyweightKg <= t.bw[0]) return t.male[0].slice();
  if (bodyweightKg >= t.bw[last]) return t.male[last].slice();
  let i = 0;
  while (t.bw[i + 1] < bodyweightKg) i++;
  const f = (bodyweightKg - t.bw[i]) / (t.bw[i + 1] - t.bw[i]);
  return t.male[i].map((v, k) => v + (t.male[i + 1][k] - v) * f);
}

/** Piecewise-linear percentile (0–1) over the five level thresholds; 0.97 past elite. */
function pctFromPoints(vals: number[], value: number): number {
  const pts = vals.map((v, i) => [v, LEVEL_P[LEVEL_NAMES[i]]] as const);
  if (value === pts[0][0]) return pts[0][1]; // exactly Beginner: scaling by value/value can land a hair under 0.05
  if (value < pts[0][0]) return pts[0][0] ? (0.05 * Math.max(value, 0)) / pts[0][0] : 0.05;
  if (value >= pts[pts.length - 1][0]) return 0.97;
  for (let i = 0; i < pts.length - 1; i++) {
    const [v0, p0] = pts[i];
    const [v1, p1] = pts[i + 1];
    if (v0 <= value && value <= v1) return p0 + (p1 - p0) * (v1 > v0 ? (value - v0) / (v1 - v0) : 0);
  }
  return pts[0][1];
}

export function rate(data: GymStandardsData, exId: string, sex: StdSex, bodyweightKg: number, value: number, age?: number | null): Rating | null {
  const std = getStandard(data, exId);
  if (!std || !Number.isFinite(value)) return null;
  let pct: number;
  const table = std.kind === 'loaded' ? tableThresholds(data, exId, sex, bodyweightKg) : null;
  if (table) {
    pct = pctFromPoints(table, value);
  } else if (std.kind === 'loaded') {
    if (value <= 0) return { level: 'below beginner', percentile: 0 };
    const med = baseMedian(data, std.base, sex, bodyweightKg, age);
    const sigma = data.fit[std.base][1];
    pct = normCdf(Math.log((value / std.ratio) / med) / sigma);
  } else {
    pct = pctFromPoints(sex === 'male' ? std.male : std.female, value);
  }
  return { level: levelOf(pct), percentile: pyRound1(pct * 100) };
}

/** Python's round(x, 1) for x ≥ 0: nearest by the exact binary value, exact ties to even. */
function pyRound1(y: number): number {
  const frac = y.toFixed(60).split('.')[1] ?? '';
  const tie = frac[1] === '5' && /^0*$/.test(frac.slice(2));
  if (!tie) return Number(y.toFixed(1));
  const t = Math.floor(y * 10);
  return (t % 2 === 0 ? t : t + 1) / 10;
}

export interface LevelTable {
  unit: StdUnit;
  /** Value needed for each level, unrounded (kg, reps, seconds or bw fraction). */
  values: Record<LevelName, number>;
}

/** What each level means for this lifter: the 1RM (kg) or reps/seconds/fraction at each threshold. */
export function levelsAt(data: GymStandardsData, exId: string, sex: StdSex, bodyweightKg: number, age?: number | null): LevelTable | null {
  const std = getStandard(data, exId);
  if (!std) return null;
  const values = {} as Record<LevelName, number>;
  const table = std.kind === 'loaded' ? tableThresholds(data, exId, sex, bodyweightKg) : null;
  if (table) {
    LEVEL_NAMES.forEach((n, i) => { values[n] = table[i]; });
    return { unit: 'kg', values };
  }
  if (std.kind === 'loaded') {
    const med = baseMedian(data, std.base, sex, bodyweightKg, age);
    const sigma = data.fit[std.base][1];
    for (const n of LEVEL_NAMES) values[n] = med * Math.exp(sigma * normInv(LEVEL_P[n])) * std.ratio;
    return { unit: 'kg', values };
  }
  const vals = sex === 'male' ? std.male : std.female;
  LEVEL_NAMES.forEach((n, i) => { values[n] = vals[i]; });
  return { unit: std.unit, values };
}

/** The level after this one, or null at elite. */
export function nextLevel(level: Level): LevelName | null {
  if (level === 'below beginner') return 'beginner';
  const i = LEVEL_NAMES.indexOf(level);
  return i < LEVEL_NAMES.length - 1 ? LEVEL_NAMES[i + 1] : null;
}

/** Ladder position 0–5 (0 = below beginner) for the tier ramp. */
export function levelRank(level: Level): number {
  return level === 'below beginner' ? 0 : LEVEL_NAMES.indexOf(level) + 1;
}
