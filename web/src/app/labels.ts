// Plain-language labels for domain enums.
// The maps read t() through getters, so each read follows the current language.
import type { GoalKind, PainArea, Side, TargetType } from '../domain/types';
import { t, tn } from '../i18n';

export const GOAL_LABELS: Record<GoalKind, string> = {
  get strength() { return t('Strength'); },
  get maintain() { return t('Maintain strength'); },
  get hypertrophy() { return t('Hypertrophy'); },
  get bodycomp() { return t('Body composition'); },
};
export const GOALS: GoalKind[] = ['strength', 'maintain', 'hypertrophy', 'bodycomp'];

export const TARGET_TYPE_LABELS: Record<TargetType, string> = {
  get reach() { return t('Reach'); },
  get hold() { return t('Hold'); },
  get at_least() { return t('At least'); },
};

export const PAIN_AREA_LABELS: Record<PainArea, string> = {
  get neck() { return t('Neck'); },
  get shoulder() { return t('Shoulder'); },
  get elbow() { return t('Elbow'); },
  get wrist() { return t('Wrist'); },
  get upper_back() { return t('Upper back'); },
  get lower_back() { return t('Lower back'); },
  get hip() { return t('Hip'); },
  get knee() { return t('Knee'); },
  get ankle() { return t('Ankle'); },
  get other() { return t('Other'); },
};
export const PAIN_AREAS = Object.keys(PAIN_AREA_LABELS) as PainArea[];

export const SIDE_LABELS: Record<Side, string> = {
  get left() { return t('Left'); },
  get right() { return t('Right'); },
  get both() { return t('Both'); },
  na: '—',
};

export const SUBJECT_BODYWEIGHT = 'bodyweight';
export const SUBJECT_SESSIONS = 'sessions_per_week';

export function subjectLabel(subject: string, names: Map<string, string>): string {
  if (subject === SUBJECT_BODYWEIGHT) return t('Bodyweight');
  if (subject === SUBJECT_SESSIONS) return t('Sessions per week');
  return tn(names.get(subject) ?? subject);
}

export function subjectUnit(subject: string): string {
  return subject === SUBJECT_SESSIONS ? t('/wk') : 'kg';
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
  return f === 'comfortable' ? t('on pace') : f === 'ambitious' ? t('behind') : t('unlikely');
}
