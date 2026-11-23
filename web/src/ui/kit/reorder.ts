// Drag-to-reorder math, pure (the component is DragList.tsx).

/** The index a row dragged from `from` by `dy` px lands on: it passes a neighbour once it is past that row's middle. */
export function dropIndex(from: number, dy: number, heights: readonly number[]): number {
  let idx = from, acc = 0;
  if (dy > 0) {
    for (let i = from + 1; i < heights.length; i++) {
      acc += heights[i];
      if (dy > acc - heights[i] / 2) idx = i; else break;
    }
  } else if (dy < 0) {
    for (let i = from - 1; i >= 0; i--) {
      acc += heights[i];
      if (-dy > acc - heights[i] / 2) idx = i; else break;
    }
  }
  return idx;
}

/** How far row `i` slides while the row at `from` (height `h`) hovers over `to`. */
export function shiftFor(i: number, from: number, to: number, h: number): number {
  if (from < to && i > from && i <= to) return -h;
  if (from > to && i >= to && i < from) return h;
  return 0;
}

/** A copy of `items` with the item at `from` moved to `to`. */
export function moveTo<T>(items: readonly T[], from: number, to: number): T[] {
  const out = items.slice();
  if (from === to || from < 0 || from >= out.length || to < 0 || to >= out.length) return out;
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
}
