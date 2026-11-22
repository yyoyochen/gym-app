import { sparklinePath } from './sparklinePath';

/** Step sparkline: 1.5 px ink line, an accent square on the latest value. Nothing for fewer than two values. */
export function Sparkline({ values, label, w = 72, h = 22 }: { values: number[]; label: string; w?: number; h?: number }) {
  const p = sparklinePath(values, w, h);
  if (!p) return null;
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      <path className="spark-line" d={p.d} />
      <rect className="spark-end" x={p.last.x - 2.5} y={p.last.y - 2.5} width={5} height={5} />
    </svg>
  );
}
