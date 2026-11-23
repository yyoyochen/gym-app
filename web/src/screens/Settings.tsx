// Settings (spec §4 Profile → Settings): appearance, effort scale,
// backup / restore / import, storage, wipe, about.
import { useEffect, useState } from 'react';
import { detectPlatform, storageNote } from '../app/storageNote';
import type { EffortScale, Profile } from '../domain/types';
import {
  defaultProfile, exportBackupJson, exportSetsCsv, getDb, getMeta, getProfile, requestPersist, saveProfile, wipeAll,
} from '../db';
import { useLive } from '../ui/useLive';
import { ConfirmButton, Group, Segmented, downloadText } from '../ui/common';
import { Button, LabelValueGrid, NavBar, go, showHud, useTheme, type ThemePref } from '../ui/kit';
import { DemoBanner, useDemoMode } from '../app/DemoBanner';
import { resetTips } from '../app/tips';
import { formatDate, todayISO } from '../app/dates';
import { ImportCsvPanel } from '../app/parts/ImportCsvPanel';
import { RestorePanel } from '../app/parts/RestorePanel';
import { LanguageControl } from '../i18n/LanguageControl';
import { t, tr } from '../i18n';


export function Settings(_props: { params: string[] }) {
  const stored = useLive(db => getProfile(db).then(r => r ?? null), []);
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
      <NavBar title={t('Settings')} backLabel={t('Profile')} fallback="profile" />

      <Appearance />

      {profile && (
        <Group label={t('Training')}>
          <Segmented<EffortScale> label={t('Effort scale')} value={profile.effortScale} onChange={v => setProfile({ effortScale: v })}
            options={[{ value: 'rir', label: 'RIR' }, { value: 'rpe', label: 'RPE' }]} />
          <p className="quiet">{t('How you rate a set’s effort. RIR is reps left in the tank: 2 means two more were possible. RPE is the 1–10 scale, where RPE 8 is 2 RIR. Switch any time; past sets show in the scale you pick.')}</p>
        </Group>
      )}

      <Group label={t('Backup')}>
        <LabelValueGrid items={[
          { label: t('Last export'), value: lastExport ? formatDate(todayISO(lastExport)) : t('Never') },
          { label: t('Lives on'), value: t('This device only') },
        ]} />
        <Button variant="primary" block iconEnd="export" onClick={async () => {
          const text = await exportBackupJson(getDb());
          downloadText(`gym-app-backup-${todayISO()}.json`, text, 'application/json');
          showHud({ text: t('Backup saved'), icon: 'export' });
        }}>{t('Export backup (JSON)')}</Button>
        <Button block iconEnd="export" onClick={async () => downloadText(`gym-app-sets-${todayISO()}.csv`, await exportSetsCsv(getDb()), 'text/csv')}>{t('Export sets (CSV)')}</Button>
      </Group>

      <Group label={t('Restore from backup')}>
        <RestorePanel />
      </Group>

      <Group label={t('Import a CSV')}>
        {demo ? <p className="quiet">{t('You’re looking at demo data. Tap “Start my log” first so the import doesn’t mix with it.')}</p> : <ImportCsvPanel />}
      </Group>

      <Storage />

      <Group label={t('Wipe all data')}>
        <p className="quiet">{t('Deletes every session, set, program and setting on this device. It can’t be undone. Export a backup first if you want a copy.')}</p>
        <ConfirmButton danger className="block" confirmLabel={t('Wipe all data on this device?')}
          message={t('Every session, set, program and setting is deleted. This can’t be undone.')} confirmText={t('Wipe everything')} onConfirm={async () => {
            await wipeAll(getDb());
            go('onboarding', { replace: true });
          }}>{t('Wipe all data…')}</ConfirmButton>
      </Group>

      <About />
    </section>
  );
}

function Appearance() {
  const { theme, setTheme } = useTheme();
  return (
    <Group label={t('Appearance')}>
      <Segmented<ThemePref> label={t('Theme')} value={theme} onChange={v => { void setTheme(v); }}
        options={[{ value: 'dark', label: t('Dark') }, { value: 'light', label: t('Light') }]} />
      <LanguageControl />
      <Button block onClick={async () => { await resetTips(getDb()); showHud({ text: t('Tips will show again'), icon: 'check' }); }}>{t('Show tips again')}</Button>
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
    <Group label={t('Storage')}>
      <LabelValueGrid columns={1} items={[{ label: t('Persistent storage'), value: persisted === null ? '…' : persisted ? t('Granted') : t('Not granted') }]} />
      {note && <p className="quiet">{note.text}</p>}
      {note?.offerRequest && (
        <Button block onClick={async () => { const ok = await requestPersist(getDb()); setPersisted(ok); if (!ok) setDenied(true); }}>{t('Ask the browser to keep my data')}</Button>
      )}
    </Group>
  );
}

function About() {
  return (
    <Group label={t('About')}>
      <LabelValueGrid variant="stats" items={[
        { label: t('Version:'), value: __APP_VERSION__ },
        { label: t('Account:'), value: t('None, local-first') },
        { label: t('Network:'), value: t('Never sees your data') },
        { label: t('Code:'), value: t('MIT licence') },
      ]} />
      <span className="label">{t('Data credits')}</span>
      <p className="quiet">{tr('Strength benchmarks: modeled standards for everyday gym lifters. Squat, bench and deadlift anchors are self-reported gym percentiles from the Symmetric Strength dataset, as published by {link} (CC BY 4.0). Everything else is modeled by this app; neither site endorses these figures.', {
        link: <a className="link" href="https://fitnessvolt.com/strength-standards/" target="_blank" rel="noopener">{t('Strength Standards data by FitnessVolt')}</a>,
      })}</p>
    </Group>
  );
}
