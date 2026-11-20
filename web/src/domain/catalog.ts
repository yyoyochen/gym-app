// Default exercise catalog and a keyword matcher for names it doesn't know.
// Generic gym names only — personal alias maps live outside src (testdata/private).
import type { Exercise, PainArea, SlotType, BenchmarkKey } from './types';

/** URL/id-safe slug of an exercise name: "Back Squat" → "back-squat". */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'exercise';
}

/** Loose comparison key for names: case/punctuation-insensitive ("Pull-ups" ≡ "pullups"). */
export function nameKey(name: string): string {
  return name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
}

/** Stable exercise id for a canonical name. */
export function exerciseIdFor(name: string): string {
  return slugify(name);
}

type Def = {
  name: string;
  aliases?: string[];
  muscles: string[];
  areas: PainArea[];
  slot: SlotType;
  increment?: number;
  bw?: number;
  bench?: BenchmarkKey;
};

const LOWER = 5;
const UPPER = 2.5;
const SMALL = 1;

const KNEE_HIP_BACK: PainArea[] = ['knee', 'hip', 'lower_back'];
const HINGE: PainArea[] = ['lower_back', 'hip'];
const PRESS: PainArea[] = ['shoulder', 'elbow', 'wrist'];
const PULL: PainArea[] = ['shoulder', 'elbow', 'upper_back'];
const OLY: PainArea[] = ['knee', 'hip', 'lower_back', 'wrist', 'shoulder'];

const DEFS: Def[] = [
  // --- squat pattern
  { name: 'Back Squat', aliases: ['Squat', 'Barbell Squat', 'BB Squat'], muscles: ['quads', 'glutes', 'adductors'], areas: KNEE_HIP_BACK, slot: 'compound', increment: LOWER, bench: 'squat' },
  { name: 'Front Squat', muscles: ['quads', 'glutes', 'upper_back'], areas: [...KNEE_HIP_BACK, 'wrist'], slot: 'compound', increment: LOWER },
  { name: 'Safety Bar Squat', aliases: ['SSB Squat'], muscles: ['quads', 'glutes'], areas: KNEE_HIP_BACK, slot: 'compound', increment: LOWER },
  { name: 'Hack Squat', muscles: ['quads', 'glutes'], areas: ['knee', 'hip'], slot: 'compound', increment: LOWER },
  { name: 'Leg Press', muscles: ['quads', 'glutes'], areas: ['knee', 'hip'], slot: 'compound', increment: LOWER },
  { name: 'Bulgarian Split Squat', aliases: ['Rear-Foot-Elevated Split Squat', 'RFESS'], muscles: ['quads', 'glutes'], areas: ['knee', 'hip'], slot: 'compound', increment: UPPER },
  { name: 'DB Lunge', aliases: ['Dumbbell Lunge', 'Lunge'], muscles: ['quads', 'glutes'], areas: ['knee', 'hip'], slot: 'compound', increment: UPPER },
  { name: 'Goblet Squat', muscles: ['quads', 'glutes'], areas: ['knee', 'hip'], slot: 'compound', increment: UPPER },
  // --- hinge
  { name: 'Conventional Deadlift', aliases: ['Deadlift', 'Barbell Deadlift', 'DL'], muscles: ['hamstrings', 'glutes', 'spinal_erectors', 'upper_back'], areas: ['lower_back', 'hip', 'knee'], slot: 'compound', increment: LOWER, bench: 'deadlift' },
  { name: 'Sumo Deadlift', muscles: ['glutes', 'adductors', 'hamstrings'], areas: ['lower_back', 'hip', 'knee'], slot: 'compound', increment: LOWER },
  { name: 'Trap Bar Deadlift', aliases: ['Hex Bar Deadlift'], muscles: ['quads', 'glutes', 'hamstrings'], areas: ['lower_back', 'hip', 'knee'], slot: 'compound', increment: LOWER },
  { name: 'Romanian Deadlift', aliases: ['RDL'], muscles: ['hamstrings', 'glutes'], areas: HINGE, slot: 'compound', increment: LOWER },
  { name: 'Hip Thrust', aliases: ['Barbell Hip Thrust'], muscles: ['glutes'], areas: ['hip', 'lower_back'], slot: 'compound', increment: LOWER },
  { name: 'Good Morning', muscles: ['hamstrings', 'spinal_erectors'], areas: HINGE, slot: 'compound', increment: UPPER },
  { name: 'Leg Curl', aliases: ['Hamstring Curl', 'Lying Leg Curl', 'Seated Leg Curl'], muscles: ['hamstrings'], areas: ['knee'], slot: 'isolation', increment: SMALL },
  { name: 'Leg Extension', muscles: ['quads'], areas: ['knee'], slot: 'isolation', increment: SMALL },
  { name: 'Nordic Hamstring Curl', aliases: ['Nordic Curl'], muscles: ['hamstrings'], areas: ['knee'], slot: 'isolation', increment: SMALL },
  { name: 'Calf Raise', aliases: ['Standing Calf Raise', 'Seated Calf Raise'], muscles: ['calves'], areas: ['ankle'], slot: 'isolation', increment: SMALL },
  // --- horizontal press
  { name: 'Barbell Bench Press', aliases: ['Bench Press', 'Bench', 'Flat Bench Press', 'BB Bench Press'], muscles: ['chest', 'front_delts', 'triceps'], areas: PRESS, slot: 'compound', increment: UPPER, bench: 'bench' },
  { name: 'Close-Grip Bench Press', aliases: ['CGBP', 'Close Grip Bench'], muscles: ['triceps', 'chest'], areas: PRESS, slot: 'compound', increment: UPPER },
  { name: 'Incline Barbell Bench Press', aliases: ['Incline Bench Press'], muscles: ['chest', 'front_delts', 'triceps'], areas: PRESS, slot: 'compound', increment: UPPER },
  { name: 'DB Bench Press', aliases: ['Dumbbell Bench Press'], muscles: ['chest', 'front_delts', 'triceps'], areas: PRESS, slot: 'compound', increment: UPPER },
  { name: 'Incline DB Bench Press', aliases: ['Incline Dumbbell Bench Press', 'Incline DB Press'], muscles: ['chest', 'front_delts', 'triceps'], areas: PRESS, slot: 'compound', increment: UPPER },
  { name: 'Dips', aliases: ['Dip', 'Parallel Bar Dip'], muscles: ['chest', 'triceps', 'front_delts'], areas: PRESS, slot: 'compound', increment: UPPER, bw: 0.95 },
  { name: 'Push-Up', aliases: ['Push Up', 'Pushup', 'Push-ups'], muscles: ['chest', 'triceps'], areas: PRESS, slot: 'compound', increment: UPPER, bw: 0.7 },
  { name: 'Pec Fly Machine', aliases: ['Machine Fly', 'Pec Deck'], muscles: ['chest'], areas: ['shoulder'], slot: 'isolation', increment: SMALL },
  { name: 'Cable Fly', aliases: ['Cable Crossover'], muscles: ['chest'], areas: ['shoulder'], slot: 'isolation', increment: SMALL },
  // --- vertical press
  { name: 'Overhead Press', aliases: ['OHP', 'Barbell Overhead Press', 'Military Press', 'Standing Press'], muscles: ['front_delts', 'triceps', 'upper_chest'], areas: PRESS, slot: 'compound', increment: UPPER },
  { name: 'Seated DB Shoulder Press', aliases: ['DB Shoulder Press', 'Dumbbell Shoulder Press'], muscles: ['front_delts', 'triceps'], areas: PRESS, slot: 'compound', increment: UPPER },
  { name: 'Push Press', muscles: ['front_delts', 'triceps', 'quads'], areas: [...PRESS, 'knee'], slot: 'compound', increment: UPPER },
  { name: 'Landmine Press', aliases: ['Landmine Shoulder Press'], muscles: ['front_delts', 'chest'], areas: PRESS, slot: 'compound', increment: UPPER },
  // --- rows & pulls
  { name: 'Barbell Row', aliases: ['Bent-Over Row', 'BB Row'], muscles: ['lats', 'upper_back', 'rear_delts', 'biceps'], areas: [...PULL, 'lower_back'], slot: 'compound', increment: UPPER },
  { name: 'Pendlay Row', muscles: ['upper_back', 'lats'], areas: [...PULL, 'lower_back'], slot: 'compound', increment: UPPER },
  { name: 'T-Bar Row', muscles: ['upper_back', 'lats'], areas: [...PULL, 'lower_back'], slot: 'compound', increment: UPPER },
  { name: 'Chest Supported Row', aliases: ['Chest-Supported Row'], muscles: ['upper_back', 'lats'], areas: PULL, slot: 'compound', increment: UPPER },
  { name: 'Cable Row', aliases: ['Seated Cable Row', 'Seated Row'], muscles: ['lats', 'upper_back', 'biceps'], areas: PULL, slot: 'compound', increment: UPPER },
  { name: 'Single-Arm DB Row', aliases: ['One-Arm DB Row', 'Dumbbell Row', 'DB Row'], muscles: ['lats', 'upper_back'], areas: PULL, slot: 'compound', increment: UPPER },
  { name: 'Lat Pulldown', aliases: ['Lat Pull-Down', 'Pulldown'], muscles: ['lats', 'biceps'], areas: PULL, slot: 'compound', increment: UPPER },
  { name: 'Pull-Up', aliases: ['Pull-ups', 'Pull Up', 'Pullup', 'Pull Ups'], muscles: ['lats', 'biceps', 'upper_back'], areas: PULL, slot: 'compound', increment: UPPER, bw: 0.95 },
  { name: 'Chin-Up', aliases: ['Chin-ups', 'Chin Up', 'Chinup'], muscles: ['lats', 'biceps'], areas: PULL, slot: 'compound', increment: UPPER, bw: 0.95 },
  { name: 'Inverted Row', muscles: ['upper_back', 'lats'], areas: PULL, slot: 'compound', increment: UPPER },
  { name: 'Face Pull', aliases: ['Cable Face Pull', 'Band Face Pull'], muscles: ['rear_delts', 'upper_back'], areas: ['shoulder'], slot: 'isolation', increment: SMALL },
  { name: 'Barbell Shrug', aliases: ['Shrug'], muscles: ['traps'], areas: ['neck', 'upper_back'], slot: 'isolation', increment: UPPER },
  // --- delts & arms
  { name: 'DB Lateral Raise', aliases: ['Lateral Raise', 'Dumbbell Lateral Raise', 'Side Raise'], muscles: ['side_delts'], areas: ['shoulder'], slot: 'isolation', increment: SMALL },
  { name: 'Cable Lateral Raise', muscles: ['side_delts'], areas: ['shoulder'], slot: 'isolation', increment: SMALL },
  { name: 'Rear Delt Fly', aliases: ['Reverse Fly', 'Reverse Pec Deck'], muscles: ['rear_delts'], areas: ['shoulder'], slot: 'isolation', increment: SMALL },
  { name: 'Barbell Curl', aliases: ['BB Curl', 'EZ Bar Curl'], muscles: ['biceps'], areas: ['elbow', 'wrist'], slot: 'isolation', increment: UPPER },
  { name: 'DB Curl', aliases: ['Dumbbell Curl', 'Bicep Curl'], muscles: ['biceps'], areas: ['elbow', 'wrist'], slot: 'isolation', increment: SMALL },
  { name: 'Hammer Curl', muscles: ['biceps', 'forearms'], areas: ['elbow', 'wrist'], slot: 'isolation', increment: SMALL },
  { name: 'Preacher Curl', muscles: ['biceps'], areas: ['elbow', 'wrist'], slot: 'isolation', increment: SMALL },
  { name: 'Cable Tricep Pushdown', aliases: ['Tricep Pushdown', 'Triceps Pushdown', 'Cable Pushdown'], muscles: ['triceps'], areas: ['elbow'], slot: 'isolation', increment: SMALL },
  { name: 'Skull Crusher', aliases: ['Lying Tricep Extension', 'EZ Bar Skull Crusher'], muscles: ['triceps'], areas: ['elbow'], slot: 'isolation', increment: UPPER },
  { name: 'Overhead Tricep Extension', aliases: ['Overhead Triceps Extension'], muscles: ['triceps'], areas: ['elbow', 'shoulder'], slot: 'isolation', increment: SMALL },
  // --- trunk & carries
  { name: 'Hanging Knee Raise', aliases: ['Hanging Leg Raise'], muscles: ['abs', 'hip_flexors'], areas: ['lower_back'], slot: 'isolation', increment: SMALL },
  { name: 'Plank', muscles: ['abs'], areas: ['lower_back'], slot: 'isolation', increment: SMALL },
  { name: 'Ab Wheel', aliases: ['Ab Rollout'], muscles: ['abs'], areas: ['lower_back', 'shoulder'], slot: 'isolation', increment: SMALL },
  { name: 'Farmers Walk', aliases: ["Farmer's Walk", 'Farmer Carry'], muscles: ['forearms', 'traps', 'core'], areas: ['wrist', 'upper_back', 'lower_back'], slot: 'compound', increment: UPPER },
  // --- olympic
  { name: 'Power Clean', muscles: ['quads', 'glutes', 'traps', 'upper_back'], areas: OLY, slot: 'compound', increment: UPPER },
  { name: 'Hang Clean', muscles: ['glutes', 'traps', 'upper_back'], areas: OLY, slot: 'compound', increment: UPPER },
  { name: 'Clean', aliases: ['Squat Clean'], muscles: ['quads', 'glutes', 'traps'], areas: OLY, slot: 'compound', increment: UPPER },
  { name: 'Clean & Jerk', aliases: ['Clean and Jerk'], muscles: ['quads', 'glutes', 'front_delts', 'traps'], areas: OLY, slot: 'compound', increment: UPPER },
  { name: 'Power Snatch', muscles: ['glutes', 'traps', 'front_delts'], areas: OLY, slot: 'compound', increment: UPPER },
  { name: 'Squat Snatch', aliases: ['Snatch'], muscles: ['quads', 'glutes', 'traps', 'front_delts'], areas: OLY, slot: 'compound', increment: UPPER },
];

function toExercise(d: Def): Exercise {
  return {
    id: exerciseIdFor(d.name),
    name: d.name,
    aliases: d.aliases ?? [],
    muscles: d.muscles,
    areasLoaded: d.areas,
    slotType: d.slot,
    increment: d.increment ?? (d.slot === 'isolation' ? SMALL : UPPER),
    bodyweightFactor: d.bw ?? 0,
    benchmarkKey: d.bench ?? null,
  };
}

/** The built-in catalog. Fresh copies each call so callers can mutate safely. */
export function defaultCatalog(): Exercise[] {
  return DEFS.map(toExercise);
}

/** Well-known ids used by templates. */
export const EX = {
  squat: 'back-squat',
  frontSquat: 'front-squat',
  bench: 'barbell-bench-press',
  deadlift: 'conventional-deadlift',
  ohp: 'overhead-press',
} as const;

/** Find a catalog entry by name or alias (case/punctuation-insensitive). */
export function findInCatalog(name: string, catalog: Exercise[] = defaultCatalog()): Exercise | undefined {
  const k = nameKey(name);
  return catalog.find(e => nameKey(e.name) === k || e.aliases.some(a => nameKey(a) === k));
}

// ---------------------------------------------------------------- keyword matcher

interface Rule { re: RegExp; slot?: SlotType; areas?: PainArea[]; muscles?: string[]; lower?: boolean; bw?: number }

// Order matters: the first rule that matches a field wins for that field.
const RULES: Rule[] = [
  { re: /\b(pull[- ]?ups?|chin[- ]?ups?)\b/, slot: 'compound', areas: PULL, muscles: ['lats', 'biceps'], bw: 0.95 },
  { re: /\bdips?\b/, slot: 'compound', areas: PRESS, muscles: ['chest', 'triceps'], bw: 0.95 },
  { re: /\bpush[- ]?ups?\b/, slot: 'compound', areas: PRESS, muscles: ['chest', 'triceps'], bw: 0.7 },
  { re: /\b(curl|raise|fly|flye|extension|pushdown|pulldown tricep|tricep|triceps|kickback|crusher|shrug|face pull|pec deck)\b/, slot: 'isolation' },
  { re: /\b(plank|hold|crunch|sit[- ]?up|knee raise|leg raise|rotation|bird dog|superman|copenhagen)\b/, slot: 'isolation', areas: ['lower_back'], muscles: ['abs'] },
  { re: /\b(deadlift|rdl|good morning|hip thrust|glute bridge|swing)\b/, slot: 'compound', areas: HINGE, muscles: ['hamstrings', 'glutes'], lower: true },
  { re: /\b(snatch|clean|jerk|high pull)\b/, slot: 'compound', areas: OLY, muscles: ['quads', 'glutes', 'traps'] },
  { re: /\b(squat|lunge|split|leg press|step[- ]?up)\b/, slot: 'compound', areas: ['knee', 'hip'], muscles: ['quads', 'glutes'], lower: true },
  { re: /\b(jump|bound|hop)\b/, slot: 'compound', areas: ['knee', 'ankle'], muscles: ['quads', 'calves'], lower: true },
  { re: /\bcalf\b/, slot: 'isolation', areas: ['ankle'], muscles: ['calves'], lower: true },
  { re: /\b(hamstring|nordic|leg curl)\b/, slot: 'isolation', areas: ['knee'], muscles: ['hamstrings'], lower: true },
  { re: /\b(lateral|delt)\b/, areas: ['shoulder'], muscles: ['side_delts'] },
  { re: /\bcurl\b/, areas: ['elbow', 'wrist'], muscles: ['biceps'] },
  { re: /\b(tricep|triceps|crusher|pushdown)\b/, areas: ['elbow'], muscles: ['triceps'] },
  { re: /\b(bench|press|push)\b/, slot: 'compound', areas: PRESS, muscles: ['chest', 'front_delts', 'triceps'] },
  { re: /\b(row|pulldown|pull[- ]?down|pull)\b/, slot: 'compound', areas: PULL, muscles: ['lats', 'upper_back'] },
  { re: /\b(carry|walk)\b/, slot: 'compound', areas: ['wrist', 'upper_back'], muscles: ['forearms', 'traps'] },
];

const SMALL_KIT = /\b(db|dumbbell|cable|machine|band|kb|kettlebell)\b/;

/**
 * Defaults for an exercise the catalog doesn't know, by keyword. Never throws:
 * an unrecognised name becomes an upper-body compound with no loaded areas.
 */
export function guessExercise(name: string): Exercise {
  const known = findInCatalog(name);
  if (known) return known;
  const n = name.toLowerCase().replace(/[()/+]/g, ' ');
  const pick = <K extends keyof Rule>(k: K): Rule[K] | undefined => RULES.find(r => r.re.test(n) && r[k] !== undefined)?.[k];
  const slot = pick('slot') ?? 'compound';
  const lower = RULES.some(r => r.lower && r.re.test(n));
  const increment = slot === 'isolation'
    ? (/\b(barbell|bb|ez)\b/.test(n) && !SMALL_KIT.test(n) ? UPPER : SMALL)
    : lower ? LOWER : UPPER;
  return {
    id: exerciseIdFor(name),
    name,
    aliases: [],
    muscles: pick('muscles') ?? [],
    areasLoaded: pick('areas') ?? [],
    slotType: slot,
    increment,
    bodyweightFactor: pick('bw') ?? 0,
    benchmarkKey: null,
  };
}
