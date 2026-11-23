// Pure edit operations for the program editor (spec §3.8). Every function
// returns a new Program; nothing here touches the db.
import type { Exercise, ModelKind, Program, ProgramSession, Slot, SlotParams } from '../domain/types';
import { RIR_FLOOR } from '../domain/templates';
import { newId } from '../db/util';

export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (from < 0 || from >= arr.length || to < 0 || to >= arr.length || from === to) return arr.slice();
  const out = arr.slice();
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
}

const mapSession = (p: Program, key: string, f: (s: ProgramSession) => ProgramSession): Program =>
  ({ ...p, sessions: p.sessions.map(s => (s.key === key ? f(s) : s)) });

/** Rotation keeps session order; `inRotation` says which sessions take part. */
export function orderedRotation(sessions: ProgramSession[], inRotation: Set<string>): string[] {
  return sessions.map(s => s.key).filter(k => inRotation.has(k));
}

export function nextSessionKey(p: Program): string {
  const used = new Set(p.sessions.map(s => s.key));
  for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (!used.has(c)) return c;
  let n = p.sessions.length + 1;
  while (used.has(`S${n}`)) n++;
  return `S${n}`;
}

/** A program to plan from scratch: one empty Session A, nothing else. */
export function blankProgram(): Program {
  return addSession({ id: newId('prog'), name: 'My program', sessions: [], rotation: [], phases: [] });
}

export function addSession(p: Program, name?: string): Program {
  const key = nextSessionKey(p);
  const s: ProgramSession = { key, name: name?.trim() || `Session ${key}`, slots: [], minimumSlotIds: [] };
  return { ...p, sessions: [...p.sessions, s], rotation: [...p.rotation, key] };
}

export function renameSession(p: Program, key: string, name: string): Program {
  return mapSession(p, key, s => ({ ...s, name }));
}

export function deleteSession(p: Program, key: string): Program {
  return { ...p, sessions: p.sessions.filter(s => s.key !== key), rotation: p.rotation.filter(k => k !== key) };
}

export function moveSession(p: Program, key: string, dir: -1 | 1): Program {
  const i = p.sessions.findIndex(s => s.key === key);
  const sessions = moveItem(p.sessions, i, i + dir);
  return { ...p, sessions, rotation: orderedRotation(sessions, new Set(p.rotation)) };
}

export function setInRotation(p: Program, key: string, on: boolean): Program {
  const set = new Set(p.rotation);
  if (on) set.add(key); else set.delete(key);
  return { ...p, rotation: orderedRotation(p.sessions, set) };
}

/** Default params for a new slot, by exercise type and model. */
export function defaultParams(model: ModelKind, slotType: Exercise['slotType']): SlotParams {
  const iso = slotType === 'isolation';
  switch (model) {
    case 'topset': return { sets: 1, topReps: 2, backoffSets: 3, backoffPct: 85, repMin: 6, repMax: 8, rirFloor: RIR_FLOOR.top };
    case 'linear5x5': return { sets: 5, repMin: 5, repMax: 5, rirFloor: RIR_FLOOR.compound };
    case 'fixed': return { sets: 3, repMin: iso ? 12 : 8, repMax: iso ? 12 : 8, rirFloor: iso ? RIR_FLOOR.isolation : RIR_FLOOR.compound };
    default: return iso
      ? { sets: 3, repMin: 10, repMax: 15, rirFloor: RIR_FLOOR.isolation }
      : { sets: 3, repMin: 6, repMax: 10, rirFloor: RIR_FLOOR.compound };
  }
}

export function addSlot(p: Program, key: string, ex: Exercise, id: string = newId('slot')): Program {
  const slot: Slot = { id, exerciseId: ex.id, model: 'double', params: defaultParams('double', ex.slotType) };
  return mapSession(p, key, s => ({ ...s, slots: [...s.slots, slot] }));
}

export function removeSlot(p: Program, key: string, slotId: string): Program {
  return mapSession(p, key, s => ({
    ...s, slots: s.slots.filter(x => x.id !== slotId), minimumSlotIds: s.minimumSlotIds.filter(x => x !== slotId),
  }));
}

export function moveSlot(p: Program, key: string, slotId: string, dir: -1 | 1): Program {
  return mapSession(p, key, s => {
    const i = s.slots.findIndex(x => x.id === slotId);
    return { ...s, slots: moveItem(s.slots, i, i + dir) };
  });
}

/** Swap the exercise in a slot; the slot keeps its id, model and params. */
export function swapExercise(p: Program, key: string, slotId: string, exerciseId: string): Program {
  return updateSlot(p, key, slotId, x => ({ ...x, exerciseId }));
}

export function updateSlot(p: Program, key: string, slotId: string, f: (s: Slot) => Slot): Program {
  return mapSession(p, key, s => ({ ...s, slots: s.slots.map(x => (x.id === slotId ? f(x) : x)) }));
}

/** Change a slot's model. Keeps the rep range and floor; adds or drops the top-set fields. */
export function changeModel(slot: Slot, model: ModelKind, slotType: Exercise['slotType'] = 'compound'): Slot {
  if (model === slot.model) return slot;
  const d = defaultParams(model, slotType);
  const { topReps: _t, backoffPct: _b, backoffSets: _s, ...rest } = slot.params;
  void _t; void _b; void _s;
  let params: SlotParams;
  if (model === 'topset') params = { ...rest, sets: 1, topReps: d.topReps, backoffSets: d.backoffSets, backoffPct: d.backoffPct, rirFloor: d.rirFloor };
  else if (model === 'linear5x5') params = { ...rest, sets: 5, repMin: 5, repMax: 5 };
  else params = { ...rest, sets: slot.model === 'topset' ? 3 : rest.sets };
  return { ...slot, model, params };
}

export function toggleMinimum(p: Program, key: string, slotId: string): Program {
  return mapSession(p, key, s => ({
    ...s,
    minimumSlotIds: s.minimumSlotIds.includes(slotId) ? s.minimumSlotIds.filter(x => x !== slotId) : [...s.minimumSlotIds, slotId],
  }));
}

export const MODEL_LABELS: Record<ModelKind, string> = {
  double: 'Double progression',
  linear5x5: 'Linear 5 × 5',
  topset: 'Top set + back-offs',
  fixed: 'Fixed',
};

const range = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`);

/** "top 2 + 3×6–8 @ 85%", "3×8–12", "5×5". */
export function describeSlot(s: Slot): string {
  const p = s.params;
  if (s.model === 'topset') {
    const top = `top ${p.topReps ?? 1}`;
    return p.backoffSets ? `${top} + ${p.backoffSets}×${range(p.repMin, p.repMax)} @ ${p.backoffPct ?? 85}%` : top;
  }
  return `${p.sets}×${range(p.repMin, p.repMax)}`;
}

/** A unique id for a new custom exercise name. */
export function uniqueExerciseId(base: string, taken: Set<string>): string {
  let id = base, k = 2;
  while (taken.has(id)) id = `${base}-${k++}`;
  return id;
}
