// A list you reorder by dragging a row's grip (six dots). The row follows the
// finger, the others slide aside, and the new order is saved on release.
// Keyboard: focus a grip and press ↑ / ↓ to move that row one place. The grip
// is marked data-no-drag so a sheet doesn't take the gesture as swipe-to-close.
import { useRef, useState, type ReactNode } from 'react';
import { PixelIcon } from './PixelIcon';
import { dropIndex, moveTo, shiftFor } from './reorder';

interface Drag { from: number; to: number; startY: number; dy: number; heights: number[] }

export function DragList<T>({ items, keyOf, labelOf, onReorder, render }: {
  items: readonly T[];
  keyOf: (item: T) => string;
  /** Spoken name of a row, for the grip's label ("Move Back Squat"). */
  labelOf: (item: T) => string;
  onReorder: (next: T[]) => void;
  /** Draws row `i`; put `grip` where the handle should sit. */
  render: (item: T, i: number, grip: ReactNode) => ReactNode;
}) {
  const rows = useRef<(HTMLDivElement | null)[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const live = useRef<Drag | null>(null);
  const latest = useRef({ items, onReorder });
  latest.current = { items, onReorder };

  // Move and release are followed on the window, so the row keeps tracking the
  // finger even when it leaves the small grip.
  const start = (i: number, e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const heights = latest.current.items.map((_, j) => rows.current[j]?.getBoundingClientRect().height ?? 0);
    const d: Drag = { from: i, to: i, startY: e.clientY, dy: 0, heights };
    live.current = d; setDrag(d);
    const id = e.pointerId;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id || !live.current) return;
      ev.preventDefault();
      const dy = ev.clientY - live.current.startY;
      live.current = { ...live.current, dy, to: dropIndex(live.current.from, dy, live.current.heights) };
      setDrag(live.current);
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      const fin = live.current;
      live.current = null; setDrag(null);
      if (fin && fin.to !== fin.from) latest.current.onReorder(moveTo(latest.current.items, fin.from, fin.to));
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const key = (i: number, e: React.KeyboardEvent) => {
    const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : -1;
    if (to < 0 || to >= items.length) return;
    e.preventDefault();
    onReorder(moveTo(items, i, to));
  };

  return (
    <div className={`drag-list${drag ? ' dragging' : ''}`}>
      {items.map((item, i) => {
        const moving = drag?.from === i;
        const y = !drag ? 0 : moving ? drag.dy : shiftFor(i, drag.from, drag.to, drag.heights[drag.from]);
        const grip = (
          <button type="button" className="drag-grip" data-no-drag="" aria-label={`Move ${labelOf(item)}: drag, or press up and down`}
            onPointerDown={e => start(i, e)} onKeyDown={e => key(i, e)}>
            <PixelIcon name="grip" />
          </button>
        );
        return (
          <div key={keyOf(item)} ref={el => { rows.current[i] = el; }} className={`drag-item${moving ? ' lifted' : ''}`}
            style={y ? { transform: `translateY(${y}px)` } : undefined}>
            {render(item, i, grip)}
          </div>
        );
      })}
    </div>
  );
}
