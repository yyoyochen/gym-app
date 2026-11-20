// TargetCard (DESIGN §6): eyebrow, criterion, the visible why, effort floor,
// last time. The ghost tick says the promise is not judged yet.
import type { ReactNode } from 'react';
import { readable } from '../readable';
import type { SlotPlan } from '../../app/coach';
import { MonoNums } from './text';

export function TargetCard({ sp, children }: { sp: SlotPlan; children?: ReactNode }) {
  const t = sp.target;
  return (
    <article className="card tick tick-ghost target-card">
      <div className="spread">
        <span className="label">Target · {t.exerciseName}</span>
        {sp.inMinimum && <span className="ghost micro">min</span>}
      </div>
      <p className="criterion"><MonoNums text={t.criterion} /></p>
      <p className="mid">Why: {readable(t.why)}</p>
      <div className="meta">
        <span className="mid">Effort floor <span className="num-inline">{sp.floorLabel}</span></span>
        {sp.lastTime && <span className="mono micro ghost">{sp.lastTime}</span>}
      </div>
      {sp.lastNote && <p className="mid">Last note: {sp.lastNote}</p>}
      {sp.pain?.painCheck && <p className="slate">Pain check first: how does it feel warming up? {sp.pain.reasons[0]}</p>}
      {children}
    </article>
  );
}
