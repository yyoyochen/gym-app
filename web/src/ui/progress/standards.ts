// Gym-goer standards for the UI: loading the precached table, the lifter
// context from Profile, and the plain-language strings (docs/STANDARDS-METHODOLOGY.md).
import { useEffect, useState } from 'react';
import type { Profile } from '../../domain/types';
import { CONFIDENCE_LABEL, LEVEL_LABEL, type GymStandardsData } from '../../benchmarks/gymStandards';
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

export function standardsContext(inp: StandardsInput): RateContext | null {
  if (missingForStandards(inp).length) return null;
  const by = inp.profile!.birthYear;
  return { sex: inp.profile!.sex === 'F' ? 'female' : 'male', bodyweightKg: inp.bodyweightKg!, ...(by ? { age: inp.year - by } : {}) };
}

export function ordinal(n: number): string {
  const r = Math.round(n);
  const suf = r % 100 >= 11 && r % 100 <= 13 ? 'th' : r % 10 === 1 ? 'st' : r % 10 === 2 ? 'nd' : r % 10 === 3 ? 'rd' : 'th';
  return `${r}${suf}`;
}

export const levelWord = (r: Pick<LiftRating, 'level'>) => LEVEL_LABEL[r.level];
export const confidenceWord = (r: Pick<LiftRating, 'confidence'> & Partial<Pick<LiftRating, 'source'>>) =>
  r.source === 'table' ? 'Strength Level table' : CONFIDENCE_LABEL[r.confidence];

/** Subtitle for a set of ratings: Strength Level when any of them came from its table. */
export const sourceMeta = (ratings: Pick<LiftRating, 'source'>[]) =>
  ratings.some(r => r.source === 'table') ? 'vs Strength Level' : 'vs gym-goers';

const half = (x: number) => kg(Math.round(x * 2) / 2);

/** The evidence that was rated: "e1RM 120 kg", "+20 kg added e1RM", "12 reps · best set, not a max test". */
export function ratedValueText(r: LiftRating): string {
  switch (r.basis) {
    case 'e1rm': return `e1RM ${half(r.value)} kg${r.loadType === 'dumbbell_each' ? ' per dumbbell' : ''}`;
    case 'weighted': return `+${half(r.addedKg ?? 0)} kg added e1RM`;
    case 'reps': return `${kg(r.value)} reps, best set, not a max test`;
    case 'seconds': return `${kg(r.value)} s, best set (reps read as seconds)`;
  }
}

/** "Advanced at 130 kg e1RM" / "Advanced at +35 kg added" / "Advanced at 16 reps". */
export function nextText(n: NextStep, perDumbbell = false): string {
  const lvl = LEVEL_LABEL[n.level];
  if (n.unit === 'kg') return n.added ? `${lvl} at +${kg(n.value)} kg added` : `${lvl} at ${kg(n.value)} kg${perDumbbell ? ' per dumbbell' : ''} e1RM`;
  return `${lvl} at ${kg(n.value)} ${n.unit === 'reps' ? 'reps' : 's'}`;
}

/** "Intermediate · 54th percentile of gym-goers". */
export function standingText(r: LiftRating): string {
  return `${levelWord(r)}, ${ordinal(r.percentile)} percentile of gym-goers`;
}

export function contextText(ctx: RateContext): string {
  return `${ctx.sex}, ${kg(ctx.bodyweightKg)} kg${ctx.age !== undefined ? `, age ${ctx.age}` : ', no birth year (20–29 table)'}`;
}

export const STANDARDS_CAVEAT =
  'Compared with modeled self-reported gym-goers, not competitors. Beginner ≈ 5th, Novice ≈ 20th, Intermediate ≈ 50th, Advanced ≈ 80th, Elite ≈ 95th percentile. ' +
  'Self-reported numbers run generous, and B/C lifts are ratio estimates from the squat, bench and deadlift anchors.';

const rnd = (x: number) => (x >= 10 ? Math.round(x * 2) / 2 : Math.round(x * 4) / 4); // the model's rounding

/** Every level for this lifter: "Beginner 59.5 · Novice 74 · … kg e1RM", "+0 · +8 … kg added", "1 · 5 … reps". */
export function levelTableText(r: LiftRating, bodyweightKg: number): string {
  const { unit, values } = r.levels;
  const fmt = (v: number) => (unit === 'kg' ? kg(rnd(v)) : unit === 'bw_fraction' ? `+${kg(rnd(v * bodyweightKg))}` : kg(v));
  const parts = (Object.keys(LEVEL_LABEL) as (keyof typeof LEVEL_LABEL)[])
    .filter(k => k !== 'below beginner')
    .map(k => `${LEVEL_LABEL[k]} ${fmt(values[k as Exclude<typeof k, 'below beginner'>])}`);
  const tail = unit === 'kg' ? `kg e1RM${r.loadType === 'dumbbell_each' ? ' per dumbbell' : ''}` : unit === 'bw_fraction' ? 'kg added (1RM)' : unit === 'reps' ? 'reps' : 's';
  return `${parts.join(', ')} ${tail}`;
}
