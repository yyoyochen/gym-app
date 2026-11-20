// Progress (spec §3.2, §3.6, §4): 52-week heatmap + summary, goal board,
// benchmarks, lift list with trend arrows.
import { useState } from 'react';
import type { ISODate } from '../domain/types';
import { getProfile, listExercises, listSessions, listSetsByDate } from '../db';
import { addDays } from '../engine';
import { kg } from '../app/coach';
import { DemoBanner } from '../app/DemoBanner';
import { formatDate, todayISO } from '../app/dates';
import { useLive } from '../ui/useLive';
import { go } from '../ui/router';
import { Heatmap } from '../ui/progress/Heatmap';
import { useScrollTop } from '../ui/session/useNow';
import { summaryLine, yearSummary } from '../ui/progress/consistency';
import { goalRows, latestBodyweight, liftStats, loadConsistency, trendOf, TREND_GLYPH, type LiftStats } from '../ui/progress/data';
import { BENCH_CAVEAT, benchLine, benchPercentile, missingForBenchmark, useBenchmarks } from '../ui/progress/benchmarks';
import type { BenchLift } from '../benchmarks/lookup';

const BENCH_LIFTS: BenchLift[] = ['squat', 'bench', 'deadlift'];

export function Progress(_props: { params: string[] }) {
  const [sel, setSel] = useState<ISODate | null>(null);
  const bench = useBenchmarks();
  useScrollTop('progress');
  const data = useLive(async db => {
    const today = todayISO();
    const profile = await getProfile(db);
    const [heat, yearSessions, bw, exercises, recentSets] = await Promise.all([
      loadConsistency(db, today, 52, profile),
      listSessions(db, { from: `${today.slice(0, 4)}-01-01`, to: today }),
      latestBodyweight(db, today),
      listExercises(db, { includeArchived: true }),
      listSetsByDate(db, { from: addDays(today, -90), to: today }),
    ]);
    const byId = new Map(exercises.map(e => [e.id, e]));
    const counts = new Map<string, number>();
    for (const s of recentSets) if (s.kind !== 'warmup') counts.set(s.exerciseId, (counts.get(s.exerciseId) ?? 0) + 1);
    const lifts: LiftStats[] = [];
    for (const [id] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
      const ex = byId.get(id);
      if (ex) lifts.push(await liftStats(db, ex, today, bw));
    }
    const goals = profile ? await goalRows(db, profile, today) : [];
    const benchEx = BENCH_LIFTS.map(l => {
      const st = lifts.find(x => x.exercise.benchmarkKey === l);
      const ex = st?.exercise ?? exercises.find(e => e.benchmarkKey === l);
      return { lift: l, name: ex?.name ?? l, e1rm: st?.best90 ?? null };
    });
    return { today, profile, heat, summary: yearSummary(yearSessions, today, profile?.sessionsPerWeekTarget ?? 3), bw, lifts, goals, benchEx };
  }, []);

  if (!data) return <section className="screen" aria-busy="true" />;
  const { today, profile, heat, summary, bw, lifts, goals, benchEx } = data;
  const selCell = sel ? heat.grid.columns.flat().find(c => c.date === sel) : null;
  const benchIn = { profile, bodyweightKg: bw, year: Number(today.slice(0, 4)) };
  const missing = missingForBenchmark(benchIn);

  return (
    <section className="screen">
      <DemoBanner />
      <h1 className="title">Progress</h1>

      <section className="stack" aria-label="Consistency">
        <span className="label">Consistency · 52 weeks</span>
        <Heatmap data={heat} today={today} cell={12} selected={sel} onSelect={setSel}
          label={`Training days over 52 weeks. ${summaryLine(summary)}.`} />
        <div className="spread">
          <div className="heat-legend mid micro" aria-hidden="true">
            less <i style={{ background: 'var(--raised)' }} /><i style={{ background: 'var(--accent)', opacity: 0.28 }} />
            <i style={{ background: 'var(--accent)', opacity: 0.5 }} /><i style={{ background: 'var(--accent)', opacity: 0.75 }} />
            <i style={{ background: 'var(--accent)' }} /> more
          </div>
          <span className="mid micro">▮ week at target · ▯ skip</span>
        </div>
        <p className="mid line">{summaryLine(summary)}</p>
        {selCell && (
          <div className="spread list-line">
            <span><span className="mono">{formatDate(selCell.date)}</span> · <span className="num-inline">{selCell.count}</span> working sets{heat.skipDates.has(selCell.date) ? ' · skipped' : ''}</span>
            {heat.sessionByDate[selCell.date] && <button type="button" className="btn" onClick={() => go(`history/${heat.sessionByDate[selCell.date]}`)}>Open ›</button>}
          </div>
        )}
      </section>

      <section className="stack" aria-label="Goal board">
        <span className="label">Goal board</span>
        {!goals.length && <p className="mid line">No targets yet. <a className="link" href="#/profile">Set them on Profile</a>.</p>}
        {goals.map(g => (
          <article key={g.target.id} className="card tick tick-ghost goal-row">
            <p className="heading">{g.name} · {g.target.type === 'hold' ? 'hold' : g.target.type === 'at_least' ? 'at least' : 'reach'} <span className="mono">{kg(g.target.value)}</span></p>
            {g.pace ? <span className={`feas ${g.pace.feasibility}`}>{g.pace.feasibility}</span> : <span />}
            <p className="mid">by <span className="num-inline">{formatDate(g.target.deadline, { weekday: false })}</span> · now <span className="num-inline">{g.evidence}</span></p>
            <p className="mid" style={{ gridColumn: '1 / -1' }}>{g.paceLine}{g.pace?.assumedFlat ? ' (no trend yet: assumed flat)' : ''}</p>
          </article>
        ))}
      </section>

      <section className="stack" aria-label="Benchmarks">
        <span className="label">Benchmarks</span>
        {bench === undefined && <p className="mid line">Loading…</p>}
        {bench === null && <p className="mid line">Benchmarks could not be loaded.</p>}
        {bench && missing && <p className="mid line">{missing}</p>}
        {bench && !missing && benchEx.map(b => {
          if (b.e1rm === null) return <p key={b.lift} className="mid line">{b.name}: no sets in the last 90 days.</p>;
          const r = benchPercentile(bench, b.lift, b.e1rm, benchIn);
          return <p key={b.lift} className="line">{r ? <MonoLine text={benchLine(b.lift, b.e1rm, r)} /> : `${b.name}: no bucket for your profile.`}</p>;
        })}
        {bench && <p className="mid line">Overhead press, Olympic lifts and accessories: no open benchmark.</p>}
        <p className="mid line">{BENCH_CAVEAT}</p>
        {bench && <p className="ghost micro line">Data: {bench.attribution} ({bench.dataDate}).</p>}
      </section>

      <section className="stack" aria-label="Lifts">
        <span className="label">Lifts · last 90 days</span>
        {!lifts.length && <p className="mid line">Nothing logged in the last 90 days.</p>}
        <div className="lift-list">
          {lifts.map(l => {
            const tr = trendOf(l.rate);
            return (
              <a key={l.exercise.id} href={`#/lift/${encodeURIComponent(l.exercise.id)}`}>
                <span className="heading">{l.exercise.name}</span>
                <span className="mono num-sm mid">{l.best90 !== null ? `${kg(Math.round(l.best90 * 2) / 2)} e1RM` : ''}</span>
                <span className={`trend ${tr}`} aria-label={`trend ${tr}`}>{TREND_GLYPH[tr]}</span>
              </a>
            );
          })}
        </div>
      </section>
    </section>
  );
}

function MonoLine({ text }: { text: string }) {
  const parts = text.split(/(\d+(?:\.\d+)?(?:st|nd|rd|th)?(?:–\d+)?)/g);
  return <>{parts.map((p, i) => (i % 2 ? <span key={i} className="num-inline">{p}</span> : p))}</>;
}
