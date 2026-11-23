// Readiness check (spec §3.4): three taps before commit. It changes the
// targets BEFORE they are committed, so the promise includes it.
import type { Readiness as R } from '../../domain/types';
import type { Answer, ReadinessAnswers } from '../../engine';
import { Segmented } from '../kit';
import { t } from '../../i18n';

const labels = (key: keyof ReadinessAnswers): string[] => (key === 'sleep' ? [t('Good'), t('OK'), t('Poor')] : [t('Low'), t('Some'), t('High')]);
const VALUES: Answer[] = ['good', 'ok', 'poor'];
/** Sleep reads Good / OK / Poor; soreness and stress read Low / Some / High. Stored answers stay good / ok / poor, best first. */
export function readinessOptions(key: keyof ReadinessAnswers): { value: Answer; label: string }[] {
  const l = labels(key);
  return VALUES.map((value, i) => ({ value, label: l[i] }));
}
const rows = (): { key: keyof ReadinessAnswers; label: string }[] => [
  { key: 'sleep', label: t('Sleep') }, { key: 'soreness', label: t('Soreness') }, { key: 'stress', label: t('Stress') },
];
const note = (r: R): string => (r === 'green' ? t('Targets as planned.') : r === 'amber' ? t('Loads unchanged; no extra-set offers today.') : t('Effort floor +1 RIR, jumps deferred, heavy loads eased.'));

/** The readiness mark in words: green / amber / red. */
export function readinessWord(r: R): string {
  return r === 'green' ? t('green') : r === 'amber' ? t('amber') : t('red');
}

export function ReadinessCheck({ answers, onChange, readiness }: {
  answers: Partial<ReadinessAnswers>; onChange: (a: Partial<ReadinessAnswers>) => void; readiness: R;
}) {
  const answered = Object.keys(answers).length;
  return (
    <section className="ready" aria-label={t('Readiness check')}>
      <div className="spread">
        <span className="label">{t('Readiness')}</span>
        <span className={`ready-mark ${readiness}`}>{readinessWord(readiness)}</span>
      </div>
      {rows().map(r => (
        <Segmented key={r.key} label={r.label} options={readinessOptions(r.key)} value={answers[r.key]} onChange={v => onChange({ ...answers, [r.key]: v })} />
      ))}
      <p className="quiet">{answered < 3 ? t('{note} Unanswered counts as good.', { note: note(readiness) }) : note(readiness)}</p>
    </section>
  );
}
