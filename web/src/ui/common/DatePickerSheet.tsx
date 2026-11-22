// The calendar sheet: Monday first, today outlined, the picked day filled, days
// you trained marked with a dither tick, days outside min/max dimmed and inert.
// Arrow keys move the focused day, Page keys change month, Enter picks.
import { useEffect, useRef, useState } from 'react';
import type { ISODate } from '../../domain/types';
import { monthLabel, shiftMonth, todayISO } from '../../app/dates';
import { Button, PixelIcon, Sheet } from '../kit';
import { canConfirm, clampDate, dayLabel, monthGrid, moveDay, tabbableDay, type CalKey } from './calendarModel';

const KEYS = new Set<string>(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']);
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function DatePickerSheet({ open, value, min, max, marked, title, confirmLabel, requireChange, onPick, onClear, onClose }: {
  open: boolean; value: ISODate | ''; min?: ISODate; max?: ISODate; marked?: ReadonlySet<ISODate>;
  title: string; confirmLabel: string; requireChange?: boolean; onPick: (d: ISODate) => void; onClear?: () => void; onClose: () => void;
}) {
  const today = todayISO();
  const start: ISODate = clampDate(value || today, min, max);
  const [sel, setSel] = useState<ISODate | ''>(value);
  const [focus, setFocus] = useState<ISODate>(start);
  const [ym, setYm] = useState({ year: Number(start.slice(0, 4)), month: Number(start.slice(5, 7)) });
  const fromKeys = useRef(false);
  const grid = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setSel(value); setFocus(start); setYm({ year: Number(start.slice(0, 4)), month: Number(start.slice(5, 7)) });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (fromKeys.current) { grid.current?.querySelector<HTMLButtonElement>(`[data-iso="${focus}"]`)?.focus(); fromKeys.current = false; }
  }, [focus, ym]);

  const weeks = monthGrid(ym.year, ym.month, { today, selected: sel, ...(min ? { min } : {}), ...(max ? { max } : {}), ...(marked ? { marked } : {}) });
  const ok = (d: ISODate) => !(min && d < min) && !(max && d > max);
  // Changing month moves the focused day with it (same day number, clamped), so Tab always has a cell.
  const go = (n: number) => { setYm(shiftMonth(ym.year, ym.month, n)); setFocus(moveDay(focus, n > 0 ? 'PageDown' : 'PageUp')); };
  const tab = tabbableDay(weeks, focus);

  const range = { ...(min ? { min } : {}), ...(max ? { max } : {}) };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      // Enter picks the focused day outright.
      e.preventDefault();
      if (canConfirm({ sel: focus, value, ...range, ...(requireChange ? { requireChange } : {}) })) onPick(focus);
      return;
    }
    if (!KEYS.has(e.key)) return;
    e.preventDefault();
    const next = moveDay(focus, e.key as CalKey);
    if (!ok(next)) return;
    fromKeys.current = true;
    setFocus(next);
    setYm({ year: Number(next.slice(0, 4)), month: Number(next.slice(5, 7)) });
  };

  return (
    <Sheet open={open} title={title} onClose={onClose} detents={['large']}>
      <div className="cal-hd">
        <button type="button" className="cal-nav" aria-label="Previous month" onClick={() => go(-1)}><PixelIcon name="back" scale={2} /></button>
        <h3 className="cal-title" aria-live="polite">{monthLabel(ym.year, ym.month)}</h3>
        <button type="button" className="cal-nav" aria-label="Next month" onClick={() => go(1)}><PixelIcon name="chevron" scale={2} /></button>
      </div>
      <div className="cal-dow" aria-hidden="true">{DOW.map((d, i) => <span key={i}>{d}</span>)}</div>
      <div className="cal-grid" role="grid" aria-label={monthLabel(ym.year, ym.month)} ref={grid} onKeyDown={onKey}>
        {weeks.map((w, i) => (
          <div key={i} role="row" className="cal-week">
            {w.map(d => (
              <button key={d.iso} type="button" role="gridcell" data-iso={d.iso} disabled={d.disabled} aria-selected={d.selected} aria-label={dayLabel(d.iso, d.marked)}
                tabIndex={d.iso === tab ? 0 : -1}
                className={`cal-day${d.inMonth ? '' : ' out'}${d.today ? ' today' : ''}${d.selected ? ' sel' : ''}${d.marked ? ' has' : ''}`}
                onClick={() => { setSel(d.iso); setFocus(d.iso); }}>
                {Number(d.iso.slice(8))}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="tk-btnrow">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" className="grow" disabled={!canConfirm({ sel, value, ...(min ? { min } : {}), ...(max ? { max } : {}), ...(requireChange ? { requireChange } : {}) })} onClick={() => sel && onPick(sel)}>{confirmLabel}</Button>
      </div>
      {onClear && value && <Button variant="quiet" block onClick={onClear}>No date</Button>}
    </Sheet>
  );
}
