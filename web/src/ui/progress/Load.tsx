// A weight (and optionally reps) in fixed slots so the digits line up down a
// list: whole kilos in a 3 ch right-aligned slot, then, when the list has any
// fractional weight, a 2 ch slot holding the fraction small and raised, then
// "×" and reps in a 2 ch right-aligned slot. Tabular numerals.
import { cellWeight } from './cellRules';

export function Load({ weight, reps, bodyweightFactor, decimals, className = '' }: {
  weight: number; reps?: number; bodyweightFactor: number; decimals: boolean; className?: string;
}) {
  const w = cellWeight(weight, bodyweightFactor);
  const cls = `load${decimals ? ' dec' : ''}${reps === undefined ? ' solo' : ''}${className ? ` ${className}` : ''}`;
  return (
    <span className={cls}>
      <span className="w">{w.int}</span>
      {decimals && <span className="d">{w.dec}</span>}
      {reps !== undefined && <><span className="x">×</span><span className="r">{reps}</span></>}
    </span>
  );
}
