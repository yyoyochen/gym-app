// Export / restore (docs/PWA-SPEC.md §6.3, format in docs/FORMAT.md).
// Export = one JSON document holding every data store. Restore = validate →
// keep an undo copy → replace everything in one transaction.
import type {
  AppEvent, BodyweightEntry, Commit, Exercise, Millis, Program, Session,
} from '../domain/types';
import { DATA_STORES, SCHEMA_VERSION, type GymDb, type MetaRow, type ProfileRecord, type StoredSet } from './schema';
import { DEVICE_META_KEYS, logEvent, setMeta, sortSets } from './repo';
import { isISODate, localISODate } from './util';

export const EXPORT_FORMAT = 'gymbro-backup';

export interface ExportDoc {
  format: typeof EXPORT_FORMAT;
  schemaVersion: number;
  /** ISO 8601 instant (UTC). */
  exportedAt: string;
  profile: ProfileRecord[];
  exercises: Exercise[];
  program: Program[];
  sessions: Session[];
  commits: Commit[];
  sets: StoredSet[];
  bodyweight: BodyweightEntry[];
  events: AppEvent[];
  meta: MetaRow[];
}

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

async function snapshot(db: GymDb): Promise<Omit<ExportDoc, 'format' | 'schemaVersion' | 'exportedAt'>> {
  const [profile, exercises, program, sessions, commits, sets, bodyweight, events, meta] = await Promise.all([
    db.profile.toArray(), db.exercises.toArray(), db.program.toArray(), db.sessions.toArray(),
    db.commits.toArray(), db.sets.toArray(), db.bodyweight.toArray(), db.events.toArray(), db.meta.toArray(),
  ]);
  return {
    profile,
    exercises: exercises.sort(byId),
    program: program.sort(byId),
    sessions: sessions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.startedAt - b.startedAt || byId(a, b))),
    commits: commits.sort((a, b) => (a.sessionId < b.sessionId ? -1 : 1)),
    sets: sets.sort((a, b) => (a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0) || a.slotOrder - b.slotOrder || a.setOrder - b.setOrder || byId(a, b)),
    bodyweight: bodyweight.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : byId(a, b))),
    events: events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : byId(a, b))),
    meta: meta.filter(m => !DEVICE_META_KEYS.includes(m.key as never)).sort((a, b) => (a.key < b.key ? -1 : 1)),
  };
}

/** Read-only: the full backup document. Doesn't touch the db. */
export async function exportAll(db: GymDb, now: Millis = Date.now()): Promise<ExportDoc> {
  return db.transaction('r', DATA_STORES.map(s => db.table(s)), async () => ({
    format: EXPORT_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date(now).toISOString(),
    ...(await snapshot(db)),
  }));
}

/** Export for the user's download: the JSON text, then record lastExportAt + an 'export' event. */
export async function exportBackupJson(db: GymDb, now: Millis = Date.now()): Promise<string> {
  const doc = await exportAll(db, now);
  await setMeta(db, 'lastExportAt', now);
  await logEvent(db, localISODate(now), 'export', { kind: 'json' });
  return JSON.stringify(doc, null, 1);
}

// ---------------------------------------------------------------- validation & migration

export interface ValidationResult { ok: boolean; errors: string[] }

/**
 * Upgrade an older export to the current schema. Add a case per schema bump;
 * each step takes version n to n+1.
 */
export function migrateExport(doc: ExportDoc): ExportDoc {
  let d = doc;
  while (d.schemaVersion < SCHEMA_VERSION) {
    switch (d.schemaVersion) {
      // case 1: d = { ...d, schemaVersion: 2, ... }; break;
      default:
        throw new Error(`No migration from backup schema ${d.schemaVersion}`);
    }
  }
  return d;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === 'string' && x.length > 0;

export function validateExport(input: unknown): ValidationResult {
  const errors: string[] = [];
  const err = (m: string) => { if (errors.length < 50) errors.push(m); };
  if (!isObj(input)) return { ok: false, errors: ['Not a JSON object'] };
  if (input.format !== EXPORT_FORMAT) err(`format must be "${EXPORT_FORMAT}"`);
  if (!Number.isInteger(input.schemaVersion) || (input.schemaVersion as number) < 1) err('schemaVersion must be a positive integer');
  else if ((input.schemaVersion as number) > SCHEMA_VERSION) err(`Backup is from a newer app (schema ${input.schemaVersion} > ${SCHEMA_VERSION})`);
  for (const s of DATA_STORES) if (!Array.isArray(input[s])) err(`${s} must be an array`);
  if (errors.length) return { ok: false, errors };

  const d = input as unknown as ExportDoc;
  const uniq = (store: string, keys: string[]) => {
    const seen = new Set<string>();
    for (const k of keys) { if (seen.has(k)) err(`${store}: duplicate key ${k}`); seen.add(k); }
  };
  if (d.profile.length > 1 || d.profile.some(p => !isObj(p) || p.id !== 'me')) err('profile must hold at most one record with id "me"');
  d.exercises.forEach((e, i) => { if (!isObj(e) || !isStr(e.id) || !isStr(e.name) || !Array.isArray(e.aliases) || !isNum(e.increment)) err(`exercises[${i}] is malformed`); });
  d.program.forEach((p, i) => { if (!isObj(p) || !isStr(p.id) || !Array.isArray(p.sessions)) err(`program[${i}] is malformed`); });
  d.sessions.forEach((s, i) => {
    if (!isObj(s) || !isStr(s.id) || !isISODate(s.date) || !isNum(s.startedAt) || typeof s.sealed !== 'boolean') err(`sessions[${i}] is malformed`);
  });
  const sessionIds = new Set(d.sessions.map(s => s?.id));
  d.sets.forEach((x, i) => {
    if (!isObj(x) || !isStr(x.id) || !isStr(x.exerciseId) || !isNum(x.weight) || !isNum(x.reps) || !isNum(x.slotOrder) || !isNum(x.setOrder) || !isISODate(x.date)) err(`sets[${i}] is malformed`);
    else if (!sessionIds.has(x.sessionId)) err(`sets[${i}] references missing session ${x.sessionId}`);
  });
  d.commits.forEach((c, i) => {
    if (!isObj(c) || !isStr(c.sessionId) || !Array.isArray(c.targets)) err(`commits[${i}] is malformed`);
    else if (!sessionIds.has(c.sessionId)) err(`commits[${i}] references missing session ${c.sessionId}`);
  });
  d.bodyweight.forEach((b, i) => { if (!isObj(b) || !isStr(b.id) || !isISODate(b.date) || !isNum(b.kg)) err(`bodyweight[${i}] is malformed`); });
  d.events.forEach((e, i) => { if (!isObj(e) || !isStr(e.id) || !isISODate(e.date) || !isStr(e.type)) err(`events[${i}] is malformed`); });
  d.meta.forEach((m, i) => { if (!isObj(m) || !isStr(m.key)) err(`meta[${i}] is malformed`); });
  if (!errors.length) {
    uniq('exercises', d.exercises.map(e => e.id));
    uniq('program', d.program.map(p => p.id));
    uniq('sessions', d.sessions.map(s => s.id));
    uniq('sets', d.sets.map(s => s.id));
    uniq('commits', d.commits.map(c => c.sessionId));
    uniq('bodyweight', d.bodyweight.map(b => b.id));
    uniq('events', d.events.map(e => e.id));
    uniq('meta', d.meta.map(m => m.key));
  }
  return { ok: errors.length === 0, errors };
}

export class RestoreError extends Error {
  constructor(public errors: string[]) {
    super(`Backup rejected: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '…' : ''}`);
    this.name = 'RestoreError';
  }
}

// ---------------------------------------------------------------- restore & undo

async function replaceAll(db: GymDb, data: Omit<ExportDoc, 'format' | 'schemaVersion' | 'exportedAt'>) {
  // Device-specific meta survives a restore.
  const keep = await db.meta.where('key').anyOf(DEVICE_META_KEYS as string[]).toArray();
  for (const s of DATA_STORES) await db.table(s).clear();
  await db.profile.bulkAdd(data.profile);
  await db.exercises.bulkAdd(data.exercises);
  await db.program.bulkAdd(data.program);
  await db.sessions.bulkAdd(data.sessions);
  await db.commits.bulkAdd(data.commits);
  await db.sets.bulkAdd(data.sets);
  await db.bodyweight.bulkAdd(data.bodyweight);
  await db.events.bulkAdd(data.events);
  await db.meta.bulkAdd(data.meta.filter(m => !DEVICE_META_KEYS.includes(m.key as never)));
  if (keep.length) await db.meta.bulkPut(keep);
}

/**
 * Replace all data with a backup. Accepts the parsed object or JSON text.
 * Throws RestoreError (and changes nothing) if it doesn't validate. The data
 * that was there before is kept as an undo copy until the next restore.
 */
export async function restoreBackup(db: GymDb, input: unknown, now: Millis = Date.now()): Promise<void> {
  let parsed = input;
  if (typeof input === 'string') {
    try { parsed = JSON.parse(input); } catch { throw new RestoreError(['Not valid JSON']); }
  }
  const v = validateExport(parsed);
  if (!v.ok) throw new RestoreError(v.errors);
  const doc = migrateExport(parsed as ExportDoc);
  await db.transaction('rw', [...DATA_STORES.map(s => db.table(s)), db.undo], async () => {
    const before = await snapshot(db);
    await db.undo.put({ key: 'lastRestore', savedAt: now, snapshot: { schemaVersion: SCHEMA_VERSION, ...before } });
    await replaceAll(db, doc);
    await db.meta.put({ key: 'lastRestoreAt', value: now });
  });
}

export async function hasUndo(db: GymDb): Promise<boolean> {
  return (await db.undo.get('lastRestore')) !== undefined;
}

/** Put back the data from before the last restore. Throws if there's nothing to undo. */
export async function undoLastRestore(db: GymDb): Promise<void> {
  await db.transaction('rw', [...DATA_STORES.map(s => db.table(s)), db.undo], async () => {
    const row = await db.undo.get('lastRestore');
    if (!row) throw new Error('Nothing to undo');
    await replaceAll(db, row.snapshot as ExportDoc);
    await db.undo.delete('lastRestore');
  });
}

/** Wipe every data store (and the undo copy). Used by "Start my log" and tests. */
export async function wipeAll(db: GymDb): Promise<void> {
  await db.transaction('rw', [...DATA_STORES.map(s => db.table(s)), db.undo], async () => {
    for (const s of DATA_STORES) await db.table(s).clear();
    await db.undo.clear();
  });
}

// ---------------------------------------------------------------- CSV (one row per set)

export const CSV_COLUMNS = [
  'date', 'session', 'session_key', 'exercise', 'exercise_id', 'slot', 'set', 'kind',
  'weight_kg', 'reps', 'rir', 'failed', 'pain_area', 'pain_side', 'pain_severity', 'note', 'logged_at',
] as const;

function csvCell(v: unknown): string {
  if (v === undefined || v === null) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Every set as a CSV row, oldest session first, for spreadsheets. */
export async function exportSetsCsv(db: GymDb): Promise<string> {
  const [sessions, sets] = await Promise.all([db.sessions.toArray(), db.sets.toArray()]);
  const sMap = new Map(sessions.map(s => [s.id, s]));
  const rows = sortSets(sets).sort((a, b) => {
    const sa = sMap.get(a.sessionId), sb = sMap.get(b.sessionId);
    return (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || ((sa?.startedAt ?? 0) - (sb?.startedAt ?? 0)) || (a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0) || a.slotOrder - b.slotOrder || a.setOrder - b.setOrder;
  });
  const lines = [CSV_COLUMNS.join(',')];
  for (const x of rows) {
    const s = sMap.get(x.sessionId);
    lines.push([
      x.date, s?.nameSnapshot, s?.programSessionKey, x.exerciseNameSnapshot, x.exerciseId, x.slotOrder, x.setOrder, x.kind,
      x.weight, x.reps, x.rir, x.failed ? 'true' : '', x.pain?.area, x.pain?.side, x.pain?.severity, x.note,
      new Date(x.loggedAt).toISOString(),
    ].map(csvCell).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}
