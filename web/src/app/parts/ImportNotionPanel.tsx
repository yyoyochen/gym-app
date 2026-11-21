// Notion CSV import with an optional alias file. Used by Onboarding and Settings.
import { useState } from 'react';
import { getDb } from '../../db';
import { importNotionCsv, readAliasFile, type AliasMap, type NotionImportResult } from '../../import/notion';
import { FilePicker } from '../../ui/common';
import { LabelValueGrid, type LabelValueItem } from '../../ui/kit';
import { formatDate } from '../dates';

export function ImportNotionPanel({ onDone }: { onDone?: (r: NotionImportResult) => void }) {
  const [aliases, setAliases] = useState<AliasMap | null>(null);
  const [aliasError, setAliasError] = useState('');
  const [result, setResult] = useState<NotionImportResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="form-group">
      <p className="quiet">A Notion export with columns Date, Session, Exercise, Order, Set, Reps, Weight (kg), Notes. Re-importing the same file adds nothing.</p>
      <FilePicker label="Alias file · optional .json" accept=".json,application/json" onText={text => {
        try { const a = readAliasFile(JSON.parse(text)); setAliases(a); setAliasError(''); }
        catch (e) { setAliases(null); setAliasError(e instanceof Error ? e.message : 'Could not read the alias file'); }
      }} />
      {aliases && <span className="spec-line"><b>{Object.keys(aliases).length}</b> name aliases loaded</span>}
      {aliasError && <span className="field-error" role="alert">{aliasError}</span>}
      <FilePicker label={busy ? 'Importing…' : 'Choose Notion CSV'} accept=".csv,text/csv" onText={async text => {
        setBusy(true); setError(''); setResult(null);
        try {
          const r = await importNotionCsv(getDb(), text, { aliases: aliases ?? {} });
          setResult(r);
          onDone?.(r);
        } catch (e) { setError(e instanceof Error ? e.message : 'Import failed'); }
        finally { setBusy(false); }
      }} />
      {error && <span className="field-error" role="alert">{error}</span>}
      {result && <ImportResult r={result} />}
    </div>
  );
}

export function ImportResult({ r }: { r: NotionImportResult }) {
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
      <LabelValueGrid items={items} />
      {r.blankWeight > 0 && <p className="quiet"><span className="tnum">{r.blankWeight}</span> sets had no weight and were stored as 0 kg (bodyweight or unrecorded). They are marked “blank weight” in History.</p>}
      {r.blankReps > 0 && <p className="quiet"><span className="tnum">{r.blankReps}</span> sets had no reps and were stored as 0.</p>}
      {r.conflicts.length > 0 && <p className="quiet"><span className="tnum">{r.conflicts.length}</span> sessions already exist with different rows and were left alone: {r.conflicts.slice(0, 3).map(c => `${c.date} ${c.label}`).join(', ')}{r.conflicts.length > 3 ? '…' : ''}</p>}
      {r.exercisesCreated.length > 0 && <p className="quiet">New exercises: {r.exercisesCreated.slice(0, 8).join(', ')}{r.exercisesCreated.length > 8 ? '…' : ''}</p>}
      {r.skipped.length > 0 && <p className="quiet"><span className="tnum">{r.skipped.length}</span> rows skipped, e.g. line <span className="tnum">{r.skipped[0].line}</span>: {r.skipped[0].reason}</p>}
    </div>
  );
}
