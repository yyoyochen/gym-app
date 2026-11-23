// The PR moment: the new best resolves from coarse ordered (Bayer) dither into
// solid type on a canvas, in the accent colour. Reduced
// motion shows the solid number at once. <DitherNumber> is the canvas alone;
// showPrMoment() opens the full-screen moment (host: <PrMomentHost />).
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { prefersReducedMotion } from './motion/reduced';
import { isTopModal, popModal, pushModal } from './modal';
import { deferNav, pushSheetEntry } from './sheetHistory';
import { stampDate } from './Display';
import { Parts } from './Parts';

export const BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
/** Block sizes per frame, coarse → solid (0 = solid type). */
export const DITHER_STEPS = [26, 18, 12, 8, 6, 4, 3, 2, 0];

/** Ordered-dither threshold: is a block with this ink coverage on at grid cell (bx, by)? */
export function ditherOn(coverage: number, bx: number, by: number): boolean {
  return coverage > BAYER4[by % 4][bx % 4] / 16;
}

/** Canvas number that resolves from dither. Replays when `playKey` changes. */
export function DitherNumber({ text, playKey = 0, height = 170, className = '', onStart }: {
  text: string; playKey?: unknown; height?: number; className?: string; onStart?: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const startRef = useRef(onStart);
  startRef.current = onStart;
  useLayoutEffect(() => {
    const c = ref.current!;
    let timer = 0, alive = true;
    const run = async () => {
      try { await document.fonts.load(`800 100px "Schibsted Grotesk Variable"`); } catch { /* fallback font */ }
      if (!alive) return;
      const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      const cssW = c.clientWidth || 342;
      const W = Math.round(cssW * dpr), H = Math.round(height * dpr);
      c.width = W; c.height = H;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      const ink = getComputedStyle(c).color;
      const off = document.createElement('canvas'); off.width = W; off.height = H;
      const o = off.getContext('2d')!;
      let size = 200 * dpr;
      o.font = `800 ${size}px 'Schibsted Grotesk Variable', system-ui, sans-serif`;
      size = Math.floor(Math.min(size * (W - 4 * dpr) / Math.max(1, o.measureText(text).width), H * 1.1));
      o.font = `800 ${size}px 'Schibsted Grotesk Variable', system-ui, sans-serif`;
      o.fillStyle = '#000'; o.textBaseline = 'alphabetic';
      o.fillText(text, 0, H - 16 * dpr);
      const data = o.getImageData(0, 0, W, H).data;
      const solid = () => {
        ctx.clearRect(0, 0, W, H); ctx.drawImage(off, 0, 0);
        ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = ink; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over';
      };
      startRef.current?.();
      if (prefersReducedMotion()) { solid(); return; }
      let i = 0;
      const frame = () => {
        if (!alive) return;
        const b = DITHER_STEPS[i] * dpr;
        if (b === 0) { solid(); return; }
        ctx.clearRect(0, 0, W, H); ctx.fillStyle = ink;
        const stride = Math.max(1, Math.round(2 * dpr));
        for (let y = 0, by = 0; y < H; y += b, by++) for (let x = 0, bx = 0; x < W; x += b, bx++) {
          let on = 0, n = 0;
          for (let yy = y; yy < Math.min(y + b, H); yy += stride) for (let xx = x; xx < Math.min(x + b, W); xx += stride) { n++; if (data[(yy * W + xx) * 4 + 3] > 128) on++; }
          if (n && ditherOn(on / n, bx, by)) ctx.fillRect(x, y, b, b);
        }
        i++;
        timer = window.setTimeout(frame, 70 + i * 14);
      };
      frame();
    };
    void run();
    return () => { alive = false; clearTimeout(timer); };
  }, [text, playKey, height]);
  return <canvas ref={ref} className={`dither-num ${className}`} style={{ height }} role="img" aria-label={text} />;
}

export interface PrMomentData {
  /** The number, e.g. "107.5". */
  value: string;
  /** Under the number, e.g. "kg × 2". */
  unit?: string;
  /** Quiet text after the unit, e.g. "new best double". */
  caption?: string;
  /** Lift name for the spec line: "[PR] // Back squat, Fri 21 Nov". */
  lift?: string;
  /** Label/value pairs below (previous best, e1RM change). */
  pairs?: { label: string; value: ReactNode }[];
}

let shown: (PrMomentData & { id: number }) | null = null;
let n = 0;
const subs = new Set<() => void>();
const setShown = (v: typeof shown) => { shown = v; subs.forEach(f => f()); };

// Android back closes the moment, not the page (same history entry as a sheet, sheetHistory.ts).
let releaseEntry: (() => void) | null = null;
let entryPending = false;
const onSystemBack = () => { releaseEntry = null; setShown(null); }; // the entry is already popped

/** Open the full-screen PR moment. Tap, Esc or back closes. */
export function showPrMoment(d: PrMomentData): void {
  setShown({ ...d, id: ++n });
  if (releaseEntry || entryPending) return;
  entryPending = true;
  // A sheet that just closed is still walking back over its own entry: push ours after it lands.
  const push = () => { entryPending = false; if (shown && !releaseEntry) releaseEntry = pushSheetEntry(onSystemBack); };
  if (!deferNav(push)) push();
}
export function closePrMoment(): void {
  const release = releaseEntry;
  releaseEntry = null;
  setShown(null);
  release?.();
}
/** The moment on screen, if any. For tests and debugging. */
export function prMomentShown(): PrMomentData | null { return shown; }

export function PrMomentHost() {
  const d = useSyncExternalStore(fn => { subs.add(fn); return () => { subs.delete(fn); }; }, () => shown, () => null);
  if (!d || typeof document === 'undefined') return null;
  return createPortal(<PrMoment key={d.id} data={d} onClose={closePrMoment} />, document.body);
}

/** The moment itself (also usable inline, e.g. on Review). */
export function PrMoment({ data, onClose }: { data: PrMomentData; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current!;
    pushModal(el);
    el.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (isTopModal(el) && (e.key === 'Escape' || e.key === 'Enter')) { e.preventDefault(); onClose(); } };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); popModal(el); };
  }, [onClose]);
  return (
    <div className="pr-moment" ref={root} role="dialog" aria-modal="true" aria-label={`New best: ${data.value} ${data.unit ?? ''}`} tabIndex={-1} onClick={onClose}>
      <div className="pr-inner">
        <div className="label"><Parts items={[`[PR] // ${data.lift ?? 'New best'}`, stampDate()]} /></div>
        <DitherNumber text={data.value} className="accent" />
        {(data.unit || data.caption) && <div className="pr-sub">{data.unit}{data.caption && <span>{data.caption}</span>}</div>}
        {data.pairs && data.pairs.length > 0 && (
          <div className="lv-grid pr-pairs">
            {data.pairs.map(p => <div key={p.label} className="lv"><span className="lv-l">{p.label}</span><b className="lv-v">{p.value}</b></div>)}
          </div>
        )}
        <span className="label pr-hint">Tap to close</span>
      </div>
    </div>
  );
}
