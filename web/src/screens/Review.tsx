// Review (#/review/<id>; spec §3.1, §4): "3 of 4 promises kept", then the
// verdict ledger graded against the COMMITTED promise (promise / result /
// detail, verdict chip: beat solid, hit outline, missed dashed), new bests,
// safety, goal pace, and the next session as a //NOTE. The reveal plays once
// per session (never on revisit).
import { useEffect, useState } from 'react';
import { readable } from '../ui/readable';
import type { EffortScale } from '../domain/types';
import { getExerciseHistory, getProfile, getSession, getSessionSets } from '../db';
import { addDays, formatEffort } from '../engine';
import { gradeSession, kg, planToday, setsParts, type SessionGrade } from '../app/coach';
import { formatDate, todayISO } from '../app/dates';
import { TARGET_TYPE_LABELS } from '../app/labels';
import { useLive } from '../ui/useLive';
import { goalRows } from '../ui/progress/data';
import { BigNumber, DitherBar, DitherNumber, LinkButton, Lockup, Parts, Verdict, prefersReducedMotion } from '../ui/kit';
import { MonoNums, sessionNames } from '../ui/session/text';
import { priorFromHistory, sessionPrs } from '../ui/session/prs';
import { useScrollTop } from '../ui/session/useNow';

const REVEAL_WINDOW_MS = 15 * 60_000;

function seenKey(id: string) { return `gymbro.reviewed.${id}`; }
function alreadySeen(id: string): boolean {
  try { return sessionStorage.getItem(seenKey(id)) === '1'; } catch { return true; }
}
function markSeen(id: string) { try { sessionStorage.setItem(seenKey(id), '1'); } catch { /* ignore */ } }

function sentence(g: SessionGrade): string {
  if (!g.total) return g.added.length ? 'Nothing graded: every lift was added or swapped.' : 'No committed targets.';
  const missed = g.slots.filter(s => !s.ungraded && s.result.verdict === 'missed').map(s => s.target.exerciseName);
  const beat = g.slots.filter(s => s.result.verdict === 'beat').length;
  if (!missed.length) return beat ? `Every promise kept, ${beat} beaten.` : 'Every promise kept.';
  return `${missed.join(', ')} ${missed.length === 1 ? 'was' : 'were'} short of the promise.`;
}

function safetyEvents(g: SessionGrade, scale: EffortScale): string[] {
  const out: string[] = [];
  for (const s of g.slots) {
    for (const x of s.sets) {
      if (x.pain) out.push(`${x.exerciseNameSnapshot}: pain flagged (${x.pain.side !== 'na' && x.pain.side !== 'both' ? `${x.pain.side} ` : ''}${x.pain.area.replace('_', ' ')}, severity ${x.pain.severity})${x.pain.severity >= 2 ? ' — the lift stopped; next session holds the load and asks a pain check' : ' — next session holds the load'}.`);
      if (x.failed && x.kind !== 'warmup') out.push(`${x.exerciseNameSnapshot}: rep failure at ${x.weight} kg — don't repeat it until next session.`);
      if (x.kind === 'top' && x.rir !== undefined && x.rir < s.target.rirFloor) out.push(`${x.exerciseNameSnapshot}: top set at ${formatEffort(x.rir, scale)}, past the ${formatEffort(s.target.rirFloor, scale)} floor — next time comes down one increment.`);
    }
  }
  return out;
}

export function Review({ params }: { params: string[] }) {
  const id = params[0];
  const data = useLive(async db => {
    const [session, grade, profile, sets] = await Promise.all([getSession(db, id), gradeSession(db, id), getProfile(db), getSessionSets(db, id)]);
    if (!session) return null;
    const now = Date.now();
    const tomorrow = addDays(todayISO(now) > session.date ? todayISO(now) : session.date, 1);
    const next = session.sealed ? await planToday(db, tomorrow, now, { ignoreOpen: true }) : null;
    const touched = new Set(grade?.slots.filter(s => s.sets.length).map(s => s.target.exerciseId) ?? []);
    const pace = profile ? await goalRows(db, profile, session.date, touched) : [];
    // New bests: this session's sets against every other session of the lift.
    const lifts = [...new Set(sets.filter(s => s.kind !== 'warmup').map(s => s.exerciseId))];
    const prior = new Map(await Promise.all(lifts.map(async ex =>
      [ex, priorFromHistory((await getExerciseHistory(db, ex)).filter(d => d.session.id !== id))] as const)));
    const prs = sessionPrs(sets, session.date, ex => prior.get(ex) ?? []);
    return { session, grade, next, pace, prs, scale: (profile?.effortScale ?? 'rir') as EffortScale };
  }, [id]);

  const [reveal, setReveal] = useState(false);
  useScrollTop(id);
  useEffect(() => {
    if (!data?.session || !data.grade) return;
    const fresh = data.session.endedAt !== undefined && Date.now() - data.session.endedAt < REVEAL_WINDOW_MS;
    // The full-screen PR moment already played in the logger when the set was
    // logged; on a fresh reveal the best new best resolves from dither inline.
    if (fresh && !alreadySeen(id)) setReveal(true);
    markSeen(id);
  }, [id, !!data?.grade]); // eslint-disable-line react-hooks/exhaustive-deps

  if (data === undefined) return <section className="screen review" aria-busy="true" />;
  if (data === null) return <section className="screen review"><LinkButton variant="quiet" href="#/today" icon="back">Today</LinkButton><p className="quiet">This session doesn’t exist.</p></section>;
  const { session, grade, next, pace, prs, scale } = data;
  const safety = grade ? safetyEvents(grade, scale) : [];
  const n = grade?.slots.length ?? 0;
  const names = sessionNames(session.nameSnapshot);
  const nextNames = next ? sessionNames(next.sessionName) : null;
  const top = prs[0];

  return (
    <section className="screen review">
      <Lockup mid={`Review //${names.short}`} />
      <div className="place">
        <div>
          <h1 className="title">{names.title}</h1>
          <p className="quiet">{formatDate(session.date)}{session.edited ? ', edited' : ''}</p>
        </div>
      </div>
      {!session.sealed && (
        <div className="banner spread"><span>Still open.</span><LinkButton href={`#/session/${id}`}>Back to the session</LinkButton></div>
      )}

      {grade ? (
        <>
          <header className="kept">
            <BigNumber value={grade.kept} unit={`of ${grade.total}`} caption={`promise${grade.total === 1 ? '' : 's'} kept`}
              label={`${grade.kept} of ${grade.total} promises kept`} />
            <p className="quiet kept-line">{sentence(grade)}</p>
          </header>
          <div className={`rv-ledger${reveal ? ' reveal' : ''}`} role="list">
            {grade.slots.map((s, i) => {
              const v = s.ungraded ? 'new' : s.result.verdict;
              const swappedName = s.sets[0] && s.sets[0].exerciseNameSnapshot !== s.target.exerciseName ? `${s.sets[0].exerciseNameSnapshot}: ` : '';
              return (
                <article key={s.slotOrder} role="listitem" className={`led ${v}`} style={{ ['--i' as string]: i, ['--n' as string]: n }}>
                  <span className="led-l label">{s.target.exerciseName}</span>
                  <p className="led-p"><MonoNums text={s.target.criterion} /></p>
                  <p className="led-r">{swappedName}<SetsDone parts={setsParts(s.sets, scale)} /></p>
                  <p className="led-d">{s.result.detail}</p>
                  <Verdict kind={v} className="led-v">{s.ungraded ? 'Ungraded' : undefined}</Verdict>
                </article>
              );
            })}
            {grade.added.map((a, i) => (
              <article key={a.slotOrder} role="listitem" className="led new" style={{ ['--i' as string]: n + i, ['--n' as string]: n }}>
                <span className="led-l label">{a.name}</span>
                <p className="led-p">Added during the session</p>
                <p className="led-r"><SetsDone parts={setsParts(a.sets, scale)} /></p>
                <Verdict kind="new" className="led-v">Ungraded</Verdict>
              </article>
            ))}
          </div>
        </>
      ) : <p className="quiet">No committed promise for this session, so there is nothing to grade.</p>}

      {top && (
        <section className="pr-inline" aria-label="New bests">
          <span className="label">[PR] //{top.lift}</span>
          {reveal && !prefersReducedMotion()
            ? <DitherNumber text={top.moment.value} height={110} className="accent" />
            : <BigNumber value={top.moment.value} size="display" accent />}
          <p className="pr-inline-sub"><b>{top.moment.unit}</b> {top.moment.caption}</p>
          {prs.length > 1 && <p className="quiet">Also: {prs.slice(1).map(p => `${p.lift} ${p.moment.value} ${p.moment.unit}`).join(', ')}</p>}
        </section>
      )}

      {safety.length > 0 && (
        <section className="stack" aria-label="Safety">
          <span className="label">Safety</span>
          {safety.map((x, i) => <p key={i} className="note">//Stop — {x}</p>)}
        </section>
      )}

      {pace.some(p => p.paceLine) && (
        <section className="bars" aria-label="Targets touched">
          {pace.filter(p => p.paceLine).map(p => (
            <div key={p.target.id} className="stack tight">
              <DitherBar label={`${p.name}: ${TARGET_TYPE_LABELS[p.target.type].toLowerCase()} ${kg(p.target.value)} by ${formatDate(p.target.deadline, { weekday: false, year: false })}`}
                valueText={p.current !== null && p.target.value > 0 ? `${kg(Math.round(p.current * 10) / 10)}, ${Math.round((p.current / p.target.value) * 100)}%` : p.evidence}
                value={p.current !== null && p.target.value > 0 ? p.current / p.target.value : 0} />
              <p className="quiet">{p.paceLine}{p.pace ? `, ${p.pace.feasibility}` : ''}</p>
            </div>
          ))}
        </section>
      )}

      {next && next.status === 'planned' && nextNames && (
        <section className="stack" aria-label="Next session">
          <p className="note">//Next — {nextNames.title}. Preview only: the promise is set when you start it.</p>
          <div className="next-list">
            {next.slots.map(sp => (
              <div key={sp.target.slotId} className="next-item">
                <span className="label">{sp.target.exerciseName}</span>
                <p className="promise-text"><MonoNums text={sp.target.criterion} /></p>
                <p className="quiet">Why: {readable(sp.target.why)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <LinkButton variant="primary" block href="#/today" iconEnd="chevron">Done</LinkButton>
    </section>
  );
}

/** What was done for a slot: the set parts, or a dash when nothing was logged. */
function SetsDone({ parts }: { parts: string[] }) {
  return parts.length ? <Parts items={parts} /> : <>—</>;
}
