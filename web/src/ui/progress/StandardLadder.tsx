// Gym-goer standards in the Ink & Dither idiom: the level is a glyph dither bar
// (percentile of gym-goers), the level word is mono caps, the confidence is a
// small outlined letter. No tier colours: one accent only.
import { CONFIDENCE_LABEL, type Confidence } from '../../benchmarks/gymStandards';
import type { LiftRating } from '../../benchmarks/liftRating';
import { DitherBar } from '../kit';
import { confidenceWord, levelWord, nextText, ordinal, ratedValueText } from './standards';

/** "Intermediate · 55th" — the bar's value text. */
export function levelValueText(r: Pick<LiftRating, 'level' | 'percentile'>): string {
  return `${levelWord(r)}, ${ordinal(r.percentile)}`;
}

/** One lift's level as a dither bar: label left, "Intermediate · 55th" right, percentile as the fill. */
export function LevelBar({ rating, label, cells }: { rating: Pick<LiftRating, 'level' | 'percentile'>; label: string; cells?: number }) {
  return (
    <DitherBar value={rating.percentile / 100} cells={cells} label={label} valueText={levelValueText(rating)}
      ariaLabel={`${label}: ${levelWord(rating)}, ${ordinal(rating.percentile)} percentile of lifters like you`} />
  );
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return <span className="std-conf" title={`Confidence ${confidence}: ${CONFIDENCE_LABEL[confidence]}`}>{confidence}</span>;
}

export function LevelWord({ rating }: { rating: Pick<LiftRating, 'level'> }) {
  return <span className="std-level">{levelWord(rating)}</span>;
}

/** One lift on the standards: the bar, the evidence, confidence and the next step. */
export function StandardSummary({ rating, label, showNext = true }: { rating: LiftRating; label: string; showNext?: boolean }) {
  return (
    <div className="std-sum">
      <LevelBar rating={rating} label={label} />
      <p className="std-ev"><ValueText text={ratedValueText(rating)} /></p>
      <p className="std-ev mid">
        {rating.source === 'model' && <><ConfidenceBadge confidence={rating.confidence} /> </>}{confidenceWord(rating)}
      </p>
      {showNext && (
        <p className="std-next">
          {rating.next ? <>Next: <ValueText text={nextText(rating.next, rating.loadType === 'dumbbell_each')} /></> : 'Top level'}
        </p>
      )}
    </div>
  );
}

/** Numbers in mono, words in sans. */
export function ValueText({ text }: { text: string }) {
  // Numbers stand alone ("118.5 kg"), never inside a word ("e1RM").
  const parts = text.split(/((?<![\p{L}\d.])[+−-]?\d+(?:\.\d+)?(?![\p{L}\d]))/gu);
  return <>{parts.map((p, i) => (i % 2 ? <b key={i} className="tk-num">{p}</b> : p))}</>;
}
