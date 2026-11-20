#!/usr/bin/env node
// Synthetic training log for public tests and the demo (docs/PWA-SPEC.md §6.4).
// A made-up lifter ("Sam"), ~9 months of A/B/C full-body training in 2025,
// written in the Notion CSV format. Deterministic from a seed; no dependencies.
//
//   node tools/synthetic/generate.mjs                # writes fixtures/demo-log.csv
//   node tools/synthetic/generate.mjs --seed 7 --out /tmp/x.csv
//
// The numbers are invented on purpose (start loads, dates and progression rates
// are not taken from any real log).
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_SEED = 20250106;
export const HEADER = ['Date', 'Session', 'Exercise', 'Order', 'Set', 'Reps', 'Weight (kg)', 'Notes'];

/** mulberry32 — tiny seeded PRNG. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Day arithmetic in UTC on whole days only, so no timezone or DST can shift a date.
const DAY = 86400000;
const toUTC = iso => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const notionDate = ms => { const d = new Date(ms); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`; };

const round = (x, step) => Math.round(x / step) * step;

/**
 * Lift definitions. kind: 'main' = 3 working sets of 5 with linear progression
 * that stalls; 'acc' = double progression in a rep range.
 */
const PLAN = {
  A: [
    { name: 'Squat', kind: 'main', start: 62.5, inc: 5, reps: 5, sets: 3, ceiling: 112.5 },
    { name: 'Bench Press', kind: 'main', start: 45, inc: 2.5, reps: 5, sets: 3, ceiling: 72.5 },
    { name: 'Barbell Row', kind: 'acc', start: 40, inc: 2.5, min: 8, max: 12, sets: 3 },
    { name: 'Lateral Raise', kind: 'acc', start: 6, inc: 1, min: 12, max: 20, sets: 3 },
  ],
  B: [
    { name: 'Deadlift', kind: 'main', start: 80, inc: 5, reps: 5, sets: 2, ceiling: 142.5 },
    { name: 'OHP', kind: 'main', start: 30, inc: 2.5, reps: 5, sets: 3, ceiling: 47.5 },
    { name: 'Pull-ups', kind: 'acc', start: 0, inc: 2.5, min: 5, max: 10, sets: 3 },
    { name: 'Tricep Pushdown', kind: 'acc', start: 20, inc: 2.5, min: 10, max: 15, sets: 3 },
  ],
  C: [
    { name: 'Incline DB Press', kind: 'acc', start: 14, inc: 2, min: 8, max: 12, sets: 3 },
    { name: 'RDL', kind: 'acc', start: 50, inc: 5, min: 8, max: 12, sets: 3 },
    { name: 'Seated Cable Row', kind: 'acc', start: 35, inc: 2.5, min: 10, max: 15, sets: 3 },
    { name: 'Bulgarian Split Squat', kind: 'acc', start: 10, inc: 2, min: 8, max: 12, sets: 2 },
    { name: 'DB Curl', kind: 'acc', start: 8, inc: 1, min: 10, max: 15, sets: 2 },
    { name: 'Calf Raise', kind: 'acc', start: 40, inc: 5, min: 10, max: 15, sets: 3 },
  ],
};

const NOTES = [
  'felt quick', 'grip slipping, chalk next time', 'slept badly', 'belt on', 'paused first rep',
  'left knee a bit cranky', 'easy, could do more', 'gym busy, short rests', 'new shoes', 'last rep slow, "grind"',
];

/**
 * Generate the CSV text (newest session first, like a Notion export).
 * @param {{ seed?: number, start?: string, weeks?: number }} [opts]
 */
export function generateDemoLog(opts = {}) {
  const rnd = mulberry32(opts.seed ?? DEFAULT_SEED);
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const start = toUTC(opts.start ?? '2025-01-06');
  const weeks = opts.weeks ?? 39; // ~9 months

  // Training days: Mon/Wed/Fri-ish with jitter and occasional misses.
  const days = [];
  for (let w = 0; w < weeks; w++) {
    for (const base of [0, 2, 4]) {
      const ms = start + (w * 7 + base + (rnd() < 0.2 ? 1 : 0)) * DAY;
      if (days.length > 0 && rnd() < 0.08) continue; // missed day
      days.push(ms);
    }
  }
  // Two layoffs, measured session to session: 12 days in month 3, 21 days in month 6.
  let trainDays = days;
  for (const [fromWeek, len] of [[11, 12], [24, 21]]) {
    const anchor = trainDays.find(ms => ms >= start + fromWeek * 7 * DAY);
    const back = anchor + len * DAY;
    trainDays = trainDays.filter(ms => ms <= anchor || ms >= back);
    if (!trainDays.includes(back)) trainDays = [...trainDays, back].sort((a, b) => a - b);
  }

  // Per-lift state
  const state = {};
  for (const lifts of Object.values(PLAN)) for (const l of lifts) {
    state[l.name] = { w: l.start, reps: l.kind === 'acc' ? l.min : l.reps, fails: 0 };
  }

  const rows = [];
  let rot = 0;
  let prev = null;
  for (const ms of trainDays) {
    const key = ['A', 'B', 'C'][rot++ % 3];
    const layoff = prev !== null && ms - prev >= 10 * DAY;
    prev = ms;
    const label = rnd() < 0.04 ? '' : key; // a few sessions without a label
    const sessionRows = [];
    PLAN[key].forEach((lift, i) => {
      const st = state[lift.name];
      if (layoff) { st.w = Math.max(lift.start, round(st.w * 0.9, lift.inc)); st.fails = 0; }
      if (lift.kind === 'main') {
        // Harder to complete the closer the weight is to the lifter's ceiling.
        const strain = (st.w - lift.start) / (lift.ceiling - lift.start);
        const pFail = Math.min(0.85, 0.05 + Math.max(0, strain) ** 3 * 0.9);
        const warm = [round(st.w * 0.5, 2.5), round(st.w * 0.75, 2.5)].filter(x => x >= 20);
        let set = 1;
        for (const w of warm) sessionRows.push({ ex: lift.name, order: i + 1, set: set++, reps: 5, w, note: '' });
        let failed = false;
        for (let s = 0; s < lift.sets; s++) {
          let reps = lift.reps;
          if (rnd() < pFail) { reps = lift.reps - 1 - Math.floor(rnd() * 2); failed = true; }
          sessionRows.push({ ex: lift.name, order: i + 1, set: set++, reps, w: st.w, note: '' });
        }
        if (!failed) { st.w += lift.inc; st.fails = 0; }
        else if (++st.fails >= 3) { st.w = Math.max(lift.start, round(st.w * 0.9, lift.inc)); st.fails = 0; }
      } else {
        const reps = [];
        for (let s = 0; s < lift.sets; s++) reps.push(Math.max(lift.min - 2, st.reps - (s > 0 && rnd() < 0.35 ? 1 : 0)));
        reps.forEach((r, s) => sessionRows.push({ ex: lift.name, order: i + 1, set: s + 1, reps: r, w: st.w, note: '' }));
        if (reps.every(r => r >= lift.max)) { st.w = round(st.w + lift.inc, 0.5); st.reps = lift.min; }
        else if (rnd() < 0.6) st.reps = Math.min(lift.max, st.reps + 1);
      }
    });
    for (const r of sessionRows) {
      if (rnd() < 0.05) r.note = pick(NOTES);
      if (rnd() < 0.02) r.w = null; // forgot to type the weight
      rows.push([notionDate(ms), label, r.ex, r.order, r.set, r.reps, r.w ?? '', r.note]);
    }
  }

  // Newest first, like a Notion export; within a day keep slot/set order.
  const byDay = new Map();
  for (const r of rows) (byDay.get(r[0]) ?? byDay.set(r[0], []).get(r[0])).push(r);
  const ordered = [...byDay.values()].reverse().flat();
  const cell = v => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [HEADER.join(','), ...ordered.map(r => r.map(cell).join(','))].join('\n') + '\n';
}

// ---------------------------------------------------------------- CLI
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
  const seed = arg('--seed') ? Number(arg('--seed')) : DEFAULT_SEED;
  const out = resolve(arg('--out') ?? fileURLToPath(new URL('./fixtures/demo-log.csv', import.meta.url)));
  mkdirSync(dirname(out), { recursive: true });
  const csv = generateDemoLog({ seed });
  writeFileSync(out, csv);
  console.log(`Wrote ${csv.trim().split('\n').length - 1} rows to ${out} (seed ${seed})`);
}
