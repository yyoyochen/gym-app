// History (spec §4) in Ink & Dither: a 1-bit month calendar (trained days are
// filled cells, dithered by working-set count) and the month's sessions as
// spec-sheet rows, newest first.
import { useId, useMemo, useState } from 'react';
import { listSessions, sortSets } from '../db';
import { useLive } from '../ui/useLive';
import { DemoBanner } from '../app/DemoBanner';
import { formatLoad } from '../app/labels';
import { formatDate, monthGrid, monthLabel, shiftMonth, todayISO } from '../app/dates';
import { groupBySession, summarizeSession, type SessionSummary } from '../app/history';
import { LinkButton, Lockup, PixelIcon, heatLevel } from '../ui/kit';
import type { HeatLevel } from '../ui/kit/dither';
import { SecHead } from '../ui/progress/parts';

/** 4×4 ordered (Bayer) dither: a cell's pixels switch on in this order as the level rises. */
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const DENSITY = [0.25, 0.5, 0.75, 1];

export function History(_props: { params: string[] }) {
  const data = useLive(async db => {
    const [sessions, sets, exercises] = await Promise.all([listSessions(db), db.sets.toArray(), db.exercises.toArray()]);
    const bySession = groupBySession(sets);
    const rows = sessions.map(s => summarizeSession(s, sortSets(bySession.get(s.id) ?? [])));
    const work = new Map<string, number>();
    for (const s of sets) if (s.kind !== 'warmup') work.set(s.date, (work.get(s.date) ?? 0) + 1);
    return { rows, work, bwFactor: new Map(exercises.map(e => [e.id, e.bodyweightFactor])) };
  }, []);
  const today = todayISO();
  const rows = data?.rows;
  const latest = rows?.length ? rows[rows.length - 1].session.date : today;
  const [ym, setYm] = useState<{ year: number; month: number } | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const cur = ym ?? { year: Number(latest.slice(0, 4)), month: Number(latest.slice(5, 7)) };
  const prefix = `${cur.year}-${String(cur.month).padStart(2, '0')}`;
  const uid = useId().replace(/:/g, '');

  const trained = useMemo(() => new Set((rows ?? []).map(d => d.session.date)), [rows]);
  const max = useMemo(() => Math.max(0, ...(data ? [...data.work.values()] : [0])), [data]);
  const inMonth = (rows ?? []).filter(d => d.session.date.startsWith(prefix)).reverse();
  const shown = day ? inMonth.filter(d => d.session.date === day) : inMonth;
  const monthSets = inMonth.reduce((n, d) => n + d.setCount, 0);
  const move = (n: number) => { setYm(shiftMonth(cur.year, cur.month, n)); setDay(null); };
  const levelOf = (d: string): HeatLevel => (trained.has(d) ? Math.max(0, heatLevel(data?.work.get(d) ?? 0, max)) as HeatLevel : -1);

  return (
    <section className="screen tk-screen">
      <DemoBanner />
      <Lockup mid={`History //${monthLabel(cur.year, cur.month)}`} />

      <section className="tk-block" aria-label="Calendar">
        <div className="tk-month">
          <button type="button" className="tk-icon" data-press="dim" aria-label="Previous month" onClick={() => move(-1)}><PixelIcon name="back" /></button>
          <h2 className="heading">{monthLabel(cur.year, cur.month)}</h2>
          <button type="button" className="tk-icon" data-press="dim" aria-label="Next month" onClick={() => move(1)}><PixelIcon name="chevron" /></button>
        </div>
        <svg width="0" height="0" className="tk-defs" aria-hidden="true">
          <defs>
            {DENSITY.map((dn, i) => (
              <pattern key={i} id={`${uid}-d${i}`} width="8" height="8" patternUnits="userSpaceOnUse">
                {BAYER.flatMap((row, y) => row.map((b, x) => (b / 16 < dn ? <rect key={`${x}${y}`} x={x * 2} y={y * 2} width="2" height="2" fill="currentColor" /> : null)))}
              </pattern>
            ))}
          </defs>
        </svg>
        <div className="tk-cal" role="grid" aria-label={monthLabel(cur.year, cur.month)}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="tk-cal-h" aria-hidden="true">{d}</span>)}
          {monthGrid(cur.year, cur.month).flat().map((d, i) => {
            if (!d) return <span key={`x${i}`} />;
            const lvl = levelOf(d);
            const on = lvl >= 0;
            const n = data?.work.get(d) ?? 0;
            return (
              <button key={d} type="button" disabled={!on}
                className={`tk-cal-d${on ? ` on l${lvl}` : ''}${d === today ? ' today' : ''}${d === day ? ' sel' : ''}`}
                aria-pressed={on ? d === day : undefined}
                aria-label={`${formatDate(d)}${on ? `, trained, ${n} working sets` : ''}`}
                onClick={() => setDay(day === d ? null : d)}>
                {on && (
                  <svg className="tk-cal-fill" aria-hidden="true">
                    <rect width="100%" height="100%" fill={lvl === 3 ? 'currentColor' : `url(#${uid}-d${lvl})`} />
                  </svg>
                )}
                <span className="tk-cal-n">{Number(d.slice(8))}</span>
              </button>
            );
          })}
        </div>
        <p className="tk-legend" aria-hidden="true">Fewer sets <span className="accent tk-glyphs">░ ▒ ▓ █</span> More</p>
      </section>

      <section className="tk-sec" aria-label="Sessions">
        <SecHead title={day ? formatDate(day) : 'Sessions'}
          meta={`${inMonth.length} session${inMonth.length === 1 ? '' : 's'} · ${monthSets} sets`} />
        {day && <button type="button" className="tk-link tk-clear" onClick={() => setDay(null)}>Show the whole month</button>}
        {data === undefined && <p className="tk-quiet">Loading…</p>}
        {rows?.length === 0 && <p className="tk-quiet">No sessions yet. Logged and imported sessions show up here.</p>}
        {rows && rows.length > 0 && shown.length === 0 && <p className="tk-quiet">No sessions in {monthLabel(cur.year, cur.month)}.</p>}
        <ul className="tk-rows">
          {shown.map(d => <li key={d.session.id}><SessionRow d={d} bwFactor={data?.bwFactor} /></li>)}
        </ul>
        <LinkButton href="#/session/past" icon="plus" className="tk-past">Log past session</LinkButton>
      </section>
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
          <span className="tk-stop">{d.top.map(t => `${t.name} ${formatLoad(t.weight, bwFactor?.get(t.exerciseId))} × ${t.reps}`).join(' · ')}</span>
        )}
      </span>
      <span className="tk-scount">{d.setCount}<small>sets</small></span>
      <PixelIcon name="chevron" scale={1} />
    </a>
  );
}
