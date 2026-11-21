import { describe, expect, it } from 'vitest';
import type { Program, Session, SetEntry, Slot } from '../domain/types';
import { defaultCatalog } from '../domain/catalog';
import { bodyPartOf, slotPlannedSets, weekBodyPartSets } from './weekSets';

const catalog = defaultCatalog();
const exercises = Object.fromEntries(catalog.map(e => [e.id, e]));
const SQ = 'back-squat', BP = 'barbell-bench-press', ROW = 'barbell-row';

const slot = (id: string, exerciseId: string, sets: number, model: Slot['model'] = 'double', extra = {}): Slot =>
  ({ id, exerciseId, model, params: { sets, repMin: 5, repMax: 8, rirFloor: 1, ...extra } });
const program: Program = {
  id: 'p', name: 'P', rotation: ['A', 'B', 'C'], phases: [],
  sessions: [
    { key: 'A', name: 'A', minimumSlotIds: [], slots: [slot('a1', SQ, 3), slot('a2', BP, 3)] },
    { key: 'B', name: 'B', minimumSlotIds: [], slots: [slot('b1', ROW, 4)] },
    { key: 'C', name: 'C', minimumSlotIds: [], slots: [slot('c1', SQ, 1, 'topset', { backoffSets: 2, topReps: 2, backoffPct: 85 })] },
  ],
};
const ses = (id: string, date: string, key = 'A'): Session =>
  ({ id, programSessionKey: key, nameSnapshot: key, date, startedAt: 0, sealed: true });
let n = 0;
const sets = (sessionId: string, exerciseId: string, count: number, kind: SetEntry['kind'] = 'working'): SetEntry[] =>
  Array.from({ length: count }, (_, i) => ({ id: `x${n++}`, sessionId, exerciseId, exerciseNameSnapshot: exerciseId, slotOrder: 1, setOrder: i + 1, kind, weight: 60, reps: 5, loggedAt: 0 }));
// 2026-11-18 is a Wednesday; its week runs Mon 16 → Sun 22.
const TODAY = '2026-11-18';
const row = (rows: ReturnType<typeof weekBodyPartSets>, part: string) => rows.find(r => r.part === part);

describe('body parts', () => {
  it('every catalog muscle has a body part', () => {
    for (const e of catalog) for (const m of e.muscles) expect(bodyPartOf(m), `${e.name}: ${m}`).not.toBeNull();
  });
  it('top-set slots plan 1 + back-offs; others their set count', () => {
    expect(slotPlannedSets(program.sessions[2].slots[0])).toBe(3);
    expect(slotPlannedSets(program.sessions[0].slots[0])).toBe(3);
  });
});

describe('weekBodyPartSets', () => {
  const base = { exercises, program, target: 3, today: TODAY };
  it('counts a set toward its first muscle only', () => {
    const s = [ses('s1', '2026-11-16')];
    const r = weekBodyPartSets({ ...base, sessions: s, sets: sets('s1', BP, 3), nextKey: 'B' });
    expect(row(r, 'Chest')?.done).toBe(3);
    expect(row(r, 'Shoulders')?.done ?? 0).toBe(0);
    expect(row(r, 'Arms')?.done ?? 0).toBe(0);
  });
  it("ignores warm-ups and last week's sets", () => {
    const s = [ses('s1', '2026-11-16'), ses('s0', '2026-11-15')];
    const r = weekBodyPartSets({ ...base, sessions: s, sets: [...sets('s1', SQ, 2, 'warmup'), ...sets('s1', SQ, 1), ...sets('s0', SQ, 5)], nextKey: 'B' });
    expect(row(r, 'Legs')?.done).toBe(1);
  });
  it('planned = logged program sessions + upcoming rotation up to target', () => {
    const r = weekBodyPartSets({ ...base, sessions: [ses('s1', '2026-11-16', 'A')], sets: [], nextKey: 'B' });
    // A: squat 3 (Legs) + bench 3 (Chest); B: row 4 (Back); C: top set 1 + 2 back-offs (Legs)
    expect(r).toEqual([
      { part: 'Legs', done: 0, planned: 6 },
      { part: 'Chest', done: 0, planned: 3 },
      { part: 'Back', done: 0, planned: 4 },
    ]);
  });
  it('more sessions than target: planned covers the logged ones only', () => {
    const s = ['16', '17', '18'].map((d, i) => ses(`s${i}`, `2026-11-${d}`, 'A')).concat(ses('s9', '2026-11-18', 'B'));
    const r = weekBodyPartSets({ ...base, sessions: s, sets: [], nextKey: 'C' });
    expect(row(r, 'Legs')?.planned).toBe(9);
    expect(row(r, 'Back')?.planned).toBe(4);
  });
  it('no program: planned is 0, done still counts', () => {
    const r = weekBodyPartSets({ ...base, program: null, sessions: [ses('s1', '2026-11-17')], sets: sets('s1', SQ, 4), nextKey: null });
    expect(r).toEqual([{ part: 'Legs', done: 4, planned: 0 }]);
  });
  it('imported sessions add done, not planned', () => {
    const r = weekBodyPartSets({ ...base, target: 0, sessions: [ses('s1', '2026-11-17', 'import:x')], sets: sets('s1', ROW, 2), nextKey: 'A' });
    expect(r).toEqual([{ part: 'Back', done: 2, planned: 0 }]);
  });
  it('phase overrides change the planned set count', () => {
    const p: Program = { ...program, phases: [{ name: 'deload', start: '2026-11-16', end: '2026-11-22', overrides: { double: { sets: 1 } } }] };
    const r = weekBodyPartSets({ ...base, program: p, target: 1, sessions: [], sets: [], nextKey: 'A' });
    expect(row(r, 'Legs')?.planned).toBe(1);
    expect(row(r, 'Chest')?.planned).toBe(1);
  });
});
