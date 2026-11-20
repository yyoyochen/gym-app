// Notion training-log CSV import (docs/PWA-SPEC.md §6.3).
// Header: Date,Session,Exercise,Order,Set,Reps,Weight (kg),Notes — matched by
// name, so column order doesn't matter. One CSV row = one set. Rows group into
// sessions by (date, Session label). Re-importing the same export is a no-op:
// each session carries importKey = hash of its normalised source rows.
import type { Exercise, ImportFlag, ISODate, Millis, Session } from '../domain/types';
import { findInCatalog, guessExercise, nameKey } from '../domain/catalog';
import type { GymDb, StoredSet } from '../db/schema';
import { daysInMonth, hashString, noonUTC, pad } from '../db/util';
import { parseCsv } from './csv';

export type AliasMap = Record<string, string>;

export interface NotionRow {
  /** 1-based line number in the file (header = 1). */
  line: number;
  date: ISODate;
  label: string;
  exercise: string;
  order: number | null;
  set: number | null;
  reps: number | null;
  weight: number | null;
  notes: string;
  /** Normalised source fields, for hashing. */
  raw: string;
}

export interface RowProblem { line: number; reason: string }

export interface ParsedNotion { rows: NotionRow[]; skipped: RowProblem[]; columns: string[] }

const HEADERS: Record<keyof Omit<NotionRow, 'line' | 'raw'>, string[]> = {
  date: ['date', 'day'],
  label: ['session', 'session label', 'label', 'workout'],
  exercise: ['exercise', 'exercise name', 'lift'],
  order: ['order', 'slot', 'exercise order'],
  set: ['set', 'set #', 'set number', 'set no'],
  reps: ['reps', 'rep'],
  weight: ['weight (kg)', 'weight', 'weight kg', 'kg', 'load (kg)', 'load'],
  notes: ['notes', 'note', 'comment', 'comments'],
};

const normHeader = (h: string) => h.replace(/^﻿/, '').trim().toLowerCase().replace(/\s+/g, ' ');

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * "November 19, 2026" → "2026-11-19". Pure string work, so no timezone can
 * shift the day. Also accepts "Nov 19, 2026", "19 November 2026", ISO
 * "2026-11-19" / "2026/11/19", an optional trailing time, and Notion date
 * ranges ("A → B" keeps A). Returns null when it can't be sure.
 */
export function parseNotionDate(input: string): ISODate | null {
  const s = input.split('→')[0].trim();
  let y: number, m: number, d: number;
  let mt = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/.exec(s);
  if (mt) {
    [y, m, d] = [Number(mt[1]), Number(mt[2]), Number(mt[3])];
  } else if ((mt = /^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})\b/.exec(s))) {
    m = MONTHS[mt[1].slice(0, 4).toLowerCase()] ?? MONTHS[mt[1].slice(0, 3).toLowerCase()];
    [d, y] = [Number(mt[2]), Number(mt[3])];
  } else if ((mt = /^(\d{1,2})\s+([A-Za-z]+)\.?,?\s+(\d{4})\b/.exec(s))) {
    m = MONTHS[mt[2].slice(0, 4).toLowerCase()] ?? MONTHS[mt[2].slice(0, 3).toLowerCase()];
    [d, y] = [Number(mt[1]), Number(mt[3])];
  } else return null;
  if (!m || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

function parseNum(s: string): number | null | 'bad' {
  const t = s.trim().replace(/\s*kg$/i, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : 'bad';
}

export function parseNotionCsv(text: string): ParsedNotion {
  const table = parseCsv(text);
  if (!table.length) throw new Error('Empty CSV');
  const header = table[0].map(normHeader);
  const col = {} as Record<keyof typeof HEADERS, number>;
  for (const [k, names] of Object.entries(HEADERS) as [keyof typeof HEADERS, string[]][]) {
    col[k] = header.findIndex(h => names.includes(h));
  }
  for (const req of ['date', 'exercise'] as const) {
    if (col[req] < 0) throw new Error(`Missing required column "${req === 'date' ? 'Date' : 'Exercise'}" (found: ${table[0].join(', ')})`);
  }
  const rows: NotionRow[] = [];
  const skipped: RowProblem[] = [];
  for (let i = 1; i < table.length; i++) {
    const r = table[i];
    const line = i + 1;
    const get = (k: keyof typeof HEADERS) => (col[k] >= 0 ? (r[col[k]] ?? '').trim() : '');
    const rawDate = get('date');
    const date = parseNotionDate(rawDate);
    const exercise = get('exercise').replace(/\s+/g, ' ');
    if (!date) { skipped.push({ line, reason: `unreadable date "${rawDate}"` }); continue; }
    if (!exercise) { skipped.push({ line, reason: 'no exercise' }); continue; }
    const nums = { order: parseNum(get('order')), set: parseNum(get('set')), reps: parseNum(get('reps')), weight: parseNum(get('weight')) };
    const bad = Object.entries(nums).find(([, v]) => v === 'bad');
    if (bad) { skipped.push({ line, reason: `unreadable ${bad[0]} "${get(bad[0] as keyof typeof HEADERS)}"` }); continue; }
    const n = nums as Record<keyof typeof nums, number | null>;
    const label = get('label');
    const notes = get('notes');
    rows.push({
      line, date, label, exercise,
      order: n.order, set: n.set, reps: n.reps, weight: n.weight, notes,
      raw: [date, label, exercise, n.order ?? '', n.set ?? '', n.reps ?? '', n.weight ?? '', notes].join('\u001f'),
    });
  }
  return { rows, skipped, columns: table[0] };
}

// ---------------------------------------------------------------- planning (pure)

export interface PlannedSet {
  row: NotionRow;
  canonical: string;
  slotOrder: number;
  setOrder: number;
  weight: number;
  reps: number;
  flags: ImportFlag[];
}

export interface PlannedSession {
  id: string;
  date: ISODate;
  label: string;
  importKey: string;
  sets: PlannedSet[];
}

/** Canonical name for a raw Notion name: exact alias, then case/punctuation-insensitive alias, else the name itself. */
export function canonicalName(raw: string, aliases: AliasMap): string {
  if (aliases[raw]) return aliases[raw];
  const k = nameKey(raw);
  for (const [from, to] of Object.entries(aliases)) if (nameKey(from) === k) return to;
  return raw;
}

export function sessionIdFor(date: ISODate, label: string): string {
  return `ses_notion_${hashString(`notion|${date}|${label}`)}`;
}

export function planNotionImport(rows: NotionRow[], aliases: AliasMap = {}): PlannedSession[] {
  const groups = new Map<string, NotionRow[]>();
  for (const r of rows) {
    const k = `${r.date}\u001f${r.label}`;
    const g = groups.get(k);
    if (g) g.push(r); else groups.set(k, [r]);
  }
  const out: PlannedSession[] = [];
  for (const g of groups.values()) {
    const { date, label } = g[0];
    // Order within the session: Order, then Set, then file position (Notion exports newest first).
    const sorted = [...g].sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || (a.set ?? 1e9) - (b.set ?? 1e9) || a.line - b.line);
    const setCount = new Map<number, number>();
    const sets = sorted.map((row, i): PlannedSet => {
      const slotOrder = row.order ?? i + 1;
      const n = (setCount.get(slotOrder) ?? 0) + 1;
      setCount.set(slotOrder, n);
      const flags: ImportFlag[] = [];
      if (row.weight === null) flags.push('blank_weight');
      if (row.reps === null) flags.push('blank_reps');
      return {
        row,
        canonical: canonicalName(row.exercise, aliases),
        slotOrder,
        setOrder: row.set ?? n,
        weight: row.weight ?? 0,
        reps: row.reps ?? 0,
        flags,
      };
    });
    const importKey = `notion:${hashString(sets.map(s => s.row.raw).sort().join('\u001e'))}`;
    out.push({ id: sessionIdFor(date, label), date, label, importKey, sets });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.label.localeCompare(b.label)));
}

// ---------------------------------------------------------------- writing

export interface NotionImportResult {
  rowsRead: number;
  sessionsAdded: number;
  setsAdded: number;
  /** Sessions already present with the same importKey (re-import). */
  sessionsUnchanged: number;
  /** Same date + label already imported but the rows differ; left alone. */
  conflicts: { date: ISODate; label: string }[];
  exercisesCreated: string[];
  blankWeight: number;
  blankReps: number;
  skipped: RowProblem[];
  firstDate?: ISODate;
  lastDate?: ISODate;
}

export interface NotionImportOptions {
  aliases?: AliasMap;
}

/** Parse + plan + write in one transaction. Unknown exercises are created from catalog defaults or keyword guesses. */
export async function importNotionCsv(db: GymDb, text: string, opts: NotionImportOptions = {}): Promise<NotionImportResult> {
  const parsed = parseNotionCsv(text);
  const plan = planNotionImport(parsed.rows, opts.aliases ?? {});
  const result: NotionImportResult = {
    rowsRead: parsed.rows.length + parsed.skipped.length,
    sessionsAdded: 0, setsAdded: 0, sessionsUnchanged: 0, conflicts: [], exercisesCreated: [],
    blankWeight: 0, blankReps: 0, skipped: parsed.skipped,
    firstDate: plan[0]?.date, lastDate: plan[plan.length - 1]?.date,
  };

  await db.transaction('rw', db.sessions, db.sets, db.exercises, async () => {
    const exercises = await db.exercises.toArray();
    const byKey = new Map<string, Exercise>();
    const index = (e: Exercise) => {
      for (const n of [e.name, ...e.aliases]) if (!byKey.has(nameKey(n))) byKey.set(nameKey(n), e);
    };
    exercises.filter(e => !e.archived).forEach(index);
    const ids = new Set(exercises.map(e => e.id));
    const touched = new Map<string, Exercise>();

    const resolve = (canonical: string, raw: string): Exercise => {
      let ex = byKey.get(nameKey(canonical));
      if (!ex) {
        const fromCatalog = findInCatalog(canonical);
        if (fromCatalog && !ids.has(fromCatalog.id)) ex = fromCatalog;
        else {
          ex = guessExercise(canonical);
          if (fromCatalog && ids.has(fromCatalog.id)) ex = { ...ex, id: `${ex.id}-imported` };
          let id = ex.id, k = 2;
          while (ids.has(id)) id = `${ex.id}-${k++}`;
          ex = { ...ex, id, name: canonical };
        }
        ids.add(ex.id);
        result.exercisesCreated.push(ex.name);
        index(ex);
        touched.set(ex.id, ex);
      }
      // Remember the names this log used, so later imports resolve without the alias map.
      for (const n of [canonical, raw]) {
        if (nameKey(n) !== nameKey(ex.name) && !ex.aliases.some(a => nameKey(a) === nameKey(n))) {
          ex = { ...ex, aliases: [...ex.aliases, n] };
          touched.set(ex.id, ex);
          index(ex);
          byKey.set(nameKey(n), ex);
        }
      }
      byKey.set(nameKey(canonical), ex);
      return ex;
    };

    const newSessions: Session[] = [];
    const newSets: StoredSet[] = [];
    for (const ps of plan) {
      const sameKey = await db.sessions.where('importKey').equals(ps.importKey).first();
      if (sameKey) { result.sessionsUnchanged++; continue; }
      if (await db.sessions.get(ps.id)) { result.conflicts.push({ date: ps.date, label: ps.label }); continue; }
      const startedAt: Millis = noonUTC(ps.date);
      ps.sets.forEach((p, i) => {
        const ex = resolve(p.canonical, p.row.exercise);
        if (p.flags.includes('blank_weight')) result.blankWeight++;
        if (p.flags.includes('blank_reps')) result.blankReps++;
        newSets.push({
          id: `set_notion_${hashString(`${ps.id}|${i}|${p.row.raw}`)}`,
          sessionId: ps.id,
          exerciseId: ex.id,
          exerciseNameSnapshot: p.canonical,
          slotOrder: p.slotOrder,
          setOrder: p.setOrder,
          kind: 'working',
          weight: p.weight,
          reps: p.reps,
          ...(p.row.notes ? { note: p.row.notes } : {}),
          ...(p.flags.length ? { importFlags: p.flags } : {}),
          loggedAt: startedAt + i * 60_000,
          date: ps.date,
        });
      });
      newSessions.push({
        id: ps.id,
        programSessionKey: `import:${ps.label}`,
        nameSnapshot: ps.label || 'Imported session',
        date: ps.date,
        startedAt,
        endedAt: startedAt + Math.max(0, ps.sets.length - 1) * 60_000,
        sealed: true,
        importKey: ps.importKey,
      });
      result.sessionsAdded++;
      result.setsAdded += ps.sets.length;
    }
    if (touched.size) await db.exercises.bulkPut([...touched.values()]);
    if (newSessions.length) await db.sessions.bulkAdd(newSessions);
    if (newSets.length) await db.sets.bulkAdd(newSets);
  });
  return result;
}

/** Shape check for an alias file: {aliases: {raw: canonical}}. Returns the map. */
export function readAliasFile(json: unknown): AliasMap {
  const a = (json as { aliases?: unknown })?.aliases;
  if (!a || typeof a !== 'object' || Array.isArray(a)) throw new Error('Alias file must be {"aliases": {"raw": "canonical"}}');
  const out: AliasMap = {};
  for (const [k, v] of Object.entries(a)) if (typeof v === 'string') out[k] = v;
  return out;
}
