// Ink chart, hand-drawn SVG. Spec: docs/superpowers/specs/2026-11-22-lift-detail-charts-history-design.md.
// Step line (a value holds until the next session; a hold over 6 weeks is
// dotted) or solid weekly bars. The y-axis follows one rule (chartModel):
// ceiling 120% of the best, floor 90% of the lowest. Targets too close to or
// above the ceiling sit in a lane above the plot and never move the scale;
// a thin dither band marks the ceiling edge. Target names and values sit in a
// key above the chart; inside it a target is a line, with its gap (+13) at the
// line's right end, in a margin of its own so it never touches the plot:
// the next level is the grid's fine dotted line in the accent colour, your own
// target is a tight row of * at 70% of the micro type size.
import type { ISODate } from '../../domain/types';
import { daysBetween, formatDate } from '../../app/dates';
import { kg } from '../../app/coach';
import { t } from '../../i18n';
import { PLOT_PX, chartScale, fillWeeks, gapText, spreadLabels, stepRuns, type ChartTarget } from './chartModel';

export interface LinePoint { date: ISODate; value: number; pr?: boolean }

const W = 342, L = 34, BOTTOM = 22, PIN_ROW = 13;
/** Right margin: room for the gap labels when there are targets. */
const R_PLAIN = 6, R_GAPS = 34, GAP_ROW = 10;
const ev = (v: number) => 2 * Math.round(v / 2);
const fmtTick = (v: number) => (Math.abs(v) >= 10_000 ? `${Math.round(v / 1000)}k` : Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v * 10) / 10));

/** `current` is what target gaps are measured from (the lift page passes its best e1RM in 90 days); defaults to the last point. */
export function LiftChart({ points, label, kind = 'step', targets = [], current, empty = t('Two sessions or more draw the line.') }: {
  points: LinePoint[]; label: string; kind?: 'step' | 'bars'; targets?: ChartTarget[]; current?: number | null; empty?: string;
}) {
  if (points.length < 2) return <p className="tk-quiet">{empty}</p>;
  const bars = kind === 'bars';
  const hasTargets = !bars && targets.length > 0;
  const R = hasTargets ? R_GAPS : R_PLAIN;
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
  const allTargets = [...s.pinned, ...s.inRange].sort((a, b) => b.value - a.value);
  const aria = s.pinned.length ? t('{label}. Above the chart: {targets}.', { label, targets: s.pinned.map(p => t('{name} {kg} kg, {gap}', { name: p.name, kg: kg(p.value), gap: gapText(p.value, now) })).join(t('; ')) }) : label;

  return (
    <figure className="tk-chart">
      {allTargets.length > 0 && (
        <ul className="tk-target-key">
          {allTargets.map(t => (
            <li key={t.name}><svg className="tk-key-line" viewBox={`0 0 ${KEY_W} 8`} aria-hidden="true"><CharLine t={t} y={4} x0={0} x1={KEY_W} /></svg><span>{t.name} {kg(t.value)} kg</span></li>
          ))}
        </ul>
      )}
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
          const by = PT - 10 - k * PIN_ROW;
          return <CharLine key={t.name} t={t} y={by} x0={L} x1={W - R} />;
        })}

        {s.inRange.map(t => (
          <CharLine key={t.name} t={t} y={y(t.value)} x0={L} x1={W - R} />
        ))}
        {(() => {
          // Each target's gap at the right end of its line, nudged apart when two lines sit close.
          const lines = [...s.pinned.map((t, k) => ({ t, ly: PT - 10 - k * PIN_ROW })), ...s.inRange.map(t => ({ t, ly: y(t.value) }))];
          const at = spreadLabels(lines.map(l => l.ly), GAP_ROW);
          return lines.map((l, i) => <text key={l.t.name} className="tk-gap" x={W} y={at[i] + 3.5} textAnchor="end">{gapText(l.t.value, now)}</text>);
        })()}
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

const STAR_SCALE = 0.7;
/** Width of a line sample in the key: the same box for both kinds, so they line up end to end. */
const KEY_W = 30;

/** A target line: the next level as a fine dotted line, your own target as a row of small * centred on y. */
function CharLine({ t, y, x0, x1 }: { t: ChartTarget; y: number; x0: number; x1: number }) {
  if (t.kind !== 'goal') return <line className="tk-target" x1={x0} x2={x1} y1={y} y2={y} />;
  const n = Math.max(2, Math.floor((x1 - x0) / 6));
  // Drawn at the micro role, then scaled to 70% so the stars sit just above the dots in weight.
  // +3 (before scaling) puts the middle of the * (it sits high in the em box) on the value.
  return (
    <g transform={`translate(${x0} ${y}) scale(${STAR_SCALE})`}>
      <text className="tk-target-chars" x={0} y={3} textLength={(x1 - x0) / STAR_SCALE} lengthAdjust="spacing">{'*'.repeat(n)}</text>
    </g>
  );
}
