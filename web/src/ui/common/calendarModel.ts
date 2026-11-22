// The date picker's calendar, pure: a Monday-first six-week grid for a month,
// keyboard moves, and the spoken label for a day. DatePickerSheet only paints it.
// Month labels and month shifts come from app/dates (monthLabel, shiftMonth).
import type { ISODate } from '../../domain/types';
import { addDays, shiftMonth, weekday } from '../../app/dates';

export interface Day { iso: ISODate; inMonth: boolean; disabled: boolean; today: boolean; selected: boolean; marked: boolean }

const pad = (n: number) => String(n).padStart(2, '0');
const monday = (iso: ISODate): ISODate => addDays(iso, -((weekday(iso) + 6) % 7));

export function monthGrid(year: number, month: number, o: {
  today: ISODate; selected?: ISODate | ''; min?: ISODate; max?: ISODate; marked?: ReadonlySet<ISODate>;
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
        today: iso === o.today, selected: iso === o.selected, marked: !!o.marked?.has(iso),
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
    case 'PageUp':
    case 'PageDown': {
      const [y, m, d] = iso.split('-').map(Number);
      const t = shiftMonth(y, m, key === 'PageDown' ? 1 : -1);
      const dim = Number(lastDay(t.year, t.month).slice(8));
      return `${t.year}-${pad(t.month)}-${pad(Math.min(d, dim))}`;
    }
  }
}

const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Thursday 19 November 2026, trained". */
export function dayLabel(iso: ISODate, marked: boolean): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${WEEKDAYS_LONG[weekday(iso)]} ${d} ${MONTHS_LONG[m - 1]} ${y}${marked ? ', trained' : ''}`;
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
