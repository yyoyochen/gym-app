// Settings (spec §4 Profile → Settings): effort scale, plates, benchmarks,
// export / import / restore, storage, wipe, about.
import { useEffect, useState } from 'react';
import type { EffortScale, Profile } from '../domain/types';
import {
  defaultProfile, exportBackupJson, exportSetsCsv, getDb, getMeta, getProfile, requestPersist, saveProfile, wipeAll,
} from '../db';
import { useLive } from '../ui/useLive';
import { go } from '../ui/router';
import { ConfirmButton, Segmented, Stepper, downloadText } from '../ui/common';
import { DemoBanner, useDemoMode } from '../app/DemoBanner';
import { formatDate, todayISO } from '../app/dates';
import { DEFAULT_PLATES, STANDARD_PLATES, getPlateSettings, savePlateSettings, type PlateSettings } from '../app/prefs';
import { ImportNotionPanel } from '../app/parts/ImportNotionPanel';
import { RestorePanel } from '../app/parts/RestorePanel';
import pkg from '../../../package.json';

const FALLBACK_ATTRIBUTION = 'OpenPowerlifting (openpowerlifting.org), public domain.';

export function Settings(_props: { params: string[] }) {
  const stored = useLive(db => getProfile(db).then(r => r ?? null), []);
  const plates = useLive(db => getPlateSettings(db), []);
  const lastExport = useLive(db => getMeta(db, 'lastExportAt'), []);
  const demo = useDemoMode();

  const profile: Profile | undefined = stored === undefined ? undefined : stored ?? defaultProfile();
  const setProfile = async (patch: Partial<Profile>) => {
    if (!profile) return;
    const { id: _i, history: _h, ...base } = profile as Profile & { id?: string; history?: unknown };
    void _i; void _h;
    await saveProfile(getDb(), { ...base, ...patch });
  };

  return (
    <section className="screen">
      <DemoBanner />
      <a className="back" href="#/profile">‹ Profile</a>
      <h1 className="title">Settings</h1>

      {profile && (
        <div className="card stack">
          <Segmented<EffortScale> label="Effort scale" value={profile.effortScale} onChange={v => setProfile({ effortScale: v })}
            options={[{ value: 'rir', label: 'RIR' }, { value: 'rpe', label: 'RPE' }]} />
          <p className="mid">Reps in reserve, or RPE (10 − RIR). Stored as RIR either way.</p>
          <Segmented<'tested' | 'all'> label="Benchmark population" value={profile.benchmarkPopulation} onChange={v => setProfile({ benchmarkPopulation: v })}
            options={[{ value: 'tested', label: 'Tested lifters' }, { value: 'all', label: 'All lifters' }]} />
        </div>
      )}

      {plates && <PlatesCard value={plates} />}

      <div className="card stack">
        <span className="label">Backup</span>
        <p className="mid">{lastExport ? <>Last export <span className="mono">{formatDate(todayISO(lastExport))}</span>.</> : 'Not exported yet.'} Your data lives only on this device.</p>
        <button className="btn primary" onClick={async () => {
          const text = await exportBackupJson(getDb());
          downloadText(`gymbro-backup-${todayISO()}.json`, text, 'application/json');
        }}>Export backup (JSON)</button>
        <button className="btn" onClick={async () => downloadText(`gymbro-sets-${todayISO()}.csv`, await exportSetsCsv(getDb()), 'text/csv')}>Export sets (CSV)</button>
      </div>

      <div className="card stack">
        <span className="label">Restore from backup</span>
        <RestorePanel />
      </div>

      <div className="card stack">
        <span className="label">Import Notion CSV</span>
        {demo ? <p className="mid">You’re looking at demo data. Tap “Start my log” first so the import doesn’t mix with it.</p> : <ImportNotionPanel />}
      </div>

      <StorageCard />

      <div className="card stack">
        <span className="label">Wipe all data</span>
        <WipeAll />
      </div>

      <About />
    </section>
  );
}

function PlatesCard({ value }: { value: PlateSettings }) {
  const save = (s: PlateSettings) => savePlateSettings(getDb(), s);
  return (
    <div className="card stack">
      <span className="label">Bar and plates</span>
      <Stepper label="Bar weight" unit="kg" value={value.barKg} step={2.5} min={0} max={40} onChange={v => save({ ...value, barKg: v })} />
      <span className="label">Plates available</span>
      <div className="chips">
        {STANDARD_PLATES.map(p => {
          const on = value.platesKg.includes(p);
          return <button key={p} type="button" aria-pressed={on} className={`chip big mono${on ? ' on' : ''}`}
            onClick={() => save({ ...value, platesKg: on ? value.platesKg.filter(x => x !== p) : [...value.platesKg, p] })}>{p}</button>;
        })}
      </div>
      <p className="mid">Used by the plate calculator. Exercise increments are set per exercise in the Program editor.</p>
      <button className="btn" onClick={() => save({ ...DEFAULT_PLATES })}>Reset to default</button>
    </div>
  );
}

function StorageCard() {
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    const s = navigator.storage;
    if (s && typeof s.persisted === 'function') s.persisted().then(setPersisted, () => setPersisted(false));
    else setPersisted(false);
  }, []);
  return (
    <div className="card stack">
      <span className="label">Storage</span>
      <p>{persisted === null ? '…' : persisted ? 'The browser keeps this app’s data (persistent storage granted).' : 'The browser may clear this app’s data under storage pressure.'}</p>
      {persisted === false && <button className="btn" onClick={async () => setPersisted(await requestPersist(getDb()))}>Ask the browser to keep my data</button>}
      <p className="mid">On iPhone, add the app to the Home Screen to keep your data.</p>
    </div>
  );
}

function WipeAll() {
  const [step, setStep] = useState(0);
  if (step === 0) return <button className="btn danger" onClick={() => setStep(1)}>Wipe all data…</button>;
  return (
    <div className="stack">
      <p>This deletes every session, set, program and setting on this device. It can’t be undone. Export a backup first if you want a copy.</p>
      <div className="row">
        <button className="btn" onClick={() => setStep(0)}>Cancel</button>
        <ConfirmButton danger className="grow" confirmLabel="Tap again to wipe everything" onConfirm={async () => {
          await wipeAll(getDb());
          go('onboarding');
        }}>Wipe everything</ConfirmButton>
      </div>
    </div>
  );
}

function About() {
  const [attribution, setAttribution] = useState(FALLBACK_ATTRIBUTION);
  const [dataDate, setDataDate] = useState('');
  useEffect(() => {
    fetch('./benchmarks/index.json').then(r => (r.ok ? r.json() : null)).then((j: { attribution?: string; dataDate?: string } | null) => {
      if (j?.attribution) setAttribution(j.attribution);
      if (j?.dataDate) setDataDate(j.dataDate);
    }).catch(() => undefined);
  }, []);
  return (
    <div className="card stack">
      <span className="label">About</span>
      <p>GymBro <span className="mono">{pkg.version}</span>. Local-first: no account, no server, no network calls with your data.</p>
      <span className="label">Data credits</span>
      <p className="mid">Benchmarks: {attribution}{dataDate && <> Data from <span className="mono">{dataDate}</span>.</>}</p>
      <p className="mid">Code under the MIT licence.</p>
    </div>
  );
}
