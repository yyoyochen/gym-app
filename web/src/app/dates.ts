// Calendar-date helpers for the UI. Dates are ISO `YYYY-MM-DD` strings and are
// never parsed with `new Date(iso)` (that reads them as UTC midnight).
import type { ISODate, Millis } from '../domain/types';
import { localISODate, pad } from '../db/util';

export function todayISO(now: Millis = Date.now()): ISODate {
  return localISODate(now);
}

const dayNumber = (iso: ISODate) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

const fromDayNumber = (n: number): ISODate => {
  const d = new Date(n * 86_400_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

export function addDays(iso: ISODate, days: number): ISODate {
  return fromDayNumber(dayNumber(iso) + days);
}

/** b − a in whole days. */
export function daysBetween(a: ISODate, b: ISODate): number {
  return dayNumber(b) - dayNumber(a);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** 0 = Sunday … 6 = Saturday. */
export function weekday(iso: ISODate): number {
  return (((dayNumber(iso) + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday
}

/** "Fri 21 Nov 2026" */
export function formatDate(iso: ISODate, opts: { weekday?: boolean; year?: boolean } = {}): string {
  const [y, m, d] = iso.split('-').map(Number);
  const wd = opts.weekday === false ? '' : `${WEEKDAYS[weekday(iso)]} `;
  return `${wd}${d} ${MONTHS[m - 1]}${opts.year === false ? '' : ` ${y}`}`;
}

export function monthLabel(year: number, month: number): string {
  return `${MONTHS_LONG[month - 1]} ${year}`;
}

/** Shift a (year, month 1–12) by n months. */
export function shiftMonth(year: number, month: number, n: number): { year: number; month: number } {
  const i = year * 12 + (month - 1) + n;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}

/**
 * Month grid, weeks starting Monday. Each week has 7 cells: an ISO date for
 * days in the month, null for padding.
 */
export function monthGrid(year: number, month: number): (ISODate | null)[][] {
  const first = `${year}-${pad(month)}-01`;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = (weekday(first) + 6) % 7; // Monday = 0
  const cells: (ISODate | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${year}-${pad(month)}-${pad(d)}`);
  while (cells.length % 7) cells.push(null);
  const weeks: (ISODate | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
