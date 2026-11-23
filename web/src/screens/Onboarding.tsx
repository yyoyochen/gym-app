// Setup (docs/superpowers/specs/2026-11-23-first-five-minutes-design.md):
// 01 about you, 02 program, 03 your numbers, 04 how GymBro works, then the
// first session (or Today). About 90 seconds. Each step is a full-screen page
// (#/onboarding/1…4); steps replace each other in history (wizard), so the
// slide plays without piling up entries.
import { useEffect, useState, type ReactNode } from 'react';
import type { EffortScale, Exercise, Profile, Sex } from '../domain/types';
import {
  addBodyweight, defaultProfile, getActiveProgram, getDb, getProfile, listExercises, saveProfile, saveProgram, seedCatalog,
} from '../db';
import { DEFAULT_TEMPLATE_ID, TEMPLATES, programFromTemplate } from '../domain/templates';
import { useLive } from '../ui/useLive';
import { Errors, Group, Segmented } from '../ui/common';
import { Button, DitherBar, Lockup, PixelIcon, Sheet, Stepper, go } from '../ui/kit';
import { loadDemo } from '../app/demo';
import { todayISO } from '../app/dates';
import { commitSession, planToday } from '../app/coach';
import { initTips } from '../app/tips';
import { SETUP_STEPS, START_REPS, setupStepLabel, hasLoggedWork, mainLifts, startingSetsFromRows, startingSetsOf, type NumberRow } from '../app/setup';
import { parseNum, validateBirthYear, validateBodyweight } from '../app/validate';
import { sessionNames } from '../ui/session/text';
import { ImportCsvPanel } from '../app/parts/ImportCsvPanel';
import { RestorePanel } from '../app/parts/RestorePanel';
import { TemplateList } from '../app/parts/TemplatePicker';
import { LanguageControl } from '../i18n/LanguageControl';
import { t, tn } from '../i18n';

const COUNT = SETUP_STEPS.length;

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
/** Leave setup for good: Today replaces it, so back doesn't return here. */
const finish = () => go('today', { replace: true, transition: 'push' });

export function Onboarding({ params }: { params: string[] }) {
  const n = Number(params[0]);
  const step = Number.isInteger(n) && n >= 1 && n <= COUNT ? n - 1 : 0;
  // A wipe (demo exit, Settings) clears meta: decide the tips list again.
  useEffect(() => { seedCatalog(getDb()).then(() => initTips(getDb())).catch(e => console.error(e)); }, []);
  const next = async () => { await ensureProfile(); toStep(Math.min(step + 1, COUNT - 1), 'push'); };
  const prev = step > 0 ? () => toStep(step - 1, 'pop') : undefined;

  return (
    <section className="screen onb">
      <Lockup left={<span className="tnum">{step + 1}/{COUNT}</span>} mid={t('Setup // {step}', { step: setupStepLabel(step) })} />
      <DitherBar cells={40} value={(step + 1) / COUNT} label={t('Setup')} valueText={t('Step {n} of {count}', { n: step + 1, count: COUNT })} />
      {step === 0 && <StepAbout onNext={next} />}
      {step === 1 && <StepProgram onNext={next} onBack={prev} />}
      {step === 2 && <StepNumbers onNext={next} onBack={prev} />}
      {step === 3 && <StepHow onBack={prev} />}
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
      {onBack && <button type="button" className="btn quiet onb-back" onClick={onBack} aria-label={t('Previous step')}><PixelIcon name="back" /></button>}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- 01 about you

function StepAbout({ onNext }: { onNext: () => void }) {
  const [sex, setSex] = useState<Sex | 'none'>('none');
  const [birthYear, setBirthYear] = useState('');
  const [bw, setBw] = useState('');
  const [scale, setScale] = useState<EffortScale>('rir');
  const [errors, setErrors] = useState<string[]>([]);
  const [history, setHistory] = useState(false);
  const save = async () => {
    const y = parseNum(birthYear, { integer: true, name: t('Birth year') });
    const w = parseNum(bw, { name: t('Bodyweight') });
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
      <Question sub={t('How you rate effort, and what you weigh.')}>{t('About you')}</Question>
      <div className="stack">
        <LanguageControl />
        <Segmented<EffortScale> label={t('Effort scale')} value={scale} onChange={setScale}
          options={[{ value: 'rir', label: 'RIR' }, { value: 'rpe', label: 'RPE' }]} />
        <p className="quiet">{t('RIR: reps left in the tank. RPE: 10 minus that.')}</p>
      </div>
      <label className="field-wrap"><span className="label">{t('Bodyweight (kg)')}</span>
        <input className="field big tnum" inputMode="decimal" placeholder="80" value={bw} onChange={e => setBw(e.target.value)} /></label>
      <Group label={t('For strength levels (optional)')}>
        <Segmented<Sex | 'none'> label={t('Sex')} value={sex} onChange={setSex}
          options={[{ value: 'M', label: t('Male') }, { value: 'F', label: t('Female') }, { value: 'none', label: t('Not set') }]} />
        <label className="field-wrap"><span className="label">{t('Birth year')}</span>
          <input className="field big tnum" inputMode="numeric" placeholder="1990" value={birthYear} onChange={e => setBirthYear(e.target.value)} /></label>
      </Group>
      <button type="button" className="link onb-link" onClick={() => setHistory(true)}>{t('Have a log already? Import or restore')}</button>
      <Errors errors={errors} />
      <Foot>
        <Button variant="quiet" onClick={onNext}>{t('Skip')}</Button>
        <Button variant="primary" className="grow" iconEnd="chevron" onClick={save}>{t('Next')}</Button>
      </Foot>
      <HistorySheet open={history} onClose={() => setHistory(false)} />
    </>
  );
}

/** Today's "Your history" step, moved behind a link: import, restore or the demo. */
function HistorySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<'' | 'csv' | 'restore'>('');
  const [imported, setImported] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [error, setError] = useState('');
  const pick = (m: 'csv' | 'restore') => setMode(mode === m ? '' : m);
  return (
    <Sheet open={open} title={t('Bring your log')} onClose={onClose}>
      <div className="choice-list">
        <Choice title={t('Import a CSV')} sub={t('App template, Hevy or Strong')} open={mode === 'csv'} onClick={() => pick('csv')} />
        {mode === 'csv' && <div className="choice-body">
          <ImportCsvPanel onDone={r => setImported(r.sessionsAdded > 0 || r.sessionsUnchanged > 0)} />
          {imported && <Button variant="primary" block iconEnd="chevron" onClick={onClose}>{t('Continue setup')}</Button>}
        </div>}
        <Choice title={t('Restore a backup')} sub={t('A .json backup from this app')} open={mode === 'restore'} onClick={() => pick('restore')} />
        {mode === 'restore' && <div className="choice-body">
          <RestorePanel onRestored={finish} />
          <p className="quiet">{t('A restore brings back your profile and program too, so it goes straight to Today.')}</p>
        </div>}
        <Choice title={demoBusy ? t('Loading demo…') : t('Explore with demo data')} sub={t('A sample log you can wipe later')} disabled={demoBusy} onClick={async () => {
          setDemoBusy(true); setError('');
          try { await loadDemo(getDb()); finish(); }
          catch (e) { setError(e instanceof Error ? e.message : t('Could not load the demo')); setDemoBusy(false); }
        }} />
      </div>
      {error && <span className="field-error" role="alert">{error}</span>}
    </Sheet>
  );
}

function Choice({ title, sub, open, disabled, onClick }: { title: string; sub: string; open?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`srow choice${open ? ' open' : ''}`} aria-expanded={open} disabled={disabled} data-press="row" onClick={onClick}>
      <span className="srow-main"><span className="srow-v">{title}</span><span className="srow-sub">{sub}</span></span>
      <PixelIcon name={open === undefined ? 'chevron' : open ? 'minus' : 'plus'} />
    </button>
  );
}

// ---------------------------------------------------------------- 02 program

function StepProgram({ onNext, onBack }: { onNext: () => void; onBack?: () => void }) {
  const exercises = useLive(db => listExercises(db), []) ?? [];
  const active = useLive(db => getActiveProgram(db), []);
  const [sel, setSel] = useState(DEFAULT_TEMPLATE_ID);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (active?.templateId && TEMPLATES.some(t => t.id === active.templateId)) setSel(active.templateId); }, [active?.templateId]);
  return (
    <>
      <Question sub={t('Start from an example program. Change anything in it later under Profile, Program.')}>{t('Program')}</Question>
      <TemplateList exercises={exercises} selected={sel} onSelect={setSel} />
      {error && <span className="field-error" role="alert">{error}</span>}
      <Foot onBack={onBack}>
        <Button variant="primary" className="grow" iconEnd="chevron" disabled={busy} onClick={async () => {
          setBusy(true); setError('');
          try {
            const existing = await getActiveProgram(getDb());
            if (!existing || existing.templateId !== sel) await saveProgram(getDb(), programFromTemplate(sel));
            onNext();
          } catch (e) {
            setError(t('Could not save the program: {error}. Try again.', { error: e instanceof Error ? e.message : t('unknown error') }));
          } finally { setBusy(false); }
        }}>{t('Next')}</Button>
      </Foot>
    </>
  );
}

// ---------------------------------------------------------------- 03 your numbers

interface Row extends NumberRow { name: string; text: string; step: number }

async function loadRows(): Promise<Row[]> {
  const db = getDb();
  const [program, profile, exercises] = await Promise.all([getActiveProgram(db), getProfile(db), listExercises(db)]);
  if (!program) return [];
  const byId = new Map(exercises.map((e: Exercise) => [e.id, e]));
  const saved = startingSetsOf(profile);
  const rows: Row[] = [];
  for (const id of mainLifts(program)) {
    // A lift already in the log plans from it; only new lifts are asked about.
    if (await hasLoggedWork(db, id)) continue;
    const s = saved.find(x => x.exerciseId === id);
    const ex = byId.get(id);
    rows.push({ exerciseId: id, name: tn(ex?.name ?? id), step: ex?.increment ?? 2.5,
      weight: s?.weight ?? null, text: s ? String(s.weight) : '', reps: s?.reps ?? 5, skipped: false });
  }
  return rows;
}

function StepNumbers({ onNext, onBack }: { onNext: () => void; onBack?: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  useEffect(() => { loadRows().then(setRows).catch(e => { console.error(e); setRows([]); }); }, []);
  const patch = (i: number, p: Partial<Row>) => setRows(rs => rs && rs.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const save = async () => {
    if (!rows) return;
    const errs: string[] = [];
    const parsed = rows.map(r => {
      if (r.skipped) return r;
      const w = parseNum(r.text, { name: t('{name} weight', { name: r.name }), min: 0, max: 500 });
      if (!w.ok) { errs.push(w.error); return r; }
      return { ...r, weight: w.value ?? null };
    });
    setErrors(errs);
    if (errs.length) return;
    const p = await currentProfile();
    const asked = new Set(rows.map(r => r.exerciseId));
    const kept = startingSetsOf(p).filter(s => !asked.has(s.exerciseId));
    await saveProfile(getDb(), { ...p, startingSets: [...kept, ...startingSetsFromRows(parsed, todayISO())] });
    onNext();
  };
  return (
    <>
      <Question sub={t('Your best set in the last month for each lift. Your first targets come from these.')}>{t('Your numbers')}</Question>
      {rows && !rows.length && <p className="quiet">{t('Your log already covers these lifts. The app plans from it.')}</p>}
      {rows && rows.length > 0 && (
        <div className="num-rows">
          {rows.map((r, i) => (
            <div key={r.exerciseId} className={`num-row${r.skipped ? ' skipped' : ''}`}>
              <div className="num-row-hd">
                <span className="label">{r.name}</span>
                <button type="button" className="link num-skip" aria-pressed={r.skipped} onClick={() => patch(i, { skipped: !r.skipped })}>
                  {r.skipped ? t('Add it back') : t('Skip')}
                </button>
              </div>
              {r.skipped ? <p className="quiet">{t('Skipped: the first session sets the baseline.')}</p> : (
                <div className="grid2">
                  <label className="field-wrap"><span className="label">{t('Weight (kg)')}</span>
                    <input className="field big tnum" inputMode="decimal" placeholder="100" value={r.text}
                      aria-label={t('{name} weight in kilograms', { name: r.name })} onChange={e => patch(i, { text: e.target.value })} /></label>
                  <Stepper label={t('Reps')} value={r.reps} min={START_REPS.min} max={START_REPS.max} onChange={v => patch(i, { reps: v })} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {rows && rows.length > 0 && <p className="quiet">{t('Skip a lift and its first session is a baseline: you log, it measures.')}</p>}
      <Errors errors={errors} />
      <Foot onBack={onBack}>
        <Button variant="primary" className="grow" iconEnd="chevron" disabled={!rows} onClick={save}>{t('Next')}</Button>
      </Foot>
    </>
  );
}

// ---------------------------------------------------------------- 04 how GymBro works

const how = (): [string, string][] => [
  [t('Before you lift'), t('A plan for each session: the numbers to hit, and why.')],
  [t('Each set'), t('Two taps. Did what it says? Log as planned. If not, adjust.')],
  [t('After'), t('A grade: beat, hit or missed. The next plan follows from it.')],
];

function StepHow({ onBack }: { onBack?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const plan = useLive(db => { const now = Date.now(); return planToday(db, todayISO(now), now, {}); }, []);
  const short = plan?.status === 'planned' ? sessionNames(plan.sessionName).short : '';
  const start = async () => {
    setBusy(true); setError('');
    try {
      const now = Date.now();
      const p = await planToday(getDb(), todayISO(now), now, {});
      if (p.status !== 'planned') { finish(); return; }
      const s = await commitSession(getDb(), p, 'green', now);
      go(`session/${s.id}`, { replace: true, transition: 'push' });
    } catch (e) {
      setError(t('Could not start the session: {error}. Try again, or look around first.', { error: e instanceof Error ? e.message : t('unknown error') }));
    } finally { setBusy(false); }
  };
  return (
    <>
      <Question>{t('How it works')}</Question>
      <ol className="onb-how">
        {how().map(([when, line]) => (
          <li key={when}><b className="onb-how-k">{when}</b><span>{line}</span></li>
        ))}
      </ol>
      <p className="quiet">{t('Small tips will point things out the first time you meet them.')}</p>
      {error && <span className="field-error" role="alert">{error}</span>}
      {short && <Button variant="quiet" className="onb-link" onClick={finish}>{t('Look around first')}</Button>}
      <Foot onBack={onBack}>
        {short
          ? <Button variant="primary" className="grow" iconEnd="chevron" disabled={busy} onClick={start}>{t('Start {name}', { name: short })}</Button>
          : <Button variant="primary" className="grow" iconEnd="chevron" onClick={finish}>{t('Look around')}</Button>}
      </Foot>
    </>
  );
}
