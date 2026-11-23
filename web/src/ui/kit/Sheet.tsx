// Bottom sheet with HIG detents (UISheetPresentationController):
//  · medium + large detents; content shorter than medium gets one "fit" stop
//  · grabber; drag from the header, or from the body when it is scrolled to the
//    top and the finger moves down (never from a text field / [data-no-drag]
//    control). The body scrolls natively at every detent, medium included.
//  · release velocity is projected (UIScrollView deceleration) to pick a stop,
//    fling down past the lowest stop dismisses; overshoot rubber-bands
//  · at the large detent the app frame scales back behind it
//  · focus trap, Esc, backdrop tap; focus returns to the opener
//  · Android back closes the sheet, not the page (sheetHistory.ts)
// Closing works for both patterns callers use: open={false} and unmounting
// the whole <Sheet>. Either way the panel is cloned and springs out (a ghost),
// carrying the fling velocity.
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { PixelIcon } from './PixelIcon';
import { SPRINGS, VelocityTracker, animateSpring, nearestStop, projectFling, rubberband, type SpringHandle } from './motion/spring';
import { prefersReducedMotion } from './motion/reduced';
import { cancelPress } from './motion/press';
import { isTopModal, popModal, pushModal, setPresentingProgress, trapTab } from './modal';
import { pushSheetEntry } from './sheetHistory';
import { t } from '../../i18n';

export type Detent = 'medium' | 'large';

export interface SheetProps {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
  /** Allowed detents (default both). Content shorter than medium always gets a single fit stop. */
  detents?: Detent[];
  /** Where it opens (default: medium when allowed). */
  initialDetent?: Detent;
  /** Accessible name when there is no visible title. */
  label?: string;
  className?: string;
}

export function Sheet(props: SheetProps) {
  if (!props.open || typeof document === 'undefined') return null;
  return createPortal(<SheetPanel {...props} />, document.body);
}

const NO_DRAG = 'input, textarea, select, [contenteditable="true"], [data-no-drag]';
const MEDIUM_FRACTION = 0.56;

interface Geo { H: number; hidden: number; medium: number | null; large: number }

function SheetPanel({ title, onClose, children, detents = ['medium', 'large'], initialDetent, label, className = '' }: SheetProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const st = useRef({ y: 0, geo: null as Geo | null, anim: null as SpringHandle | null, closeV: 0, stop: 'medium' as 'medium' | 'large', hide: 0, opener: null as Element | null, alive: true });

  useLayoutEffect(() => {
    const root = rootRef.current!, panel = panelRef.current!, body = bodyRef.current!, back = backRef.current!;
    const s = st.current;
    s.opener = document.activeElement;
    s.alive = true;
    pushModal(root);

    const measure = (): Geo => {
      const H = panel.offsetHeight;
      const head = panel.querySelector<HTMLElement>('.sheet-head')?.offsetHeight ?? 0;
      const cs = getComputedStyle(body);
      const content = body.firstElementChild as HTMLElement | null;
      const natural = Math.min(H, head + (content?.offsetHeight ?? 0) + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) - s.hide);
      const mediumH = Math.round(window.innerHeight * MEDIUM_FRACTION);
      const large = Math.max(0, H - natural);
      const medium = detents.includes('medium') && natural > mediumH + 48 ? H - mediumH : null;
      return { H, hidden: H + 24, medium, large: detents.includes('large') || medium === null ? large : (medium ?? large) };
    };
    const stopY = (g: Geo, which: 'medium' | 'large') => (which === 'medium' && g.medium !== null ? g.medium : g.large);

    const paint = (y: number) => {
      s.y = y;
      const g = s.geo!;
      panel.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`;
      const first = g.medium ?? g.large;
      back.style.opacity = String(y >= first ? Math.max(0, Math.min(1, 1 - (y - first) / (g.hidden - first))) : 1);
      let prog = 0;
      if (g.large < 40) prog = g.medium !== null ? (g.medium - y) / (g.medium - g.large) : 1 - (y - g.large) / (g.hidden - g.large);
      setPresentingProgress(Math.max(0, Math.min(1, prog)));
      updateScrolls();
    };
    // The body scrolls at every detent. At medium its lower part is below the screen edge,
    // so it gets that much extra bottom padding: scrolling to the end brings the last row above the fold.
    const updateScrolls = () => { panel.classList.toggle('scrolls', body.scrollHeight > body.clientHeight + 1); };
    const setHide = (which: 'medium' | 'large') => {
      const g = s.geo!;
      s.hide = which === 'medium' && g.medium !== null ? g.medium : 0;
      body.style.setProperty('--sheet-hide', `${s.hide}px`);
      updateScrolls();
    };
    const settle = (y: number, velocity = 0) => {
      s.anim?.stop();
      s.anim = animateSpring({ from: s.y, to: y, velocity, ...SPRINGS.sheet, onUpdate: v => paint(v < s.geo!.large ? s.geo!.large - rubberband(s.geo!.large - v, s.geo!.H) : v) });
    };
    const goStop = (which: 'medium' | 'large', velocity = 0) => { s.stop = which; setHide(which); settle(stopY(s.geo!, which), velocity); };
    const requestClose = (velocity = 0) => {
      s.closeV = velocity;
      onCloseRef.current();
      // A parent that keeps it open gets the sheet back at its stop.
      requestAnimationFrame(() => { if (s.alive) goStop(s.stop); });
    };

    // System back pops this entry → close. A parent that keeps the sheet open
    // gets a fresh entry, so the next back still lands on the sheet.
    let release = () => {};
    const onSystemBack = () => {
      requestClose();
      requestAnimationFrame(() => { if (s.alive) release = pushSheetEntry(onSystemBack); });
    };
    release = pushSheetEntry(onSystemBack);

    s.geo = measure();
    s.stop = initialDetent === 'large' || s.geo.medium === null ? 'large' : 'medium';
    paint(s.geo.hidden);
    goStop(s.stop);
    panel.focus({ preventScroll: true });

    // Content that loads or grows re-measures the stops.
    const ro = new ResizeObserver(() => {
      if (!s.alive) return;
      const g = measure();
      const old = s.geo!;
      if (g.H === old.H && g.medium === old.medium && g.large === old.large) return;
      s.geo = g;
      if (s.stop === 'medium' && g.medium === null) s.stop = 'large';
      goStop(s.stop);
    });
    ro.observe(body.firstElementChild ?? body);

    const onResize = () => { s.geo = measure(); goStop(s.stop); };
    addEventListener('resize', onResize);

    const onKey = (e: KeyboardEvent) => {
      if (!isTopModal(root)) return;
      if (e.key === 'Escape') { e.preventDefault(); requestClose(); return; }
      trapTab(e, panel);
    };
    document.addEventListener('keydown', onKey);

    // ---- drag between detents
    const vt = new VelocityTracker();
    let drag: { y0: number; sy: number; id: number; moved: boolean; fromBody: boolean } | null = null;
    let suppressClick = false;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || !isTopModal(root)) return;
      const tgt = e.target as Element;
      if (tgt.closest(NO_DRAG)) return;
      // In a scrolling body the content owns the gesture, unless it is at the top and the finger goes down.
      const fromBody = body.contains(tgt) && panel.classList.contains('scrolls');
      if (fromBody && body.scrollTop > 0) return;
      drag = { y0: e.clientY, sy: s.y, id: e.pointerId, moved: false, fromBody };
      vt.reset(); vt.add(e.clientY, e.timeStamp);
    };
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dy = e.clientY - drag.y0;
      if (!drag.moved) {
        if (Math.abs(dy) < 6) return;
        if (drag.fromBody && (dy < 0 || body.scrollTop > 0)) { drag = null; return; } // scrolling the content
        drag.moved = true;
        s.anim?.stop();
        try { panel.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
        cancelPress();
      }
      vt.add(e.clientY, e.timeStamp);
      let y = drag.sy + dy;
      const g = s.geo!;
      if (y < g.large) y = g.large - rubberband(g.large - y, g.H);
      paint(y);
    };
    const onUp = () => {
      if (!drag) return;
      const moved = drag.moved;
      drag = null;
      if (!moved) return;
      suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
      const v = vt.velocity(), g = s.geo!;
      const stops = [g.large, ...(g.medium !== null ? [g.medium] : []), g.hidden];
      const target = nearestStop(projectFling(s.y, v), stops);
      if (target === g.hidden) requestClose(v * 1000);
      else { s.stop = target === g.medium ? 'medium' : 'large'; setHide(s.stop); settle(target, v * 1000); }
    };
    const onClickCapture = (e: MouseEvent) => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); } };
    // A sheet drag that began in the body must not also scroll it (touch pans are claimed by the browser otherwise).
    const onTouchMove = (e: TouchEvent) => { if (drag?.moved && e.cancelable) e.preventDefault(); };
    // Focusing a field inside the medium detent expands to large (iOS behaviour).
    const onFocusIn = (e: FocusEvent) => {
      if (s.stop !== 'medium' || s.geo!.medium === null) return;
      const tgt = e.target as HTMLElement;
      const r = tgt.getBoundingClientRect();
      if (r.bottom > window.innerHeight - 8 || tgt.matches('input, textarea, select')) goStop('large');
    };
    panel.addEventListener('pointerdown', onDown);
    panel.addEventListener('pointermove', onMove);
    panel.addEventListener('pointerup', onUp);
    panel.addEventListener('pointercancel', onUp);
    panel.addEventListener('click', onClickCapture, true);
    panel.addEventListener('touchmove', onTouchMove, { passive: false });
    panel.addEventListener('focusin', onFocusIn);
    back.onclick = () => requestClose();
    panel.querySelector<HTMLButtonElement>('.sheet-x')!.onclick = () => requestClose();

    return () => {
      s.alive = false;
      release();
      s.anim?.stop();
      ro.disconnect();
      removeEventListener('resize', onResize);
      document.removeEventListener('keydown', onKey);
      popModal(root);
      ghostOut(root, s.y, s.geo!, s.closeV);
      const o = s.opener as HTMLElement | null;
      if (o && o.isConnected && typeof o.focus === 'function') o.focus({ preventScroll: true });
    };
    // Detents are read once per open; a sheet doesn't change shape while up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="sheet-root" ref={rootRef}>
      <div className="sheet-backdrop" ref={backRef} />
      <div className={`sheet ${className}`} ref={panelRef} role="dialog" aria-modal="true" aria-label={title ?? label} tabIndex={-1}>
        <div className="sheet-head">
          <span className="sheet-grabber" aria-hidden="true" />
          {title ? <h2 className="sheet-title">{title}</h2> : <span />}
          <button type="button" className="sheet-x" data-press="dim" aria-label={t('Close')}><PixelIcon name="close" /></button>
        </div>
        <div className="sheet-body" ref={bodyRef}><div className="sheet-content">{children}</div></div>
      </div>
    </div>
  );
}

/** Animate a detached copy of the sheet out, then remove it. */
function ghostOut(root: HTMLElement, fromY: number, g: Geo, velocity: number) {
  if (prefersReducedMotion() || !root.isConnected) { setPresentingProgress(0); return; }
  const ghost = root.cloneNode(true) as HTMLElement;
  ghost.inert = true;
  ghost.setAttribute('aria-hidden', 'true');
  ghost.style.pointerEvents = 'none';
  document.body.appendChild(ghost);
  const panel = ghost.querySelector<HTMLElement>('.sheet')!;
  const back = ghost.querySelector<HTMLElement>('.sheet-backdrop')!;
  const first = g.medium ?? g.large;
  const t0 = g.large < 40 ? Math.max(0, Math.min(1, g.medium !== null ? (g.medium - fromY) / (g.medium - g.large) : 1 - (fromY - g.large) / (g.hidden - g.large))) : 0;
  animateSpring({
    from: fromY, to: g.hidden, velocity: Math.max(0, velocity), ...SPRINGS.sheetDismiss,
    onUpdate: y => {
      panel.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`;
      const k = Math.max(0, Math.min(1, (g.hidden - y) / (g.hidden - Math.min(fromY, first))));
      back.style.opacity = String(Math.min(Number(back.style.opacity || 1), k));
      setPresentingProgress(t0 * k);
    },
    onDone: () => { ghost.remove(); setPresentingProgress(0); },
  });
}
