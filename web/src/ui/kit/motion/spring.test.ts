import { afterEach, describe, expect, it, vi } from 'vitest';
import { VelocityTracker, animateSpring, nearestStop, projectFling, rubberband, springAt, springCurve, springSettled, SPRINGS } from './spring';

describe('spring solver', () => {
  it('starts at the origin and ends at the target', () => {
    for (const p of [SPRINGS.push, SPRINGS.thumb, { response: 0.4, damping: 1.4 }]) {
      expect(springAt(0, 0, 100, 0, p)).toBeCloseTo(0, 6);
      expect(springAt(3, 0, 100, 0, p)).toBeCloseTo(100, 2);
    }
  });

  it('critically damped from rest never overshoots', () => {
    let max = 0;
    for (let t = 0; t < 2; t += 0.004) max = Math.max(max, springAt(t, 0, 100, 0, SPRINGS.push));
    expect(max).toBeLessThanOrEqual(100 + 1e-9);
  });

  it('underdamped overshoots, and less damping overshoots more', () => {
    const peak = (damping: number) => { let m = 0; for (let t = 0; t < 2; t += 0.002) m = Math.max(m, springAt(t, 0, 100, 0, { response: 0.35, damping })); return m; };
    expect(peak(0.78)).toBeGreaterThan(100);
    expect(peak(0.5)).toBeGreaterThan(peak(0.78));
  });

  it('the initial slope equals the release velocity (fling carries into the settle)', () => {
    for (const p of [SPRINGS.push, SPRINGS.thumb, { response: 0.5, damping: 1.6 }]) {
      const v = 2000; // units/s
      const dt = 1e-5;
      expect((springAt(dt, 0, 300, v, p) - springAt(0, 0, 300, v, p)) / dt).toBeCloseTo(v, -1);
    }
  });

  it('normalised curve is 1 at t=0 and decays toward 0', () => {
    const y = springCurve(SPRINGS.sheet);
    expect(y(0)).toBe(1);
    expect(Math.abs(y(1.5))).toBeLessThan(1e-3);
  });

  it('reports settled only near rest', () => {
    expect(springSettled(0.01, 0, 400, 0, SPRINGS.push)).toBe(false);
    expect(springSettled(2, 0, 400, 0, SPRINGS.push)).toBe(true);
    expect(springSettled(0, 10, 10.1, 0, SPRINGS.push)).toBe(true);
  });
});

describe('gesture helpers', () => {
  it('rubber-bands: monotonic, below the raw overshoot, bounded by the dimension', () => {
    expect(rubberband(0, 800)).toBe(0);
    const a = rubberband(50, 800), b = rubberband(200, 800);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThan(200);
    expect(rubberband(1e9, 800)).toBeLessThan(800);
  });

  it('projects a fling with UIScrollView deceleration (≈ 499 × v)', () => {
    expect(projectFling(100, 0)).toBe(100);
    expect(projectFling(100, 1)).toBeCloseTo(599, 0);
    expect(projectFling(100, -2)).toBeCloseTo(-898, 0);
  });

  it('picks the nearest stop', () => {
    expect(nearestStop(380, [0, 400, 900])).toBe(400);
    expect(nearestStop(700, [0, 400, 900])).toBe(900);
  });

  it('tracks velocity over the recent window and clamps it', () => {
    const vt = new VelocityTracker();
    expect(vt.velocity()).toBe(0);
    for (let t = 0; t <= 200; t += 16) vt.add(t * 0.5, t); // 0.5 px/ms
    expect(vt.velocity()).toBeCloseTo(0.5, 5);
    const fast = new VelocityTracker();
    fast.add(0, 0); fast.add(1000, 10);
    expect(fast.velocity()).toBe(4);
  });

  it('ignores samples older than the window', () => {
    const vt = new VelocityTracker(80);
    vt.add(0, 0); vt.add(500, 100); // a fast early move…
    for (let t = 200; t <= 300; t += 16) vt.add(500, t); // …then holding still
    expect(Math.abs(vt.velocity())).toBeLessThan(0.01);
  });
});

describe('animateSpring (rAF driven)', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  const stubFrames = () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 16) as unknown as number);
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  };

  it('a 0→1 progress spring runs to rest instead of snapping from far away', async () => {
    stubFrames();
    const seen: number[] = [];
    let done = false;
    animateSpring({ from: 0, to: 1, ...SPRINGS.push, instant: false, onUpdate: v => seen.push(v), onDone: () => { done = true; } });
    await vi.advanceTimersByTimeAsync(1400);
    expect(done).toBe(true);
    expect(seen.length).toBeGreaterThan(15);
    expect(seen[seen.length - 2]).toBeGreaterThan(0.99); // the last real frame was already at rest
    expect(seen[seen.length - 1]).toBe(1);
  });

  it('the watchdog finishes a spring whose frames stopped (backgrounded page)', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', () => 1); // frames never come
    vi.stubGlobal('cancelAnimationFrame', () => {});
    let last = -1;
    animateSpring({ from: 0, to: 300, instant: false, maxMs: 500, onUpdate: v => { last = v; } });
    await vi.advanceTimersByTimeAsync(600);
    expect(last).toBe(300);
  });
});
