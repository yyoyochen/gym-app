// Notion CSV import with an optional alias file. Used by Onboarding and Settings.
import { useState } from 'react';
import { getDb } from '../../db';
import { importNotionCsv, readAliasFile, type AliasMap, type NotionImportResult } from '../../import/notion';
import { FilePicker } from '../../ui/common';
import { formatDate } from '../dates';

export function ImportNotionPanel({ onDone }: { onDone?: (r: NotionImportResult) => void }) {
  const [aliases, setAliases] = useState<AliasMap | null>(null);
  const [aliasError, setAliasError] = useState('');
  const [result, setResult] = useState<NotionImportResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="stack">
      <p className="mid">Notion export with columns Date, Session, Exercise, Order, Set, Reps, Weight (kg), Notes. Re-importing the same file adds nothing.</p>
      <FilePicker label="Alias file (optional, .json)" accept=".json,application/json" onText={text => {
        try { const a = readAliasFile(JSON.parse(text)); setAliases(a); setAliasError(''); }
        catch (e) { setAliases(null); setAliasError(e instanceof Error ? e.message : 'Could not read the alias file'); }
      }} />
      {aliases && <span className="mid"><span className="mono">{Object.keys(aliases).length}</span> name aliases loaded</span>}
      {aliasError && <span className="field-error">{aliasError}</span>}
      <FilePicker label={busy ? 'Importing…' : 'Choose Notion CSV'} className="primary" accept=".csv,text/csv" onText={async text => {
        setBusy(true); setError(''); setResult(null);
        try {
          const r = await importNotionCsv(getDb(), text, { aliases: aliases ?? {} });
          setResult(r);
          onDone?.(r);
        } catch (e) { setError(e instanceof Error ? e.message : 'Import failed'); }
        finally { setBusy(false); }
      }} />
      {error && <div className="banner field-error">{error}</div>}
      {result && <ImportResult r={result} />}
    </div>
  );
}

export function ImportResult({ r }: { r: NotionImportResult }) {
  return (
    <div className="card tick tick-hit">
      <div className="label">Imported</div>
      <dl className="kv">
        <dt>Rows read</dt><dd className="mono">{r.rowsRead}</dd>
        <dt>Sessions added</dt><dd className="mono">{r.sessionsAdded}</dd>
        <dt>Sets added</dt><dd className="mono">{r.setsAdded}</dd>
        {r.sessionsUnchanged > 0 && <><dt>Already imported</dt><dd className="mono">{r.sessionsUnchanged}</dd></>}
        {r.exercisesCreated.length > 0 && <><dt>New exercises</dt><dd className="mono">{r.exercisesCreated.length}</dd></>}
        {r.firstDate && r.lastDate && <><dt>Dates</dt><dd className="mono">{formatDate(r.firstDate, { weekday: false })} – {formatDate(r.lastDate, { weekday: false })}</dd></>}
      </dl>
      {r.blankWeight > 0 && <p className="mid"><span className="mono">{r.blankWeight}</span> sets had no weight and were stored as 0 kg (bodyweight or unrecorded). They are marked “blank weight” in History.</p>}
      {r.blankReps > 0 && <p className="mid"><span className="mono">{r.blankReps}</span> sets had no reps and were stored as 0.</p>}
      {r.conflicts.length > 0 && <p className="mid"><span className="mono">{r.conflicts.length}</span> sessions already exist with different rows and were left alone: {r.conflicts.slice(0, 3).map(c => `${c.date} ${c.label}`).join(', ')}{r.conflicts.length > 3 ? '…' : ''}</p>}
      {r.exercisesCreated.length > 0 && <p className="mid">New exercises: {r.exercisesCreated.slice(0, 8).join(', ')}{r.exercisesCreated.length > 8 ? '…' : ''}</p>}
      {r.skipped.length > 0 && <p className="mid"><span className="mono">{r.skipped.length}</span> rows skipped, e.g. line <span className="mono">{r.skipped[0].line}</span>: {r.skipped[0].reason}</p>}
    </div>
  );
}
