// Restore from a backup file: validate → confirm → restore, plus Undo last restore.
import { useState } from 'react';
import { getDb, hasUndo, restoreBackup, undoLastRestore, validateExport, type ExportDoc } from '../../db';
import { ConfirmButton, Errors, FilePicker } from '../../ui/common';
import { LabelValueGrid, showHud } from '../../ui/kit';
import { useLive } from '../../ui/useLive';

export function RestorePanel({ onRestored }: { onRestored?: () => void }) {
  const [doc, setDoc] = useState<ExportDoc | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const undo = useLive(db => hasUndo(db), []);

  return (
    <div className="form-group">
      <FilePicker label="Choose backup (.json)" accept=".json,application/json" onText={text => {
        setDoc(null);
        let parsed: unknown;
        try { parsed = JSON.parse(text); } catch { setErrors(['Not valid JSON']); return; }
        const v = validateExport(parsed);
        setErrors(v.errors);
        if (v.ok) setDoc(parsed as ExportDoc);
      }} />
      <Errors errors={errors} />
      {doc && (
        <div className="form-group">
          <LabelValueGrid items={[
            { label: 'Exported', value: doc.exportedAt.slice(0, 10) }, { label: 'Sessions', value: doc.sessions.length },
            { label: 'Sets', value: doc.sets.length }, { label: 'Programs', value: doc.program.length },
          ]} />
          <p className="quiet">Restoring replaces everything on this device. The current data is kept as an undo copy until the next restore.</p>
          <ConfirmButton danger className="block" confirmLabel="Replace all data on this device with this backup?"
            message="Your current data is kept as an undo copy until the next restore." confirmText="Replace all my data" onConfirm={async () => {
              try {
                await restoreBackup(getDb(), doc);
                setDoc(null);
                showHud({ text: 'Restored', icon: 'import' });
                onRestored?.();
              } catch (e) { setErrors([e instanceof Error ? e.message : 'Restore failed']); }
            }}>Replace all my data</ConfirmButton>
        </div>
      )}
      {undo && (
        <ConfirmButton className="block" confirmLabel="Undo the last restore and bring back the data from before it?" confirmText="Undo last restore" onConfirm={async () => {
          try { await undoLastRestore(getDb()); showHud({ text: 'Restore undone', icon: 'back' }); }
          catch (e) { setErrors([e instanceof Error ? e.message : 'Undo failed']); }
        }}>Undo last restore</ConfirmButton>
      )}
    </div>
  );
}
