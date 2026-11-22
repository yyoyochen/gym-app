import { ICONS, iconRuns, iconSize, type IconName } from './icons';

const RUNS = new Map<IconName, { x: number; y: number; w: number }[]>();
const runsFor = (n: IconName) => {
  let r = RUNS.get(n);
  if (!r) { r = iconRuns(ICONS[n]); RUNS.set(n, r); }
  return r;
};

/**
 * A 1-bit pixel icon (9 × 9; the gear 13 × 13) at an integer scale (`scale` px per pixel, default 2 → 18px).
 * Inherits colour. Decorative unless `title` is given.
 */
export function PixelIcon({ name, scale = 2, title, className = '' }: { name: IconName; scale?: number; title?: string; className?: string }) {
  const s = iconSize(name, scale);
  const n = ICONS[name].length;
  return (
    <svg className={`px ${className}`} width={s} height={s} viewBox={`0 0 ${n} ${n}`} fill="currentColor"
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true })}>
      {runsFor(name).map(r => <rect key={`${r.x},${r.y}`} x={r.x} y={r.y} width={r.w} height={1} />)}
    </svg>
  );
}
