// Gym-goer standards for the UI: loading the precached table, the lifter
// context from Profile, and the plain-language strings (docs/STANDARDS-METHODOLOGY.md).
import { useEffect, useState } from 'react';
import type { Profile } from '../../domain/types';
import { LEVEL_LABEL, confidenceLabel, levelLabel, type GymStandardsData } from '../../benchmarks/gymStandards';
import { t } from '../../i18n';
import type { LiftRating, NextStep, RateContext } from '../../benchmarks/liftRating';

/** Plain number, at most 2 decimals (same as app/coach kg()). */
const kg = (n: number) => String(Math.round(n * 100) / 100);

let cache: Promise<GymStandardsData | null> | null = null;

type Tables = NonNullable<GymStandardsData['tables']>;
const isTables = (x: unknown): x is Tables =>
  !!x && typeof x === 'object' && Object.values(x).every(v =>
    !!v && Array.isArray((v as Tables[string]).bw) && Array.isArray((v as Tables[string]).male)
    && (v as Tables[string]).bw.length === (v as Tables[string]).male.length);

/** Adds a private threshold-table file's tables to the standards, or returns them unchanged. */
export function attachTables(data: GymStandardsData, file: unknown): GymStandardsData {
  const tables = (file as { tables?: unknown } | null | undefined)?.tables;
  return isTables(tables) && Object.keys(tables).length ? { ...data, tables } : data;
}

export function loadGymStandards(): Promise<GymStandardsData | null> {
  cache ??= (async () => {
    try {
      const r = await fetch('./standards/gym-standards.json');
      if (!r.ok) throw new Error(String(r.status));
      let data = (await r.json()) as GymStandardsData;
      // Preview builds only: a local, never-committed table (Strength Level)
      // rates first. Production builds drop this branch entirely.
      if (import.meta.env.MODE === 'preview') {
        try {
          const p = await fetch('./__private__/strength-level.json');
          if (p.ok) data = attachTables(data, await p.json());
        } catch { /* no private table: the model alone */ }
      }
      return data;
    } catch {
      cache = null;
      return null;
    }
  })();
  return cache;
}

/** undefined while loading, null if the table could not be loaded. */
export function useGymStandards(): GymStandardsData | null | undefined {
  const [d, setD] = useState<GymStandardsData | null | undefined>(undefined);
  useEffect(() => { let alive = true; loadGymStandards().then(v => alive && setD(v)); return () => { alive = false; }; }, []);
  return d;
}

export interface StandardsInput { profile?: Profile; bodyweightKg?: number; year: number }

/** What Profile is missing before levels can be shown (sex and bodyweight; age is optional). */
export function missingForStandards(inp: StandardsInput): string[] {
  const miss: string[] = [];
  if (!inp.profile?.sex) miss.push('sex');
  if (inp.bodyweightKg === undefined) miss.push('bodyweight');
  return miss;
}

/** The missing fields as words for a sentence: "sex and bodyweight". */
export function missingText(miss: string[]): string {
  const sex = miss.includes('sex'), bw = miss.includes('bodyweight');
  return sex && bw ? t('sex and bodyweight') : sex ? t('sex') : t('bodyweight');
}

export function standardsContext(inp: StandardsInput): RateContext | null {
  if (missingForStandards(inp).length) return null;
  const by = inp.profile!.birthYear;
  return { sex: inp.profile!.sex === 'F' ? 'female' : 'male', bodyweightKg: inp.bodyweightKg!, ...(by ? { age: inp.year - by } : {}) };
}

export function ordinal(n: number): string {
  const r = Math.round(n);
  if (r % 100 >= 11 && r % 100 <= 13) return t('{n}th', { n: r });
  return r % 10 === 1 ? t('{n}st', { n: r }) : r % 10 === 2 ? t('{n}nd', { n: r }) : r % 10 === 3 ? t('{n}rd', { n: r }) : t('{n}th', { n: r });
}

export const levelWord = (r: Pick<LiftRating, 'level'>) => levelLabel(r.level);
export const confidenceWord = (r: Pick<LiftRating, 'confidence'> & Partial<Pick<LiftRating, 'source'>>) =>
  r.source === 'table' ? t('Strength Level table') : confidenceLabel(r.confidence);

/** Subtitle for a set of ratings: Strength Level when any of them came from its table. */
export const sourceMeta = (ratings: Pick<LiftRating, 'source'>[]) =>
  ratings.some(r => r.source === 'table') ? t('vs Strength Level') : t('vs lifters like you');

const half = (x: number) => kg(Math.round(x * 2) / 2);

/** The evidence that was rated: "e1RM 120 kg", "+20 kg added e1RM", "12 reps · best set, not a max test". */
export function ratedValueText(r: LiftRating): string {
  switch (r.basis) {
    case 'e1rm': return r.loadType === 'dumbbell_each' ? t('e1RM {kg} kg per dumbbell', { kg: half(r.value) }) : t('e1RM {kg} kg', { kg: half(r.value) });
    case 'weighted': return t('+{kg} kg added e1RM', { kg: half(r.addedKg ?? 0) });
    case 'reps': return t('{n} reps, best set, not a max test', { n: kg(r.value) });
    case 'seconds': return t('{n} s, best set (reps read as seconds)', { n: kg(r.value) });
  }
}

/** "Advanced at 130 kg e1RM" / "Advanced at +35 kg added" / "Advanced at 16 reps". */
export function nextText(n: NextStep, perDumbbell = false): string {
  const v = { level: levelLabel(n.level), kg: kg(n.value), n: kg(n.value) };
  if (n.unit === 'kg') {
    if (n.added) return t('{level} at +{kg} kg added', v);
    return perDumbbell ? t('{level} at {kg} kg per dumbbell e1RM', v) : t('{level} at {kg} kg e1RM', v);
  }
  return n.unit === 'reps' ? t('{level} at {n} reps', v) : t('{level} at {n} s', v);
}

/** "Intermediate, 54th percentile of lifters like you". */
export function standingText(r: LiftRating): string {
  return t('{level}, {nth} percentile of lifters like you', { level: levelWord(r), nth: ordinal(r.percentile) });
}

export function contextText(ctx: RateContext): string {
  const v = { sex: ctx.sex === 'female' ? t('female') : t('male'), kg: kg(ctx.bodyweightKg), age: ctx.age ?? '' };
  return ctx.age !== undefined ? t('{sex}, {kg} kg, age {age}', v) : t('{sex}, {kg} kg, no birth year (20–29 table)', v);
}

/** What the levels compare you with (the levels (i) sheet). */
export const standardsCaveat = (): string =>
  t('Compared with everyday gym lifters of your sex, age and bodyweight (modeled from self-reported numbers), not competitors. Beginner ≈ 5th, Novice ≈ 20th, Intermediate ≈ 50th, Advanced ≈ 80th, Elite ≈ 95th percentile. Self-reported numbers run generous, and B/C lifts are ratio estimates from the squat, bench and deadlift anchors.');

const rnd = (x: number) => (x >= 10 ? Math.round(x * 2) / 2 : Math.round(x * 4) / 4); // the model's rounding

/** Every level for this lifter: "Beginner 59.5 · Novice 74 · … kg e1RM", "+0 · +8 … kg added", "1 · 5 … reps". */
export function levelTableText(r: LiftRating, bodyweightKg: number): string {
  const { unit, values } = r.levels;
  const fmt = (v: number) => (unit === 'kg' ? kg(rnd(v)) : unit === 'bw_fraction' ? `+${kg(rnd(v * bodyweightKg))}` : kg(v));
  const parts = (Object.keys(LEVEL_LABEL) as (keyof typeof LEVEL_LABEL)[])
    .filter(k => k !== 'below beginner')
    .map(k => `${levelLabel(k)} ${fmt(values[k as Exclude<typeof k, 'below beginner'>])}`);
  const levels = parts.join(t(', '));
  if (unit === 'kg') return r.loadType === 'dumbbell_each' ? t('{levels} kg e1RM per dumbbell', { levels }) : t('{levels} kg e1RM', { levels });
  return unit === 'bw_fraction' ? t('{levels} kg added (1RM)', { levels }) : unit === 'reps' ? t('{levels} reps', { levels }) : t('{levels} s', { levels });
}
