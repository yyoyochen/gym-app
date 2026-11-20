// Program editor (spec §3.8). Every edit saves the active program at once.
// Edits apply from the next commit; committed sessions never change.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { BenchmarkKey, Exercise, ModelKind, PainArea, Phase, Program, ProgramSession, Slot, SlotParams, SlotType } from '../domain/types';
import { getActiveProgram, getDb, listExercises, putExercise, saveProgram, seedCatalog } from '../db';
import { exerciseIdFor, nameKey } from '../domain/catalog';
import { useLive } from '../ui/useLive';
import { ConfirmButton, DateField, Errors, Segmented, Sheet, Stepper } from '../ui/common';
import { DemoBanner } from '../app/DemoBanner';
import { formatDate } from '../app/dates';
import { PAIN_AREAS, PAIN_AREA_LABELS } from '../app/labels';
import {
  MODEL_LABELS, addSession, addSlot, changeModel, deleteSession, describeSlot, moveSession, moveSlot, removeSlot,
  renameSession, setInRotation, swapExercise, toggleMinimum, uniqueExerciseId, updateSlot,
} from '../app/program';
import { parseNum, validatePhase, validateSlotParams } from '../app/validate';
import { programFromTemplate } from '../domain/templates';
import { TemplateList } from '../app/parts/TemplatePicker';

const MODELS: ModelKind[] = ['double', 'topset', 'linear5x5', 'fixed'];

export function ProgramEditor(_props: { params: string[] }) {
  const live = useLive(db => getActiveProgram(db).then(p => p ?? null), []);
  const exercises = useLive(db => listExercises(db), []) ?? [];
  const [prog, setProg] = useState<Program | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ key: string; swapSlotId?: string } | null>(null);
  const [editing, setEditing] = useState<{ key: string; slotId: string } | null>(null);
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
  const apply = (f: (p: Program) => Program) => {
    if (!cur.current) return;
    const next = f(cur.current);
    cur.current = next;
    setProg(next);
    pending.current++;
    saveProgram(getDb(), next).catch(e => console.error(e)).finally(() => { pending.current--; });
  };

  if (live === undefined) return <section className="screen"><h1 className="title">Program</h1></section>;

  const templates = (
    <TemplateList exercises={exercises} renderAction={id => (
      <ConfirmButton className="primary" confirmLabel={prog ? 'Tap again to replace the program' : 'Tap again to use it'} onConfirm={async () => {
        const p = programFromTemplate(id);
        await saveProgram(getDb(), p);
        cur.current = p; setProg(p); setShowTemplates(false);
      }}>{prog ? 'Replace with this template' : 'Use this template'}</ConfirmButton>
    )} />
  );

  return (
    <section className="screen">
      <DemoBanner />
      <a className="back" href="#/profile">‹ Profile</a>
      <h1 className="title">Program</h1>
      <div className="banner">Edits apply from the next commit. Sessions already committed don’t change.</div>

      {!prog && <><p className="mid">No program yet. Start from a template.</p>{templates}</>}

      {prog && (
        <>
          <label className="stack">
            <span className="label">Name</span>
            <input className="field" value={prog.name} onChange={e => apply(p => ({ ...p, name: e.target.value }))} />
          </label>
          <div className="card">
            <span className="label">Rotation</span>
            <p className="mono num-sm">{prog.rotation.length ? prog.rotation.join(' → ') : 'None'}</p>
            <p className="mid">Sessions run in this order. Turn a session off to keep it out of the rotation.</p>
          </div>

          {prog.sessions.map((s, i) => (
            <SessionCard key={s.key} s={s} index={i} count={prog.sessions.length} inRotation={prog.rotation.includes(s.key)}
              exById={exById} open={open === s.key} onToggle={() => setOpen(open === s.key ? null : s.key)} apply={apply}
              onAdd={() => setPicker({ key: s.key })} onSwap={slotId => setPicker({ key: s.key, swapSlotId: slotId })}
              onEdit={slotId => setEditing({ key: s.key, slotId })} />
          ))}
          <button className="btn" onClick={() => {
            apply(p => addSession(p));
            setOpen(null);
          }}>Add session</button>

          <PhasesCard phases={prog.phases} onChange={phases => apply(p => ({ ...p, phases }))} />

          <div className="stack">
            <button className="btn" onClick={() => setShowTemplates(!showTemplates)}>{showTemplates ? 'Hide templates' : 'Start from a template'}</button>
            {showTemplates && templates}
          </div>
        </>
      )}

      <ExercisePicker open={!!picker} exercises={exercises} title={picker?.swapSlotId ? 'Swap exercise' : 'Add exercise'}
        onClose={() => setPicker(null)}
        onPick={ex => {
          if (!picker) return;
          apply(p => (picker.swapSlotId ? swapExercise(p, picker.key, picker.swapSlotId, ex.id) : addSlot(p, picker.key, ex)));
          setPicker(null);
        }} />

      {editing && prog && (() => {
        const s = prog.sessions.find(x => x.key === editing.key);
        const slot = s?.slots.find(x => x.id === editing.slotId);
        if (!slot) return null;
        return <SlotSheet slot={slot} exercise={exById.get(slot.exerciseId)} onClose={() => setEditing(null)}
          onSave={next => { apply(p => updateSlot(p, editing.key, slot.id, () => next)); setEditing(null); }} />;
      })()}
    </section>
  );
}

function SessionCard({ s, index, count, inRotation, exById, open, onToggle, apply, onAdd, onSwap, onEdit }: {
  s: ProgramSession; index: number; count: number; inRotation: boolean; exById: Map<string, Exercise>; open: boolean;
  onToggle: () => void; apply: (f: (p: Program) => Program) => void; onAdd: () => void; onSwap: (slotId: string) => void; onEdit: (slotId: string) => void;
}) {
  return (
    <div className={`card tick${inRotation ? ' tick-hit' : ''} stack`}>
      <button className="spread session-head" onClick={onToggle} aria-expanded={open}>
        <span className="row"><span className="chip">{s.key}</span><span className="heading">{s.name}</span></span>
        <span className="mid mono">{s.slots.length} {open ? '▴' : '▾'}</span>
      </button>
      {!open && <p className="mid">{s.slots.map(sl => exById.get(sl.exerciseId)?.name ?? sl.exerciseId).join(' · ') || 'No exercises'}</p>}
      {open && (
        <>
          <label className="stack">
            <span className="label">Session name</span>
            <input className="field" value={s.name} onChange={e => apply(p => renameSession(p, s.key, e.target.value))} />
          </label>
          <div className="row wrap">
            <button className="btn" disabled={index === 0} onClick={() => apply(p => moveSession(p, s.key, -1))}>Move up</button>
            <button className="btn" disabled={index === count - 1} onClick={() => apply(p => moveSession(p, s.key, 1))}>Move down</button>
            <button className={`chip big${inRotation ? ' on' : ''}`} aria-pressed={inRotation} onClick={() => apply(p => setInRotation(p, s.key, !inRotation))}>In rotation</button>
          </div>
          <span className="label">Exercises · tick “Min” for the minimum version</span>
          {s.slots.length === 0 && <p className="mid">No exercises yet.</p>}
          {s.slots.map((sl, j) => {
            const ex = exById.get(sl.exerciseId);
            const min = s.minimumSlotIds.includes(sl.id);
            return (
              <div key={sl.id} className="slot">
                <div className="spread">
                  <button className="stack tight slot-main" onClick={() => onEdit(sl.id)}>
                    <span className="heading">{ex?.name ?? sl.exerciseId}</span>
                    <span className="mid">{MODEL_LABELS[sl.model]} · <span className="mono num-sm">{describeSlot(sl)}</span></span>
                  </button>
                  <button className={`chip big${min ? ' on' : ''}`} aria-pressed={min} onClick={() => apply(p => toggleMinimum(p, s.key, sl.id))}>Min</button>
                </div>
                <div className="row wrap">
                  <button className="btn icon" aria-label="Move up" disabled={j === 0} onClick={() => apply(p => moveSlot(p, s.key, sl.id, -1))}>↑</button>
                  <button className="btn icon" aria-label="Move down" disabled={j === s.slots.length - 1} onClick={() => apply(p => moveSlot(p, s.key, sl.id, 1))}>↓</button>
                  <button className="btn" onClick={() => onEdit(sl.id)}>Edit</button>
                  <button className="btn" onClick={() => onSwap(sl.id)}>Swap</button>
                  <ConfirmButton confirmLabel="Remove?" onConfirm={() => apply(p => removeSlot(p, s.key, sl.id))}>Remove</ConfirmButton>
                </div>
              </div>
            );
          })}
          <button className="btn" onClick={onAdd}>Add exercise</button>
          <ConfirmButton danger confirmLabel={`Tap again to delete ${s.name}`} onConfirm={() => apply(p => deleteSession(p, s.key))}>Delete session</ConfirmButton>
        </>
      )}
    </div>
  );
}

function SlotSheet({ slot, exercise, onClose, onSave }: { slot: Slot; exercise?: Exercise; onClose: () => void; onSave: (s: Slot) => void }) {
  const [draft, setDraft] = useState<Slot>(slot);
  const [errors, setErrors] = useState<string[]>([]);
  const p = draft.params;
  const set = (patch: Partial<SlotParams>) => setDraft({ ...draft, params: { ...p, ...patch } });
  const top = draft.model === 'topset';
  return (
    <Sheet open title={exercise?.name ?? 'Slot'} onClose={onClose}>
      <label className="stack">
        <span className="label">Model</span>
        <select className="field" value={draft.model} onChange={e => setDraft(changeModel(draft, e.target.value as ModelKind, exercise?.slotType))}>
          {MODELS.map(m => <option key={m} value={m}>{MODEL_LABELS[m]}</option>)}
        </select>
      </label>
      <div className="grid2 steppers">
        {top
          ? <>
              <Stepper label="Top-set reps" value={p.topReps ?? 2} min={1} max={5} onChange={v => set({ topReps: v })} />
              <Stepper label="Back-off sets" value={p.backoffSets ?? 3} min={0} max={8} onChange={v => set({ backoffSets: v })} />
              <Stepper label="Back-off %" value={p.backoffPct ?? 85} step={2.5} min={50} max={100} unit="%" onChange={v => set({ backoffPct: v })} />
            </>
          : <Stepper label="Sets" value={p.sets} min={1} max={10} onChange={v => set({ sets: v })} />}
        <Stepper label={top ? 'Back-off reps min' : 'Reps min'} value={p.repMin} min={1} max={50} onChange={v => set({ repMin: v })} />
        <Stepper label={top ? 'Back-off reps max' : 'Reps max'} value={p.repMax} min={1} max={50} onChange={v => set({ repMax: v })} />
        <Stepper label="Effort floor (RIR)" value={p.rirFloor} min={0} max={5} onChange={v => set({ rirFloor: v })} />
      </div>
      {top && <p className="mid">Back-off % is a percentage of the top-set weight: 85 = 85%.</p>}
      <label className="stack">
        <span className="label">Increment (kg) · blank = exercise default{exercise ? ` (${exercise.increment})` : ''}</span>
        <input className="field mono" inputMode="decimal" defaultValue={p.increment ?? ''} onBlur={e => {
          const r = parseNum(e.target.value, { min: 0.25, max: 20, name: 'Increment' });
          if (r.ok) { const { increment: _i, ...rest } = p; void _i; setDraft({ ...draft, params: r.value === undefined ? rest : { ...rest, increment: r.value } }); }
          else setErrors([r.error]);
        }} />
      </label>
      <Errors errors={errors} />
      <button className="btn primary block" onClick={() => {
        const errs = validateSlotParams(draft.model, draft.params);
        setErrors(errs);
        if (!errs.length) onSave(draft);
      }}>Save slot</button>
    </Sheet>
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
    <Sheet open={open} title={title} onClose={() => { setCreating(false); setQ(''); onClose(); }}>
      {creating
        ? <NewExerciseForm initialName={q} exercises={exercises} onCancel={() => setCreating(false)}
            onCreated={ex => { setCreating(false); setQ(''); onPick(ex); }} />
        : <>
            <input className="field" placeholder="Search" aria-label="Search exercises" value={q} onChange={e => setQ(e.target.value)} />
            <ul className="plain picker-list">
              {shown.map(e => (
                <li key={e.id}><button className="picker-item spread" onClick={() => { setQ(''); onPick(e); }}>
                  <span>{e.name}</span><span className="mid">{e.slotType}</span>
                </button></li>
              ))}
              {shown.length === 0 && <li className="mid">No match.</li>}
            </ul>
            <button className="btn block" onClick={() => setCreating(true)}>New exercise{q ? ` “${q}”` : ''}</button>
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
    <div className="stack">
      <label className="stack"><span className="label">Name</span>
        <input className="field" value={name} onChange={e => setName(e.target.value)} /></label>
      <Segmented<SlotType> label="Type" value={slotType} onChange={setSlotType}
        options={[{ value: 'compound', label: 'Compound' }, { value: 'isolation', label: 'Isolation' }]} />
      <div className="grid2 steppers">
        <Stepper label="Increment (kg)" value={increment} step={0.5} min={0.5} max={20} onChange={setIncrement} />
        <Stepper label="Bodyweight factor" value={bw} step={0.05} min={0} max={1} onChange={setBw} />
      </div>
      <p className="mid">Bodyweight factor: share of bodyweight moved (pull-up ≈ 0.95). 0 = not a bodyweight lift.</p>
      <span className="label">Areas loaded</span>
      <div className="chips">
        {PAIN_AREAS.filter(a => a !== 'other').map(a => (
          <button key={a} type="button" aria-pressed={areas.includes(a)} className={`chip big${areas.includes(a) ? ' on' : ''}`}
            onClick={() => setAreas(areas.includes(a) ? areas.filter(x => x !== a) : [...areas, a])}>{PAIN_AREA_LABELS[a]}</button>
        ))}
      </div>
      <label className="stack"><span className="label">Benchmark</span>
        <select className="field" value={bench} onChange={e => setBench(e.target.value as typeof bench)}>
          <option value="none">None</option><option value="squat">Squat</option><option value="bench">Bench</option><option value="deadlift">Deadlift</option>
        </select></label>
      <Errors errors={errors} />
      <div className="row">
        <button className="btn" onClick={onCancel}>Back</button>
        <button className="btn primary grow" onClick={async () => {
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
        }}>Create and add</button>
      </div>
    </div>
  );
}

const MODEL_OPTS: (ModelKind | '')[] = ['', ...MODELS];

function PhasesCard({ phases, onChange }: { phases: Phase[]; onChange: (p: Phase[]) => void }) {
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [model, setModel] = useState<ModelKind | ''>('');
  const [sets, setSets] = useState('');
  const [repMin, setRepMin] = useState('');
  const [repMax, setRepMax] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  return (
    <div className="card stack">
      <span className="label">Phases (optional)</span>
      <p className="mid">Dated blocks that change sets or rep ranges for one model, e.g. a 2-week re-entry at 3 × 8.</p>
      {phases.map((ph, i) => (
        <div key={i} className="spread list-line">
          <span className="stack tight">
            <span className="heading">{ph.name}</span>
            <span className="mid mono">{formatDate(ph.start, { weekday: false })} – {formatDate(ph.end, { weekday: false })}</span>
            {ph.overrides && Object.entries(ph.overrides).map(([m, o]) => (
              <span key={m} className="mid">{MODEL_LABELS[m as ModelKind]}: {o?.sets ? `${o.sets} sets ` : ''}{o?.repMin ? `reps ${o.repMin}–${o.repMax ?? o.repMin}` : ''}</span>
            ))}
          </span>
          <ConfirmButton confirmLabel="Delete?" onConfirm={() => onChange(phases.filter((_, j) => j !== i))}>Delete</ConfirmButton>
        </div>
      ))}
      <label className="stack"><span className="label">Name</span><input className="field" value={name} onChange={e => setName(e.target.value)} /></label>
      <div className="grid2">
        <DateField label="Start" value={start} onChange={setStart} />
        <DateField label="End" value={end} min={start || undefined} onChange={setEnd} />
      </div>
      <label className="stack"><span className="label">Applies to model</span>
        <select className="field" value={model} onChange={e => setModel(e.target.value as ModelKind | '')}>
          {MODEL_OPTS.map(m => <option key={m} value={m}>{m ? MODEL_LABELS[m] : 'No override (marker only)'}</option>)}
        </select></label>
      {model && (
        <div className="grid3">
          <label className="stack"><span className="label">Sets</span><input className="field mono" inputMode="numeric" value={sets} onChange={e => setSets(e.target.value)} /></label>
          <label className="stack"><span className="label">Reps min</span><input className="field mono" inputMode="numeric" value={repMin} onChange={e => setRepMin(e.target.value)} /></label>
          <label className="stack"><span className="label">Reps max</span><input className="field mono" inputMode="numeric" value={repMax} onChange={e => setRepMax(e.target.value)} /></label>
        </div>
      )}
      <Errors errors={errors} />
      <button className="btn" onClick={() => {
        const nums = { sets: parseNum(sets, { integer: true, min: 1, max: 10, name: 'Sets' }), repMin: parseNum(repMin, { integer: true, min: 1, max: 50, name: 'Reps min' }), repMax: parseNum(repMax, { integer: true, min: 1, max: 50, name: 'Reps max' }) };
        const errs = Object.values(nums).flatMap(r => (r.ok ? [] : [r.error]));
        const o: Partial<SlotParams> = {};
        for (const [k, r] of Object.entries(nums)) if (r.ok && r.value !== undefined) (o as Record<string, number>)[k] = r.value;
        if (o.repMin !== undefined && o.repMax !== undefined && o.repMin > o.repMax) errs.push('Reps min can’t be above reps max');
        const ph: Phase = { name: name.trim(), start, end, ...(model && Object.keys(o).length ? { overrides: { [model]: o } } : {}) };
        errs.push(...validatePhase(ph, phases));
        setErrors(errs);
        if (errs.length) return;
        onChange([...phases, ph].sort((a, b) => (a.start < b.start ? -1 : 1)));
        setName(''); setStart(''); setEnd(''); setModel(''); setSets(''); setRepMin(''); setRepMax('');
      }}>Add phase</button>
    </div>
  );
}
