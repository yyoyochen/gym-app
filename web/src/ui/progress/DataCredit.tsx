// The visible credit FitnessVolt's CC BY 4.0 licence asks for on any page that
// shows its (adapted) percentiles: the level sections, the levels (i) sheet and
// Settings' data credits.
import type { GymStandardsData } from '../../benchmarks/gymStandards';

export function DataCredit({ meta }: { meta: GymStandardsData['meta'] }) {
  return (
    <p className="tk-quiet">
      Levels adapted from <a className="tk-link" href={meta.attributionUrl} target="_blank" rel="noopener">{meta.attribution.replace(/\s*\(CC BY 4\.0\)$/, '')}</a> (CC BY 4.0).
    </p>
  );
}
