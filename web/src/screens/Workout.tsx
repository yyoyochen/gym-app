// Today's workout (#/workout): a one-off workout, already planned from this
// week's training and the goals; change any lift, add or remove lifts, or
// clear it and build your own. Start locks it like a program session
// (docs/superpowers/specs/2026-11-23-plan-todays-workout-design.md).
import { useEffect, useMemo, useState } from 'react';
import type { Exercise, GoalKind, Readiness, Session } from '../domain/types';
import { getDb, getOpenSession, listExercises } from '../db';
import { DemoBanner } from '../app/DemoBanner';
import { todayISO } from '../app/dates';
import { estimateMinutes, isMain, slotFor, type DraftSlot, type PartWeek } from '../app/suggest';
import { bodyPartLabel, bodyPartOf, type BodyPart } from '../app/weekSets';
import {
  canStartWorkout, commitWorkout, draftKey, focusState, loadDraft, planSummary, planWorkout, saveDraft, suggestDraft, swapLift, type WorkoutDraft, type WorkoutPlan,
} from '../app/workout';
import { WorkoutLiftSheet } from '../app/parts/WorkoutLiftSheet';
import { newId } from '../db/util';
import { Button, DragList, NavBar, PixelIcon, go } from '../ui/kit';
import { ExercisePicker } from '../ui/session/ExercisePicker';
import { t, tn } from '../i18n';

const READINESS: readonly Readiness[] = ['green', 'amber', 'red'];

export function Workout({ params }: { params: string[] }) {
  const today = todayISO();
  // Today's check-in, when the lifter came from it (#/workout/<readiness>); green otherwise.
  const readiness: Readiness = READINESS.find(r => r === params[0]) ?? 'green';
  const [draft, setDraft] = useState<WorkoutDraft | null>(null);
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [rows, setRows] = useState<PartWeek[]>([]);
  const [goal, setGoal] = useState<GoalKind>('maintain');
  const [goalIds, setGoalIds] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Session | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [picker, setPicker] = useState<{ swap?: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const db = getDb();
    void Promise.all([loadDraft(db, today), focusState(db, today), getOpenSession(db), listExercises(db)]).then(([d, f, o, ex]) => {
      setDraft(d); setRows(f.rows); setGoal(f.goal); setGoalIds(f.goalLiftIds); setOpen(o ?? null); setExercises(ex);
    });
  }, [today]);
  // Every change is kept for the day, and re-planned with the engine.
  useEffect(() => {
    if (!draft) return;
    const db = getDb();
    void saveDraft(db, draft);
    let live = true;
    void planWorkout(db, draft, today, Date.now(), { readiness }).then(p => { if (live) setPlan(p); });
    return () => { live = false; };
  }, [draft, today, readiness]);

  const minutes = useMemo(() => (draft ? estimateMinutes(draft.slots.map(s => s.slot)) : 0), [draft]);
  if (!draft) return <section className="screen" aria-busy="true"><NavBar title={t("Today's workout")} backLabel={t('Today')} fallback="today" /></section>;

  const setSlots = (slots: DraftSlot[]) => setDraft({ ...draft, slots });
  const toggle = async (part: BodyPart) => {
    const focus = draft.focus.includes(part) ? draft.focus.filter(p => p !== part) : [...draft.focus, part];
    setDraft(await suggestDraft(getDb(), today, focus));
  };
  const add = (ex: Exercise) => {
    const part = ex.muscles[0] ? bodyPartOf(ex.muscles[0]) : null;
    setSlots([...draft.slots, { slot: slotFor(ex, goal, isMain(ex) || goalIds.has(ex.id), newId('slot')), part }]);
  };
  const swap = (i: number, ex: Exercise) => setSlots(draft.slots.map((s, j) => (j === i ? swapLift(s, ex, goal, goalIds) : s)));
  const start = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      const s = await commitWorkout(getDb(), plan, plan.readiness, Date.now());
      go(`session/${s.id}`, { replace: true });
    } finally { setBusy(false); }
  };
  // Only a plan built from the draft on screen can be shown as current or started.
  const ready = !!plan && plan.draftKey === draftKey(draft);
  const canStart = !!ready && canStartWorkout(open, plan!);

  return (
    <section className="screen workout">
      <DemoBanner />
      <NavBar title={t("Today's workout")} backLabel={t('Today')} fallback="today" />

      <div className="wk-focus">
        <span className="label">{t('Focus')}</span>
        <div className="wk-chips">
          {rows.map(r => {
            const on = draft.focus.includes(r.part);
            return (
              <button key={r.part} type="button" className={`chip wk-chip${on ? ' on' : ''}`} aria-pressed={on} data-press="dim" onClick={() => { void toggle(r.part); }}>
                {bodyPartLabel(r.part)} {r.done}/{r.target}
              </button>
            );
          })}
        </div>
      </div>

      <div className="wk-lifts">
        <div className="tk-hd"><h2>{draft.slots.length === 1 ? t('{n} lift', { n: 1 }) : t('{n} lifts', { n: draft.slots.length })}</h2>{draft.slots.length > 0 && <span className="tk-hd-r"><span>{t('about {n} min', { n: minutes })}</span></span>}</div>
        <DragList items={draft.slots} keyOf={s => s.slot.id} longPress onReorder={setSlots}
          labelOf={s => tn(exercises.find(e => e.id === s.slot.exerciseId)?.name ?? s.slot.exerciseId)}
          render={(s, i) => {
            const sp = ready ? plan!.slots[i] : null;
            return (
              <button type="button" className="wk-lift" data-press="row" onClick={() => sp && setEditing(i)}>
                <span className="wk-lift-main">
                  <b>{tn(sp?.exercise.name ?? exercises.find(e => e.id === s.slot.exerciseId)?.name ?? s.slot.exerciseId)}</b>
                  <span className="wk-rx">{sp ? planSummary(sp.target, sp.plannedSets) : '…'}</span>
                  {ready && <span className="wk-why">{plan!.reasons[i]}</span>}
                </span>
                <PixelIcon name="chevron" scale={1} />
              </button>
            );
          }} />
      </div>

      <Button block className="wk-add" icon="plus" onClick={() => setPicker({})}>{t('Add a lift')}</Button>
      {draft.slots.length > 0 && <button type="button" className="link wk-clear" onClick={() => setDraft({ ...draft, focus: [], slots: [] })}>{t('Clear and build my own')}</button>}

      <div className="pin">
        {open && <p className="quiet">{t('Finish the session in progress first.')}</p>}
        <Button variant="primary" block iconEnd="chevron" disabled={!canStart || busy} onClick={start}>{t('Start workout')}</Button>
      </div>

      {editing !== null && ready && draft.slots[editing] && (
        <WorkoutLiftSheet item={draft.slots[editing]} plan={plan!.slots[editing]} onClose={() => setEditing(null)}
          onDone={next => { setSlots(draft.slots.map((s, j) => (j === editing ? next : s))); setEditing(null); }}
          onSwap={() => { setPicker({ swap: editing }); setEditing(null); }}
          onRemove={() => { setSlots(draft.slots.filter((_, j) => j !== editing)); setEditing(null); }} />
      )}
      <ExercisePicker open={!!picker} exercises={exercises} title={picker?.swap !== undefined ? t('Swap lift') : t('Add a lift')}
        onClose={() => setPicker(null)}
        onPick={ex => { if (picker?.swap !== undefined) swap(picker.swap, ex); else add(ex); setPicker(null); }} />
    </section>
  );
}
