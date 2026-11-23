// Month/year bounds for the month picker (MonthYearPanel). Months are 1–12.
export interface YM { year: number; month: number }

const idx = (y: number, m: number) => y * 12 + (m - 1);

/** Whether (year, month) lies within [min, max]; a missing bound is open. */
export function monthInRange(year: number, month: number, min?: YM, max?: YM): boolean {
  const i = idx(year, month);
  return !(min && i < idx(min.year, min.month)) && !(max && i > idx(max.year, max.month));
}

/** The nearest month to `ym` inside [min, max]. */
export function clampMonth(ym: YM, min?: YM, max?: YM): YM {
  if (min && idx(ym.year, ym.month) < idx(min.year, min.month)) return { ...min };
  if (max && idx(ym.year, ym.month) > idx(max.year, max.month)) return { ...max };
  return { ...ym };
}

/** "2026-11-23" → { year: 2026, month: 11 }. */
export const ymOf = (iso: string): YM => ({ year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) });
