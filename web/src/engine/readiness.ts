// Readiness check → green / amber / red, and the tired-day autoregulation
// ported from service.py (_ease_target), applied on red.
import type { Readiness } from '../domain/types';
import { easeTarget } from './port/service';
import type { LegacyTarget } from './port/types';

export type Answer = 'good' | 'ok' | 'poor';

export interface ReadinessAnswers {
  sleep: Answer;
  soreness: Answer;
  stress: Answer;
}

/** Any poor answer is red (spec: poor sleep, sick, sore); any ok is amber. */
export function readinessFromAnswers(a: ReadinessAnswers): Readiness {
  const all = [a.sleep, a.soreness, a.stress];
  if (all.includes('poor')) return 'red';
  if (all.includes('ok')) return 'amber';
  return 'green';
}

/**
 * Python had two states, "normal" and "tired". Red is tired: strength work
 * eases to ~92.5% and a hypertrophy jump is deferred. Amber changes no load;
 * it only withholds the extra-set offer in the nudge layer (offers need green).
 */
export function autoregulate(t: LegacyTarget, readiness: Readiness | undefined, repRange: [number, number], increment: number): LegacyTarget {
  return readiness === 'red' ? easeTarget(t, repRange, increment) : t;
}

export function legacyReadiness(r: Readiness | undefined): 'tired' | 'normal' {
  return r === 'red' ? 'tired' : 'normal';
}
