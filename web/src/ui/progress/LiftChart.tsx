// Ink line chart, hand-drawn SVG: one 1.5px ink line, a dotted grid, PR
// sessions as small solid squares, mono ticks. No fills, no second colour.
import type { ISODate } from '../../domain/types';
import { daysBetween, formatDate } from '../../app/dates';
import { niceTicks } from './stats';

export interface LinePoint { date: ISODate; value: number; pr?: boolean }

const fmtTick = (v: number) => (Math.abs(v) >= 10_000 ? `${Math.round(v / 1000)}k` : Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v * 10) / 10));

export function LiftChart({ points, label, empty = 'Two sessions or more draw the line.' }: { points: LinePoint[]; label: string; empty?: string }) {
  if (points.length < 2) return <p className="tk-quiet">{empty}</p>;
  const W = 342, H = 184, L = 34, R = 6, T = 8, B = 22;
  const d0 = points[0].date, d1 = points[points.length - 1].date;
  const span = Math.max(1, daysBetween(d0, d1));
  const vals = points.map(p => p.value);
  const ticks = niceTicks(Math.min(...vals), Math.max(...vals), 5);
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const x = (d: ISODate) => L + (daysBetween(d0, d) / span) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return (
    <figure className="tk-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {ticks.map(v => (
          <g key={v}>
            <line className="tk-grid" x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
            <text className="tk-tick" x={L - 6} y={y(v) + 3.5} textAnchor="end">{fmtTick(v)}</text>
          </g>
        ))}
        <line className="tk-base" x1={L} x2={W - R} y1={H - B} y2={H - B} />
        <text className="tk-tick" x={L} y={H - 6}>{formatDate(d0, { weekday: false, year: false })}</text>
        <text className="tk-tick" x={W - R} y={H - 6} textAnchor="end">{formatDate(d1, { weekday: false, year: false })}</text>
        <path className="tk-line" d={path} />
        {points.filter(p => p.pr).map(p => (
          <rect key={p.date} className="tk-pr" x={x(p.date) - 2.5} y={y(p.value) - 2.5} width={5} height={5} />
        ))}
        <rect className="tk-last" x={x(last.date) - 3.5} y={y(last.value) - 3.5} width={7} height={7} />
      </svg>
    </figure>
  );
}
