// History: the year at a glance (the 52-week heatmap of working sets, tap a
// day for its session) and every session as spec-sheet rows, newest first,
// under month headings (docs/superpowers/specs/2026-11-22-tab-jobs-design.md).
import { useMemo } from 'react';
import { getProfile, listSessions, sortSets } from '../db';
import { useLive } from '../ui/useLive';
import { DemoBanner } from '../app/DemoBanner';
import { formatLoad } from '../app/labels';
import { formatDate, monthLabel, todayISO } from '../app/dates';
import { groupBySession, summarizeSession, type SessionSummary } from '../app/history';
import { LinkButton, Lockup, Parts, PixelIcon, SquareHeatmap, go } from '../ui/kit';
import { SecHead } from '../ui/progress/parts';
import { loadConsistency } from '../ui/progress/data';

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
    };
  }, []);

  const months = useMemo(() => {
    const out: { key: string; label: string; rows: SessionSummary[] }[] = [];
    for (const d of [...(data?.rows ?? [])].reverse()) {
      const key = d.session.date.slice(0, 7);
      if (out[out.length - 1]?.key !== key) out.push({ key, label: monthLabel(Number(key.slice(0, 4)), Number(key.slice(5, 7))), rows: [] });
      out[out.length - 1].rows.push(d);
    }
    return out;
  }, [data]);

  const total = data?.rows.length ?? 0;
  return (
    <section className="screen tk-screen">
      <DemoBanner />
      <Lockup mid={`History //${total} session${total === 1 ? '' : 's'}`} />

      {data && (
        <section className="tk-block" aria-label="Last 52 weeks">
          <SquareHeatmap counts={data.counts} weeks={52} end={data.today} weekTarget={data.target} legend
            label={`Training days, last 52 weeks. ${data.heat.thisWeek} of ${data.target} sessions this week`}
            onSelect={d => data.heat.sessionByDate[d] && go(`history/${encodeURIComponent(data.heat.sessionByDate[d])}`)} />
        </section>
      )}

      {data === undefined && <p className="tk-quiet">Loading…</p>}
      {data && total === 0 && <p className="tk-quiet">No sessions yet. Logged and imported sessions show up here.</p>}
      {months.map(m => (
        <section key={m.key} className="tk-sec" aria-label={m.label}>
          <SecHead title={m.label} meta={`${m.rows.length} session${m.rows.length === 1 ? '' : 's'}, ${m.rows.reduce((n, d) => n + d.setCount, 0)} sets`} />
          <ul className="tk-rows">
            {m.rows.map(d => <li key={d.session.id}><SessionRow d={d} bwFactor={data?.bwFactor} /></li>)}
          </ul>
        </section>
      ))}
      {data && <LinkButton href="#/session/past" icon="plus" className="tk-past">Log past session</LinkButton>}
    </section>
  );
}

function SessionRow({ d, bwFactor }: { d: SessionSummary; bwFactor?: Map<string, number> }) {
  const s = d.session;
  const [wd, dd, mm] = formatDate(s.date, { year: false }).split(' ');
  return (
    <a className="tk-srow-link" data-press="row" href={`#/history/${encodeURIComponent(s.id)}`}>
      <span className="tk-sdate"><b>{dd}</b><span>{wd} {mm}</span></span>
      <span className="tk-smain">
        <span className="tk-sname">{s.nameSnapshot}
          {!s.sealed && <span className="chip tk-chip">in progress</span>}
          {s.edited && <span className="chip tk-chip">edited</span>}
        </span>
        {d.top.length > 0 && (
          <Parts className="tk-stop" items={d.top.map(t => `${t.name} ${formatLoad(t.weight, bwFactor?.get(t.exerciseId))} × ${t.reps}`)} />
        )}
      </span>
      <span className="tk-scount">{d.setCount}<small>sets</small></span>
      <PixelIcon name="chevron" scale={1} />
    </a>
  );
}
