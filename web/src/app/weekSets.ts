// This week's working sets by body part, done vs planned (Today's panel;
// docs/superpowers/specs/2026-11-22-tab-jobs-design.md).
//
// Counting: a set counts 1 toward the body part of its lift's FIRST-listed
// muscle (bench → Chest), so numbers stay whole and read like "10 chest sets".
// Planned: the program's sets for each program session logged this week, plus
// the next sessions in the rotation until the week reaches the weekly target.
import type { Exercise, ISODate, Program, Session, SetEntry, Slot } from '../domain/types';
import { effectiveSlot } from './coach';
import { addDays, weekday } from './dates';

export const BODY_PARTS = ['Legs', 'Chest', 'Back', 'Shoulders', 'Arms', 'Core'] as const;
export type BodyPart = typeof BODY_PARTS[number];

const GROUP: Record<string, BodyPart> = {
  quads: 'Legs', glutes: 'Legs', hamstrings: 'Legs', adductors: 'Legs', calves: 'Legs',
  chest: 'Chest', upper_chest: 'Chest',
  lats: 'Back', upper_back: 'Back', traps: 'Back', spinal_erectors: 'Back',
  front_delts: 'Shoulders', side_delts: 'Shoulders', rear_delts: 'Shoulders',
  biceps: 'Arms', triceps: 'Arms', forearms: 'Arms',
  abs: 'Core', core: 'Core', hip_flexors: 'Core',
};

export function bodyPartOf(muscle: string): BodyPart | null {
  return GROUP[muscle] ?? null;
}

/** Working sets a slot plans: the top set plus back-offs, or its set count. Apply effectiveSlot first. */
export function slotPlannedSets(slot: Slot): number {
  return slot.model === 'topset' ? 1 + (slot.params.backoffSets ?? 0) : slot.params.sets;
}

export interface BodyPartRow { part: BodyPart; done: number; planned: number }

export function weekBodyPartSets(inp: {
  sets: SetEntry[];
  sessions: Session[];
  exercises: Record<string, Exercise>;
  program: Program | null;
  /** The next program session in the rotation (coach.nextRotationKey). */
  nextKey: string | null;
  /** Sessions per week. */
  target: number;
  today: ISODate;
}): BodyPartRow[] {
  const monday = addDays(inp.today, -((weekday(inp.today) + 6) % 7));
  const inWeek = (d: ISODate) => d >= monday && d <= inp.today;
  const week = inp.sessions.filter(s => inWeek(s.date));
  const weekIds = new Set(week.map(s => s.id));
  const done = new Map<BodyPart, number>();
  const planned = new Map<BodyPart, number>();
  const partOf = (exerciseId: string) => {
    const m = inp.exercises[exerciseId]?.muscles[0];
    return m ? bodyPartOf(m) : null;
  };

  for (const s of inp.sets) {
    if (s.kind === 'warmup' || !weekIds.has(s.sessionId)) continue;
    const p = partOf(s.exerciseId);
    if (p) done.set(p, (done.get(p) ?? 0) + 1);
  }

  const prog = inp.program;
  if (prog) {
    const byKey = new Map(prog.sessions.map(s => [s.key, s]));
    const keys = week.map(s => s.programSessionKey).filter(k => byKey.has(k));
    const rot = prog.rotation.filter(k => byKey.has(k));
    let i = inp.nextKey ? rot.indexOf(inp.nextKey) : -1;
    for (let left = Math.max(0, inp.target - keys.length); left > 0 && i >= 0 && rot.length; left--) {
      keys.push(rot[i]);
      i = (i + 1) % rot.length;
    }
    for (const k of keys) {
      for (const slot of byKey.get(k)!.slots) {
        const p = partOf(slot.exerciseId);
        if (p) planned.set(p, (planned.get(p) ?? 0) + slotPlannedSets(effectiveSlot(slot, prog, inp.today)));
      }
    }
  }

  return BODY_PARTS
    .map(part => ({ part, done: done.get(part) ?? 0, planned: planned.get(part) ?? 0 }))
    .filter(r => r.done > 0 || r.planned > 0);
}
