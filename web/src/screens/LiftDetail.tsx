// Lift page (#/lift/<id>; spec §3.2) in Ink & Dither: large-title navbar, the
// best e1RM as the hero, an ink line chart (e1RM / top set / weekly volume),
// verdicts, PRs, the gym-goer level, the optional powerlifter comparison and
// the lift's history as spec-sheet rows.
import { useState } from 'react';
import { getExercise, getProfile } from '../db';
import { kg } from '../app/coach';
import { displayName } from '../app/labels';
import { formatDate, todayISO } from '../app/dates';
import { t, te, tn, tr } from '../i18n';
import { useLive } from '../ui/useLive';
import { BigNumber, InfoButton, LabelValueGrid, Legend, NavBar, PixelIcon, Segmented } from '../ui/kit';
import { latestBodyweight, liftPRs, liftStats, liftVerdicts, trendOf } from '../ui/progress/data';
import { LiftChart, type LinePoint } from '../ui/progress/LiftChart';
import { liftChartTargets } from '../ui/progress/chartTargets';
import { SetCells, SetCellsKey } from '../ui/progress/SetCells';
import { Sparkline } from '../ui/progress/Sparkline';
import { anyDecimals } from '../ui/progress/cellRules';
import { Load } from '../ui/progress/Load';
import { stepRuns } from '../ui/progress/chartModel';
import { useScrollTop } from '../ui/session/useNow';
import { rateExercise } from '../benchmarks/liftRating';
import { DataCredit } from '../ui/progress/DataCredit';
import { confidenceWord, sourceMeta, levelTableText, missingForStandards, missingText, nextText, ratedValueText, standardsCaveat, standardsContext, useGymStandards } from '../ui/progress/standards';
import { ConfidenceBadge, LevelBar, ValueText } from '../ui/progress/StandardLadder';
import { SecHead } from '../ui/progress/parts';
import { prFlags, weeklyVolume } from '../ui/progress/stats';

type Metric = 'e1rm' | 'top' | 'volume';
const metrics = (): { value: Metric; label: string }[] => [{ value: 'e1rm', label: 'e1RM' }, { value: 'top', label: t('Top set') }, { value: 'volume', label: t('Weekly vol') }];
const half = (x: number) => kg(Math.round(x * 2) / 2);
type VerdictKey = 'beat' | 'hit' | 'missed' | 'new';
const verdictWord = (k: VerdictKey) => (k === 'beat' ? t('Beat') : k === 'hit' ? t('Hit') : k === 'missed' ? t('Missed') : t('New'));
/** The verdict as the tooltip writes it, lower case: "beat". */
const verdictLower = (k: VerdictKey) => (k === 'beat' ? t('beat') : k === 'hit' ? t('hit') : k === 'missed' ? t('missed') : t('new'));
/** A stored session name for display; "(minimum)" is the app's own suffix. */
const sessionName = (name: string) => {
  const n = displayName(name);
  return n.endsWith(' (minimum)') ? t('{name} (minimum)', { name: tn(n.slice(0, -' (minimum)'.length)) }) : tn(n);
};

export function LiftDetail({ params }: { params: string[] }) {
  const id = params[0];
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

  if (data === undefined) return <section className="screen tk-screen tk-nav" aria-busy="true"><NavBar title="" backLabel={t('Progress')} fallback="progress" large={false} /></section>;
  if (data === null) return (
    <section className="screen tk-screen tk-nav">
      <NavBar title={t('Unknown lift')} backLabel={t('Progress')} fallback="progress" />
      <p className="tk-quiet">{t('This lift doesn’t exist any more.')}</p>
    </section>
  );
  const { today, ex, profile, bw, st, verdicts, prs } = data;
  const prE = prFlags(st.series.map(p => p.e1rm));
  const prT = prFlags(st.series.map(p => p.top_weight));
  const points: LinePoint[] = metric === 'e1rm' ? st.series.map((p, i) => ({ date: p.date, value: p.e1rm, pr: prE[i] }))
    : metric === 'top' ? st.series.map((p, i) => ({ date: p.date, value: p.top_weight, pr: prT[i] }))
    : weeklyVolume(st.history);
  const bestE = st.series.reduce<{ v: number; date: string } | null>((a, p) => (!a || p.e1rm > a.v ? { v: p.e1rm, date: p.date } : a), null);
  const trend = trendOf(st.rate);
  const benchIn = { profile, bodyweightKg: bw, year: Number(today.slice(0, 4)) };
  const ctx = standardsContext(benchIn);
  const standing = gym && ctx ? rateExercise(gym, ex, st.history, today, ctx) : null;
  const vCount = { beat: 0, hit: 0, missed: 0, new: 0 };
  for (const v of verdicts) vCount[v.verdict]++;
  const shown = st.days.slice(0, 30);
  const decimals = anyDecimals(shown.flatMap(d => d.sets));
  const chartTargets = liftChartTargets({ metric, next: standing?.kind === 'rated' ? standing.next : null, loadType: standing?.kind === 'rated' ? standing.loadType : undefined, goals: profile?.targets ?? [], subject: ex.id });
  const hasHold = metric !== 'volume' && stepRuns(points).some(r => r.dotted);
  const METRICS = metrics();
  const lift = tn(ex.name);
  const metricLabel = METRICS.find(m => m.value === metric)!.label;
  const chartLabel = metric === 'volume'
    ? t('{lift} {metric} over {n} weeks', { lift, metric: metricLabel, n: points.length })
    : t('{lift} {metric} over {n} sessions', { lift, metric: metricLabel, n: points.length });
  const sessionsText = st.days.length === 1 ? t('{n} session', { n: 1 }) : t('{n} sessions', { n: st.days.length });

  return (
    <section className="screen tk-screen tk-nav">
      <NavBar title={lift} backLabel={t('Progress')} fallback="progress" />

      <section className="tk-block" aria-label={t('Best e1RM')}>
        <span className="label tk-herolabel">{t('Best e1RM (90 days)')}</span>
        {st.best90 !== null
          ? <BigNumber size="display" value={half(st.best90)} unit="kg" caption={sessionsText}
              label={t('Best e1RM in 90 days: {kg} kg', { kg: half(st.best90) })} />
          : <p className="tk-quiet">{st.days.length ? t('No sets in the last 90 days.') : t('No sets in the last 90 days, or ever.')}</p>}
        <LabelValueGrid variant="stats" items={[
          { label: t('Trend:'), value: st.rate === null ? t('not enough data') : trendValue(st.rate, trend === 'flat') },
          ...(st.days.length ? [{ label: t('Last:'), value: formatDate(st.days[0].date, { weekday: false }) }] : []),
        ]} />
      </section>

      <section className="tk-sec" aria-label={t('Chart')}>
        <Segmented<Metric> label={t('Chart')} options={METRICS} value={metric} onChange={setMetric} />
        {points.length > 1 && <Legend className="tk-legend">
          <i className="tk-sw line" />{metric === 'volume' ? t('kg × reps per week') : metric === 'top' ? t('heaviest set') : t('Epley e1RM')}
          {metric !== 'volume' && <><i className="tk-sw pr" />PR</>}
          {metric !== 'volume' && <><i className="tk-sw last" />{t('latest')}</>}
          {hasHold && <><i className="tk-sw hold" />{t('no sessions')}</>}
        </Legend>}
        <LiftChart points={points} label={chartLabel} kind={metric === 'volume' ? 'bars' : 'step'} targets={chartTargets} current={st.best90 === null ? null : Math.round(st.best90 * 2) / 2} />
      </section>

      <section className="tk-sec" aria-label={t('Verdicts')}>
        <SecHead title={t('Verdicts')} meta={verdicts.length ? t('{n} graded', { n: verdicts.length }) : undefined} />
        {verdicts.length ? (
          <>
            <div className="tk-vstrip" role="img" aria-label={t('Beat {beat}, hit {hit}, missed {missed}', { beat: vCount.beat, hit: vCount.hit, missed: vCount.missed })}>
              {verdicts.map(v => <i key={v.sessionId} className={v.verdict} title={t('{date}: {verdict} — {detail}', { date: v.date, verdict: verdictLower(v.verdict), detail: te(v.detail) })} />)}
            </div>
            <p className="tk-mono mid">{(['beat', 'hit', 'missed', 'new'] as const).filter(k => vCount[k]).map(k => `${verdictWord(k)} ${vCount[k]}`).join(t(', '))}</p>
          </>
        ) : <p className="tk-quiet">{t('No graded sessions yet.')}</p>}
      </section>

      <section className="tk-sec" aria-label={t('Records')}>
        <SecHead title={t('PRs')} />
        <LabelValueGrid items={[
          { label: t('Heaviest single'), value: prs.heaviest ? <>{kg(prs.heaviest.weight)} kg<span className="tk-date">{formatDate(prs.heaviest.date, { weekday: false })}</span></> : '—' },
          { label: t('Best e1RM'), value: bestE ? <>{half(bestE.v)} kg<span className="tk-date">{formatDate(bestE.date, { weekday: false })}</span></> : '—' },
        ]} />
        {prs.repMaxes.length > 0 && (
          <div className="tk-sheet">
            <div className="tk-sheet-hd"><span>{t('Best weight at reps')}</span><span>kg</span></div>
            {prs.repMaxes.map(r => (
              <div key={r.reps} className="tk-rm">
                <span className="k">{`${r.reps}RM`}</span>
                <span className="d">{formatDate(r.date, { weekday: false })}</span>
                <span className="v"><Load weight={r.weight} bodyweightFactor={ex.bodyweightFactor} decimals={anyDecimals(prs.repMaxes)} /></span>
                <Sparkline values={r.trail} label={t('{reps} rep best over time, now {kg} kg', { reps: r.reps, kg: kg(r.weight) })} w={80} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="tk-sec" aria-label={t('Level')}>
        <SecHead title={t('Level')} meta={standing?.kind === 'rated' ? sourceMeta([standing]) : t('vs lifters like you')} right={<InfoButton label={t('About levels')}><p>{standardsCaveat()}</p>{gym && <><p>{tn(gym.meta.licenceNote)}</p><DataCredit meta={gym.meta} /></>}</InfoButton>} />
        {gym === undefined ? <p className="tk-quiet">{t('Loading…')}</p>
          : gym === null ? <p className="tk-quiet">{t('Strength standards could not be loaded.')}</p>
          : !ctx ? <p className="tk-quiet">{tr('Add {missing} on {profile} to see your level.', { missing: missingText(missingForStandards(benchIn)), profile: <a className="tk-link" href="#/profile">{t('Profile')}</a> })}</p>
          : !standing || standing.kind === 'none' ? <p className="tk-quiet">{t('No strength standard for this lift.')}</p>
          : standing.kind === 'no-data' ? <p className="tk-quiet">{t('No qualifying sets in the last 90 days (standard: {name}).', { name: tn(standing.standardName) })}</p>
          : (
            <>
              <LevelBar rating={standing} label={tn(standing.standardName)} />
              <p className="tk-fun">{standing.next ? tr('Next level: {next}', { next: <ValueText text={nextText(standing.next, standing.loadType === 'dumbbell_each')} /> }) : t('Top level')}</p>
              <LabelValueGrid variant="stats" items={[
                { label: t('Rated on:'), value: ratedValueText(standing) },
                { label: t('Confidence:'), value: <>{standing.source === 'model' && <><ConfidenceBadge confidence={standing.confidence} /> </>}{confidenceWord(standing)}</> },
              ]} />
              <p className="tk-quiet"><ValueText text={levelTableText(standing, ctx.bodyweightKg)} /></p>
              {standing.note && <p className="tk-quiet">{t('Note: {note}.', { note: tn(standing.note) })}</p>}
              <DataCredit meta={gym.meta} />
            </>
          )}
      </section>

      <section className="tk-sec" aria-label={t('History')}>
        <SecHead title={t('History')} meta={st.days.length > 30 ? t('latest 30 of {n}', { n: st.days.length }) : sessionsText} />
        {shown.length > 0 && <Legend className="tk-legend tk-legend-top"><SetCellsKey /></Legend>}
        <ul className="tk-rows">
          {shown.map(d => (
            <li key={d.sessionId}>
              <a className="tk-hrow cells" data-press="row" href={`#/history/${encodeURIComponent(d.sessionId)}`}>
                <span className="tk-hrow-k"><span>{formatDate(d.date, { weekday: false, year: false })}</span><span className="mid">{sessionName(d.name)}</span></span>
                <SetCells sets={d.sets} bodyweightFactor={ex.bodyweightFactor} decimals={decimals} />
                <PixelIcon name="chevron" scale={1} />
              </a>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}

/** "+0.4 kg/wk", with ", flat" when the trend reads flat. */
function trendValue(rate: number, flat: boolean): string {
  const v = `${rate >= 0 ? '+' : '−'}${kg(Math.abs(Math.round(rate * 10) / 10))}`;
  return flat ? t('{kg} kg/wk, flat', { kg: v }) : t('{kg} kg/wk', { kg: v });
}
