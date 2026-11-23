// Glyph dither: the only "chart ink" in the system. Pure functions; the React
// components (DitherBar, GlyphHeatmap) only lay these strings out.
//   bar:     █████▓▒░·········   solid run, a three-step tail, a dotted track
//   heatmap: · empty, ░ ▒ ▓ █ rising, Monday-first columns, Mon/Wed/Fri labels
import { monthShort, weekdayShort } from '../../app/dates';

export const SHADES = ['░', '▒', '▓', '█'] as const;
export const EMPTY = '·';
const TAIL = ['▓', '▒', '░'];

export interface DitherBarGlyphs {
  /** The solid run (█ × n). */
  solid: string;
  /** Up to three fading cells after the run (▓▒░). */
  tail: string;
  /** The rest of the track (·). */
  track: string;
}

/** Glyphs for a bar `cells` wide at `value` (0..1, clamped). 0 is an empty track; 1 is all solid. */
export function ditherBar(value: number, cells = 28): DitherBarGlyphs {
  const n = Math.max(1, Math.floor(cells));
  const v = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  if (v === 0) return { solid: '', tail: '', track: EMPTY.repeat(n) };
  const full = Math.floor(v * n);
  let tail = '';
  for (let t = 0; t < TAIL.length && full + t < n; t++) tail += TAIL[t];
  return { solid: '█'.repeat(full), tail, track: EMPTY.repeat(n - full - tail.length) };
}

/** The bar as one string (handy for aria/tests). */
export function ditherBarText(value: number, cells = 28): string {
  const g = ditherBar(value, cells);
  return g.solid + g.tail + g.track;
}

// ---------------------------------------------------------------- heatmap

export type HeatLevel = -1 | 0 | 1 | 2 | 3; // -1 = nothing logged

export interface HeatCell {
  date: string; // ISO YYYY-MM-DD
  count: number;
  level: HeatLevel;
  /** After `end`: drawn blank. */
  future: boolean;
  isEnd: boolean;
}

export interface HeatGrid {
  weeks: number;
  /** Week index → month label, placed only where it doesn't collide with the previous one. */
  months: { week: number; text: string }[];
  /** Seven rows, Monday first. `label` is sparse (Mon/Wed/Fri) for text; `day` is every name. */
  rows: { label: string; day: string; cells: HeatCell[] }[];
  /** Per week: days trained vs the weekly target. Present only when a target is given. */
  weekMarks?: ('met' | 'part' | 'none')[];
}

const DAY_MS = 86_400_000;
/** Row d (0 = Monday) as a weekday name: "Mon" / "週一". */
const dayName = (d: number) => weekdayShort((d + 1) % 7);
/** Rows with a text label: Mon, Wed, Fri. */
const LABELLED_ROWS = [0, 2, 4];
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const parse = (d: string) => Date.parse(d + 'T00:00:00Z');

/**
 * Count → level. With `thresholds` [a, b, c]: n < a → ░, < b → ▒, < c → ▓,
 * else █. Without, levels are quartiles of the largest count in view, so a map
 * of 1s (sessions) reads all █ and a map of set counts spreads out.
 */
export function heatLevel(count: number, max: number, thresholds?: readonly [number, number, number]): HeatLevel {
  if (!(count > 0)) return -1;
  if (thresholds) return (count < thresholds[0] ? 0 : count < thresholds[1] ? 1 : count < thresholds[2] ? 2 : 3);
  if (max <= 0) return 3;
  return Math.max(0, Math.min(3, Math.ceil((4 * count) / max) - 1)) as HeatLevel;
}

export interface HeatmapInput {
  counts: Record<string, number>;
  weeks: number;
  /** Last day shown (usually today), ISO. Its column is the last one. */
  end: string;
  thresholds?: readonly [number, number, number];
  /** Days per week to count a week as met. */
  weekTarget?: number;
}

export function heatmapGrid({ counts, weeks, end, thresholds, weekTarget }: HeatmapInput): HeatGrid {
  const endMs = parse(end);
  const startMon = endMs - (((new Date(endMs).getUTCDay() + 6) % 7) + (weeks - 1) * 7) * DAY_MS;
  let max = 0;
  for (let i = 0; i < weeks * 7; i++) {
    const ms = startMon + i * DAY_MS;
    if (ms <= endMs) max = Math.max(max, counts[iso(ms)] ?? 0);
  }
  const rows: HeatGrid['rows'] = [];
  for (let d = 0; d < 7; d++) {
    const cells: HeatCell[] = [];
    for (let w = 0; w < weeks; w++) {
      const ms = startMon + (w * 7 + d) * DAY_MS;
      const date = iso(ms);
      const count = counts[date] ?? 0;
      const future = ms > endMs;
      cells.push({ date, count, level: future ? -1 : heatLevel(count, max, thresholds), future, isEnd: ms === endMs });
    }
    rows.push({ label: LABELLED_ROWS.includes(d) ? dayName(d) : '', day: dayName(d), cells });
  }
  // A month is labelled at its first week. The first column only gets a label
  // when the next month isn't about to start (it would crowd it out).
  const monthOf = (w: number) => new Date(startMon + w * 7 * DAY_MS).getUTCMonth();
  const months: HeatGrid['months'] = [];
  let freeFrom = 0;
  for (let w = 0; w < weeks; w++) {
    const m = monthOf(w);
    if (w > 0 && m === monthOf(w - 1)) continue;
    if (w === 0 && [1, 2, 3].some(k => k < weeks && monthOf(k) !== m)) continue;
    if (w < freeFrom) continue;
    const text = monthShort(m + 1);
    months.push({ week: w, text });
    freeFrom = w + text.length + 1;
  }
  const grid: HeatGrid = { weeks, months, rows };
  if (weekTarget && weekTarget > 0) {
    grid.weekMarks = Array.from({ length: weeks }, (_, w) => {
      const days = rows.reduce((n, r) => n + (r.cells[w].level >= 0 ? 1 : 0), 0);
      return days >= weekTarget ? 'met' : days > 0 ? 'part' : 'none';
    });
  }
  return grid;
}

/** Glyph for a cell: blank for the future, · for empty, else a shade. */
export function heatGlyph(c: HeatCell): string {
  return c.future ? ' ' : c.level < 0 ? EMPTY : SHADES[c.level as 0 | 1 | 2 | 3];
}

export const WEEK_MARK = { met: '█', part: '░', none: EMPTY } as const;

/** The whole grid as monospace text (4-char row labels), as in the mood board. */
export function heatmapText(g: HeatGrid): string {
  let head = '';
  for (const m of g.months) head = head.padEnd(m.week) + m.text;
  const lines = ['    ' + head.padEnd(g.weeks)];
  for (const r of g.rows) lines.push(r.label.padEnd(4) + r.cells.map(heatGlyph).join(''));
  if (g.weekMarks) lines.push('Wk  ' + g.weekMarks.map(m => WEEK_MARK[m]).join(''));
  return lines.join('\n');
}
