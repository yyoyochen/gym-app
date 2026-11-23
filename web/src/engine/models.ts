// Prescription models (spec §5.2): one prescribe() and one grade() for every
// slot. The criterion text and the grade are built from the same fields, so
// the promise shown is the promise graded (§2.1).
import type {
  EffortScale, Exercise, ISODate, LiftResult, Readiness, SetEntry, Slot, Target, Verdict,
} from '../domain/types';
import { capLoad, effortFloor, effortRole, formatFloor, maxLoadJump, type FloorResult } from './effort';
import { painFloorReasons, type PainStatus } from './pain';
import { daysBetween } from './dates';
import { pyFixed, pyG } from './pyformat';
import { bestRecentE1rm, epley } from './port/analysis';
import { successCriteria, why as legacyWhy } from './port/criteria';
import { MIN_SETS_AT_TOP, progressionTarget } from './port/progression';
import { scoreLift } from './port/scoring';
import { attemptHistory, easeTarget, workedLoad } from './port/service';
import { FIVE_RM_FACTOR, floorTo, strengthTarget, TARGET_REPS, TARGET_SETS, TM_BUFFER } from './port/strength';
import type { LegacySetRow, LegacyTarget, WR } from './port/types';
import { workingSets } from './progress';

/** One earlier session of this slot's exercise. */
export interface LiftSession {
  date: ISODate;
  sessionId: string;
  /** That session's sets for the exercise (warm-ups are ignored). */
  sets: SetEntry[];
  /** The promise committed for the slot that day, when there was one. */
  target?: Target;
}

export interface PrescribeContext {
  today: ISODate;
  readiness?: Readiness;
  effortScale?: EffortScale;
  bodyweightKg?: number;
  /** For a lift with no history. */
  startingWeight?: number;
  /** The user's recent best set for a lift with no history: seeds a real first target (rule 'start_seed'). */
  startingSet?: { weight: number; reps: number };
  /** Days since the previous session of any kind (null: none). */
  gapDays?: number | null;
  /** §3.5: 'note' = first session back after 8–20 days; 'block' = 21+ days, 3 × 8 re-entry. */
  reentry?: 'none' | 'note' | 'block';
  /** A later session inside a re-entry period: jumps also capped at 5%. */
  afterLayoff?: boolean;
  /** From pain.painStatus for this exercise. */
  pain?: PainStatus;
}

const EPS = 1e-9;
const BACKOFF_TOO_EASY_RIR = 4;
const REENTRY_SETS = 3;
const REENTRY_REPS = 8;
const SEED_WINDOW_DAYS = 60;

const repWord = (n: number) => (n === 1 ? 'single' : n === 2 ? 'double' : n === 3 ? 'triple' : `${n}-rep set`);
const toWR = (sets: SetEntry[]): WR[] => sets.map((s) => [s.weight, s.reps]);
const round2 = (x: number) => Math.round(x * 100) / 100;

export function prescribe(slot: Slot, exercise: Exercise, history: LiftSession[], ctx: PrescribeContext): Target {
  // A day's plan comes only from days before it (§2.2).
  const hist = history
    .filter((h) => h.date < ctx.today)
    .map((h) => ({ ...h, sets: workingSets(h.sets) }))
    .filter((h) => h.sets.length)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const p = slot.params;
  const inc = p.increment ?? exercise.increment;
  const scale = ctx.effortScale ?? 'rir';
  const reentry = ctx.reentry ?? 'none';
  const floor = effortFloor({
    role: effortRole(slot.model, exercise.slotType, true),
    baseFloor: p.rirFloor,
    readiness: ctx.readiness,
    gapDays: ctx.gapDays,
    painReasons: painFloorReasons(ctx.pain),
    reentry: reentry !== 'none',
  });
  const last = hist[hist.length - 1];
  const base = { slotId: slot.id, exerciseId: exercise.id, exerciseName: exercise.name, rirFloor: floor.floor };

  if (!last && ctx.startingSet) return seededTarget(slot, exercise, ctx.startingSet, ctx, floor, inc, scale, base);

  if (last && reentry === 'block') {
    const anchor = reentryAnchor(last.sets, exercise, inc);
    return fixedTarget(base, anchor, REENTRY_SETS, REENTRY_REPS,
      `re-entry after ${ctx.gapDays ?? 21}+ days: ${REENTRY_SETS} × ${REENTRY_REPS} at your last logged working weight (${pyG(anchor)}kg on ${last.date}), then normal progression`,
      'reentry_block');
  }
  if (last && ctx.pain && ctx.pain.regressPct > 0) {
    const anchor = slot.model === 'topset' ? topSetOf(last.sets).weight : workedLoad(toWR(last.sets));
    const w = floorTo(anchor * (1 - ctx.pain.regressPct) + EPS, inc);
    const sets = slot.model === 'linear5x5' ? 5 : p.sets;
    const reps = slot.model === 'linear5x5' ? 5 : p.repMin;
    return fixedTarget(base, w, sets, reps,
      `${ctx.pain.reasons[ctx.pain.reasons.length - 1] ?? 'repeated pain on a loaded area'}: ${pyG(anchor)}kg → ${pyG(w)}kg`, 'pain_regress');
  }

  // No jump on the first session back or while pain holds the load; otherwise one increment at most.
  const jump = {
    increment: inc,
    firstSessionBack: reentry === 'note' || (ctx.gapDays ?? 0) >= 8 || !!ctx.pain?.hold,
    afterLayoff: ctx.afterLayoff,
  };
  const holdReason = ctx.pain?.hold ? ctx.pain.reasons[0] : reentry === 'note' || (ctx.gapDays ?? 0) >= 8
    ? 'first session back after a layoff: anchored on your last logged session, no jump' : '';

  switch (slot.model) {
    case 'double':
    case 'linear5x5': {
      let lt = slot.model === 'double'
        ? progressionTarget(last ? toWR(workingSetsOf(last)) : [], [p.repMin, p.repMax], inc, exercise.name, ctx.startingWeight ?? null)
        : linearTarget(exercise, hist, inc, ctx);
      if (ctx.readiness === 'red') lt = easeTarget(lt, [p.repMin, p.repMax], inc);
      if (last && !lt.is_new) {
        const anchor = slot.model === 'double' ? Math.max(...workingSetsOf(last).map((s) => s.weight)) : workedLoad(toWR(last.sets));
        const capped = capLoad(lt.weight, { ...jump, lastWeight: anchor });
        if (capped.capped) {
          lt = lt.mode === 'hypertrophy' && lt.added_weight
            ? easeTarget(lt, [p.repMin, p.repMax], inc)
            : { ...lt, weight: capped.weight, added_weight: capped.weight > anchor };
          lt = { ...lt, rationale: `${lt.rationale.replace(/ — eased for a tired day \(autoregulation\)$/, '')} — held: ${holdReason || capped.reason}` };
        }
      }
      return fromLegacy(lt, slot, exercise, floor);
    }
    case 'topset': return topsetTarget(slot, exercise, hist, ctx, floor, jump, holdReason, scale);
    case 'fixed': {
      if (!last) return newTarget(base, slot, ctx.startingWeight ?? 0);
      const w = last.target?.model === 'fixed' && last.target.rule !== 'pain_regress' && last.target.rule !== 'reentry_block'
        ? last.target.weight : workedLoad(toWR(last.sets));
      return fixedTarget(base, w, p.sets, p.repMin,
        `maintenance: hold ${pyG(w)}kg for ${p.sets} × ${p.repMin} — no progression on this slot`, 'fixed_hold');
    }
  }
}

function linearTarget(exercise: Exercise, hist: LiftSession[], inc: number, ctx: PrescribeContext): LegacyTarget {
  const rows: LegacySetRow[] = hist.flatMap((h) => h.sets.map((s) => ({
    date: h.date, session: h.sessionId, exercise: exercise.id, order: s.slotOrder, set_num: s.setOrder, reps: s.reps, weight: s.weight,
  })));
  const planned: Record<ISODate, number> = {};
  for (const h of hist) if (h.target?.model === 'linear5x5' && !h.target.isNew) planned[h.date] = h.target.weight;
  const factor = exercise.bodyweightFactor;
  const attempts = attemptHistory(rows, exercise.id, { bodyweightFactor: factor, plannedWeight: planned });
  const e1 = bestRecentE1rm(rows, exercise.id, ctx.today, 60, { bodyweightFactor: factor, bodyweightKg: ctx.bodyweightKg });
  const lt = strengthTarget(attempts, exercise.name, inc, { e1rm: e1, startingWeight: ctx.startingWeight ?? null });
  if (factor > 0 && e1 !== null && !lt.prev_top.length && !lt.is_new) {
    // A bodyweight seed: the 5RM-ish effective load minus the body's share is the added load.
    const added = Math.max(0, floorTo((e1 * TM_BUFFER) / FIVE_RM_FACTOR - (ctx.bodyweightKg ?? 0) * factor, inc));
    return { ...lt, weight: added,
      rationale: `seed from recent best (e1RM ${pyFixed(e1, 1)}kg incl. bodyweight x 93% training max) — start 5x5 at +${pyG(added)}kg added` };
  }
  return lt;
}

// ---------------------------------------------------------------- top set + back-offs

/** The top set: a set marked 'top', else the heaviest (first one on ties). */
function topSetOf(sets: SetEntry[]): SetEntry {
  const marked = sets.filter((s) => s.kind === 'top');
  const pool = marked.length ? marked : sets;
  return pool.reduce((best, s) => (s.weight > best.weight ? s : best), pool[0]);
}

/**
 * Load for a 3 × 8 re-entry block. The last session's "worked load" can be a
 * heavy top single or double (imported logs don't mark top sets), which would
 * make 3 × 8 a near-max effort after three weeks off. So the anchor is capped
 * at the load you could do for ~11 reps (8 reps + 3 in reserve) from the
 * session's best e1RM. Bodyweight lifts keep their added load as logged.
 */
function reentryAnchor(sets: SetEntry[], exercise: Exercise, inc: number): number {
  const work = sets.filter((s) => s.kind !== 'warmup' && s.kind !== 'top' && s.reps > 0);
  const pool = work.length ? work : sets.filter((s) => s.reps > 0);
  const worked = workedLoad(toWR(pool));
  if (exercise.bodyweightFactor > 0) return worked;
  const best = Math.max(0, ...sets.filter((s) => s.kind !== 'warmup' && s.reps > 0).map((s) => epley(s.weight, s.reps)));
  const cap = floorTo(best * 30 / (30 + REENTRY_REPS + 3) + EPS, inc);
  return Math.min(worked, cap);
}

/**
 * The sets double progression should read from a past session: those at the
 * load you actually worked. Ramp-up sets aren't marked as warm-ups in
 * imported logs, so "the heaviest set" is often a single ramp set (40 × 10,
 * 60 × 8, 60 × 8, 80 × 5 → 80 × 5). Order of preference: the committed
 * target weight if sets were logged at it; else the load with the most
 * working sets (ties → heavier). Warm-ups and drops never count.
 */
function workingSetsOf(session: LiftSession): SetEntry[] {
  const work = session.sets.filter((s) => s.kind !== 'warmup' && s.kind !== 'drop' && s.reps > 0);
  if (!work.length) return session.sets;
  const committed = session.target?.weight;
  if (committed !== undefined && work.some((s) => s.weight === committed)) return work.filter((s) => s.weight === committed);
  const counts = new Map<number, number>();
  for (const s of work) counts.set(s.weight, (counts.get(s.weight) ?? 0) + 1);
  let best = work[0].weight;
  for (const [w, n] of counts) if (n > (counts.get(best) ?? 0) || (n === counts.get(best) && w > best)) best = w;
  return work.filter((s) => s.weight === best);
}

function backoffsOf(sets: SetEntry[], top: SetEntry): SetEntry[] {
  return sets.some((s) => s.kind === 'top') ? sets.filter((s) => s.kind !== 'top') : sets.filter((s) => s !== top);
}

function topsetTarget(
  slot: Slot, exercise: Exercise, hist: LiftSession[], ctx: PrescribeContext, floor: FloorResult,
  jump: { increment: number; firstSessionBack: boolean; afterLayoff?: boolean }, holdReason: string, scale: EffortScale,
): Target {
  const p = slot.params;
  const inc = jump.increment;
  const topReps = p.topReps ?? 1;
  // backoffPct is a percentage everywhere (85 = 85% of the top set).
  const pct = (p.backoffPct ?? 80) / 100;
  const nB = p.backoffSets ?? p.sets;
  const last = hist[hist.length - 1];
  const base = { slotId: slot.id, exerciseId: exercise.id, exerciseName: exercise.name, rirFloor: floor.floor };
  if (!last) return newTarget(base, slot, ctx.startingWeight ?? 0);

  const lastTop = topSetOf(last.sets);
  const wasTopset = last.sets.some((s) => s.kind === 'top') || last.target?.model === 'topset';
  let top: number;
  let why: string;
  let rule: string;
  const word = repWord(topReps);
  if (!wasTopset) {
    // First top-set session for this lift: a top set with `floor` RIR left
    // is about (reps + RIR) reps from failure, so invert Epley at that count.
    const recent = hist.filter((h) => daysBetween(h.date, ctx.today) <= SEED_WINDOW_DAYS);
    const e1 = Math.max(...(recent.length ? recent : [last]).flatMap((h) =>
      h.sets.filter((s) => s.reps > 0).map((s) => epley(s.weight + bodyShare(exercise, ctx), s.reps))));
    top = Math.max(0, floorTo(e1 / (1 + (topReps + floor.floor) / 30) - bodyShare(exercise, ctx) + EPS, inc));
    why = `first top-set session: best recent e1RM ${pyFixed(e1, 1)}kg → a ${word} with ${floor.floor} RIR left ≈ ${pyG(top)}kg`;
    rule = 'topset_seed';
  } else {
    const prevFloor = last.target?.rirFloor ?? p.rirFloor;
    const plannedReps = last.target?.topReps ?? topReps;
    const failed = !!lastTop.failed || lastTop.reps < plannedReps;
    const rir = lastTop.rir;
    if (failed) {
      top = lastTop.weight - inc;
      why = `top ${word} at ${pyG(lastTop.weight)}kg failed — down ${pyG(inc)}kg`;
      rule = 'topset_down';
    } else if (rir !== undefined && rir < prevFloor) {
      top = lastTop.weight - inc;
      why = `top ${word} at ${pyG(lastTop.weight)}kg went past the floor (${rir} RIR, floor ${prevFloor}) — down ${pyG(inc)}kg`;
      rule = 'topset_down';
    } else if (rir === undefined) {
      top = lastTop.weight;
      why = `no effort logged on the top ${word} at ${pyG(lastTop.weight)}kg — repeat it and rate it`;
      rule = 'topset_repeat';
    } else if (rir >= prevFloor + 1) {
      top = lastTop.weight + inc;
      why = `top ${word} at ${pyG(lastTop.weight)}kg left ${rir} RIR (floor ${prevFloor}) — add ${pyG(inc)}kg`;
      rule = 'topset_up';
    } else {
      top = lastTop.weight;
      why = `top ${word} at ${pyG(lastTop.weight)}kg landed on the floor (${rir} RIR) — repeat it`;
      rule = 'topset_repeat';
    }
  }
  top = round2(Math.max(0, top));
  if (ctx.readiness === 'red' && top > lastTop.weight) {
    top = lastTop.weight;
    why += ' — held for a red readiness day';
  }
  const capped = capLoad(top, { ...jump, lastWeight: lastTop.weight });
  if (capped.capped) {
    top = capped.weight;
    why += ` — held: ${holdReason || capped.reason}`;
  }

  // Back-offs: double progression inside the rep range, anchored to the top.
  const anchorB = floorTo(pct * top + EPS, inc);
  const lastB = wasTopset ? backoffsOf(last.sets, lastTop) : [];
  let B = anchorB;
  let reps = p.repMin;
  if (lastB.length) {
    const lastW = workedLoad(toWR(lastB));
    const atW = lastB.filter((s) => s.weight >= lastW - EPS);
    const plannedR = last.target?.targetReps ?? p.repMin;
    const allCeiling = atW.length >= nB && atW.every((s) => s.reps >= p.repMax);
    const tooEasy = atW.every((s) => s.reps >= plannedR && (s.rir ?? 0) >= BACKOFF_TOO_EASY_RIR);
    // Back-offs keep their own progression unless the top set came down, in
    // which case they follow it back to the anchored percentage.
    if (lastW >= anchorB - EPS && rule !== 'topset_down') {
      const earned = allCeiling || tooEasy;
      const allowed = maxLoadJump({ ...jump, lastWeight: lastW }) > 0 && ctx.readiness !== 'red';
      if (earned && allowed) {
        B = lastW + inc;
        why += `; back-offs ${allCeiling ? `topped ${p.repMax}s` : `were too easy (${BACKOFF_TOO_EASY_RIR}+ RIR)`} at ${pyG(lastW)}kg — add ${pyG(inc)}kg`;
      } else {
        B = lastW;
        reps = Math.max(p.repMin, Math.min(p.repMax, Math.min(...atW.map((s) => s.reps)) + 1));
        why += `; back-offs stay at ${pyG(lastW)}kg, chasing ${reps} reps`;
      }
    }
  }
  B = round2(Math.min(B, top));
  const criterion = `Top ${word} at ${pyG(top)}kg (${formatFloor(floor.floor, scale)}), then ${nB} × ${reps}+ at ${pyG(B)}kg. Both parts count; a heavier top ${word} at the same effort beats it.`;
  return {
    ...base, model: 'topset', weight: B, targetReps: reps, repMax: p.repMax, targetSets: nB,
    topWeight: top, topReps, addedWeight: top > lastTop.weight, prevTop: lastB.map((s) => s.reps), isNew: false,
    criterion, why, rule, principle: 'Top set + back-offs: one heavy set at a safe effort shows strength; back-offs build volume at a fixed share of it.',
  };
}

/**
 * A first target from the user's starting set (no logged session yet). The
 * set's Epley e1RM gives the load for the slot's reps with the floor's RIR
 * left, rounded down to the increment. No jump cap: there is no previous
 * weight to jump from.
 */
function seededTarget(
  slot: Slot, exercise: Exercise, start: { weight: number; reps: number }, ctx: PrescribeContext,
  floor: FloorResult, inc: number, scale: EffortScale, base: Base,
): Target {
  const p = slot.params;
  const share = bodyShare(exercise, ctx);
  const e1 = epley(start.weight + share, start.reps);
  const loadFor = (n: number) => Math.max(0, floorTo(e1 / (1 + (n + floor.floor) / 30) - share + EPS, inc));
  const n = slot.model === 'topset' ? p.topReps ?? 1 : slot.model === 'linear5x5' ? TARGET_REPS : p.repMin;
  const w = round2(loadFor(n));
  // Too light to round to a load: a promise of 0kg means nothing, so log a baseline instead.
  if (w <= 0) return newTarget(base, slot, ctx.startingWeight ?? 0);
  const why = `from your starting set ${pyG(start.weight)} × ${start.reps}: a ${repWord(n)} with ${floor.floor} in reserve ≈ ${pyG(w)} kg`;
  return targetAtWeight(slot, exercise, w, floor, inc, scale, base, why, 'start_seed');
}

/** Back-off weight for a top set: its share of the top, floored to the increment, never above the top. */
export function backoffWeight(top: number, pct: number, inc: number): number {
  return round2(Math.min(floorTo((pct / 100) * top + EPS, inc), top));
}

/**
 * The plan at a weight the lifter set themselves (a one-off workout): the
 * same shapes as a seeded plan, graded the same way, so beating it is still
 * possible. For a top set the weight is the top set; back-offs follow their %.
 */
export function chosenTarget(slot: Slot, exercise: Exercise, weight: number, ctx: PrescribeContext): Target {
  const p = slot.params;
  const inc = p.increment ?? exercise.increment;
  const floor = effortFloor({
    role: effortRole(slot.model, exercise.slotType, true),
    baseFloor: p.rirFloor,
    readiness: ctx.readiness,
    gapDays: ctx.gapDays,
    painReasons: painFloorReasons(ctx.pain),
    reentry: (ctx.reentry ?? 'none') !== 'none',
  });
  const base = { slotId: slot.id, exerciseId: exercise.id, exerciseName: exercise.name, rirFloor: floor.floor };
  return targetAtWeight(slot, exercise, round2(weight), floor, inc, ctx.effortScale ?? 'rir', base, 'Your weight', 'chosen');
}

function targetAtWeight(
  slot: Slot, exercise: Exercise, w: number, floor: FloorResult, inc: number, scale: EffortScale, base: Base, why: string, rule: string,
): Target {
  const p = slot.params;
  const n = slot.model === 'topset' ? p.topReps ?? 1 : slot.model === 'linear5x5' ? TARGET_REPS : p.repMin;

  if (slot.model === 'topset') {
    const nB = p.backoffSets ?? p.sets;
    const B = backoffWeight(w, p.backoffPct ?? 80, inc);
    const word = repWord(n);
    return {
      ...base, model: 'topset', weight: B, targetReps: p.repMin, repMax: p.repMax, targetSets: nB,
      topWeight: w, topReps: n, addedWeight: false, prevTop: [], isNew: false,
      criterion: `Top ${word} at ${pyG(w)}kg (${formatFloor(floor.floor, scale)}), then ${nB} × ${p.repMin}+ at ${pyG(B)}kg. Both parts count; a heavier top ${word} at the same effort beats it.`,
      why, rule, principle: 'Top set + back-offs: one heavy set at a safe effort shows strength; back-offs build volume at a fixed share of it.',
    };
  }
  if (slot.model === 'fixed') return fixedTarget(base, w, p.sets, p.repMin, why, rule);
  if (slot.model === 'double') {
    // Every working set at the bottom of the range; graded by gradeSeedDouble.
    return {
      ...base, model: 'double', weight: w, targetReps: n, repMax: p.repMax, targetSets: null,
      addedWeight: false, prevTop: Array.from({ length: p.sets }, () => n), isNew: false,
      criterion: `Do ${p.sets} × ${n}+ at ${pyG(w)}kg. More reps or more weight beats it.`,
      why, rule, principle: 'Double progression: build reps to the ceiling at a fixed load, then convert the earned reps into added weight.',
    };
  }
  const lt: LegacyTarget = {
    lift: exercise.name, weight: w, target_reps: n, added_weight: false, prev_top: [], is_new: false, rationale: why,
    target_sets: TARGET_SETS, mode: 'strength',
  };
  return { ...fromLegacy(lt, slot, exercise, floor), rule };
}

/** A seeded double: every promised set at the weight and reps; more reps or weight is a beat. */
function gradeSeedDouble(t: Target, work: SetEntry[], out: Out): LiftResult {
  const need = t.prevTop.length;
  const W = pyG(t.weight);
  const qual = work.filter((s) => s.weight >= t.weight - EPS && s.reps >= t.targetReps && !s.failed);
  if (qual.length < need) return out('missed', `${qual.length}/${need} sets of ${t.targetReps} at ${W}kg`);
  const extra = qual.some((s) => s.weight > t.weight + EPS) || qual.reduce((a, s) => a + s.reps, 0) > need * t.targetReps;
  return extra ? out('beat', `${qual.length} sets of ${t.targetReps}+ at ${W}kg or more`) : out('hit', `${need}x${t.targetReps} at ${W}kg done`);
}

function bodyShare(exercise: Exercise, ctx: PrescribeContext): number {
  return exercise.bodyweightFactor > 0 ? (ctx.bodyweightKg ?? 0) * exercise.bodyweightFactor : 0;
}

// ---------------------------------------------------------------- shared shapes

type Base = Pick<Target, 'slotId' | 'exerciseId' | 'exerciseName' | 'rirFloor'>;

function newTarget(base: Base, slot: Slot, weight: number): Target {
  const p = slot.params;
  const isTop = slot.model === 'topset';
  return {
    ...base, model: slot.model, weight, targetReps: p.repMin, repMax: p.repMax, targetSets: p.sets,
    ...(isTop ? { topReps: p.topReps ?? 1, topWeight: weight } : {}),
    addedWeight: false, prevTop: [], isNew: true,
    criterion: isTop
      ? `Work up to a top ${repWord(p.topReps ?? 1)} and log your back-offs — this session sets the baseline.`
      : `Log your sets at ${pyG(weight)}kg — this session sets the baseline.`,
    why: 'new lift — start here and build', rule: 'baseline',
    principle: "Establish a baseline before progressing — you can't overload what you haven't measured.",
  };
}

function fixedTarget(base: Base, weight: number, sets: number, reps: number, why: string, rule: string): Target {
  return {
    ...base, model: 'fixed', weight, targetReps: reps, repMax: reps, targetSets: sets, addedWeight: false, prevTop: [], isNew: false,
    criterion: `Do ${sets} × ${reps} at ${pyG(weight)}kg — done is the goal; there is no beat.`,
    why, rule, principle: rule === 'fixed_hold'
      ? 'Maintenance: a fixed dose holds what you have; completing it is the whole job.'
      : 'Safety beats progression: a lighter, fixed session first, then normal progression resumes.',
  };
}

function fromLegacy(lt: LegacyTarget, slot: Slot, exercise: Exercise, floor: FloorResult): Target {
  const w = legacyWhy(lt);
  return {
    slotId: slot.id, exerciseId: exercise.id, exerciseName: exercise.name, model: slot.model,
    weight: lt.weight, targetReps: lt.target_reps, repMax: slot.params.repMax, targetSets: lt.target_sets,
    rirFloor: floor.floor, addedWeight: lt.added_weight, prevTop: lt.prev_top, isNew: lt.is_new,
    criterion: successCriteria(lt), why: lt.rationale, rule: w.rule, principle: w.principle,
  };
}

export function toLegacy(t: Target): LegacyTarget {
  return {
    lift: t.exerciseName, weight: t.weight, target_reps: t.targetReps, added_weight: t.addedWeight, prev_top: t.prevTop,
    is_new: t.isNew, rationale: t.why, target_sets: t.targetSets, mode: t.model === 'linear5x5' ? 'strength' : 'hypertrophy',
  };
}

// ---------------------------------------------------------------- grade

/** Grade a slot's logged sets against its committed target. Warm-ups never count. */
export function grade(target: Target, sets: SetEntry[], scale: EffortScale = 'rir'): LiftResult {
  const work = workingSets(sets);
  const out = (verdict: Verdict, detail: string): LiftResult => ({ slotId: target.slotId, exerciseId: target.exerciseId, verdict, detail });
  if (target.isNew) return work.length ? out('new', 'logged') : out('missed', 'not done');
  if ((target.rule === 'start_seed' || target.rule === 'chosen') && target.model === 'double') return gradeSeedDouble(target, work, out);
  if (target.model === 'double' || target.model === 'linear5x5') {
    const r = scoreLift(toWR(work), toLegacy(target));
    return out(r.status, r.detail);
  }
  if (target.model === 'fixed') return gradeFixed(target, work, out);
  return gradeTopset(target, work, scale, out);
}

type Out = (v: Verdict, d: string) => LiftResult;

function gradeFixed(t: Target, work: SetEntry[], out: Out): LiftResult {
  const sets = t.targetSets ?? 1;
  const n = work.filter((s) => s.weight >= t.weight - EPS && s.reps >= t.targetReps && !s.failed).length;
  if (n >= sets) return out('hit', `${sets}x${t.targetReps} at ${pyG(t.weight)}kg done`);
  return out('missed', `${n}/${sets} sets of ${t.targetReps} at ${pyG(t.weight)}kg`);
}

function gradeTopset(t: Target, work: SetEntry[], scale: EffortScale, out: Out): LiftResult {
  const topW = t.topWeight ?? t.weight;
  const topReps = t.topReps ?? 1;
  const nB = t.targetSets ?? 0;
  if (!work.length) return out('missed', 'not done');
  const marked = work.filter((s) => s.kind === 'top');
  const candidates = marked.length ? marked : [topSetOf(work)];
  const withinFloor = (s: SetEntry) => s.rir === undefined || s.rir >= t.rirFloor;
  const good = candidates.filter((s) => s.weight >= topW - EPS && s.reps >= topReps && !s.failed && withinFloor(s));
  if (!good.length) {
    const tried = candidates.filter((s) => s.weight >= topW - EPS);
    const s = tried[0];
    if (!s) return out('missed', `no top ${repWord(topReps)} at ${pyG(topW)}kg`);
    if (s.failed || s.reps < topReps) return out('missed', `top set at ${pyG(s.weight)}kg x ${s.reps} short of ${topReps}`);
    return out('missed', `top set at ${pyG(s.weight)}kg went past the floor (${formatFloor(t.rirFloor, scale)})`);
  }
  const best = good.reduce((a, s) => (s.weight > a.weight ? s : a), good[0]);
  const backs = marked.length ? work.filter((s) => s.kind !== 'top') : work.filter((s) => s !== candidates[0]);
  const nDone = backs.filter((s) => s.weight >= t.weight - EPS && s.reps >= t.targetReps && !s.failed).length;
  if (nDone < nB) return out('missed', `top set done; back-offs ${nDone}/${nB} sets of ${t.targetReps} at ${pyG(t.weight)}kg`);
  if (best.weight > topW + EPS) return out('beat', `top ${pyG(best.weight)}kg x ${best.reps} (planned ${pyG(topW)}kg) and ${nB} back-offs done`);
  return out('hit', `top ${pyG(topW)}kg x ${topReps} within the floor and ${nB} × ${t.targetReps} at ${pyG(t.weight)}kg done`);
}

// ---------------------------------------------------------------- as prescribed

export interface PlannedSet {
  kind: SetEntry['kind'];
  weight: number;
  reps: number;
  rir?: number;
}

/**
 * The least work that keeps the promise, set by set. Logging exactly this
 * grades 'hit' ('new' for a baseline) — the property the tests pin down.
 */
export function minimumToKeep(t: Target): PlannedSet[] {
  const w = t.weight;
  if (t.isNew) return [{ kind: t.model === 'topset' ? 'top' : 'working', weight: t.topWeight ?? w, reps: t.topReps ?? t.targetReps }];
  if (t.model === 'topset') {
    return [
      { kind: 'top', weight: t.topWeight ?? w, reps: t.topReps ?? 1, rir: t.rirFloor },
      ...Array.from({ length: t.targetSets ?? 0 }, () => ({ kind: 'backoff' as const, weight: w, reps: t.targetReps, rir: t.rirFloor })),
    ];
  }
  if (t.model === 'fixed' || t.model === 'linear5x5') {
    return Array.from({ length: t.targetSets ?? 1 }, () => ({ kind: 'working' as const, weight: w, reps: t.targetReps }));
  }
  if (t.rule === 'start_seed' || t.rule === 'chosen') return t.prevTop.map((r) => ({ kind: 'working' as const, weight: w, reps: r }));
  const lt = toLegacy(t);
  if (lt.added_weight) return [{ kind: 'working', weight: w, reps: t.targetReps }];
  if (t.prevTop.length && t.prevTop.every((r) => r >= t.targetReps)) {
    return Array.from({ length: MIN_SETS_AT_TOP }, () => ({ kind: 'working' as const, weight: w, reps: t.targetReps }));
  }
  return t.prevTop.map((r) => ({ kind: 'working' as const, weight: w, reps: r }));
}
