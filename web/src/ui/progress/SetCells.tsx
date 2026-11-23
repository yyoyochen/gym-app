// A session's sets as equal-size cells: weight (3 digits, plus a decimal slot
// when the list has any fractional weight), ×, reps (2 digits). Every slot has
// a fixed width in ch and is right-aligned, so hundreds, tens and ones line up
// down the page. Fill = top set, outline = work set, dotted = ramp.
import type { SetEntry } from '../../domain/types';
import { cellWeight, classifySets, type CellRole } from './cellRules';
import { t } from '../../i18n';

const roleWord = (r: CellRole) => (r === 'top' ? t('top set') : r === 'work' ? t('work') : t('ramp'));

export function SetCells({ sets, bodyweightFactor, decimals }: { sets: SetEntry[]; bodyweightFactor: number; decimals: boolean }) {
  const roles = classifySets(sets, bodyweightFactor);
  return (
    <span className={decimals ? 'tk-cells dec' : 'tk-cells'}>
      {sets.map((s, i) => {
        const w = cellWeight(s.weight, bodyweightFactor);
        const load = `${w.int}${w.dec} × ${s.reps}`;
        const text = s.failed ? t('{load}, failed', { load }) : load;
        return (
          <span key={s.id ?? i} className={`tk-cell ${roles[i]}${s.failed ? ' failed' : ''}`} aria-label={t('{text}, {role}', { text, role: roleWord(roles[i]) })}>
            <span className="w">{w.int}</span>
            {decimals && <span className="d">{w.dec}</span>}
            <span className="x">×</span>
            <span className="r">{s.reps}</span>
          </span>
        );
      })}
    </span>
  );
}

/** The key under the list: what fill, outline and dotted mean. */
export function SetCellsKey() {
  return (
    <>
      <span className="tk-key top">{t('Top set')}</span>
      <span className="tk-key work">{t('Work set')}</span>
      <span className="tk-key ramp">{t('Ramp')}</span>
    </>
  );
}
