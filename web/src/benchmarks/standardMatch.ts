// Exercise name → gym-goer standard id (gym-standards.json). Used for
// imported and custom exercises; catalog entries carry `standardId` directly
// (domain/catalog.ts) and agree with this matcher.
//
// Deliberately conservative: a generic name that covers lifts with different
// standards ("Leg Curl": seated or lying; "Calf Raise": standing or seated;
// "Overhead Tricep Extension": cable or dumbbell) gets no standard rather than
// a guess. Unmatched → undefined ("no standard").
import type { Exercise } from '../domain/types';

// Whole-token rewrites applied after lower-casing and splitting on punctuation.
const TOKEN: Record<string, string> = {
  db: 'dumbbell', dumbbells: 'dumbbell', bb: 'barbell', kb: 'kettlebell', kettlebells: 'kettlebell',
  ohp: 'overhead press', rdl: 'romanian deadlift', rdls: 'romanian deadlift', sldl: 'stiff leg deadlift',
  cgbp: 'close grip bench press', rfess: 'rear foot elevated split squat', ssb: 'safety bar', hspu: 'handstand push up',
  pullup: 'pull up', pullups: 'pull up', chinup: 'chin up', chinups: 'chin up', pushup: 'push up', pushups: 'push up',
  situp: 'sit up', situps: 'sit up', muscleup: 'muscle up', muscleups: 'muscle up', ups: 'up',
  pulldown: 'pulldown', pulldowns: 'pulldown', tbar: 't bar', skullcrushers: 'skullcrusher', crushers: 'crusher',
  triceps: 'tricep', biceps: 'bicep', farmer: 'farmers', farmers: 'farmers', flye: 'fly', flyes: 'fly', flies: 'fly',
  presses: 'press', press: 'press', dips: 'dip', rows: 'row', curls: 'curl', raises: 'raise', squats: 'squat',
  lunges: 'lunge', deadlifts: 'deadlift', shrugs: 'shrug', thrusts: 'thrust', extensions: 'extension', pulls: 'pull',
  swings: 'swing', snatches: 'snatch', cleans: 'clean', bridges: 'bridge', pushdowns: 'pushdown', thrusters: 'thruster',
  paused: 'pause', '1': 'one', single: 'one', arm: 'arm', sec: 'seconds', secs: 'seconds', s: '',
};

// Words that never change which standard applies.
const FILLER = new Set(['the', 'with', 'standard', 'regular', 'strict', 'full', 'rom']);

/** Lower-case, de-punctuate, expand abbreviations, singularise: "DB Bench Presses" → "dumbbell bench press". */
export function normalizeExerciseName(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/\bt-bar\b/g, 'tbar')
    .replace(/\b(pull|chin|push|sit|muscle)[\s-]+ups?\b/g, '$1up')
    .replace(/\bpull[\s-]+downs?\b/g, 'pulldown')
    .replace(/\bpush[\s-]+downs?\b/g, 'pushdown')
    .replace(/\bstep[\s-]+ups?\b/g, 'step up')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const out: string[] = [];
  for (const tok of base.split(' ')) {
    if (!tok || FILLER.has(tok)) continue;
    const t = TOKEN[tok] ?? tok;
    if (t) out.push(...t.split(' '));
  }
  return out.join(' ');
}

// Normalized name → standard id. Each standard's own name is added too.
const SYNONYMS: Record<string, string[]> = {
  back_squat: ['back squat', 'squat', 'barbell squat', 'barbell back squat', 'high bar squat', 'low bar squat', 'high bar back squat', 'low bar back squat'],
  front_squat: ['front squat', 'barbell front squat'],
  pause_squat: ['pause squat', 'pause back squat'],
  box_squat: ['box squat'],
  safety_bar_squat: ['safety bar squat', 'safety squat bar squat'],
  zercher_squat: ['zercher squat'],
  overhead_squat: ['overhead squat'],
  smith_squat: ['smith machine squat', 'smith squat'],
  hack_squat: ['hack squat', 'machine hack squat', 'plate loaded hack squat'],
  leg_press: ['leg press', '45 degree leg press', 'sled leg press'],
  belt_squat: ['belt squat'],
  goblet_squat: ['goblet squat', 'goblet squat one dumbbell', 'dumbbell goblet squat', 'kettlebell goblet squat'],
  bulgarian_split_squat_bb: ['barbell bulgarian split squat', 'barbell rear foot elevated split squat', 'safety bar bulgarian split squat',
    'safety bar rear foot elevated split squat'],
  bulgarian_split_squat_db: ['bulgarian split squat', 'dumbbell bulgarian split squat', 'rear foot elevated split squat',
    'dumbbell rear foot elevated split squat'],
  reverse_lunge_bb: ['barbell reverse lunge'],
  walking_lunge_bb: ['barbell walking lunge'],
  lunge_db: ['dumbbell lunge', 'lunge', 'dumbbell walking lunge', 'dumbbell reverse lunge'],
  step_up_db: ['dumbbell step up', 'step up'],
  leg_extension: ['leg extension', 'machine leg extension'],
  seated_leg_curl: ['seated leg curl', 'seated hamstring curl'],
  lying_leg_curl: ['lying leg curl', 'lying hamstring curl', 'prone leg curl'],
  hip_thrust: ['hip thrust', 'barbell hip thrust'],
  glute_bridge: ['barbell glute bridge', 'glute bridge'],
  cable_pull_through: ['cable pull through', 'pull through'],
  standing_calf_raise: ['standing calf raise', 'machine standing calf raise'],
  seated_calf_raise: ['seated calf raise'],
  good_morning: ['good morning', 'barbell good morning'],
  thruster: ['thruster', 'barbell thruster'],
  deadlift: ['deadlift', 'conventional deadlift', 'barbell deadlift', 'dl'],
  sumo_deadlift: ['sumo deadlift'],
  trap_bar_deadlift: ['trap bar deadlift', 'hex bar deadlift', 'trap bar dl', 'hex bar dl'],
  romanian_deadlift: ['romanian deadlift', 'barbell romanian deadlift'],
  stiff_leg_deadlift: ['stiff leg deadlift', 'straight leg deadlift'],
  deficit_deadlift: ['deficit deadlift', 'deficit conventional deadlift'],
  rack_pull: ['rack pull', 'block pull'],
  snatch_grip_deadlift: ['snatch grip deadlift'],
  back_extension_weighted: ['weighted back extension', 'weighted hyperextension'],
  single_leg_rdl_db: ['single leg romanian deadlift', 'dumbbell single leg romanian deadlift', 'kettlebell single leg romanian deadlift',
    'single leg romanian deadlift dumbbell', 'single leg romanian deadlift kettlebell'],
  barbell_shrug: ['barbell shrug', 'shrug'],
  dumbbell_shrug: ['dumbbell shrug'],
  farmers_walk: ['farmers walk', 'farmers carry', 'dumbbell farmers walk'],
  kettlebell_swing: ['kettlebell swing', 'russian kettlebell swing'],
  power_clean: ['power clean'],
  hang_power_clean: ['hang power clean'],
  clean_and_jerk: ['clean and jerk'],
  power_snatch: ['power snatch'],
  snatch: ['snatch', 'squat snatch', 'full snatch'],
  bench_press: ['bench press', 'barbell bench press', 'bench', 'flat bench press', 'flat barbell bench press'],
  incline_bench: ['incline bench press', 'incline barbell bench press', 'incline bench', 'incline barbell press'],
  decline_bench: ['decline bench press', 'decline barbell bench press'],
  close_grip_bench: ['close grip bench press', 'close grip bench', 'close grip barbell bench press'],
  paused_bench: ['pause bench press', 'pause bench', 'pause barbell bench press'],
  floor_press: ['floor press', 'barbell floor press'],
  smith_bench: ['smith machine bench press', 'smith bench press', 'smith bench'],
  machine_chest_press: ['machine chest press', 'chest press', 'seated chest press'],
  db_bench: ['dumbbell bench press', 'flat dumbbell bench press', 'dumbbell bench', 'dumbbell chest press'],
  incline_db_bench: ['incline dumbbell press', 'incline dumbbell bench press', 'incline dumbbell bench'],
  decline_db_bench: ['decline dumbbell press', 'decline dumbbell bench press'],
  db_floor_press: ['dumbbell floor press'],
  db_fly: ['dumbbell fly', 'flat dumbbell fly'],
  incline_db_fly: ['incline dumbbell fly'],
  cable_fly: ['cable fly', 'cable crossover'],
  pec_deck: ['pec deck', 'pec fly machine', 'machine fly', 'pec deck fly', 'machine chest fly', 'machine pec fly'],
  skullcrusher: ['skullcrusher', 'skull crusher', 'ez bar skullcrusher', 'ez bar skull crusher', 'skull crusher ez bar',
    'lying tricep extension', 'ez bar lying tricep extension'],
  tricep_pushdown: ['tricep pushdown', 'cable tricep pushdown', 'cable pushdown', 'rope pushdown', 'tricep rope pushdown',
    'cable tricep pulldown', 'tricep pulldown'],
  overhead_tricep_cable: ['cable overhead tricep extension'],
  overhead_tricep_db: ['dumbbell overhead tricep extension'],
  jm_press: ['jm press'],
  barbell_row: ['barbell row', 'bent over row', 'bent over barbell row', 'barbell bent over row'],
  pendlay_row: ['pendlay row'],
  t_bar_row: ['t bar row', 't bar row wide grip', 'landmine row'],
  db_row: ['one arm dumbbell row', 'one dumbbell row', 'dumbbell row', 'one arm row', 'single arm dumbbell row', 'one arm dumbbell row'],
  seated_cable_row: ['seated cable row', 'cable row', 'seated row'],
  chest_supported_row: ['chest supported row', 'chest supported row machine', 'machine chest supported row'],
  lat_pulldown: ['lat pulldown', 'pulldown', 'cable lat pulldown', 'wide grip lat pulldown'],
  straight_arm_pulldown: ['straight arm pulldown', 'straight arm lat pulldown'],
  face_pull: ['cable face pull', 'rope face pull', 'cable rope face pull'], // not bare 'face pull': the catalog entry also covers band face pulls
  reverse_pec_deck: ['reverse pec deck', 'reverse pec deck fly', 'machine reverse fly', 'rear delt machine'],
  barbell_curl: ['barbell curl', 'barbell bicep curl'],
  ez_curl: ['ez bar curl', 'ez curl'],
  db_curl: ['dumbbell curl', 'bicep curl', 'dumbbell bicep curl'],
  hammer_curl: ['hammer curl', 'dumbbell hammer curl'],
  preacher_curl: ['preacher curl', 'ez bar preacher curl', 'preacher curl ez bar'],
  cable_curl: ['cable curl', 'cable bicep curl'],
  incline_db_curl: ['incline dumbbell curl'],
  wrist_curl: ['barbell wrist curl', 'wrist curl'],
  reverse_curl: ['reverse curl', 'barbell reverse curl', 'ez bar reverse curl'],
  overhead_press: ['overhead press', 'barbell overhead press', 'shoulder press', 'military press', 'standing press',
    'standing overhead press', 'barbell shoulder press', 'standing military press', 'barbell military press', 'press'],
  seated_barbell_press: ['seated barbell press', 'seated overhead press', 'seated military press', 'seated barbell shoulder press'],
  push_press: ['push press'],
  push_jerk: ['push jerk'],
  seated_db_press: ['seated dumbbell shoulder press', 'dumbbell shoulder press', 'seated dumbbell press'],
  standing_db_press: ['standing dumbbell press', 'standing dumbbell shoulder press'],
  arnold_press: ['arnold press', 'dumbbell arnold press'],
  machine_shoulder_press: ['machine shoulder press'],
  smith_shoulder_press: ['smith machine shoulder press', 'smith shoulder press'],
  landmine_press: ['landmine press', 'landmine shoulder press'],
  lateral_raise: ['dumbbell lateral raise', 'lateral raise', 'side raise', 'side lateral raise', 'dumbbell side raise'],
  cable_lateral_raise: ['cable lateral raise'],
  front_raise: ['dumbbell front raise', 'front raise'],
  rear_delt_fly: ['dumbbell rear delt fly', 'dumbbell reverse fly', 'bent over dumbbell reverse fly'],
  upright_row: ['upright row', 'barbell upright row'],
  pull_up: ['pull up', 'pull up dead hang', 'weighted pull up', 'bodyweight pull up'],
  chin_up: ['chin up', 'weighted chin up', 'bodyweight chin up'],
  push_up: ['push up', 'bodyweight push up', 'weighted push up'],
  dip: ['dip', 'parallel bar dip', 'bar dip', 'weighted dip', 'chest dip', 'tricep dip'],
  inverted_row: ['inverted row', 'bodyweight row', 'australian pull up'],
  sit_up: ['sit up'],
  hanging_leg_raise: ['hanging leg raise', 'hanging straight leg raise'],
  plank: ['plank', 'plank hold', 'front plank', 'forearm plank'],
  dead_hang: ['dead hang', 'bar hang'],
  l_sit: ['l sit', 'l sit hold'],
  pistol_squat: ['pistol squat'],
  bodyweight_squat: ['bodyweight squat', 'air squat'],
  back_extension_bw: ['back extension', 'hyperextension', 'bodyweight back extension'],
  muscle_up: ['muscle up', 'bar muscle up'],
  handstand_push_up: ['handstand push up'],
};

/** Bodyweight standards that have a weighted (added-load 1RM) counterpart. */
export const WEIGHTED_COUNTERPART: Record<string, string> = { pull_up: 'weighted_pull_up', chin_up: 'weighted_chin_up', dip: 'weighted_dip' };

const TABLE = new Map<string, string>();
for (const [id, names] of Object.entries(SYNONYMS)) {
  for (const n of names) {
    const k = normalizeExerciseName(n);
    const prev = TABLE.get(k);
    if (prev && prev !== id) throw new Error(`standard synonym "${n}" maps to both ${prev} and ${id}`);
    TABLE.set(k, id);
  }
}

/** Every standard id the matcher can return (tests check each exists in gym-standards.json). */
export const MATCHABLE_IDS = Object.keys(SYNONYMS);

/**
 * Standard id for an exercise name, or undefined. Tries the whole name, then
 * the name without a trailing parenthetical ("Pull-ups (dead hang)",
 * "Skull Crusher (EZ Bar)") when that bracket only adds grip/style detail.
 */
export function matchStandardId(name: string): string | undefined {
  const whole = TABLE.get(normalizeExerciseName(name));
  if (whole) return whole;
  const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(name);
  if (m) {
    // The bracket names equipment that changes the standard: try it as a prefix first.
    const inner = normalizeExerciseName(m[2]);
    const outer = normalizeExerciseName(m[1]);
    return TABLE.get(`${inner} ${outer}`) ?? (/(dumbbell|barbell|kettlebell|cable|machine|smith|band)/.test(inner) ? undefined : TABLE.get(outer));
  }
  return undefined;
}

/** The standard for an exercise: its own `standardId` if set, else matched from its name. */
export function standardIdFor(ex: Pick<Exercise, 'name' | 'standardId'>): string | undefined {
  return ex.standardId ?? matchStandardId(ex.name);
}
