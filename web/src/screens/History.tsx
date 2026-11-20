// History (spec §4): month calendar with trained days + the month's sessions, newest first.
import { useMemo, useState } from 'react';
import { listSessions } from '../db';
import { useLive } from '../ui/useLive';
import { DemoBanner } from '../app/DemoBanner';
import { formatDate, monthGrid, monthLabel, shiftMonth, todayISO } from '../app/dates';
import { groupBySession, summarizeSession, type SessionSummary } from '../app/history';
import { sortSets } from '../db';

export function History(_props: { params: string[] }) {
  const data = useLive(async db => {
    const [sessions, sets] = await Promise.all([listSessions(db), db.sets.toArray()]);
    const bySession = groupBySession(sets);
    return sessions.map(s => summarizeSession(s, sortSets(bySession.get(s.id) ?? [])));
  }, []);
  const today = todayISO();
  const latest = data?.length ? data[data.length - 1].session.date : today;
  const [ym, setYm] = useState<{ year: number; month: number } | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const cur = ym ?? { year: Number(latest.slice(0, 4)), month: Number(latest.slice(5, 7)) };
  const prefix = `${cur.year}-${String(cur.month).padStart(2, '0')}`;

  const trained = useMemo(() => new Set((data ?? []).map(d => d.session.date)), [data]);
  const inMonth = (data ?? []).filter(d => d.session.date.startsWith(prefix)).reverse();
  const shown = day ? inMonth.filter(d => d.session.date === day) : inMonth;
  const move = (n: number) => { setYm(shiftMonth(cur.year, cur.month, n)); setDay(null); };

  return (
    <section className="screen">
      <DemoBanner />
      <div className="spread">
        <h1 className="title">History</h1>
        {/* TODO(logger): the logger agent owns past-session logging; this route should open it with a date picker. */}
        <a className="btn" href="#/session/past">Log past session</a>
      </div>

      <div className="card stack">
        <div className="spread">
          <button className="btn icon" aria-label="Previous month" onClick={() => move(-1)}>‹</button>
          <span className="heading">{monthLabel(cur.year, cur.month)}</span>
          <button className="btn icon" aria-label="Next month" onClick={() => move(1)}>›</button>
        </div>
        <div className="cal" role="grid" aria-label={monthLabel(cur.year, cur.month)}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="cal-head label">{d}</span>)}
          {monthGrid(cur.year, cur.month).flat().map((d, i) => d
            ? <button key={d} className={`cal-day mono${trained.has(d) ? ' trained' : ''}${d === today ? ' today' : ''}${d === day ? ' sel' : ''}`}
                disabled={!trained.has(d)} aria-label={`${formatDate(d)}${trained.has(d) ? ', trained' : ''}`}
                onClick={() => setDay(day === d ? null : d)}>{Number(d.slice(8))}</button>
            : <span key={`x${i}`} />)}
        </div>
        <p className="mid"><span className="mono">{inMonth.length}</span> sessions this month{day && <> · showing <span className="mono">{formatDate(day)}</span> <button className="link" onClick={() => setDay(null)}>show all</button></>}</p>
      </div>

      {data === undefined && <p className="mid">Loading…</p>}
      {data?.length === 0 && <p className="mid">No sessions yet. Logged and imported sessions show up here.</p>}
      {data && data.length > 0 && shown.length === 0 && <p className="mid">No sessions in {monthLabel(cur.year, cur.month)}.</p>}
      <ul className="plain stack">
        {shown.map(d => <li key={d.session.id}><SessionRow d={d} /></li>)}
      </ul>
    </section>
  );
}

function SessionRow({ d }: { d: SessionSummary }) {
  const s = d.session;
  return (
    <a className="card tick session-row" href={`#/history/${encodeURIComponent(s.id)}`}>
      <div className="spread">
        <span className="heading">{s.nameSnapshot}</span>
        <span className="mono num-sm mid">{formatDate(s.date, { year: false })}</span>
      </div>
      <div className="mid">
        <span className="mono">{d.setCount}</span> sets
        {!s.sealed && <span className="chip inline">in progress</span>}
        {s.edited && <span className="chip inline">edited</span>}
      </div>
      {d.top.length > 0 && (
        <ul className="plain top-lifts">
          {d.top.map(t => (
            <li key={t.exerciseId} className="spread"><span className="mid">{t.name}</span><span className="mono num-sm">{t.weight} × {t.reps}</span></li>
          ))}
        </ul>
      )}
    </a>
  );
}
