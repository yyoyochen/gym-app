// Readiness check (spec §3.4): three taps before commit. It changes the
// targets BEFORE they are committed, so the promise includes it.
import type { Readiness as R } from '../../domain/types';
import type { Answer, ReadinessAnswers } from '../../engine';

const OPTS: { value: Answer; label: string }[] = [{ value: 'good', label: 'Good' }, { value: 'ok', label: 'OK' }, { value: 'poor', label: 'Poor' }];
const ROWS: { key: keyof ReadinessAnswers; label: string }[] = [
  { key: 'sleep', label: 'Sleep' }, { key: 'soreness', label: 'Soreness' }, { key: 'stress', label: 'Stress' },
];
const NOTE: Record<R, string> = {
  green: 'Green — targets as planned.',
  amber: 'Amber — loads unchanged; no extra-set offers today.',
  red: 'Red — effort floor +1 RIR, jumps deferred, heavy loads eased.',
};

export function ReadinessCheck({ answers, onChange, readiness }: {
  answers: Partial<ReadinessAnswers>; onChange: (a: Partial<ReadinessAnswers>) => void; readiness: R;
}) {
  const answered = Object.keys(answers).length;
  return (
    <section className="card stack readiness" aria-label="Readiness check">
      <div className="spread">
        <span className="label">Readiness</span>
        <span className={`ready-chip ${readiness}`}>{readiness}</span>
      </div>
      {ROWS.map(r => (
        <div key={r.key} className="readiness-row">
          <span className="mid">{r.label}</span>
          <div className="seg" role="radiogroup" aria-label={r.label}>
            {OPTS.map(o => (
              <button key={o.value} type="button" role="radio" aria-checked={answers[r.key] === o.value}
                className={`seg-opt${answers[r.key] === o.value ? ' on' : ''}`} onClick={() => onChange({ ...answers, [r.key]: o.value })}>{o.label}</button>
            ))}
          </div>
        </div>
      ))}
      <p className="mid line">{answered < 3 ? `${NOTE[readiness]} Unanswered counts as good.` : NOTE[readiness]}</p>
    </section>
  );
}
