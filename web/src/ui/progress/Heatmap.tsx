// GitHub-style consistency grid (spec §3.2): one column per week (Mon→Sun),
// shade = working sets that day (quartiles), a thin week mark to the right of
// each column (full = at target, half = at minimum), skips as outlined cells.
import { useEffect, useRef } from 'react';
import type { ISODate } from '../../domain/types';
import type { Consistency } from './consistency';

interface Props {
  data: Consistency;
  today: ISODate;
  /** Cell edge in px. */
  cell?: number;
  selected?: ISODate | null;
  onSelect?: (date: ISODate) => void;
  label: string;
}

export function Heatmap({ data, today, cell = 12, selected, onSelect, label }: Props) {
  const gap = 2;
  const mark = Math.max(2, Math.round(cell / 6));
  const colW = cell + gap + mark + gap + 1;
  const top = 14;
  const height = top + 7 * (cell + gap);
  const width = data.grid.columns.length * colW;
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => { if (wrap.current) wrap.current.scrollLeft = wrap.current.scrollWidth; }, [width]);
  return (
    <div className="heat heat-wrap" ref={wrap}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        {data.grid.monthLabels.map(m => <text key={m.col} className="mlabel" x={m.col * colW} y={10}>{m.label}</text>)}
        {data.grid.columns.map((col, i) => {
          const x = i * colW;
          const wm = data.weekMarks[i];
          return (
            <g key={col[0].date}>
              {col.map((c, r) => {
                if (!c.inWindow) return null;
                const y = top + r * (cell + gap);
                const skip = data.skipDates.has(c.date);
                const sessionId = data.sessionByDate[c.date];
                return (
                  <g key={c.date} className={sessionId && onSelect ? 'cell-hit' : undefined} onClick={onSelect ? () => onSelect(c.date) : undefined}>
                    <title>{`${c.date}: ${c.count} working set${c.count === 1 ? '' : 's'}${skip ? ', skipped' : ''}`}</title>
                    {skip
                      ? <rect className="skip" x={x + 0.5} y={y + 0.5} width={cell - 1} height={cell - 1} />
                      : <rect className={`c${c.bucket}`} x={x} y={y} width={cell} height={cell} />}
                    {c.date === today && <rect className="today" x={x - 0.5} y={y - 0.5} width={cell + 1} height={cell + 1} />}
                    {c.date === selected && <rect className="sel" x={x - 1} y={y - 1} width={cell + 2} height={cell + 2} />}
                  </g>
                );
              })}
              <rect className={`wk-${wm}`} x={x + cell + gap} y={wm === 'half' ? top + 3.5 * (cell + gap) : top}
                width={mark} height={wm === 'half' ? 3.5 * (cell + gap) - gap : 7 * (cell + gap) - gap}>
                <title>{`${data.weekSessions[i]} session${data.weekSessions[i] === 1 ? '' : 's'}`}</title>
              </rect>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
