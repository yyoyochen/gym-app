// Settings (spec §4 Profile → Settings): appearance, effort scale,
// benchmarks, plates, backup / restore / import, storage, wipe, about.
import { useEffect, useState } from 'react';
import { detectPlatform, storageNote } from '../app/storageNote';
import type { EffortScale, Profile } from '../domain/types';
import {
  defaultProfile, exportBackupJson, exportSetsCsv, getDb, getMeta, getProfile, requestPersist, saveProfile, wipeAll,
} from '../db';
import { useLive } from '../ui/useLive';
import { ConfirmButton, Group, GroupAction, Segmented, Stepper, downloadText } from '../ui/common';
import { Button, LabelValueGrid, NavBar, Toggle, go, showHud, useHaptics, useTheme, type ThemePref } from '../ui/kit';
import { DemoBanner, useDemoMode } from '../app/DemoBanner';
import { formatDate, todayISO } from '../app/dates';
import { DEFAULT_PLATES, STANDARD_PLATES, getPlateSettings, savePlateSettings, type PlateSettings } from '../app/prefs';
import { ImportNotionPanel } from '../app/parts/ImportNotionPanel';
import { RestorePanel } from '../app/parts/RestorePanel';
import pkg from '../../../package.json';


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
    <section className="screen setup">
      <DemoBanner />
      <NavBar title="Settings" backLabel="Profile" fallback="profile" />

      <Appearance />

      {profile && (
        <Group label="Training">
          <Segmented<EffortScale> label="Effort scale" value={profile.effortScale} onChange={v => setProfile({ effortScale: v })}
            options={[{ value: 'rir', label: 'RIR' }, { value: 'rpe', label: 'RPE' }]} />
          <p className="quiet">Reps in reserve, or RPE (10 − RIR). Stored as RIR either way.</p>
        </Group>
      )}

      {plates && <Plates value={plates} />}

      <Group label="Backup">
        <LabelValueGrid items={[
          { label: 'Last export', value: lastExport ? formatDate(todayISO(lastExport)) : 'Never' },
          { label: 'Lives on', value: 'This device only' },
        ]} />
        <Button variant="primary" block iconEnd="export" onClick={async () => {
          const text = await exportBackupJson(getDb());
          downloadText(`gymbro-backup-${todayISO()}.json`, text, 'application/json');
          showHud({ text: 'Backup saved', icon: 'export' });
        }}>Export backup (JSON)</Button>
        <Button block iconEnd="export" onClick={async () => downloadText(`gymbro-sets-${todayISO()}.csv`, await exportSetsCsv(getDb()), 'text/csv')}>Export sets (CSV)</Button>
      </Group>

      <Group label="Restore from backup">
        <RestorePanel />
      </Group>

      <Group label="Import Notion CSV">
        {demo ? <p className="quiet">You’re looking at demo data. Tap “Start my log” first so the import doesn’t mix with it.</p> : <ImportNotionPanel />}
      </Group>

      <Storage />

      <Group label="Wipe all data">
        <p className="quiet">Deletes every session, set, program and setting on this device. It can’t be undone. Export a backup first if you want a copy.</p>
        <ConfirmButton danger className="block" confirmLabel="Wipe all data on this device?"
          message="Every session, set, program and setting is deleted. This can’t be undone." confirmText="Wipe everything" onConfirm={async () => {
            await wipeAll(getDb());
            go('onboarding', { replace: true });
          }}>Wipe all data…</ConfirmButton>
      </Group>

      <About />
    </section>
  );
}

function Appearance() {
  const { theme, setTheme } = useTheme();
  const { enabled, setEnabled } = useHaptics();
  return (
    <Group label="Appearance">
      <Segmented<ThemePref> label="Theme" value={theme} onChange={v => { void setTheme(v); }}
        options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} />
      <Toggle label="Haptics" hint="A short buzz on set commit and on a new best. Android only." checked={enabled} onChange={v => { void setEnabled(v); }} />
    </Group>
  );
}

function Plates({ value }: { value: PlateSettings }) {
  const save = (s: PlateSettings) => savePlateSettings(getDb(), s);
  const isDefault = value.barKg === DEFAULT_PLATES.barKg && [...value.platesKg].sort().join() === [...DEFAULT_PLATES.platesKg].sort().join();
  return (
    <Group label="Bar and plates" right={!isDefault && <GroupAction onClick={() => save({ ...DEFAULT_PLATES })}>Reset</GroupAction>}>
      <Stepper label="Bar weight" unit="kg" value={value.barKg} step={2.5} min={0} max={40} onChange={v => save({ ...value, barKg: v })} />
      <div className="field-wrap">
        <span className="label">Plates available (kg)</span>
        <div className="plate-grid" role="group" aria-label="Plates available">
          {STANDARD_PLATES.map(p => {
            const on = value.platesKg.includes(p);
            return <button key={p} type="button" aria-pressed={on} className={`plate-opt tnum${on ? ' on' : ''}`} data-press="dim"
              onClick={() => save({ ...value, platesKg: on ? value.platesKg.filter(x => x !== p) : [...value.platesKg, p] })}>{p}</button>;
          })}
        </div>
      </div>
      <p className="quiet">Used by the plate calculator. Exercise increments are set per exercise in the Program editor.</p>
    </Group>
  );
}

function Storage() {
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    const s = navigator.storage;
    if (s && typeof s.persisted === 'function') s.persisted().then(setPersisted, () => setPersisted(false));
    else setPersisted(false);
  }, []);
  const installed = (() => { try { return matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true; } catch { return false; } })();
  const note = persisted === null ? null : storageNote({ persisted, installed, platform: detectPlatform(navigator.userAgent), denied });
  return (
    <Group label="Storage">
      <LabelValueGrid columns={1} items={[{ label: 'Persistent storage', value: persisted === null ? '…' : persisted ? 'Granted' : 'Not granted' }]} />
      {note && <p className="quiet">{note.text}</p>}
      {note?.offerRequest && (
        <Button block onClick={async () => { const ok = await requestPersist(getDb()); setPersisted(ok); if (!ok) setDenied(true); }}>Ask the browser to keep my data</Button>
      )}
    </Group>
  );
}

function About() {
  return (
    <Group label="About">
      <LabelValueGrid variant="stats" items={[
        { label: 'Version:', value: pkg.version },
        { label: 'Account:', value: 'None, local-first' },
        { label: 'Network:', value: 'Never sees your data' },
        { label: 'Code:', value: 'MIT licence' },
      ]} />
      <span className="label">Data credits</span>
      <p className="quiet">Strength levels: modeled gym-goer standards. Squat, bench and deadlift anchors from Symmetric Strength self-reported gym logs, via FitnessVolt aggregates (CC BY 4.0, attribution); the anchor source’s licence has not been verified. Method: docs/STANDARDS-METHODOLOGY.md.</p>
    </Group>
  );
}
