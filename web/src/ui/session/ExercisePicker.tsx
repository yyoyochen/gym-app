// Pick an exercise for a swap or an added lift.
import { useMemo, useState } from 'react';
import type { Exercise } from '../../domain/types';
import { Sheet } from '../common';

export function ExercisePicker({ open, title, exercises, onPick, onClose }: {
  open: boolean; title: string; exercises: Exercise[]; onPick: (e: Exercise) => void; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return exercises.filter(e => !k || e.name.toLowerCase().includes(k) || e.aliases.some(a => a.toLowerCase().includes(k)));
  }, [q, exercises]);
  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <input className="field" placeholder="Search" value={q} onChange={e => setQ(e.target.value)} aria-label="Search exercises" />
      <div className="picker-list">
        {list.map(e => (
          <button key={e.id} type="button" className="picker-item" onClick={() => { onPick(e); setQ(''); }}>{e.name}</button>
        ))}
        {!list.length && <p className="mid">No match. Add custom exercises in Profile → Program.</p>}
      </div>
    </Sheet>
  );
}
