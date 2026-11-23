// Import a CSV: the GymBro template, a Hevy export or a Strong export (told apart
// by the header; import/formats.ts). Used by Onboarding and Settings.
import { useState } from 'react';
import { getDb } from '../../db';
import { importCsv, needsUnit, readAliasFile, type AliasMap, type NotionImportResult } from '../../import/notion';
import type { CsvFormat, WeightUnit } from '../../import/formats';
import { FilePicker, Segmented, downloadText } from '../../ui/common';
import { Button, LabelValueGrid, type LabelValueItem } from '../../ui/kit';
import { formatDate } from '../dates';
import { CSV_TEMPLATE } from '../csvTemplate';
import { t, te, tn, tr } from '../../i18n';

type Result = NotionImportResult & { format: CsvFormat };
const readAs = (f: CsvFormat): string =>
  f === 'hevy' ? t('Read as a Hevy export.') : f === 'strong' ? t('Read as a Strong export.') : t('Read as the app template.');

export function ImportCsvPanel({ onDone }: { onDone?: (r: Result) => void }) {
  const [aliases, setAliases] = useState<AliasMap | null>(null);
  const [aliasError, setAliasError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [unit, setUnit] = useState<WeightUnit>('kg');

  const run = async (text: string, u?: WeightUnit) => {
    setBusy(true); setError(''); setResult(null);
    try {
      const r = await importCsv(getDb(), text, { aliases: aliases ?? {}, ...(u ? { unit: u } : {}) });
      setPending(null);
      setResult(r);
      onDone?.(r);
    } catch (e) { setError(e instanceof Error ? te(e.message) : t('Import failed')); }
    finally { setBusy(false); }
  };

  return (
    <div className="form-group">
      <p className="quiet">{t('The app’s own template, or an export from Hevy or Strong. Re-importing the same file adds nothing.')}</p>
      <Button block icon="export" onClick={() => downloadText('gym-app-template.csv', CSV_TEMPLATE, 'text/csv')}>{t('Download the template')}</Button>
      <FilePicker label={busy ? t('Importing…') : t('Choose a CSV')} accept=".csv,text/csv" onText={async text => {
        setError(''); setResult(null);
        if (needsUnit(text)) { setPending(text); return; }
        await run(text);
      }} />
      {pending && (
        <div className="stack" role="group" aria-label={t('Weight unit')}>
          <p className="quiet">{t('This Strong export doesn’t say whether its weights are kilograms or pounds. Which did you log in?')}</p>
          <Segmented<WeightUnit> label={t('Weights in')} value={unit} onChange={setUnit} options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]} />
          <Button variant="primary" block disabled={busy} onClick={() => run(pending, unit)}>{busy ? t('Importing…') : t('Import in {unit}', { unit })}</Button>
        </div>
      )}
      <FilePicker label={t('Name aliases (optional, .json)')} accept=".json,application/json" onText={text => {
        try { const a = readAliasFile(JSON.parse(text)); setAliases(a); setAliasError(''); }
        catch (e) { setAliases(null); setAliasError(e instanceof Error ? te(e.message) : t('Could not read the alias file')); }
      }} />
      {aliases && <span className="spec-line">{tr('{n} name aliases loaded', { n: <b>{Object.keys(aliases).length}</b> })}</span>}
      {aliasError && <span className="field-error" role="alert">{aliasError}</span>}
      {error && <span className="field-error" role="alert">{error}</span>}
      {result && <ImportResult r={result} />}
    </div>
  );
}

export function ImportResult({ r }: { r: Result }) {
  const items: LabelValueItem[] = [
    { label: t('Sessions added'), value: r.sessionsAdded, accent: true },
    { label: t('Sets added'), value: r.setsAdded },
    { label: t('Rows read'), value: r.rowsRead },
  ];
  if (r.sessionsUnchanged > 0) items.push({ label: t('Already imported'), value: r.sessionsUnchanged });
  if (r.exercisesCreated.length > 0) items.push({ label: t('New exercises'), value: r.exercisesCreated.length });
  if (r.firstDate && r.lastDate) items.push({ label: t('Dates'), value: `${formatDate(r.firstDate, { weekday: false, year: r.firstDate.slice(0, 4) !== r.lastDate.slice(0, 4) })} – ${formatDate(r.lastDate, { weekday: false })}` });
  return (
    <div className="import-result" role="status">
      <span className="label">{t('Imported')}</span>
      <p className="quiet">{readAs(r.format)}</p>
      <LabelValueGrid items={items} />
      {r.blankWeight > 0 && <p className="quiet">{tr('{n} sets had no weight and were stored as 0 kg (bodyweight or unrecorded). They are marked “blank weight” in the Calendar.', { n: <span className="tnum">{r.blankWeight}</span> })}</p>}
      {r.blankReps > 0 && <p className="quiet">{tr('{n} sets had no reps and were stored as 0.', { n: <span className="tnum">{r.blankReps}</span> })}</p>}
      {r.conflicts.length > 0 && <p className="quiet">{tr('{n} sessions already exist with different rows and were left alone: {list}', { n: <span className="tnum">{r.conflicts.length}</span>, list: `${r.conflicts.slice(0, 3).map(c => `${c.date} ${c.label}`).join(', ')}${r.conflicts.length > 3 ? '…' : ''}` })}</p>}
      {r.exercisesCreated.length > 0 && <p className="quiet">{t('New exercises: {list}', { list: `${r.exercisesCreated.slice(0, 8).map(tn).join(', ')}${r.exercisesCreated.length > 8 ? '…' : ''}` })}</p>}
      {r.skipped.length > 0 && <p className="quiet">{r.skipped.length === 1
        ? tr('{n} row skipped, e.g. line {line}: {reason}', { n: <span className="tnum">{r.skipped.length}</span>, line: <span className="tnum">{r.skipped[0].line}</span>, reason: te(r.skipped[0].reason) })
        : tr('{n} rows skipped, e.g. line {line}: {reason}', { n: <span className="tnum">{r.skipped.length}</span>, line: <span className="tnum">{r.skipped[0].line}</span>, reason: te(r.skipped[0].reason) })}</p>}
    </div>
  );
}
