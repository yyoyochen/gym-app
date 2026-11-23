import { Legend } from './Display';
import { InfoButton } from './InfoButton';
import { heatmapInfo } from './heatmapInfo';
import { t, tr } from '../../i18n';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { WEEK_MARK, heatGlyph, heatmapGrid, SHADES, EMPTY } from './dither';

/**
 * Training-days heatmap in glyphs: · empty, ░ ▒ ▓ █ rising. Columns are weeks
 * (Monday first), month labels on top, Mon/Wed/Fri down the side. Each glyph
 * sits in its own 1ch grid cell, so fallback fonts for the block glyphs can't
 * misalign columns. Scrolls horizontally and opens at the most recent week.
 */
export function GlyphHeatmap({ counts, weeks, end, thresholds, weekTarget, onSelect, label = t('Training days'), legend = false, className = '' }: {
  /** ISO date → count (sessions or sets); 0/missing = nothing logged. */
  counts: Record<string, number>;
  weeks: number;
  /** Last day shown (today), ISO. */
  end: string;
  /** [a, b, c] count cut-offs for ░▒▓█; default = quartiles of the max in view. */
  thresholds?: readonly [number, number, number];
  /** Days per week that make a week "met": adds a Wk row (█ met, ░ some, · none). */
  weekTarget?: number;
  /** Makes logged days tappable. */
  onSelect?: (date: string) => void;
  label?: string;
  legend?: boolean;
  className?: string;
}) {
  const g = useMemo(() => heatmapGrid({ counts, weeks, end, thresholds, weekTarget }), [counts, weeks, end, thresholds, weekTarget]);
  const wrap = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { const w = wrap.current; if (w) w.scrollLeft = w.scrollWidth; }, [weeks, end]);
  const trained = g.rows.reduce((n, r) => n + r.cells.filter(c => c.level >= 0).length, 0);
  const cols = { gridTemplateColumns: `4ch repeat(${weeks}, 1ch)` };
  return (
    <div className={`gheat ${className}`}>
      <div className="gheat-scroll" ref={wrap}>
        <div className="gheat-grid" style={cols} role="img" aria-label={t('{label}: {n} days in the last {weeks} weeks', { label, n: trained, weeks })}>
          {g.months.map(m => (
            <span key={`m${m.week}`} className="gheat-month" style={{ gridColumn: `${m.week + 2} / span 3`, gridRow: 1 }}>{m.text}</span>
          ))}
          {g.rows.map((r, d) => [
            <span key={`l${d}`} className="gheat-day" style={{ gridColumn: 1, gridRow: d + 2 }}>{r.label}</span>,
            ...r.cells.map((c, w) => {
              const style = { gridColumn: w + 2, gridRow: d + 2 };
              const cls = `gheat-c ${c.level < 0 ? 'e' : 'on'}${c.isEnd ? ' end' : ''}`;
              return onSelect && c.level >= 0
                ? <button key={c.date} type="button" className={cls} style={style} aria-label={`${c.date}, ${c.count}`} onClick={() => onSelect(c.date)}>{heatGlyph(c)}</button>
                : <span key={c.date} className={cls} style={style}>{heatGlyph(c)}</span>;
            }),
          ])}
          {g.weekMarks && [
            <span key="wl" className="gheat-day wk" style={{ gridColumn: 1, gridRow: 9 }}>{t('Wk')}</span>,
            ...g.weekMarks.map((m, w) => (
              <span key={`w${w}`} className={`gheat-c wk ${m}`} style={{ gridColumn: w + 2, gridRow: 9 }}>{WEEK_MARK[m]}</span>
            )),
          ]}
        </div>
      </div>
      {legend && (
        <div className="legend-row">
          <Legend className="gheat-legend">{tr('Less {scale} More', { scale: <span className="accent">{EMPTY} {SHADES.join(' ')}</span> })}</Legend>
          <InfoButton label={t('About the heatmap')}>{heatmapInfo()}</InfoButton>
        </div>
      )}
    </div>
  );
}
