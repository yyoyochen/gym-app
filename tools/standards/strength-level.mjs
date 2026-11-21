#!/usr/bin/env node
// Strength Level → a local-only standards table (docs/superpowers/specs/
// 2026-11-22-strength-level-local-benchmark-design.md).
//
// The numbers come from strengthlevel.com and must never be committed or
// shipped: the output goes to testdata/private/ (git-ignored) and only
// preview builds load it, from __private__/.
//   node tools/standards/strength-level.mjs <csv> [out]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Strength Level exercise name → the app's standard id (names only, no data). */
export const SL_NAME_TO_STD = {
  'Squat': 'back_squat',
  'Bench Press': 'bench_press',
  'Deadlift': 'deadlift',
  'Shoulder Press': 'overhead_press',
  'Front Squat': 'front_squat',
  'Safety Bar Squat': 'safety_bar_squat',
  'Dumbbell Bulgarian Split Squat': 'bulgarian_split_squat_db',
  'Dumbbell Lunge': 'lunge_db',
  'Bent Over Row': 'barbell_row',
  'Pendlay Row': 'pendlay_row',
  'Dumbbell Row': 'db_row',
  'Barbell Shrug': 'barbell_shrug',
  'Close Grip Bench Press': 'close_grip_bench',
  'Dumbbell Bench Press': 'db_bench',
  'Incline Bench Press': 'incline_bench',
  'Incline Dumbbell Bench Press': 'incline_db_bench',
  'Good Morning': 'good_morning',
  'Goblet Squat': 'goblet_squat',
  'Hip Thrust': 'hip_thrust',
  'Landmine Press': 'landmine_press',
  'Romanian Deadlift': 'romanian_deadlift',
  'Sumo Deadlift': 'sumo_deadlift',
  'Hex Bar Deadlift': 'trap_bar_deadlift',
  'T Bar Row': 't_bar_row',
  'Seated Dumbbell Shoulder Press': 'seated_db_press',
  'Dumbbell Lateral Raise': 'lateral_raise',
  'Push Press': 'push_press',
  'Power Clean': 'power_clean',
  'Power Snatch': 'power_snatch',
  'Snatch': 'snatch',
  'Clean and Jerk': 'clean_and_jerk',
};

const isNum = s => /^\d+(\.\d+)?$/.test(s.trim());

/**
 * CSV (Exercise, Body Weight (kg), Beginner … Elite (kg)) → per-standard
 * tables of the five thresholds by bodyweight, male only (the source has no
 * sex column). Rows with a non-number (e.g. "< 1" reps) are skipped.
 */
export function convertStrengthLevel(csv) {
  const lines = csv.trim().split(/\r?\n/).slice(1);
  const tables = {};
  const unmapped = new Set();
  for (const line of lines) {
    const cells = line.split(',');
    if (cells.length < 7 || !cells.slice(1, 7).every(isNum)) continue;
    const [name, bw, ...levels] = cells;
    const id = SL_NAME_TO_STD[name.trim()];
    if (!id) { unmapped.add(name.trim()); continue; }
    const t = (tables[id] ??= { bw: [], male: [] });
    t.bw.push(Number(bw));
    t.male.push(levels.slice(0, 5).map(Number));
  }
  for (const t of Object.values(tables)) {
    const order = t.bw.map((_, i) => i).sort((a, b) => t.bw[a] - t.bw[b]);
    t.bw = order.map(i => t.bw[i]);
    t.male = order.map(i => t.male[i]);
  }
  return { source: 'Strength Level (strengthlevel.com), local testing only', tables, unmapped: [...unmapped] };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [src, out = 'testdata/private/strength-level.json'] = process.argv.slice(2);
  if (!src) { console.error('Usage: node tools/standards/strength-level.mjs <csv> [out]'); process.exit(1); }
  const res = convertStrengthLevel(readFileSync(src, 'utf8'));
  writeFileSync(out, JSON.stringify({ source: res.source, tables: res.tables }));
  console.log(`${Object.keys(res.tables).length} mapped → ${out}`);
  if (res.unmapped.length) console.log(`Unmapped (${res.unmapped.length}): ${res.unmapped.join(', ')}`);
}
