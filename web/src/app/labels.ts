// Plain-language labels for domain enums.
import type { GoalKind, PainArea, Side, TargetType } from '../domain/types';

export const GOAL_LABELS: Record<GoalKind, string> = {
  strength: 'Strength', maintain: 'Maintain strength', hypertrophy: 'Hypertrophy', bodycomp: 'Body composition',
};
export const GOALS: GoalKind[] = ['strength', 'maintain', 'hypertrophy', 'bodycomp'];

export const TARGET_TYPE_LABELS: Record<TargetType, string> = { reach: 'Reach', hold: 'Hold', at_least: 'At least' };

export const PAIN_AREA_LABELS: Record<PainArea, string> = {
  neck: 'Neck', shoulder: 'Shoulder', elbow: 'Elbow', wrist: 'Wrist', upper_back: 'Upper back',
  lower_back: 'Lower back', hip: 'Hip', knee: 'Knee', ankle: 'Ankle', other: 'Other',
};
export const PAIN_AREAS = Object.keys(PAIN_AREA_LABELS) as PainArea[];

export const SIDE_LABELS: Record<Side, string> = { left: 'Left', right: 'Right', both: 'Both', na: '—' };

export const SUBJECT_BODYWEIGHT = 'bodyweight';
export const SUBJECT_SESSIONS = 'sessions_per_week';

export function subjectLabel(subject: string, names: Map<string, string>): string {
  if (subject === SUBJECT_BODYWEIGHT) return 'Bodyweight';
  if (subject === SUBJECT_SESSIONS) return 'Sessions per week';
  return names.get(subject) ?? subject;
}

export function subjectUnit(subject: string): string {
  return subject === SUBJECT_SESSIONS ? '/wk' : 'kg';
}

/** A lift with no weight to show: 0 kg on an exercise that isn't a bodyweight lift (box jumps, planks, a lift with no history). */
export function isUnloaded(weight: number, bodyweightFactor = 0): boolean {
  return weight === 0 && !(bodyweightFactor > 0);
}

/** Load as a lifter reads it: "100", for bodyweight lifts "BW", "BW+10", "BW−15", and "—" for 0 kg on anything else. */
export function formatLoad(weight: number, bodyweightFactor = 0): string {
  if (bodyweightFactor > 0) {
    if (weight === 0) return 'BW';
    return weight > 0 ? `BW+${weight}` : `BW−${Math.abs(weight)}`;
  }
  return isUnloaded(weight, bodyweightFactor) ? '—' : String(weight);
}

/** Session names stored before 2026-11-22 read "A \u00B7 Squat + Bench"; they are never migrated. */
export const LEGACY_DOT = '\u00B7';

/** A stored name as shown: an older "A \u00B7 Squat + Bench" reads "A: Squat + Bench". */
export function displayName(name: string): string {
  return name.replace(new RegExp(`\\s+${LEGACY_DOT}\\s+`, 'g'), ': ');
}

/** Goal status in one scale for every screen (Progress, Profile, Review). */
export function feasibilityWord(f: 'comfortable' | 'ambitious' | 'unlikely'): string {
  return { comfortable: 'on pace', ambitious: 'behind', unlikely: 'unlikely' }[f];
}
