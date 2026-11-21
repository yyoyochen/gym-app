// Hand-drawn SVG: e1RM trend (accent) and top set (dashed), PR dots in accent.
import type { ISODate } from '../../domain/types';
import { daysBetween } from '../../engine';
import { kg } from '../../app/coach';

export interface ChartPoint { date: ISODate; e1rm: number; top: number; pr?: boolean }

export function E1rmChart({ points, label }: { points: ChartPoint[]; label: string }) {
  if (points.length < 2) return <p className="mid line">Two sessions or more draw the trend.</p>;
  const W = 340, H = 170, L = 36, R = 8, T = 10, B = 22;
  const d0 = points[0].date;
  const span = Math.max(1, daysBetween(d0, points[points.length - 1].date));
  const vals = points.flatMap(p => [p.e1rm, p.top]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = Math.max(2.5, (hi - lo) * 0.1);
  lo = Math.floor((lo - pad) / 2.5) * 2.5; hi = Math.ceil((hi + pad) / 2.5) * 2.5;
  const x = (d: ISODate) => L + (daysBetween(d0, d) / span) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = (f: (p: ChartPoint) => number) => points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(f(p)).toFixed(1)}`).join(' ');
  const mid = Math.round(((lo + hi) / 2) / 2.5) * 2.5;
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        <line className="axis" x1={L} x2={W - R} y1={H - B} y2={H - B} />
        {[lo, mid, hi].map(v => (
          <g key={v}><line className="axis" x1={L} x2={W - R} y1={y(v)} y2={y(v)} strokeOpacity={0.5} /><text x={2} y={y(v) + 4}>{kg(v)}</text></g>
        ))}
        <text x={L} y={H - 6}>{points[0].date.slice(2)}</text>
        <text x={W - R} y={H - 6} textAnchor="end">{points[points.length - 1].date.slice(2)}</text>
        <path className="topw" d={path(p => p.top)} />
        <path className="e1" d={path(p => p.e1rm)} />
        {points.map(p => <circle key={p.date} className={p.pr ? 'pr' : 'dot'} cx={x(p.date)} cy={y(p.e1rm)} r={p.pr ? 3.5 : 2} />)}
      </svg>
      <p className="mid micro line">— e1RM · - - top set · <span style={{ color: 'var(--pr)' }}>●</span> PR</p>
    </div>
  );
}
