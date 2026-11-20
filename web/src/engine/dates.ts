// ISO `YYYY-MM-DD` arithmetic. Never `new Date(iso)`: that parses as UTC
// midnight and shifts a day in negative-offset timezones. Only Date.UTC and
// getUTC* are used, so a date string means the same day everywhere.
import type { ISODate } from '../domain/types';

const MS_PER_DAY = 86_400_000;

export function toEpochDay(iso: ISODate): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

export function fromEpochDay(days: number): ISODate {
  const t = new Date(days * MS_PER_DAY);
  const y = t.getUTCFullYear();
  const m = String(t.getUTCMonth() + 1).padStart(2, '0');
  const d = String(t.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(iso: ISODate, n: number): ISODate {
  return fromEpochDay(toEpochDay(iso) + n);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return toEpochDay(b) - toEpochDay(a);
}

/** ISO-8601 (year, week), as Python's `date.isocalendar()[:2]`. */
export function isoWeek(iso: ISODate): [number, number] {
  const day = toEpochDay(iso);
  const weekday = ((new Date(day * MS_PER_DAY).getUTCDay() + 6) % 7) + 1; // Mon=1..Sun=7
  const thursday = day - weekday + 4; // the week's Thursday decides its year
  const year = new Date(thursday * MS_PER_DAY).getUTCFullYear();
  const jan1 = toEpochDay(`${year}-01-01`);
  return [year, Math.floor((thursday - jan1) / 7) + 1];
}

export function isoWeekKey(iso: ISODate): string {
  const [y, w] = isoWeek(iso);
  return `${y}-W${String(w).padStart(2, '0')}`;
}
