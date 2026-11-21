// Touch-down feedback, UIKit style: the highlight lands on pointerdown (not on
// release), is cancelled if the finger drifts into a scroll, and fades out on
// release. Applies to .btn and anything with [data-press] ("button" | "dim" |
// "scale" | "row"); the look lives in base.css (.pressed).
const SELECTOR = '[data-press], .btn';
let installed = false;

export function installPressFeedback(root: Document = document): () => void {
  if (installed) return () => {};
  installed = true;
  let el: Element | null = null;
  let start: [number, number] = [0, 0];
  const clear = () => { el?.classList.remove('pressed'); el = null; };
  const down = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const t = (e.target as Element | null)?.closest?.(SELECTOR);
    if (!t || (t as HTMLButtonElement).disabled) return;
    el = t; start = [e.clientX, e.clientY];
    t.classList.add('pressed');
  };
  const move = (e: PointerEvent) => { if (el && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 10) clear(); };
  root.addEventListener('pointerdown', down, true);
  root.addEventListener('pointermove', move, true);
  root.addEventListener('pointerup', clear, true);
  root.addEventListener('pointercancel', clear, true);
  return () => {
    installed = false;
    root.removeEventListener('pointerdown', down, true);
    root.removeEventListener('pointermove', move, true);
    root.removeEventListener('pointerup', clear, true);
    root.removeEventListener('pointercancel', clear, true);
  };
}

/** Drop any active press highlight (call when a gesture takes over). */
export function cancelPress(root: Document = document): void {
  root.querySelectorAll('.pressed').forEach(n => n.classList.remove('pressed'));
}
