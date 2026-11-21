// Place a logged lift on the gym-goer standards (gymStandards.ts).
//
// What gets rated, from the last 90 days of working sets:
// - Loaded lifts: the best e1RM (Epley, same series as Progress / LiftDetail).
// - Pull-up, chin-up, dip with added load: the model's weighted standard,
//   whose value is the added-load 1RM ÷ bodyweight. The added-load 1RM is
//   estimated as epley(bw × factor + added, reps) − bw × factor, with the
//   exercise's bodyweight factor (the share of bodyweight the lift moves, as
//   in every other e1RM in the app), then divided by the full bodyweight.
// - Other bodyweight lifts: the best set's reps — a best set, not a max test.
// - Holds (plank, dead hang, L-sit): the best set's logged reps, read as seconds.
import type { Exercise, ISODate } from '../domain/types';
import { bestRecentE1rm, e1rm, liftSeries, workingSets, type DatedSets } from '../engine/progress';
import { addDays } from '../engine/dates';
import {
  getStandard, levelsAt, nextLevel, rate, tableThresholds, type Confidence, type GymStandardsData, type Level, type LevelName, type LevelTable, type StdSex,
} from './gymStandards';
import { standardIdFor, WEIGHTED_COUNTERPART } from './standardMatch';

export type RatingBasis = 'e1rm' | 'weighted' | 'reps' | 'seconds';

export interface RateContext {
  sex: StdSex;
  bodyweightKg: number;
  /** Years; undefined = no age adjustment (the 20–29 table). */
  age?: number;
}

export interface NextStep {
  level: LevelName;
  /** kg (e1RM, or added load for weighted), reps or seconds — rounded so reaching it reaches the level. */
  value: number;
  unit: 'kg' | 'reps' | 'seconds';
  added: boolean;
}

export interface LiftRating {
  kind: 'rated';
  /** The standard actually used (weighted_* when added load was logged). */
  standardId: string;
  standardName: string;
  basis: RatingBasis;
  /** kg e1RM, added-load fraction of bodyweight, reps or seconds. */
  value: number;
  /** Weighted only: the estimated added-load 1RM in kg. */
  addedKg?: number;
  level: Level;
  percentile: number;
  confidence: Confidence;
  /** Where the levels came from: the gym-goer model, or a loaded threshold table (local Strength Level). */
  source: 'model' | 'table';
  loadType?: string;
  note?: string;
  levels: LevelTable;
  next: NextStep | null;
}

export type LiftStanding =
  | { kind: 'none' }
  | { kind: 'no-data'; standardId: string; standardName: string }
  | LiftRating;

const ceilHalf = (x: number) => Math.ceil(x * 2 - 1e-9) / 2;

function nextStep(levels: LevelTable, level: Level, bodyweightKg: number): NextStep | null {
  const n = nextLevel(level);
  if (!n) return null;
  const v = levels.values[n];
  if (levels.unit === 'kg') return { level: n, value: ceilHalf(v), unit: 'kg', added: false };
  if (levels.unit === 'bw_fraction') return { level: n, value: ceilHalf(v * bodyweightKg), unit: 'kg', added: true };
  return { level: n, value: Math.ceil(v), unit: levels.unit, added: false };
}

/** Rate a known value against one standard (used for targets and by rateExercise). */
export function rateValue(
  data: GymStandardsData, standardId: string, value: number, ctx: RateContext, basis?: RatingBasis, addedKg?: number,
): LiftRating | null {
  const std = getStandard(data, standardId);
  if (!std) return null;
  const r = rate(data, standardId, ctx.sex, ctx.bodyweightKg, value, ctx.age);
  const levels = levelsAt(data, standardId, ctx.sex, ctx.bodyweightKg, ctx.age);
  if (!r || !levels) return null;
  const b: RatingBasis = basis ?? (std.kind === 'loaded' ? 'e1rm' : std.unit === 'bw_fraction' ? 'weighted' : std.unit === 'seconds' ? 'seconds' : 'reps');
  return {
    kind: 'rated', standardId, standardName: std.name, basis: b, value, ...(addedKg !== undefined ? { addedKg } : {}),
    level: r.level, percentile: r.percentile, confidence: std.confidence,
    source: std.kind === 'loaded' && tableThresholds(data, standardId, ctx.sex, ctx.bodyweightKg) ? 'table' : 'model',
    ...(std.kind === 'loaded' ? { loadType: std.loadType } : {}), ...(std.note ? { note: std.note } : {}),
    levels, next: nextStep(levels, r.level, ctx.bodyweightKg),
  };
}

/** Where this exercise's recent log puts it on the gym-goer standards. */
export function rateExercise(data: GymStandardsData, ex: Exercise, history: DatedSets[], today: ISODate, ctx: RateContext): LiftStanding {
  const id = standardIdFor(ex);
  const std = id ? getStandard(data, id) : undefined;
  if (!id || !std) return { kind: 'none' };
  const noData = { kind: 'no-data' as const, standardId: id, standardName: std.name };

  if (std.kind === 'loaded') {
    const best = bestRecentE1rm(liftSeries(ex, history, { bodyweightKg: ctx.bodyweightKg }), today, 90);
    return best === null ? noData : rateValue(data, id, best, ctx, 'e1rm') ?? noData;
  }

  const from = addDays(today, -90);
  const sets = history
    .filter(h => h.date >= from && h.date <= today)
    .flatMap(h => workingSets(h.sets))
    .filter(s => s.exerciseId === ex.id && s.reps > 0 && !s.failed);

  const weightedId = WEIGHTED_COUNTERPART[id];
  const loadedSets = sets.filter(s => s.weight > 0);
  if (weightedId && loadedSets.length && ctx.bodyweightKg > 0) {
    const base = ctx.bodyweightKg * (ex.bodyweightFactor > 0 ? ex.bodyweightFactor : 1);
    const added = Math.max(...loadedSets.map(s => e1rm(base + s.weight, s.reps) - base));
    return rateValue(data, weightedId, added / ctx.bodyweightKg, ctx, 'weighted', added) ?? noData;
  }
  const plain = sets.filter(s => s.weight >= 0);
  if (!plain.length) return noData;
  const best = Math.max(...plain.map(s => s.reps));
  return rateValue(data, id, best, ctx) ?? noData;
}

/**
 * The standard a profile target maps to: loaded lifts take the target as a
 * 1RM in kg; pull-up / chin-up / dip targets in kg are read as added load.
 */
export function rateTarget(data: GymStandardsData, ex: Exercise, targetKg: number, ctx: RateContext): LiftRating | null {
  const id = standardIdFor(ex);
  const std = id ? getStandard(data, id) : undefined;
  if (!id || !std) return null;
  if (std.kind === 'loaded') return rateValue(data, id, targetKg, ctx, 'e1rm');
  const weightedId = WEIGHTED_COUNTERPART[id];
  if (weightedId && ctx.bodyweightKg > 0 && targetKg > 0) return rateValue(data, weightedId, targetKg / ctx.bodyweightKg, ctx, 'weighted', targetKg);
  return null;
}
