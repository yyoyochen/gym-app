import { Fragment } from 'react';
import type { EffortScale } from '../../domain/types';
import { formatEffort } from '../../engine';
import { readable } from '../readable';
import { LEGACY_DOT, displayName, isUnloaded } from '../../app/labels';

export { displayName };

const NUM = /(\d+(?:\.\d+)?(?:\s?kg)?(?:\s?[×x]\s?\d+\+?)?)/g;

/**
 * A criterion or reason, word for word (readable() is the one display clean-up
 * every screen shares), with the numbers set a weight heavier so they read
 * first. Today, the logger and Review all render the promise through this.
 */
export function MonoNums({ text }: { text: string }) {
  const parts = readable(text).split(NUM);
  return (
    <>
      {parts.map((p, i) => (i % 2 ? <b key={i} className="num-inline">{p}</b> : <Fragment key={i}>{p}</Fragment>))}
    </>
  );
}

const KEYED = new RegExp(`^(\\S{1,3})(?: ${LEGACY_DOT} |: )(.+)$`);

/** "A: Squat + Bench" → short "Session A", title "Session A, Squat + Bench". Other names pass through. */
export function sessionNames(name: string): { short: string; title: string } {
  const m = KEYED.exec(name.trim());
  if (!m) { const shown = displayName(name); const short = shown.split(': ')[0].trim() || shown; return { short, title: shown }; }
  return { short: `Session ${m[1]}`, title: `Session ${m[1]}, ${m[2]}` };
}

/** "kg × 2" → "kg", "reps" → "reps", "× 8" → "": the unit shown under a number in the lift strip. */
export function stripUnit(unit: string): string {
  return unit.startsWith('×') ? '' : unit.split(' ×')[0].trim();
}

/** "2 in reserve" (RIR) or "RPE 8": the effort a set is planned at, in words. */
export function effortWords(rir: number, scale: EffortScale): string {
  return scale === 'rpe' ? formatEffort(rir, scale) : `${formatEffort(rir, scale).replace(' RIR', '')} in reserve`;
}

/** A set's load as shown: "BW" for an unloaded bodyweight lift, "—" for 0 kg on any other lift, else kg without trailing zeros. */
export function loadText(weight: number, bodyweightFactor: number): string {
  if (weight === 0) return isUnloaded(weight, bodyweightFactor) ? '—' : 'BW';
  return String(Math.round(weight * 100) / 100);
}

const REP_WORD: Record<number, string> = { 1: 'single', 2: 'double', 3: 'triple' };
/** "top double", "top 5" */
export function topWord(reps: number): string { return `top ${REP_WORD[reps] ?? reps}`; }
