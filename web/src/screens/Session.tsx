// Session logger (#/session/<id>, full screen; spec §3.1, §3.3). Reads the
// committed promise only. The next set is the hero; one tap logs it as
// planned, "Adjust" opens the set sheet. No rest countdown, alerts, sounds,
// notifications or wake lock: rest is a silent elapsed label. The PR moment
// plays when a set is a new best.
import { useCallback, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { SetEntry } from '../domain/types';
import type { PlannedSet } from '../engine';
import { formatElapsed } from '../engine';
import { addSet, deleteSet, getDb, getExerciseHistory, listExercises, updateSet } from '../db';
import { finishSession, isBarbell, kg, nextSlotOrder, platesPerSide, sessionView, type LiveSlot, type SlotOverrides } from '../app/coach';
import { useLive } from '../ui/useLive';
import { Button, ConfirmButton, DitherBar, LinkButton, PixelIcon, back, go, showPrMoment } from '../ui/kit';
import { LiftBlock, type BlockHandlers } from '../ui/session/LiftBlock';
import { SetSheet, type SetDraft } from '../ui/session/SetSheet';
import { PlateSheet } from '../ui/session/PlateSheet';
import { ExercisePicker } from '../ui/session/ExercisePicker';
import { useNow, useScrollTop } from '../ui/session/useNow';
import { pickTip } from '../app/tips';
import { ScreenTip, useTipsSeen } from '../app/parts/ScreenTip';
import { focusSlot, liftRows, nextAction, nextLabel, rowLabelOf, sessionCount, undoable, loggerTips, type SheetRow } from '../ui/session/logger';
import { priorFromHistory, prMomentFor } from '../ui/session/prs';
import { effortWords, sessionNames } from '../ui/session/text';
import { formatDate } from '../app/dates';
import { t, te, tn, tr } from '../i18n';

const key = (id: string) => `gymbro.session.${id}.overrides`;
function readOverrides(id: string): SlotOverrides {
  try { return JSON.parse(localStorage.getItem(key(id)) ?? '{}') as SlotOverrides; } catch { return {}; }
}
function writeOverrides(id: string, o: SlotOverrides) {
  try { localStorage.setItem(key(id), JSON.stringify(o)); } catch { /* private mode: swaps last until reload */ }
}

type SheetState = { slot: LiveSlot; set?: SetEntry; draft: SetDraft } | null;
type PickerState = { mode: 'swap'; slotOrder: number } | { mode: 'add' } | null;

const draftFrom = (p: { weight: number; reps: number; rir?: number; kind: SetEntry['kind'] }, s?: SetEntry): SetDraft => ({
  weight: p.weight, reps: p.reps, kind: p.kind, failed: !!s?.failed, note: s?.note ?? '',
  ...(p.rir !== undefined && p.kind !== 'warmup' ? { rir: p.rir } : {}), ...(s?.pain ? { pain: s.pain } : {}),
});

/** What "+ Add set" pre-fills: the last working set, else the last planned row. */
function lastPlanned(slot: LiveSlot): PlannedSet {
  const w = slot.work[slot.work.length - 1];
  if (w) return { kind: w.kind, weight: w.weight, reps: w.reps, ...(w.rir !== undefined ? { rir: w.rir } : {}) };
  const ghost = slot.plan && !slot.swapped ? slot.plan.ghost : [];
  return ghost[ghost.length - 1] ?? { kind: 'working', weight: slot.sets[slot.sets.length - 1]?.weight ?? 0, reps: 8 };
}

/** The PR moment when the set beats every earlier set of the lift. */
async function celebrate(saved: SetEntry, lift: string): Promise<void> {
  if (saved.kind === 'warmup' || saved.failed) return;
  const days = await getExerciseHistory(getDb(), saved.exerciseId);
  const moment = prMomentFor(saved, priorFromHistory(days, saved.id), lift);
  if (moment) showPrMoment(moment);
}

export function Session({ params }: { params: string[] }) {
  const id = params[0];
  const [overrides, setOverrides] = useState<SlotOverrides>(() => readOverrides(id));
  const ovKey = JSON.stringify(overrides);
  const view = useLive(db => sessionView(db, id, overrides), [id, ovKey]);
  const exercises = useLive(db => listExercises(db), []);
  const now = useNow(1000);
  useScrollTop(id);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [plates, setPlates] = useState<number | null>(null);
  const [picker, setPicker] = useState<PickerState>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const busy = useRef(false);
  const tipsSeen = useTipsSeen();

  const updateOverrides = useCallback((o: SlotOverrides) => { setOverrides(o); writeOverrides(id, o); }, [id]);

  const log = useCallback((slot: LiveSlot, p: { weight: number; reps: number; kind: SetEntry['kind']; rir?: number }, extra: Partial<SetEntry> = {}) =>
    addSet(getDb(), {
      sessionId: id, exerciseId: slot.exercise.id, exerciseNameSnapshot: slot.exercise.name, slotOrder: slot.slotOrder,
      kind: p.kind, weight: p.weight, reps: p.reps, ...(p.rir !== undefined && p.kind !== 'warmup' ? { rir: p.rir } : {}), ...extra,
    }), [id]);

  const logPlanned = useCallback(async (slot: LiveSlot, p: PlannedSet) => {
    if (busy.current) return; // one tap, one set
    busy.current = true;
    try { await celebrate(await log(slot, p), slot.exercise.name); } finally { busy.current = false; }
  }, [log]);

  const handlers: BlockHandlers = useMemo(() => ({
    adjust: (slot, r) => { if (slot.plan && !slot.swapped) setChosen(slot.slotOrder); setSheet({ slot, draft: draftFrom(r.planned ?? r) }); },
    edit: (slot, s) => setSheet({ slot, set: s, draft: draftFrom(s, s) }),
    addSet: slot => setSheet({ slot, draft: draftFrom(lastPlanned(slot)) }),
    swap: slot => setPicker({ mode: 'swap', slotOrder: slot.slotOrder }),
    focus: slot => { if (liftRows(slot).next) setChosen(slot.slotOrder); },
  }), []);

  if (view === undefined) return <section className="screen logger" aria-busy="true" />;
  if (view === null) return (
    <section className="screen logger"><LinkButton variant="quiet" href="#/today" icon="back">{t('Today')}</LinkButton><p className="quiet">{t('This session doesn’t exist.')}</p></section>
  );

  const { session, slots, scale } = view;
  const names = sessionNames(session.nameSnapshot);
  const focus = focusSlot(slots, chosen);
  const next: SheetRow | null = focus ? liftRows(focus).next : null;
  const count = sessionCount(slots);
  const graded = slots.filter(s => s.plan);
  const unlogged = slots.reduce((n, s) => n + (s.plan && !s.stopped && !s.swapped ? Math.max(0, s.plan.ghost.length - s.work.length) : 0), 0);
  const last = view.lastSet;
  const lastAt = last ? rowLabelOf(slots, last.id) : null;
  const rest = last && lastAt
    ? lastAt.lift !== focus?.exercise.name
      ? t('Rested {time} since {lift}, {label}', { time: formatElapsed(now - last.loggedAt), lift: tn(lastAt.lift), label: lastAt.label })
      : t('Rested {time} since {label}', { time: formatElapsed(now - last.loggedAt), label: lastAt.label })
    : null;
  const tip = pickTip(loggerTips({ hasNext: !!focus && !!next, sealed: session.sealed, last: last ?? null, now }), tipsSeen);
  const act = focus && next ? nextAction(next, focus.exercise.bodyweightFactor) : null;
  const load = focus && next && isBarbell(focus.exercise) ? platesPerSide(next.weight, view.plates.barKg, view.plates.platesKg) : null;
  const note = focus?.nudge
    ? { kind: focus.nudge.kind, text: te(focus.nudge.text) }
    : focus?.plan?.pain?.painCheck && !focus.work.length
      ? { kind: 'stop' as const, text: t('Pain check first: how does it feel warming up? {reason}', { reason: te(focus.plan.pain.reasons[0] ?? '') }).trim() }
      : null;

  const save = async (d: SetDraft) => {
    if (!sheet) return;
    const fields = {
      weight: d.weight, reps: d.reps, kind: d.kind, failed: d.failed || undefined, rir: d.kind === 'warmup' ? undefined : d.rir,
      pain: d.pain, note: d.note.trim() || undefined,
    };
    if (sheet.set) await updateSet(getDb(), sheet.set.id, fields);
    else {
      const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) as Partial<SetEntry>;
      const { slot } = sheet;
      const saved = await log(slot, { weight: d.weight, reps: d.reps, kind: d.kind, ...(fields.rir !== undefined ? { rir: fields.rir } : {}) }, clean);
      // Close the sheet (and its history entry) before the PR moment opens its own, so back closes only the moment.
      flushSync(() => setSheet(null));
      await celebrate(saved, slot.exercise.name);
      return;
    }
    setSheet(null);
  };

  const finish = async () => { await finishSession(getDb(), id, Date.now()); go(`review/${id}`); };
  const finishButton = session.sealed ? (
    <LinkButton variant="primary" block href={`#/review/${id}`} iconEnd="chevron">{t('Back to review')}</LinkButton>
  ) : unlogged > 0 ? (
    <ConfirmButton className="primary block split" confirmLabel={unlogged === 1 ? t('Finish with {n} planned set unlogged?', { n: unlogged }) : t('Finish with {n} planned sets unlogged?', { n: unlogged })}
      confirmText={t('Finish session')} onConfirm={finish}>{t('Finish session')}</ConfirmButton>
  ) : (
    <Button variant="primary" block iconEnd="chevron" onClick={finish}>{t('Finish session')}</Button>
  );

  return (
    <section className="screen logger">
      <header className="lhead">
        <button type="button" className="lhead-close" data-press="dim" onClick={() => back('today')}><PixelIcon name="back" />{t('Back')}</button>
        <span className="lhead-mid">[{names.short}]{focus ? ` // ${tn(focus.exercise.name)}` : ''}</span>
        {session.programSessionKey === 'adhoc'
          ? <span className="lhead-t tnum">{formatDate(session.date, { weekday: false })}</span>
          : <span className="lhead-t tnum" aria-label={t('Session time {time}', { time: formatElapsed(now - session.startedAt) })}>{formatElapsed(now - session.startedAt)}</span>}
      </header>

      {session.sealed && (
        <div className="banner spread"><span>{t('Finished. Changes are marked “edited”.')}</span><LinkButton href={`#/review/${id}`}>{t('Review')}</LinkButton></div>
      )}
      {!view.commit && <p className="note">{t('// Note: this session has no locked-in plan; sets are logged ungraded.')}</p>}

      {count.planned > 0 && (
        <DitherBar label={names.short} valueText={t('{done} of {planned} sets', { done: count.done, planned: count.planned })} value={count.done / count.planned} />
      )}

      {focus && next && !session.sealed ? (
        <div className="next">
          <span className="label">{nextLabel(next)}</span>
          <div className="next-hero" aria-label={act!.needsWeight ? t('No weight set yet × {reps}', { reps: next.reps }) : t('{w} kilograms × {reps}', { w: kg(next.weight), reps: next.reps })}>
            <span className="next-w">{act!.hero}</span><span className="next-r"> × {next.reps}</span>
          </div>
          <div className="next-meta">
            {act!.caption && <span>{act!.caption}</span>}
            <span>{next.warm ? t('Warm-up') : t('Effort')}{next.rir !== undefined && !next.warm && <b> {effortWords(next.rir, scale)}</b>}</span>
            {load && !load.belowBar && (
              <button type="button" className="next-plates" data-press="dim" onClick={() => setPlates(next.weight)}>
                {tr('Plates each side {plates}', { plates: <b>{load.perSide.length ? load.perSide.map(kg).join(' + ') : t('empty bar')}</b> })}
              </button>
            )}
          </div>
          <div className="next-actions">
            {act!.needsWeight ? (
              <Button variant="primary" block iconEnd="chevron" className="log-btn" onClick={() => handlers.adjust(focus, next)}>{act!.primaryLabel}</Button>
            ) : (
              <>
                <Button variant="primary" block icon="check" className="log-btn" onClick={() => { void logPlanned(focus, next.planned!); }}>{act!.primaryLabel}</Button>
                <Button block className="adjust-btn" onClick={() => handlers.adjust(focus, next)}>{t('Adjust weight, reps, effort')}</Button>
              </>
            )}
          </div>
          <ScreenTip id="log" shown={tip} />
        </div>
      ) : graded.length > 0 && (
        <div className="next">
          <span className="label">{session.sealed ? t('Finished') : t('Every planned set is logged')}</span>
          <div className="next-hero"><span className="next-w">{count.done}</span><span className="next-r"> {t('of {n}', { n: count.planned })}</span></div>
          <div className="next-meta"><span>{t('Sets logged. Add a set below, or finish.')}</span></div>
          <div className="next-actions">{finishButton}</div>
        </div>
      )}

      {(rest || note) && (
        <div className="stack">
          {rest && (
            <p className="rested tnum" aria-live="off">
              {rest}
              {last && undoable(last, now) && (
                <button type="button" className="undo" data-press="dim" onClick={() => deleteSet(getDb(), last.id)}>{t('Undo last set')}</button>
              )}
            </p>
          )}
          <ScreenTip id="undo" shown={tip} />
          {note && <p className={`note nudge ${note.kind}`} role="status">{note.kind === 'stop' ? t('// Stop: {text}', { text: note.text }) : t('// Note: {text}', { text: note.text })}</p>}
        </div>
      )}

      <div className="lg-spec-list">
        {slots.map(s => (
          <LiftBlock key={s.slotOrder} slot={s} scale={scale} h={handlers} focused={!!focus && s.slotOrder === focus.slotOrder}
            index={graded.indexOf(s) + 1} count={graded.length} />
        ))}
      </div>

      <Button block icon="plus" onClick={() => setPicker({ mode: 'add' })}>{t('Add a lift (ungraded)')}</Button>
      {((next && !session.sealed) || !graded.length) && <div className="finish">{finishButton}</div>}

      {sheet && (
        <SetSheet open title={sheet.set ? t('Edit set: {name}', { name: tn(sheet.slot.exercise.name) }) : t('Log set: {name}', { name: tn(sheet.slot.exercise.name) })}
          initial={sheet.draft} step={sheet.slot.exercise.increment || 2.5} scale={scale}
          saveLabel={sheet.set ? t('Save') : t('Log set')} onSave={save} onClose={() => setSheet(null)}
          onDelete={sheet.set ? async () => { await deleteSet(getDb(), sheet.set!.id); setSheet(null); } : undefined} />
      )}
      <PlateSheet weight={plates} plates={view.plates} onClose={() => setPlates(null)} />
      <ExercisePicker open={!!picker} title={picker?.mode === 'swap' ? t('Swap lift (logged, not graded)') : t('Add a lift (ungraded)')}
        exercises={exercises ?? []} onClose={() => setPicker(null)}
        onPick={e => {
          if (picker?.mode === 'swap') updateOverrides({ ...overrides, swaps: { ...overrides.swaps, [picker.slotOrder]: e.id } });
          else updateOverrides({ ...overrides, added: [...(overrides.added ?? []), { slotOrder: nextSlotOrder(view), exerciseId: e.id }] });
          setPicker(null);
        }} />
    </section>
  );
}
