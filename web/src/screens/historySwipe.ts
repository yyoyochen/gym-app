// Calendar month swipe. Months run left to right like a wall calendar: finger
// right shows the previous month, finger left the next. A drag that is short
// or mostly vertical is a scroll and changes nothing.
const MIN_DX = 60;

/** -1 (previous month), 1 (next) or 0, from a touch's dx/dy in px. */
export function swipeMonths(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < MIN_DX || Math.abs(dx) < 1.5 * Math.abs(dy)) return 0;
  return dx > 0 ? -1 : 1;
}
