// HUD confirmation ("Session saved"): an ink square that pops in (spring curve),
// draws its pixel icon row by row, holds, and fades. Call showHud() from
// anywhere; <HudHost /> is mounted once in App.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { ICONS, iconRuns, type IconName } from './icons';
import { prefersReducedMotion } from './motion/reduced';

export interface HudMessage { text: string; icon?: IconName; ms?: number }
interface Shown extends HudMessage { id: number }

let current: Shown | null = null;
let seq = 0;
const subs = new Set<() => void>();
const set = (v: Shown | null) => { current = v; subs.forEach(f => f()); };

/** Show a short confirmation. A new one replaces the old. */
export function showHud(msg: HudMessage | string): void {
  const m = typeof msg === 'string' ? { text: msg } : msg;
  set({ icon: 'check', ms: 1500, ...m, id: ++seq });
}

export function HudHost() {
  const msg = useSyncExternalStore(fn => { subs.add(fn); return () => { subs.delete(fn); }; }, () => current, () => null);
  if (!msg || typeof document === 'undefined') return null;
  return createPortal(<HudView key={msg.id} msg={msg} />, document.body);
}

function HudView({ msg }: { msg: Shown }) {
  // Pop-in and fade-out are CSS animations (kit.css .hud) on a spring-like
  // curve, so they run even when rAF is throttled; the icon draws row by row.
  const [phase, setPhase] = useState<'in' | 'out'>('in');
  const [drawn, setDrawn] = useState(prefersReducedMotion());
  useEffect(() => {
    const reduce = prefersReducedMotion();
    const d = setTimeout(() => setDrawn(true), reduce ? 0 : 90);
    const out = setTimeout(() => setPhase('out'), msg.ms ?? 1500);
    const gone = setTimeout(() => { if (current?.id === msg.id) set(null); }, (msg.ms ?? 1500) + (reduce ? 0 : 280));
    return () => { clearTimeout(d); clearTimeout(out); clearTimeout(gone); };
  }, [msg]);
  const runs = iconRuns(ICONS[msg.icon ?? 'check']);
  return (
    <div className={`hud ${phase}`} role="status" aria-live="polite">
      <svg className="px hud-icon" width={54} height={54} viewBox="0 0 9 9" fill="currentColor" aria-hidden="true">
        {runs.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={1} className={drawn ? 'on' : ''} style={{ transitionDelay: `${r.y * 28}ms` }} />)}
      </svg>
      <span className="hud-text">{msg.text}</span>
    </div>
  );
}
