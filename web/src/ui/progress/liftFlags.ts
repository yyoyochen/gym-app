// Flags on the Progress lift list: a short note on a lift that needs a look.
// Pure; one flag per lift, the most pressing first.
//   missing  not trained for 14+ days, or twice its usual gap if that is longer
//   down     best e1RM of the last 4 weeks is 2%+ under the 4 weeks before
//   flat     no new 90-day best for 6+ weeks, with 3+ sessions since
//   never    in your targets or program, but never logged
import type { ISODate } from '../../domain/types';
import { addDays, daysBetween } from '../../app/dates';
import { t } from '../../i18n';

export type LiftFlag =
  | { kind: 'missing'; days: number }
  | { kind: 'down'; pct: number }
  | { kind: 'flat'; weeks: number }
  | { kind: 'never' };

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/**
 * `series`: e1RM per training day, oldest first. `trained`: every date the
 * lift was trained, oldest first (all history, so a long gap is seen).
 */
export function liftFlag(series: { date: ISODate; e1rm: number }[], trained: ISODate[], today: ISODate): LiftFlag | null {
  if (!trained.length) return { kind: 'never' };
  const since90 = addDays(today, -90);

  const last = trained[trained.length - 1];
  const recentDates = trained.filter(d => d >= since90);
  const gaps = recentDates.slice(1).map((d, i) => daysBetween(recentDates[i], d));
  const away = daysBetween(last, today);
  if (away >= Math.max(14, gaps.length ? 2 * median(gaps) : 14)) return { kind: 'missing', days: away };

  const cut4 = addDays(today, -28), cut8 = addDays(today, -56);
  const best = (xs: { e1rm: number }[]) => Math.max(...xs.map(p => p.e1rm));
  const recent = series.filter(p => p.date > cut4 && p.date <= today);
  const prior = series.filter(p => p.date > cut8 && p.date <= cut4);
  if (recent.length && prior.length) {
    const r = best(recent), p = best(prior);
    if (p > 0 && r < p * 0.98) return { kind: 'down', pct: Math.round((1 - r / p) * 100) };
  }

  const in90 = series.filter(p => p.date >= since90 && p.date <= today);
  if (in90.length) {
    const top = best(in90);
    const at = in90.find(p => p.e1rm === top)!.date; // first time it was reached; equalling it is not a new best
    const weeks = Math.floor(daysBetween(at, today) / 7);
    if (weeks >= 6 && in90.filter(p => p.date > at).length >= 3) return { kind: 'flat', weeks };
  }
  return null;
}

export function flagText(f: LiftFlag): string {
  switch (f.kind) {
    case 'never': return t('Not trained yet');
    case 'missing': return t('Not trained in {n} days', { n: f.days });
    case 'down': return t('Down {pct}% in 4 wk', { pct: f.pct });
    case 'flat': return t('Flat for {n} wk', { n: f.weeks });
  }
}

/** Sort key: missing, down, flat, never trained, then no flag. */
export function flagRank(f: LiftFlag | null): number {
  return f ? { missing: 0, down: 1, flat: 2, never: 3 }[f.kind] : 4;
}
