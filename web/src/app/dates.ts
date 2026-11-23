// Calendar-date helpers for the UI. Dates are ISO `YYYY-MM-DD` strings and are
// never parsed with `new Date(iso)` (that reads them as UTC midnight).
import type { ISODate, Millis } from '../domain/types';
import { localISODate, pad } from '../db/util';
import { getLang } from '../i18n/lang';

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
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** 0 = Sunday … 6 = Saturday. */
export function weekday(iso: ISODate): number {
  return (((dayNumber(iso) + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday
}

const ZH_DAYS = ['日', '一', '二', '三', '四', '五', '六'];
const zh = () => getLang() === 'zh';

/** "Fri 21 Nov 2026"; in Chinese "2026年11月21日 週五". */
export function formatDate(iso: ISODate, opts: { weekday?: boolean; year?: boolean } = {}): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (zh()) {
    const wd = opts.weekday === false ? '' : ` 週${ZH_DAYS[weekday(iso)]}`;
    return `${opts.year === false ? '' : `${y}年`}${m}月${d}日${wd}`;
  }
  const wd = opts.weekday === false ? '' : `${WEEKDAYS[weekday(iso)]} `;
  return `${wd}${d} ${MONTHS[m - 1]}${opts.year === false ? '' : ` ${y}`}`;
}

/** "November 2026"; in Chinese "2026年11月". */
export function monthLabel(year: number, month: number): string {
  return zh() ? `${year}年${month}月` : `${MONTHS_LONG[month - 1]} ${year}`;
}

/** Month 1–12, short: "Nov" / "11月". */
export function monthShort(month: number): string {
  return zh() ? `${month}月` : MONTHS[month - 1];
}

/** Month 1–12, long: "November" / "11月". */
export function monthLong(month: number): string {
  return zh() ? `${month}月` : MONTHS_LONG[month - 1];
}

/** Weekday 0 = Sunday, short: "Sun" / "週日". */
export function weekdayShort(day: number): string {
  return zh() ? `週${ZH_DAYS[day]}` : WEEKDAYS[day];
}

/** Weekday 0 = Sunday, long: "Sunday" / "星期日". */
export function weekdayLong(day: number): string {
  return zh() ? `星期${ZH_DAYS[day]}` : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day];
}

/** One letter per day, Monday first: M T W T F S S / 一 二 三 四 五 六 日. */
export function dayInitials(): string[] {
  return zh() ? ['一', '二', '三', '四', '五', '六', '日'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
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
