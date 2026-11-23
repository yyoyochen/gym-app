// Db → Track data for Today's strip, Progress, Review and LiftDetail.
import type { Exercise, GoalTarget, ISODate, Profile, SetEntry } from '../../domain/types';
import type { GymDb } from '../../db';
import { getActiveProgram, getExerciseHistory, listBodyweight, listEvents, listExercises, listSessions, listSetsByDate } from '../../db';
import { nextRotationKey } from '../../app/coach';
import { weekBodyPartSets, type BodyPartRow } from '../../app/weekSets';
import {
  addDays, bestRecentE1rm, heaviestSingle, liftSeries, pace, prs, recentRate, repMaxes, type DatedSets, type Pace,
} from '../../engine';
import { consistency, type Consistency } from './consistency';
import { kg } from '../../app/coach';
import { t, tn } from '../../i18n';

export async function loadConsistency(db: GymDb, today: ISODate, weeks: number, profile?: Profile): Promise<Consistency> {
  const from = addDays(today, -weeks * 7 - 7);
  const [sets, sessions, skips] = await Promise.all([
    listSetsByDate(db, { from, to: today }), listSessions(db, { from, to: today }), listEvents(db, { from, to: today, type: 'skip' }),
  ]);
  return consistency({
    sets, sessions, skipDates: skips.map(e => e.date), today, weeks,
    target: profile?.sessionsPerWeekTarget ?? 3, min: profile?.sessionsPerWeekMin ?? 2,
  });
}

/** This week's working sets by body part, done vs planned (Today's panel). */
export async function loadWeekBodyParts(db: GymDb, today: ISODate, target: number): Promise<BodyPartRow[]> {
  const from = addDays(today, -7);
  const [sets, sessions, all, skips, exercises, program] = await Promise.all([
    listSetsByDate(db, { from, to: today }), listSessions(db, { from, to: today }), listSessions(db),
    listEvents(db, { type: 'skip' }), listExercises(db, { includeArchived: true }), getActiveProgram(db),
  ]);
  return weekBodyPartSets({
    sets, sessions, exercises: Object.fromEntries(exercises.map(e => [e.id, e])), program: program ?? null,
    nextKey: program ? nextRotationKey(program, all, skips) : null, target, today,
  });
}

export async function latestBodyweight(db: GymDb, today: ISODate): Promise<number | undefined> {
  const rows = await listBodyweight(db, { to: today });
  return rows[rows.length - 1]?.kg;
}

export interface LiftStats {
  exercise: Exercise;
  history: DatedSets[];
  /** Newest first, with session ids, for the history list. */
  days: { sessionId: string; date: ISODate; name: string; sets: SetEntry[] }[];
  series: ReturnType<typeof liftSeries>;
  best90: number | null;
  /** kg/week from the user's own recent rate. */
  rate: number | null;
}

export async function liftStats(db: GymDb, exercise: Exercise, today: ISODate, bodyweightKg?: number): Promise<LiftStats> {
  const raw = await getExerciseHistory(db, exercise.id, { before: addDays(today, 1) });
  const days = raw.map(d => ({ sessionId: d.session.id, date: d.session.date, name: d.session.nameSnapshot, sets: d.sets }));
  const history: DatedSets[] = [...days].reverse().map(d => ({ date: d.date, sets: d.sets }));
  const series = liftSeries(exercise, history, { bodyweightKg });
  return { exercise, history, days, series, best90: bestRecentE1rm(series, today), rate: recentRate(series, today) };
}

export function liftPRs(st: LiftStats) {
  return { marks: prs(st.series), heaviest: heaviestSingle(st.exercise, st.history), repMaxes: repMaxes(st.exercise, st.history) };
}

export type Trend = 'up' | 'down' | 'flat' | 'unknown';
export function trendOf(rate: number | null): Trend {
  if (rate === null) return 'unknown';
  return rate > 0.25 ? 'up' : rate < -0.25 ? 'down' : 'flat';
}
export const TREND_GLYPH: Record<Trend, string> = { up: '↑', down: '↓', flat: '→', unknown: '·' };

// ---------------------------------------------------------------- goals

export interface GoalRow {
  target: GoalTarget;
  name: string;
  /** Evidence now, as a short mono string. */
  evidence: string;
  current: number | null;
  pace: Pace | null;
  /** Plain line: "needs +0.4 kg/wk, actual +0.2 kg/wk". */
  paceLine: string;
}

const signed = (n: number) => `${n >= 0 ? '+' : '−'}${kg(Math.abs(Math.round(n * 10) / 10))}`;

export async function goalRows(db: GymDb, profile: Profile, today: ISODate, only?: Set<string>): Promise<GoalRow[]> {
  const exercises = new Map((await listExercises(db, { includeArchived: true })).map(e => [e.id, e]));
  const bw = await latestBodyweight(db, today);
  const out: GoalRow[] = [];
  for (const tg of profile.targets) {
    if (only && !only.has(tg.subject)) continue;
    if (tg.subject === 'sessions_per_week') {
      const from = addDays(today, -28);
      const n = (await listSessions(db, { from, to: today })).length;
      const avg = Math.round((n / 4) * 10) / 10;
      out.push({ target: tg, name: t('Sessions per week'), current: avg, pace: null, evidence: t('{n}/wk (last 4 weeks)', { n: kg(avg) }),
        paceLine: avg >= tg.value ? t('at target') : t('{n}/wk short', { n: kg(tg.value - avg) }) });
      continue;
    }
    if (tg.subject === 'bodyweight') {
      out.push({ target: tg, name: t('Bodyweight'), current: bw ?? null, pace: null, evidence: bw !== undefined ? `${kg(bw)} kg` : t('no entries'),
        paceLine: bw !== undefined ? t('{kg} kg to go', { kg: signed(tg.value - bw) }) : '' });
      continue;
    }
    const ex = exercises.get(tg.subject);
    if (!ex) continue;
    const st = await liftStats(db, ex, today, bw);
    const current = st.best90;
    const p = current !== null ? pace({ current, target: tg.value, type: tg.type, today, deadline: tg.deadline, actualPerWeek: st.rate }) : null;
    out.push({
      target: tg, name: tn(ex.name), current, pace: p,
      evidence: current !== null ? t('e1RM ~{kg} kg', { kg: kg(Math.round(current * 2) / 2) }) : t('no sets in 90 days'),
      paceLine: p
        ? t('{need}, actual {actual}', {
          need: tg.type === 'hold' && (current ?? 0) >= tg.value ? t('hold') : t('needs {kg} kg/wk', { kg: signed(p.neededPerWeek) }),
          actual: p.actualPerWeek === null ? t('not enough data') : t('{kg} kg/wk', { kg: signed(p.actualPerWeek) }),
        })
        : '',
    });
  }
  return out;
}
