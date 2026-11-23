// The visible credit FitnessVolt's CC BY 4.0 licence asks for on any page that
// shows its (adapted) percentiles: the level sections, the levels (i) sheet and
// Settings' data credits.
import type { GymStandardsData } from '../../benchmarks/gymStandards';
import { tn, tr } from '../../i18n';

export function DataCredit({ meta }: { meta: GymStandardsData['meta'] }) {
  return (
    <p className="tk-quiet">
      {tr('Levels adapted from {source} (CC BY 4.0).', { source: <a className="tk-link" href={meta.attributionUrl} target="_blank" rel="noopener">{tn(meta.attribution.replace(/\s*\(CC BY 4\.0\)$/, ''))}</a> })}
    </p>
  );
}
