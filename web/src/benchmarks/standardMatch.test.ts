import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MATCHABLE_IDS, matchStandardId, normalizeExerciseName, standardIdFor, WEIGHTED_COUNTERPART } from './standardMatch';
import { getStandard, type GymStandardsData } from './gymStandards';
import { defaultCatalog, guessExercise } from '../domain/catalog';

const data: GymStandardsData = JSON.parse(readFileSync(fileURLToPath(new URL('../../public/standards/gym-standards.json', import.meta.url)), 'utf8'));

describe('normalizeExerciseName', () => {
  it.each([
    ['DB Bench Press', 'dumbbell bench press'],
    ['Pull-ups', 'pull up'],
    ['Pull Ups', 'pull up'],
    ['Chin-Ups', 'chin up'],
    ["Farmer's Walk", 'farmers walk'],
    ['T-Bar Row', 't bar row'],
    ['Clean & Jerk', 'clean and jerk'],
    ['OHP', 'overhead press'],
    ['Lat Pull-Down', 'lat pulldown'],
    ['Single-Arm DB Row', 'one arm dumbbell row'],
    ['  Back   SQUATS ', 'back squat'],
  ])('%s → %s', (raw, want) => expect(normalizeExerciseName(raw)).toBe(want));
});

describe('matchStandardId', () => {
  it.each([
    ['OHP', 'overhead_press'], ['Overhead Press', 'overhead_press'], ['Shoulder Press', 'overhead_press'], ['Military Press', 'overhead_press'],
    ['Back Squat', 'back_squat'], ['Squat', 'back_squat'],
    ['Conventional Deadlift', 'deadlift'], ['Deadlift', 'deadlift'],
    ['Pull-ups', 'pull_up'], ['Pull-up', 'pull_up'], ['Pull-ups (dead hang)', 'pull_up'], ['Weighted Pull-ups', 'pull_up'],
    ['Dips', 'dip'], ['Parallel Bar Dip', 'dip'],
    ['T-Bar Row', 't_bar_row'], ['T-Bar Row (wide grip)', 't_bar_row'],
    ['Trap Bar Deadlift', 'trap_bar_deadlift'], ['Hex Bar Deadlift', 'trap_bar_deadlift'],
    ['Barbell Row', 'barbell_row'], ['Bent-over Row', 'barbell_row'], ['Bent-over Barbell Row', 'barbell_row'],
    ['DB Bench Press', 'db_bench'], ['Dumbbell Bench Press', 'db_bench'], ['Bench Press', 'bench_press'],
    ['Incline DB Press', 'incline_db_bench'], ['Seated DB Shoulder Press', 'seated_db_press'],
    ['Skull Crusher (EZ Bar)', 'skullcrusher'], ['Clean and Jerk', 'clean_and_jerk'], ['Squat Snatch', 'snatch'],
    ['SSB Rear-Foot-Elevated Split Squat', 'bulgarian_split_squat_bb'], ['Rear-Foot-Elevated Split Squat', 'bulgarian_split_squat_db'],
    ['KB Single-Leg RDL', 'single_leg_rdl_db'], ['RDL', 'romanian_deadlift'],
    ['Hack Squat (plate loaded)', 'hack_squat'], ['Plank', 'plank'], ['Push-ups', 'push_up'],
  ])('%s → %s', (name, id) => expect(matchStandardId(name)).toBe(id));

  it.each([
    'Leg Curl', 'Calf Raise', 'Overhead Tricep Extension', 'Hanging Knee Raise', 'Deficit RDL', 'Box Jump', 'Band Face Pull',
    'Hang Clean', 'Clean', 'Face Pull', 'Single-Leg Hack Squat', 'Rear Delt Fly', 'Leg Curl (machine)', 'Something Odd', '',
  ])('%s → no standard', name => expect(matchStandardId(name)).toBeUndefined());

  it('a bracketed implement changes the standard, not just the wording', () => {
    expect(matchStandardId('Bulgarian Split Squat (barbell)')).toBe('bulgarian_split_squat_bb');
    expect(matchStandardId('Bulgarian Split Squat (dumbbells)')).toBe('bulgarian_split_squat_db');
    expect(matchStandardId('Romanian Deadlift (Barbell)')).toBe('romanian_deadlift');
    expect(matchStandardId('Bench Press (dumbbell)')).toBe('db_bench');
    expect(matchStandardId('Lateral Raise (cable)')).toBe('cable_lateral_raise');
  });

  it('every id it can return, and every weighted counterpart, exists in gym-standards.json', () => {
    for (const id of [...MATCHABLE_IDS, ...Object.values(WEIGHTED_COUNTERPART)]) expect(getStandard(data, id), id).toBeDefined();
    for (const [bw, w] of Object.entries(WEIGHTED_COUNTERPART)) {
      expect(getStandard(data, bw)).toMatchObject({ kind: 'bodyweight', unit: 'reps' });
      expect(getStandard(data, w)).toMatchObject({ kind: 'bodyweight', unit: 'bw_fraction' });
    }
  });

  it('every standard in the model is reachable by its own name', () => {
    // Bare "Face Pull" is left unmatched on purpose (the catalog entry also covers band face pulls).
    const via: Record<string, string> = { face_pull: 'Cable Face Pull' };
    for (const e of [...data.loaded, ...data.bodyweight]) {
      if (e.id.startsWith('weighted_')) continue; // chosen from the sets, not the name
      expect(matchStandardId(via[e.id] ?? e.name), e.name).toBe(e.id);
    }
  });
});

describe('catalog standard ids', () => {
  const cat = defaultCatalog();
  it('exist in the table and agree with the name matcher (so stored rows without the field rate the same)', () => {
    for (const e of cat) {
      if (e.standardId) expect(getStandard(data, e.standardId), e.name).toBeDefined();
      expect(matchStandardId(e.name), e.name).toBe(e.standardId);
    }
  });
  it('cover the main lifts', () => {
    const by = new Map(cat.map(e => [e.id, e.standardId]));
    expect(by.get('back-squat')).toBe('back_squat');
    expect(by.get('barbell-bench-press')).toBe('bench_press');
    expect(by.get('conventional-deadlift')).toBe('deadlift');
    expect(by.get('overhead-press')).toBe('overhead_press');
    expect(by.get('pull-up')).toBe('pull_up');
    expect(by.get('dips')).toBe('dip');
    expect(cat.filter(e => e.standardId).length).toBeGreaterThanOrEqual(50);
  });
  it('standardIdFor prefers the stored field, then the name', () => {
    expect(standardIdFor({ name: 'Back Squat', standardId: 'front_squat' })).toBe('front_squat');
    expect(standardIdFor({ name: 'Weighted Chin-ups' })).toBe('chin_up');
    expect(standardIdFor(guessExercise('Zercher Squat'))).toBe('zercher_squat');
  });
});
