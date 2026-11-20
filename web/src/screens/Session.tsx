// Session logger (#/session/<id>, full screen; spec §3.1, §3.3). Reads the
// committed promise only. No rest countdown, alerts, sounds, vibration,
// notifications or wake lock: rest is a silent elapsed label.
import { useCallback, useMemo, useState } from 'react';
import type { SetEntry } from '../domain/types';
import type { PlannedSet } from '../engine';
import { formatElapsed } from '../engine';
import { addSet, deleteSet, getDb, listExercises, updateSet } from '../db';
import { finishSession, nextSlotOrder, sessionView, type LiveSlot, type SlotOverrides } from '../app/coach';
import { formatDate } from '../app/dates';
import { useLive } from '../ui/useLive';
import { go } from '../ui/router';
import { ConfirmButton } from '../ui/common';
import { LiftBlock, kindsFor, type BlockHandlers } from '../ui/session/LiftBlock';
import { SetSheet, type SetDraft } from '../ui/session/SetSheet';
import { PlateSheet } from '../ui/session/PlateSheet';
import { ExercisePicker } from '../ui/session/ExercisePicker';
import { useNow, useScrollTop } from '../ui/session/useNow';

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
  ...(p.rir !== undefined ? { rir: p.rir } : {}), ...(s?.pain ? { pain: s.pain } : {}),
});

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

  const updateOverrides = useCallback((o: SlotOverrides) => { setOverrides(o); writeOverrides(id, o); }, [id]);

  const log = useCallback(async (slot: LiveSlot, p: { weight: number; reps: number; kind: SetEntry['kind']; rir?: number }, extra: Partial<SetEntry> = {}) => {
    await addSet(getDb(), {
      sessionId: id, exerciseId: slot.exercise.id, exerciseNameSnapshot: slot.exercise.name, slotOrder: slot.slotOrder,
      kind: p.kind, weight: p.weight, reps: p.reps, ...(p.rir !== undefined && p.kind !== 'warmup' ? { rir: p.rir } : {}), ...extra,
    });
  }, [id]);

  const handlers: BlockHandlers = useMemo(() => ({
    logPlanned: (slot, p: PlannedSet) => { void log(slot, p); },
    openNew: (slot, p) => setSheet({ slot, draft: draftFrom(p) }),
    edit: (slot, s) => setSheet({ slot, set: s, draft: draftFrom(s, s) }),
    plates: w => setPlates(w),
    swap: slot => setPicker({ mode: 'swap', slotOrder: slot.slotOrder }),
  }), [log]);

  if (view === undefined) return <section className="screen session-screen" aria-busy="true" />;
  if (view === null) return (
    <section className="screen"><a className="back" href="#/today">‹ Today</a><p className="mid">This session doesn’t exist.</p></section>
  );

  const { session, slots, scale } = view;
  const rested = view.lastSet ? { setId: view.lastSet.id, label: `rested ${formatElapsed(now - view.lastSet.loggedAt)}` } : null;
  const unlogged = slots.reduce((n, s) => n + (s.plan && !s.stopped && !s.swapped ? Math.max(0, s.plan.ghost.length - s.work.length) : 0), 0);

  const save = async (d: SetDraft) => {
    if (!sheet) return;
    const fields = {
      weight: d.weight, reps: d.reps, kind: d.kind, failed: d.failed || undefined, rir: d.kind === 'warmup' ? undefined : d.rir,
      pain: d.pain, note: d.note.trim() || undefined,
    };
    if (sheet.set) await updateSet(getDb(), sheet.set.id, fields);
    else {
      const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) as Partial<SetEntry>;
      await log(sheet.slot, { weight: d.weight, reps: d.reps, kind: d.kind, ...(fields.rir !== undefined ? { rir: fields.rir } : {}) }, clean);
    }
    setSheet(null);
  };

  const finish = async () => { await finishSession(getDb(), id, Date.now()); go(`review/${id}`); };

  return (
    <section className="screen session-screen">
      <div className="session-top">
        <a className="back" href="#/today">‹ Today</a>
        <div className="stack tight" style={{ alignItems: 'flex-end' }}>
          <span className="heading">{session.nameSnapshot}</span>
          <span className="mono micro mid">{formatDate(session.date, { year: false })} · {formatElapsed(now - session.startedAt)}</span>
        </div>
      </div>
      {session.sealed && (
        <div className="banner spread"><span>Finished. Changes are marked “edited”.</span><a className="btn" href={`#/review/${id}`}>Review</a></div>
      )}
      {!view.commit && <p className="mid">This session has no committed promise; sets are logged ungraded.</p>}

      {slots.map(s => <LiftBlock key={s.slotOrder} slot={s} scale={scale} h={handlers} rested={rested} />)}

      <button type="button" className="btn" onClick={() => setPicker({ mode: 'add' })}>+ Add a lift (ungraded)</button>

      <div className="finish-bar">
        {session.sealed ? (
          <a className="btn primary commit-cta" href={`#/review/${id}`}>Back to review</a>
        ) : unlogged > 0 ? (
          <ConfirmButton className="primary commit-cta" confirmLabel={`Finish with ${unlogged} planned set${unlogged === 1 ? '' : 's'} unlogged?`} onConfirm={finish}>
            Finish
          </ConfirmButton>
        ) : (
          <button type="button" className="btn primary commit-cta" onClick={finish}>Finish</button>
        )}
      </div>

      {sheet && (
        <SetSheet open title={sheet.set ? `Edit set · ${sheet.slot.exercise.name}` : `Log set · ${sheet.slot.exercise.name}`}
          initial={sheet.draft} step={sheet.slot.exercise.increment || 2.5} scale={scale} kinds={kindsFor(sheet.slot)}
          saveLabel={sheet.set ? 'Save' : 'Log set'} onSave={save} onClose={() => setSheet(null)}
          onDelete={sheet.set ? async () => { await deleteSet(getDb(), sheet.set!.id); setSheet(null); } : undefined} />
      )}
      <PlateSheet weight={plates} plates={view.plates} onClose={() => setPlates(null)} />
      <ExercisePicker open={!!picker} title={picker?.mode === 'swap' ? 'Swap lift (logged, not graded)' : 'Add a lift (ungraded)'}
        exercises={exercises ?? []} onClose={() => setPicker(null)}
        onPick={e => {
          if (picker?.mode === 'swap') updateOverrides({ ...overrides, swaps: { ...overrides.swaps, [picker.slotOrder]: e.id } });
          else updateOverrides({ ...overrides, added: [...(overrides.added ?? []), { slotOrder: nextSlotOrder(view), exerciseId: e.id }] });
          setPicker(null);
        }} />
    </section>
  );
}
