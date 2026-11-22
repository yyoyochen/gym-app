// Type-led display pieces: the boxed lockup, hero numbers, label/value pairs,
// verdict chips and the glyph dither bar.
import type { ReactNode } from 'react';
import { PixelIcon } from './PixelIcon';
import { ditherBar } from './dither';

const STAMP_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STAMP_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sun 22 Nov": the date in the header lockup and the PR moment label. */
export function stampDate(d: Date = new Date()): string {
  return `${STAMP_DAYS[d.getDay()]} ${d.getDate()} ${STAMP_MONTHS[d.getMonth()]}`;
}

/**
 * Boxed header lockup: [mark | INVERTED CELL | right]. Mono caps.
 * e.g. <Lockup mid="Training log //Session A" /> → [▮GB | TRAINING LOG //SESSION A | Fri 21 Nov]
 */
export function Lockup({ mid, left, right, date, className = '' }: {
  mid: ReactNode; left?: ReactNode; right?: ReactNode; date?: Date; className?: string;
}) {
  return (
    <div className={`lockup ${className}`}>
      <span className="lockup-mark">{left ?? <><PixelIcon name="bar" />GB</>}</span>
      <span className="lockup-inv">{mid}</span>
      <span className="lockup-right">{right ?? stampDate(date)}</span>
    </div>
  );
}

/**
 * The hero number of a screen: heavy grotesk, tight tracking, with an optional
 * unit and a quiet caption stacked beside it ("100 kg × 2 / top double").
 */
export function BigNumber({ value, unit, caption, size = 'hero', accent, className = '', label }: {
  value: ReactNode; unit?: ReactNode; caption?: ReactNode; size?: 'hero' | 'display' | 'lg';
  accent?: boolean; className?: string; /** Accessible text when the visual split reads badly. */ label?: string;
}) {
  return (
    <div className={`bignum ${size} ${accent ? 'accent' : ''} ${className}`} aria-label={label} role={label ? 'img' : undefined}>
      <span className="bignum-v">{value}</span>
      {(unit || caption) && (
        <span className="bignum-u">{unit}{caption && <span className="bignum-c">{caption}</span>}</span>
      )}
    </div>
  );
}

export interface LabelValueItem { label: ReactNode; value: ReactNode; accent?: boolean; id?: string }

/** One quiet grey label over a bold value. */
export function LabelValue({ label, value, accent, className = '' }: Omit<LabelValueItem, 'id'> & { className?: string }) {
  return (
    <div className={`lv ${className}`}>
      <span className="lv-l">{label}</span>
      <b className={`lv-v ${accent ? 'accent' : ''}`}>{value}</b>
    </div>
  );
}

/**
 * Pairs grid (weather-app hierarchy, default 2 columns), or `variant="stats"`:
 * a mono definition list, label in ink and value in accent.
 */
export function LabelValueGrid({ items, columns = 2, variant = 'pairs', className = '' }: {
  items: LabelValueItem[]; columns?: number; variant?: 'pairs' | 'stats'; className?: string;
}) {
  if (variant === 'stats') {
    return (
      <dl className={`stats ${className}`}>
        {items.map((it, i) => (
          <div key={it.id ?? i} className="stats-row"><dt>{it.label}</dt><dd>{it.value}</dd></div>
        ))}
      </dl>
    );
  }
  return (
    <div className={`lv-grid ${className}`} style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
      {items.map((it, i) => <LabelValue key={it.id ?? i} label={it.label} value={it.value} accent={it.accent} />)}
    </div>
  );
}

export type VerdictKind = 'beat' | 'hit' | 'missed' | 'new';
const VERDICT_TEXT: Record<VerdictKind, string> = { beat: 'Beat', hit: 'Hit', missed: 'Missed', new: 'New' };

/** Verdict chip without colour: BEAT solid ink, HIT outline, MISSED dashed + faded. */
export function Verdict({ kind, children, className = '' }: { kind: VerdictKind; children?: ReactNode; className?: string }) {
  return <span className={`verdict ${kind} ${className}`}>{children ?? VERDICT_TEXT[kind]}</span>;
}

/**
 * Glyph dither bar: █ run, ▓▒░ tail, dotted · track. Label left, value right
 * (accent), bar underneath. Exposed to assistive tech as a meter.
 */
export function DitherBar({ value, cells = 28, label, valueText, ariaLabel, className = '' }: {
  value: number; cells?: number; label?: ReactNode; valueText?: ReactNode; ariaLabel?: string; className?: string;
}) {
  const g = ditherBar(value, cells);
  const v = Math.round(Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100);
  return (
    <div className={`dbar ${className}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v}
      aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
      aria-valuetext={typeof valueText === 'string' ? valueText : `${v}%`}>
      {(label || valueText) && <><span className="dbar-l">{label}</span><span className="dbar-v">{valueText}</span></>}
      <span className="dbar-g" aria-hidden="true">{g.solid}{g.tail}<i>{g.track}</i></span>
    </div>
  );
}

/**
 * The settings/profile row: key on the left, value (with an optional sub
 * line and extra `main` content under it), an optional right value, then any
 * trailing controls. A link when given `href`. Styles: setup.css `.srow*`.
 */
export function ValueRow({ k, value, sub, main, right, rightMid, valueClassName, href, className = '', children, ...rest }: {
  k?: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  main?: ReactNode;
  right?: ReactNode;
  rightMid?: boolean;
  valueClassName?: string;
  href?: string;
  className?: string;
  children?: ReactNode;
  [data: `data-${string}`]: string | undefined;
}) {
  const v = <span className={valueClassName ? `srow-v ${valueClassName}` : 'srow-v'}>{value}</span>;
  const inner = (
    <>
      {k !== undefined && <span className="srow-k">{k}</span>}
      {sub || main ? <span className="srow-main">{v}{sub ? <span className="srow-sub">{sub}</span> : null}{main}</span> : v}
      {right !== undefined && <span className={rightMid ? 'srow-r mid' : 'srow-r'}>{right}</span>}
      {children}
    </>
  );
  const cls = className ? `srow ${className}` : 'srow';
  return href ? <a className={cls} href={href} {...rest}>{inner}</a> : <div className={cls} {...rest}>{inner}</div>;
}

/** A legend strip under a chart or heatmap, in the label role. Decorative: hidden from screen readers. */
export function Legend({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={className ? `legend ${className}` : 'legend'} aria-hidden="true">{children}</div>;
}
