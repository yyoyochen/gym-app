import { Fragment } from 'react';
import type { EffortScale, PainFlag } from '../../domain/types';
import { formatEffort } from '../../engine';
import { readable } from '../readable';
import { LEGACY_DOT, PAIN_AREA_LABELS, SIDE_LABELS, displayName, isUnloaded } from '../../app/labels';
import { t, tn } from '../../i18n';

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

const KEYED = new RegExp(`^(\\S{1,3}?)(?: ${LEGACY_DOT} |: |：)(.+)$`);
const MINIMUM = ' (minimum)';

/** One stored name part: known names translated (tn), "(minimum)" too; a name the lifter typed stays as typed. */
function namePart(s: string): string {
  if (s.endsWith(MINIMUM)) return t('{name} (minimum)', { name: namePart(s.slice(0, -MINIMUM.length)) });
  const whole = tn(s);
  if (whole !== s) return whole;
  const m = /^(\S{1,3}): (.+)$/.exec(s);
  return m ? `${m[1]}: ${tn(m[2])}` : s;
}

/** A stored session name as shown, in the app's language: "A: Squat + Bench", "Today's workout". */
export function sessionLabel(name: string): string {
  return namePart(displayName(name));
}

/** "A: Squat + Bench" → short "Session A", title "Session A, Squat + Bench". Other names pass through. */
export function sessionNames(name: string): { short: string; title: string } {
  const m = KEYED.exec(name.trim());
  if (!m) { const shown = displayName(name); const short = shown.split(': ')[0].trim() || shown; return { short: namePart(short), title: namePart(shown) }; }
  return { short: t('Session {key}', { key: m[1] }), title: t('Session {key}, {name}', { key: m[1], name: namePart(m[2]) }) };
}

/** "kg × 2" → "kg", "reps" → "reps", "× 8" → "": the unit shown under a number in the lift strip. */
export function stripUnit(unit: string): string {
  return unit.startsWith('×') ? '' : unit.split(' ×')[0].trim();
}

/** "2 in reserve" (RIR) or "RPE 8": the effort a set is planned at, in words. */
export function effortWords(rir: number, scale: EffortScale): string {
  return scale === 'rpe' ? formatEffort(rir, scale) : t('{n} in reserve', { n: formatEffort(rir, scale).replace(' RIR', '') });
}

/** A set's load as shown: "BW" for an unloaded bodyweight lift, "—" for 0 kg on any other lift, else kg without trailing zeros. */
export function loadText(weight: number, bodyweightFactor: number): string {
  if (weight === 0) return isUnloaded(weight, bodyweightFactor) ? '—' : t('BW');
  return String(Math.round(weight * 100) / 100);
}

/** "top double", "top 5" */
export function topWord(reps: number): string {
  return reps === 1 ? t('top single') : reps === 2 ? t('top double') : reps === 3 ? t('top triple') : t('top {n}', { n: reps });
}

/** Where a pain flag is, in lower case: "left shoulder", "lower back". `withBoth: false` leaves "both" out. */
export function painWhere(p: Pick<PainFlag, 'area' | 'side'>, withBoth = true): string {
  const area = PAIN_AREA_LABELS[p.area].toLowerCase();
  const side = p.side === 'left' || p.side === 'right' || (withBoth && p.side === 'both') ? SIDE_LABELS[p.side].toLowerCase() : '';
  return side ? t('{side} {area}', { side, area }) : area;
}
