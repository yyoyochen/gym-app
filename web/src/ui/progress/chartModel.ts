// The lift chart's model, pure: the y-axis rule (ceiling 120% of the best
// value, floor 90% of the lowest), where each target goes (in place, or pinned
// to the ceiling lane), the step runs, and the gap text. LiftChart only paints.
import type { ISODate } from '../../domain/types';
import { addDays, daysBetween } from '../../app/dates';

export const CEILING = 1.2;
export const FLOOR = 0.9;
export const PLOT_PX = 150;
/** A target is drawn in place only with this much plot room (px) under the ceiling for its label. */
export const LANE_ROOM_PX = 22;
/** A hold longer than this has no sessions in it, so its run is dotted. */
export const HOLD_DAYS = 42;

/** A horizontal target line: the lifter's own goal, or the next strength level. */
export interface ChartTarget { name: string; value: number; kind?: 'goal' | 'level' }
export interface Scale { lo: number; hi: number; ticks: number[]; inRange: ChartTarget[]; pinned: ChartTarget[] }

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** 3–6 round ticks (1/2/5 × 10^k step) that lie inside [lo, hi]. */
export function ticksWithin(lo: number, hi: number): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  if (hi <= lo) return [r3(lo)];
  for (let p = -2; p <= 12; p++) {
    for (const m of [1, 2, 5]) {
      const step = m * 10 ** p;
      const first = Math.ceil(r3(lo / step)), last = Math.floor(r3(hi / step));
      const n = last - first + 1;
      if (n >= 3 && n <= 6) return Array.from({ length: n }, (_, i) => r3((first + i) * step));
    }
  }
  return [r3(lo), r3(hi)];
}

/** The y-axis rule and target placement for one chart. */
export function chartScale(i: { values: number[]; zeroBased?: boolean; targets: ChartTarget[] }): Scale {
  const vals = i.values.filter(Number.isFinite);
  if (!vals.length) return { lo: 0, hi: 1, ticks: [], inRange: [], pinned: [] };
  // Padded by magnitude so negative values (assisted lifts) get the same headroom as positive ones.
  const min = Math.min(...vals), max = Math.max(...vals);
  const lo = i.zeroBased ? 0 : min - Math.abs(min) * (1 - FLOOR);
  let hi = max + Math.abs(max) * (CEILING - 1);
  if (hi <= lo) hi = lo + 1;
  const room = ((hi - lo) * LANE_ROOM_PX) / PLOT_PX;
  const inRange = i.targets.filter(t => t.value >= lo && t.value <= hi - room);
  const pinned = i.targets.filter(t => t.value > hi - room).sort((a, b) => a.value - b.value);
  return { lo, hi, ticks: ticksWithin(lo, hi), inRange, pinned };
}

export interface Run { from: ISODate; to: ISODate; value: number; nextValue: number; dotted: boolean }

/** One run per consecutive pair: hold `value` from `from` to `to`, then step to `nextValue`. */
export function stepRuns(points: { date: ISODate; value: number }[], holdDays = HOLD_DAYS): Run[] {
  const out: Run[] = [];
  for (let k = 0; k + 1 < points.length; k++) {
    const a = points[k], b = points[k + 1];
    out.push({ from: a.date, to: b.date, value: a.value, nextValue: b.value, dotted: daysBetween(a.date, b.date) > holdDays });
  }
  return out;
}

/** Weekly points (keyed by Monday) with every missing week between the first and last filled with 0. */
export function fillWeeks(points: { date: ISODate; value: number }[]): { date: ISODate; value: number }[] {
  if (points.length < 2) return points.slice();
  const byDate = new Map(points.map(p => [p.date, p.value]));
  const out: { date: ISODate; value: number }[] = [];
  const last = points[points.length - 1].date;
  for (let d = points[0].date; d <= last; d = addDays(d, 7)) out.push({ date: d, value: byDate.get(d) ?? 0 });
  return out;
}

/** "+35.5" to go, or "reached" when the target is at or under the current value. */
export function gapText(target: number, current: number): string {
  const d = Math.round((target - current) * 10) / 10;
  return d <= 0 ? 'reached' : `+${d}`;
}

