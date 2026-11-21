// Lift page (#/lift/<id>; spec §3.2): e1RM trend, top set over time, verdict
// strip, PRs, benchmark strip, history.
import type { EffortScale } from '../domain/types';
import { getExercise, getProfile } from '../db';
import { addDays, bestRecentE1rm } from '../engine';
import { kg, setsLine } from '../app/coach';
import { formatDate, todayISO } from '../app/dates';
import { useLive } from '../ui/useLive';
import { latestBodyweight, liftPRs, liftStats, liftVerdicts, trendOf, TREND_GLYPH } from '../ui/progress/data';
import { BENCH_CAVEAT, benchLine, benchPercentile, missingForBenchmark, pctNumber, pctText, useBenchmarks } from '../ui/progress/benchmarks';
import { E1rmChart } from '../ui/progress/E1rmChart';
import { useScrollTop } from '../ui/session/useNow';
import { rateExercise } from '../benchmarks/liftRating';
import { STANDARDS_CAVEAT, levelTableText, missingForStandards, standardsContext, useGymStandards } from '../ui/progress/standards';
import { LevelWord, StandardSummary, ValueText } from '../ui/progress/StandardLadder';

export function LiftDetail({ params }: { params: string[] }) {
  const id = params[0];
  const bench = useBenchmarks();
  const gym = useGymStandards();
  useScrollTop(id);
  const data = useLive(async db => {
    const today = todayISO();
    const ex = await getExercise(db, id);
    if (!ex) return null;
    const [profile, bw] = await Promise.all([getProfile(db), latestBodyweight(db, today)]);
    const st = await liftStats(db, ex, today, bw);
    const verdicts = await liftVerdicts(db, st);
    return { today, ex, profile, bw, st, verdicts, prs: liftPRs(st), scale: (profile?.effortScale ?? 'rir') as EffortScale };
  }, [id]);

  if (data === undefined) return <section className="screen" aria-busy="true"><a className="back" href="#/progress">‹ Progress</a></section>;
  if (data === null) return <section className="screen"><a className="back" href="#/progress">‹ Progress</a><p className="mid">Unknown lift.</p></section>;
  const { today, ex, profile, bw, st, verdicts, prs, scale } = data;
  const prDates = new Set(prs.marks.filter(m => m.kind === 'e1rm' || m.kind === 'top_weight').map(m => m.date));
  const points = st.series.map(p => ({ date: p.date, e1rm: p.e1rm, top: p.top_weight, pr: prDates.has(p.date) }));
  const bestE = st.series.reduce<{ v: number; date: string } | null>((a, p) => (!a || p.e1rm > a.v ? { v: p.e1rm, date: p.date } : a), null);
  const tr = trendOf(st.rate);
  const benchIn = { profile, bodyweightKg: bw, year: Number(today.slice(0, 4)) };
  const key = ex.benchmarkKey;
  const then = bestRecentE1rm(st.series, addDays(today, -90));
  const pctNow = bench && key && st.best90 !== null ? benchPercentile(bench, key, st.best90, benchIn) : null;
  const pctThen = bench && key && then !== null ? benchPercentile(bench, key, then, benchIn) : null;
  const ctx = standardsContext(benchIn);
  const standing = gym && ctx ? rateExercise(gym, ex, st.history, today, ctx) : null;
  const pop = profile?.benchmarkPopulation ?? 'gym';

  return (
    <section className="screen">
      <a className="back" href="#/progress">‹ Progress</a>
      <div className="flow-head">
        <h1 className="title">{ex.name}</h1>
        <span className={`trend ${tr}`} aria-label={`trend ${tr}`}>{TREND_GLYPH[tr]}</span>
      </div>
      <div className="row wrap">
        <span className="mid">Best e1RM, 90 days</span>
        <span className="num-lg">{st.best90 !== null ? kg(Math.round(st.best90 * 2) / 2) : '—'}</span>
        {st.rate !== null && <span className="mono num-sm mid">{st.rate >= 0 ? '+' : '−'}{kg(Math.abs(Math.round(st.rate * 10) / 10))} kg/wk</span>}
      </div>

      <section className="card stack" aria-label="e1RM trend">
        <span className="label">e1RM (Epley) and top set</span>
        <E1rmChart points={points} label={`${ex.name} e1RM over ${points.length} sessions`} />
      </section>

      <section className="stack" aria-label="Verdicts">
        <span className="label">Verdicts · {verdicts.length}</span>
        {verdicts.length ? (
          <div className="verdict-strip">
            {verdicts.map(v => <i key={v.sessionId} className={v.verdict} title={`${v.date}: ${v.verdict} — ${v.detail}`} />)}
          </div>
        ) : <p className="mid line">No graded sessions yet.</p>}
      </section>

      <section className="card stack" aria-label="Records">
        <span className="label">PRs</span>
        <dl className="kv">
          <dt>Heaviest single</dt><dd className="mono">{prs.heaviest ? `${kg(prs.heaviest.weight)} kg · ${prs.heaviest.date}` : '—'}</dd>
          <dt>Best e1RM</dt><dd className="mono">{bestE ? `${kg(Math.round(bestE.v * 2) / 2)} kg · ${bestE.date}` : '—'}</dd>
        </dl>
        {prs.reps.length > 0 && (
          <>
            <span className="label">Best reps at weight</span>
            <p className="mono num-sm line">{prs.reps.slice(-8).map(r => `${kg(r.weight)}×${r.reps}`).join(' · ')}</p>
          </>
        )}
      </section>

      <section className="stack" aria-label="Level">
        <span className="label">Level · vs gym-goers</span>
        {gym === undefined ? <p className="mid line">Loading…</p>
          : gym === null ? <p className="mid line">Strength standards could not be loaded.</p>
          : !ctx ? <p className="mid line">Add {missingForStandards(benchIn).join(' and ')} on <a className="link" href="#/profile">Profile</a> to see your level.</p>
          : !standing || standing.kind === 'none' ? <p className="mid line">No strength standard for this lift.</p>
          : standing.kind === 'no-data' ? <p className="mid line">No qualifying sets in the last 90 days (standard: {standing.standardName}).</p>
          : (
            <div className="card std-row">
              <div className="spread">
                <span className="heading">{standing.standardName}</span>
                <LevelWord rating={standing} />
              </div>
              <StandardSummary rating={standing} />
              <p className="mid line"><ValueText text={levelTableText(standing, ctx.bodyweightKg)} /></p>
              {standing.note && <p className="mid line">Note: {standing.note}.</p>}
            </div>
          )}
        <p className="mid line">{STANDARDS_CAVEAT}</p>
      </section>

      {key && (
        <details className="std-opl" open={pop !== 'gym'} aria-label="Benchmark">
          <summary>vs competitive powerlifters</summary>
          <div className="stack">
            {bench === undefined ? <p className="mid line">Loading…</p>
              : bench === null ? <p className="mid line">Benchmarks could not be loaded.</p>
              : missingForBenchmark(benchIn) ? <p className="mid line">{missingForBenchmark(benchIn)}</p>
              : pctNow && st.best90 !== null ? (
                <>
                  <div className="pct-strip" role="img" aria-label={benchLine(key, st.best90, pctNow)}>
                    <span className="tick50" />
                    <span className="mark" style={{ left: `calc(${pctNumber(pctNow.percentile)}% - 1px)` }} />
                  </div>
                  <p className="line">{benchLine(key, st.best90, pctNow)}</p>
                  {pctThen && <p className="mid line">90 days ago: {pctText(pctThen.percentile)} → now {pctText(pctNow.percentile)}.</p>}
                  <p className="mid line">{BENCH_CAVEAT}</p>
                </>
              ) : <p className="mid line">No recent sets to place.</p>}
          </div>
        </details>
      )}

      <section className="stack" aria-label="History">
        <span className="label">History</span>
        <ul className="plain history-list">
          {st.days.slice(0, 30).map(d => (
            <li key={d.sessionId}>
              <a href={`#/history/${d.sessionId}`}>
                <span className="mono num-sm mid">{formatDate(d.date)}</span> · <span className="mid">{d.name}</span>
                <p className="mono num-sm line">{setsLine(d.sets, scale)}</p>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
