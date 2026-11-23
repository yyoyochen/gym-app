// A list you reorder by dragging a row's grip (a line and two dotted rails), or, with `longPress`,
// by holding a row still for a moment and then dragging it. The row follows
// the finger, the others slide aside, and the new order is saved on release.
// A quick tap still reaches the row; a swipe still scrolls.
// Keyboard: focus a grip and press ↑ / ↓ to move that row one place. The grip
// is marked data-no-drag so a sheet doesn't take the gesture as swipe-to-close.
import { useRef, useState, type ReactNode } from 'react';
import { PixelIcon } from './PixelIcon';
import { LONG_PRESS_MS, dropIndex, moveTo, pressOutcome, shiftFor } from './reorder';

interface Drag { from: number; to: number; startY: number; dy: number; heights: number[] }

export function DragList<T>({ items, keyOf, labelOf, onReorder, render, longPress = false }: {
  items: readonly T[];
  keyOf: (item: T) => string;
  /** Spoken name of a row, for the grip's label ("Move Back Squat"). */
  labelOf: (item: T) => string;
  onReorder: (next: T[]) => void;
  /** Draws row `i`; put `grip` where the handle should sit. */
  render: (item: T, i: number, grip: ReactNode) => ReactNode;
  /** Hold a row to lift it (no grip needed). */
  longPress?: boolean;
}) {
  const rows = useRef<(HTMLDivElement | null)[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const live = useRef<Drag | null>(null);
  const latest = useRef({ items, onReorder });
  latest.current = { items, onReorder };

  const suppressClick = useRef(false);
  // While a row is lifted, a touch drag must move the row, not scroll the page.
  const noScroll = (e: TouchEvent) => { if (live.current && e.cancelable) e.preventDefault(); };

  // Move and release are followed on the window, so the row keeps tracking the
  // finger even when it leaves the row or the small grip.
  const begin = (i: number, id: number, clientY: number) => {
    const heights = latest.current.items.map((_, j) => rows.current[j]?.getBoundingClientRect().height ?? 0);
    const d: Drag = { from: i, to: i, startY: clientY, dy: 0, heights };
    live.current = d; setDrag(d);
    window.addEventListener('touchmove', noScroll, { passive: false });
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
      window.removeEventListener('touchmove', noScroll);
      const fin = live.current;
      live.current = null; setDrag(null);
      // A click that follows this release belongs to the drag; after that, taps work again.
      setTimeout(() => { suppressClick.current = false; }, 0);
      if (fin && fin.to !== fin.from) latest.current.onReorder(moveTo(latest.current.items, fin.from, fin.to));
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const start = (i: number, e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    begin(i, e.pointerId, e.clientY);
  };
  // Long press: wait for a still finger; moving first is a scroll, letting go first is a tap.
  const press = (i: number, e: React.PointerEvent<HTMLDivElement>) => {
    if (!longPress || e.button !== 0 || live.current) return;
    const id = e.pointerId, x0 = e.clientX, y0 = e.clientY, t0 = e.timeStamp;
    let last = { x: x0, y: y0 };
    const stop = () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', track);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
    const track = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      last = { x: ev.clientX, y: ev.clientY };
      if (pressOutcome(ev.timeStamp - t0, Math.hypot(last.x - x0, last.y - y0)) === 'scroll') stop();
    };
    const timer = setTimeout(() => {
      stop();
      suppressClick.current = true;
      // A held text field must not keep the keyboard up or start a text selection while the row moves.
      (document.activeElement as HTMLElement | null)?.blur?.();
      window.getSelection?.()?.removeAllRanges();
      begin(i, id, last.y);
    }, LONG_PRESS_MS);
    window.addEventListener('pointermove', track);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
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
          <div key={keyOf(item)} ref={el => { rows.current[i] = el; }} className={`drag-item${moving ? ' lifted' : ''}${longPress ? ' hold' : ''}`}
            style={y ? { transform: `translateY(${y}px)` } : undefined}
            data-no-drag={longPress ? '' : undefined}
            onPointerDown={longPress ? e => press(i, e) : undefined}
            onContextMenu={longPress ? e => e.preventDefault() : undefined}
            onClickCapture={e => { if (suppressClick.current) { suppressClick.current = false; e.stopPropagation(); e.preventDefault(); } }}>
            {render(item, i, grip)}
          </div>
        );
      })}
    </div>
  );
}
