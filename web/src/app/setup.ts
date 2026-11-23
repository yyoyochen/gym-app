// Setup (docs/superpowers/specs/2026-11-23-first-five-minutes-design.md):
// which lifts to ask a starting set for, and how starting sets are read back.
// A starting set seeds a lift's first target only; it is never a logged set.
import { getExerciseHistory, type GymDb } from '../db';
import { EX } from '../domain/catalog';
import { daysBetween } from '../engine/dates';
import type { ISODate, Profile, Program, StartingSet } from '../domain/types';
import { t } from '../i18n';

/** Squat, bench, deadlift and overhead press: the lifts setup asks about. */
export const MAIN_LIFT_IDS: readonly string[] = [EX.squat, EX.bench, EX.deadlift, EX.ohp];
const MAX_ASKED = 4;
export const START_REPS = { min: 1, max: 12 } as const;
/** Heaviest starting set accepted (setup's own limit). */
export const START_MAX_KG = 500;
/** A "best set in the last month" stops seeding after this many days (as the planner's own seed window). */
export const START_TTL_DAYS = 60;

/** The program's main lifts in program order, first occurrence only, at most four. */
export function mainLifts(program: Program): string[] {
  const out: string[] = [];
  for (const s of program.sessions) for (const slot of s.slots) {
    if (MAIN_LIFT_IDS.includes(slot.exerciseId) && !out.includes(slot.exerciseId)) out.push(slot.exerciseId);
  }
  return out.slice(0, MAX_ASKED);
}

export interface NumberRow { exerciseId: string; weight: number | null; reps: number; skipped: boolean }

const clampReps = (r: number) => Math.min(START_REPS.max, Math.max(START_REPS.min, Math.round(r)));

/** The rows of "Your numbers" as starting sets: skipped and empty rows dropped, reps 1–12. */
export function startingSetsFromRows(rows: NumberRow[], date: ISODate): StartingSet[] {
  return rows
    .filter(r => !r.skipped && r.weight !== null && Number.isFinite(r.weight) && r.weight > 0)
    .map(r => ({ exerciseId: r.exerciseId, weight: r.weight as number, reps: clampReps(r.reps), date }));
}

function valid(s: Partial<StartingSet> | null | undefined): s is StartingSet {
  return !!s && typeof s.exerciseId === 'string'
    && typeof s.weight === 'number' && Number.isFinite(s.weight) && s.weight > 0 && s.weight <= START_MAX_KG
    && typeof s.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.date)
    && typeof s.reps === 'number' && Number.isInteger(s.reps) && s.reps >= START_REPS.min && s.reps <= START_REPS.max;
}

/** The profile's valid starting sets (an old or hand-edited backup may hold anything). */
export function startingSetsOf(profile: Profile | undefined): StartingSet[] {
  const list = profile?.startingSets;
  return Array.isArray(list) ? list.filter(valid) : [];
}

const fresh = (s: StartingSet, today: ISODate) => daysBetween(s.date, today) <= START_TTL_DAYS;

/** The starting set the planner may seed from: a valid one for this lift, at most 60 days old. */
export function startingSetFor(profile: Profile | undefined, exerciseId: string, today: ISODate): { weight: number; reps: number } | undefined {
  const s = startingSetsOf(profile).find(x => x.exerciseId === exerciseId && fresh(x, today));
  return s ? { weight: s.weight, reps: s.reps } : undefined;
}

/** Whether a lift has any logged non-warm-up set: what ends its starting set (as in the planner). */
export async function hasLoggedWork(db: GymDb, exerciseId: string): Promise<boolean> {
  return (await getExerciseHistory(db, exerciseId)).some(d => d.sets.some(x => x.kind !== 'warmup'));
}

/** Starting sets whose lift has no logged session yet: the ones that still matter. */
export async function pendingStartingSets(db: GymDb, profile: Profile | undefined, today: ISODate): Promise<StartingSet[]> {
  const out: StartingSet[] = [];
  for (const s of startingSetsOf(profile).filter(x => fresh(x, today))) {
    if (!(await hasLoggedWork(db, s.exerciseId))) out.push(s);
  }
  return out;
}

/** The setup screens, in order (screens/Onboarding.tsx routes onboarding/1…4). */
export const SETUP_STEPS = ['About you', 'Program', 'Your numbers', 'How it works'] as const;

/** A setup step's name as shown, in the app's language. */
export function setupStepLabel(i: number): string {
  return [t('About you'), t('Program'), t('Your numbers'), t('How it works')][i] ?? SETUP_STEPS[i];
}

/** Fix a typo in a starting set: new weight and reps (1–12), same date. */
export function editStartingSet(list: StartingSet[], exerciseId: string, weight: number, reps: number): StartingSet[] {
  return list.map(s => (s.exerciseId === exerciseId ? { ...s, weight, reps: clampReps(reps) } : s));
}

export function removeStartingSet(list: StartingSet[], exerciseId: string): StartingSet[] {
  return list.filter(s => s.exerciseId !== exerciseId);
}
