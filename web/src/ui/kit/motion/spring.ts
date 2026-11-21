// Damped-spring motion, described the way iOS does: `response` (the period of
// the undamped spring, seconds) and `damping` (dampingFraction; 1 = critical,
// < 1 overshoots). The oscillator is solved analytically, so a gesture's
// release velocity carries straight into the settle.
//
// The pure parts (springCurve, rubberband, VelocityTracker, projectFling,
// nearestStop) are unit-tested; animateSpring drives them with rAF.
import { prefersReducedMotion } from './reduced';

export interface SpringParams {
  /** Seconds for one undamped period. iOS default ≈ 0.55; nav push ≈ 0.35. */
  response: number;
  /** Damping fraction. 1 = critically damped (no overshoot). */
  damping: number;
}

/** Presets used across the kit. */
export const SPRINGS = {
  push: { response: 0.35, damping: 1 },      // UINavigationController push / pop
  sheet: { response: 0.4, damping: 1 },      // sheet detents
  sheetDismiss: { response: 0.3, damping: 1 },
  thumb: { response: 0.32, damping: 0.78 },  // segmented thumb: a little overshoot
  pop: { response: 0.36, damping: 0.62 },    // HUD scale-in
} as const satisfies Record<string, SpringParams>;

/**
 * Normalised remaining offset y(t) for a spring travelling from 1 to 0, seeded
 * with normalised velocity `v` (fractions of the distance per second, positive
 * towards the target). y(0) = 1, y'(0) = -v, y(∞) = 0.
 */
export function springCurve({ response, damping }: SpringParams, v = 0): (t: number) => number {
  const w0 = (2 * Math.PI) / response;
  if (damping < 1) {
    const wd = w0 * Math.sqrt(1 - damping * damping);
    const B = (damping * w0 - v) / wd;
    return t => Math.exp(-damping * w0 * t) * (Math.cos(wd * t) + B * Math.sin(wd * t));
  }
  if (damping === 1) return t => (1 + (w0 - v) * t) * Math.exp(-w0 * t);
  const s = Math.sqrt(damping * damping - 1);
  const r1 = -w0 * (damping - s), r2 = -w0 * (damping + s);
  const c2 = (-v - r1) / (r2 - r1), c1 = 1 - c2;
  return t => c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t);
}

/** Position at time t (s) of a spring from `from` to `to` with initial velocity (units/s). */
export function springAt(t: number, from: number, to: number, velocity: number, p: SpringParams): number {
  const D = to - from;
  if (D === 0) return to;
  return to - D * springCurve(p, velocity / D)(t);
}

/** True once the spring is within `eps` units of rest and barely moving. */
export function springSettled(t: number, from: number, to: number, velocity: number, p: SpringParams, eps = 0.3): boolean {
  const D = to - from;
  if (Math.abs(D) < eps) return true;
  const y = springCurve(p, velocity / D);
  return Math.abs(D * y(t)) < eps && Math.abs(D * (y(t + 0.016) - y(t))) < eps / 2;
}

/** iOS rubber-banding past an edge: x' = (1 − 1/(x·c/d + 1))·d, c = 0.55. */
export function rubberband(overshoot: number, dimension: number, c = 0.55): number {
  if (overshoot <= 0 || dimension <= 0) return 0;
  return (1 - 1 / ((overshoot * c) / dimension + 1)) * dimension;
}

/**
 * Where a fling would come to rest under UIScrollView's normal deceleration
 * (rate 0.998 per ms): distance = v · rate / (1 − rate). Velocity in px/ms.
 */
export function projectFling(position: number, velocityPxPerMs: number, rate = 0.998): number {
  return position + (velocityPxPerMs * rate) / (1 - rate);
}

/** The stop closest to `value`. */
export function nearestStop(value: number, stops: number[]): number {
  return stops.reduce((a, b) => (Math.abs(b - value) < Math.abs(a - value) ? b : a));
}

/**
 * Velocity over the last ~80 ms of samples, so one coarse sample can't fake a
 * fling. Returns px/ms, clamped to what a real finger does (±4).
 */
export class VelocityTracker {
  private s: [number, number][] = [];
  constructor(private windowMs = 80, private cap = 4) {}
  add(value: number, timeMs: number): void {
    this.s.push([value, timeMs]);
    while (this.s.length > 2 && timeMs - this.s[0][1] > this.windowMs) this.s.shift();
  }
  velocity(): number {
    if (this.s.length < 2) return 0;
    const a = this.s[0], b = this.s[this.s.length - 1];
    const dt = b[1] - a[1];
    if (dt <= 0) return 0;
    return Math.max(-this.cap, Math.min(this.cap, (b[0] - a[0]) / dt));
  }
  reset(): void { this.s = []; }
}

export interface SpringHandle { stop(): void; readonly done: Promise<void> }

export interface AnimateSpringOptions extends Partial<SpringParams> {
  from: number;
  to: number;
  /** Initial velocity in units per second (positive = towards larger values). */
  velocity?: number;
  onUpdate: (value: number) => void;
  onDone?: () => void;
  /** Skip the motion (default: when the user prefers reduced motion). */
  instant?: boolean;
  /**
   * Wall-clock cap (ms). If frames stop arriving (backgrounded page, paused
   * rAF) the spring jumps to its end, so a page never stays half-pushed.
   */
  maxMs?: number;
  /** Rest threshold in output units (default 0.1% of the distance: sub-pixel for px, fine for 0..1 progress). */
  precision?: number;
}

/** Run a spring on requestAnimationFrame. Reduced motion jumps to the end. */
export function animateSpring(o: AnimateSpringOptions): SpringHandle {
  const p: SpringParams = { response: o.response ?? 0.35, damping: o.damping ?? 1 };
  const v = o.velocity ?? 0;
  let resolve!: () => void;
  const done = new Promise<void>(r => (resolve = r));
  const finish = () => { o.onUpdate(o.to); o.onDone?.(); resolve(); };
  const instant = o.instant ?? prefersReducedMotion();
  if (instant || Math.abs(o.to - o.from) < 0.001 || typeof requestAnimationFrame === 'undefined') {
    finish();
    return { stop() {}, done };
  }
  let t0: number | null = null, raf = 0, stopped = false;
  const end = () => { if (stopped) return; stopped = true; cancelAnimationFrame(raf); clearTimeout(watchdog); finish(); };
  const watchdog = setTimeout(end, o.maxMs ?? 1500);
  const step = (now: number) => {
    if (stopped) return;
    if (t0 === null) t0 = now;
    const t = (now - t0) / 1000;
    if (t > 3 || (t > 0.05 && springSettled(t, o.from, o.to, v, p, o.precision ?? Math.max(1e-4, Math.abs(o.to - o.from) * 0.001)))) { end(); return; }
    o.onUpdate(springAt(t, o.from, o.to, v, p));
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return { stop() { if (!stopped) { stopped = true; cancelAnimationFrame(raf); clearTimeout(watchdog); resolve(); } }, done };
}
