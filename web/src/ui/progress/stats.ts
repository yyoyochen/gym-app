// Pure numbers for the Progress "terminal stats" block, the lift list's dither
// trend glyph, the lift chart's weekly volume and the History calendar.
// No db, no React: everything here is unit-tested with synthetic fixtures.
import type { ISODate } from '../../domain/types';
import { SHADES } from '../kit/dither';
import { addDays, daysBetween, weekday } from '../../app/dates';

export interface StatSession { id: string; date: ISODate }
export interface StatSet { sessionId: string; exerciseId: string; kind: string; weight: number; reps: number }

export interface TrainingStats {
  sessions: number;
  /** Every logged set, warm-ups included ("sets logged"). */
  sets: number;
  /** sets / sessions, one decimal; null with no sessions. */
  setsPerSession: number | null;
  /** The lift with the most working sets. */
  favourite: { exerciseId: string; sets: number } | null;
  /** 0 = Sunday … 6 = Saturday: the weekday with the most sessions. */
  busiestDay: number | null;
  /** Longest gap in days between two consecutive training dates. */
  longestBreak: number | null;
  first: ISODate | null;
  last: ISODate | null;
}

export const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function trainingStats(sessions: StatSession[], sets: StatSet[]): TrainingStats {
  const known = new Set(sessions.map(s => s.id));
  const mine = sets.filter(s => known.has(s.sessionId));
  const dates = [...new Set(sessions.map(s => s.date))].sort();
  const perLift = new Map<string, number>();
  for (const s of mine) if (s.kind !== 'warmup') perLift.set(s.exerciseId, (perLift.get(s.exerciseId) ?? 0) + 1);
  let favourite: TrainingStats['favourite'] = null;
  for (const [exerciseId, n] of perLift) {
    if (!favourite || n > favourite.sets || (n === favourite.sets && exerciseId < favourite.exerciseId)) favourite = { exerciseId, sets: n };
  }
  const perDay = [0, 0, 0, 0, 0, 0, 0];
  for (const s of sessions) perDay[weekday(s.date)]++;
  const top = Math.max(...perDay);
  let longestBreak: number | null = null;
  for (let i = 1; i < dates.length; i++) longestBreak = Math.max(longestBreak ?? 0, daysBetween(dates[i - 1], dates[i]));
  return {
    sessions: sessions.length,
    sets: mine.length,
    setsPerSession: sessions.length ? Math.round((mine.length / sessions.length) * 10) / 10 : null,
    favourite,
    busiestDay: sessions.length ? perDay.indexOf(top) : null,
    longestBreak,
    first: dates[0] ?? null,
    last: dates[dates.length - 1] ?? null,
  };
}

/** kg moved (weight × reps) over working sets of the given lifts. Assisted/bodyweight-only sets (≤ 0 kg) add nothing. */
export function tonnage(sets: StatSet[], exerciseIds: ReadonlySet<string>): number {
  let t = 0;
  for (const s of sets) if (exerciseIds.has(s.exerciseId) && s.kind !== 'warmup' && s.weight > 0 && s.reps > 0) t += s.weight * s.reps;
  return t;
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
/** "ten", "fourteen" → digits past twelve ("14"), thousands separated. */
export function countWord(n: number): string {
  return n >= 0 && n < WORDS.length ? WORDS[n] : n.toLocaleString('en-GB');
}

/** What the tonnage weighs about as much as: the biggest thing it covers at least once. */
const THINGS = [
  { one: 'elephant', many: 'elephants', kg: 6000, note: 'at 6 t each' },
  { one: 'small car', many: 'small cars', kg: 1200, note: 'at 1.2 t each' },
  { one: 'grand piano', many: 'grand pianos', kg: 400, note: 'at 400 kg each' },
] as const;

export interface FunComparison { tonnes: number; count: number; thing: string; note: string }

export function funComparison(kgMoved: number): FunComparison | null {
  if (!(kgMoved > 0)) return null;
  const t = THINGS.find(x => kgMoved / x.kg >= 1);
  if (!t) return null;
  const count = Math.round(kgMoved / t.kg);
  const tonnes = kgMoved >= 10_000 ? Math.round(kgMoved / 1000) : Math.round(kgMoved / 100) / 10;
  return { tonnes, count, thing: count === 1 ? t.one : t.many, note: t.note };
}

/** "Your squats since 1 Jan add up to about 42 tonnes: roughly seven elephants (at 6 t each)." */
export function funLine(liftPlural: string, since: string, c: FunComparison): string {
  return `Your ${liftPlural} since ${since} add up to about ${c.tonnes.toLocaleString('en-GB')} tonne${c.tonnes === 1 ? '' : 's'}: roughly ${countWord(c.count)} ${c.thing} (${c.note}).`;
}

/** "Back Squat" → "back squats"; a name already ending in s stays. */
export function pluralLift(name: string): string {
  const n = name.trim().toLowerCase();
  return /s$/.test(n) ? n : `${n}s`;
}

/**
 * The lift list's trend: the last `n` values as dither glyphs scaled between
 * their own min and max (░ low … █ high). Flat history reads all ▒.
 */
export function trendGlyphs(values: number[], n = 6): string {
  const v = values.filter(Number.isFinite).slice(-n);
  if (!v.length) return '';
  const lo = Math.min(...v), hi = Math.max(...v);
  if (hi - lo < 1e-9) return SHADES[1].repeat(v.length);
  return v.map(x => SHADES[Math.min(3, Math.floor(((x - lo) / (hi - lo)) * 4))]).join('');
}

/** Monday of the ISO week containing `iso`. */
export function mondayOf(iso: ISODate): ISODate {
  return addDays(iso, -((weekday(iso) + 6) % 7));
}

/** Weekly volume (kg × reps over working sets, assisted sets excluded), one point per trained week, keyed by its Monday. */
export function weeklyVolume(days: { date: ISODate; sets: { kind: string; weight: number; reps: number }[] }[]): { date: ISODate; value: number }[] {
  const m = new Map<ISODate, number>();
  for (const d of days) {
    let v = 0;
    for (const s of d.sets) if (s.kind !== 'warmup' && s.weight > 0 && s.reps > 0) v += s.weight * s.reps;
    const k = mondayOf(d.date);
    m.set(k, (m.get(k) ?? 0) + v);
  }
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, value]) => ({ date, value }));
}

/** Weeks the heatmap needs to reach back to `first` (inclusive, Monday-first columns), clamped. */
export function weeksSince(first: ISODate, today: ISODate, min = 12, max = 53): number {
  const row = (d: ISODate) => (weekday(d) + 6) % 7;
  const back = daysBetween(first, today) + row(first) - row(today);
  const w = Math.floor(back / 7) + 1;
  return Math.max(min, Math.min(max, w));
}

/** Round "nice" axis ticks covering [lo, hi]: 3–5 values on a 1/2/2.5/5 × 10^k step. */
export function niceTicks(lo: number, hi: number, target = 4): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  if (hi - lo < 1e-9) { hi = lo + 1; lo = lo - 1; }
  const raw = (hi - lo) / Math.max(1, target - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.floor(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(Math.round(v * 1000) / 1000);
  if (out[out.length - 1] < hi - 1e-9) out.push(Math.round((out[out.length - 1] + step) * 1000) / 1000);
  return out;
}

/**
 * Working sets as one line, runs at one load sharing it: "100 × 2 · 80 × 8, 8, 7".
 * `load` formats the weight (formatLoad for "BW+10"). Failed reps get ✕.
 */
export function loadLine(sets: { kind: string; weight: number; reps: number; failed?: boolean }[], load: (w: number) => string = String): string {
  const work = sets.filter(s => s.kind !== 'warmup');
  if (!work.length) return '—';
  const parts: string[] = [];
  for (let i = 0; i < work.length;) {
    const w = work[i].weight;
    const reps: string[] = [];
    while (i < work.length && work[i].weight === w) { reps.push(`${work[i].reps}${work[i].failed ? '✕' : ''}`); i++; }
    parts.push(`${load(w)} × ${reps.join(', ')}`);
  }
  return parts.join(' · ');
}

/** PR flags for a chronological series: true where a value beats every earlier one (the first point is not a PR). */
export function prFlags(values: number[]): boolean[] {
  let best = -Infinity;
  return values.map((v, i) => { const pr = i > 0 && v > best + 1e-9; best = Math.max(best, v); return pr; });
}
