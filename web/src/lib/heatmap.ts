/**
 * Pure date/grid math for the training heatmap (GitHub-style, Sun-start).
 *
 * Every function here is pure string/integer math over ISO `YYYY-MM-DD`
 * strings. Crucially there is NO `new Date('YYYY-MM-DD')` parsing anywhere —
 * that parses as UTC midnight and shifts a day in negative-offset timezones
 * (see LiftDetail's logDate for the same rule). We split the string manually
 * and only ever use `Date.UTC` / `getUTC*`, so a date string maps to the same
 * cell in every timezone.
 */
import { monthShort } from '../app/dates';

export interface HeatCell {
  /** ISO `YYYY-MM-DD`. */
  date: string;
  /** Sets logged that day (0 when none, or when out of window). */
  count: number;
  /** Intensity 0–4. 0 = no training; 1–4 = quartiles of nonzero counts. */
  bucket: 0 | 1 | 2 | 3 | 4;
  /** False for grid-padding cells before the window start / after its end. */
  inWindow: boolean;
}

export interface MonthLabel {
  /** Column index the label sits over. */
  col: number;
  /** Short month name, e.g. "Aug". */
  label: string;
}

export interface HeatmapGrid {
  /** Week columns, oldest first. Each column is 7 cells, index 0 = Monday. */
  columns: HeatCell[][];
  monthLabels: MonthLabel[];
  /** First / last day of the requested window (inclusive). */
  start: string;
  end: string;
  /** Quartile cut points of the window's nonzero counts. */
  thresholds: [number, number, number];
}

const MS_PER_DAY = 86_400_000;


/** ISO date string → whole days since 1970-01-01 (UTC math, TZ-proof). */
export function isoToEpochDays(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

/** Whole days since epoch → ISO date string (UTC accessors only). */
export function epochDaysToIso(days: number): string {
  const date = new Date(days * MS_PER_DAY);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Add `delta` calendar days to an ISO date string. */
export function addDaysIso(iso: string, delta: number): string {
  return epochDaysToIso(isoToEpochDays(iso) + delta);
}

/** Day of week for an ISO date: 0 = Sunday … 6 = Saturday. (1970-01-01 was a Thursday.) */
export function weekdayOf(iso: string): number {
  return (((isoToEpochDays(iso) + 4) % 7) + 7) % 7;
}

/** Row of a date in a Monday-first week: 0 = Monday … 6 = Sunday. */
export function mondayIndex(iso: string): number {
  return (weekdayOf(iso) + 6) % 7;
}

/** A `Date` instant → the ISO date it falls on in LOCAL time (for "today"). */
export function localIsoOf(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Quartile cut points over the NONZERO counts. Buckets then read:
 * count ≤ q1 → 1, ≤ q2 → 2, ≤ q3 → 3, above → 4, so the minimum nonzero
 * count always lands in bucket 1 and the maximum in bucket 4 (when the
 * window has ≥4 distinct values).
 */
export function quartileThresholds(counts: number[]): [number, number, number] {
  const nz = counts.filter((c) => c > 0).sort((a, b) => a - b);
  if (nz.length === 0) return [0, 0, 0];
  const at = (p: number) => nz[Math.max(0, Math.ceil(p * nz.length) - 1)];
  return [at(0.25), at(0.5), at(0.75)];
}

/** Intensity bucket for a day's set count against the window thresholds. */
export function bucketFor(count: number, [q1, q2, q3]: [number, number, number]): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count <= q1) return 1;
  if (count <= q2) return 2;
  if (count <= q3) return 3;
  return 4;
}

/**
 * Month labels: one over the first column, plus every column whose first
 * (Monday) day starts a new month. If the month turns in column 1, the
 * column-0 label is dropped so two labels never sit shoulder to shoulder.
 */
export function computeMonthLabels(columns: HeatCell[][]): MonthLabel[] {
  const labels: MonthLabel[] = [];
  let prev = -1;
  columns.forEach((col, i) => {
    const month = Number(col[0].date.slice(5, 7));
    if (month !== prev) labels.push({ col: i, label: monthShort(month) });
    prev = month;
  });
  if (labels.length >= 2 && labels[0].col === 0 && labels[1].col === 1) labels.shift();
  return labels;
}

/**
 * Build the full grid for the `days`-long window ending at `end` (inclusive).
 * Columns run Monday→Sunday; the first column is padded back to the Monday
 * on or before the window start, the last is padded forward past `end`.
 */
export function buildHeatmap(
  end: string,
  days: number,
  countsByDate: Record<string, number>,
): HeatmapGrid {
  const endDays = isoToEpochDays(end);
  const startDays = endDays - days + 1;
  const start = epochDaysToIso(startDays);
  const gridStartDays = startDays - mondayIndex(start);

  const windowCounts: number[] = [];
  for (let d = startDays; d <= endDays; d++) {
    const count = countsByDate[epochDaysToIso(d)] ?? 0;
    if (count > 0) windowCounts.push(count);
  }
  const thresholds = quartileThresholds(windowCounts);

  const columns: HeatCell[][] = [];
  for (let colStart = gridStartDays; colStart <= endDays; colStart += 7) {
    const column: HeatCell[] = [];
    for (let row = 0; row < 7; row++) {
      const dayNum = colStart + row;
      const date = epochDaysToIso(dayNum);
      const inWindow = dayNum >= startDays && dayNum <= endDays;
      const count = inWindow ? (countsByDate[date] ?? 0) : 0;
      column.push({ date, count, bucket: inWindow ? bucketFor(count, thresholds) : 0, inWindow });
    }
    columns.push(column);
  }

  return { columns, monthLabels: computeMonthLabels(columns), start, end, thresholds };
}
