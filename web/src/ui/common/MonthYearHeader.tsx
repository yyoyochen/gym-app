// Month header with ‹ › arrows and a tappable title. Tapping the title drops a
// panel down: the year with its own ‹ ›, and the twelve months as a 4 × 3 grid
// of boxes (the current month inverted). Picking a month closes it. Used by the
// date picker sheet and the Calendar tab.
import { useState } from 'react';
import { MONTHS, monthLabel, shiftMonth } from '../../app/dates';
import { PixelIcon } from '../kit';
import { clampMonth, monthInRange, type YM } from './monthYear';

export function MonthYearHeader({ ym, onChange, min, max, as: Title = 'h3' }: {
  ym: YM; onChange: (ym: YM) => void; min?: YM; max?: YM; as?: 'h2' | 'h3';
}) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(ym.year);
  const step = (n: number) => onChange(shiftMonth(ym.year, ym.month, n));
  const prev = shiftMonth(ym.year, ym.month, -1), next = shiftMonth(ym.year, ym.month, 1);
  const yearHas = (y: number) => MONTHS.some((_, i) => monthInRange(y, i + 1, min, max));
  return (
    <div className="myh">
      <div className="cal-hd">
        <button type="button" className="cal-nav" aria-label="Previous month" disabled={!monthInRange(prev.year, prev.month, min, max)} onClick={() => step(-1)}><PixelIcon name="back" scale={2} /></button>
        <Title className="cal-title">
          <button type="button" className="cal-title-btn" aria-expanded={open} aria-label={`${monthLabel(ym.year, ym.month)}: choose month and year`} data-press="dim"
            onClick={() => { setYear(ym.year); setOpen(!open); }}>
            <span aria-live="polite">{monthLabel(ym.year, ym.month)}</span><PixelIcon name={open ? 'up' : 'down'} scale={1} />
          </button>
        </Title>
        <button type="button" className="cal-nav" aria-label="Next month" disabled={!monthInRange(next.year, next.month, min, max)} onClick={() => step(1)}><PixelIcon name="chevron" scale={2} /></button>
      </div>
      {open && (
        <div className="myp" role="group" aria-label="Choose month and year">
          <div className="myp-year">
            <button type="button" className="cal-nav sm" aria-label="Previous year" disabled={!yearHas(year - 1)} onClick={() => setYear(year - 1)}><PixelIcon name="back" scale={1} /></button>
            <span className="myp-y tnum">{year}</span>
            <button type="button" className="cal-nav sm" aria-label="Next year" disabled={!yearHas(year + 1)} onClick={() => setYear(year + 1)}><PixelIcon name="chevron" scale={1} /></button>
          </div>
          <div className="myp-months">
            {MONTHS.map((m, i) => {
              const on = year === ym.year && i + 1 === ym.month;
              return (
                <button key={m} type="button" className={`myp-m${on ? ' on' : ''}`} aria-pressed={on} disabled={!monthInRange(year, i + 1, min, max)} data-press="dim"
                  onClick={() => { onChange(clampMonth({ year, month: i + 1 }, min, max)); setOpen(false); }}>{m}</button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
