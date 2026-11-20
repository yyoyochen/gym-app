// Form validation for Profile, Program editor and Onboarding. Pure: each
// function returns plain-language error strings (empty array = valid).
import type { GoalTarget, ISODate, ModelKind, Phase, Profile, SlotParams } from '../domain/types';
import { isISODate } from '../db/util';

export type NumResult = { ok: true; value: number | undefined } | { ok: false; error: string };

/** Parse a number typed into a text field. Blank → undefined (when allowed). Accepts a decimal comma. */
export function parseNum(
  text: string,
  opts: { min?: number; max?: number; integer?: boolean; required?: boolean; name?: string } = {},
): NumResult {
  const name = opts.name ?? 'Value';
  const t = text.trim().replace(',', '.');
  if (t === '') return opts.required ? { ok: false, error: `${name} is required` } : { ok: true, value: undefined };
  const n = Number(t);
  if (!Number.isFinite(n)) return { ok: false, error: `${name} must be a number` };
  if (opts.integer && !Number.isInteger(n)) return { ok: false, error: `${name} must be a whole number` };
  if (opts.min !== undefined && n < opts.min) return { ok: false, error: `${name} must be at least ${opts.min}` };
  if (opts.max !== undefined && n > opts.max) return { ok: false, error: `${name} must be at most ${opts.max}` };
  return { ok: true, value: n };
}

export function validateBirthYear(y: number | undefined, thisYear: number): string[] {
  if (y === undefined) return [];
  if (!Number.isInteger(y) || y < 1920 || y > thisYear - 10) return [`Birth year must be between 1920 and ${thisYear - 10}`];
  return [];
}

export function validateBodyweight(kg: number | undefined): string[] {
  if (kg === undefined) return [];
  return kg >= 25 && kg <= 300 ? [] : ['Bodyweight must be between 25 and 300 kg'];
}

export function validateProfile(p: Profile, thisYear: number): string[] {
  const e: string[] = [];
  e.push(...validateBirthYear(p.birthYear, thisYear));
  if (p.heightCm !== undefined && (p.heightCm < 100 || p.heightCm > 250)) e.push('Height must be between 100 and 250 cm');
  if (p.trainingAgeYears !== undefined && (p.trainingAgeYears < 0 || p.trainingAgeYears > 70)) e.push('Training age must be between 0 and 70 years');
  if (!Number.isInteger(p.sessionsPerWeekTarget) || p.sessionsPerWeekTarget < 1 || p.sessionsPerWeekTarget > 14) e.push('Sessions per week must be between 1 and 14');
  if (!Number.isInteger(p.sessionsPerWeekMin) || p.sessionsPerWeekMin < 1) e.push('Minimum sessions per week must be at least 1');
  else if (p.sessionsPerWeekMin > p.sessionsPerWeekTarget) e.push('Minimum sessions per week can’t be above the target');
  if (!p.goals.includes(p.primaryGoal)) e.push('The primary goal must be one of the selected goals');
  return e;
}

export interface TargetDraft {
  subject: string;
  value: string;
  type: GoalTarget['type'];
  deadline: string;
}

/** Validates a target draft; `today` rejects deadlines in the past. */
export function validateTarget(d: TargetDraft, today: ISODate): { errors: string[]; value?: number } {
  const errors: string[] = [];
  if (!d.subject) errors.push('Pick what the target is for');
  const isSessions = d.subject === 'sessions_per_week';
  const n = parseNum(d.value, {
    required: true, name: 'Value',
    min: isSessions ? 1 : d.subject === 'bodyweight' ? 25 : 0.5,
    max: isSessions ? 14 : 500,
    integer: isSessions,
  });
  if (!n.ok) errors.push(n.error);
  if (!isISODate(d.deadline)) errors.push('Pick a deadline');
  else if (d.deadline <= today) errors.push('The deadline must be after today');
  return { errors, value: n.ok ? n.value : undefined };
}

export function validateSlotParams(model: ModelKind, p: SlotParams): string[] {
  const e: string[] = [];
  const int = (v: number | undefined) => v !== undefined && Number.isInteger(v);
  if (!int(p.sets) || p.sets < 1 || p.sets > 10) e.push('Sets must be 1–10');
  if (!int(p.repMin) || !int(p.repMax) || p.repMin < 1 || p.repMax > 50) e.push('Reps must be 1–50');
  else if (p.repMin > p.repMax) e.push('Rep range: the low end can’t be above the high end');
  if (!Number.isFinite(p.rirFloor) || p.rirFloor < 0 || p.rirFloor > 5) e.push('Effort floor must be 0–5 RIR');
  if (model === 'topset') {
    if (!int(p.topReps) || (p.topReps as number) < 1 || (p.topReps as number) > 5) e.push('Top-set reps must be 1–5');
    if (!int(p.backoffSets) || (p.backoffSets as number) < 0 || (p.backoffSets as number) > 8) e.push('Back-off sets must be 0–8');
    if (p.backoffPct === undefined || !Number.isFinite(p.backoffPct) || p.backoffPct < 50 || p.backoffPct > 100) e.push('Back-off % must be 50–100 (85 = 85% of the top set)');
  }
  if (p.increment !== undefined && (!(p.increment > 0) || p.increment > 20)) e.push('Increment must be above 0 and at most 20 kg');
  return e;
}

export function validatePhase(ph: Phase, others: Phase[] = []): string[] {
  const e: string[] = [];
  if (!ph.name.trim()) e.push('Name the phase');
  if (!isISODate(ph.start) || !isISODate(ph.end)) e.push('Pick a start and end date');
  else {
    if (ph.end < ph.start) e.push('The phase ends before it starts');
    const clash = others.find(o => o !== ph && isISODate(o.start) && isISODate(o.end) && o.start <= ph.end && ph.start <= o.end);
    if (clash) e.push(`Overlaps “${clash.name}”`);
  }
  return e;
}
