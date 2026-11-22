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

type Result = NotionImportResult & { format: CsvFormat };
const READ_AS: Record<CsvFormat, string> = { gymbro: 'Read as the GymBro template', hevy: 'Read as a Hevy export', strong: 'Read as a Strong export' };

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
    } catch (e) { setError(e instanceof Error ? e.message : 'Import failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="form-group">
      <p className="quiet">A GymBro template, or an export from Hevy or Strong. Re-importing the same file adds nothing.</p>
      <Button block icon="export" onClick={() => downloadText('gymbro-template.csv', CSV_TEMPLATE, 'text/csv')}>Download the template</Button>
      <FilePicker label={busy ? 'Importing…' : 'Choose a CSV'} accept=".csv,text/csv" onText={async text => {
        setError(''); setResult(null);
        if (needsUnit(text)) { setPending(text); return; }
        await run(text);
      }} />
      {pending && (
        <div className="stack" role="group" aria-label="Weight unit">
          <p className="quiet">This Strong export doesn’t say whether its weights are kilograms or pounds. Which did you log in?</p>
          <Segmented<WeightUnit> label="Weights in" value={unit} onChange={setUnit} options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]} />
          <Button variant="primary" block disabled={busy} onClick={() => run(pending, unit)}>{busy ? 'Importing…' : `Import in ${unit}`}</Button>
        </div>
      )}
      <FilePicker label="Name aliases (optional, .json)" accept=".json,application/json" onText={text => {
        try { const a = readAliasFile(JSON.parse(text)); setAliases(a); setAliasError(''); }
        catch (e) { setAliases(null); setAliasError(e instanceof Error ? e.message : 'Could not read the alias file'); }
      }} />
      {aliases && <span className="spec-line"><b>{Object.keys(aliases).length}</b> name aliases loaded</span>}
      {aliasError && <span className="field-error" role="alert">{aliasError}</span>}
      {error && <span className="field-error" role="alert">{error}</span>}
      {result && <ImportResult r={result} />}
    </div>
  );
}

export function ImportResult({ r }: { r: Result }) {
  const items: LabelValueItem[] = [
    { label: 'Sessions added', value: r.sessionsAdded, accent: true },
    { label: 'Sets added', value: r.setsAdded },
    { label: 'Rows read', value: r.rowsRead },
  ];
  if (r.sessionsUnchanged > 0) items.push({ label: 'Already imported', value: r.sessionsUnchanged });
  if (r.exercisesCreated.length > 0) items.push({ label: 'New exercises', value: r.exercisesCreated.length });
  if (r.firstDate && r.lastDate) items.push({ label: 'Dates', value: `${formatDate(r.firstDate, { weekday: false, year: r.firstDate.slice(0, 4) !== r.lastDate.slice(0, 4) })} – ${formatDate(r.lastDate, { weekday: false })}` });
  return (
    <div className="import-result" role="status">
      <span className="label">Imported</span>
      <p className="quiet">{READ_AS[r.format]}.</p>
      <LabelValueGrid items={items} />
      {r.blankWeight > 0 && <p className="quiet"><span className="tnum">{r.blankWeight}</span> sets had no weight and were stored as 0 kg (bodyweight or unrecorded). They are marked “blank weight” in the Calendar.</p>}
      {r.blankReps > 0 && <p className="quiet"><span className="tnum">{r.blankReps}</span> sets had no reps and were stored as 0.</p>}
      {r.conflicts.length > 0 && <p className="quiet"><span className="tnum">{r.conflicts.length}</span> sessions already exist with different rows and were left alone: {r.conflicts.slice(0, 3).map(c => `${c.date} ${c.label}`).join(', ')}{r.conflicts.length > 3 ? '…' : ''}</p>}
      {r.exercisesCreated.length > 0 && <p className="quiet">New exercises: {r.exercisesCreated.slice(0, 8).join(', ')}{r.exercisesCreated.length > 8 ? '…' : ''}</p>}
      {r.skipped.length > 0 && <p className="quiet"><span className="tnum">{r.skipped.length}</span> {r.skipped.length === 1 ? 'row' : 'rows'} skipped, e.g. line <span className="tnum">{r.skipped[0].line}</span>: {r.skipped[0].reason}</p>}
    </div>
  );
}
