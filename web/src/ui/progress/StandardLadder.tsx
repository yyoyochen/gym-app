// Level ladder strip + confidence badge for the gym-goer standards (LUME:
// tier ramp --tier-1..5, values mono, words sans).
import { CONFIDENCE_LABEL, levelRank, type Confidence } from '../../benchmarks/gymStandards';
import type { LiftRating } from '../../benchmarks/liftRating';
import { confidenceWord, levelWord, nextText, ordinal, ratedValueText } from './standards';

// Percentile width of each band: below beginner, beginner … elite.
const BANDS = [5, 15, 30, 30, 15, 5];

export function LevelLadder({ rating, label }: { rating: Pick<LiftRating, 'level' | 'percentile'>; label: string }) {
  const rank = levelRank(rating.level);
  return (
    <div className="std-ladder" role="img" aria-label={label}>
      {BANDS.map((w, i) => (
        <i key={i} style={{ flex: `${w} 1 0`, background: i === 0 ? 'var(--border-strong)' : i <= rank ? `var(--tier-${i})` : undefined }} />
      ))}
      <span className="std-mark" style={{ left: `calc(${Math.min(99.5, Math.max(0.5, rating.percentile))}% - 1px)` }} />
    </div>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return <span className="std-conf" title={`Confidence ${confidence}: ${CONFIDENCE_LABEL[confidence]}`}>{confidence}</span>;
}

export function LevelWord({ rating }: { rating: Pick<LiftRating, 'level'> }) {
  const rank = levelRank(rating.level);
  return <span className="std-level" style={{ color: rank ? `var(--tier-${rank})` : 'var(--text-mid)' }}>{levelWord(rating)}</span>;
}

/** One lift on the standards: level, ladder, percentile and the evidence, then the next step. */
export function StandardSummary({ rating, showNext = true }: { rating: LiftRating; showNext?: boolean }) {
  const pct = ordinal(rating.percentile);
  return (
    <>
      <LevelLadder rating={rating} label={`${levelWord(rating)}, ${pct} percentile of gym-goers`} />
      <p className="line">
        <span className="num-inline">{pct}</span> percentile · <ValueText text={ratedValueText(rating)} />
      </p>
      <p className="mid line">
        <ConfidenceBadge confidence={rating.confidence} /> {confidenceWord(rating)}
        {showNext && rating.next && <> · next: <ValueText text={nextText(rating.next, rating.loadType === 'dumbbell_each')} /></>}
        {showNext && !rating.next && ' · top level'}
      </p>
    </>
  );
}

/** Numbers in mono, words in sans. */
export function ValueText({ text }: { text: string }) {
  const parts = text.split(/([+−-]?\d+(?:\.\d+)?)/g);
  return <>{parts.map((p, i) => (i % 2 ? <span key={i} className="num-inline">{p}</span> : p))}</>;
}
