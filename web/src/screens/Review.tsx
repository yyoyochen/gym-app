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
import { TARGET_TYPE_LABELS, feasibilityWord } from '../app/labels';
import { useLive } from '../ui/useLive';
import { goalRows } from '../ui/progress/data';
import { pickTip } from '../app/tips';
import { ScreenTip, useTipsSeen } from '../app/parts/ScreenTip';
import { BigNumber, DitherBar, DitherNumber, LinkButton, Lockup, Parts, Verdict, prefersReducedMotion } from '../ui/kit';
import { MonoNums, painWhere, sessionNames } from '../ui/session/text';
import { t, te, tn } from '../i18n';
import { priorFromHistory, sessionPrs } from '../ui/session/prs';
import { useScrollTop } from '../ui/session/useNow';

const REVEAL_WINDOW_MS = 15 * 60_000;

function seenKey(id: string) { return `gymbro.reviewed.${id}`; }
function alreadySeen(id: string): boolean {
  try { return sessionStorage.getItem(seenKey(id)) === '1'; } catch { return true; }
}
function markSeen(id: string) { try { sessionStorage.setItem(seenKey(id), '1'); } catch { /* ignore */ } }

function sentence(g: SessionGrade): string {
  if (!g.total) return g.added.length ? t('Nothing graded: every lift was added or swapped.') : t('No committed targets.');
  const missed = g.slots.filter(s => !s.ungraded && s.result.verdict === 'missed').map(s => tn(s.target.exerciseName));
  const beat = g.slots.filter(s => s.result.verdict === 'beat').length;
  if (!missed.length) return beat ? t('Every plan met, {n} beaten.', { n: beat }) : t('Every plan met.');
  const names = missed.join(t(', '));
  return missed.length === 1 ? t('{names} was short of the plan.', { names }) : t('{names} were short of the plan.', { names });
}

function safetyEvents(g: SessionGrade, scale: EffortScale): string[] {
  const out: string[] = [];
  for (const s of g.slots) {
    for (const x of s.sets) {
      const name = tn(x.exerciseNameSnapshot);
      if (x.pain) {
        const v = { name, where: painWhere(x.pain, false), n: x.pain.severity };
        out.push(x.pain.severity >= 2
          ? t('{name}: pain flagged ({where}, severity {n}) — the lift stopped; next session holds the load and asks a pain check.', v)
          : t('{name}: pain flagged ({where}, severity {n}) — next session holds the load.', v));
      }
      if (x.failed && x.kind !== 'warmup') out.push(t("{name}: rep failure at {w} kg — don't repeat it until next session.", { name, w: x.weight }));
      if (x.kind === 'top' && x.rir !== undefined && x.rir < s.target.rirFloor) {
        out.push(t('{name}: top set at {effort}, past the {floor} floor — next time comes down one increment.', { name, effort: formatEffort(x.rir, scale), floor: formatEffort(s.target.rirFloor, scale) }));
      }
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
  const tipsSeen = useTipsSeen();
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
  if (data === null) return <section className="screen review"><LinkButton variant="quiet" href="#/today" icon="back">{t('Today')}</LinkButton><p className="quiet">{t('This session doesn’t exist.')}</p></section>;
  const { session, grade, next, pace, prs, scale } = data;
  const safety = grade ? safetyEvents(grade, scale) : [];
  const n = grade?.slots.length ?? 0;
  const names = sessionNames(session.nameSnapshot);
  const nextNames = next ? sessionNames(next.sessionName) : null;
  const top = prs[0];

  return (
    <section className="screen review">
      <Lockup mid={t('Review // {name}', { name: names.short })} />
      <div className="place">
        <div>
          <h1 className="title">{names.title}</h1>
          <p className="quiet">{session.edited ? t('{date}, edited', { date: formatDate(session.date) }) : formatDate(session.date)}</p>
        </div>
      </div>
      {!session.sealed && (
        <div className="banner spread"><span>{t('Still open.')}</span><LinkButton href={`#/session/${id}`}>{t('Back to the session')}</LinkButton></div>
      )}

      {grade ? (
        <>
          <header className="kept">
            <BigNumber value={grade.kept} unit={t('of {n}', { n: grade.total })} caption={grade.total === 1 ? t('plan met') : t('plans met')}
              label={t('{kept} of {total} plans met', { kept: grade.kept, total: grade.total })} />
            <p className="quiet kept-line">{sentence(grade)}</p>
          </header>
          <div className={`rv-ledger${reveal ? ' reveal' : ''}`} role="list">
            {grade.slots.map((s, i) => {
              const v = s.ungraded ? 'new' : s.result.verdict;
              const swappedName = s.sets[0] && s.sets[0].exerciseNameSnapshot !== s.target.exerciseName ? t('{name}: ', { name: tn(s.sets[0].exerciseNameSnapshot) }) : '';
              return (
                <article key={s.slotOrder} role="listitem" className={`led ${v}`} style={{ ['--i' as string]: i, ['--n' as string]: n }}>
                  <span className="led-l label">{tn(s.target.exerciseName)}</span>
                  <p className="led-p"><MonoNums text={s.target.criterion} /></p>
                  <p className="led-r">{swappedName}<SetsDone parts={setsParts(s.sets, scale)} warmups={s.sets.length} /></p>
                  <p className="led-d">{te(s.result.detail)}</p>
                  <Verdict kind={v} className="led-v">{s.ungraded ? t('Ungraded') : undefined}</Verdict>
                </article>
              );
            })}
            {grade.added.map((a, i) => (
              <article key={a.slotOrder} role="listitem" className="led new" style={{ ['--i' as string]: n + i, ['--n' as string]: n }}>
                <span className="led-l label">{tn(a.name)}</span>
                <p className="led-p">{t('Added during the session')}</p>
                <p className="led-r"><SetsDone parts={setsParts(a.sets, scale)} warmups={a.sets.length} /></p>
                <Verdict kind="new" className="led-v">{t('Ungraded')}</Verdict>
              </article>
            ))}
          </div>
          <ScreenTip id="grade" shown={pickTip({ grade: session.sealed && grade.slots.some(s => !s.ungraded && s.result.verdict !== 'new') }, tipsSeen)} />
        </>
      ) : <p className="quiet">{t('This session had no locked-in plan, so there is nothing to grade.')}</p>}

      {top && (
        <section className="pr-inline" aria-label={t('New bests')}>
          <span className="label">[PR] // {tn(top.lift)}</span>
          {reveal && !prefersReducedMotion()
            ? <DitherNumber text={top.moment.value} height={110} className="accent" />
            : <BigNumber value={top.moment.value} size="display" accent />}
          <p className="pr-inline-sub"><b>{top.moment.unit}</b> {top.moment.caption}</p>
          {prs.length > 1 && <p className="quiet">{t('Also: {list}', { list: prs.slice(1).map(p => `${tn(p.lift)} ${p.moment.value} ${p.moment.unit}`).join(t(', ')) })}</p>}
        </section>
      )}

      {safety.length > 0 && (
        <section className="stack" aria-label={t('Safety')}>
          <span className="label">{t('Safety')}</span>
          {safety.map((x, i) => <p key={i} className="note">{t('// Stop: {text}', { text: x })}</p>)}
        </section>
      )}

      {pace.some(p => p.paceLine) && (
        <section className="bars" aria-label={t('Targets touched')}>
          {pace.filter(p => p.paceLine).map(p => (
            <div key={p.target.id} className="stack tight">
              <DitherBar label={t('{name}: {type} {value} by {date}', { name: p.name, type: TARGET_TYPE_LABELS[p.target.type].toLowerCase(), value: kg(p.target.value), date: formatDate(p.target.deadline, { weekday: false, year: false }) })}
                valueText={p.current !== null && p.target.value > 0 ? `${kg(Math.round(p.current * 10) / 10)}, ${Math.round((p.current / p.target.value) * 100)}%` : p.evidence}
                value={p.current !== null && p.target.value > 0 ? p.current / p.target.value : 0} />
              <p className="quiet">{p.pace ? t('{line}, {word}', { line: p.paceLine, word: feasibilityWord(p.pace.feasibility) }) : p.paceLine}</p>
            </div>
          ))}
        </section>
      )}

      {next && next.status === 'planned' && nextNames && (
        <section className="stack" aria-label={t('Next session')}>
          <p className="note">{t('// Next: {name}. Preview only, the plan locks when you start it.', { name: nextNames.title })}</p>
          <div className="next-list">
            {next.slots.map(sp => (
              <div key={sp.target.slotId} className="next-item">
                <span className="label">{tn(sp.target.exerciseName)}</span>
                <p className="promise-text"><MonoNums text={sp.target.criterion} /></p>
                <p className="quiet">{t('Why: {why}', { why: readable(sp.target.why) })}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="pin">
        <LinkButton variant="primary" block href="#/today" iconEnd="chevron">{t('Done')}</LinkButton>
      </div>
    </section>
  );
}

/** What was done for a slot: the set parts; "warm-ups only" when only warm-ups were saved; a dash when nothing was logged. */
function SetsDone({ parts, warmups }: { parts: string[]; warmups: number }) {
  if (parts.length) return <Parts items={parts} />;
  return warmups ? <>{t('Warm-ups only ({n})', { n: warmups })}</> : <>—</>;
}
