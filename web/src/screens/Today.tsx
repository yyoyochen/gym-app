// Today (spec §3.4, §3.5, §4): remind → consistency → readiness → the plan,
// one card per lift → Start (commit) → the logger.
import { useState } from 'react';
import { getDb, getMeta, getProfile } from '../db';
import type { ReadinessAnswers } from '../engine';
import { formatElapsed, readinessFromAnswers } from '../engine';
import { backupDue, commitSession, planToday, skipSession, todayState } from '../app/coach';
import { useFirstRunRedirect } from '../app/firstRun';
import { DemoBanner } from '../app/DemoBanner';
import { formatDate, todayISO } from '../app/dates';
import { useLive } from '../ui/useLive';
import { go } from '../ui/router';
import { ConfirmButton } from '../ui/common';
import { Heatmap } from '../ui/progress/Heatmap';
import { loadConsistency } from '../ui/progress/data';
import { ReadinessCheck } from '../ui/session/Readiness';
import { TargetCard } from '../ui/session/TargetCard';
import { useNow, useScrollTop } from '../ui/session/useNow';
import { formatEffort } from '../engine';

export function Today(_props: { params: string[] }) {
  const gate = useFirstRunRedirect();
  const [answers, setAnswers] = useState<Partial<ReadinessAnswers>>({});
  const [minimum, setMinimum] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [busy, setBusy] = useState(false);
  const readiness = readinessFromAnswers({ sleep: answers.sleep ?? 'good', soreness: answers.soreness ?? 'good', stress: answers.stress ?? 'good' });
  const clock = useNow(1000);
  useScrollTop('today');

  const data = useLive(async db => {
    const now = Date.now();
    const today = todayISO(now);
    const profile = await getProfile(db);
    const [state, plan, heat, backup, demo] = await Promise.all([
      todayState(db, today, now),
      planToday(db, today, now, { readiness, minimum }),
      loadConsistency(db, today, 12, profile),
      backupDue(db, now),
      getMeta(db, 'demoMode'),
    ]);
    return { now, today, profile, state, plan, heat, backup, demo: demo === true };
  }, [readiness, minimum]);

  if (gate !== 'ready' || !data) return <section className="screen" aria-busy="true" />;
  const { today, profile, state, plan, heat, backup, demo } = data;
  const scale = profile?.effortScale ?? 'rir';
  const open = state.open;
  const target = profile?.sessionsPerWeekTarget ?? 3;

  const start = async () => {
    setBusy(true);
    try {
      const s = await commitSession(getDb(), plan, readiness, Date.now());
      go(`session/${s.id}`);
    } finally { setBusy(false); }
  };

  return (
    <section className="screen">
      <DemoBanner />
      <div className="flow-head">
        <h1 className="title">Today</h1>
        <span className="mono num-sm mid">{formatDate(today)}</span>
      </div>

      {open ? (
        <article className="card tick resume-card stack">
          <span className="label">In progress · {open.session.nameSnapshot}</span>
          {open.card ? (
            <>
              <p className="heading line">{open.card.exerciseName} · set <span className="mono">{open.card.setNumber}</span></p>
              <p className="line mid">Last set <span className="num-inline">{open.card.lastSet.weight} × {open.card.lastSet.reps}{open.card.lastSet.rir !== undefined ? ` @ ${formatEffort(open.card.lastSet.rir, scale)}` : ''}</span></p>
              <p className="line mono num-sm mid">rested {formatElapsed(open.card.restedMs + Math.max(0, clock - data.now))}</p>
            </>
          ) : <p className="line mid">Committed, no sets logged yet.</p>}
          <a className="btn primary commit-cta" href={`#/session/${open.session.id}`}>Resume</a>
        </article>
      ) : (
        <>
          {plan.reentryNote && (
            <article className="card tick tick-ghost stack">
              <span className="label">Re-entry</span>
              <p className="body line">{plan.reentryNote}</p>
            </article>
          )}
          {state.doneToday ? (
            <a className="card tick stack done-today" href={`#/review/${state.doneToday.session.id}`} style={{ ['--tick' as string]: 'var(--verdict-hit)' }}>
              <span className="label">Done today</span>
              <span className="heading">{state.doneToday.session.nameSnapshot}</span>
              {state.doneToday.total > 0
                ? <span className="mid"><span className="num-inline">{state.doneToday.kept} / {state.doneToday.total}</span> promises kept · see the review ›</span>
                : <span className="mid">Logged · see the session ›</span>}
            </a>
          ) : state.lastLine && <p className="mid line">{state.lastLine}</p>}
        </>
      )}

      <section className="stack" aria-label="Consistency">
        <div className="spread">
          <span className="label">Last 12 weeks</span>
          <span className="mid"><span className="num-inline">{heat.thisWeek}</span> of <span className="num-inline">{target}</span> this week</span>
        </div>
        <Heatmap data={heat} today={today} cell={17} label={`Training days, last 12 weeks. ${heat.thisWeek} of ${target} sessions this week.`}
          onSelect={d => heat.sessionByDate[d] && go(`history/${heat.sessionByDate[d]}`)} />
      </section>

      {plan.status === 'no_program' && (
        <div className="banner stack">
          <span>No program yet.</span>
          <a className="btn" href="#/profile/program">Pick a program</a>
        </div>
      )}

      {plan.status === 'empty_session' && (
        <div className="banner stack">
          <span>{plan.sessionName} has no lifts.</span>
          <a className="btn" href="#/profile/program">Edit the program</a>
        </div>
      )}

      {state.doneToday && plan.status === 'planned' && !showNext && (
        <button type="button" className="btn block" onClick={() => setShowNext(true)}>Show the next session ({plan.sessionName})</button>
      )}

      {plan.status === 'planned' && !open && (!state.doneToday || showNext) && (
        <ReadinessCheck answers={answers} onChange={setAnswers} readiness={readiness} />
      )}

      {(plan.status === 'committed' || (plan.status === 'planned' && (!state.doneToday || showNext))) && (
        <section className="stack" aria-label="Today's session">
          <div className="spread">
            <h2 className="heading">{plan.status === 'committed' ? 'Committed' : 'Next'}: {plan.sessionName}</h2>
            {plan.status === 'planned' && plan.slots.some(s => s.inMinimum) && (
              <button type="button" className={`chip${minimum ? ' on' : ''}`} aria-pressed={minimum} onClick={() => setMinimum(m => !m)}>
                Minimum
              </button>
            )}
          </div>
          {minimum && <p className="mid line">Minimum version: only the lifts that keep the week on track.</p>}
          {plan.slots.map(sp => <TargetCard key={sp.target.slotId + sp.slotOrder} sp={sp} />)}
          {plan.status === 'planned' && (
            <div className="start-bar">
              <button type="button" className="btn primary commit-cta" disabled={busy} onClick={start}>
                Start {plan.sessionName.split(' ·')[0]}
              </button>
              <ConfirmButton className="block" confirmLabel={`Skip ${plan.sessionName.split(' ·')[0]} — tap to record`}
                onConfirm={() => skipSession(getDb(), plan, Date.now())}>
                Skip this session
              </ConfirmButton>
            </div>
          )}
        </section>
      )}

      {backup.due && !demo && (
        <p className="mid line">
          {backup.days === null ? 'No backup yet.' : `Last backup ${backup.days} days ago.`}{' '}
          <a className="link" href="#/profile/settings">Export</a>
        </p>
      )}
    </section>
  );
}
