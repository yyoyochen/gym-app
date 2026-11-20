// Plate calculator: per-side plates as text first, drawing second (spec §3.1).
import { platesPerSide, kg } from '../../app/coach';
import type { PlateSettings } from '../../app/prefs';
import { Sheet } from '../common';

export function PlateSheet({ weight, plates, onClose }: { weight: number | null; plates: PlateSettings; onClose: () => void }) {
  if (weight === null) return null;
  const load = platesPerSide(weight, plates.barKg, plates.platesKg);
  const max = Math.max(...plates.platesKg, 25);
  return (
    <Sheet open title="Plates" onClose={onClose}>
      <p className="num-lg line">{kg(weight)} kg</p>
      {load.belowBar ? (
        <p className="mid line">Lighter than the {kg(plates.barKg)} kg bar.</p>
      ) : (
        <>
          <p className="line"><span className="mid">Per side </span>
            <span className="num-md mono">{load.perSide.length ? load.perSide.map(kg).join(' + ') : 'empty bar'}</span></p>
          <p className="mid line">Bar {kg(plates.barKg)} kg{load.remainder > 0 ? ` · ${kg(load.remainder)} kg can't be made with your plates` : ''}</p>
          <div className="plate-strip" aria-hidden="true">
            <span className="bar" />
            {load.perSide.map((p, i) => {
              const h = 40 + (p / max) * 70;
              const w = p >= 10 ? 22 : p >= 5 ? 16 : 12;
              return <span key={i} className="plate" style={{ height: h, width: w }}>{kg(p)}</span>;
            })}
          </div>
        </>
      )}
      <p className="mid line">Bar and plates are set in Profile → Settings.</p>
    </Sheet>
  );
}
