// Plate calculator: per-side plates as text first, a 1-bit drawing second.
import { platesPerSide, kg } from '../../app/coach';
import type { PlateSettings } from '../../app/prefs';
import { BigNumber, LabelValueGrid, Sheet } from '../kit';

export function PlateSheet({ weight, plates, onClose }: { weight: number | null; plates: PlateSettings; onClose: () => void }) {
  if (weight === null) return null;
  const load = platesPerSide(weight, plates.barKg, plates.platesKg);
  const max = Math.max(...plates.platesKg, 25);
  return (
    <Sheet open title="Plates" onClose={onClose}>
      <BigNumber size="lg" value={kg(weight)} unit="kg" />
      {load.belowBar ? (
        <p className="quiet">Lighter than the {kg(plates.barKg)} kg bar.</p>
      ) : (
        <>
          <LabelValueGrid items={[
            { label: 'Each side', value: load.perSide.length ? load.perSide.map(kg).join(' + ') : 'Empty bar', accent: true },
            { label: 'Bar', value: `${kg(plates.barKg)} kg` },
            ...(load.remainder > 0 ? [{ label: 'Can’t be made', value: `${kg(load.remainder)} kg` }] : []),
          ]} />
          <div className="plate-strip" aria-hidden="true">
            <span className="bar" />
            {load.perSide.map((p, i) => (
              <span key={i} className="plate" style={{ height: 40 + (p / max) * 70, width: p >= 10 ? 22 : p >= 5 ? 16 : 12 }}>{kg(p)}</span>
            ))}
          </div>
        </>
      )}
      <p className="quiet">Bar and plates are set in Profile → Settings.</p>
    </Sheet>
  );
}
