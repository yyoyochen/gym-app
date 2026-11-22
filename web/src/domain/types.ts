// Shared domain types. The engine (src/engine), storage (src/db), import
// (src/import) and UI all speak these shapes. See docs/PWA-SPEC.md §6.2.
// Dates are ISO `YYYY-MM-DD` strings (never parsed with `new Date(iso)`);
// instants are epoch milliseconds.

export type ISODate = string;
export type Millis = number;

export type EffortScale = 'rir' | 'rpe';
export type SetKind = 'warmup' | 'working' | 'top' | 'backoff' | 'drop';
export type SlotType = 'compound' | 'isolation';

export type PainArea =
  | 'neck' | 'shoulder' | 'elbow' | 'wrist' | 'upper_back' | 'lower_back'
  | 'hip' | 'knee' | 'ankle' | 'other';
export type Side = 'left' | 'right' | 'both' | 'na';

export interface PainFlag {
  area: PainArea;
  side: Side;
  /** 1 niggle · 2 changed how I lifted · 3 stopped the set */
  severity: 1 | 2 | 3;
  note?: string;
}

export type BenchmarkKey = 'squat' | 'bench' | 'deadlift' | null;

export interface Exercise {
  id: string;
  name: string;
  aliases: string[];
  muscles: string[];
  areasLoaded: PainArea[];
  slotType: SlotType;
  /** kg added per progression step */
  increment: number;
  /** Fraction of bodyweight moved (dip/pull-up ~0.95). 0 = not a bodyweight lift. */
  bodyweightFactor: number;
  benchmarkKey: BenchmarkKey;
  /** Gym-goer strength standard id (web/public/standards/gym-standards.json). Unset: matched from the name. */
  standardId?: string;
  archived?: boolean;
}

/** One logged set. Effort is always stored as RIR (RPE = 10 - RIR). */
export interface SetEntry {
  id: string;
  sessionId: string;
  exerciseId: string;
  exerciseNameSnapshot: string;
  /** Slot order within the session (1-based), then set order within the slot. */
  slotOrder: number;
  setOrder: number;
  kind: SetKind;
  /** External load in kg. For bodyweight lifts: added load (negative = assistance). */
  weight: number;
  reps: number;
  rir?: number;
  failed?: boolean;
  pain?: PainFlag;
  note?: string;
  loggedAt: Millis;
  /** Set by imports when the source row was incomplete (value stored as 0). */
  importFlags?: ImportFlag[];
}

export type ImportFlag = 'blank_weight' | 'blank_reps';

export type Readiness = 'green' | 'amber' | 'red';

export interface Session {
  id: string;
  /** Program session key (e.g. "A") or "import:<label>" / "adhoc". */
  programSessionKey: string;
  nameSnapshot: string;
  /** Pinned at start; a session never splits across midnight. */
  date: ISODate;
  startedAt: Millis;
  endedAt?: Millis;
  readiness?: Readiness;
  note?: string;
  sealed: boolean;
  edited?: boolean;
  /** Stable key for idempotent imports (hash of source rows). */
  importKey?: string;
}

// ---------------------------------------------------------------- Program

export type ModelKind = 'double' | 'linear5x5' | 'topset' | 'fixed';

export interface SlotParams {
  sets: number;
  repMin: number;
  repMax: number;
  /** Minimum reps in reserve for working sets (effort floor). */
  rirFloor: number;
  /** Top-set model: reps for the top set (1–3); backoffPct is a PERCENTAGE of the top weight (85 = 85%). */
  topReps?: number;
  backoffPct?: number;
  backoffSets?: number;
  /** Override of the exercise increment. */
  increment?: number;
}

export interface Slot {
  id: string;
  exerciseId: string;
  model: ModelKind;
  params: SlotParams;
}

export interface ProgramSession {
  key: string;            // "A", "B", "C"
  name: string;           // "A: Squat + Bench" (older stored names use a middle dot)
  slots: Slot[];
  /** Slot ids kept in the minimum version of this session. */
  minimumSlotIds: string[];
}

export interface Phase {
  name: string;
  start: ISODate;
  end: ISODate;
  /** Per-model overrides applied during the phase. */
  overrides?: Partial<Record<ModelKind, Partial<SlotParams>>>;
}

export interface Program {
  id: string;
  name: string;
  templateId?: string;
  sessions: ProgramSession[];
  rotation: string[];     // ["A","B","C"]
  phases: Phase[];
}

// ---------------------------------------------------------------- Profile & goals

export type Sex = 'M' | 'F';
export type GoalKind = 'strength' | 'maintain' | 'hypertrophy' | 'bodycomp';
export type TargetType = 'reach' | 'hold' | 'at_least';

export interface GoalTarget {
  id: string;
  /** exerciseId, or 'bodyweight' / 'sessions_per_week' */
  subject: string;
  value: number;
  type: TargetType;
  deadline: ISODate;
}

export interface Profile {
  sex?: Sex;
  birthYear?: number;
  heightCm?: number;
  trainingAgeYears?: number;
  effortScale: EffortScale;
  unit: 'kg';
  sessionsPerWeekTarget: number;
  sessionsPerWeekMin: number;
  maxSessionMinutes?: number;
  injuries: { area: PainArea; side: Side; since?: ISODate; note?: string }[];
  manualMaxes: { exerciseId: string; kg: number; date: ISODate }[];
  primaryGoal: GoalKind;
  goals: GoalKind[];
  targets: GoalTarget[];
  checkpoints: ISODate[];
  /** 'gym' = modeled gym-goer standards (default); 'tested' / 'all' also open the competitive-powerlifter comparison. */
  benchmarkPopulation: BenchmarkPopulation;
}

export type BenchmarkPopulation = 'gym' | 'tested' | 'all';

export interface BodyweightEntry { id: string; date: ISODate; kg: number }

// ---------------------------------------------------------------- Engine I/O

export type Verdict = 'beat' | 'hit' | 'missed' | 'new';

/** The frozen promise for one slot of one session. Write-once. */
export interface Target {
  slotId: string;
  exerciseId: string;
  exerciseName: string;
  model: ModelKind;
  /** Working / back-off weight (kg, added load for bodyweight lifts). */
  weight: number;
  targetReps: number;
  repMax?: number;
  /** null = every working set (double progression). */
  targetSets: number | null;
  rirFloor: number;
  /** Top-set model only. */
  topWeight?: number;
  topReps?: number;
  addedWeight: boolean;
  prevTop: number[];
  isNew: boolean;
  /** Plain-language success criterion, shown before AND graded after. */
  criterion: string;
  /** One-line reason for the number. */
  why: string;
  /** Rule id for the reason (e.g. "double_progression"). */
  rule: string;
  /** The training principle behind the rule (criteria.why in the old engine). */
  principle?: string;
}

export interface Commit {
  sessionId: string;
  committedAt: Millis;
  readiness: Readiness;
  targets: Target[];
}

export interface LiftResult {
  slotId: string;
  exerciseId: string;
  verdict: Verdict;
  detail: string;
}

export type EventType = 'skip' | 'pain' | 'deload' | 'reentry' | 'target_change' | 'export';
export interface AppEvent { id: string; date: ISODate; type: EventType; data?: unknown }
