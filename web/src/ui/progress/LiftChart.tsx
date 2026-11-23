// Ink chart, hand-drawn SVG. Spec: docs/superpowers/specs/2026-11-22-lift-detail-charts-history-design.md.
// Step line (a value holds until the next session; a hold over 6 weeks is
// dotted) or solid weekly bars. The y-axis follows one rule (chartModel):
// ceiling 120% of the best, floor 90% of the lowest. Targets too close to or
// above the ceiling sit in a lane above the plot and never move the scale;
// a thin dither band marks the ceiling edge.
import type { ISODate } from '../../domain/types';
import { daysBetween, formatDate } from '../../app/dates';
import { kg } from '../../app/coach';
import { PLOT_PX, chartScale, diamondPoints, fillWeeks, gapText, stepRuns, type ChartTarget } from './chartModel';

export interface LinePoint { date: ISODate; value: number; pr?: boolean }

const W = 342, L = 34, R = 6, BOTTOM = 22, PIN_ROW = 13;
const ev = (v: number) => 2 * Math.round(v / 2);
const fmtTick = (v: number) => (Math.abs(v) >= 10_000 ? `${Math.round(v / 1000)}k` : Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v * 10) / 10));

/** `current` is what target gaps are measured from (the lift page passes its best e1RM in 90 days); defaults to the last point. */
export function LiftChart({ points, label, kind = 'step', targets = [], current, empty = 'Two sessions or more draw the line.' }: {
  points: LinePoint[]; label: string; kind?: 'step' | 'bars'; targets?: ChartTarget[]; current?: number | null; empty?: string;
}) {
  if (points.length < 2) return <p className="tk-quiet">{empty}</p>;
  const bars = kind === 'bars';
  const data: LinePoint[] = bars ? fillWeeks(points) : points;
  const s = chartScale({ values: data.map(p => p.value), zeroBased: bars, targets: bars ? [] : targets });
  const PT = ev((s.pinned.length ? s.pinned.length * PIN_ROW + 6 : 0) + 8);
  const PB = PT + PLOT_PX, H = PB + BOTTOM;
  const d0 = data[0].date, d1 = data[data.length - 1].date;
  const span = Math.max(1, daysBetween(d0, d1));
  const x = (d: ISODate) => L + (daysBetween(d0, d) / span) * (W - L - R);
  const y = (v: number) => PT + (1 - (v - s.lo) / (s.hi - s.lo)) * PLOT_PX;
  const now = current ?? data[data.length - 1].value;
  const last = data[data.length - 1];
  const step = (W - L - R - 6) / data.length, bw = ev(Math.min(20, step * 0.7));
  const aria = s.pinned.length ? `${label}. Above the chart: ${s.pinned.map(t => `${t.name} ${kg(t.value)} kg, ${gapText(t.value, now)}`).join('; ')}.` : label;

  return (
    <figure className="tk-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria}>
        {s.ticks.map(v => (
          <g key={v}>
            {v !== 0 && <line className="tk-grid" x1={L} x2={W - R} y1={y(v)} y2={y(v)} />}
            <text className="tk-tick" x={L - 6} y={y(v) + 3.5} textAnchor="end">{fmtTick(v)}</text>
          </g>
        ))}
        <line className="tk-base" x1={L} x2={W - R} y1={PB} y2={PB} />
        <text className="tk-tick" x={L} y={H - 6}>{formatDate(d0, { weekday: false, year: false })}</text>
        <text className="tk-tick" x={W - R} y={H - 6} textAnchor="end">{formatDate(d1, { weekday: false, year: false })}</text>

        {s.pinned.map((t, k) => {
          const by = PT - 7 - k * PIN_ROW, ax = W - R - 5;
          return (
            <g key={t.name}>
              <text className="tk-target-tx" x={W - R - 14} y={by} textAnchor="end">{`${t.name} ${kg(t.value)} kg  ${gapText(t.value, now)}`}</text>
              <polygon className="tk-target-mark" points={diamondPoints(ax, by - 3, 4)} />
            </g>
          );
        })}

        {s.inRange.map(t => {
          const ty = y(t.value), name = `${t.name} ${kg(t.value)} kg`, gap = gapText(t.value, now);
          return (
            <g key={t.name}>
              <line className="tk-target" x1={L} x2={W - R - 8} y1={ty} y2={ty} />
              <polygon className="tk-target-mark" points={diamondPoints(W - R - 4, ty, 4)} />
              <text className="tk-target-tx" x={L + 4} y={ty - 5}>{name}</text>
              <text className="tk-target-tx" x={W - R - 8} y={ty - 5} textAnchor="end">{gap}</text>
            </g>
          );
        })}
        {bars ? data.map((p, i) => {
          const bx = ev(L + 6 + i * step);
          return p.value > 0
            ? <rect key={p.date} className="tk-bar" x={bx} y={ev(y(p.value))} width={bw} height={PB - ev(y(p.value))} />
            : <rect key={p.date} className="tk-bar" x={bx + bw / 2 - 2} y={PB - 2} width={4} height={2} />;
        }) : (
          <>
            {stepRuns(data).map(r => (
              <g key={r.from}>
                <path className={r.dotted ? 'tk-line tk-hold' : 'tk-line'} d={`M${x(r.from)},${y(r.value)}H${x(r.to)}`} />
                <path className="tk-line" d={`M${x(r.to)},${y(r.value)}V${y(r.nextValue)}`} />
              </g>
            ))}
            {data.filter(p => p.pr).map(p => (
              <rect key={p.date} className="tk-pr" x={x(p.date) - 3.5} y={y(p.value) - 3.5} width={7} height={7} />
            ))}
            <rect className="tk-last" x={x(last.date) - 3.5} y={y(last.value) - 3.5} width={7} height={7} />
          </>
        )}
      </svg>
    </figure>
  );
}
