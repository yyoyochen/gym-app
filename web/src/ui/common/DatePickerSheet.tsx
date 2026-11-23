// The calendar sheet: Monday first, today outlined, the picked day filled, days
// you trained marked with a dither strip (dots, checker, solid by how much you
// trained), days outside min/max dimmed and inert.
// Arrow keys move the focused day, Page keys change month, Enter picks.
import { useEffect, useRef, useState } from 'react';
import type { ISODate } from '../../domain/types';
import { monthLabel, shiftMonth, todayISO } from '../../app/dates';
import { MonthYearHeader } from './MonthYearHeader';
import { ymOf } from './monthYear';
import { Button, InfoButton, Sheet } from '../kit';
import { MARKER_H, MARKER_W, canConfirm, clampDate, dayLabel, markerRects, monthGrid, moveDay, sameDayIn, tabbableDay, type CalKey, type DayLevel } from './calendarModel';

const KEYS = new Set<string>(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']);
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function DatePickerSheet({ open, value, min, max, levels, title, confirmLabel, requireChange, onPick, onClear, onClose }: {
  open: boolean; value: ISODate | ''; min?: ISODate; max?: ISODate; levels?: ReadonlyMap<ISODate, DayLevel>;
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

  const weeks = monthGrid(ym.year, ym.month, { today, selected: sel, ...(min ? { min } : {}), ...(max ? { max } : {}), ...(levels ? { levels } : {}) });
  const ok = (d: ISODate) => !(min && d < min) && !(max && d > max);
  // Changing month moves the focused day with it (same day number, clamped), so Tab always has a cell.
  const go = (n: number) => { setYm(shiftMonth(ym.year, ym.month, n)); setFocus(clampDate(sameDayIn(focus, n), min, max)); };
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
      <MonthYearHeader ym={ym} {...(min ? { min: ymOf(min) } : {})} {...(max ? { max: ymOf(max) } : {})} onChange={n => {
        const d = (n.year - ym.year) * 12 + (n.month - ym.month);
        if (d) go(d);
      }} />
      <div className="cal-dow" aria-hidden="true">{DOW.map((d, i) => <span key={i}>{d}</span>)}</div>
      <div className="cal-grid" role="grid" aria-label={monthLabel(ym.year, ym.month)} ref={grid} onKeyDown={onKey}>
        {weeks.map((w, i) => (
          <div key={i} role="row" className="cal-week">
            {w.map(d => (
              <button key={d.iso} type="button" role="gridcell" data-iso={d.iso} disabled={d.disabled} aria-selected={d.selected} aria-label={dayLabel(d.iso, d.level)}
                tabIndex={d.iso === tab ? 0 : -1}
                className={`cal-day${d.inMonth ? '' : ' out'}${d.today ? ' today' : ''}${d.selected ? ' sel' : ''}${d.level !== null ? ' has' : ''}`}
                onClick={() => { setSel(d.iso); setFocus(d.iso); }}>
                {Number(d.iso.slice(8))}
                {d.level !== null && <Marker level={d.level} className="cal-mark" />}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="legend-row cal-legend">
        <span className="cal-legend-in" aria-hidden="true">Less {([0, 1, 2] as const).map(l => <Marker key={l} level={l} />)} More</span>
        <InfoButton label="About the day markers">A strip under a day means you trained. Denser and more solid means more working sets that day, in three steps compared with your busiest day.</InfoButton>
      </div>
      <div className="tk-btnrow">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" className="grow" disabled={!canConfirm({ sel, value, ...(min ? { min } : {}), ...(max ? { max } : {}), ...(requireChange ? { requireChange } : {}) })} onClick={() => sel && onPick(sel)}>{confirmLabel}</Button>
      </div>
      {onClear && value && <Button variant="quiet" block onClick={onClear}>No date</Button>}
    </Sheet>
  );
}

/** The day marker: 4 px squares on a 24 x 8 box (see markerRects). */
function Marker({ level, className = '' }: { level: DayLevel; className?: string }) {
  return (
    <svg className={`cal-marker ${className}`.trim()} width={MARKER_W} height={MARKER_H} viewBox={`0 0 ${MARKER_W} ${MARKER_H}`} aria-hidden="true">
      {markerRects(level).map(r => <rect key={`${r.x},${r.y}`} x={r.x} y={r.y} width={r.w} height={r.h} />)}
    </svg>
  );
}
