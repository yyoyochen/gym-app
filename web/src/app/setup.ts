// Setup (docs/superpowers/specs/2026-11-23-first-five-minutes-design.md):
// which lifts to ask a starting set for, and how starting sets are read back.
// A starting set seeds a lift's first target only; it is never a logged set.
import { getExerciseHistory, type GymDb } from '../db';
import { EX } from '../domain/catalog';
import type { ISODate, Profile, Program, StartingSet } from '../domain/types';

/** Squat, bench, deadlift and overhead press: the lifts setup asks about. */
export const MAIN_LIFT_IDS: readonly string[] = [EX.squat, EX.bench, EX.deadlift, EX.ohp];
const MAX_ASKED = 4;
export const START_REPS = { min: 1, max: 12 } as const;

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
    && typeof s.weight === 'number' && Number.isFinite(s.weight) && s.weight > 0
    && typeof s.reps === 'number' && Number.isInteger(s.reps) && s.reps >= START_REPS.min && s.reps <= START_REPS.max;
}

/** The profile's valid starting sets (an old or hand-edited backup may hold anything). */
export function startingSetsOf(profile: Profile | undefined): StartingSet[] {
  const list = profile?.startingSets;
  return Array.isArray(list) ? list.filter(valid) : [];
}

/** The starting set the planner may seed from, if the profile holds a valid one for this lift. */
export function startingSetFor(profile: Profile | undefined, exerciseId: string): { weight: number; reps: number } | undefined {
  const s = startingSetsOf(profile).find(x => x.exerciseId === exerciseId);
  return s ? { weight: s.weight, reps: s.reps } : undefined;
}

/** Starting sets whose lift has no logged session yet: the ones that still matter. */
export async function pendingStartingSets(db: GymDb, profile: Profile | undefined): Promise<StartingSet[]> {
  const out: StartingSet[] = [];
  for (const s of startingSetsOf(profile)) {
    if (!(await getExerciseHistory(db, s.exerciseId, { limit: 1 })).length) out.push(s);
  }
  return out;
}
