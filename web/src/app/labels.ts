// Plain-language labels for domain enums.
import type { GoalKind, PainArea, SetKind, Side, TargetType } from '../domain/types';

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

export const SET_KIND_LABELS: Record<SetKind, string> = {
  warmup: 'Warm-up', working: 'Working', top: 'Top', backoff: 'Back-off', drop: 'Drop',
};

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
