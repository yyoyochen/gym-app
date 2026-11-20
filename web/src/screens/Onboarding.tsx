// Onboarding (spec §7): four skippable steps, under two minutes.
// 1 profile basics · 2 bring history · 3 goals · 4 program → Today.
import { useEffect, useState } from 'react';
import type { EffortScale, Profile, Sex } from '../domain/types';
import {
  addBodyweight, defaultProfile, getActiveProgram, getDb, getProfile, listExercises, saveProfile, saveProgram, seedCatalog,
} from '../db';
import { DEFAULT_TEMPLATE_ID, programFromTemplate } from '../domain/templates';
import { useLive } from '../ui/useLive';
import { go } from '../ui/router';
import { Errors, Segmented } from '../ui/common';
import { loadDemo } from '../app/demo';
import { todayISO } from '../app/dates';
import { parseNum, validateBirthYear, validateBodyweight } from '../app/validate';
import { ImportNotionPanel } from '../app/parts/ImportNotionPanel';
import { RestorePanel } from '../app/parts/RestorePanel';
import { CheckpointsEditor, GoalsEditor, TargetsEditor } from '../app/parts/GoalParts';
import { TemplateList } from '../app/parts/TemplatePicker';

const STEPS = ['Profile', 'History', 'Goals', 'Program'];

async function currentProfile(): Promise<Profile> {
  const p = await getProfile(getDb());
  if (!p) return defaultProfile();
  const { id: _i, history: _h, ...rest } = p;
  void _i; void _h;
  return rest;
}

/** Make sure a profile exists, so the first-run gate stops sending us here. */
async function ensureProfile(): Promise<void> {
  if (!(await getProfile(getDb()))) await saveProfile(getDb(), defaultProfile());
}

export function Onboarding(_props: { params: string[] }) {
  const [step, setStep] = useState(0);
  useEffect(() => { seedCatalog(getDb()).catch(e => console.error(e)); }, []);
  const next = async () => { await ensureProfile(); setStep(s => Math.min(s + 1, STEPS.length - 1)); window.scrollTo(0, 0); };

  return (
    <section className="screen onboarding">
      <div className="spread">
        <span className="label">Step <span className="mono">{step + 1}</span> of <span className="mono">{STEPS.length}</span> · {STEPS[step]}</span>
        {step > 0 && <button className="btn" onClick={() => setStep(step - 1)}>Back</button>}
      </div>
      <div className="steps" aria-hidden="true">{STEPS.map((_, i) => <span key={i} className={i <= step ? 'on' : ''} />)}</div>
      {step === 0 && <StepProfile onNext={next} />}
      {step === 1 && <StepHistory onNext={next} />}
      {step === 2 && <StepGoals onNext={next} />}
      {step === 3 && <StepProgram />}
    </section>
  );
}

function StepProfile({ onNext }: { onNext: () => void }) {
  const [sex, setSex] = useState<Sex | 'none'>('none');
  const [birthYear, setBirthYear] = useState('');
  const [bw, setBw] = useState('');
  const [scale, setScale] = useState<EffortScale>('rir');
  const [errors, setErrors] = useState<string[]>([]);
  const save = async () => {
    const y = parseNum(birthYear, { integer: true, name: 'Birth year' });
    const w = parseNum(bw, { name: 'Bodyweight' });
    const errs = [
      ...(y.ok ? validateBirthYear(y.value, new Date().getFullYear()) : [y.error]),
      ...(w.ok ? validateBodyweight(w.value) : [w.error]),
    ];
    setErrors(errs);
    if (errs.length || !y.ok || !w.ok) return;
    const p = await currentProfile();
    await saveProfile(getDb(), { ...p, effortScale: scale, sex: sex === 'none' ? undefined : sex, ...(y.value !== undefined ? { birthYear: y.value } : {}) });
    if (w.value !== undefined) await addBodyweight(getDb(), todayISO(), w.value);
    onNext();
  };
  return (
    <>
      <h1 className="title">About you</h1>
      <p className="mid">Used for benchmarks and the effort scale. All optional.</p>
      <div className="card stack">
        <Segmented<Sex | 'none'> label="Sex" value={sex} onChange={setSex}
          options={[{ value: 'M', label: 'Male' }, { value: 'F', label: 'Female' }, { value: 'none', label: 'Not set' }]} />
        <label className="stack"><span className="label">Birth year</span>
          <input className="field mono" inputMode="numeric" value={birthYear} onChange={e => setBirthYear(e.target.value)} /></label>
        <label className="stack"><span className="label">Bodyweight (kg)</span>
          <input className="field mono" inputMode="decimal" value={bw} onChange={e => setBw(e.target.value)} /></label>
        <Segmented<EffortScale> label="Effort scale" value={scale} onChange={setScale}
          options={[{ value: 'rir', label: 'RIR' }, { value: 'rpe', label: 'RPE' }]} />
        <p className="mid">RIR = reps in reserve (default). RPE = 10 − RIR.</p>
      </div>
      <Errors errors={errors} />
      <div className="row">
        <button className="btn" onClick={onNext}>Skip</button>
        <button className="btn primary grow" onClick={save}>Next</button>
      </div>
    </>
  );
}

function StepHistory({ onNext }: { onNext: () => void }) {
  const [mode, setMode] = useState<'' | 'notion' | 'restore'>('');
  const [imported, setImported] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <h1 className="title">Bring your history</h1>
      <p className="mid">Past sessions give the coach starting weights. Without history, the first session of each lift sets the baseline.</p>
      <div className="stack">
        <button className={`btn block${mode === 'notion' ? ' primary' : ''}`} onClick={() => setMode('notion')}>Import Notion CSV</button>
        {mode === 'notion' && <div className="card"><ImportNotionPanel onDone={r => setImported(r.sessionsAdded > 0 || r.sessionsUnchanged > 0)} /></div>}
        <button className={`btn block${mode === 'restore' ? ' primary' : ''}`} onClick={() => setMode('restore')}>Restore a backup</button>
        {mode === 'restore' && <div className="card stack">
          <RestorePanel onRestored={() => go('today')} />
          <p className="mid">A restore brings back your profile and program too, so it goes straight to Today.</p>
        </div>}
        <button className="btn block" disabled={demoBusy} onClick={async () => {
          setDemoBusy(true); setError('');
          try { await loadDemo(getDb()); go('today'); }
          catch (e) { setError(e instanceof Error ? e.message : 'Could not load the demo'); setDemoBusy(false); }
        }}>{demoBusy ? 'Loading demo…' : 'Explore with demo data'}</button>
        {error && <span className="field-error">{error}</span>}
      </div>
      <div className="row">
        <button className="btn primary grow" onClick={onNext}>{imported ? 'Next' : 'Start empty'}</button>
      </div>
    </>
  );
}

function StepGoals({ onNext }: { onNext: () => void }) {
  const exercises = useLive(db => listExercises(db), []) ?? [];
  const [p, setP] = useState<Profile | null>(null);
  useEffect(() => { currentProfile().then(setP); }, []);
  if (!p) return null;
  return (
    <>
      <h1 className="title">Goals</h1>
      <div className="card"><GoalsEditor profile={p} onChange={setP} /></div>
      <TargetsEditor profile={p} onChange={setP} exercises={exercises} />
      <div className="card"><CheckpointsEditor profile={p} onChange={setP} /></div>
      {/* TODO(engine): show "from my log" maxes here when history was imported. */}
      <div className="row">
        <button className="btn" onClick={onNext}>Skip</button>
        <button className="btn primary grow" onClick={async () => { await saveProfile(getDb(), p); onNext(); }}>Next</button>
      </div>
    </>
  );
}

function StepProgram() {
  const exercises = useLive(db => listExercises(db), []) ?? [];
  const pick = async (id: string) => { await saveProgram(getDb(), programFromTemplate(id)); go('today'); };
  return (
    <>
      <h1 className="title">Program</h1>
      <p className="mid">Pick a template. Everything in it can be edited later under Profile → Program.</p>
      <TemplateList exercises={exercises} renderAction={id => <button className="btn primary" onClick={() => pick(id)}>Use this</button>} />
      <button className="btn" onClick={async () => {
        if (!(await getActiveProgram(getDb()))) await saveProgram(getDb(), programFromTemplate(DEFAULT_TEMPLATE_ID));
        go('today');
      }}>Skip (use Full body A/B/C)</button>
    </>
  );
}
