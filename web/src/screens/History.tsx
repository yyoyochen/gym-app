// Calendar: the last 3 months as a large heatmap of working sets (tap a day for
// its session), then one month of sessions at a time as spec-sheet rows,
// newest first. Change month with the ‹ › arrows, a sideways swipe, or by
// tapping the month name for a month and year picker.
import { useMemo, useRef, useState } from 'react';
import { getProfile, listSessions, sortSets } from '../db';
import { useLive } from '../ui/useLive';
import { DemoBanner } from '../app/DemoBanner';
import { displayName, formatLoad } from '../app/labels';
import { formatDate, monthLabel, todayISO } from '../app/dates';
import { groupBySession, summarizeSession, type SessionSummary } from '../app/history';
import { LinkButton, Lockup, Parts, PixelIcon, SquareHeatmap, go } from '../ui/kit';
import { MonthYearHeader, clampMonth, ymOf, type YM } from '../ui/common';
import { loadConsistency } from '../ui/progress/data';
import { swipeMonths } from './historySwipe';

/** Heatmap window: 13 weeks, about 3 months. */
const HEAT_WEEKS = 13;

export function History(_props: { params: string[] }) {
  const data = useLive(async db => {
    const today = todayISO();
    const profile = await getProfile(db);
    const [sessions, sets, exercises, heat] = await Promise.all([
      listSessions(db), db.sets.toArray(), db.exercises.toArray(), loadConsistency(db, today, 52, profile),
    ]);
    const bySession = groupBySession(sets);
    const rows = sessions.map(s => summarizeSession(s, sortSets(bySession.get(s.id) ?? [])));
    const counts: Record<string, number> = {};
    for (const col of heat.grid.columns) for (const c of col) if (c.inWindow && c.count > 0) counts[c.date] = c.count;
    return {
      today, rows, heat, counts, target: profile?.sessionsPerWeekTarget ?? 3,
      bwFactor: new Map(exercises.map(e => [e.id, e.bodyweightFactor])),
      names: new Map(exercises.map(e => [e.id, e.name])),
    };
  }, []);

  const [picked, setPicked] = useState<YM | null>(null);
  const max = ymOf(data?.today ?? todayISO());
  const earliest = data?.rows.reduce<string | null>((a, d) => (!a || d.session.date < a ? d.session.date : a), null);
  const min = earliest ? ymOf(earliest) : max;
  const ym = clampMonth(picked ?? max, min, max);
  const key = `${ym.year}-${String(ym.month).padStart(2, '0')}`;
  const month = useMemo(() => (data?.rows ?? []).filter(d => d.session.date.startsWith(key)).reverse(), [data, key]);

  const move = (n: number) => setPicked(clampMonth(ymAdd(ym, n), min, max));
  const touch = useRef<{ x: number; y: number } | null>(null);

  const total = data?.rows.length ?? 0;
  const sets = month.reduce((n, d) => n + d.setCount, 0);
  return (
    <section className="screen tk-screen">
      <DemoBanner />
      <Lockup mid={`Calendar / ${total} session${total === 1 ? '' : 's'}`} />

      {data && (
        <section className="tk-block cal-hero" aria-label="Last 3 months">
          <SquareHeatmap shape="square" counts={data.counts} weeks={HEAT_WEEKS} end={data.today} weekTarget={data.target} legend
            label={`Training days, last 3 months. ${data.heat.thisWeek} of ${data.target} sessions this week`}
            onSelect={d => data.heat.sessionByDate[d] && go(`history/${encodeURIComponent(data.heat.sessionByDate[d])}`)} />
        </section>
      )}

      {data === undefined && <p className="tk-quiet">Loading…</p>}
      {data && total === 0 && <p className="tk-quiet">No sessions yet. Logged and imported sessions show up here.</p>}
      {data && total > 0 && (
        <section className="tk-sec cal-month" aria-label={monthLabel(ym.year, ym.month)}
          onTouchStart={e => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; }}
          onTouchEnd={e => {
            const s = touch.current; touch.current = null;
            const t = e.changedTouches[0];
            if (s) { const n = swipeMonths(t.clientX - s.x, t.clientY - s.y); if (n) move(n); }
          }}>
          <MonthYearHeader as="h2" ym={ym} min={min} max={max} onChange={v => setPicked(v)} />
          <p className="tk-mono mid cal-month-meta">{month.length ? `${month.length} session${month.length === 1 ? '' : 's'}, ${sets} sets` : 'No sessions this month.'}</p>
          {month.length > 0 && (
            <ul className="tk-rows">
              {month.map(d => <li key={d.session.id}><SessionRow d={d} bwFactor={data.bwFactor} names={data.names} /></li>)}
            </ul>
          )}
        </section>
      )}
      {data && <LinkButton href="#/session/past" icon="plus" className="tk-past">Log past session</LinkButton>}
    </section>
  );
}

const ymAdd = (ym: YM, n: number): YM => {
  const i = ym.year * 12 + ym.month - 1 + n;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
};

function SessionRow({ d, bwFactor, names }: { d: SessionSummary; bwFactor?: Map<string, number>; names?: Map<string, string> }) {
  const s = d.session;
  const [wd, dd, mm] = formatDate(s.date, { year: false }).split(' ');
  return (
    <a className="tk-srow-link" data-press="row" href={`#/history/${encodeURIComponent(s.id)}`}>
      <span className="tk-sdate"><b>{dd}</b><span>{wd} {mm}</span></span>
      <span className="tk-smain">
        <span className="tk-sname">{displayName(s.nameSnapshot)}
          {!s.sealed && <span className="chip tk-chip">in progress</span>}
          {s.edited && <span className="chip tk-chip">edited</span>}
        </span>
        {d.top.length > 0 && (
          <Parts className="tk-stop" items={d.top.map(t => `${names?.get(t.exerciseId) ?? t.name} ${formatLoad(t.weight, bwFactor?.get(t.exerciseId))} × ${t.reps}`)} />
        )}
      </span>
      <span className="tk-scount">{d.setCount}<small>sets</small></span>
      <PixelIcon name="chevron" scale={1} />
    </a>
  );
}
