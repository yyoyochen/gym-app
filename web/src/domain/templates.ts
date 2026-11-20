// Built-in program templates (docs/PWA-SPEC.md §3.8). Slots, models and
// default parameters only — never weights: starting loads come from the log or
// a baseline session. Effort floors follow §3.3.1: top sets 2 RIR, compound
// working sets 2 RIR (the engine may let the last set go to 1), isolation 1 RIR.
//
// Param conventions (shared with src/engine):
//   - `sets` = working sets for double/linear/fixed; for `topset` it is the
//     number of top sets (1), with `backoffSets` back-offs after it.
//   - `backoffPct` is a percentage of the top-set weight (85 = 85 %).
import type { ModelKind, Program, ProgramSession, Slot, SlotParams } from './types';
import { EX } from './catalog';

export const RIR_FLOOR = { top: 2, compound: 2, isolation: 1 } as const;

export interface TemplateInfo {
  id: string;
  name: string;
  days: string;
  shape: string;
  fitsGoal: string;
}

type SlotDef = [exerciseId: string, model: ModelKind, params: SlotParams];

const top = (topReps: number, backoffSets: number, repMin: number, repMax: number, backoffPct = 85): SlotParams =>
  ({ sets: 1, topReps, backoffSets, backoffPct, repMin, repMax, rirFloor: RIR_FLOOR.top });
const dbl = (sets: number, repMin: number, repMax: number, isolation = false): SlotParams =>
  ({ sets, repMin, repMax, rirFloor: isolation ? RIR_FLOOR.isolation : RIR_FLOOR.compound });
const lin = (): SlotParams => ({ sets: 5, repMin: 5, repMax: 5, rirFloor: RIR_FLOOR.compound });

function session(templateId: string, key: string, name: string, defs: SlotDef[], minimum: number[]): ProgramSession {
  const slots: Slot[] = defs.map(([exerciseId, model, params], i) => ({
    id: `${templateId}.${key}.${i + 1}`,
    exerciseId,
    model,
    params,
  }));
  return { key, name, slots, minimumSlotIds: minimum.map(i => slots[i].id) };
}

function fullBody(): Program {
  const t = 'fullbody-abc';
  return {
    id: t, name: 'Full body A/B/C', templateId: t, rotation: ['A', 'B', 'C'], phases: [],
    sessions: [
      session(t, 'A', 'A · Squat + Bench', [
        [EX.squat, 'topset', top(2, 3, 6, 8)],
        [EX.bench, 'topset', top(2, 3, 6, 8)],
        ['barbell-row', 'double', dbl(3, 8, 12)],
        ['db-lateral-raise', 'double', dbl(3, 12, 20, true)],
      ], [0, 1]),
      session(t, 'B', 'B · Deadlift + OHP', [
        [EX.deadlift, 'topset', top(2, 2, 5, 6)],
        [EX.ohp, 'topset', top(2, 3, 6, 8)],
        ['pull-up', 'double', dbl(3, 6, 10)],
        ['cable-tricep-pushdown', 'double', dbl(3, 10, 15, true)],
      ], [0, 1]),
      session(t, 'C', 'C · Accessories', [
        ['incline-db-bench-press', 'double', dbl(3, 8, 12)],
        ['romanian-deadlift', 'double', dbl(3, 8, 12)],
        ['cable-row', 'double', dbl(3, 10, 15)],
        ['bulgarian-split-squat', 'double', dbl(2, 8, 12)],
        ['preacher-curl', 'double', dbl(3, 10, 15, true)],
        ['calf-raise', 'double', dbl(3, 10, 15, true)],
      ], [0, 1, 2]),
    ],
  };
}

function upperLower(): Program {
  const t = 'upper-lower';
  return {
    id: t, name: 'Upper / Lower', templateId: t, rotation: ['U1', 'L1', 'U2', 'L2'], phases: [],
    sessions: [
      session(t, 'U1', 'Upper 1 · Heavy bench', [
        [EX.bench, 'topset', top(3, 3, 5, 8)],
        ['barbell-row', 'double', dbl(4, 6, 10)],
        [EX.ohp, 'double', dbl(3, 8, 10)],
        ['lat-pulldown', 'double', dbl(3, 8, 12)],
        ['db-curl', 'double', dbl(2, 10, 15, true)],
      ], [0, 1]),
      session(t, 'L1', 'Lower 1 · Heavy squat', [
        [EX.squat, 'topset', top(3, 3, 5, 8)],
        ['romanian-deadlift', 'double', dbl(3, 6, 10)],
        ['leg-curl', 'double', dbl(3, 10, 15, true)],
        ['calf-raise', 'double', dbl(3, 10, 15, true)],
      ], [0, 1]),
      session(t, 'U2', 'Upper 2 · Heavy press', [
        [EX.ohp, 'topset', top(3, 3, 6, 8)],
        [EX.bench, 'double', dbl(3, 8, 12)],
        ['pull-up', 'double', dbl(3, 6, 10)],
        ['db-lateral-raise', 'double', dbl(3, 12, 20, true)],
        ['cable-tricep-pushdown', 'double', dbl(2, 10, 15, true)],
      ], [0, 1]),
      session(t, 'L2', 'Lower 2 · Heavy deadlift', [
        [EX.deadlift, 'topset', top(2, 2, 4, 6)],
        [EX.frontSquat, 'double', dbl(3, 6, 10)],
        ['hip-thrust', 'double', dbl(3, 8, 12)],
        ['hanging-knee-raise', 'double', dbl(3, 10, 15, true)],
      ], [0, 1]),
    ],
  };
}

function fiveByFive(): Program {
  const t = 'linear-5x5';
  return {
    id: t, name: '5 × 5 linear', templateId: t, rotation: ['A', 'B'], phases: [],
    sessions: [
      session(t, 'A', 'A · Squat, Bench, Row', [
        [EX.squat, 'linear5x5', lin()],
        [EX.bench, 'linear5x5', lin()],
        ['barbell-row', 'linear5x5', lin()],
      ], [0, 1, 2]),
      session(t, 'B', 'B · Squat, OHP, Deadlift', [
        [EX.squat, 'linear5x5', lin()],
        [EX.ohp, 'linear5x5', lin()],
        [EX.deadlift, 'linear5x5', { sets: 1, repMin: 5, repMax: 5, rirFloor: RIR_FLOOR.compound }],
      ], [0, 1, 2]),
    ],
  };
}

function hypertrophy(): Program {
  const t = 'hypertrophy-split';
  return {
    id: t, name: 'Hypertrophy split', templateId: t, rotation: ['Push', 'Pull', 'Legs', 'Upper', 'Lower'], phases: [],
    sessions: [
      session(t, 'Push', 'Push', [
        [EX.bench, 'double', dbl(3, 6, 10)],
        ['incline-db-bench-press', 'double', dbl(3, 8, 12)],
        ['seated-db-shoulder-press', 'double', dbl(3, 8, 12)],
        ['db-lateral-raise', 'double', dbl(4, 12, 20, true)],
        ['cable-tricep-pushdown', 'double', dbl(3, 10, 15, true)],
      ], [0, 1, 3]),
      session(t, 'Pull', 'Pull', [
        ['pull-up', 'double', dbl(3, 6, 10)],
        ['cable-row', 'double', dbl(3, 8, 12)],
        ['chest-supported-row', 'double', dbl(3, 8, 12)],
        ['face-pull', 'double', dbl(3, 12, 20, true)],
        ['preacher-curl', 'double', dbl(3, 10, 15, true)],
      ], [0, 1, 4]),
      session(t, 'Legs', 'Legs', [
        [EX.squat, 'double', dbl(3, 6, 10)],
        ['romanian-deadlift', 'double', dbl(3, 8, 12)],
        ['leg-press', 'double', dbl(3, 10, 15)],
        ['leg-curl', 'double', dbl(3, 10, 15, true)],
        ['calf-raise', 'double', dbl(4, 10, 15, true)],
      ], [0, 1, 3]),
      session(t, 'Upper', 'Upper', [
        [EX.ohp, 'double', dbl(3, 6, 10)],
        ['lat-pulldown', 'double', dbl(3, 8, 12)],
        ['db-bench-press', 'double', dbl(3, 8, 12)],
        ['single-arm-db-row', 'double', dbl(3, 8, 12)],
        ['hammer-curl', 'double', dbl(2, 10, 15, true)],
      ], [0, 1, 2]),
      session(t, 'Lower', 'Lower', [
        [EX.deadlift, 'double', dbl(3, 5, 8)],
        ['bulgarian-split-squat', 'double', dbl(3, 8, 12)],
        ['hip-thrust', 'double', dbl(3, 8, 12)],
        ['leg-extension', 'double', dbl(3, 12, 15, true)],
      ], [0, 1, 2]),
    ],
  };
}

const BUILDERS: Record<string, () => Program> = {
  'fullbody-abc': fullBody,
  'upper-lower': upperLower,
  'linear-5x5': fiveByFive,
  'hypertrophy-split': hypertrophy,
};

export const TEMPLATES: TemplateInfo[] = [
  { id: 'fullbody-abc', name: 'Full body A/B/C', days: '3 (min 2: A + B)', shape: 'A: squat + bench · B: deadlift + OHP · C: accessories', fitsGoal: 'maintain strength + size' },
  { id: 'upper-lower', name: 'Upper / Lower', days: '4', shape: 'Two upper, two lower; one heavy top set per main lift per week', fitsGoal: 'strength + size' },
  { id: 'linear-5x5', name: '5 × 5 linear', days: '3', shape: 'A/B alternating, three main lifts each', fitsGoal: 'strength block' },
  { id: 'hypertrophy-split', name: 'Hypertrophy split', days: '4–5', shape: 'Push / pull / legs + upper / lower, double progression', fitsGoal: 'size' },
];

export const DEFAULT_TEMPLATE_ID = 'fullbody-abc';

/** A fresh, editable Program built from a template. */
export function programFromTemplate(templateId: string = DEFAULT_TEMPLATE_ID): Program {
  const b = BUILDERS[templateId];
  if (!b) throw new Error(`Unknown template: ${templateId}`);
  return b();
}

export function allTemplates(): Program[] {
  return TEMPLATES.map(t => programFromTemplate(t.id));
}
