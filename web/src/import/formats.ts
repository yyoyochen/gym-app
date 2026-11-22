// Hevy and Strong workout exports → the import's row type (docs/superpowers/
// specs/2026-11-23-csv-import-design.md). The formats come from real exports:
// Hevy writes one header everywhere (weight_kg or weight_lbs) and local-time
// dates in the phone's locale; Strong writes a comma file on iOS (no unit
// anywhere) and a semicolon file on Android (unit in the header, or per row in
// old files). Rows come out in the GymBro shape, so the planner and writer in
// notion.ts do the rest.
import type { ISODate, SetKind } from '../domain/types';
import { daysInMonth, pad } from '../db/util';
import type { NotionRow, ParsedNotion, RowProblem } from './notion';

export type CsvFormat = 'gymbro' | 'hevy' | 'strong';
export type WeightUnit = 'kg' | 'lb';

const LB = 0.45359237;
const norm = (h: string) => h.replace(/^﻿/, '').trim().toLowerCase().replace(/\s+/g, ' ');

export function detectFormat(header: string[]): CsvFormat | null {
  const h = header.map(norm);
  if (h.includes('exercise_title') && h.includes('set_type')) return 'hevy';
  if (h.includes('exercise name') && h.includes('set order')) return 'strong';
  if (h.includes('date') && (h.includes('exercise') || h.includes('exercise name') || h.includes('lift'))) return 'gymbro';
  return null;
}

/** Strong's unit: from a "Weight (kg)" header, a per-row "Weight Unit" column ('row'), or nowhere (null: ask). */
export function unitOfStrong(header: string[]): WeightUnit | 'row' | null {
  const h = header.map(norm);
  for (const c of h) {
    const m = /^weight \((kg|lbs?)\)$/.exec(c);
    if (m) return m[1] === 'kg' ? 'kg' : 'lb';
  }
  return h.includes('weight unit') ? 'row' : null;
}

// ---------------------------------------------------------------- dates

/** Month names in the locales Hevy exports seen so far (en, it, es, fr, de, pt, nl), accents stripped. */
const MONTH: Record<string, number> = {
  jan: 1, gen: 1, ene: 1, janv: 1,
  feb: 2, fev: 2, fevr: 2,
  mar: 3, mars: 3, mrt: 3,
  apr: 4, abr: 4, avr: 4,
  may: 5, mag: 5, mai: 5, mei: 5,
  jun: 6, giu: 6, juin: 6,
  jul: 7, lug: 7, juil: 7,
  aug: 8, ago: 8, aou: 8, aout: 8,
  sep: 9, set: 9, sept: 9,
  oct: 10, ott: 10, okt: 10, out: 10,
  nov: 11,
  dec: 12, dic: 12, dez: 12,
};
const monthOf = (name: string): number | undefined => {
  const n = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\.$/, '');
  return MONTH[n.slice(0, 4)] ?? MONTH[n.slice(0, 3)];
};

function isoOf(y: number, m: number | undefined, d: number): ISODate | null {
  if (!m || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

function clock(h: number, min: number, ampm?: string): string | null {
  let hh = h;
  if (ampm) {
    if (h < 1 || h > 12) return null;
    const pm = /^p/i.test(ampm);
    hh = h % 12 + (pm ? 12 : 0);
  }
  if (hh > 23 || min > 59) return null;
  return `${pad(hh)}:${pad(min)}`;
}

/** Hevy's start_time in the phone's locale: "18 Nov 2026, 18:22", "Jun 19, 2026, 9:40 AM", "14 ott 2026, 20:39". */
export function parseHevyDateTime(input: string): { date: ISODate; time: string } | null {
  const s = input.replace(/[  ]/g, ' ').trim();
  const ampm = '(?:\\s*([AaPp])\\.?\\s?[Mm]\\.?)?';
  let m = new RegExp(`^(\\d{1,2})\\.?\\s+([^\\d\\s,]+?)\\.?\\s+(\\d{4}),?\\s+(\\d{1,2}):(\\d{2})${ampm}$`).exec(s);
  if (m) {
    const date = isoOf(Number(m[3]), monthOf(m[2]), Number(m[1]));
    const time = clock(Number(m[4]), Number(m[5]), m[6]);
    return date && time ? { date, time } : null;
  }
  m = new RegExp(`^([^\\d\\s,]+?)\\.?\\s+(\\d{1,2}),?\\s+(\\d{4}),?\\s+(\\d{1,2}):(\\d{2})${ampm}$`).exec(s);
  if (m) {
    const date = isoOf(Number(m[3]), monthOf(m[1]), Number(m[2]));
    const time = clock(Number(m[4]), Number(m[5]), m[6]);
    return date && time ? { date, time } : null;
  }
  return null;
}

/** Strong's "2026-10-20 06:05:12" (local time). */
function parseStrongDate(input: string): ISODate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/.exec(input.trim());
  return m ? isoOf(Number(m[1]), Number(m[2]), Number(m[3])) : null;
}

// ---------------------------------------------------------------- numbers

/** "80", "5.0", "12,5" (decimal comma), "" → null; junk → NaN. */
function num(s: string | undefined): number | null {
  const t = (s ?? '').trim();
  if (t === '') return null;
  return Number(t.includes('.') ? t : t.replace(',', '.'));
}
const kg = (w: number, unit: WeightUnit) => (unit === 'lb' ? Math.round(w * LB * 100) / 100 : w);
const rirOf = (rpe: number | null) => (rpe !== null && Number.isFinite(rpe) && rpe >= 1 && rpe <= 10 ? Math.round((10 - rpe) * 10) / 10 : undefined);
const assisted = (name: string) => /\(assisted\)/i.test(name);

// ---------------------------------------------------------------- shared row building

interface Draft {
  line: number; group: string; date: ISODate; label: string; exercise: string; setIndex: number | null;
  reps: number; weight: number | null; kind: SetKind; rir?: number; notes: string;
}

/** Numbers exercises 1…n by first appearance in each workout and sets 1…n per exercise; one note per exercise. */
function toRows(format: CsvFormat, drafts: Draft[]): NotionRow[] {
  const order = new Map<string, Map<string, number>>();
  const sets = new Map<string, number>();
  const noted = new Set<string>();
  return drafts.map(d => {
    let ex = order.get(d.group);
    if (!ex) { ex = new Map(); order.set(d.group, ex); }
    if (!ex.has(d.exercise)) ex.set(d.exercise, ex.size + 1);
    const o = ex.get(d.exercise)!;
    const k = `${d.group}\u001f${d.exercise}`;
    const n = (sets.get(k) ?? 0) + 1;
    sets.set(k, n);
    const notes = d.notes && !noted.has(k) ? d.notes : '';
    if (d.notes) noted.add(k);
    const set = d.setIndex !== null && format === 'hevy' ? d.setIndex + 1 : n;
    const weight = d.weight !== null && assisted(d.exercise) && d.weight > 0 ? -d.weight : d.weight;
    return {
      line: d.line, date: d.date, label: d.label, exercise: d.exercise, order: o, set, reps: d.reps, weight, notes,
      kind: d.kind, ...(d.rir !== undefined ? { rir: d.rir } : {}), group: d.group,
      raw: [format, d.group, d.date, d.label, d.exercise, o, set, d.reps, weight ?? '', d.kind, d.rir ?? '', notes].join('\u001f'),
    };
  });
}

function columns(header: string[]) {
  const h = header.map(norm);
  return (...names: string[]) => h.findIndex(c => names.includes(c));
}

// ---------------------------------------------------------------- Hevy

export function parseHevy(table: string[][]): ParsedNotion {
  const header = table[0] ?? [];
  const col = columns(header);
  const c = {
    title: col('title'), start: col('start_time'), exercise: col('exercise_title'), notes: col('exercise_notes'),
    index: col('set_index'), type: col('set_type'), kg: col('weight_kg'), lb: col('weight_lbs'), reps: col('reps'), rpe: col('rpe'),
    seconds: col('duration_seconds'), distance: col('distance_km', 'distance_miles'),
  };
  const drafts: Draft[] = [];
  const skipped: RowProblem[] = [];
  for (let i = 1; i < table.length; i++) {
    const r = table[i];
    const line = i + 1;
    const get = (j: number) => (j >= 0 ? (r[j] ?? '').trim() : '');
    const when = parseHevyDateTime(get(c.start));
    const exercise = get(c.exercise).replace(/\s+/g, ' ');
    if (!when) { skipped.push({ line, reason: `unreadable date "${get(c.start)}"` }); continue; }
    if (!exercise) { skipped.push({ line, reason: 'no exercise' }); continue; }
    const reps = num(get(c.reps));
    if (reps === null || (reps === 0 && ((num(get(c.seconds)) ?? 0) > 0 || (num(get(c.distance)) ?? 0) > 0))) {
      skipped.push({ line, reason: 'no reps (timed or cardio)' }); continue;
    }
    const wKg = num(get(c.kg)), wLb = num(get(c.lb));
    const weight = wKg !== null ? wKg : wLb !== null ? kg(wLb, 'lb') : null;
    if (Number.isNaN(reps) || (weight !== null && Number.isNaN(weight))) { skipped.push({ line, reason: 'unreadable weight or reps' }); continue; }
    const type = get(c.type).toLowerCase();
    const rpe = num(get(c.rpe));
    const kind: SetKind = type === 'warmup' ? 'warmup' : type === 'dropset' ? 'drop' : 'working';
    const rir = kind === 'warmup' ? undefined : rirOf(rpe) ?? (type === 'failure' ? 0 : undefined);
    const idx = num(get(c.index));
    drafts.push({
      line, group: `${get(c.title)}|${get(c.start)}`, date: when.date, label: get(c.title), exercise,
      setIndex: idx !== null && Number.isInteger(idx) ? idx : null, reps: Math.round(reps), weight, kind, rir,
      notes: get(c.notes).replace(/\\n/g, '\n'),
    });
  }
  return { rows: toRows('hevy', drafts), skipped, columns: header };
}

// ---------------------------------------------------------------- Strong

/** `unit` is used only when the file names none (the iOS export). */
export function parseStrong(table: string[][], unit: WeightUnit): ParsedNotion {
  const header = table[0] ?? [];
  const col = columns(header);
  const fileUnit = unitOfStrong(header);
  const c = {
    no: col('workout #'), date: col('date'), name: col('workout name'), exercise: col('exercise name'), order: col('set order'),
    weight: col('weight', 'weight (kg)', 'weight (lb)', 'weight (lbs)'), unit: col('weight unit'), reps: col('reps'), rpe: col('rpe'),
    seconds: col('seconds'), distance: col('distance', 'distance (meters)', 'distance (km)', 'distance (miles)'), notes: col('notes'),
  };
  const drafts: Draft[] = [];
  const skipped: RowProblem[] = [];
  for (let i = 1; i < table.length; i++) {
    const r = table[i];
    const line = i + 1;
    const get = (j: number) => (j >= 0 ? (r[j] ?? '').trim() : '');
    const order = get(c.order);
    if (/^rest timer$/i.test(order) || /^rest timer$/i.test(get(c.exercise))) { skipped.push({ line, reason: 'rest timer' }); continue; }
    if (/^note$/i.test(order)) { skipped.push({ line, reason: 'note' }); continue; }
    const date = parseStrongDate(get(c.date));
    const exercise = get(c.exercise).replace(/\s+/g, ' ');
    if (!date) { skipped.push({ line, reason: `unreadable date "${get(c.date)}"` }); continue; }
    if (!exercise) { skipped.push({ line, reason: 'no exercise' }); continue; }
    const reps = num(get(c.reps));
    if (reps === null || (reps === 0 && ((num(get(c.seconds)) ?? 0) > 0 || (num(get(c.distance)) ?? 0) > 0))) {
      skipped.push({ line, reason: 'no reps (timed or cardio)' }); continue;
    }
    const raw = num(get(c.weight));
    const rowUnit: WeightUnit = fileUnit === 'kg' || fileUnit === 'lb' ? fileUnit
      : fileUnit === 'row' ? (/^lb/i.test(get(c.unit)) ? 'lb' : 'kg') : unit;
    const weight = raw === null ? null : kg(raw, rowUnit);
    if (Number.isNaN(reps) || (weight !== null && Number.isNaN(weight))) { skipped.push({ line, reason: 'unreadable weight or reps' }); continue; }
    const letter = order.toUpperCase();
    const kind: SetKind = letter === 'W' ? 'warmup' : letter === 'D' ? 'drop' : 'working';
    const rir = kind === 'warmup' ? undefined : rirOf(num(get(c.rpe))) ?? (letter === 'F' ? 0 : undefined);
    drafts.push({
      line, group: get(c.no) || `${get(c.name)}|${get(c.date)}`, date, label: get(c.name), exercise,
      setIndex: null, reps: Math.round(reps), weight, kind, rir, notes: get(c.notes),
    });
  }
  return { rows: toRows('strong', drafts), skipped, columns: header };
}
