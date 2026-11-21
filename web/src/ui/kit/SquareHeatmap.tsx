import { useMemo } from 'react';
import { heatmapGrid } from './dither';

// Geometry in SVG units. The SVG scales to the container width, so cells stay
// square at any screen size: 52 weeks on a 390 px phone ≈ 6.5 px per cell.
const CELL = 9;
const GAP = 2;
const STEP = CELL + GAP;
const DIV = 4;                 // a cell is a 4 × 4 ordered dither of sub-pixels
const SUB = CELL / DIV;
const MARK_H = 2;              // week-target mark under each column
const MARK_GAP = 3;

// Even ordered-dither steps on a 4 × 4 grid, chosen so every step looks
// uniform (no stripes or shapes):
//   25%  one dot every other row and column
//   50%  checkerboard
//   75%  the 25% grid inverted: holes every other row and column
//   100% solid
const STEPS: readonly ((x: number, y: number) => boolean)[] = [
  (x, y) => x % 2 === 0 && y % 2 === 0,
  (x, y) => (x + y) % 2 === 0,
  (x, y) => !(x % 2 === 1 && y % 2 === 1),
  () => true,
];
/** Sub-pixels lit per level: 25 / 50 / 75 / 100% of 16. */
export const SUBPIXELS = [4, 8, 12, 16] as const;

/** Sub-pixel rects (x, y in units) for a cell at a level; exported for tests. */
export function cellPixels(level: number): [number, number][] {
  if (level < 0) return [];
  const on = STEPS[Math.min(level, 3)];
  const out: [number, number][] = [];
  for (let y = 0; y < DIV; y++) for (let x = 0; x < DIV; x++) if (on(x, y)) out.push([x * SUB, y * SUB]);
  return out;
}

/**
 * Year-at-a-glance heatmap with square cells: one column per week (Sunday
 * first), one row per weekday, filling the container width. Cell shade is a
 * tiny ordered dither in the accent colour; empty days are a faint dot.
 */
export function SquareHeatmap({ counts, weeks = 52, end, thresholds, weekTarget, onSelect, label = 'Training days', legend = false, className = '' }: {
  counts: Record<string, number>;
  weeks?: number;
  /** Last day shown (today), ISO. */
  end: string;
  thresholds?: readonly [number, number, number];
  /** Days a week that count as "met": draws a mark under each week column. */
  weekTarget?: number;
  onSelect?: (date: string) => void;
  label?: string;
  legend?: boolean;
  className?: string;
}) {
  const g = useMemo(() => heatmapGrid({ counts, weeks, end, thresholds, weekTarget }), [counts, weeks, end, thresholds, weekTarget]);
  const W = weeks * STEP - GAP;
  const gridH = 7 * STEP - GAP;
  const H = gridH + (g.weekMarks ? MARK_GAP + MARK_H : 0);
  const trained = g.rows.reduce((n, r) => n + r.cells.filter(c => c.level >= 0).length, 0);

  return (
    <div className={`sqheat ${className}`}>
      <div className="sqheat-months" aria-hidden="true">
        {g.months.map(m => (
          <span key={m.week} style={{ left: `${(m.week * STEP / W) * 100}%` }}>{m.text}</span>
        ))}
      </div>
      <svg className="sqheat-grid" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${trained} days in the last ${weeks} weeks`} shapeRendering="crispEdges">
        {g.rows.map((r, d) => r.cells.map((c, w) => {
          const x = w * STEP, y = d * STEP;
          if (c.future) return null;
          return (
            <g key={c.date} transform={`translate(${x} ${y})`}>
              {c.level < 0
                ? <rect className="sqheat-empty" x={CELL / 2 - 0.75} y={CELL / 2 - 0.75} width={1.5} height={1.5} />
                : cellPixels(c.level).map(([px, py]) => <rect key={`${px},${py}`} className="sqheat-on" x={px} y={py} width={SUB} height={SUB} />)}
              {c.isEnd && <rect className="sqheat-today" x={-0.75} y={-0.75} width={CELL + 1.5} height={CELL + 1.5} />}
              {onSelect && c.level >= 0 && (
                <rect className="sqheat-hit" x={-GAP / 2} y={-GAP / 2} width={STEP} height={STEP} onClick={() => onSelect(c.date)}>
                  <title>{`${c.date}: ${c.count}`}</title>
                </rect>
              )}
            </g>
          );
        }))}
        {g.weekMarks?.map((m, w) => m === 'none' ? null : (
          <rect key={`wk${w}`} className={`sqheat-wk ${m}`} x={w * STEP} y={gridH + MARK_GAP} width={CELL} height={MARK_H} />
        ))}
      </svg>
      {legend && (
        <div className="sqheat-legend" aria-hidden="true">
          <span>Less</span>
          {[0, 1, 2, 3].map(l => (
            <svg key={l} viewBox={`0 0 ${CELL} ${CELL}`} className="sqheat-key" shapeRendering="crispEdges">
              {cellPixels(l).map(([px, py]) => <rect key={`${px},${py}`} className="sqheat-on" x={px} y={py} width={SUB} height={SUB} />)}
            </svg>
          ))}
          <span>More</span>
          {g.weekMarks && <span className="sqheat-legend-wk"><i /> week at target</span>}
        </div>
      )}
    </div>
  );
}
