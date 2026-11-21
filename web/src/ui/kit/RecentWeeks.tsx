import { useId, useMemo } from 'react';
import { heatmapGrid, type HeatCell, type HeatGrid } from './dither';
import { shadeOn } from './SquareHeatmap';

/**
 * The last `n` week columns of a heatmap grid as calendar rows, oldest first,
 * Monday → Sunday, with each week's target mark. Cut from the same 52-week
 * grid History draws, so a day's shade matches there.
 */
export function recentWeeks(g: HeatGrid, n = 4): { days: HeatCell[][]; marks: ('met' | 'part' | 'none')[] } {
  const cols = Array.from({ length: Math.min(n, g.weeks) }, (_, i) => g.weeks - Math.min(n, g.weeks) + i);
  return {
    days: cols.map(w => g.rows.map(r => r.cells[w])),
    marks: cols.map(w => g.weekMarks?.[w] ?? 'none'),
  };
}

const PX = 2; // one shade sub-pixel, in CSS px
const HEAD = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Today's near-term calendar: 4 rolling weeks of shaded day tiles, a week mark per row. */
export function RecentWeeks({ counts, end, weekTarget, onSelect, weeks = 4 }: {
  counts: Record<string, number>;
  end: string;
  weekTarget: number;
  onSelect?: (date: string) => void;
  weeks?: number;
}) {
  const g = useMemo(() => heatmapGrid({ counts, weeks: 52, end, weekTarget }), [counts, end, weekTarget]);
  const { days, marks } = recentWeeks(g, weeks);
  const uid = useId().replace(/:/g, '');
  return (
    <div className="rweeks" role="grid" aria-label={`Last ${weeks} weeks`}>
      <svg width="0" height="0" className="rweeks-defs" aria-hidden="true">
        <defs>
          {[0, 1, 2].map(l => (
            <pattern key={l} id={`${uid}-s${l}`} width={2 * PX} height={4 * PX} patternUnits="userSpaceOnUse">
              {[0, 1, 2, 3].flatMap(y => [0, 1].map(x => (shadeOn(l, x, y)
                ? <rect key={`${x}${y}`} x={x * PX} y={y * PX} width={PX} height={PX} fill="currentColor" /> : null)))}
            </pattern>
          ))}
        </defs>
      </svg>
      {HEAD.map((d, i) => <span key={i} className="rweeks-h" aria-hidden="true">{d}</span>)}
      <span aria-hidden="true" />
      {days.map((week, w) => [
        ...week.map(c => {
          const on = c.level >= 0 && !c.future;
          return (
            <button key={c.date} type="button" disabled={!on || !onSelect}
              className={`rweeks-d${on ? ' on' : ''}${c.future ? ' future' : ''}${c.isEnd ? ' today' : ''}`}
              aria-label={`${c.date}${on ? `, ${c.count} working set${c.count === 1 ? '' : 's'}` : ''}`}
              onClick={() => on && onSelect?.(c.date)}>
              {on && (
                <svg className="rweeks-fill" aria-hidden="true" shapeRendering="crispEdges">
                  <rect width="100%" height="100%" fill={c.level >= 3 ? 'currentColor' : `url(#${uid}-s${c.level})`} />
                </svg>
              )}
              {!c.future && <span className="rweeks-n">{Number(c.date.slice(8))}</span>}
            </button>
          );
        }),
        <span key={`m${w}`} className={`rweeks-wk ${marks[w]}`} aria-label={`Week ${marks[w] === 'met' ? 'at target' : marks[w] === 'part' ? 'below target' : 'not trained'}`} />,
      ])}
    </div>
  );
}
