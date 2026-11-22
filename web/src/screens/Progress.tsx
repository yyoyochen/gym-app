// Progress (spec §3.2, §3.6, §4) in Ink & Dither: a glyph heatmap since the
// first session, terminal-style stats, gym-goer levels as dither bars, a fun
// tonnage line, then the goal board, benchmarks and the lift list.
import { pickTip } from '../app/tips';
import { ScreenTip, useTipsSeen } from '../app/parts/ScreenTip';
import type { ISODate } from '../domain/types';
import { getProfile, listExercises, listSessions } from '../db';
import { addDays } from '../engine';
import { kg } from '../app/coach';
import { DemoBanner } from '../app/DemoBanner';
import { formatDate, todayISO } from '../app/dates';
import { SUBJECT_BODYWEIGHT, feasibilityWord } from '../app/labels';
import { useLive } from '../ui/useLive';
import { DitherBar, InfoButton, LabelValueGrid, Lockup, Verdict, type VerdictKind } from '../ui/kit';
import { useScrollTop } from '../ui/session/useNow';
import { goalRows, latestBodyweight, liftStats, trendOf, type LiftStats } from '../ui/progress/data';
import { rateExercise, type LiftRating } from '../benchmarks/liftRating';
import { STANDARDS_CAVEAT, contextText, missingForStandards, sourceMeta, standardsContext, useGymStandards } from '../ui/progress/standards';
import { LevelBar, ValueText } from '../ui/progress/StandardLadder';
import { SecHead } from '../ui/progress/parts';
import { WEEKDAY_LONG, funComparison, funLine, pluralLift, tonnage, trainingStats } from '../ui/progress/stats';
import { Sparkline } from '../ui/progress/Sparkline';

const BENCH_LIFTS = ['squat', 'bench', 'deadlift'] as const;
const FEAS_KIND: Record<string, VerdictKind> = { comfortable: 'beat', ambitious: 'hit', unlikely: 'missed' };
const short = (d: ISODate, today: ISODate) => formatDate(d, { weekday: false, year: d.slice(0, 4) !== today.slice(0, 4) });

export function Progress(_props: { params: string[] }) {
  const gym = useGymStandards();
  useScrollTop('progress');
  const data = useLive(async db => {
    const today = todayISO();
    const [profile, sessions, sets, bw, exercises] = await Promise.all([
      getProfile(db), listSessions(db, { to: today }), db.sets.toArray(), latestBodyweight(db, today), listExercises(db, { includeArchived: true }),
    ]);
    const byId = new Map(exercises.map(e => [e.id, e]));
    const stats = trainingStats(sessions, sets);
    // Heatmap: working sets per date; tap a day → its first session.
    // Lifts trained in the last 90 days, most sets first.
    const since90 = addDays(today, -90);
    const recent = new Map<string, number>();
    for (const s of sets) if (s.kind !== 'warmup' && s.date >= since90 && s.date <= today) recent.set(s.exerciseId, (recent.get(s.exerciseId) ?? 0) + 1);
    const lifts: LiftStats[] = [];
    for (const [id] of [...recent.entries()].sort((a, b) => b[1] - a[1])) {
      const ex = byId.get(id);
      if (ex) lifts.push(await liftStats(db, ex, today, bw));
    }
    // Fun line: squat tonnage since the first session (else the favourite lift's).
    const squats = exercises.filter(e => e.benchmarkKey === 'squat' && !(e.bodyweightFactor > 0));
    let funIds = new Set(squats.map(e => e.id)), funWord = 'squats';
    if (!tonnage(sets, funIds) && stats.favourite) { funIds = new Set([stats.favourite.exerciseId]); funWord = pluralLift(byId.get(stats.favourite.exerciseId)?.name ?? 'lift'); }
    const fun = funComparison(tonnage(sets, funIds));
    const goals = profile ? await goalRows(db, profile, today) : [];
    return { today, profile, bw, stats, lifts, goals, fun, funWord, favName: stats.favourite ? byId.get(stats.favourite.exerciseId)?.name : undefined,
      finished: sessions.filter(s => s.sealed).length };
  }, []);
  const tipsSeen = useTipsSeen();

  if (!data) return <section className="screen" aria-busy="true" />;
  const { today, profile, bw, stats, lifts, goals, fun, funWord, favName } = data;
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
      <Lockup mid={first ? `Progress //Since ${short(first, today)}` : 'Progress'} />

      {stats.sessions === 0 && <p className="tk-quiet">Nothing logged yet. Sessions you log or import show up here.</p>}

      <section className="tk-sec" aria-label="Goal board">
        <SecHead title="Goal board" meta={goals.length ? `${goals.length} target${goals.length === 1 ? '' : 's'}` : undefined} />
        {!goals.length && <p className="tk-quiet">No targets yet. <a className="tk-link" href="#/profile">Set them on Profile</a>.</p>}
        {goals.map(g => {
          const verb = g.target.type === 'hold' ? 'Hold' : g.target.type === 'at_least' ? 'At least' : 'Reach';
          const unit = g.target.subject === 'sessions_per_week' ? '/wk' : ' kg';
          const frac = g.current !== null && g.target.subject !== SUBJECT_BODYWEIGHT && g.target.value > 0 ? g.current / g.target.value : null;
          return (
            <article key={g.target.id} className="tk-goal">
              <div className="tk-goal-head">
                <div>
                  <h3 className="heading">{g.name}</h3>
                  <p className="tk-goal-sub">{verb} <b className="tnum">{kg(g.target.value)}{unit}</b> by {formatDate(g.target.deadline, { weekday: false })}</p>
                </div>
                {g.pace && <Verdict kind={FEAS_KIND[g.pace.feasibility] ?? 'new'}>{feasibilityWord(g.pace.feasibility)}</Verdict>}
              </div>
              {frac !== null
                ? <DitherBar value={frac} label={`Now ${g.evidence}`} valueText={`${Math.round(frac * 100)}%`} />
                : <p className="tk-mono">Now {g.evidence}</p>}
              {g.paceLine && <p className="tk-mono mid">{g.paceLine}{g.pace?.assumedFlat ? ', no trend yet, assumed flat' : ''}</p>}
            </article>
          );
        })}
      </section>

      <section className="tk-sec" aria-label="Benchmarks">
        <SecHead title="Benchmarks" meta={`${sourceMeta(rated.map(x => x.r))}, 90 days`} right={<InfoButton label="About levels"><p>{STANDARDS_CAVEAT}</p>{gym && <p>Data: {gym.meta.attribution} {gym.meta.licenceNote}</p>}</InfoButton>} />
        {gym === undefined && <p className="tk-quiet">Loading…</p>}
        {gym === null && <p className="tk-quiet">Strength standards could not be loaded.</p>}
        {gym && !ctx && (
          <p className="tk-quiet">Add {stdMissing.join(' and ')} on <a className="tk-link" href="#/profile">Profile</a> to see your level for each lift.</p>
        )}
        {gym && ctx && (
          <>
            <p className="tk-quiet">Levels for <ValueText text={contextText(ctx)} />, from each lift’s best e1RM in the last 90 days.</p>
            {topRated.length > 0 && (
              <div className="tk-bars">{topRated.map(({ l, r }) => <RatedBar key={l.exercise.id} l={l} r={r} label={l.exercise.name} />)}</div>
            )}
            {moreRated.length > 0 && (
              <details className="tk-more">
                <summary>{moreRated.length} more lift{moreRated.length === 1 ? '' : 's'}</summary>
                <div className="tk-bars">{moreRated.map(({ l, r }) => <RatedBar key={l.exercise.id} l={l} r={r} label={l.exercise.name} />)}</div>
              </details>
            )}
            {!rated.length && <p className="tk-quiet">No lift with a standard logged in the last 90 days.</p>}
            {notRated.length > 0 && <p className="tk-quiet">Not rated (no qualifying sets in 90 days): {notRated.join(', ')}.</p>}
            {noStandard.length > 0 && <p className="tk-quiet">No standard: {noStandard.join(', ')}.</p>}
          </>
        )}
      </section>

      <section className="tk-sec" aria-label="Lifts">
        <SecHead title="Lifts (90 days)" meta="e1RM and trend" />
        {!lifts.length && <p className="tk-quiet">Nothing logged in the last 90 days.</p>}
        <ul className="tk-rows">
          {lifts.map(l => {
            const tr = trendOf(l.rate);
            const trail = l.series.slice(-12).map(p => p.e1rm);
            return (
              <li key={l.exercise.id}>
                <a className="tk-lift" data-press="row" href={`#/lift/${encodeURIComponent(l.exercise.id)}`}>
                  <span className="tk-lift-name">{l.exercise.name}</span>
                  <span className="tk-lift-v">{l.best90 !== null ? <>{kg(Math.round(l.best90 * 2) / 2)}<small> kg{l.exercise.bodyweightFactor > 0 ? ' incl. BW' : ''}</small></> : '—'}</span>
                  <span className="tk-trend">{trail.length > 1 ? <Sparkline values={trail} label={`trend ${tr === 'unknown' ? 'not enough data' : tr}`} /> : <span aria-hidden="true" className="mid">·</span>}</span>
                </a>
              </li>
            );
          })}
        </ul>
        <ScreenTip id="progress" shown={pickTip({ progress: data.finished >= 2 && lifts.length > 0 }, tipsSeen)} />
      </section>

      {stats.sessions > 0 && (
        <section className="tk-sec" aria-label="Training summary">
          <SecHead title="Training summary" />
          <LabelValueGrid variant="stats" className="tk-stats" items={[
            { label: 'Favourite lift:', value: favName ?? '—' },
            { label: 'Sessions:', value: stats.sessions.toLocaleString('en-GB') },
            { label: 'Sets logged:', value: stats.sets.toLocaleString('en-GB') },
            { label: 'Sets per session:', value: stats.setsPerSession !== null ? kg(stats.setsPerSession) : '—' },
            { label: 'Busiest day:', value: stats.busiestDay !== null ? WEEKDAY_LONG[stats.busiestDay] : '—' },
            { label: 'Longest break:', value: stats.longestBreak !== null ? `${stats.longestBreak} day${stats.longestBreak === 1 ? '' : 's'}` : '—' },
          ]} />
          {fun && first && <p className="tk-fun">{funLine(funWord, short(first, today), fun)}</p>}
          {first && last && <p className="tk-since">Stats from {stats.sessions} session{stats.sessions === 1 ? '' : 's'}, {short(first, today)} to {short(last, today)}</p>}
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
