// Today (spec §3.4, §3.5, §4), weather-app hierarchy: the session, one huge
// number (the selected lift's top set), a strip of the session's lifts, the
// promise word for word, label/value pairs, this week + goal pace bars,
// readiness, the glyph heatmap, and START pinned above the tab bar.
import { useState } from 'react';
import { getActiveProgram, getDb, getMeta, getProfile, listSessions } from '../db';
import type { ReadinessAnswers } from '../engine';
import { formatElapsed, readinessFromAnswers, formatEffort } from '../engine';
import { backupDue, commitSession, kg, planToday, skipSession, todayState, type SlotPlan } from '../app/coach';
import { useFirstRunRedirect } from '../app/firstRun';
import { firstPromisedSession, goalNudgeDue } from '../app/tips';
import { ScreenTip, useScreenTip } from '../app/parts/ScreenTip';
import { DemoBanner } from '../app/DemoBanner';
import { UpdateBanner } from '../app/parts/UpdateBanner';
import { formatDate, todayISO } from '../app/dates';
import { TARGET_TYPE_LABELS } from '../app/labels';
import { useLive } from '../ui/useLive';
import { readable } from '../ui/readable';
import {
  BigNumber, Button, ConfirmButton, DitherBar, LabelValueGrid, LinkButton, Lockup, RecentWeeks, Segmented, Toggle, go, type LabelValueItem,
} from '../ui/kit';
import { goalRows, loadConsistency, loadWeekBodyParts } from '../ui/progress/data';
import { ReadinessCheck } from '../ui/session/Readiness';
import { MonoNums, sessionNames, stripUnit, topWord } from '../ui/session/text';
import { useNow, useScrollTop } from '../ui/session/useNow';

/** The number a lift is about: its top set, else its working weight (reps for bodyweight). */
function heroOf(sp: SlotPlan): { value: string; unit: string; caption: string } {
  const t = sp.target;
  if (t.model === 'topset' && t.topWeight !== undefined && t.topWeight > 0) {
    const reps = t.topReps ?? sp.ghost[0]?.reps ?? t.targetReps;
    return { value: kg(t.topWeight), unit: `kg × ${reps}`, caption: topWord(reps) };
  }
  const reps = sp.ghost[0]?.reps ?? t.targetReps;
  if (t.weight === 0 && sp.exercise.bodyweightFactor > 0) return { value: String(reps), unit: 'reps', caption: `${sp.plannedSets} sets, bodyweight` };
  if (t.weight === 0) return { value: '—', unit: `× ${reps}`, caption: 'first time: pick a weight' };
  return { value: kg(t.weight), unit: `kg × ${reps}`, caption: `${sp.plannedSets} working sets` };
}

/** ["40 × 6", "90 × 3", "70 × 6, 6"] → its heaviest part, "90 × 3". */
function lastTop(parts: string[]): string {
  const w = (p: string) => parseFloat(p) || 0;
  return parts.reduce<string>((a, p) => (!a || w(p) > w(a) ? p : a), '');
}

/** Strip label: "Barbell Bench Press" → "Bench Press", "Cable Tricep Pushdown" → "Tricep Pushdown". */
const stripName = (name: string) => name.replace(/^(barbell|dumbbell|db|conventional|cable|machine|smith)\s+/i, '');

function setsPair(sp: SlotPlan): LabelValueItem {
  const off = sp.ghost.filter(g => g.kind === 'backoff');
  if (off.length) return { label: 'Back-offs', value: `${off.length} × ${off[0].reps} at ${kg(off[0].weight)}` };
  return { label: 'Sets', value: `${sp.ghost.length} × ${sp.ghost[0]?.reps ?? sp.target.targetReps}` };
}

export function Today(_props: { params: string[] }) {
  const gate = useFirstRunRedirect();
  const [answers, setAnswers] = useState<Partial<ReadinessAnswers>>({});
  const [minimum, setMinimum] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const readiness = readinessFromAnswers({ sleep: answers.sleep ?? 'good', soreness: answers.soreness ?? 'good', stress: answers.stress ?? 'good' });
  const clock = useNow(1000);
  useScrollTop('today');

  const data = useLive(async db => {
    const now = Date.now();
    const today = todayISO(now);
    const profile = await getProfile(db);
    const [state, plan, heat, backup, demo, goals, parts, sessions, program] = await Promise.all([
      todayState(db, today, now),
      planToday(db, today, now, { readiness, minimum, ...(pick ? { sessionKey: pick } : {}) }),
      loadConsistency(db, today, 52, profile),
      backupDue(db, now),
      getMeta(db, 'demoMode'),
      profile ? goalRows(db, profile, today) : Promise.resolve([]),
      loadWeekBodyParts(db, today, profile?.sessionsPerWeekTarget ?? 3),
      listSessions(db),
      getActiveProgram(db),
    ]);
    const committed = new Set((await db.commits.toCollection().primaryKeys()) as string[]);
    const finished = sessions.filter(s => s.sealed);
    const counts: Record<string, number> = {};
    for (const col of heat.grid.columns) for (const c of col) if (c.inWindow && c.count > 0) counts[c.date] = c.count;
    const choices = (program?.sessions ?? []).filter(x => x.slots.length > 0).map(x => ({ value: x.key, label: x.key, name: x.name }));
    return { now, today, profile, state, plan, heat, counts, backup, demo: demo === true, goals, parts, choices, finished: finished.length, firstPromised: firstPromisedSession(sessions, committed) };
  }, [readiness, minimum, pick]);

  const tip = useScreenTip(data ? {
    promise: data.plan.status === 'committed' || (data.plan.status === 'planned' && (!data.state.doneToday || showNext)),
    readiness: data.plan.status === 'planned' && !data.state.open && (!data.state.doneToday || showNext) && data.finished >= 1,
    goalNudge: goalNudgeDue(data.firstPromised, data.today, (data.profile?.targets.length ?? 0) > 0),
  } : {});

  if (gate !== 'ready' || !data) return <section className="screen today" aria-busy="true" />;
  const { today, profile, state, plan, heat, counts, backup, demo, goals, parts, choices } = data;
  const scale = profile?.effortScale ?? 'rir';
  const open = state.open;
  const target = profile?.sessionsPerWeekTarget ?? 3;
  const names = sessionNames(plan.sessionName || 'Today');
  const showPlan = plan.status === 'committed' || (plan.status === 'planned' && (!state.doneToday || showNext));
  const canStart = plan.status === 'planned' && !open && (!state.doneToday || showNext);
  const sp = plan.slots.find(s => s.slotOrder === sel) ?? plan.slots[0];
  const hero = sp ? heroOf(sp) : null;
  const done = state.doneToday;

  const start = async () => {
    setBusy(true);
    try {
      const s = await commitSession(getDb(), plan, readiness, Date.now());
      go(`session/${s.id}`);
    } finally { setBusy(false); }
  };

  const pairs: LabelValueItem[] = sp ? [
    { label: 'Effort floor', value: sp.floorLabel },
    setsPair(sp),
    { label: 'Last time', value: lastTop(sp.lastTime) || 'First time' },
  ] : [];
  if (open?.card) {
    pairs.splice(0, 0,
      { label: 'Last set', value: `${kg(open.card.lastSet.weight)} × ${open.card.lastSet.reps}${open.card.lastSet.rir !== undefined ? ` @ ${formatEffort(open.card.lastSet.rir, scale)}` : ''}` },
      { label: 'Rested', value: formatElapsed(open.card.restedMs + Math.max(0, clock - data.now)) });
  }
  const paceBars = goals.filter(g => g.current !== null && g.target.value > 0 && g.target.subject !== 'sessions_per_week');

  return (
    <section className="screen today">
      <DemoBanner />
      {!open && <UpdateBanner />}
      <Lockup mid={`Training log //${open ? 'Live' : done && !showNext ? 'Done today' : names.short}`} />

      <div className="place">
        <div>
          <h1 className="title">{done && !showNext ? sessionNames(done.session.nameSnapshot).title : showPlan ? names.title : 'Today'}</h1>
        </div>
      </div>

      {canStart && choices.length > 1 && plan.sessionKey && (
        <Segmented<string> label="Session" value={plan.sessionKey} onChange={k => { setPick(k); setSel(null); setMinimum(false); }}
          options={choices.map(c => ({ value: c.value, label: c.label }))} />
      )}

      {done && !showNext ? (
        <div className="stack">
          {done.total > 0
            ? <BigNumber value={done.kept} unit={`of ${done.total}`} caption={`plan${done.total === 1 ? '' : 's'} met`} label={`${done.kept} of ${done.total} plans met`} />
            : <BigNumber value="0" unit="graded" caption="logged, nothing to grade" />}
          <LinkButton block className="split" iconEnd="chevron" href={`#/review/${done.session.id}`}>See the review</LinkButton>
        </div>
      ) : showPlan && sp && hero && (
        <>
          <BigNumber value={hero.value} unit={hero.unit} caption={hero.caption} />
          {plan.slots.length > 1 && (
            <div className="lift-strip" role="tablist" aria-label="Lifts in this session">
              {plan.slots.map(s => (
                <button key={s.target.slotId + s.slotOrder} type="button" role="tab" aria-selected={s === sp} data-press="dim"
                  className={`lift-cell${s === sp ? ' on' : ''}`} onClick={() => setSel(s.slotOrder)}>
                  <span className="label">{stripName(s.exercise.name)}</span><b>{heroOf(s).value}</b><small>{stripUnit(heroOf(s).unit)}</small>
                </button>
              ))}
            </div>
          )}
          <div className="promise">
            <span className="label">{plan.status === 'committed' ? 'Locked in' : 'The plan'}: {sp.exercise.name}{sp.inMinimum && minimum ? ', minimum' : ''}</span>
            <p className="promise-text"><MonoNums text={sp.target.criterion} /></p>
            <p className="quiet">Why: {readable(sp.target.why)}</p>
            {sp.lastNote && <p className="quiet">Last note: {sp.lastNote}</p>}
          </div>
          <ScreenTip id="promise" shown={tip} />
          {sp.pain?.painCheck && <p className="note">//Pain check — how does it feel warming up? {sp.pain.reasons[0]}</p>}
          <LabelValueGrid items={pairs} />
        </>
      )}

      {!open && !done && state.lastLine && !showPlan && <p className="quiet">{state.lastLine}</p>}
      {!open && plan.reentryNote && showPlan && <p className="note">//Re-entry — {plan.reentryNote}</p>}

      {plan.status === 'no_program' && (
        <div className="banner stack">
          <span>No program yet. Plan your own, or start from an example program and change it to suit you.</span>
          <LinkButton variant="primary" href="#/profile/program" block iconEnd="chevron">Plan a program</LinkButton>
        </div>
      )}
      {plan.status === 'empty_session' && (
        <div className="banner stack">
          <span>{plan.sessionName} has no lifts.</span>
          <LinkButton href="#/profile/program" block>Edit the program</LinkButton>
        </div>
      )}

      <div className="bars">
        <DitherBar label="This week" valueText={`${heat.thisWeek} of ${target}`} value={heat.thisWeek / Math.max(1, target)} />
        {paceBars.map(g => (
          <DitherBar key={g.target.id} label={`${g.name}: ${TARGET_TYPE_LABELS[g.target.type].toLowerCase()} ${kg(g.target.value)} by ${formatDate(g.target.deadline, { weekday: false, year: false })}`}
            valueText={`${kg(Math.round(g.current! * 10) / 10)}, ${Math.round((g.current! / g.target.value) * 100)}%`} value={g.current! / g.target.value} />
        ))}
      </div>

      <ScreenTip id="goalNudge" shown={tip} />

      {done && !showNext && plan.status === 'planned' && (
        <Button block iconEnd="chevron" className="split" onClick={() => setShowNext(true)}>Show the next session ({names.short})</Button>
      )}

      {canStart && (
        <>
          <ReadinessCheck answers={answers} onChange={setAnswers} readiness={readiness} />
          <ScreenTip id="readiness" shown={tip} />
          {(minimum || plan.slots.some(s => s.inMinimum)) && (
            <Toggle label="Short on time" checked={minimum} onChange={setMinimum}
              hint={minimum ? 'Only the main lifts today. The session still counts toward your week.' : `Do only the main lifts (${plan.slots.filter(s => s.inMinimum).length} of ${plan.slots.length}). The session still counts toward your week.`} />
          )}
        </>
      )}

      <div className="stack">
        <span className="label">Last 4 weeks</span>
        <RecentWeeks counts={counts} end={today} weekTarget={target}
          onSelect={d => heat.sessionByDate[d] && go(`history/${heat.sessionByDate[d]}`)} />
      </div>

      {parts.length > 0 && (
        <div className="stack today-parts" aria-label="This week's sets by body part">
          <span className="label">This week (sets)</span>
          {parts.map(r => (
            <DitherBar key={r.part} label={r.part}
              value={r.planned > 0 ? Math.min(r.done, r.planned) / r.planned : 1}
              valueText={r.planned > 0 ? `${r.done}/${r.planned}` : `${r.done}, unplanned`} />
          ))}
        </div>
      )}

      {canStart && (
        <ConfirmButton className="quiet block" confirmLabel={`Skip ${names.short}?`} confirmText={`Skip ${names.short}`}
          message="It counts as a choice, not a gap: the rotation moves on." onConfirm={() => skipSession(getDb(), plan, Date.now())}>
          Skip this session
        </ConfirmButton>
      )}

      {backup.due && !demo && (
        <p className="quiet">
          {backup.days === null ? 'No backup yet.' : `Last backup ${backup.days} days ago.`}{' '}
          <a className="link" href="#/profile/settings">Export</a>
        </p>
      )}

      {(canStart || open) && (
        <div className="pin">
          {open ? (
            <LinkButton variant="primary" block iconEnd="chevron" href={`#/session/${open.session.id}`}>Resume {names.short}</LinkButton>
          ) : (
            <Button variant="primary" block iconEnd="chevron" disabled={busy} onClick={start}>Start {names.short}</Button>
          )}
        </div>
      )}
    </section>
  );
}
