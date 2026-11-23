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
import { t, tn } from '../i18n';

const strip = (p: ProfileT & { id?: string; history?: unknown }): ProfileT => {
  const { id: _i, history: _h, ...rest } = p;
  void _i; void _h;
  return rest;
};

type SheetKey = 'where' | 'bodyweight' | 'goals' | 'targets' | 'injuries' | 'maxes' | 'checkpoints' | 'starting';
const sexWord = (s: Sex) => (s === 'M' ? t('Male') : t('Female'));
/** Kept in Latin in both languages. */
const ONE_RM = '1RM';
const isMainLift = (e: Exercise) => !!e.benchmarkKey || e.id === 'overhead-press';

export function Profile({ params }: { params: string[] }) {
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
  const pending = useLive(db => (stored ? pendingStartingSets(db, strip(stored), today) : Promise.resolve([] as StartingSet[])), [stored]) ?? [];
  const gym = useGymStandards();
  // #/profile/targets (the goal nudge's link) opens the Targets sheet.
  const [open, setOpen] = useState<SheetKey | null>(params[0] === 'targets' ? 'targets' : null);

  const base: ProfileT | undefined = stored === undefined ? undefined : stored ? strip(stored) : defaultProfile();
  if (!base) return <section className="screen setup"><NavBar title={t('Profile')} /></section>;
  const p = base;
  const latest = bodyweight[bodyweight.length - 1];
  const names = new Map(exercises.map(e => [e.id, tn(e.name)]));
  const byId = new Map(exercises.map(e => [e.id, e]));
  const ctx = standardsContext({ profile: p, bodyweightKg: latest?.kg, year: new Date().getFullYear() });
  const close = () => setOpen(null);
  const edit = (k: SheetKey, label = t('Edit')) => <GroupAction onClick={() => setOpen(k)}>{label}</GroupAction>;

  const where: LabelValueItem[] = [
    { label: t('Sex'), value: p.sex ? sexWord(p.sex) : t('Not set') },
    { label: t('Born'), value: p.birthYear ?? '—' },
    { label: t('Height'), value: p.heightCm !== undefined ? `${p.heightCm} cm` : '—' },
    { label: t('Training age'), value: p.trainingAgeYears !== undefined ? t('{n} yr', { n: p.trainingAgeYears }) : '—' },
    { label: t('Sessions a week'), value: t('{target}, min {min}', { target: p.sessionsPerWeekTarget, min: p.sessionsPerWeekMin }), accent: true },
    { label: t('Max session'), value: p.maxSessionMinutes !== undefined ? t('{n} min', { n: p.maxSessionMinutes }) : '—' },
  ];
  const rowFor = new Map((rows ?? []).map(r => [r.target.id, r]));
  const others = p.goals.filter(g => g !== p.primaryGoal);

  return (
    <section className="screen setup">
      <DemoBanner />
      <NavBar title={t('Profile')} titleAction={
        <a className="icon-btn" href="#/profile/settings" aria-label={t('Settings: appearance, effort scale, backup')} data-press="dim"><PixelIcon name="settings" /></a>
      }>
        <Lockup mid={t('Profile // {goal}', { goal: GOAL_SHORT[p.primaryGoal] })} />
      </NavBar>

      <section className="you-hero" aria-label={t('Bodyweight')}>
        <div className="group-hd"><h2 className="label">{t('Bodyweight')}</h2><GroupAction onClick={() => setOpen('bodyweight')}>{t('Update')}</GroupAction></div>
        {latest
          ? <BigNumber size="display" value={kg(latest.kg)} unit="kg" caption={formatDate(latest.date, { year: false })} />
          : <BigNumber size="display" value="—" unit="kg" caption={t('nothing logged yet')} />}
      </section>

      <nav className="link-rows" aria-label={t('Program')}>
        <ValueRow href="#/profile/program" className="nav-row" data-press="row" k={<PixelIcon name="bar" />} value={t('Program')} sub={t('Sessions and lifts')}>
          <PixelIcon name="chevron" />
        </ValueRow>
      </nav>

      <Group label={t('Where I am')} right={edit('where')}>
        <LabelValueGrid items={where} />
      </Group>

      <Group label={t('Goals')} right={edit('goals')}>
        <LabelValueGrid items={[
          { label: t('Primary'), value: GOAL_LABELS[p.primaryGoal] },
          { label: t('Also'), value: others.length ? others.map(g => GOAL_LABELS[g]).join(t(', ')) : '—' },
        ]} />
      </Group>

      <Group label={t('Targets and timeline')} right={edit('targets', p.targets.length ? t('Edit') : t('Add'))}>
        {p.targets.length === 0 && <p className="quiet">{t('No targets yet. A target puts a deadline and a pace on a lift, your bodyweight or sessions a week.')}</p>}
        {p.targets.length > 0 && (
          <div className="sheetblk">
            <div className="sheetblk-hd"><span>{t('Target')}</span><span>{t('Level and pace')}</span></div>
            {p.targets.map((tg, i) => {
              const r = rowFor.get(tg.id);
              return (
                <ValueRow key={tg.id} className="tall" k={String(i + 1)} value={r ? tn(r.name) : names.get(tg.subject) ?? tg.subject} sub={targetLine(tg)}
                  main={<span className="srow-bars">
                    <TargetLevelBar gym={gym} ctx={ctx} ex={byId.get(tg.subject)} value={tg.value} />
                    {r && <PaceBar row={r} />}
                  </span>} />
              );
            })}
          </div>
        )}
      </Group>

      <Group label={t('Injuries (areas to protect)')} right={edit('injuries', p.injuries.length ? t('Edit') : t('Add'))}>
        {p.injuries.length === 0
          ? <p className="quiet">{t('None. Areas listed here pre-fill the pain flag and hold progress on lifts that load them.')}</p>
          : <div className="sheetblk">
              {p.injuries.map((inj, i) => (
                <ValueRow key={i} k={inj.side === 'na' ? '—' : SIDE_LABELS[inj.side]} value={PAIN_AREA_LABELS[inj.area]}
                  sub={(inj.since || inj.note) ? [inj.since && t('since {date}', { date: formatDate(inj.since, { weekday: false }) }), inj.note].filter(Boolean).join(t(', ')) : undefined} />
              ))}
            </div>}
      </Group>

      {pending.length > 0 && (
        <Group label={t('Starting numbers')} right={edit('starting')}>
          <p className="quiet">{t("Your best sets from setup. Each lift's first target comes from its number until you log that lift.")}</p>
          <div className="sheetblk">
            {pending.map(s => (
              <ValueRow key={s.exerciseId} k={t('Best')} value={names.get(s.exerciseId) ?? s.exerciseId} right={`${kg(s.weight)} × ${s.reps}`} />
            ))}
          </div>
        </Group>
      )}

      <Group label={t('Current maxes')} right={edit('maxes', t('Add'))}>
        {(logMaxes?.length ?? 0) + p.manualMaxes.length === 0
          ? <p className="quiet">{t('No maxes yet. Best e1RMs from your log show here once you have sets in the last 90 days.')}</p>
          : <div className="sheetblk">
              <div className="sheetblk-hd"><span>{t('Lift')}</span><span>{t('kg and source')}</span></div>
              {(logMaxes ?? []).map(m => (
                <ValueRow key={m.ex.id} k={t('From log')} value={tn(m.ex.name)} sub={t('Best e1RM, 90 days')} right={kg(Math.round(m.e1rm * 2) / 2)} />
              ))}
              {p.manualMaxes.map((m, i) => (
                <ValueRow key={`m${i}`} k="1RM" value={names.get(m.exerciseId) ?? m.exerciseId} sub={t('Manual, {date}', { date: formatDate(m.date, { weekday: false }) })} right={kg(m.kg)} />
              ))}
            </div>}
      </Group>

      <Group label={t('Checkpoints')} right={edit('checkpoints', p.checkpoints.length ? t('Edit') : t('Add'))}>
        {p.checkpoints.length === 0
          ? <p className="quiet">{t('No checkpoint dates.')}</p>
          : <div className="sheetblk">
              {p.checkpoints.map((c, i) => (
                <ValueRow key={c} k={String(i + 1)} value={formatDate(c)} right={c < today ? t('past') : ''} rightMid />
              ))}
            </div>}
      </Group>

      <p className="note">{t('// Note: each save keeps the earlier version with its date.')}</p>

      <BodyweightSheet open={open === 'bodyweight'} onClose={close} entries={bodyweight} />
      <EditSheet open={open === 'where'} title={t('Where I am')} base={p} onClose={close}>{(d, set) => <WhereForm p={d} set={set} />}</EditSheet>
      <EditSheet open={open === 'goals'} title={t('Goals')} base={p} onClose={close}>{(d, set) => <GoalsEditor profile={d} onChange={set} />}</EditSheet>
      <EditSheet open={open === 'targets'} title={t('Targets and timeline')} base={p} onClose={close}>
        {(d, set) => <TargetsEditor profile={d} onChange={set} exercises={exercises} bodyweightKg={latest?.kg} />}
      </EditSheet>
      <EditSheet open={open === 'injuries'} title={t('Areas to protect')} base={p} onClose={close}>{(d, set) => <InjuriesForm profile={d} onChange={set} />}</EditSheet>
      <EditSheet open={open === 'maxes'} title={t('Manual maxes')} base={p} onClose={close}>{(d, set) => <MaxesForm profile={d} onChange={set} exercises={exercises} />}</EditSheet>
      <EditSheet open={open === 'starting'} title={t('Starting numbers')} base={p} onClose={close}>
        {(d, set) => <StartingForm profile={d} onChange={set} pending={pending.map(x => x.exerciseId)} names={names} />}
      </EditSheet>
      <EditSheet open={open === 'checkpoints'} title={t('Checkpoints')} base={p} onClose={close}>{(d, set) => <CheckpointsEditor profile={d} onChange={set} />}</EditSheet>
    </section>
  );
}

/** Now vs target as a dither bar, with the pace read as the value. */
function PaceBar({ row }: { row: GoalRow }) {
  const tg = row.target;
  if (row.current === null) return <DitherBar label={t('Pace')} valueText={t('No recent sets')} value={0} />;
  const lo = Math.min(row.current, tg.value), hi = Math.max(row.current, tg.value);
  const frac = hi > 0 ? lo / hi : 0;
  const word = row.pace ? feasibilityWord(row.pace.feasibility) : row.current >= tg.value ? t('at target') : '';
  return (
    <>
      <DitherBar label={t('Now {now} of {target}', { now: kg(Math.round(row.current * 10) / 10), target: tg.value })} valueText={word || `${Math.round(frac * 100)}%`} value={frac}
        ariaLabel={word
          ? t('Pace: now {now} of {target}, {word}', { now: kg(row.current), target: tg.value, word })
          : t('Pace: now {now} of {target}', { now: kg(row.current), target: tg.value })} />
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
        showHud(t('Saved'));
        onClose();
      }}>{t('Save')}</Button>
    </>
  );
}

function WhereForm({ p, set }: { p: ProfileT; set: (p: ProfileT) => void }) {
  return (
    <>
      <Segmented<Sex | 'none'> label={t('Sex')} value={p.sex ?? 'none'} onChange={v => set({ ...p, sex: v === 'none' ? undefined : v })}
        options={[{ value: 'M', label: t('Male') }, { value: 'F', label: t('Female') }, { value: 'none', label: t('Not set') }]} />
      <div className="grid2">
        <NumField label={t('Birth year')} value={p.birthYear} integer onChange={v => set({ ...p, birthYear: v })} />
        <NumField label={t('Height (cm)')} value={p.heightCm} onChange={v => set({ ...p, heightCm: v })} />
        <NumField label={t('Training age (yr)')} value={p.trainingAgeYears} onChange={v => set({ ...p, trainingAgeYears: v })} />
        <NumField label={t('Max session (min)')} value={p.maxSessionMinutes} integer onChange={v => set({ ...p, maxSessionMinutes: v })} />
      </div>
      <div className="grid2">
        <Stepper label={t('Sessions a week')} value={p.sessionsPerWeekTarget} min={1} max={14} onChange={v => set({ ...p, sessionsPerWeekTarget: v })} />
        <Stepper label={t('Minimum')} value={p.sessionsPerWeekMin} min={1} max={14} onChange={v => set({ ...p, sessionsPerWeekMin: v })} />
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
    const r = parseNum(s, { integer, min: 0, name: label.replace(/\s*[(（].*[)）]$/, '') });
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
    <Sheet className="setup-sheet" open={open} title={t('Bodyweight')} onClose={onClose}>
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
        <Stepper label={t('Bodyweight')} unit="kg" value={kgv} step={0.1} min={20} max={300} decimals={1} onChange={setKg} />
        <DateField label={t('Date')} value={date} max={todayISO()} onChange={v => setDate(v || todayISO())} />
      </div>
      <Errors errors={errors} />
      <Button variant="primary" block iconEnd="check" onClick={async () => {
        const errs = validateBodyweight(kgv);
        setErrors(errs);
        if (errs.length) return;
        await addBodyweight(getDb(), date, kgv);
        showHud(t('Bodyweight updated'));
        onClose();
      }}>{t('Update to {kg} kg', { kg: kg(kgv) })}</Button>
      {recent.length > 0 && (
        <div className="sheetblk">
          <div className="sheetblk-hd"><span>{t('Recent')}</span><span>kg</span></div>
          {recent.map(e => (
            <ValueRow key={e.id} k={`${e.date.slice(8)}.${e.date.slice(5, 7)}`} value={kg(e.kg)} valueClassName="tnum">
              <button type="button" className="icon-btn" aria-label={t('Delete {kg} kg on {date}', { kg: kg(e.kg), date: formatDate(e.date) })} data-press="dim"
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
      <p className="quiet">{t('These pre-fill the pain flag and hold progress on lifts that load the area.')}</p>
      {profile.injuries.length > 0 && (
        <div className="sheetblk">
          {profile.injuries.map((inj, i) => (
            <ValueRow key={i} k={inj.side === 'na' ? '—' : SIDE_LABELS[inj.side]} value={PAIN_AREA_LABELS[inj.area]}
              sub={(inj.since || inj.note) ? [inj.since && t('since {date}', { date: formatDate(inj.since, { weekday: false }) }), inj.note].filter(Boolean).join(t(', ')) : undefined}>
              <button type="button" className="icon-btn" aria-label={t('Remove {name}', { name: PAIN_AREA_LABELS[inj.area] })} data-press="dim"
                onClick={() => onChange({ ...profile, injuries: profile.injuries.filter((_, j) => j !== i) })}><PixelIcon name="trash" /></button>
            </ValueRow>
          ))}
        </div>
      )}
      <Select<PainArea> label={profile.injuries.length ? t('Another area') : t('Area')} value={area} onChange={setArea}
        options={PAIN_AREAS.map(a => ({ value: a, label: PAIN_AREA_LABELS[a] }))} />
      <Segmented<Side> label={t('Side')} value={side} onChange={setSide}
        options={(['left', 'right', 'both', 'na'] as Side[]).map(s => ({ value: s, label: s === 'na' ? t('N/A') : SIDE_LABELS[s] }))} />
      <div className="grid2">
        <DateField label={t('Since (optional)')} value={since} max={todayISO()} clearable onChange={setSince} />
        <label className="field-wrap">
          <span className="label">{t('Note (optional)')}</span>
          <input className="field" value={note} onChange={e => setNote(e.target.value)} />
        </label>
      </div>
      <Button block iconEnd="plus" onClick={() => {
        onChange({ ...profile, injuries: [...profile.injuries, { area, side, ...(since ? { since } : {}), ...(note.trim() ? { note: note.trim() } : {}) }] });
        setSince(''); setNote('');
      }}>{t('Add area')}</Button>
    </>
  );
}

function StartingForm({ profile, onChange, pending, names }: {
  profile: ProfileT; onChange: (p: ProfileT) => void; pending: string[]; names: Map<string, string>;
}) {
  const list = startingSetsOf(profile).filter(s => pending.includes(s.exerciseId));
  const all = profile.startingSets ?? [];
  if (!list.length) return <p className="quiet">{t('No starting numbers left.')}</p>;
  return (
    <>
      <p className="quiet">{t("Fix a number, or remove it to make that lift's first session a baseline.")}</p>
      {list.map(s => {
        const name = names.get(s.exerciseId) ?? s.exerciseId;
        return (
          <div key={s.exerciseId} className="num-row">
            <div className="num-row-hd">
              <span className="label">{name}</span>
              <button type="button" className="icon-btn" aria-label={t('Remove {name} starting number', { name })} data-press="dim"
                onClick={() => onChange({ ...profile, startingSets: removeStartingSet(all, s.exerciseId) })}><PixelIcon name="trash" /></button>
            </div>
            <div className="grid2">
              <Stepper label={t('Weight')} unit="kg" value={s.weight} step={2.5} min={1} max={500}
                onChange={v => onChange({ ...profile, startingSets: editStartingSet(all, s.exerciseId, v, s.reps) })} />
              <Stepper label={t('Reps')} value={s.reps} min={START_REPS.min} max={START_REPS.max}
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
  const names = new Map(exercises.map(e => [e.id, tn(e.name)]));
  const [exId, setExId] = useState('');
  const [kgv, setKg] = useState(100);
  const [date, setDate] = useState(todayISO());
  const [errors, setErrors] = useState<string[]>([]);
  return (
    <>
      <p className="quiet">{t('A tested or trusted 1RM, for lifts the log doesn’t cover yet. One per lift; a new one replaces the old.')}</p>
      {profile.manualMaxes.length > 0 && (
        <div className="sheetblk">
          {profile.manualMaxes.map((m, i) => (
            <ValueRow key={i} k="1RM" value={names.get(m.exerciseId) ?? m.exerciseId} sub={t('{kg} kg, {date}', { kg: kg(m.kg), date: formatDate(m.date, { weekday: false }) })}>
              <button type="button" className="icon-btn" aria-label={t('Remove {name} max', { name: names.get(m.exerciseId) ?? m.exerciseId })} data-press="dim"
                onClick={() => onChange({ ...profile, manualMaxes: profile.manualMaxes.filter((_, j) => j !== i) })}><PixelIcon name="trash" /></button>
            </ValueRow>
          ))}
        </div>
      )}
      <Select<string> label={t('Lift')} value={exId} onChange={setExId}
        options={[...main.map(e => ({ value: e.id, label: tn(e.name), group: t('Main lifts') })), ...exercises.filter(e => !main.includes(e)).map(e => ({ value: e.id, label: tn(e.name), group: t('All exercises') }))]} />
      <div className="grid2">
        <Stepper label={ONE_RM} unit="kg" value={kgv} step={2.5} min={1} max={500} onChange={setKg} />
        <DateField label={t('Date')} value={date} max={todayISO()} onChange={v => setDate(v || todayISO())} />
      </div>
      <Errors errors={errors} />
      <Button block iconEnd="plus" onClick={() => {
        const errs = exId ? [] : [t('Pick a lift')];
        setErrors(errs);
        if (errs.length) return;
        const others = profile.manualMaxes.filter(m => m.exerciseId !== exId);
        onChange({ ...profile, manualMaxes: [...others, { exerciseId: exId, kg: kgv, date }] });
        setExId('');
      }}>{t('Add max')}</Button>
    </>
  );
}
