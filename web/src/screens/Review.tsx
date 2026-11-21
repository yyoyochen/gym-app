// Review (#/review/<id>; spec §3.1, §4): the verdict ledger graded against the
// COMMITTED promise, safety events, next-session preview, pace lines.
// The reveal plays once per session (never on revisit).
import { useEffect, useState } from 'react';
import { readable } from '../ui/readable';
import type { EffortScale, Verdict } from '../domain/types';
import { getProfile, getSession } from '../db';
import { addDays, formatEffort } from '../engine';
import { gradeSession, planToday, setsLine, type SessionGrade } from '../app/coach';
import { formatDate, todayISO } from '../app/dates';
import { useLive } from '../ui/useLive';
import { goalRows } from '../ui/progress/data';
import { MonoNums } from '../ui/session/text';
import { useScrollTop } from '../ui/session/useNow';

const VERDICT_WORD: Record<Verdict, string> = { beat: 'Beat', hit: 'Hit', missed: 'Missed', new: 'New' };
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

interface Safety { text: string }
function safetyEvents(g: SessionGrade, scale: EffortScale): Safety[] {
  const out: Safety[] = [];
  for (const s of g.slots) {
    for (const x of s.sets) {
      if (x.pain) out.push({ text: `${x.exerciseNameSnapshot}: pain flagged (${x.pain.side !== 'na' && x.pain.side !== 'both' ? `${x.pain.side} ` : ''}${x.pain.area.replace('_', ' ')}, severity ${x.pain.severity})${x.pain.severity >= 2 ? ' — the lift stopped; next session holds the load and asks a pain check' : ' — next session holds the load'}.` });
      if (x.failed && x.kind !== 'warmup') out.push({ text: `${x.exerciseNameSnapshot}: rep failure at ${x.weight} kg — don't repeat it until next session.` });
      if (x.kind === 'top' && x.rir !== undefined && x.rir < s.target.rirFloor) out.push({ text: `${x.exerciseNameSnapshot}: top set at ${formatEffort(x.rir, scale)}, past the ${formatEffort(s.target.rirFloor, scale)} floor — next time comes down one increment.` });
    }
  }
  return out;
}

export function Review({ params }: { params: string[] }) {
  const id = params[0];
  const data = useLive(async db => {
    const [session, grade, profile] = await Promise.all([getSession(db, id), gradeSession(db, id), getProfile(db)]);
    if (!session) return null;
    const now = Date.now();
    const tomorrow = addDays(todayISO(now) > session.date ? todayISO(now) : session.date, 1);
    const next = session.sealed ? await planToday(db, tomorrow, now, { ignoreOpen: true }) : null;
    const touched = new Set(grade?.slots.filter(s => s.sets.length).map(s => s.target.exerciseId) ?? []);
    const pace = profile ? await goalRows(db, profile, session.date, touched) : [];
    return { session, grade, next, pace, scale: (profile?.effortScale ?? 'rir') as EffortScale };
  }, [id]);

  const [reveal, setReveal] = useState(false);
  useScrollTop(id);
  useEffect(() => {
    if (!data?.session || !data.grade) return;
    const fresh = data.session.endedAt !== undefined && Date.now() - data.session.endedAt < REVEAL_WINDOW_MS;
    // TODO(PrMoment, screen worker): on a fresh reveal, check each graded slot's best set with
    // isNewBest (app/bests.ts) against earlier sessions and showPrMoment() for the best one.
    if (fresh && !alreadySeen(id)) setReveal(true);
    markSeen(id);
  }, [id, !!data?.grade]); // eslint-disable-line react-hooks/exhaustive-deps

  if (data === undefined) return <section className="screen" aria-busy="true" />;
  if (data === null) return <section className="screen"><a className="back" href="#/today">‹ Today</a><p className="mid">This session doesn’t exist.</p></section>;
  const { session, grade, next, pace, scale } = data;
  const safety = grade ? safetyEvents(grade, scale) : [];
  const n = grade?.slots.length ?? 0;

  return (
    <section className="screen">
      <a className="back" href="#/today">‹ Today</a>
      <div className="flow-head">
        <h1 className="title">{session.nameSnapshot}</h1>
        <span className="mono num-sm mid">{formatDate(session.date, { year: false })}</span>
      </div>
      {session.edited && <span className="chip">edited</span>}
      {!session.sealed && <div className="banner spread"><span>Still open.</span><a className="btn" href={`#/session/${id}`}>Back to the session</a></div>}

      {grade ? (
        <>
          <header className="ledger-head">
            <span className="label">Kept</span>
            <p className="display">{grade.kept} / {grade.total}</p>
            <p className="body mid">{sentence(grade)}</p>
          </header>
          <div className={`ledger-rows${reveal ? ' reveal' : ''}`}>
            {grade.slots.map((s, i) => {
              const v = s.ungraded ? 'new' : s.result.verdict;
              return (
                <article key={s.slotOrder} className={`card tick ledger-row tick-${v === 'hit' ? 'hit' : v} ${v}`} style={{ ['--i' as string]: i, ['--n' as string]: n }}>
                  <p className="promise">“<MonoNums text={s.target.criterion} />”</p>
                  <p className="result">{s.target.exerciseName !== (s.sets[0]?.exerciseNameSnapshot ?? s.target.exerciseName) ? `${s.sets[0].exerciseNameSnapshot}: ` : ''}{setsLine(s.sets, scale)}</p>
                  <span className={`verdict ${v}`}>{s.ungraded ? 'Ungraded' : VERDICT_WORD[v]}</span>
                  <p className="detail">{s.result.detail}</p>
                </article>
              );
            })}
            {grade.added.map((a, i) => (
              <article key={a.slotOrder} className="card tick ledger-row tick-new new" style={{ ['--i' as string]: n + i, ['--n' as string]: n }}>
                <p className="promise">Added during the session</p>
                <p className="result">{a.name}: {setsLine(a.sets, scale)}</p>
                <span className="verdict new">Ungraded</span>
              </article>
            ))}
          </div>
        </>
      ) : <p className="mid">No committed promise for this session, so there is nothing to grade.</p>}

      {safety.length > 0 && (
        <section className="card stack" aria-label="Safety">
          <span className="label">Safety</span>
          {safety.map((x, i) => <p key={i} className="line slate">{x.text}</p>)}
        </section>
      )}

      {pace.some(p => p.paceLine) && (
        <section className="stack" aria-label="Pace">
          <span className="label">Targets touched</span>
          {pace.filter(p => p.paceLine).map(p => (
            <p key={p.target.id} className="line mid">{p.name} {p.target.value} kg by {formatDate(p.target.deadline, { weekday: false })}: <span className="num-inline">{p.evidence}</span> · {p.paceLine}{p.pace ? ` · ${p.pace.feasibility}` : ''}</p>
          ))}
        </section>
      )}

      {next && next.status === 'planned' && (
        <section className="card stack" aria-label="Next session">
          <span className="label">Next · {next.sessionName}</span>
          {next.slots.map(sp => (
            <div key={sp.target.slotId} className="stack tight">
              <span className="heading">{sp.target.exerciseName}</span>
              <p className="line"><MonoNums text={sp.target.criterion} /></p>
              <p className="line mid">Why: {readable(sp.target.why)}</p>
            </div>
          ))}
          <p className="mid line">Preview only — the promise is set when you start it.</p>
        </section>
      )}

      <a className="btn block" href="#/today">Done</a>
    </section>
  );
}
