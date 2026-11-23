// Restore from a backup file: validate → confirm → restore, plus Undo last restore.
import { useState } from 'react';
import { getDb, hasUndo, restoreBackup, undoLastRestore, validateExport, type ExportDoc } from '../../db';
import { suppressTipsIfReturning } from '../tips';
import { ConfirmButton, Errors, FilePicker } from '../../ui/common';
import { LabelValueGrid, showHud } from '../../ui/kit';
import { useLive } from '../../ui/useLive';
import { t, te } from '../../i18n';
import { syncLangFromDb } from '../../i18n/lang';

export function RestorePanel({ onRestored }: { onRestored?: () => void }) {
  const [doc, setDoc] = useState<ExportDoc | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const undo = useLive(db => hasUndo(db), []);

  return (
    <div className="form-group">
      <FilePicker label={t('Choose backup (.json)')} accept=".json,application/json" onText={text => {
        setDoc(null);
        let parsed: unknown;
        try { parsed = JSON.parse(text); } catch { setErrors([t('Not valid JSON')]); return; }
        const v = validateExport(parsed);
        setErrors(v.errors);
        if (v.ok) setDoc(parsed as ExportDoc);
      }} />
      <Errors errors={errors.map(te)} />
      {doc && (
        <div className="form-group">
          <LabelValueGrid items={[
            { label: t('Exported'), value: doc.exportedAt.slice(0, 10) }, { label: t('Sessions'), value: doc.sessions.length },
            { label: t('Sets'), value: doc.sets.length }, { label: t('Programs'), value: doc.program.length },
          ]} />
          <p className="quiet">{t('Restoring replaces everything on this device. The current data is kept as an undo copy until the next restore.')}</p>
          <ConfirmButton danger className="block" confirmLabel={t('Replace all data on this device with this backup?')}
            message={t('Your current data is kept as an undo copy until the next restore.')} confirmText={t('Replace all my data')} onConfirm={async () => {
              try {
                await restoreBackup(getDb(), doc);
                await syncLangFromDb();
                await suppressTipsIfReturning(getDb());
                setDoc(null);
                showHud({ text: t('Restored'), icon: 'import' });
                onRestored?.();
              } catch (e) { setErrors([e instanceof Error ? te(e.message) : t('Restore failed')]); }
            }}>{t('Replace all my data')}</ConfirmButton>
        </div>
      )}
      {undo && (
        <ConfirmButton className="block" confirmLabel={t('Undo the last restore and bring back the data from before it?')} confirmText={t('Undo last restore')} onConfirm={async () => {
          try { await undoLastRestore(getDb()); await syncLangFromDb(); showHud({ text: t('Restore undone'), icon: 'back' }); }
          catch (e) { setErrors([e instanceof Error ? te(e.message) : t('Undo failed')]); }
        }}>{t('Undo last restore')}</ConfirmButton>
      )}
    </div>
  );
}
