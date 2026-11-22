// A step sparkline, pure: the value holds until the next point, then steps.
// Matches the lift chart's step line, at 72 × 22 for a list row.

/** Path and last-point position for `values` in a w × h box; null with fewer than two values. */
export function sparklinePath(values: number[], w: number, h: number): { d: string; last: { x: number; y: number } } | null {
  const v = values.filter(Number.isFinite);
  const n = v.length;
  if (n < 2) return null;
  const lo = Math.min(...v), hi = Math.max(...v);
  const X = (i: number) => 2 + (i * (w - 4)) / (n - 1);
  const Y = (x: number) => (hi === lo ? h / 2 : h - 3 - ((x - lo) / (hi - lo)) * (h - 6));
  let d = `M${X(0)},${Y(v[0])}`;
  for (let i = 1; i < n; i++) d += `H${X(i)}${Y(v[i]) === Y(v[i - 1]) ? '' : `V${Y(v[i])}`}`;
  return { d, last: { x: X(n - 1), y: Y(v[n - 1]) } };
}
