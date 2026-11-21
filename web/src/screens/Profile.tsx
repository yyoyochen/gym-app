// Profile (spec §3.7): where I am, goals, targets & timeline, availability.
// Edits are a local draft; "Save changes" writes one dated profile version.
import { useEffect, useState } from 'react';
import type { BodyweightEntry, Exercise, PainArea, Profile as ProfileT, Sex, Side } from '../domain/types';
import {
  addBodyweight, defaultProfile, deleteBodyweight, getDb, getProfile, listBodyweight, listExercises, saveProfile,
} from '../db';
import { useLive } from '../ui/useLive';
import { DateField, Errors, Segmented, Stepper } from '../ui/common';
import { DemoBanner } from '../app/DemoBanner';
import { formatDate, todayISO } from '../app/dates';
import { PAIN_AREAS, PAIN_AREA_LABELS, SIDE_LABELS } from '../app/labels';
import { parseNum, validateBodyweight, validateProfile } from '../app/validate';
import { CheckpointsEditor, GoalsEditor, TargetsEditor } from '../app/parts/GoalParts';

const strip = (p: ProfileT & { id?: string; history?: unknown }): ProfileT => {
  const { id: _i, history: _h, ...rest } = p;
  void _i; void _h;
  return rest;
};

export function Profile(_props: { params: string[] }) {
  const stored = useLive(db => getProfile(db).then(r => r ?? null), []);
  const exercises = useLive(db => listExercises(db), []) ?? [];
  const bodyweight = useLive(db => listBodyweight(db), []) ?? [];
  const [draft, setDraft] = useState<ProfileT | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  const base: ProfileT | undefined = stored === undefined ? undefined : stored ? strip(stored) : defaultProfile();
  // Reset the draft when the stored record changes (e.g. after save or a restore).
  useEffect(() => { setDraft(null); }, [stored]);

  if (!base) return <section className="screen"><h1 className="title">Profile</h1></section>;
  const p = draft ?? base;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(base);
  const edit = (next: ProfileT) => { setDraft(next); setSaved(false); };

  const save = async () => {
    const errs = validateProfile(p, new Date().getFullYear());
    setErrors(errs);
    if (errs.length) return;
    await saveProfile(getDb(), p);
    setSaved(true);
  };

  return (
    <section className="screen">
      <DemoBanner />
      <div className="spread">
        <h1 className="title">Profile</h1>
      </div>
      <nav className="link-row">
        <a className="btn" href="#/profile/program">Program</a>
        <a className="btn" href="#/profile/settings">Settings</a>
      </nav>

      <div className="card stack">
        <span className="label">Where I am</span>
        <Segmented<Sex | 'none'> label="Sex" value={p.sex ?? 'none'} onChange={v => edit({ ...p, sex: v === 'none' ? undefined : v })}
          options={[{ value: 'M', label: 'Male' }, { value: 'F', label: 'Female' }, { value: 'none', label: 'Not set' }]} />
        <div className="grid2">
          <NumField label="Birth year" value={p.birthYear} integer onChange={v => edit({ ...p, birthYear: v })} />
          <NumField label="Height (cm)" value={p.heightCm} onChange={v => edit({ ...p, heightCm: v })} />
          <NumField label="Training age (years)" value={p.trainingAgeYears} onChange={v => edit({ ...p, trainingAgeYears: v })} />
          <NumField label="Max session (min)" value={p.maxSessionMinutes} integer onChange={v => edit({ ...p, maxSessionMinutes: v })} />
        </div>
      </div>

      <BodyweightCard entries={bodyweight} />

      <InjuriesCard profile={p} onChange={edit} />

      <MaxesCard profile={p} onChange={edit} exercises={exercises} />

      <div className="card stack">
        <span className="label">Sessions per week</span>
        <div className="grid2">
          <Stepper label="Target" value={p.sessionsPerWeekTarget} min={1} max={14} onChange={v => edit({ ...p, sessionsPerWeekTarget: v })} />
          <Stepper label="Minimum" value={p.sessionsPerWeekMin} min={1} max={14} onChange={v => edit({ ...p, sessionsPerWeekMin: v })} />
        </div>
      </div>

      <div className="card"><GoalsEditor profile={p} onChange={edit} /></div>
      <TargetsEditor profile={p} onChange={edit} exercises={exercises} bodyweightKg={bodyweight[bodyweight.length - 1]?.kg} />
      <div className="card"><CheckpointsEditor profile={p} onChange={edit} /></div>

      <Errors errors={errors} />
      {(dirty || saved) && (
        <div className="save-bar">
          {dirty
            ? <><button className="btn" onClick={() => { setDraft(null); setErrors([]); }}>Discard</button>
                <button className="btn primary grow" onClick={save}>Save changes</button></>
            : <span className="mid">Saved. Earlier versions are kept with their date.</span>}
        </div>
      )}
    </section>
  );
}

/** Text field for an optional number; commits valid values on blur. */
function NumField({ label, value, onChange, integer }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void; integer?: boolean }) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  const [err, setErr] = useState('');
  useEffect(() => setText(value === undefined ? '' : String(value)), [value]);
  return (
    <label className="stack">
      <span className="label">{label}</span>
      <input className="field mono" inputMode={integer ? 'numeric' : 'decimal'} value={text} onChange={e => setText(e.target.value)}
        onBlur={() => {
          const r = parseNum(text, { integer, min: 0, name: label });
          if (r.ok) { setErr(''); onChange(r.value); } else setErr(r.error);
        }} />
      {err && <span className="field-error">{err}</span>}
    </label>
  );
}

function BodyweightCard({ entries }: { entries: BodyweightEntry[] }) {
  const [kg, setKg] = useState('');
  const [date, setDate] = useState(todayISO());
  const [errors, setErrors] = useState<string[]>([]);
  const latest = entries[entries.length - 1];
  const recent = entries.slice(-5).reverse();
  return (
    <div className="card stack">
      <span className="label">Bodyweight</span>
      {latest
        ? <div><span className="num-lg">{latest.kg}</span> <span className="mid">kg · {formatDate(latest.date)}</span></div>
        : <p className="mid">No entries yet.</p>}
      <div className="grid2">
        <label className="stack">
          <span className="label">kg</span>
          <input className="field mono" inputMode="decimal" value={kg} onChange={e => setKg(e.target.value)} />
        </label>
        <DateField label="Date" value={date} max={todayISO()} onChange={v => setDate(v || todayISO())} />
      </div>
      <Errors errors={errors} />
      <button className="btn" onClick={async () => {
        const r = parseNum(kg, { required: true, name: 'Bodyweight' });
        const errs = r.ok ? validateBodyweight(r.value) : [r.error];
        setErrors(errs);
        if (errs.length || !r.ok || r.value === undefined) return;
        await addBodyweight(getDb(), date, r.value);
        setKg('');
      }}>Add entry</button>
      {recent.length > 1 && (
        <ul className="plain">
          {recent.map(e => (
            <li key={e.id} className="spread list-line">
              <span><span className="mono num-sm">{e.kg} kg</span> <span className="mid">{formatDate(e.date)}</span></span>
              <button className="btn" onClick={() => deleteBodyweight(getDb(), e.id)}>Delete</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InjuriesCard({ profile, onChange }: { profile: ProfileT; onChange: (p: ProfileT) => void }) {
  const [area, setArea] = useState<PainArea>('shoulder');
  const [side, setSide] = useState<Side>('left');
  const [since, setSince] = useState('');
  const [note, setNote] = useState('');
  return (
    <div className="card stack">
      <span className="label">Injuries · areas to protect</span>
      <p className="mid">These pre-fill the pain flag and hold progress on lifts that load the area.</p>
      {profile.injuries.map((inj, i) => (
        <div key={i} className="spread list-line">
          <span>{PAIN_AREA_LABELS[inj.area]}{inj.side !== 'na' ? `, ${SIDE_LABELS[inj.side].toLowerCase()}` : ''}
            {inj.since && <span className="mid"> · since <span className="mono">{formatDate(inj.since, { weekday: false })}</span></span>}
            {inj.note && <span className="mid"> · {inj.note}</span>}</span>
          <button className="btn" onClick={() => onChange({ ...profile, injuries: profile.injuries.filter((_, j) => j !== i) })}>Remove</button>
        </div>
      ))}
      <label className="stack">
        <span className="label">Area</span>
        <select className="field" value={area} onChange={e => setArea(e.target.value as PainArea)}>
          {PAIN_AREAS.map(a => <option key={a} value={a}>{PAIN_AREA_LABELS[a]}</option>)}
        </select>
      </label>
      <Segmented<Side> label="Side" value={side} onChange={setSide}
        options={(['left', 'right', 'both', 'na'] as Side[]).map(s => ({ value: s, label: s === 'na' ? 'N/A' : SIDE_LABELS[s] }))} />
      <DateField label="Since (optional)" value={since} max={todayISO()} onChange={setSince} />
      <label className="stack">
        <span className="label">Note (optional)</span>
        <input className="field" value={note} onChange={e => setNote(e.target.value)} />
      </label>
      <button className="btn" onClick={() => {
        onChange({ ...profile, injuries: [...profile.injuries, { area, side, ...(since ? { since } : {}), ...(note.trim() ? { note: note.trim() } : {}) }] });
        setSince(''); setNote('');
      }}>Add area</button>
    </div>
  );
}

function MaxesCard({ profile, onChange, exercises }: { profile: ProfileT; onChange: (p: ProfileT) => void; exercises: Exercise[] }) {
  const main = exercises.filter(e => e.benchmarkKey || e.id === 'overhead-press');
  const names = new Map(exercises.map(e => [e.id, e.name]));
  const [exId, setExId] = useState('');
  const [kg, setKg] = useState('');
  const [date, setDate] = useState(todayISO());
  const [errors, setErrors] = useState<string[]>([]);
  return (
    <div className="card stack">
      <span className="label">Current maxes</span>
      {/* TODO(engine): "from my log" maxes — best e1RM per main lift in the last 90 days, supplied by the coach engine. */}
      <div className="banner todo-slot">
        <span className="label">From my log</span>
        <p className="mid">Best e1RM in the last 90 days will show here once the coach engine is connected. Until then only manual maxes are shown.</p>
      </div>
      {profile.manualMaxes.map((m, i) => (
        <div key={i} className="spread list-line">
          <span>{names.get(m.exerciseId) ?? m.exerciseId} <span className="mono num-sm">{m.kg} kg</span> <span className="mid">· {formatDate(m.date, { weekday: false })} · manual</span></span>
          <button className="btn" onClick={() => onChange({ ...profile, manualMaxes: profile.manualMaxes.filter((_, j) => j !== i) })}>Remove</button>
        </div>
      ))}
      <label className="stack">
        <span className="label">Lift</span>
        <select className="field" value={exId} onChange={e => setExId(e.target.value)}>
          <option value="">Choose…</option>
          {main.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          <optgroup label="All exercises">{exercises.filter(e => !main.includes(e)).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</optgroup>
        </select>
      </label>
      <div className="grid2">
        <label className="stack">
          <span className="label">1RM (kg)</span>
          <input className="field mono" inputMode="decimal" value={kg} onChange={e => setKg(e.target.value)} />
        </label>
        <DateField label="Date" value={date} max={todayISO()} onChange={v => setDate(v || todayISO())} />
      </div>
      <Errors errors={errors} />
      <button className="btn" onClick={() => {
        const r = parseNum(kg, { required: true, min: 1, max: 500, name: '1RM' });
        const errs = [...(exId ? [] : ['Pick a lift']), ...(r.ok ? [] : [r.error])];
        setErrors(errs);
        if (errs.length || !r.ok || r.value === undefined) return;
        const others = profile.manualMaxes.filter(m => m.exerciseId !== exId);
        onChange({ ...profile, manualMaxes: [...others, { exerciseId: exId, kg: r.value, date }] });
        setKg(''); setExId('');
      }}>Add manual max</button>
    </div>
  );
}
