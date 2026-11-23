// Progress (spec §3.2, §3.6, §4) in Ink & Dither: a glyph heatmap since the
// first session, terminal-style stats, gym-goer levels as dither bars, a fun
// tonnage line, then the goal board, benchmarks and the lift list.
import { pickTip } from '../app/tips';
import { ScreenTip, useTipsSeen } from '../app/parts/ScreenTip';
import type { ISODate } from '../domain/types';
import { getActiveProgram, getProfile, listExercises, listSessions } from '../db';
import { addDays } from '../engine';
import { kg } from '../app/coach';
import { DemoBanner } from '../app/DemoBanner';
import { formatDate, todayISO, weekdayLong } from '../app/dates';
import { t, tn, tr } from '../i18n';
import { SUBJECT_BODYWEIGHT, feasibilityWord } from '../app/labels';
import { useLive } from '../ui/useLive';
import { DitherBar, InfoButton, LabelValueGrid, Lockup, Verdict, type VerdictKind } from '../ui/kit';
import { useScrollTop } from '../ui/session/useNow';
import { goalRows, latestBodyweight, liftStats, trendOf, type LiftStats, type Trend } from '../ui/progress/data';
import { rateExercise, type LiftRating } from '../benchmarks/liftRating';
import { DataCredit } from '../ui/progress/DataCredit';
import { contextText, missingForStandards, missingText, sourceMeta, standardsCaveat, standardsContext, useGymStandards } from '../ui/progress/standards';
import { LevelBar, ValueText } from '../ui/progress/StandardLadder';
import { SecHead } from '../ui/progress/parts';
import { funComparison, funLine, pluralLift, tonnage, trainingStats } from '../ui/progress/stats';
import { Sparkline } from '../ui/progress/Sparkline';
import { flagRank, flagText, liftFlag, type LiftFlag } from '../ui/progress/liftFlags';

const BENCH_LIFTS = ['squat', 'bench', 'deadlift'] as const;
const FEAS_KIND: Record<string, VerdictKind> = { comfortable: 'beat', ambitious: 'hit', unlikely: 'missed' };
const short = (d: ISODate, today: ISODate) => formatDate(d, { weekday: false, year: d.slice(0, 4) !== today.slice(0, 4) });

export function Progress(_props: { params: string[] }) {
  const gym = useGymStandards();
  useScrollTop('progress');
  const data = useLive(async db => {
    const today = todayISO();
    const [profile, sessions, sets, bw, exercises, program] = await Promise.all([
      getProfile(db), listSessions(db, { to: today }), db.sets.toArray(), latestBodyweight(db, today), listExercises(db, { includeArchived: true }), getActiveProgram(db),
    ]);
    const byId = new Map(exercises.map(e => [e.id, e]));
    const stats = trainingStats(sessions, sets);
    // Heatmap: working sets per date; tap a day → its first session.
    // Lifts trained in the last 90 days, most sets first.
    const since90 = addDays(today, -90);
    const recent = new Map<string, number>();
    for (const s of sets) if (s.kind !== 'warmup' && s.date >= since90 && s.date <= today) recent.set(s.exerciseId, (recent.get(s.exerciseId) ?? 0) + 1);
    const cache = new Map<string, LiftStats>();
    const statsOf = async (id: string) => { if (!cache.has(id)) cache.set(id, await liftStats(db, byId.get(id)!, today, bw)); return cache.get(id)!; };
    const lifts: LiftStats[] = [];
    for (const [id] of [...recent.entries()].sort((a, b) => b[1] - a[1])) if (byId.has(id)) lifts.push(await statsOf(id));
    // The lift list: "your lifts" (a Goal Board target, or a program lift trained in 90 days) first,
    // the ones that need a look on top with a flag saying why; then everything else.
    const mine = new Set<string>();
    if (sessions.length) {
      for (const tg of profile?.targets ?? []) if (byId.has(tg.subject)) mine.add(tg.subject);
      // Program lifts count only once you train them: a template can list lifts you never do.
      for (const ps of program?.sessions ?? []) if (program!.rotation.includes(ps.key)) for (const sl of ps.slots) if (recent.has(sl.exerciseId)) mine.add(sl.exerciseId);
    }
    const yours: { l: LiftStats; flag: LiftFlag | null }[] = [];
    for (const id of mine) {
      const l = await statsOf(id);
      yours.push({ l, flag: liftFlag(l.series.map(p => ({ date: p.date, e1rm: p.e1rm })), l.history.map(h => h.date), today) });
    }
    yours.sort((a, b) => flagRank(a.flag) - flagRank(b.flag) || (recent.get(b.l.exercise.id) ?? 0) - (recent.get(a.l.exercise.id) ?? 0));
    const others = lifts.filter(l => !mine.has(l.exercise.id));
    // Fun line: squat tonnage since the first session (else the favourite lift's).
    const squats = exercises.filter(e => e.benchmarkKey === 'squat' && !(e.bodyweightFactor > 0));
    let funIds = new Set(squats.map(e => e.id)), funWord = t('squats');
    if (!tonnage(sets, funIds) && stats.favourite) { funIds = new Set([stats.favourite.exerciseId]); funWord = pluralLift(byId.get(stats.favourite.exerciseId)?.name ?? t('lift')); }
    const fun = funComparison(tonnage(sets, funIds));
    const goals = profile ? await goalRows(db, profile, today) : [];
    return { today, profile, bw, stats, lifts, yours, others, goals, fun, funWord, favName: stats.favourite ? byId.get(stats.favourite.exerciseId)?.name : undefined,
      finished: sessions.filter(s => s.sealed).length };
  }, []);
  const tipsSeen = useTipsSeen();

  if (!data) return <section className="screen" aria-busy="true" />;
  const { today, profile, bw, stats, lifts, yours, others, goals, fun, funWord, favName } = data;
  const benchIn = { profile, bodyweightKg: bw, year: Number(today.slice(0, 4)) };
  const stdMissing = missingForStandards(benchIn);
  const ctx = standardsContext(benchIn);
  const rated: { l: LiftStats; r: LiftRating }[] = [];
  const noStandard: string[] = [];
  const notRated: string[] = [];
  if (gym && ctx) {
    for (const l of lifts) {
      const st = rateExercise(gym, l.exercise, l.history, today, ctx);
      if (st.kind === 'rated') rated.push({ l, r: st });
      else if (st.kind === 'none') noStandard.push(l.exercise.name);
      else notRated.push(l.exercise.name);
    }
  }
  // The summary shows four: the big three first, then the most-trained lifts.
  const rank = (l: LiftStats) => { const i = (BENCH_LIFTS as readonly string[]).indexOf(l.exercise.benchmarkKey ?? ''); return i < 0 ? 3 : i; };
  const ordered = rated.map((x, i) => ({ ...x, i })).sort((a, b) => rank(a.l) - rank(b.l) || a.i - b.i);
  const topRated = ordered.slice(0, 4), moreRated = ordered.slice(4);
  const first = stats.first, last = stats.last;

  return (
    <section className="screen tk-screen">
      <DemoBanner />
      <Lockup mid={first ? t('Progress // Since {date}', { date: short(first, today) }) : t('Progress')} />

      {stats.sessions === 0 && <p className="tk-quiet">{t('Nothing logged yet. Sessions you log or import show up here.')}</p>}

      <section className="tk-sec" aria-label={t('Goal board')}>
        <SecHead title={t('Goal board')} meta={goals.length ? goals.length === 1 ? t('{n} target', { n: 1 }) : t('{n} targets', { n: goals.length }) : undefined} />
        {!goals.length && <p className="tk-quiet">{tr('No targets yet. {link}.', { link: <a className="tk-link" href="#/profile">{t('Set them on Profile')}</a> })}</p>}
        {goals.map(g => {
          const verb = g.target.type === 'hold' ? t('Hold') : g.target.type === 'at_least' ? t('At least') : t('Reach');
          const unit = g.target.subject === 'sessions_per_week' ? t('/wk') : ' kg';
          const frac = g.current !== null && g.target.subject !== SUBJECT_BODYWEIGHT && g.target.value > 0 ? g.current / g.target.value : null;
          return (
            <article key={g.target.id} className="tk-goal">
              <div className="tk-goal-head">
                <div>
                  <h3 className="heading">{g.name}</h3>
                  <p className="tk-goal-sub">{tr('{verb} {value} by {date}', { verb, value: <b className="tnum">{kg(g.target.value)}{unit}</b>, date: formatDate(g.target.deadline, { weekday: false }) })}</p>
                </div>
                {g.pace && <Verdict kind={FEAS_KIND[g.pace.feasibility] ?? 'new'}>{feasibilityWord(g.pace.feasibility)}</Verdict>}
              </div>
              {frac !== null
                ? <DitherBar value={frac} label={t('Now {evidence}', { evidence: g.evidence })} valueText={`${Math.round(frac * 100)}%`} />
                : <p className="tk-mono">{t('Now {evidence}', { evidence: g.evidence })}</p>}
              {g.paceLine && <p className="tk-mono mid">{g.pace?.assumedFlat ? t('{line}, no trend yet, assumed flat', { line: g.paceLine }) : g.paceLine}</p>}
            </article>
          );
        })}
      </section>

      <section className="tk-sec" aria-label={t('Benchmarks')}>
        <SecHead title={t('Benchmarks')} meta={sourceMeta(rated.map(x => x.r))} right={<InfoButton label={t('About levels')}><p>{standardsCaveat()}</p>{gym && <><p>{tn(gym.meta.licenceNote)}</p><DataCredit meta={gym.meta} /></>}</InfoButton>} />
        {gym === undefined && <p className="tk-quiet">{t('Loading…')}</p>}
        {gym === null && <p className="tk-quiet">{t('Strength standards could not be loaded.')}</p>}
        {gym && !ctx && (
          <p className="tk-quiet">{tr('Add {missing} on {profile} to see your level for each lift.', { missing: missingText(stdMissing), profile: <a className="tk-link" href="#/profile">{t('Profile')}</a> })}</p>
        )}
        {gym && ctx && (
          <>
            <p className="tk-quiet">{tr('Levels for {context}, from each lift’s best e1RM in the last 90 days.', { context: <ValueText text={contextText(ctx)} /> })}</p>
            {topRated.length > 0 && (
              <div className="tk-bars">{topRated.map(({ l, r }) => <RatedBar key={l.exercise.id} l={l} r={r} label={tn(l.exercise.name)} />)}</div>
            )}
            {moreRated.length > 0 && (
              <details className="tk-more">
                <summary>{moreRated.length === 1 ? t('{n} more lift', { n: 1 }) : t('{n} more lifts', { n: moreRated.length })}</summary>
                <div className="tk-bars">{moreRated.map(({ l, r }) => <RatedBar key={l.exercise.id} l={l} r={r} label={tn(l.exercise.name)} />)}</div>
              </details>
            )}
            {!rated.length && <p className="tk-quiet">{t('No lift with a standard logged in the last 90 days.')}</p>}
            {notRated.length > 0 && <p className="tk-quiet">{t('Not rated (no qualifying sets in 90 days): {list}.', { list: notRated.map(tn).join(t(', ')) })}</p>}
            {noStandard.length > 0 && <p className="tk-quiet">{t('No standard: {list}.', { list: noStandard.map(tn).join(t(', ')) })}</p>}
            <DataCredit meta={gym.meta} />
          </>
        )}
      </section>

      <section className="tk-sec" aria-label={t('Lifts')}>
        <SecHead title={t('Lifts (90 days)')} meta={t('e1RM and trend')} />
        {!lifts.length && !yours.length && <p className="tk-quiet">{t('Nothing logged in the last 90 days.')}</p>}
        {yours.length > 0 && <>
          <div className="tk-sub-hd">{t('Your lifts')}</div>
          <ul className="tk-rows">{yours.map(({ l, flag }) => <li key={l.exercise.id}><LiftRow l={l} flag={flag} /></li>)}</ul>
        </>}
        {others.length > 0 && <>
          {yours.length > 0 && <div className="tk-sub-hd">{t('Other lifts')}</div>}
          <ul className="tk-rows">{others.map(l => <li key={l.exercise.id}><LiftRow l={l} quiet={yours.length > 0} /></li>)}</ul>
        </>}
        <ScreenTip id="progress" shown={pickTip({ progress: data.finished >= 2 && lifts.length > 0 }, tipsSeen)} />
      </section>

      {stats.sessions > 0 && (
        <section className="tk-sec" aria-label={t('Training summary')}>
          <SecHead title={t('Training summary')} />
          <LabelValueGrid variant="stats" className="tk-stats" items={[
            { label: t('Favourite lift:'), value: favName ? tn(favName) : '—' },
            { label: t('Sessions:'), value: stats.sessions.toLocaleString('en-GB') },
            { label: t('Sets logged:'), value: stats.sets.toLocaleString('en-GB') },
            { label: t('Sets per session:'), value: stats.setsPerSession !== null ? kg(stats.setsPerSession) : '—' },
            { label: t('Busiest day:'), value: stats.busiestDay !== null ? weekdayLong(stats.busiestDay) : '—' },
            { label: t('Longest break:'), value: stats.longestBreak !== null ? stats.longestBreak === 1 ? t('{n} day', { n: 1 }) : t('{n} days', { n: stats.longestBreak }) : '—' },
          ]} />
          {fun && first && <p className="tk-fun">{funLine(funWord, short(first, today), fun)}</p>}
          {first && last && <p className="tk-since">{stats.sessions === 1
            ? t('Stats from {n} session, {from} to {to}', { n: 1, from: short(first, today), to: short(last, today) })
            : t('Stats from {n} sessions, {from} to {to}', { n: stats.sessions, from: short(first, today), to: short(last, today) })}</p>}
        </section>
      )}
    </section>
  );
}

function RatedBar({ l, r, label }: { l: LiftStats; r: LiftRating; label: string }) {
  return (
    <a className="tk-barlink" data-press="dim" href={`#/lift/${encodeURIComponent(l.exercise.id)}`}>
      <LevelBar rating={r} label={label} />
    </a>
  );
}

function trendLabel(x: Trend): string {
  return x === 'up' ? t('trend up') : x === 'down' ? t('trend down') : x === 'flat' ? t('trend flat') : t('trend not enough data');
}

/** One row of the lift list: name (and a flag when it needs a look), best e1RM in 90 days, the trend. */
function LiftRow({ l, flag = null, quiet = false }: { l: LiftStats; flag?: LiftFlag | null; quiet?: boolean }) {
  const trend = trendOf(l.rate);
  const trail = l.series.slice(-12).map(p => p.e1rm);
  return (
    <a className={`tk-lift${quiet ? ' quiet' : ''}`} data-press="row" href={`#/lift/${encodeURIComponent(l.exercise.id)}`}>
      <span className="tk-lift-name">{tn(l.exercise.name)}{flag && <span className="tk-flag">{flagText(flag)}</span>}</span>
      <span className="tk-lift-v">{l.best90 !== null ? <>{kg(Math.round(l.best90 * 2) / 2)}<small>{l.exercise.bodyweightFactor > 0 ? t(' kg incl. BW') : ' kg'}</small></> : '—'}</span>
      <span className="tk-trend">{trail.length > 1 ? <Sparkline values={trail} label={trendLabel(trend)} /> : <span aria-hidden="true" className="mid">·</span>}</span>
    </a>
  );
}
