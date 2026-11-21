// Onboarding (spec §7): four skippable steps, under two minutes.
// 01 about you · 02 bring history · 03 goals · 04 program → Today.
// Each step is a full-screen page (#/onboarding/1…4). Steps replace each
// other in history (wizard), so the slide plays without piling up entries.
import { useEffect, useState, type ReactNode } from 'react';
import type { EffortScale, Profile, Sex } from '../domain/types';
import {
  addBodyweight, defaultProfile, getActiveProgram, getDb, getProfile, listBodyweight, listExercises, saveProfile, saveProgram, seedCatalog,
} from '../db';
import { DEFAULT_TEMPLATE_ID, TEMPLATES, programFromTemplate } from '../domain/templates';
import { useLive } from '../ui/useLive';
import { Errors, Group, Segmented } from '../ui/common';
import { Button, DitherBar, Lockup, PixelIcon, go } from '../ui/kit';
import { loadDemo } from '../app/demo';
import { todayISO } from '../app/dates';
import { parseNum, validateBirthYear, validateBodyweight } from '../app/validate';
import { ImportNotionPanel } from '../app/parts/ImportNotionPanel';
import { RestorePanel } from '../app/parts/RestorePanel';
import { CheckpointsEditor, GoalsEditor, TargetsEditor } from '../app/parts/GoalParts';
import { TemplateList } from '../app/parts/TemplatePicker';

const STEPS = ['About you', 'Your history', 'Goals', 'Program'];
const pad2 = (n: number) => String(n).padStart(2, '0');

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

const toStep = (i: number, dir: 'push' | 'pop') => go(`onboarding/${i + 1}`, { replace: true, transition: dir });
/** Leave onboarding for good: Today replaces it, so back doesn't return here. */
const finish = () => go('today', { replace: true, transition: 'push' });

export function Onboarding({ params }: { params: string[] }) {
  const n = Number(params[0]);
  const step = Number.isInteger(n) && n >= 1 && n <= STEPS.length ? n - 1 : 0;
  useEffect(() => { seedCatalog(getDb()).catch(e => console.error(e)); }, []);
  const next = async () => { await ensureProfile(); toStep(Math.min(step + 1, STEPS.length - 1), 'push'); };
  const prev = step > 0 ? () => toStep(step - 1, 'pop') : undefined;

  return (
    <section className="screen onb">
      <Lockup left={<span className="tnum">{pad2(step + 1)}/{pad2(STEPS.length)}</span>} mid={`Setup //${STEPS[step]}`} />
      <DitherBar cells={40} value={(step + 1) / STEPS.length} label="Setup" valueText={`Step ${step + 1} of ${STEPS.length}`} />
      {step === 0 && <StepProfile onNext={next} />}
      {step === 1 && <StepHistory onNext={next} onBack={prev} />}
      {step === 2 && <StepGoals onNext={next} onBack={prev} />}
      {step === 3 && <StepProgram onBack={prev} />}
    </section>
  );
}

function Question({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="onb-head">
      <h1 className="onb-q">{children}</h1>
      {sub && <p className="onb-sub">{sub}</p>}
    </div>
  );
}

/** The pinned bottom bar: quiet back/skip on the left, the ink block on the right. */
function Foot({ children, onBack }: { children: ReactNode; onBack?: () => void }) {
  return (
    <div className="onb-foot">
      {onBack && <button type="button" className="btn quiet onb-back" onClick={onBack} aria-label="Previous step"><PixelIcon name="back" /></button>}
      {children}
    </div>
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
      <Question sub="Used for strength levels and the effort scale. All optional.">About you</Question>
      <Segmented<Sex | 'none'> label="Sex" value={sex} onChange={setSex}
        options={[{ value: 'M', label: 'Male' }, { value: 'F', label: 'Female' }, { value: 'none', label: 'Not set' }]} />
      <div className="grid2">
        <label className="field-wrap"><span className="label">Birth year</span>
          <input className="field big tnum" inputMode="numeric" placeholder="1990" value={birthYear} onChange={e => setBirthYear(e.target.value)} /></label>
        <label className="field-wrap"><span className="label">Bodyweight · kg</span>
          <input className="field big tnum" inputMode="decimal" placeholder="80" value={bw} onChange={e => setBw(e.target.value)} /></label>
      </div>
      <Segmented<EffortScale> label="Effort scale" value={scale} onChange={setScale}
        options={[{ value: 'rir', label: 'RIR' }, { value: 'rpe', label: 'RPE' }]} />
      <p className="quiet">RIR = reps in reserve (default). RPE = 10 − RIR.</p>
      <Errors errors={errors} />
      <Foot>
        <Button variant="quiet" onClick={onNext}>Skip</Button>
        <Button variant="primary" className="grow" iconEnd="chevron" onClick={save}>Next</Button>
      </Foot>
    </>
  );
}

function StepHistory({ onNext, onBack }: { onNext: () => void; onBack?: () => void }) {
  const [mode, setMode] = useState<'' | 'notion' | 'restore'>('');
  const [imported, setImported] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [error, setError] = useState('');
  const pick = (m: 'notion' | 'restore') => setMode(mode === m ? '' : m);
  return (
    <>
      <Question sub="Past sessions give the coach starting weights. Without history, the first session of each lift sets the baseline.">Your history</Question>
      <div className="choice-list">
        <Choice k="01" title="Import a Notion CSV" sub="Your training log export" open={mode === 'notion'} onClick={() => pick('notion')} />
        {mode === 'notion' && <div className="choice-body"><ImportNotionPanel onDone={r => setImported(r.sessionsAdded > 0 || r.sessionsUnchanged > 0)} /></div>}
        <Choice k="02" title="Restore a backup" sub="A GymBro .json export" open={mode === 'restore'} onClick={() => pick('restore')} />
        {mode === 'restore' && <div className="choice-body">
          <RestorePanel onRestored={finish} />
          <p className="quiet">A restore brings back your profile and program too, so it goes straight to Today.</p>
        </div>}
        <Choice k="03" title={demoBusy ? 'Loading demo…' : 'Explore with demo data'} sub="A sample log you can wipe later" disabled={demoBusy} onClick={async () => {
          setDemoBusy(true); setError('');
          try { await loadDemo(getDb()); finish(); }
          catch (e) { setError(e instanceof Error ? e.message : 'Could not load the demo'); setDemoBusy(false); }
        }} />
      </div>
      {error && <span className="field-error" role="alert">{error}</span>}
      <Foot onBack={onBack}>
        <Button variant="primary" className="grow" iconEnd="chevron" onClick={onNext}>{imported ? 'Next' : 'Start empty'}</Button>
      </Foot>
    </>
  );
}

function Choice({ k, title, sub, open, disabled, onClick }: { k: string; title: string; sub: string; open?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`srow choice${open ? ' open' : ''}`} aria-expanded={open} disabled={disabled} data-press="row" onClick={onClick}>
      <span className="srow-k">{k}</span>
      <span className="srow-main"><span className="srow-v">{title}</span><span className="srow-sub">{sub}</span></span>
      <PixelIcon name={open === undefined ? 'chevron' : open ? 'minus' : 'plus'} />
    </button>
  );
}

function StepGoals({ onNext, onBack }: { onNext: () => void; onBack?: () => void }) {
  const exercises = useLive(db => listExercises(db), []) ?? [];
  const bodyweightKg = useLive(db => listBodyweight(db), [])?.at(-1)?.kg;
  const [p, setP] = useState<Profile | null>(null);
  useEffect(() => { currentProfile().then(setP); }, []);
  return (
    <>
      <Question sub="Pick what you train for. Targets and dates are optional.">Goals</Question>
      {p && <>
        <GoalsEditor profile={p} onChange={setP} />
        <Group label="Targets and timeline"><TargetsEditor profile={p} onChange={setP} exercises={exercises} bodyweightKg={bodyweightKg} /></Group>
        <Group label="Checkpoints"><CheckpointsEditor profile={p} onChange={setP} /></Group>
      </>}
      {/* TODO(engine): show "from my log" maxes here when history was imported. */}
      <Foot onBack={onBack}>
        <Button variant="quiet" onClick={onNext}>Skip</Button>
        <Button variant="primary" className="grow" iconEnd="chevron" disabled={!p} onClick={async () => { if (p) await saveProfile(getDb(), p); onNext(); }}>Next</Button>
      </Foot>
    </>
  );
}

function StepProgram({ onBack }: { onBack?: () => void }) {
  const exercises = useLive(db => listExercises(db), []) ?? [];
  const [sel, setSel] = useState(DEFAULT_TEMPLATE_ID);
  const [busy, setBusy] = useState(false);
  const name = TEMPLATES.find(t => t.id === sel)?.name ?? '';
  return (
    <>
      <Question sub="Pick a template. Everything in it can be edited later under You → Program.">Program</Question>
      <TemplateList exercises={exercises} selected={sel} onSelect={setSel} />
      <Foot onBack={onBack}>
        <Button variant="primary" className="grow" iconEnd="check" disabled={busy} onClick={async () => {
          setBusy(true);
          const existing = await getActiveProgram(getDb());
          if (!existing || existing.templateId !== sel) await saveProgram(getDb(), programFromTemplate(sel));
          finish();
        }}>Use {name}</Button>
      </Foot>
    </>
  );
}
