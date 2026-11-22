// Navigation bar with a HIG large title: the big title sits in the page; once
// it scrolls under the bar, the bar shows the small inline title and an ink
// rule. Back goes through history (navigation.back), so it matches Android's
// system back exactly.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PixelIcon } from './PixelIcon';
import { back as navBack } from './navigation';

export function NavBar({ title, backLabel, onBack, fallback = 'today', right, titleAction, large = true, children }: {
  title: string;
  /** Show a back button with this label (e.g. 'Progress'). */
  backLabel?: string;
  /** Override back (default: history back, or `fallback` when there's no in-app entry). */
  onBack?: () => void;
  fallback?: string;
  right?: ReactNode;
  /** A control on the large title's line (e.g. Profile's Settings gear); it moves into the bar once the title scrolls under it. */
  titleAction?: ReactNode;
  /** Render the large title under the bar (default true). */
  large?: boolean;
  /** Extra content under the large title (subtitle, lockup…). */
  children?: ReactNode;
}) {
  const sentinel = useRef<HTMLHeadingElement>(null);
  const [collapsed, setCollapsed] = useState(!large);
  // The small title stays hidden until the first scroll measurement, so it can't flash while a page slides in.
  const [measured, setMeasured] = useState(!large);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !large) return;
    const root = el.closest('.page');
    const io = new IntersectionObserver(entries => {
      const e = entries[entries.length - 1];
      setCollapsed(!e.isIntersecting);
      setMeasured(true);
    }, { root, rootMargin: '-52px 0px 0px 0px', threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [large]);
  return (
    <>
      <div className={`navbar${collapsed ? ' collapsed' : ''}${measured ? '' : ' measuring'}`}>
        <div className="navbar-side">
          {backLabel !== undefined && (
            <button type="button" className="navbar-back" data-press="dim" onClick={() => (onBack ? onBack() : navBack(fallback))} aria-label={`Back to ${backLabel}`}>
              <PixelIcon name="back" />{backLabel}
            </button>
          )}
        </div>
        <div className="navbar-title" aria-hidden={large ? !collapsed : undefined}>{title}</div>
        <div className="navbar-side right">{right}{titleAction && (collapsed || !large) ? titleAction : null}</div>
      </div>
      {large && (titleAction ? (
        <div className="navbar-large-row">
          <h1 className="large-title navbar-large" ref={sentinel}>{title}</h1>
          {!collapsed && titleAction}
        </div>
      ) : <h1 className="large-title navbar-large" ref={sentinel}>{title}</h1>)}
      {children}
    </>
  );
}
