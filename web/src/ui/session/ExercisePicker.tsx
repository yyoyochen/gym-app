// Pick an exercise for a swap or an added lift.
import { useMemo, useState } from 'react';
import type { Exercise } from '../../domain/types';
import { PixelIcon, Sheet } from '../kit';
import { t, tn } from '../../i18n';

export function ExercisePicker({ open, title, exercises, onPick, onClose }: {
  open: boolean; title: string; exercises: Exercise[]; onPick: (e: Exercise) => void; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return exercises.filter(e => !k || e.name.toLowerCase().includes(k) || tn(e.name).toLowerCase().includes(k) || e.aliases.some(a => a.toLowerCase().includes(k)));
  }, [q, exercises]);
  return (
    <Sheet open={open} title={title} onClose={onClose} initialDetent="large">
      <input className="field" placeholder={t('Search')} value={q} onChange={e => setQ(e.target.value)} aria-label={t('Search exercises')} />
      <div className="pick-list">
        {list.map(e => (
          <button key={e.id} type="button" className="pick-item" data-press="row" onClick={() => { onPick(e); setQ(''); }}>
            <span>{tn(e.name)}</span><PixelIcon name="chevron" />
          </button>
        ))}
        {!list.length && <p className="quiet">{t('No match. Add custom exercises in Profile → Program.')}</p>}
      </div>
    </Sheet>
  );
}
