import { Legend } from './Display';
import { InfoButton } from './InfoButton';
import { HEATMAP_INFO } from './heatmapInfo';
import { useMemo } from 'react';
import { heatmapGrid } from './dither';

// Geometry in SVG units. The SVG scales to the container width. Two cell
// shapes: 'glyph' cells are shade glyphs (░ ▒ ▓ █), half as wide as tall, a
// 4 × 8 dither of square sub-pixels (52 weeks on a 390 px phone ≈ 5.3 × 10.6 px
// per cell); 'square' cells are 8 × 8 and fill the row, for a short window
// shown large (the Calendar's 13 weeks ≈ 22 px cells).
export type CellShape = 'glyph' | 'square';
const SUB = 2;
const DIV_Y = 8;
const divX = (shape: CellShape) => (shape === 'square' ? 8 : 4);
const CELL_H = DIV_Y * SUB;
const GAP = 2;
const STEP_Y = CELL_H + GAP;
const MARK_H = 2;              // week-target mark under each column
const MARK_GAP = 3;
// Largest on-screen px per SVG unit for glyph cells: a short history or a wide
// screen keeps phone-sized cells instead of stretching them to fill the row.
const MAX_SCALE = 0.8;

// The classic shade glyphs as ordered dither:
//   ░ 25%  a dot on every other row, staggered row to row
//   ▒ 50%  checkerboard
//   ▓ 75%  ░ inverted
//   █      solid
const light = (x: number, y: number) => y % 2 === 0 && x % 2 === (y / 2) % 2;
const STEPS: readonly ((x: number, y: number) => boolean)[] = [
  light,
  (x, y) => (x + y) % 2 === 0,
  (x, y) => !light(x, y),
  () => true,
];
/** Whether sub-pixel (x, y) is lit at a shade level (0–3); the pattern repeats every 2 × 4. */
export function shadeOn(level: number, x: number, y: number): boolean {
  return level >= 0 && STEPS[Math.min(level, 3)](x, y);
}
/** Sub-pixels lit per level: 25 / 50 / 75 / 100% of 32. */
export const SUBPIXELS = [8, 16, 24, 32] as const;
export const CELL_DIV = { x: divX('glyph'), y: DIV_Y, sub: SUB } as const;

/** Sub-pixel rects (x, y in units) for a cell at a level; exported for tests. */
export function cellPixels(level: number, shape: CellShape = 'glyph'): [number, number][] {
  if (level < 0) return [];
  const on = STEPS[Math.min(level, 3)];
  const out: [number, number][] = [];
  for (let y = 0; y < DIV_Y; y++) for (let x = 0; x < divX(shape); x++) if (on(x, y)) out.push([x * SUB, y * SUB]);
  return out;
}

/**
 * Year-at-a-glance heatmap in shade glyphs: one column per week, one row per
 * weekday (Mon → Sun, all seven named down the left), filling the container width. Cell shade is a
 * tiny ordered dither in the accent colour; empty days are a faint dot.
 */
export function SquareHeatmap({ counts, weeks = 52, end, thresholds, weekTarget, onSelect, label = 'Training days', legend = false, className = '', shape = 'glyph' }: {
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
  shape?: CellShape;
}) {
  const CELL_W = divX(shape) * SUB;
  const STEP_X = CELL_W + GAP;
  const g = useMemo(() => heatmapGrid({ counts, weeks, end, thresholds, weekTarget }), [counts, weeks, end, thresholds, weekTarget]);
  const W = weeks * STEP_X - GAP;
  const gridH = 7 * STEP_Y - GAP;
  const H = gridH + (g.weekMarks ? MARK_GAP + MARK_H : 0);
  const trained = g.rows.reduce((n, r) => n + r.cells.filter(c => c.level >= 0).length, 0);

  return (
    <div className={`sqheat ${shape} ${className}`.trim()} style={shape === 'glyph' ? { maxWidth: `calc(var(--sqheat-days) + ${W * MAX_SCALE}px)` } : undefined}>
      <div className="sqheat-months" aria-hidden="true">
        {g.months.map(m => (
          <span key={m.week} style={{ left: `${(m.week * STEP_X / W) * 100}%` }}>{m.text}</span>
        ))}
      </div>
      <div className="sqheat-body">
      <div className="sqheat-days" aria-hidden="true">
        {g.rows.map((r, d) => (
          <span key={r.day} style={{ top: `${((d * STEP_Y + CELL_H / 2) / H) * 100}%` }}>{r.day}</span>
        ))}
      </div>
      <svg className="sqheat-grid" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${trained} days in the last ${weeks} weeks`} shapeRendering="crispEdges">
        {g.rows.map((r, d) => r.cells.map((c, w) => {
          const x = w * STEP_X, y = d * STEP_Y;
          if (c.future) return null;
          return (
            <g key={c.date} transform={`translate(${x} ${y})`}>
              {c.level < 0
                ? <rect className="sqheat-empty" x={CELL_W / 2 - 1} y={CELL_H / 2 - 1} width={2} height={2} />
                : cellPixels(c.level, shape).map(([px, py]) => <rect key={`${px},${py}`} className="sqheat-on" x={px} y={py} width={SUB} height={SUB} />)}
              {c.isEnd && <rect className="sqheat-today" x={-0.75} y={-0.75} width={CELL_W + 1.5} height={CELL_H + 1.5} />}
              {onSelect && c.level >= 0 && (
                <rect className="sqheat-hit" x={-GAP / 2} y={-GAP / 2} width={STEP_X} height={STEP_Y} onClick={() => onSelect(c.date)}>
                  <title>{`${c.date}: ${c.count}`}</title>
                </rect>
              )}
            </g>
          );
        }))}
        {g.weekMarks?.map((m, w) => m === 'none' ? null : (
          <rect key={`wk${w}`} className={`sqheat-wk ${m}`} x={w * STEP_X} y={gridH + MARK_GAP} width={CELL_W} height={MARK_H} />
        ))}
      </svg>
      </div>
      {legend && (
        <div className="legend-row">
        <Legend className="sqheat-legend">
          <span>Less</span>
          {[0, 1, 2, 3].map(l => (
            <svg key={l} viewBox={`0 0 ${CELL_W} ${CELL_H}`} className="sqheat-key" shapeRendering="crispEdges">
              {cellPixels(l, shape).map(([px, py]) => <rect key={`${px},${py}`} className="sqheat-on" x={px} y={py} width={SUB} height={SUB} />)}
            </svg>
          ))}
          <span>More</span>
          {g.weekMarks && <span className="sqheat-legend-wk"><i /> week at target</span>}
        </Legend>
        <InfoButton label="About the heatmap">{HEATMAP_INFO}</InfoButton>
        </div>
      )}
    </div>
  );
}
