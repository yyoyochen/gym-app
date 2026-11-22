// Consistency (spec §3.2): heatmap counts, weekly target marks, skips, and the
// plain summary line. Pure; weeks run Monday→Sunday like lib/heatmap.ts so
// a week mark always sits next to its own column.
import type { ISODate } from '../../domain/types';
import { addDaysIso, buildHeatmap, isoToEpochDays, mondayIndex, type HeatmapGrid } from '../../lib/heatmap';

export type WeekMark = 'full' | 'half' | 'none';

export interface ConsistencyInput {
  /** Sets with their session date; warm-ups are excluded here. */
  sets: { date: ISODate; kind: string; sessionId: string }[];
  sessions: { id: string; date: ISODate; startedAt: number }[];
  skipDates: ISODate[];
  today: ISODate;
  weeks: number;
  target: number;
  min: number;
}

export interface Consistency {
  grid: HeatmapGrid;
  /** One per grid column. */
  weekMarks: WeekMark[];
  weekSessions: number[];
  /** First session of each date (tap a day → its ledger). */
  sessionByDate: Record<ISODate, string>;
  skipDates: Set<ISODate>;
  /** Sessions in the current (last) week column. */
  thisWeek: number;
}

/** Monday on or before the date. */
export function weekStart(iso: ISODate): ISODate {
  return addDaysIso(iso, -mondayIndex(iso));
}

export function markFor(n: number, target: number, min: number): WeekMark {
  return n >= target ? 'full' : n >= min && n > 0 ? 'half' : 'none';
}

export function sessionsPerWeek(sessions: { date: ISODate }[]): Map<ISODate, number> {
  const m = new Map<ISODate, number>();
  for (const s of sessions) m.set(weekStart(s.date), (m.get(weekStart(s.date)) ?? 0) + 1);
  return m;
}

export function consistency(inp: ConsistencyInput): Consistency {
  const counts: Record<ISODate, number> = {};
  for (const s of inp.sets) if (s.kind !== 'warmup') counts[s.date] = (counts[s.date] ?? 0) + 1;
  const grid = buildHeatmap(inp.today, inp.weeks * 7, counts);
  const perWeek = sessionsPerWeek(inp.sessions);
  const weekSessions = grid.columns.map(col => perWeek.get(col[0].date) ?? 0);
  const sessionByDate: Record<ISODate, string> = {};
  for (const s of [...inp.sessions].sort((a, b) => a.startedAt - b.startedAt)) sessionByDate[s.date] ??= s.id;
  return {
    grid,
    weekMarks: weekSessions.map(n => markFor(n, inp.target, inp.min)),
    weekSessions,
    sessionByDate,
    skipDates: new Set(inp.skipDates.filter(d => !sessionByDate[d])),
    thisWeek: perWeek.get(weekStart(inp.today)) ?? 0,
  };
}

export interface YearSummary {
  sessions: number;
  weeksAtTarget: number;
  /** Weeks counted: every finished week this year, plus this week once it is at target. */
  weeks: number;
  longestRun: number;
}

/** "This year: 118 sessions · 41 of 47 weeks at target · longest run 9 weeks". */
export function yearSummary(sessions: { date: ISODate }[], today: ISODate, target: number): YearSummary {
  const year = today.slice(0, 4);
  const mine = sessions.filter(s => s.date.slice(0, 4) === year && s.date <= today);
  const perWeek = sessionsPerWeek(mine);
  const thisWeek = weekStart(today);
  // Count from the later of 1 Jan and the first logged session this year:
  // weeks before you started logging aren't missed weeks.
  const first = mine.reduce<ISODate | null>((m, x) => (m === null || x.date < m ? x.date : m), null);
  let w = weekStart(first && first > `${year}-01-01` ? first : `${year}-01-01`);
  let weeks = 0, at = 0, run = 0, longest = 0;
  while (isoToEpochDays(w) <= isoToEpochDays(thisWeek)) {
    const n = perWeek.get(w) ?? 0;
    const hit = n >= target;
    if (w !== thisWeek || hit) {
      weeks++;
      if (hit) { at++; run++; longest = Math.max(longest, run); } else run = 0;
    }
    w = addDaysIso(w, 7);
  }
  return { sessions: mine.length, weeksAtTarget: at, weeks, longestRun: longest };
}

export function summaryLine(s: YearSummary): string {
  return `This year: ${s.sessions} session${s.sessions === 1 ? '' : 's'}, ${s.weeksAtTarget} of ${s.weeks} weeks at target, longest run ${s.longestRun} week${s.longestRun === 1 ? '' : 's'}`;
}
