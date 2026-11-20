// Effort display without depending on src/engine. Stored effort is always RIR.
import type { EffortScale } from '../domain/types';

const g = (n: number) => String(Math.round(n * 10) / 10);

export function formatRir(rir: number | undefined, scale: EffortScale): string {
  if (rir === undefined || rir === null || Number.isNaN(rir)) return '';
  return scale === 'rpe' ? `RPE ${g(10 - rir)}` : `${g(rir)} RIR`;
}

/** Value shown in an effort stepper for a stored RIR. */
export function rirToScale(rir: number, scale: EffortScale): number {
  return scale === 'rpe' ? 10 - rir : rir;
}

export function scaleToRir(v: number, scale: EffortScale): number {
  return scale === 'rpe' ? 10 - v : v;
}
