// Program editor (spec §3.8). Every edit saves the active program at once.
// Edits apply from the next commit; committed sessions never change.
// Sessions are spec-sheet blocks (inverted key cell), slots are rows; slot
// and session edits happen in kit Sheets.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { BenchmarkKey, Exercise, ModelKind, PainArea, Program, ProgramSession, Slot, SlotParams, SlotType } from '../domain/types';
import { getActiveProgram, getDb, listExercises, putExercise, saveProgram, seedCatalog } from '../db';
import { exerciseIdFor, nameKey } from '../domain/catalog';
import { useLive } from '../ui/useLive';
import { ConfirmButton, Errors, Group, Segmented, Sheet, Stepper } from '../ui/common';
import { Button, LabelValueGrid, NavBar, Parts, PixelIcon, Toggle, showHud } from '../ui/kit';
import { DemoBanner } from '../app/DemoBanner';
import { PAIN_AREAS, PAIN_AREA_LABELS } from '../app/labels';
import {
  MODEL_LABELS, addSession, addSlot, blankProgram, changeModel, deleteSession, describeSlot, moveSession, moveSlot, removeSlot,
  renameSession, setInRotation, swapExercise, toggleMinimum, uniqueExerciseId, updateSlot,
} from '../app/program';
import { parseNum, validateSlotParams } from '../app/validate';
import { programFromTemplate } from '../domain/templates';
import { TemplateList, sessionTitle } from '../app/parts/TemplatePicker';
import { getLang, t, tn } from '../i18n';

const MODELS: ModelKind[] = ['double', 'topset', 'linear5x5', 'fixed'];
const MODEL_SHORT: Record<ModelKind, string> = {
  get double() { return t('Reps first'); },
  get topset() { return t('Top set'); },
  linear5x5: '5 × 5',
  get fixed() { return t('Fixed'); },
};

type Editing = { key: string; slotId: string };

export function ProgramEditor(_props: { params: string[] }) {
  const live = useLive(db => getActiveProgram(db).then(p => p ?? null), []);
  const exercises = useLive(db => listExercises(db), []) ?? [];
  const [prog, setProg] = useState<Program | null>(null);
  const [picker, setPicker] = useState<{ key: string; swapSlotId?: string } | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => { seedCatalog(getDb()).catch(() => undefined); }, []);
  // Local copy is the source of truth while our own saves are in flight, so a
  // slower live update can't roll back a quicker second edit.
  const cur = useRef<Program | null>(null);
  const pending = useRef(0);
  useEffect(() => {
    if (live !== undefined && pending.current === 0) { cur.current = live; setProg(live); }
  }, [live]);

  const exById = useMemo(() => new Map(exercises.map(e => [e.id, e])), [exercises]);
  const exName = (id: string) => { const e = exById.get(id); return e ? tn(e.name) : undefined; };
  const apply = (f: (p: Program) => Program) => {
    if (!cur.current) return;
    const next = f(cur.current);
    cur.current = next;
    setProg(next);
    pending.current++;
    saveProgram(getDb(), next).catch(e => console.error(e)).finally(() => { pending.current--; });
  };

  if (live === undefined) return <section className="screen setup"><NavBar title={t('Program')} backLabel={t('Profile')} fallback="profile" /></section>;

  const templates = (
    <TemplateList exercises={exercises} renderAction={id => (
      <ConfirmButton className="primary block" confirmLabel={prog ? t('Replace your program with this example?') : t('Start from this example?')}
        message={prog ? t('Sessions already started don’t change.') : undefined} confirmText={prog ? t('Replace program') : t('Use this example')} onConfirm={async () => {
          const p = programFromTemplate(id);
          await saveProgram(getDb(), p);
          cur.current = p; setProg(p); setShowTemplates(false);
          showHud(t('Program set'));
        }}>{prog ? t('Replace with this') : t('Start from this')}</ConfirmButton>
    )} />
  );

  const editSession = prog?.sessions.find(s => s.key === sessionKey);
  const editSlot = editing && prog?.sessions.find(x => x.key === editing.key);
  const slot = editing && editSlot?.slots.find(x => x.id === editing.slotId);

  return (
    <section className="screen setup">
      <DemoBanner />
      <NavBar title={t('Program')} backLabel={t('Profile')} fallback="profile" />
      <p className="note">{t('// Note: edits apply to sessions you start from now on. Sessions already started keep their plan.')}</p>

      {!prog && (
        <>
          <p className="quiet">{t('No program yet. Plan your own, or start from one of the examples below and change it to suit you.')}</p>
          <Button variant="primary" block iconEnd="plus" onClick={async () => {
            const p = blankProgram();
            await saveProgram(getDb(), p);
            cur.current = p; setProg(p);
            showHud(t('Program started'));
          }}>{t('Plan my own')}</Button>
          <span className="label">{t('Examples')}</span>
          {templates}
        </>
      )}

      {prog && (
        <>
          <div className="prog-head">
            <label className="field-wrap">
              <span className="label">{t('Program name')}</span>
              <input className="field prog-name" value={tn(prog.name)} onChange={e => apply(p => ({ ...p, name: e.target.value }))} />
            </label>
            <LabelValueGrid items={[
              { label: t('Rotation'), value: prog.rotation.length ? prog.rotation.join(' → ') : t('None'), accent: true },
              { label: t('Sessions'), value: t('{n} ({slots} slots)', { n: prog.sessions.length, slots: prog.sessions.reduce((n, s) => n + s.slots.length, 0) }) },
            ]} />
          </div>

          {prog.sessions.map(s => (
            <SessionBlock key={s.key} s={s} inRotation={prog.rotation.includes(s.key)} exById={exById} apply={apply}
              onEditSession={() => setSessionKey(s.key)} onAdd={() => setPicker({ key: s.key })} onEdit={slotId => setEditing({ key: s.key, slotId })} />
          ))}
          <Button block iconEnd="plus" onClick={() => apply(p => addSession(p))}>{t('Add session')}</Button>

          <Group label={t('Examples')}>
            <p className="quiet">{t('Ready-made programs to start from. Using one replaces your sessions and lifts.')}</p>
            <Button block iconEnd="chevron" onClick={() => setShowTemplates(true)}>{t('Start from an example')}</Button>
          </Group>
        </>
      )}

      <Sheet className="setup-sheet" open={showTemplates} title={t('Example programs')} detents={['large']} onClose={() => setShowTemplates(false)}>{templates}</Sheet>

      <ExercisePicker open={!!picker} exercises={exercises} title={picker?.swapSlotId ? t('Swap exercise') : t('Add exercise')}
        onClose={() => setPicker(null)}
        onPick={ex => {
          if (!picker) return;
          apply(p => (picker.swapSlotId ? swapExercise(p, picker.key, picker.swapSlotId, ex.id) : addSlot(p, picker.key, ex)));
          setPicker(null);
        }} />

      <Sheet className="setup-sheet" open={!!editSession} title={editSession ? t('Session {key}', { key: editSession.key }) : t('Session')} onClose={() => setSessionKey(null)}>
        {editSession && prog && <SessionForm s={editSession} index={prog.sessions.indexOf(editSession)} count={prog.sessions.length}
          inRotation={prog.rotation.includes(editSession.key)} apply={apply} onDeleted={() => setSessionKey(null)} />}
      </Sheet>

      <Sheet className="setup-sheet" open={!!(editing && slot)} title={slot ? exName(slot.exerciseId) ?? t('Slot') : t('Slot')} onClose={() => setEditing(null)}>
        {editing && slot && editSlot && <SlotForm key={slot.id} slot={slot} session={editSlot} exercise={exById.get(slot.exerciseId)}
          minimum={editSlot.minimumSlotIds.includes(slot.id)}
          onSave={(next, min) => {
            apply(p => {
              let q = updateSlot(p, editing.key, slot.id, () => next);
              if (min !== editSlot.minimumSlotIds.includes(slot.id)) q = toggleMinimum(q, editing.key, slot.id);
              return q;
            });
            setEditing(null);
            showHud(t('Slot saved'));
          }}
          onSwap={() => { setEditing(null); setPicker({ key: editing.key, swapSlotId: slot.id }); }}
          onRemove={() => { apply(p => removeSlot(p, editing.key, slot.id)); setEditing(null); }} />}
      </Sheet>
    </section>
  );
}

function SessionBlock({ s, inRotation, exById, apply, onEditSession, onAdd, onEdit }: {
  s: ProgramSession; inRotation: boolean; exById: Map<string, Exercise>; apply: (f: (p: Program) => Program) => void;
  onEditSession: () => void; onAdd: () => void; onEdit: (slotId: string) => void;
}) {
  return (
    <section className={`sess${inRotation ? '' : ' off'}`} aria-label={t('Session {key}', { key: s.key })}>
      <button type="button" className="sess-hd" data-press="row" onClick={onEditSession} aria-label={t('Edit session {key}: {name}', { key: s.key, name: sessionTitle(s) })}>
        <span className="key-inv">{tn(s.key)}</span>
        <span className="sess-name">{sessionTitle(s)}</span>
        <span className="sess-meta">{inRotation ? t('{n} slots', { n: s.slots.length }) : t('Off rotation')}</span>
        <PixelIcon name="edit" />
      </button>
      {s.slots.length === 0 && <p className="quiet sess-empty">{t('No exercises yet.')}</p>}
      {s.slots.map((sl, j) => {
        const ex = exById.get(sl.exerciseId);
        const exLabel = ex ? tn(ex.name) : undefined;
        const min = s.minimumSlotIds.includes(sl.id);
        return (
          <div key={sl.id} className="srow slot-row">
            <span className="srow-k">{j + 1}</span>
            <button type="button" className="srow-main slot-open" data-press="dim" onClick={() => onEdit(sl.id)}>
              <span className="srow-v">{exLabel ?? sl.exerciseId}</span>
              <span className="srow-sub"><Parts items={[...(sl.model === 'topset' ? [] : [MODEL_SHORT[sl.model]]), describeSlot(sl), ...(min ? [t('in minimum version')] : [])]} /></span>
            </button>
            <span className="reorder">
              <button type="button" className="icon-btn" aria-label={exLabel ? t('Move {name} up', { name: exLabel }) : t('Move slot up')} disabled={j === 0} data-press="dim"
                onClick={() => apply(p => moveSlot(p, s.key, sl.id, -1))}><PixelIcon name="up" /></button>
              <button type="button" className="icon-btn" aria-label={exLabel ? t('Move {name} down', { name: exLabel }) : t('Move slot down')} disabled={j === s.slots.length - 1} data-press="dim"
                onClick={() => apply(p => moveSlot(p, s.key, sl.id, 1))}><PixelIcon name="down" /></button>
            </span>
          </div>
        );
      })}
      <button type="button" className="slot-add" data-press="row" onClick={onAdd}><span>{t('Add exercise')}</span><PixelIcon name="plus" /></button>
    </section>
  );
}

function SessionForm({ s, index, count, inRotation, apply, onDeleted }: {
  s: ProgramSession; index: number; count: number; inRotation: boolean; apply: (f: (p: Program) => Program) => void; onDeleted: () => void;
}) {
  return (
    <>
      <label className="field-wrap">
        <span className="label">{t('Session name')}</span>
        <input className="field" value={tn(s.name)} onChange={e => apply(p => renameSession(p, s.key, e.target.value))} />
      </label>
      <Toggle label={t('In rotation')} hint={t('Off keeps the session in the program but out of the A → B → C order.')} checked={inRotation}
        onChange={v => apply(p => setInRotation(p, s.key, v))} />
      <div className="grid2">
        <Button icon="up" disabled={index === 0} onClick={() => apply(p => moveSession(p, s.key, -1))}>{t('Move up')}</Button>
        <Button icon="down" disabled={index === count - 1} onClick={() => apply(p => moveSession(p, s.key, 1))}>{t('Move down')}</Button>
      </div>
      <ConfirmButton danger className="block" confirmLabel={t('Delete session {key} and its {n} slots?', { key: s.key, n: s.slots.length })}
        message={t('Sessions already logged keep their sets.')} confirmText={t('Delete session {key}', { key: s.key })} onConfirm={() => { onDeleted(); apply(p => deleteSession(p, s.key)); }}>
        {t('Delete session')}
      </ConfirmButton>
    </>
  );
}

function SlotForm({ slot, session, exercise, minimum, onSave, onSwap, onRemove }: {
  slot: Slot; session: ProgramSession; exercise?: Exercise; minimum: boolean;
  onSave: (s: Slot, minimum: boolean) => void; onSwap: () => void; onRemove: () => void;
}) {
  const [draft, setDraft] = useState<Slot>(slot);
  const [min, setMin] = useState(minimum);
  const [errors, setErrors] = useState<string[]>([]);
  const p = draft.params;
  const set = (patch: Partial<SlotParams>) => setDraft({ ...draft, params: { ...p, ...patch } });
  const top = draft.model === 'topset';
  const name = exercise ? tn(exercise.name) : t('this exercise');
  return (
    <>
      <div className="slot-spec"><span className="key-inv">{tn(session.key)}</span><Parts items={[MODEL_LABELS[draft.model], describeSlot(draft)]} /></div>
      <Segmented<ModelKind> label={t('Model')} value={draft.model} onChange={m => setDraft(changeModel(draft, m, exercise?.slotType))}
        options={MODELS.map(m => ({ value: m, label: MODEL_SHORT[m] }))} />
      <div className="grid2 steppers">
        {top
          ? <>
              <Stepper label={t('Top-set reps')} value={p.topReps ?? 2} min={1} max={5} onChange={v => set({ topReps: v })} />
              <Stepper label={t('Back-off sets')} value={p.backoffSets ?? 3} min={0} max={8} onChange={v => set({ backoffSets: v })} />
            </>
          : <Stepper label={t('Sets')} value={p.sets} min={1} max={10} onChange={v => set({ sets: v })} />}
        <Stepper label={top ? t('Back-off reps min') : t('Reps min')} value={p.repMin} min={1} max={50} onChange={v => set({ repMin: v })} />
        <Stepper label={top ? t('Back-off reps max') : t('Reps max')} value={p.repMax} min={1} max={50} onChange={v => set({ repMax: v })} />
        <Stepper label={t('RIR floor')} value={p.rirFloor} min={0} max={5} onChange={v => set({ rirFloor: v })} />
        {top && <Stepper label={t('Back-off')} unit="%" value={p.backoffPct ?? 85} step={2.5} min={50} max={100} onChange={v => set({ backoffPct: v })} />}
      </div>
      {top && <p className="quiet">{t('Back-off % is a percentage of the top-set weight: 85 = 85%.')}</p>}
      <label className="field-wrap">
        <span className="label">{exercise
          ? t('Increment (kg, blank = exercise default: {n})', { n: exercise.increment })
          : t('Increment (kg, blank = exercise default)')}</span>
        <input className="field tnum" inputMode="decimal" defaultValue={p.increment ?? ''} onBlur={e => {
          const r = parseNum(e.target.value, { min: 0.25, max: 20, name: t('Increment') });
          if (r.ok) { const { increment: _i, ...rest } = p; void _i; setDraft({ ...draft, params: r.value === undefined ? rest : { ...rest, increment: r.value } }); }
          else setErrors([r.error]);
        }} />
      </label>
      <Toggle label={t('In the minimum version')} hint={t('Kept when you only have time for the short session.')} checked={min} onChange={setMin} />
      <Errors errors={errors} />
      <Button variant="primary" block iconEnd="check" onClick={() => {
        const errs = validateSlotParams(draft.model, draft.params);
        setErrors(errs);
        if (!errs.length) onSave(draft, min);
      }}>{t('Save slot')}</Button>
      <div className="grid2">
        <Button onClick={onSwap}>{t('Swap exercise')}</Button>
        <ConfirmButton danger confirmLabel={t('Remove {name} from session {key}?', { name, key: session.key })} confirmText={t('Remove')} onConfirm={onRemove}>{t('Remove')}</ConfirmButton>
      </div>
    </>
  );
}

function ExercisePicker({ open, title, exercises, onClose, onPick }: {
  open: boolean; title: string; exercises: Exercise[]; onClose: () => void; onPick: (e: Exercise) => void;
}) {
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const k = nameKey(q);
  // A Chinese query has no Latin key: match the shown (translated) names instead.
  const zq = getLang() === 'zh' && !k ? q.trim() : '';
  const shown = k ? exercises.filter(e => nameKey(e.name).includes(k) || e.aliases.some(a => nameKey(a).includes(k)))
    : zq ? exercises.filter(e => tn(e.name).includes(zq)) : exercises;
  return (
    <Sheet className="setup-sheet" open={open} title={title} onClose={() => { setCreating(false); setQ(''); onClose(); }}>
      {creating
        ? <NewExerciseForm initialName={q} exercises={exercises} onCancel={() => setCreating(false)}
            onCreated={ex => { setCreating(false); setQ(''); onPick(ex); }} />
        : <>
            <input className="field" placeholder={t('Search')} aria-label={t('Search exercises')} value={q} onChange={e => setQ(e.target.value)} />
            <div className="sheetblk picker-list">
              {shown.map(e => (
                <button key={e.id} type="button" className="srow picker-item" data-press="row" onClick={() => { setQ(''); onPick(e); }}>
                  <span className="srow-v">{tn(e.name)}</span>
                  <span className="srow-r mid">{e.slotType === 'isolation' ? t('isolation') : t('compound')}</span>
                </button>
              ))}
              {shown.length === 0 && <p className="quiet">{t('No match.')}</p>}
            </div>
            <Button block iconEnd="plus" onClick={() => setCreating(true)}>{q ? t('New exercise “{name}”', { name: q }) : t('New exercise')}</Button>
          </>}
    </Sheet>
  );
}

function NewExerciseForm({ initialName, exercises, onCancel, onCreated }: {
  initialName: string; exercises: Exercise[]; onCancel: () => void; onCreated: (e: Exercise) => void;
}) {
  const [name, setName] = useState(initialName);
  const [slotType, setSlotType] = useState<SlotType>('compound');
  const [increment, setIncrement] = useState(2.5);
  const [bw, setBw] = useState(0);
  const [areas, setAreas] = useState<PainArea[]>([]);
  const [bench, setBench] = useState<'none' | Exclude<BenchmarkKey, null>>('none');
  const [errors, setErrors] = useState<string[]>([]);
  return (
    <>
      <label className="field-wrap"><span className="label">{t('Name')}</span>
        <input className="field" value={name} onChange={e => setName(e.target.value)} /></label>
      <Segmented<SlotType> label={t('Type')} value={slotType} onChange={setSlotType}
        options={[{ value: 'compound', label: t('Compound') }, { value: 'isolation', label: t('Isolation') }]} />
      <div className="grid2 steppers">
        <Stepper label={t('Increment')} unit="kg" value={increment} step={0.5} min={0.5} max={20} onChange={setIncrement} />
        <Stepper label={t('Bodyweight factor')} value={bw} step={0.05} min={0} max={1} onChange={setBw} />
      </div>
      <p className="quiet">{t('Bodyweight factor: share of bodyweight moved (pull-up ≈ 0.95). 0 = not a bodyweight lift.')}</p>
      <div className="field-wrap">
        <span className="label">{t('Areas loaded')}</span>
        <div className="plate-grid wide" role="group" aria-label={t('Areas loaded')}>
          {PAIN_AREAS.filter(a => a !== 'other').map(a => (
            <button key={a} type="button" aria-pressed={areas.includes(a)} className={`plate-opt${areas.includes(a) ? ' on' : ''}`} data-press="dim"
              onClick={() => setAreas(areas.includes(a) ? areas.filter(x => x !== a) : [...areas, a])}>{PAIN_AREA_LABELS[a]}</button>
          ))}
        </div>
      </div>
      <Segmented<'none' | Exclude<BenchmarkKey, null>> label={t('Benchmark')} value={bench} onChange={setBench}
        options={[{ value: 'none', label: t('None') }, { value: 'squat', label: t('Squat') }, { value: 'bench', label: t('Bench') }, { value: 'deadlift', label: t('Deadlift') }]} />
      <Errors errors={errors} />
      <div className="row">
        <Button variant="quiet" icon="back" onClick={onCancel}>{t('Back')}</Button>
        <Button variant="primary" className="grow" iconEnd="check" onClick={async () => {
          const n = name.trim().replace(/\s+/g, ' ');
          const errs: string[] = [];
          if (!n) errs.push(t('Name the exercise'));
          const dupe = exercises.find(e => nameKey(e.name) === nameKey(n) || e.aliases.some(a => nameKey(a) === nameKey(n)));
          if (dupe) errs.push(t('“{name}” already exists', { name: tn(dupe.name) }));
          setErrors(errs);
          if (errs.length) return;
          const all = await listExercises(getDb(), { includeArchived: true });
          const ex: Exercise = {
            id: uniqueExerciseId(exerciseIdFor(n), new Set(all.map(e => e.id))), name: n, aliases: [], muscles: [],
            areasLoaded: areas, slotType, increment, bodyweightFactor: bw, benchmarkKey: bench === 'none' ? null : bench,
          };
          await putExercise(getDb(), ex);
          onCreated(ex);
        }}>{t('Create and add')}</Button>
      </div>
    </>
  );
}


