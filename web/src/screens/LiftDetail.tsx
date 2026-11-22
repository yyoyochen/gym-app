// Lift page (#/lift/<id>; spec §3.2) in Ink & Dither: large-title navbar, the
// best e1RM as the hero, an ink line chart (e1RM / top set / weekly volume),
// verdicts, PRs, the gym-goer level, the optional powerlifter comparison and
// the lift's history as spec-sheet rows.
import { useState } from 'react';
import { getExercise, getProfile } from '../db';
import { addDays, bestRecentE1rm } from '../engine';
import { kg } from '../app/coach';
import { displayName } from '../app/labels';
import { formatDate, todayISO } from '../app/dates';
import { useLive } from '../ui/useLive';
import { BigNumber, DitherBar, LabelValueGrid, Legend, NavBar, PixelIcon, Segmented } from '../ui/kit';
import { latestBodyweight, liftPRs, liftStats, liftVerdicts, trendOf } from '../ui/progress/data';
import { BENCH_CAVEAT, benchLine, benchPercentile, missingForBenchmark, pctNumber, pctText, useBenchmarks } from '../ui/progress/benchmarks';
import { LiftChart, type LinePoint } from '../ui/progress/LiftChart';
import { liftChartTargets } from '../ui/progress/chartTargets';
import { SetCells, SetCellsKey } from '../ui/progress/SetCells';
import { Sparkline } from '../ui/progress/Sparkline';
import { anyDecimals } from '../ui/progress/cellRules';
import { Load } from '../ui/progress/Load';
import { stepRuns } from '../ui/progress/chartModel';
import { useScrollTop } from '../ui/session/useNow';
import { rateExercise } from '../benchmarks/liftRating';
import { STANDARDS_CAVEAT, confidenceWord, sourceMeta, levelTableText, missingForStandards, nextText, ratedValueText, standardsContext, useGymStandards } from '../ui/progress/standards';
import { ConfidenceBadge, LevelBar, ValueText } from '../ui/progress/StandardLadder';
import { SecHead } from '../ui/progress/parts';
import { prFlags, weeklyVolume } from '../ui/progress/stats';

type Metric = 'e1rm' | 'top' | 'volume';
const METRICS: { value: Metric; label: string }[] = [{ value: 'e1rm', label: 'e1RM' }, { value: 'top', label: 'Top set' }, { value: 'volume', label: 'Weekly vol' }];
const half = (x: number) => kg(Math.round(x * 2) / 2);
const VERDICT_WORD = { beat: 'Beat', hit: 'Hit', missed: 'Missed', new: 'New' } as const;

export function LiftDetail({ params }: { params: string[] }) {
  const id = params[0];
  const bench = useBenchmarks();
  const gym = useGymStandards();
  const [metric, setMetric] = useState<Metric>('e1rm');
  useScrollTop(id);
  const data = useLive(async db => {
    const today = todayISO();
    const ex = await getExercise(db, id);
    if (!ex) return null;
    const [profile, bw] = await Promise.all([getProfile(db), latestBodyweight(db, today)]);
    const st = await liftStats(db, ex, today, bw);
    const verdicts = await liftVerdicts(db, st);
    return { today, ex, profile, bw, st, verdicts, prs: liftPRs(st) };
  }, [id]);

  if (data === undefined) return <section className="screen tk-screen tk-nav" aria-busy="true"><NavBar title="" backLabel="Progress" fallback="progress" large={false} /></section>;
  if (data === null) return (
    <section className="screen tk-screen tk-nav">
      <NavBar title="Unknown lift" backLabel="Progress" fallback="progress" />
      <p className="tk-quiet">This lift doesn’t exist any more.</p>
    </section>
  );
  const { today, ex, profile, bw, st, verdicts, prs } = data;
  const prE = prFlags(st.series.map(p => p.e1rm));
  const prT = prFlags(st.series.map(p => p.top_weight));
  const points: LinePoint[] = metric === 'e1rm' ? st.series.map((p, i) => ({ date: p.date, value: p.e1rm, pr: prE[i] }))
    : metric === 'top' ? st.series.map((p, i) => ({ date: p.date, value: p.top_weight, pr: prT[i] }))
    : weeklyVolume(st.history);
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
  const vCount = { beat: 0, hit: 0, missed: 0, new: 0 };
  for (const v of verdicts) vCount[v.verdict]++;
  const shown = st.days.slice(0, 30);
  const decimals = anyDecimals(shown.flatMap(d => d.sets));
  const chartTargets = liftChartTargets({ metric, next: standing?.kind === 'rated' ? standing.next : null, loadType: standing?.kind === 'rated' ? standing.loadType : undefined, goals: profile?.targets ?? [], subject: ex.id });
  const hasHold = metric !== 'volume' && stepRuns(points).some(r => r.dotted);
  const chartLabel = `${ex.name} ${METRICS.find(m => m.value === metric)!.label} over ${points.length} ${metric === 'volume' ? 'weeks' : 'sessions'}`;

  return (
    <section className="screen tk-screen tk-nav">
      <NavBar title={ex.name} backLabel="Progress" fallback="progress" />

      <section className="tk-block" aria-label="Best e1RM">
        <span className="label tk-herolabel">Best e1RM (90 days)</span>
        {st.best90 !== null
          ? <BigNumber size="display" value={half(st.best90)} unit="kg" caption={`${st.days.length} session${st.days.length === 1 ? '' : 's'}`}
              label={`Best e1RM in 90 days: ${half(st.best90)} kg`} />
          : <p className="tk-quiet">No sets in the last 90 days{st.days.length ? '' : ', or ever'}.</p>}
        <LabelValueGrid variant="stats" items={[
          { label: 'Trend:', value: st.rate === null ? 'not enough data' : `${st.rate >= 0 ? '+' : '−'}${kg(Math.abs(Math.round(st.rate * 10) / 10))} kg/wk${tr === 'flat' ? ', flat' : ''}` },
          ...(st.days.length ? [{ label: 'Last:', value: formatDate(st.days[0].date, { weekday: false }) }] : []),
        ]} />
      </section>

      <section className="tk-sec" aria-label="Chart">
        <Segmented<Metric> label="Chart" options={METRICS} value={metric} onChange={setMetric} />
        <LiftChart points={points} label={chartLabel} kind={metric === 'volume' ? 'bars' : 'step'} targets={chartTargets} current={st.best90 === null ? null : Math.round(st.best90 * 2) / 2} />
        {points.length > 1 && <Legend className="tk-legend">
          <i className="tk-sw line" />{metric === 'volume' ? 'kg × reps per week' : metric === 'top' ? 'heaviest set' : 'Epley e1RM'}
          {metric !== 'volume' && <><i className="tk-sw pr" />PR</>}
          {chartTargets.length > 0 && <><i className="tk-sw target" />target</>}
          {metric !== 'volume' && <><i className="tk-sw last" />latest</>}
          {hasHold && <><i className="tk-sw hold" />no sessions</>}
        </Legend>}
      </section>

      <section className="tk-sec" aria-label="Verdicts">
        <SecHead title="Verdicts" meta={verdicts.length ? `${verdicts.length} graded` : undefined} />
        {verdicts.length ? (
          <>
            <div className="tk-vstrip" role="img" aria-label={`Beat ${vCount.beat}, hit ${vCount.hit}, missed ${vCount.missed}`}>
              {verdicts.map(v => <i key={v.sessionId} className={v.verdict} title={`${v.date}: ${v.verdict} — ${v.detail}`} />)}
            </div>
            <p className="tk-mono mid">{(['beat', 'hit', 'missed', 'new'] as const).filter(k => vCount[k]).map(k => `${VERDICT_WORD[k]} ${vCount[k]}`).join(', ')}</p>
          </>
        ) : <p className="tk-quiet">No graded sessions yet.</p>}
      </section>

      <section className="tk-sec" aria-label="Records">
        <SecHead title="PRs" />
        <LabelValueGrid items={[
          { label: 'Heaviest single', value: prs.heaviest ? <>{kg(prs.heaviest.weight)} kg<span className="tk-date">{formatDate(prs.heaviest.date, { weekday: false })}</span></> : '—' },
          { label: 'Best e1RM', value: bestE ? <>{half(bestE.v)} kg<span className="tk-date">{formatDate(bestE.date, { weekday: false })}</span></> : '—' },
        ]} />
        {prs.repMaxes.length > 0 && (
          <div className="tk-sheet">
            <div className="tk-sheet-hd"><span>Best weight at reps</span><span>kg</span></div>
            {prs.repMaxes.map(r => (
              <div key={r.reps} className="tk-rm">
                <span className="k">{r.reps}RM</span>
                <span className="d">{formatDate(r.date, { weekday: false })}</span>
                <span className="v"><Load weight={r.weight} bodyweightFactor={ex.bodyweightFactor} decimals={anyDecimals(prs.repMaxes)} /></span>
                <Sparkline values={r.trail} label={`${r.reps} rep best over time, now ${kg(r.weight)} kg`} w={80} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="tk-sec" aria-label="Level">
        <SecHead title="Level" meta={standing?.kind === 'rated' ? sourceMeta([standing]) : 'vs gym-goers'} />
        {gym === undefined ? <p className="tk-quiet">Loading…</p>
          : gym === null ? <p className="tk-quiet">Strength standards could not be loaded.</p>
          : !ctx ? <p className="tk-quiet">Add {missingForStandards(benchIn).join(' and ')} on <a className="tk-link" href="#/profile">Profile</a> to see your level.</p>
          : !standing || standing.kind === 'none' ? <p className="tk-quiet">No strength standard for this lift.</p>
          : standing.kind === 'no-data' ? <p className="tk-quiet">No qualifying sets in the last 90 days (standard: {standing.standardName}).</p>
          : (
            <>
              <LevelBar rating={standing} label={standing.standardName} />
              <p className="tk-fun">{standing.next ? <>Next level: <ValueText text={nextText(standing.next, standing.loadType === 'dumbbell_each')} /></> : 'Top level'}</p>
              <LabelValueGrid variant="stats" items={[
                { label: 'Rated on:', value: ratedValueText(standing) },
                { label: 'Confidence:', value: <>{standing.source === 'model' && <><ConfidenceBadge confidence={standing.confidence} /> </>}{confidenceWord(standing)}</> },
              ]} />
              <p className="tk-quiet"><ValueText text={levelTableText(standing, ctx.bodyweightKg)} /></p>
              {standing.note && <p className="tk-quiet">Note: {standing.note}.</p>}
            </>
          )}
        <details className="tk-more">
          <summary>About these levels</summary>
          <p className="tk-quiet">{STANDARDS_CAVEAT}</p>
        </details>
        {key && (
          <details className="tk-more" open={pop !== 'gym'}>
            <summary>vs competitive powerlifters</summary>
            {bench === undefined ? <p className="tk-quiet">Loading…</p>
              : bench === null ? <p className="tk-quiet">Benchmarks could not be loaded.</p>
              : missingForBenchmark(benchIn) ? <p className="tk-quiet">{missingForBenchmark(benchIn)}</p>
              : pctNow && st.best90 !== null ? (
                <>
                  <DitherBar value={pctNumber(pctNow.percentile) / 100} label={`${half(st.best90)} kg e1RM`} valueText={pctText(pctNow.percentile).replace(' percentile', '')} />
                  <p className="tk-quiet">{benchLine(key, st.best90, pctNow)}</p>
                  {pctThen && <p className="tk-quiet">90 days ago: {pctText(pctThen.percentile)} → now {pctText(pctNow.percentile)}.</p>}
                  <p className="tk-quiet">{BENCH_CAVEAT}</p>
                </>
              ) : <p className="tk-quiet">No recent sets to place.</p>}
          </details>
        )}
      </section>

      <section className="tk-sec" aria-label="History">
        <SecHead title="History" meta={st.days.length > 30 ? `latest 30 of ${st.days.length}` : `${st.days.length} session${st.days.length === 1 ? '' : 's'}`} />
        <ul className="tk-rows">
          {shown.map(d => (
            <li key={d.sessionId}>
              <a className="tk-hrow cells" data-press="row" href={`#/history/${encodeURIComponent(d.sessionId)}`}>
                <span className="tk-hrow-k"><span>{formatDate(d.date, { weekday: false, year: false })}</span><span className="mid">{displayName(d.name)}</span></span>
                <SetCells sets={d.sets} bodyweightFactor={ex.bodyweightFactor} decimals={decimals} />
                <PixelIcon name="chevron" scale={1} />
              </a>
            </li>
          ))}
        </ul>
        {shown.length > 0 && <Legend className="tk-legend"><SetCellsKey /></Legend>}
      </section>
    </section>
  );
}
