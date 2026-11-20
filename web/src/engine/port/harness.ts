// Runs a parity fixture case through the TypeScript port. Used by the public
// parity test (synthetic fixtures) and the private one (real-log fixtures).
// Inputs and outputs use the Python shapes recorded by the generator.
import { bestRecentE1rm, daysStale, epley, prs, sessionSeries } from './analysis';
import { successCriteria, why } from './criteria';
import { progressionTarget } from './progression';
import { buildScorecard, scoreLift } from './scoring';
import { attemptHistory, easeTarget, lastSessionOf, targetFor } from './service';
import { seedWeight, strengthTarget } from './strength';
import type { LegacySetRow, LegacyTarget, WR } from './types';
import { volumeLoadDeltaPct, weakFlags, weeklySets } from './volume';

export interface ParityCase {
  fn: string;
  name: string;
  input: any;
  output: unknown;
  fixedOutput?: unknown;
  expectChange?: string;
}

export interface Mode { faithful: boolean }

export function targetOut(t: LegacyTarget, m: Mode) {
  return { target: t, criterion: successCriteria(t, m), why: why(t) };
}

/** Context the real-log fixture shares across cases. */
export interface RealLogContext {
  sets: LegacySetRow[];
  program: {
    fixed_rep_range: Record<string, [number, number]>;
    phases: { start: string; end: string; rep_min: number; rep_max: number }[];
    starting_weights: Record<string, number>;
    increment_default: number;
    increment_overrides: Record<string, number>;
    muscle_map: Record<string, string[]>;
    weak_points: string[];
  };
}

function phaseRange(ctx: RealLogContext, d: string): [number, number] {
  const ph = ctx.program.phases.find((p) => p.start <= d && d <= p.end) ?? ctx.program.phases[ctx.program.phases.length - 1];
  return [ph.rep_min, ph.rep_max];
}

export function runCase(c: ParityCase, m: Mode, ctx?: RealLogContext): unknown {
  const i = c.input;
  switch (c.fn) {
    case 'epley': return epley(i.weight, i.reps);
    case 'analysis': {
      if (ctx) {
        const series = sessionSeries(ctx.sets, i.lift);
        const dates = [...new Set(ctx.sets.map((s) => s.date))].sort();
        return {
          series, prs: prs(series), days_stale: daysStale(series, i.today),
          best_recent_e1rm: Object.fromEntries(dates.map((d) => [d, bestRecentE1rm(ctx.sets, i.lift, d)])),
        };
      }
      const series = sessionSeries(i.sets, i.lift);
      return {
        series, prs: prs(series),
        best_recent_e1rm: bestRecentE1rm(i.sets, i.lift, i.today, i.window_days),
        days_stale: daysStale(series, i.today),
      };
    }
    case 'volume': {
      if (ctx) {
        const weekly = weeklySets(ctx.sets, ctx.program.muscle_map);
        return { weekly, weak: weakFlags(weekly, ctx.program.weak_points) };
      }
      const weekly = weeklySets(i.sets, i.muscle_map);
      return { weekly, weak: weakFlags(weekly, i.weak_points, i.floor) };
    }
    case 'volume_load_delta_pct': return volumeLoadDeltaPct(i.this, i.last);
    case 'progression_target':
      return targetOut(progressionTarget(i.history, i.rep_range, i.increment, i.lift, i.starting_weight), m);
    case 'seed_weight': return seedWeight(i.e1rm, i.increment);
    case 'strength_target':
      return targetOut(strengthTarget(i.attempts, i.lift, i.increment,
        { e1rm: i.e1rm, startingWeight: i.starting_weight, faithful: m.faithful }), m);
    case 'score_lift': return scoreLift(i.actual, i.target, m);
    case 'criteria': return { criterion: successCriteria(i.target, m), why: why(i.target) };
    case 'build_scorecard':
      return buildScorecard(i.actual, i.targets, i.last, i.all, i.muscle_map, i.weak_points, i.week_count, m);
    case 'attempt_history': {
      const sets = ctx ? ctx.sets.filter((s) => s.date < i.before) : i.sets;
      return attemptHistory(sets, i.lift, m);
    }
    case 'last_session_of': return lastSessionOf(i.sets, i.lift);
    case 'ease_target': return targetOut(easeTarget(i.target, i.rep_range, i.increment), m);
    case 'target_for': {
      const sets = (i.sets as LegacySetRow[]).filter((s) => s.date < i.on_date);
      return targetOut(targetFor({
        sets, lift: i.lift, increment: i.increment, goal: i.goal,
        repRange: i.fixed_rep_range[i.lift] ?? i.phase_range,
        startingWeight: i.starting_weights[i.lift] ?? null, onDate: i.on_date, readiness: i.readiness, faithful: m.faithful,
      }), m);
    }
    case 'target_for_and_score': {
      if (!ctx) throw new Error('target_for_and_score needs the real-log context');
      const p = ctx.program;
      const prior = ctx.sets.filter((s) => s.date < i.on_date);
      const t = targetFor({
        sets: prior, lift: i.lift, increment: p.increment_overrides[i.lift] ?? p.increment_default, goal: i.goal,
        repRange: p.fixed_rep_range[i.lift] ?? phaseRange(ctx, i.on_date),
        startingWeight: p.starting_weights[i.lift] ?? null, onDate: i.on_date, readiness: i.readiness, faithful: m.faithful,
      });
      const actual: WR[] = ctx.sets.filter((s) => s.date === i.on_date && s.exercise === i.lift).map((s) => [s.weight, s.reps]);
      return { ...targetOut(t, m), result: scoreLift(actual, t, m) };
    }
    default: throw new Error(`no runner for ${c.fn}`);
  }
}

/**
 * Checks one case both ways. The faithful port must reproduce Python exactly;
 * the shipped engine must too, unless the case is tagged expectChange, where
 * it must produce the fixed output the generator recorded instead.
 */
export function checkCase(c: ParityCase, ctx?: RealLogContext, eq: (a: unknown, b: unknown) => boolean = deepEqual): string[] {
  const errs: string[] = [];
  const faithful = runCase(c, { faithful: true }, ctx);
  if (!eq(faithful, c.output)) errs.push(`[faithful] ${c.fn} "${c.name}"\n  got  ${JSON.stringify(faithful)}\n  want ${JSON.stringify(c.output)}`);
  const shipped = runCase(c, { faithful: false }, ctx);
  const want = c.expectChange ? c.fixedOutput : c.output;
  if (!eq(shipped, want)) {
    errs.push(`[shipped${c.expectChange ? ' expectChange' : ''}] ${c.fn} "${c.name}"\n  got  ${JSON.stringify(shipped)}\n  want ${JSON.stringify(want)}`);
  }
  return errs;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return Object.is(a, b) || a === b;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual((a as any)[k], (b as any)[k]));
}
