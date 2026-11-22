// Profile tab (spec §3.7): where I am, goals, targets & timeline,
// injuries, maxes, checkpoints. A read-out of label/value pairs and spec
// rows; every edit happens in a kit Sheet whose Save writes one dated
// profile version (earlier versions are kept).
import { useEffect, useState, type ReactNode } from 'react';
import type { BodyweightEntry, Exercise, PainArea, Profile as ProfileT, Sex, Side, StartingSet } from '../domain/types';
import {
  addBodyweight, defaultProfile, deleteBodyweight, getDb, getProfile, listBodyweight, listExercises, saveProfile,
} from '../db';
import { useLive } from '../ui/useLive';
import { DateField, Errors, Group, GroupAction, Segmented, Sheet, Stepper } from '../ui/common';
import { BigNumber, Button, DitherBar, LabelValueGrid, Lockup, NavBar, PixelIcon, Select, ValueRow, showHud, type LabelValueItem } from '../ui/kit';
import { DemoBanner } from '../app/DemoBanner';
import { formatDate, todayISO } from '../app/dates';
import { GOAL_LABELS, PAIN_AREAS, PAIN_AREA_LABELS, SIDE_LABELS, feasibilityWord } from '../app/labels';
import { parseNum, validateBodyweight, validateProfile } from '../app/validate';
import { CheckpointsEditor, GOAL_SHORT, GoalsEditor, TargetLevelBar, TargetsEditor, targetLine } from '../app/parts/GoalParts';
import { goalRows, liftStats, type GoalRow } from '../ui/progress/data';
import { standardsContext, useGymStandards } from '../ui/progress/standards';
import { kg } from '../app/coach';
import { START_REPS, editStartingSet, pendingStartingSets, removeStartingSet, startingSetsOf } from '../app/setup';

const strip = (p: ProfileT & { id?: string; history?: unknown }): ProfileT => {
  const { id: _i, history: _h, ...rest } = p;
  void _i; void _h;
  return rest;
};

type SheetKey = 'where' | 'bodyweight' | 'goals' | 'targets' | 'injuries' | 'maxes' | 'checkpoints' | 'starting';
const SEX_WORD: Record<Sex, string> = { M: 'Male', F: 'Female' };
const pad2 = (n: number) => String(n).padStart(2, '0');
const isMainLift = (e: Exercise) => !!e.benchmarkKey || e.id === 'overhead-press';

export function Profile(_props: { params: string[] }) {
  const stored = useLive(db => getProfile(db).then(r => r ?? null), []);
  const exercises = useLive(db => listExercises(db), []) ?? [];
  const bodyweight = useLive(db => listBodyweight(db), []) ?? [];
  const today = todayISO();
  const rows = useLive(db => (stored ? goalRows(db, strip(stored), today) : Promise.resolve([] as GoalRow[])), [stored]);
  const logMaxes = useLive(async db => {
    const all = await listExercises(db);
    const bw = (await listBodyweight(db)).at(-1)?.kg;
    const out: { ex: Exercise; e1rm: number }[] = [];
    for (const ex of all.filter(isMainLift)) {
      const st = await liftStats(db, ex, today, bw);
      if (st.best90 !== null) out.push({ ex, e1rm: st.best90 });
    }
    return out;
  }, []);
  // Starting numbers matter only until each lift's first logged session.
  const pending = useLive(db => (stored ? pendingStartingSets(db, strip(stored)) : Promise.resolve([] as StartingSet[])), [stored]) ?? [];
  const gym = useGymStandards();
  const [open, setOpen] = useState<SheetKey | null>(null);

  const base: ProfileT | undefined = stored === undefined ? undefined : stored ? strip(stored) : defaultProfile();
  if (!base) return <section className="screen setup"><NavBar title="Profile" /></section>;
  const p = base;
  const latest = bodyweight[bodyweight.length - 1];
  const names = new Map(exercises.map(e => [e.id, e.name]));
  const byId = new Map(exercises.map(e => [e.id, e]));
  const ctx = standardsContext({ profile: p, bodyweightKg: latest?.kg, year: new Date().getFullYear() });
  const close = () => setOpen(null);
  const edit = (k: SheetKey, label = 'Edit') => <GroupAction onClick={() => setOpen(k)}>{label}</GroupAction>;

  const where: LabelValueItem[] = [
    { label: 'Sex', value: p.sex ? SEX_WORD[p.sex] : 'Not set' },
    { label: 'Born', value: p.birthYear ?? '—' },
    { label: 'Height', value: p.heightCm !== undefined ? `${p.heightCm} cm` : '—' },
    { label: 'Training age', value: p.trainingAgeYears !== undefined ? `${p.trainingAgeYears} yr` : '—' },
    { label: 'Sessions a week', value: `${p.sessionsPerWeekTarget}, min ${p.sessionsPerWeekMin}`, accent: true },
    { label: 'Max session', value: p.maxSessionMinutes !== undefined ? `${p.maxSessionMinutes} min` : '—' },
  ];
  const rowFor = new Map((rows ?? []).map(r => [r.target.id, r]));
  const others = p.goals.filter(g => g !== p.primaryGoal);

  return (
    <section className="screen setup">
      <DemoBanner />
      <NavBar title="Profile">
        <Lockup mid={`Profile //${GOAL_SHORT[p.primaryGoal]}`} />
      </NavBar>

      <section className="you-hero" aria-label="Bodyweight">
        <div className="group-hd"><h2 className="label">Bodyweight</h2><GroupAction onClick={() => setOpen('bodyweight')}>Log</GroupAction></div>
        {latest
          ? <BigNumber size="display" value={kg(latest.kg)} unit="kg" caption={formatDate(latest.date, { year: false })} />
          : <BigNumber size="display" value="—" unit="kg" caption="nothing logged yet" />}
      </section>

      <nav className="link-rows" aria-label="Program and settings">
        <ValueRow href="#/profile/program" className="nav-row" data-press="row" k={<PixelIcon name="bar" />} value="Program" sub="Sessions, slots, phases">
          <PixelIcon name="chevron" />
        </ValueRow>
        <ValueRow href="#/profile/settings" className="nav-row" data-press="row" k={<PixelIcon name="settings" />} value="Settings" sub="Appearance, effort scale, backup">
          <PixelIcon name="chevron" />
        </ValueRow>
      </nav>

      <Group label="Where I am" right={edit('where')}>
        <LabelValueGrid items={where} />
      </Group>

      <Group label="Goals" right={edit('goals')}>
        <LabelValueGrid items={[
          { label: 'Primary', value: GOAL_LABELS[p.primaryGoal] },
          { label: 'Also', value: others.length ? others.map(g => GOAL_LABELS[g]).join(', ') : '—' },
        ]} />
      </Group>

      <Group label="Targets and timeline" right={edit('targets', p.targets.length ? 'Edit' : 'Add')}>
        {p.targets.length === 0 && <p className="quiet">No targets yet. A target puts a deadline and a pace on a lift, your bodyweight or sessions a week.</p>}
        {p.targets.length > 0 && (
          <div className="sheetblk">
            <div className="sheetblk-hd"><span>Target</span><span>Level and pace</span></div>
            {p.targets.map((t, i) => {
              const r = rowFor.get(t.id);
              return (
                <ValueRow key={t.id} className="tall" k={pad2(i + 1)} value={r?.name ?? names.get(t.subject) ?? t.subject} sub={targetLine(t)}
                  main={<span className="srow-bars">
                    <TargetLevelBar gym={gym} ctx={ctx} ex={byId.get(t.subject)} value={t.value} />
                    {r && <PaceBar row={r} />}
                  </span>} />
              );
            })}
          </div>
        )}
      </Group>

      <Group label="Injuries (areas to protect)" right={edit('injuries', p.injuries.length ? 'Edit' : 'Add')}>
        {p.injuries.length === 0
          ? <p className="quiet">None. Areas listed here pre-fill the pain flag and hold progress on lifts that load them.</p>
          : <div className="sheetblk">
              {p.injuries.map((inj, i) => (
                <ValueRow key={i} k={inj.side === 'na' ? '—' : SIDE_LABELS[inj.side]} value={PAIN_AREA_LABELS[inj.area]}
                  sub={(inj.since || inj.note) ? [inj.since && `since ${formatDate(inj.since, { weekday: false })}`, inj.note].filter(Boolean).join(', ') : undefined} />
              ))}
            </div>}
      </Group>

      {pending.length > 0 && (
        <Group label="Starting numbers" right={edit('starting')}>
          <p className="quiet">Your best sets from setup. Each lift's first target comes from its number until you log that lift.</p>
          <div className="sheetblk">
            {pending.map(s => (
              <ValueRow key={s.exerciseId} k="Best" value={names.get(s.exerciseId) ?? s.exerciseId} right={`${kg(s.weight)} × ${s.reps}`} />
            ))}
          </div>
        </Group>
      )}

      <Group label="Current maxes" right={edit('maxes', 'Add')}>
        {(logMaxes?.length ?? 0) + p.manualMaxes.length === 0
          ? <p className="quiet">No maxes yet. Best e1RMs from your log show here once you have sets in the last 90 days.</p>
          : <div className="sheetblk">
              <div className="sheetblk-hd"><span>Lift</span><span>kg and source</span></div>
              {(logMaxes ?? []).map(m => (
                <ValueRow key={m.ex.id} k="From log" value={m.ex.name} sub="Best e1RM, 90 days" right={kg(Math.round(m.e1rm * 2) / 2)} />
              ))}
              {p.manualMaxes.map((m, i) => (
                <ValueRow key={`m${i}`} k="1RM" value={names.get(m.exerciseId) ?? m.exerciseId} sub={`Manual, ${formatDate(m.date, { weekday: false })}`} right={kg(m.kg)} />
              ))}
            </div>}
      </Group>

      <Group label="Checkpoints" right={edit('checkpoints', p.checkpoints.length ? 'Edit' : 'Add')}>
        {p.checkpoints.length === 0
          ? <p className="quiet">No checkpoint dates.</p>
          : <div className="sheetblk">
              {p.checkpoints.map((c, i) => (
                <ValueRow key={c} k={pad2(i + 1)} value={formatDate(c)} right={c < today ? 'past' : ''} rightMid />
              ))}
            </div>}
      </Group>

      <p className="note">//Note: each save keeps the earlier version with its date.</p>

      <BodyweightSheet open={open === 'bodyweight'} onClose={close} entries={bodyweight} />
      <EditSheet open={open === 'where'} title="Where I am" base={p} onClose={close}>{(d, set) => <WhereForm p={d} set={set} />}</EditSheet>
      <EditSheet open={open === 'goals'} title="Goals" base={p} onClose={close}>{(d, set) => <GoalsEditor profile={d} onChange={set} />}</EditSheet>
      <EditSheet open={open === 'targets'} title="Targets and timeline" base={p} onClose={close}>
        {(d, set) => <TargetsEditor profile={d} onChange={set} exercises={exercises} bodyweightKg={latest?.kg} />}
      </EditSheet>
      <EditSheet open={open === 'injuries'} title="Areas to protect" base={p} onClose={close}>{(d, set) => <InjuriesForm profile={d} onChange={set} />}</EditSheet>
      <EditSheet open={open === 'maxes'} title="Manual maxes" base={p} onClose={close}>{(d, set) => <MaxesForm profile={d} onChange={set} exercises={exercises} />}</EditSheet>
      <EditSheet open={open === 'starting'} title="Starting numbers" base={p} onClose={close}>
        {(d, set) => <StartingForm profile={d} onChange={set} pending={pending.map(x => x.exerciseId)} names={names} />}
      </EditSheet>
      <EditSheet open={open === 'checkpoints'} title="Checkpoints" base={p} onClose={close}>{(d, set) => <CheckpointsEditor profile={d} onChange={set} />}</EditSheet>
    </section>
  );
}

/** Now vs target as a dither bar, with the pace read as the value. */
function PaceBar({ row }: { row: GoalRow }) {
  const t = row.target;
  if (row.current === null) return <DitherBar label="Pace" valueText="No recent sets" value={0} />;
  const lo = Math.min(row.current, t.value), hi = Math.max(row.current, t.value);
  const frac = hi > 0 ? lo / hi : 0;
  const word = row.pace ? feasibilityWord(row.pace.feasibility) : row.current >= t.value ? 'at target' : '';
  return (
    <>
      <DitherBar label={`Now ${kg(Math.round(row.current * 10) / 10)} of ${t.value}`} valueText={word || `${Math.round(frac * 100)}%`} value={frac}
        ariaLabel={`Pace: now ${kg(row.current)} of ${t.value}${word ? `, ${word}` : ''}`} />
      {row.paceLine && <span className="srow-sub">{row.paceLine}</span>}
    </>
  );
}

/** A sheet over a copy of the profile; Save validates and writes one version. */
function EditSheet({ open, title, base, onClose, children }: {
  open: boolean; title: string; base: ProfileT; onClose: () => void; children: (d: ProfileT, set: (p: ProfileT) => void) => ReactNode;
}) {
  return (
    <Sheet className="setup-sheet" open={open} title={title} onClose={onClose}>
      <EditBody base={base} onClose={onClose}>{children}</EditBody>
    </Sheet>
  );
}

function EditBody({ base, onClose, children }: { base: ProfileT; onClose: () => void; children: (d: ProfileT, set: (p: ProfileT) => void) => ReactNode }) {
  const [draft, setDraft] = useState<ProfileT>(base);
  const [errors, setErrors] = useState<string[]>([]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(base);
  return (
    <>
      {children(draft, setDraft)}
      <Errors errors={errors} />
      <Button variant="primary" block iconEnd="check" disabled={!dirty} onClick={async () => {
        const errs = validateProfile(draft, new Date().getFullYear());
        setErrors(errs);
        if (errs.length) return;
        await saveProfile(getDb(), draft);
        showHud('Saved');
        onClose();
      }}>Save</Button>
    </>
  );
}

function WhereForm({ p, set }: { p: ProfileT; set: (p: ProfileT) => void }) {
  return (
    <>
      <Segmented<Sex | 'none'> label="Sex" value={p.sex ?? 'none'} onChange={v => set({ ...p, sex: v === 'none' ? undefined : v })}
        options={[{ value: 'M', label: 'Male' }, { value: 'F', label: 'Female' }, { value: 'none', label: 'Not set' }]} />
      <div className="grid2">
        <NumField label="Birth year" value={p.birthYear} integer onChange={v => set({ ...p, birthYear: v })} />
        <NumField label="Height (cm)" value={p.heightCm} onChange={v => set({ ...p, heightCm: v })} />
        <NumField label="Training age (yr)" value={p.trainingAgeYears} onChange={v => set({ ...p, trainingAgeYears: v })} />
        <NumField label="Max session (min)" value={p.maxSessionMinutes} integer onChange={v => set({ ...p, maxSessionMinutes: v })} />
      </div>
      <div className="grid2">
        <Stepper label="Sessions a week" value={p.sessionsPerWeekTarget} min={1} max={14} onChange={v => set({ ...p, sessionsPerWeekTarget: v })} />
        <Stepper label="Minimum" value={p.sessionsPerWeekMin} min={1} max={14} onChange={v => set({ ...p, sessionsPerWeekMin: v })} />
      </div>
    </>
  );
}

/** Text field for an optional number; commits a valid value on blur. */
function NumField({ label, value, onChange, integer }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void; integer?: boolean }) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  const [err, setErr] = useState('');
  useEffect(() => setText(value === undefined ? '' : String(value)), [value]);
  const commit = (s: string) => {
    const r = parseNum(s, { integer, min: 0, name: label.replace(/\s*\(.*\)$/, '') });
    if (r.ok) { setErr(''); if (r.value !== value) onChange(r.value); } else setErr(r.error);
  };
  return (
    <label className="field-wrap">
      <span className="label">{label}</span>
      <input className="field big tnum" inputMode={integer ? 'numeric' : 'decimal'} value={text}
        onChange={e => setText(e.target.value)}
        onBlur={() => commit(text)} />
      {err && <span className="field-error" role="alert">{err}</span>}
    </label>
  );
}

function BodyweightSheet({ open, onClose, entries }: { open: boolean; onClose: () => void; entries: BodyweightEntry[] }) {
  const latest = entries[entries.length - 1];
  return (
    <Sheet className="setup-sheet" open={open} title="Bodyweight" onClose={onClose}>
      <BodyweightBody latestKg={latest?.kg} entries={entries} onClose={onClose} />
    </Sheet>
  );
}

function BodyweightBody({ latestKg, entries, onClose }: { latestKg?: number; entries: BodyweightEntry[]; onClose: () => void }) {
  const [kgv, setKg] = useState(latestKg ?? 75);
  const [date, setDate] = useState(todayISO());
  const [errors, setErrors] = useState<string[]>([]);
  const recent = entries.slice(-6).reverse();
  return (
    <>
      <div className="grid2">
        <Stepper label="Bodyweight" unit="kg" value={kgv} step={0.1} min={20} max={300} decimals={1} onChange={setKg} />
        <DateField label="Date" value={date} max={todayISO()} onChange={v => setDate(v || todayISO())} />
      </div>
      <Errors errors={errors} />
      <Button variant="primary" block iconEnd="check" onClick={async () => {
        const errs = validateBodyweight(kgv);
        setErrors(errs);
        if (errs.length) return;
        await addBodyweight(getDb(), date, kgv);
        showHud('Logged');
        onClose();
      }}>Log {kg(kgv)} kg</Button>
      {recent.length > 0 && (
        <div className="sheetblk">
          <div className="sheetblk-hd"><span>Recent</span><span>kg</span></div>
          {recent.map(e => (
            <ValueRow key={e.id} k={`${e.date.slice(8)}.${e.date.slice(5, 7)}`} value={kg(e.kg)} valueClassName="tnum">
              <button type="button" className="icon-btn" aria-label={`Delete ${kg(e.kg)} kg on ${formatDate(e.date)}`} data-press="dim"
                onClick={() => deleteBodyweight(getDb(), e.id)}><PixelIcon name="trash" /></button>
            </ValueRow>
          ))}
        </div>
      )}
    </>
  );
}

function InjuriesForm({ profile, onChange }: { profile: ProfileT; onChange: (p: ProfileT) => void }) {
  const [area, setArea] = useState<PainArea>('shoulder');
  const [side, setSide] = useState<Side>('left');
  const [since, setSince] = useState('');
  const [note, setNote] = useState('');
  return (
    <>
      <p className="quiet">These pre-fill the pain flag and hold progress on lifts that load the area.</p>
      {profile.injuries.length > 0 && (
        <div className="sheetblk">
          {profile.injuries.map((inj, i) => (
            <ValueRow key={i} k={inj.side === 'na' ? '—' : SIDE_LABELS[inj.side]} value={PAIN_AREA_LABELS[inj.area]}
              sub={(inj.since || inj.note) ? [inj.since && `since ${formatDate(inj.since, { weekday: false })}`, inj.note].filter(Boolean).join(', ') : undefined}>
              <button type="button" className="icon-btn" aria-label={`Remove ${PAIN_AREA_LABELS[inj.area]}`} data-press="dim"
                onClick={() => onChange({ ...profile, injuries: profile.injuries.filter((_, j) => j !== i) })}><PixelIcon name="trash" /></button>
            </ValueRow>
          ))}
        </div>
      )}
      <Select<PainArea> label={profile.injuries.length ? 'Another area' : 'Area'} value={area} onChange={setArea}
        options={PAIN_AREAS.map(a => ({ value: a, label: PAIN_AREA_LABELS[a] }))} />
      <Segmented<Side> label="Side" value={side} onChange={setSide}
        options={(['left', 'right', 'both', 'na'] as Side[]).map(s => ({ value: s, label: s === 'na' ? 'N/A' : SIDE_LABELS[s] }))} />
      <div className="grid2">
        <DateField label="Since (optional)" value={since} max={todayISO()} clearable onChange={setSince} />
        <label className="field-wrap">
          <span className="label">Note (optional)</span>
          <input className="field" value={note} onChange={e => setNote(e.target.value)} />
        </label>
      </div>
      <Button block iconEnd="plus" onClick={() => {
        onChange({ ...profile, injuries: [...profile.injuries, { area, side, ...(since ? { since } : {}), ...(note.trim() ? { note: note.trim() } : {}) }] });
        setSince(''); setNote('');
      }}>Add area</Button>
    </>
  );
}

function StartingForm({ profile, onChange, pending, names }: {
  profile: ProfileT; onChange: (p: ProfileT) => void; pending: string[]; names: Map<string, string>;
}) {
  const list = startingSetsOf(profile).filter(s => pending.includes(s.exerciseId));
  const all = profile.startingSets ?? [];
  if (!list.length) return <p className="quiet">No starting numbers left.</p>;
  return (
    <>
      <p className="quiet">Fix a number, or remove it to make that lift's first session a baseline.</p>
      {list.map(s => {
        const name = names.get(s.exerciseId) ?? s.exerciseId;
        return (
          <div key={s.exerciseId} className="num-row">
            <div className="num-row-hd">
              <span className="label">{name}</span>
              <button type="button" className="icon-btn" aria-label={`Remove ${name} starting number`} data-press="dim"
                onClick={() => onChange({ ...profile, startingSets: removeStartingSet(all, s.exerciseId) })}><PixelIcon name="trash" /></button>
            </div>
            <div className="grid2">
              <Stepper label="Weight" unit="kg" value={s.weight} step={2.5} min={1} max={500}
                onChange={v => onChange({ ...profile, startingSets: editStartingSet(all, s.exerciseId, v, s.reps) })} />
              <Stepper label="Reps" value={s.reps} min={START_REPS.min} max={START_REPS.max}
                onChange={v => onChange({ ...profile, startingSets: editStartingSet(all, s.exerciseId, s.weight, v) })} />
            </div>
          </div>
        );
      })}
    </>
  );
}

function MaxesForm({ profile, onChange, exercises }: { profile: ProfileT; onChange: (p: ProfileT) => void; exercises: Exercise[] }) {
  const main = exercises.filter(isMainLift);
  const names = new Map(exercises.map(e => [e.id, e.name]));
  const [exId, setExId] = useState('');
  const [kgv, setKg] = useState(100);
  const [date, setDate] = useState(todayISO());
  const [errors, setErrors] = useState<string[]>([]);
  return (
    <>
      <p className="quiet">A tested or trusted 1RM, for lifts the log doesn’t cover yet. One per lift; a new one replaces the old.</p>
      {profile.manualMaxes.length > 0 && (
        <div className="sheetblk">
          {profile.manualMaxes.map((m, i) => (
            <ValueRow key={i} k="1RM" value={names.get(m.exerciseId) ?? m.exerciseId} sub={`${kg(m.kg)} kg, ${formatDate(m.date, { weekday: false })}`}>
              <button type="button" className="icon-btn" aria-label={`Remove ${names.get(m.exerciseId) ?? m.exerciseId} max`} data-press="dim"
                onClick={() => onChange({ ...profile, manualMaxes: profile.manualMaxes.filter((_, j) => j !== i) })}><PixelIcon name="trash" /></button>
            </ValueRow>
          ))}
        </div>
      )}
      <Select<string> label="Lift" value={exId} onChange={setExId}
        options={[...main.map(e => ({ value: e.id, label: e.name, group: 'Main lifts' })), ...exercises.filter(e => !main.includes(e)).map(e => ({ value: e.id, label: e.name, group: 'All exercises' }))]} />
      <div className="grid2">
        <Stepper label="1RM" unit="kg" value={kgv} step={2.5} min={1} max={500} onChange={setKg} />
        <DateField label="Date" value={date} max={todayISO()} onChange={v => setDate(v || todayISO())} />
      </div>
      <Errors errors={errors} />
      <Button block iconEnd="plus" onClick={() => {
        const errs = exId ? [] : ['Pick a lift'];
        setErrors(errs);
        if (errs.length) return;
        const others = profile.manualMaxes.filter(m => m.exerciseId !== exId);
        onChange({ ...profile, manualMaxes: [...others, { exerciseId: exId, kg: kgv, date }] });
        setExId('');
      }}>Add max</Button>
    </>
  );
}
