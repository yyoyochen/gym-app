// Shapes of the retired Python engine (gymcli/models.py), kept snake_case so
// the parity fixtures compare field for field. The app speaks the domain types
// in src/domain/types.ts; src/engine/models.ts converts between the two.
import type { ISODate } from '../../domain/types';

export interface LegacySetRow {
  date: ISODate;
  session: string;
  exercise: string;
  order: number;
  set_num: number;
  reps: number;
  /** External load. For bodyweight lifts: added load. */
  weight: number;
}

export type LegacyMode = 'hypertrophy' | 'strength';

export interface LegacyTarget {
  lift: string;
  weight: number;
  target_reps: number;
  added_weight: boolean;
  prev_top: number[];
  is_new: boolean;
  rationale: string;
  /** null = "every working set" (hypertrophy); 5 in strength 5x5 mode. */
  target_sets: number | null;
  mode: LegacyMode;
}

/** (weight, reps) */
export type WR = [number, number];
/** (top weight, reps at that weight) for one session */
export type Attempt = [number, number[]];

export type LegacyStatus = 'beat' | 'hit' | 'missed' | 'new';

export interface LegacyLiftResult {
  lift: string;
  status: LegacyStatus;
  detail: string;
}

export interface SessionPoint {
  date: ISODate;
  /** Heaviest load that day (added load for bodyweight lifts). */
  top_weight: number;
  /** (weight, reps) of the highest-e1RM set; weight is the logged (added) load. */
  best_set: WR;
  e1rm: number;
}

export interface PR {
  date: ISODate;
  kind: 'top_weight' | 'e1rm';
  value: number;
}

export interface Scorecard {
  wins: number;
  total: number;
  lifts: LegacyLiftResult[];
  volume_load_delta_pct: number | null;
  weekly_muscle: Record<string, number>;
  weak_flags: string[];
  streak: number;
}

/**
 * Set to reproduce the Python engine exactly, bugs included. Only the parity
 * tests pass it; the app always gets the fixed behaviour.
 */
export interface Faithful {
  faithful?: boolean;
}
