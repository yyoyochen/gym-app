// Readiness check (spec §3.4): three taps before commit. It changes the
// targets BEFORE they are committed, so the promise includes it.
import type { Readiness as R } from '../../domain/types';
import type { Answer, ReadinessAnswers } from '../../engine';
import { Segmented } from '../kit';

const OPTS: { value: Answer; label: string }[] = [{ value: 'good', label: 'Good' }, { value: 'ok', label: 'OK' }, { value: 'poor', label: 'Poor' }];
const ROWS: { key: keyof ReadinessAnswers; label: string }[] = [
  { key: 'sleep', label: 'Sleep' }, { key: 'soreness', label: 'Soreness' }, { key: 'stress', label: 'Stress' },
];
const NOTE: Record<R, string> = {
  green: 'Targets as planned.',
  amber: 'Loads unchanged; no extra-set offers today.',
  red: 'Effort floor +1 RIR, jumps deferred, heavy loads eased.',
};

export function ReadinessCheck({ answers, onChange, readiness }: {
  answers: Partial<ReadinessAnswers>; onChange: (a: Partial<ReadinessAnswers>) => void; readiness: R;
}) {
  const answered = Object.keys(answers).length;
  return (
    <section className="ready" aria-label="Readiness check">
      <div className="spread">
        <span className="label">Readiness</span>
        <span className={`ready-mark ${readiness}`}>{readiness}</span>
      </div>
      {ROWS.map(r => (
        <Segmented key={r.key} label={r.label} options={OPTS} value={answers[r.key]} onChange={v => onChange({ ...answers, [r.key]: v })} />
      ))}
      <p className="quiet">{NOTE[readiness]}{answered < 3 ? ' Unanswered counts as good.' : ''}</p>
    </section>
  );
}
