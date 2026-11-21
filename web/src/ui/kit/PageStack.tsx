// Page transitions (UINavigationController feel, Android-safe):
//  · push: the new page slides in from the right over the old one, which
//    parallaxes 30% left and dims; pop is the exact reverse. One critically
//    damped spring (~350 ms).
//  · direction comes from history.state indices (navigation.ts), so Android's
//    system back gesture/button plays the pop. There is no custom edge swipe:
//    Android owns the screen edges.
//  · each page is its own scroller; scroll is saved per stack entry and
//    restored on pop.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { NavSnapshot } from './navigation';
import type { Transition } from './nav';
import { SPRINGS, animateSpring, type SpringHandle } from './motion/spring';
import { prefersReducedMotion } from './motion/reduced';

interface Layer { key: string; idx: number; nav: NavSnapshot }
interface StackState { cur: Layer; prev: Layer | null; transition: Transition; seq: number }

const layerOf = (nav: NavSnapshot): Layer => ({ key: `${nav.idx}:${nav.path}`, idx: nav.idx, nav });
const scrollByKey = new Map<string, number>();

/** Scroll the visible page (replaces window.scrollTo now that the document doesn't scroll). */
export function scrollPageTo(top = 0, smooth = false): void {
  const el = document.querySelector<HTMLElement>('.page-layer.current > .page');
  el?.scrollTo({ top, behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto' });
}

export function PageStack({ nav, render, pageClass }: {
  nav: NavSnapshot;
  render: (nav: NavSnapshot) => ReactNode;
  /** Extra class for a page's scroller (e.g. 'with-tabs'). */
  pageClass?: (nav: NavSnapshot) => string;
}) {
  const [st, setSt] = useState<StackState>(() => ({ cur: layerOf(nav), prev: null, transition: 'none', seq: nav.seq }));
  const els = useRef(new Map<string, HTMLDivElement>());

  // Derive the next state during render when the route moved.
  let state = st;
  if (nav.seq !== st.seq) {
    const next = layerOf(nav);
    const out = els.current.get(st.cur.key);
    if (out) scrollByKey.set(st.cur.key, out.querySelector<HTMLElement>('.page')?.scrollTop ?? 0);
    if (nav.direction === 'push' || (nav.direction === 'none' && next.key !== st.cur.key)) scrollByKey.delete(next.key);
    const animate = nav.transition !== 'none' && next.key !== st.cur.key && !prefersReducedMotion();
    state = { cur: next, prev: animate ? st.cur : null, transition: animate ? nav.transition : 'none', seq: nav.seq };
    setSt(state);
  }

  useLayoutEffect(() => {
    const curEl = els.current.get(state.cur.key);
    const page = curEl?.querySelector<HTMLElement>('.page');
    // Restore scroll on pop; content may still be loading, so retry briefly.
    const want = scrollByKey.get(state.cur.key);
    let tries = 0, raf = 0;
    if (page && want) {
      const tryRestore = () => {
        page.scrollTop = want;
        if (Math.abs(page.scrollTop - want) > 2 && tries++ < 40) raf = requestAnimationFrame(tryRestore);
      };
      tryRestore();
    }
    if (!state.prev) {
      if (curEl) { curEl.style.transform = ''; curEl.classList.remove('moving'); dimOf(curEl).style.opacity = '0'; }
      return () => cancelAnimationFrame(raf);
    }
    const prevEl = els.current.get(state.prev.key);
    if (!curEl || !prevEl) return () => cancelAnimationFrame(raf);
    const W = curEl.parentElement?.offsetWidth || window.innerWidth;
    const pushing = state.transition === 'push';
    const top = pushing ? curEl : prevEl, under = pushing ? prevEl : curEl;
    top.style.zIndex = '2'; under.style.zIndex = '1';
    top.classList.add('moving'); under.classList.remove('moving');
    const paint = (p: number) => {
      // p: 0 = old page fully shown, 1 = new page fully shown
      const q = pushing ? p : 1 - p; // how far the top page is "in"
      top.style.transform = `translate3d(${((1 - q) * W).toFixed(2)}px, 0, 0)`;
      under.style.transform = `translate3d(${(-0.3 * W * q).toFixed(2)}px, 0, 0)`;
      dimOf(under).style.opacity = String(0.5 * q);
    };
    paint(0);
    let anim: SpringHandle | null = animateSpring({
      from: 0, to: 1, ...SPRINGS.push, onUpdate: paint,
      onDone: () => {
        anim = null;
        curEl.style.transform = ''; curEl.style.zIndex = ''; curEl.classList.remove('moving');
        dimOf(curEl).style.opacity = '0';
        setSt(s => (s.seq === state.seq ? { ...s, prev: null } : s));
      },
    });
    return () => { anim?.stop(); cancelAnimationFrame(raf); };
  }, [state.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  const layers = state.prev ? [state.prev, state.cur] : [state.cur];
  return (
    <>
      {layers.map(l => {
        const current = l.key === state.cur.key;
        return (
          <div key={l.key} className={`page-layer${current ? ' current' : ''}`} aria-hidden={current ? undefined : true}
            ref={el => { if (el) { el.inert = !current; els.current.set(l.key, el); } else els.current.delete(l.key); }}>
            <div className={`page ${pageClass?.(l.nav) ?? ''}`}>{render(l.nav)}</div>
            <div className="page-dim" />
          </div>
        );
      })}
    </>
  );
}

const dimOf = (el: HTMLElement) => el.querySelector<HTMLElement>(':scope > .page-dim')!;
