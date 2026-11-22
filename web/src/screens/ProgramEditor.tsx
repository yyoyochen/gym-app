// Program editor (spec §3.8). Every edit saves the active program at once.
// Edits apply from the next commit; committed sessions never change.
// Sessions are spec-sheet blocks (inverted key cell), slots are rows; slot
// and session edits happen in kit Sheets.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { BenchmarkKey, Exercise, ModelKind, PainArea, Phase, Program, ProgramSession, Slot, SlotParams, SlotType } from '../domain/types';
import { getActiveProgram, getDb, listExercises, putExercise, saveProgram, seedCatalog } from '../db';
import { exerciseIdFor, nameKey } from '../domain/catalog';
import { useLive } from '../ui/useLive';
import { ConfirmButton, DateField, Errors, Group, GroupAction, Segmented, Sheet, Stepper } from '../ui/common';
import { Button, LabelValueGrid, NavBar, Parts, PixelIcon, Toggle, ValueRow, showHud } from '../ui/kit';
import { DemoBanner } from '../app/DemoBanner';
import { formatDate } from '../app/dates';
import { PAIN_AREAS, PAIN_AREA_LABELS } from '../app/labels';
import {
  MODEL_LABELS, addSession, addSlot, changeModel, deleteSession, describeSlot, moveSession, moveSlot, removeSlot,
  renameSession, setInRotation, swapExercise, toggleMinimum, uniqueExerciseId, updateSlot,
} from '../app/program';
import { parseNum, validatePhase, validateSlotParams } from '../app/validate';
import { programFromTemplate } from '../domain/templates';
import { TemplateList, sessionTitle } from '../app/parts/TemplatePicker';

const MODELS: ModelKind[] = ['double', 'topset', 'linear5x5', 'fixed'];
const MODEL_SHORT: Record<ModelKind, string> = { double: 'Double', topset: 'Top set', linear5x5: '5 × 5', fixed: 'Fixed' };
const pad2 = (n: number) => String(n).padStart(2, '0');

type Editing = { key: string; slotId: string };

export function ProgramEditor(_props: { params: string[] }) {
  const live = useLive(db => getActiveProgram(db).then(p => p ?? null), []);
  const exercises = useLive(db => listExercises(db), []) ?? [];
  const [prog, setProg] = useState<Program | null>(null);
  const [picker, setPicker] = useState<{ key: string; swapSlotId?: string } | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [addingPhase, setAddingPhase] = useState(false);

  useEffect(() => { seedCatalog(getDb()).catch(() => undefined); }, []);
  // Local copy is the source of truth while our own saves are in flight, so a
  // slower live update can't roll back a quicker second edit.
  const cur = useRef<Program | null>(null);
  const pending = useRef(0);
  useEffect(() => {
    if (live !== undefined && pending.current === 0) { cur.current = live; setProg(live); }
  }, [live]);

  const exById = useMemo(() => new Map(exercises.map(e => [e.id, e])), [exercises]);
  const apply = (f: (p: Program) => Program) => {
    if (!cur.current) return;
    const next = f(cur.current);
    cur.current = next;
    setProg(next);
    pending.current++;
    saveProgram(getDb(), next).catch(e => console.error(e)).finally(() => { pending.current--; });
  };

  if (live === undefined) return <section className="screen setup"><NavBar title="Program" backLabel="Profile" fallback="profile" /></section>;

  const templates = (
    <TemplateList exercises={exercises} renderAction={id => (
      <ConfirmButton className="primary block" confirmLabel={prog ? 'Replace your program with this template?' : 'Start from this template?'}
        message={prog ? 'Sessions already committed don’t change.' : undefined} confirmText={prog ? 'Replace program' : 'Use template'} onConfirm={async () => {
          const p = programFromTemplate(id);
          await saveProgram(getDb(), p);
          cur.current = p; setProg(p); setShowTemplates(false);
          showHud('Program set');
        }}>{prog ? 'Replace with this' : 'Use this template'}</ConfirmButton>
    )} />
  );

  const editSession = prog?.sessions.find(s => s.key === sessionKey);
  const editSlot = editing && prog?.sessions.find(x => x.key === editing.key);
  const slot = editing && editSlot?.slots.find(x => x.id === editing.slotId);

  return (
    <section className="screen setup">
      <DemoBanner />
      <NavBar title="Program" backLabel="Profile" fallback="profile" />
      <p className="note">//Note — edits apply from the next commit. Sessions already committed don’t change.</p>

      {!prog && <><p className="quiet">No program yet. Start from a template.</p>{templates}</>}

      {prog && (
        <>
          <div className="prog-head">
            <label className="field-wrap">
              <span className="label">Program name</span>
              <input className="field prog-name" value={prog.name} onChange={e => apply(p => ({ ...p, name: e.target.value }))} />
            </label>
            <LabelValueGrid items={[
              { label: 'Rotation', value: prog.rotation.length ? prog.rotation.join(' → ') : 'None', accent: true },
              { label: 'Sessions', value: `${prog.sessions.length} (${prog.sessions.reduce((n, s) => n + s.slots.length, 0)} slots)` },
            ]} />
          </div>

          {prog.sessions.map(s => (
            <SessionBlock key={s.key} s={s} inRotation={prog.rotation.includes(s.key)} exById={exById} apply={apply}
              onEditSession={() => setSessionKey(s.key)} onAdd={() => setPicker({ key: s.key })} onEdit={slotId => setEditing({ key: s.key, slotId })} />
          ))}
          <Button block iconEnd="plus" onClick={() => apply(p => addSession(p))}>Add session</Button>

          <Phases phases={prog.phases} onAdd={() => setAddingPhase(true)} onChange={phases => apply(p => ({ ...p, phases }))} />

          <Group label="Templates">
            <p className="quiet">Start over from one of the built-in programs. Your sessions and slots are replaced.</p>
            <Button block iconEnd="chevron" onClick={() => setShowTemplates(true)}>Start from a template</Button>
          </Group>
        </>
      )}

      <Sheet className="setup-sheet" open={showTemplates} title="Templates" detents={['large']} onClose={() => setShowTemplates(false)}>{templates}</Sheet>

      <Sheet className="setup-sheet" open={addingPhase} title="Add a phase" onClose={() => setAddingPhase(false)}>
        {prog && <PhaseForm phases={prog.phases} onAdd={ph => {
          apply(p => ({ ...p, phases: [...p.phases, ph].sort((a, b) => (a.start < b.start ? -1 : 1)) }));
          setAddingPhase(false);
          showHud('Phase added');
        }} />}
      </Sheet>

      <ExercisePicker open={!!picker} exercises={exercises} title={picker?.swapSlotId ? 'Swap exercise' : 'Add exercise'}
        onClose={() => setPicker(null)}
        onPick={ex => {
          if (!picker) return;
          apply(p => (picker.swapSlotId ? swapExercise(p, picker.key, picker.swapSlotId, ex.id) : addSlot(p, picker.key, ex)));
          setPicker(null);
        }} />

      <Sheet className="setup-sheet" open={!!editSession} title={editSession ? `Session ${editSession.key}` : 'Session'} onClose={() => setSessionKey(null)}>
        {editSession && prog && <SessionForm s={editSession} index={prog.sessions.indexOf(editSession)} count={prog.sessions.length}
          inRotation={prog.rotation.includes(editSession.key)} apply={apply} onDeleted={() => setSessionKey(null)} />}
      </Sheet>

      <Sheet className="setup-sheet" open={!!(editing && slot)} title={slot ? exById.get(slot.exerciseId)?.name ?? 'Slot' : 'Slot'} onClose={() => setEditing(null)}>
        {editing && slot && editSlot && <SlotForm key={slot.id} slot={slot} session={editSlot} exercise={exById.get(slot.exerciseId)}
          minimum={editSlot.minimumSlotIds.includes(slot.id)}
          onSave={(next, min) => {
            apply(p => {
              let q = updateSlot(p, editing.key, slot.id, () => next);
              if (min !== editSlot.minimumSlotIds.includes(slot.id)) q = toggleMinimum(q, editing.key, slot.id);
              return q;
            });
            setEditing(null);
            showHud('Slot saved');
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
    <section className={`sess${inRotation ? '' : ' off'}`} aria-label={`Session ${s.key}`}>
      <button type="button" className="sess-hd" data-press="row" onClick={onEditSession} aria-label={`Edit session ${s.key}: ${sessionTitle(s)}`}>
        <span className="key-inv">{s.key}</span>
        <span className="sess-name">{sessionTitle(s)}</span>
        <span className="sess-meta">{inRotation ? `${s.slots.length} slots` : 'Off rotation'}</span>
        <PixelIcon name="edit" />
      </button>
      {s.slots.length === 0 && <p className="quiet sess-empty">No exercises yet.</p>}
      {s.slots.map((sl, j) => {
        const ex = exById.get(sl.exerciseId);
        const min = s.minimumSlotIds.includes(sl.id);
        return (
          <div key={sl.id} className="srow slot-row">
            <span className="srow-k">{pad2(j + 1)}</span>
            <button type="button" className="srow-main slot-open" data-press="dim" onClick={() => onEdit(sl.id)}>
              <span className="srow-v">{ex?.name ?? sl.exerciseId}</span>
              <span className="srow-sub"><Parts items={[...(sl.model === 'topset' ? [] : [MODEL_SHORT[sl.model]]), describeSlot(sl), ...(min ? ['min'] : [])]} /></span>
            </button>
            <span className="reorder">
              <button type="button" className="icon-btn" aria-label={`Move ${ex?.name ?? 'slot'} up`} disabled={j === 0} data-press="dim"
                onClick={() => apply(p => moveSlot(p, s.key, sl.id, -1))}><PixelIcon name="up" /></button>
              <button type="button" className="icon-btn" aria-label={`Move ${ex?.name ?? 'slot'} down`} disabled={j === s.slots.length - 1} data-press="dim"
                onClick={() => apply(p => moveSlot(p, s.key, sl.id, 1))}><PixelIcon name="down" /></button>
            </span>
          </div>
        );
      })}
      <button type="button" className="slot-add" data-press="row" onClick={onAdd}><span>Add exercise</span><PixelIcon name="plus" /></button>
    </section>
  );
}

function SessionForm({ s, index, count, inRotation, apply, onDeleted }: {
  s: ProgramSession; index: number; count: number; inRotation: boolean; apply: (f: (p: Program) => Program) => void; onDeleted: () => void;
}) {
  return (
    <>
      <label className="field-wrap">
        <span className="label">Session name</span>
        <input className="field" value={s.name} onChange={e => apply(p => renameSession(p, s.key, e.target.value))} />
      </label>
      <Toggle label="In rotation" hint="Off keeps the session in the program but out of the A → B → C order." checked={inRotation}
        onChange={v => apply(p => setInRotation(p, s.key, v))} />
      <div className="grid2">
        <Button icon="up" disabled={index === 0} onClick={() => apply(p => moveSession(p, s.key, -1))}>Move up</Button>
        <Button icon="down" disabled={index === count - 1} onClick={() => apply(p => moveSession(p, s.key, 1))}>Move down</Button>
      </div>
      <ConfirmButton danger className="block" confirmLabel={`Delete session ${s.key} and its ${s.slots.length} slots?`}
        message="Sessions already logged keep their sets." confirmText={`Delete session ${s.key}`} onConfirm={() => { onDeleted(); apply(p => deleteSession(p, s.key)); }}>
        Delete session
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
  const name = exercise?.name ?? 'this exercise';
  return (
    <>
      <div className="slot-spec"><span className="key-inv">{session.key}</span><Parts items={[MODEL_LABELS[draft.model], describeSlot(draft)]} /></div>
      <Segmented<ModelKind> label="Model" value={draft.model} onChange={m => setDraft(changeModel(draft, m, exercise?.slotType))}
        options={MODELS.map(m => ({ value: m, label: MODEL_SHORT[m] }))} />
      <div className="grid2 steppers">
        {top
          ? <>
              <Stepper label="Top-set reps" value={p.topReps ?? 2} min={1} max={5} onChange={v => set({ topReps: v })} />
              <Stepper label="Back-off sets" value={p.backoffSets ?? 3} min={0} max={8} onChange={v => set({ backoffSets: v })} />
            </>
          : <Stepper label="Sets" value={p.sets} min={1} max={10} onChange={v => set({ sets: v })} />}
        <Stepper label={top ? 'Back-off reps min' : 'Reps min'} value={p.repMin} min={1} max={50} onChange={v => set({ repMin: v })} />
        <Stepper label={top ? 'Back-off reps max' : 'Reps max'} value={p.repMax} min={1} max={50} onChange={v => set({ repMax: v })} />
        <Stepper label="RIR floor" value={p.rirFloor} min={0} max={5} onChange={v => set({ rirFloor: v })} />
        {top && <Stepper label="Back-off" unit="%" value={p.backoffPct ?? 85} step={2.5} min={50} max={100} onChange={v => set({ backoffPct: v })} />}
      </div>
      {top && <p className="quiet">Back-off % is a percentage of the top-set weight: 85 = 85%.</p>}
      <label className="field-wrap">
        <span className="label">Increment (kg, blank = exercise default{exercise ? `: ${exercise.increment}` : ''})</span>
        <input className="field tnum" inputMode="decimal" defaultValue={p.increment ?? ''} onBlur={e => {
          const r = parseNum(e.target.value, { min: 0.25, max: 20, name: 'Increment' });
          if (r.ok) { const { increment: _i, ...rest } = p; void _i; setDraft({ ...draft, params: r.value === undefined ? rest : { ...rest, increment: r.value } }); }
          else setErrors([r.error]);
        }} />
      </label>
      <Toggle label="In the minimum version" hint="Kept when you only have time for the short session." checked={min} onChange={setMin} />
      <Errors errors={errors} />
      <Button variant="primary" block iconEnd="check" onClick={() => {
        const errs = validateSlotParams(draft.model, draft.params);
        setErrors(errs);
        if (!errs.length) onSave(draft, min);
      }}>Save slot</Button>
      <div className="grid2">
        <Button onClick={onSwap}>Swap exercise</Button>
        <ConfirmButton danger confirmLabel={`Remove ${name} from session ${session.key}?`} confirmText="Remove" onConfirm={onRemove}>Remove</ConfirmButton>
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
  const shown = k ? exercises.filter(e => nameKey(e.name).includes(k) || e.aliases.some(a => nameKey(a).includes(k))) : exercises;
  return (
    <Sheet className="setup-sheet" open={open} title={title} onClose={() => { setCreating(false); setQ(''); onClose(); }}>
      {creating
        ? <NewExerciseForm initialName={q} exercises={exercises} onCancel={() => setCreating(false)}
            onCreated={ex => { setCreating(false); setQ(''); onPick(ex); }} />
        : <>
            <input className="field" placeholder="Search" aria-label="Search exercises" value={q} onChange={e => setQ(e.target.value)} />
            <div className="sheetblk picker-list">
              {shown.map(e => (
                <button key={e.id} type="button" className="srow picker-item" data-press="row" onClick={() => { setQ(''); onPick(e); }}>
                  <span className="srow-v">{e.name}</span>
                  <span className="srow-r mid">{e.slotType}</span>
                </button>
              ))}
              {shown.length === 0 && <p className="quiet">No match.</p>}
            </div>
            <Button block iconEnd="plus" onClick={() => setCreating(true)}>New exercise{q ? ` “${q}”` : ''}</Button>
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
      <label className="field-wrap"><span className="label">Name</span>
        <input className="field" value={name} onChange={e => setName(e.target.value)} /></label>
      <Segmented<SlotType> label="Type" value={slotType} onChange={setSlotType}
        options={[{ value: 'compound', label: 'Compound' }, { value: 'isolation', label: 'Isolation' }]} />
      <div className="grid2 steppers">
        <Stepper label="Increment" unit="kg" value={increment} step={0.5} min={0.5} max={20} onChange={setIncrement} />
        <Stepper label="Bodyweight factor" value={bw} step={0.05} min={0} max={1} onChange={setBw} />
      </div>
      <p className="quiet">Bodyweight factor: share of bodyweight moved (pull-up ≈ 0.95). 0 = not a bodyweight lift.</p>
      <div className="field-wrap">
        <span className="label">Areas loaded</span>
        <div className="plate-grid wide" role="group" aria-label="Areas loaded">
          {PAIN_AREAS.filter(a => a !== 'other').map(a => (
            <button key={a} type="button" aria-pressed={areas.includes(a)} className={`plate-opt${areas.includes(a) ? ' on' : ''}`} data-press="dim"
              onClick={() => setAreas(areas.includes(a) ? areas.filter(x => x !== a) : [...areas, a])}>{PAIN_AREA_LABELS[a]}</button>
          ))}
        </div>
      </div>
      <Segmented<'none' | Exclude<BenchmarkKey, null>> label="Benchmark" value={bench} onChange={setBench}
        options={[{ value: 'none', label: 'None' }, { value: 'squat', label: 'Squat' }, { value: 'bench', label: 'Bench' }, { value: 'deadlift', label: 'Deadlift' }]} />
      <Errors errors={errors} />
      <div className="row">
        <Button variant="quiet" icon="back" onClick={onCancel}>Back</Button>
        <Button variant="primary" className="grow" iconEnd="check" onClick={async () => {
          const n = name.trim().replace(/\s+/g, ' ');
          const errs: string[] = [];
          if (!n) errs.push('Name the exercise');
          const dupe = exercises.find(e => nameKey(e.name) === nameKey(n) || e.aliases.some(a => nameKey(a) === nameKey(n)));
          if (dupe) errs.push(`“${dupe.name}” already exists`);
          setErrors(errs);
          if (errs.length) return;
          const all = await listExercises(getDb(), { includeArchived: true });
          const ex: Exercise = {
            id: uniqueExerciseId(exerciseIdFor(n), new Set(all.map(e => e.id))), name: n, aliases: [], muscles: [],
            areasLoaded: areas, slotType, increment, bodyweightFactor: bw, benchmarkKey: bench === 'none' ? null : bench,
          };
          await putExercise(getDb(), ex);
          onCreated(ex);
        }}>Create and add</Button>
      </div>
    </>
  );
}

function overrideLine(ph: Phase): string {
  if (!ph.overrides) return 'Marker only';
  return Object.entries(ph.overrides).map(([m, o]) =>
    `${MODEL_SHORT[m as ModelKind]}: ${o?.sets ? `${o.sets} sets ` : ''}${o?.repMin ? `reps ${o.repMin}–${o.repMax ?? o.repMin}` : ''}`.trim()).join('; ');
}

function Phases({ phases, onAdd, onChange }: { phases: Phase[]; onAdd: () => void; onChange: (p: Phase[]) => void }) {
  return (
    <Group label="Phases (optional)" right={<GroupAction onClick={onAdd}>Add</GroupAction>}>
      <p className="quiet">Dated blocks that change sets or rep ranges for one model, e.g. a 2-week re-entry at 3 × 8.</p>
      {phases.length > 0 && (
        <div className="sheetblk">
          {phases.map((ph, i) => (
            <ValueRow key={i} k={pad2(i + 1)} value={ph.name}
              sub={`${formatDate(ph.start, { weekday: false })} – ${formatDate(ph.end, { weekday: false })}, ${overrideLine(ph)}`}>
              <ConfirmButton className="icon-btn" confirmLabel={`Delete the phase “${ph.name}”?`} confirmText="Delete phase" danger
                onConfirm={() => onChange(phases.filter((_, j) => j !== i))}><PixelIcon name="trash" title={`Delete ${ph.name}`} /></ConfirmButton>
            </ValueRow>
          ))}
        </div>
      )}
    </Group>
  );
}

const MODEL_OPTS: (ModelKind | '')[] = ['', ...MODELS];

function PhaseForm({ phases, onAdd }: { phases: Phase[]; onAdd: (ph: Phase) => void }) {
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [model, setModel] = useState<ModelKind | ''>('');
  const [sets, setSets] = useState('');
  const [repMin, setRepMin] = useState('');
  const [repMax, setRepMax] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  return (
    <>
      <label className="field-wrap"><span className="label">Name</span><input className="field" value={name} onChange={e => setName(e.target.value)} /></label>
      <div className="grid2">
        <DateField label="Start" value={start} onChange={setStart} />
        <DateField label="End" value={end} min={start || undefined} onChange={setEnd} />
      </div>
      <label className="field-wrap"><span className="label">Applies to model</span>
        <select className="field" value={model} onChange={e => setModel(e.target.value as ModelKind | '')}>
          {MODEL_OPTS.map(m => <option key={m} value={m}>{m ? MODEL_LABELS[m] : 'No override (marker only)'}</option>)}
        </select></label>
      {model && (
        <div className="grid3">
          <label className="field-wrap"><span className="label">Sets</span><input className="field tnum" inputMode="numeric" value={sets} onChange={e => setSets(e.target.value)} /></label>
          <label className="field-wrap"><span className="label">Reps min</span><input className="field tnum" inputMode="numeric" value={repMin} onChange={e => setRepMin(e.target.value)} /></label>
          <label className="field-wrap"><span className="label">Reps max</span><input className="field tnum" inputMode="numeric" value={repMax} onChange={e => setRepMax(e.target.value)} /></label>
        </div>
      )}
      <Errors errors={errors} />
      <Button variant="primary" block iconEnd="plus" onClick={() => {
        const nums = { sets: parseNum(sets, { integer: true, min: 1, max: 10, name: 'Sets' }), repMin: parseNum(repMin, { integer: true, min: 1, max: 50, name: 'Reps min' }), repMax: parseNum(repMax, { integer: true, min: 1, max: 50, name: 'Reps max' }) };
        const errs = Object.values(nums).flatMap(r => (r.ok ? [] : [r.error]));
        const o: Partial<SlotParams> = {};
        for (const [k, r] of Object.entries(nums)) if (r.ok && r.value !== undefined) (o as Record<string, number>)[k] = r.value;
        if (o.repMin !== undefined && o.repMax !== undefined && o.repMin > o.repMax) errs.push('Reps min can’t be above reps max');
        const ph: Phase = { name: name.trim(), start, end, ...(model && Object.keys(o).length ? { overrides: { [model]: o } } : {}) };
        errs.push(...validatePhase(ph, phases));
        setErrors(errs);
        if (errs.length) return;
        onAdd(ph);
      }}>Add phase</Button>
    </>
  );
}
