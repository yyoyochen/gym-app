// Which target lines a lift chart gets. Levels are e1RM thresholds, so only
// the e1RM chart shows the next level, and only when that level is a plain kg
// e1RM (not added load, reps, seconds or a per-dumbbell figure). The lifter's
// own goal for this lift (earliest deadline) shows on the e1RM chart too.
import type { GoalTarget } from '../../domain/types';
import type { NextStep } from '../../benchmarks/liftRating';
import { levelLabel } from '../../benchmarks/gymStandards';
import { t } from '../../i18n';
import type { ChartTarget } from './chartModel';

export function liftChartTargets(i: {
  metric: 'e1rm' | 'top' | 'volume';
  next: NextStep | null | undefined;
  loadType?: string;
  goals: GoalTarget[];
  subject: string;
}): ChartTarget[] {
  if (i.metric !== 'e1rm') return [];
  const out: ChartTarget[] = [];
  const goal = i.goals.filter(g => g.subject === i.subject).sort((a, b) => (a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0))[0];
  if (goal) out.push({ name: t('Your target'), value: goal.value, kind: 'goal' });
  const n = i.next;
  if (n && n.unit === 'kg' && !n.added && i.loadType !== 'dumbbell_each') out.push({ name: levelLabel(n.level), value: n.value, kind: 'level' });
  return out.sort((a, b) => a.value - b.value);
}
