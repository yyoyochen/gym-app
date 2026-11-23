// The date picker's calendar, pure: a Monday-first six-week grid for a month,
// keyboard moves, and the spoken label for a day. DatePickerSheet only paints it.
// Month labels and month shifts come from app/dates (monthLabel, shiftMonth).
import type { ISODate } from '../../domain/types';
import { addDays, shiftMonth, weekday } from '../../app/dates';

/** How much you trained on a day: 0 light, 1 moderate, 2 heavy; null when there is no session. */
export type DayLevel = 0 | 1 | 2;
export interface Day { iso: ISODate; inMonth: boolean; disabled: boolean; today: boolean; selected: boolean; level: DayLevel | null }

const pad = (n: number) => String(n).padStart(2, '0');
const monday = (iso: ISODate): ISODate => addDays(iso, -((weekday(iso) + 6) % 7));

export function monthGrid(year: number, month: number, o: {
  today: ISODate; selected?: ISODate | ''; min?: ISODate; max?: ISODate; levels?: ReadonlyMap<ISODate, DayLevel>;
}): Day[][] {
  const start = monday(`${year}-${pad(month)}-01`);
  const weeks: Day[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: Day[] = [];
    for (let d = 0; d < 7; d++) {
      const iso = addDays(start, w * 7 + d);
      const [y, m] = iso.split('-').map(Number);
      row.push({
        iso, inMonth: y === year && m === month,
        disabled: (o.min !== undefined && iso < o.min) || (o.max !== undefined && iso > o.max),
        today: iso === o.today, selected: iso === o.selected, level: o.levels?.get(iso) ?? null,
      });
    }
    weeks.push(row);
  }
  return weeks;
}

export type CalKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'PageUp' | 'PageDown' | 'Home' | 'End';

const lastDay = (year: number, month: number) => addDays(`${shiftMonth(year, month, 1).year}-${pad(shiftMonth(year, month, 1).month)}-01`, -1);

export function moveDay(iso: ISODate, key: CalKey): ISODate {
  switch (key) {
    case 'ArrowLeft': return addDays(iso, -1);
    case 'ArrowRight': return addDays(iso, 1);
    case 'ArrowUp': return addDays(iso, -7);
    case 'ArrowDown': return addDays(iso, 7);
    case 'Home': return monday(iso);
    case 'End': return addDays(monday(iso), 6);
    case 'PageUp': return sameDayIn(iso, -1);
    case 'PageDown': return sameDayIn(iso, 1);
  }
}

/** The same day number `n` months away, clamped to that month's last day. */
export function sameDayIn(iso: ISODate, n: number): ISODate {
  const [y, m, d] = iso.split('-').map(Number);
  const t = shiftMonth(y, m, n);
  const dim = Number(lastDay(t.year, t.month).slice(8));
  return `${t.year}-${pad(t.month)}-${pad(Math.min(d, dim))}`;
}

const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const LEVEL_WORD = ['light', 'moderate', 'heavy'] as const;

/** "Thursday 19 November 2026, trained, heavy day". */
export function dayLabel(iso: ISODate, level: DayLevel | null): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${WEEKDAYS_LONG[weekday(iso)]} ${d} ${MONTHS_LONG[m - 1]} ${y}${level === null ? '' : `, trained, ${LEVEL_WORD[level]} day`}`;
}

/** Working sets per day to three steps, in thirds of the busiest day. A session with no sets is light. */
export function calendarLevels(counts: ReadonlyMap<ISODate, number>): Map<ISODate, DayLevel> {
  const out = new Map<ISODate, DayLevel>();
  const max = Math.max(0, ...counts.values());
  for (const [d, n] of counts) out.set(d, n <= 0 || max <= 0 ? 0 : (Math.min(2, Math.ceil((3 * n) / max) - 1) as DayLevel));
  return out;
}

export const MARKER_W = 24;
export const MARKER_H = 8;

/**
 * The day marker as 4 px squares on a 24 × 8 box: light is three dots, moderate
 * a checker, heavy a solid strip (the History heatmap's patterns, without the
 * hard-to-read 75% step). Pure so the painter and the legend share it.
 */
export function markerRects(level: DayLevel): { x: number; y: number; w: number; h: number }[] {
  if (level === 2) return [{ x: 0, y: 0, w: MARKER_W, h: MARKER_H }];
  const out: { x: number; y: number; w: number; h: number }[] = [];
  for (let y = 0; y < 2; y++) for (let x = 0; x < 6; x++) {
    const on = level === 0 ? y === 0 && x % 2 === 0 : (x + y) % 2 === 0;
    if (on) out.push({ x: x * 4, y: y * 4, w: 4, h: 4 });
  }
  return out;
}

/** Pull a date into [min, max] (either may be absent). */
export function clampDate(iso: ISODate, min?: ISODate, max?: ISODate): ISODate {
  if (max && iso > max) return max;
  if (min && iso < min) return min;
  return iso;
}

/** May the sheet's confirm button act? A day is chosen, inside the range, and (when asked) different from the current value. */
export function canConfirm(i: { sel: ISODate | ''; value: ISODate | ''; min?: ISODate; max?: ISODate; requireChange?: boolean }): boolean {
  if (!i.sel) return false;
  if ((i.min && i.sel < i.min) || (i.max && i.sel > i.max)) return false;
  return !(i.requireChange && i.sel === i.value);
}

/**
 * The one grid cell that takes Tab (roving tabindex): the focused day when it is
 * shown and enabled, else the first enabled day of the month shown, else none.
 */
export function tabbableDay(grid: Day[][], focus: ISODate): ISODate | null {
  const days = grid.flat();
  const f = days.find(d => d.iso === focus);
  if (f && !f.disabled) return f.iso;
  return days.find(d => d.inMonth && !d.disabled)?.iso ?? null;
}
