// Restore from a backup file: validate → confirm → restore, plus Undo last restore.
import { useState } from 'react';
import { getDb, hasUndo, restoreBackup, undoLastRestore, validateExport, type ExportDoc } from '../../db';
import { ConfirmButton, Errors, FilePicker } from '../../ui/common';
import { useLive } from '../../ui/useLive';

export function RestorePanel({ onRestored }: { onRestored?: () => void }) {
  const [doc, setDoc] = useState<ExportDoc | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState('');
  const undo = useLive(db => hasUndo(db), []);

  return (
    <div className="stack">
      <FilePicker label="Choose backup (.json)" accept=".json,application/json" onText={text => {
        setDone(''); setDoc(null);
        let parsed: unknown;
        try { parsed = JSON.parse(text); } catch { setErrors(['Not valid JSON']); return; }
        const v = validateExport(parsed);
        setErrors(v.errors);
        if (v.ok) setDoc(parsed as ExportDoc);
      }} />
      <Errors errors={errors} />
      {doc && (
        <div className="card stack">
          <div className="label">Backup</div>
          <dl className="kv">
            <dt>Exported</dt><dd className="mono">{doc.exportedAt.slice(0, 10)}</dd>
            <dt>Sessions</dt><dd className="mono">{doc.sessions.length}</dd>
            <dt>Sets</dt><dd className="mono">{doc.sets.length}</dd>
            <dt>Programs</dt><dd className="mono">{doc.program.length}</dd>
          </dl>
          <p className="mid">Restoring replaces everything on this device. The current data is kept as an undo copy until the next restore.</p>
          <ConfirmButton danger confirmLabel="Tap again to replace all data" onConfirm={async () => {
            try {
              await restoreBackup(getDb(), doc);
              setDoc(null); setDone('Restored.');
              onRestored?.();
            } catch (e) { setErrors([e instanceof Error ? e.message : 'Restore failed']); }
          }}>Replace all my data</ConfirmButton>
        </div>
      )}
      {done && <p className="mid">{done}</p>}
      {undo && (
        <ConfirmButton confirmLabel="Tap again to undo" onConfirm={async () => {
          try { await undoLastRestore(getDb()); setDone('Last restore undone.'); }
          catch (e) { setErrors([e instanceof Error ? e.message : 'Undo failed']); }
        }}>Undo last restore</ConfirmButton>
      )}
    </div>
  );
}
