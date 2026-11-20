// Typed repository API over the GymBro IndexedDB. Plain functions taking the
// db handle first, so tests can pass a fake-indexeddb instance and the UI can
// pass getDb(). Every multi-row write runs inside one Dexie transaction.
import Dexie from 'dexie';
import type {
  AppEvent, BodyweightEntry, Commit, EventType, Exercise, ISODate, Millis, Profile, Program,
  Readiness, Session, SetEntry,
} from '../domain/types';
import { defaultCatalog, nameKey } from '../domain/catalog';
import type { GymDb, ProfileRecord, StoredSet } from './schema';
import { isISODate, localISODate, newId } from './util';

// ---------------------------------------------------------------- errors

export class CommitExistsError extends Error {
  constructor(public sessionId: string) {
    super(`Session ${sessionId} already has a committed promise (commits are write-once)`);
    this.name = 'CommitExistsError';
  }
}

export class NotFoundError extends Error {
  constructor(what: string, id: string) {
    super(`${what} not found: ${id}`);
    this.name = 'NotFoundError';
  }
}

// ---------------------------------------------------------------- meta

export interface MetaValues {
  schemaVersion: number;
  lastExportAt: Millis;
  persistGranted: boolean;
  demoMode: boolean;
  benchmarkVersion: string;
  activeProgramId: string;
  lastRestoreAt: Millis;
}
export type MetaKey = keyof MetaValues;
/** Meta keys that describe this device/browser, never exported or restored. */
export const DEVICE_META_KEYS: MetaKey[] = ['persistGranted'];

export async function getMeta<K extends MetaKey>(db: GymDb, key: K): Promise<MetaValues[K] | undefined> {
  const row = await db.meta.get(key);
  return row?.value as MetaValues[K] | undefined;
}

export async function setMeta<K extends MetaKey>(db: GymDb, key: K, value: MetaValues[K]): Promise<void> {
  await db.meta.put({ key, value });
}

// ---------------------------------------------------------------- persistence

/**
 * Ask the browser to keep our storage (spec §6.1). Safe anywhere: returns
 * false when the Storage API is missing (tests, old browsers) or throws.
 * Records the answer in meta when a db is given.
 */
export async function requestPersist(db?: GymDb): Promise<boolean> {
  let granted = false;
  try {
    const nav = (globalThis as { navigator?: Navigator }).navigator;
    const storage = nav?.storage;
    if (storage && typeof storage.persist === 'function') {
      granted = (typeof storage.persisted === 'function' && (await storage.persisted())) || (await storage.persist());
    }
  } catch {
    granted = false;
  }
  if (db) await setMeta(db, 'persistGranted', granted);
  return granted;
}

// ---------------------------------------------------------------- profile

export function defaultProfile(): Profile {
  return {
    effortScale: 'rir',
    unit: 'kg',
    sessionsPerWeekTarget: 3,
    sessionsPerWeekMin: 2,
    injuries: [],
    manualMaxes: [],
    primaryGoal: 'maintain',
    goals: ['maintain'],
    targets: [],
    checkpoints: [],
    benchmarkPopulation: 'tested',
  };
}

export async function getProfile(db: GymDb): Promise<ProfileRecord | undefined> {
  return db.profile.get('me');
}

/** Save the profile; the previous version is appended to `history` with a timestamp. */
export async function saveProfile(db: GymDb, profile: Profile, now: Millis = Date.now()): Promise<ProfileRecord> {
  return db.transaction('rw', db.profile, async () => {
    const prev = await db.profile.get('me');
    const { id: _id, history: _h, ...clean } = profile as Partial<ProfileRecord> & Profile;
    void _id; void _h;
    const history = prev ? [...prev.history, { at: now, profile: stripRecord(prev) }] : [];
    const rec: ProfileRecord = { ...clean, id: 'me', history };
    await db.profile.put(rec);
    return rec;
  });
}

function stripRecord(r: ProfileRecord): Profile {
  const { id: _id, history: _h, ...p } = r;
  void _id; void _h;
  return p;
}

// ---------------------------------------------------------------- exercises

export async function listExercises(db: GymDb, opts: { includeArchived?: boolean } = {}): Promise<Exercise[]> {
  const all = await db.exercises.toArray();
  return (opts.includeArchived ? all : all.filter(e => !e.archived)).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getExercise(db: GymDb, id: string): Promise<Exercise | undefined> {
  return db.exercises.get(id);
}

export async function putExercise(db: GymDb, ex: Exercise): Promise<void> {
  await db.exercises.put(ex);
}

/** Look up by name or alias, case/punctuation-insensitive. */
export async function findExerciseByName(db: GymDb, name: string): Promise<Exercise | undefined> {
  const k = nameKey(name);
  const all = await db.exercises.toArray();
  return all.find(e => nameKey(e.name) === k) ?? all.find(e => e.aliases.some(a => nameKey(a) === k));
}

/** Insert the built-in catalog entries that are missing. Never overwrites user edits. */
export async function seedCatalog(db: GymDb): Promise<number> {
  return db.transaction('rw', db.exercises, async () => {
    const existing = new Set(await db.exercises.toCollection().primaryKeys());
    const missing = defaultCatalog().filter(e => !existing.has(e.id));
    if (missing.length) await db.exercises.bulkAdd(missing);
    return missing.length;
  });
}

// ---------------------------------------------------------------- program

export async function getActiveProgram(db: GymDb): Promise<Program | undefined> {
  const id = await getMeta(db, 'activeProgramId');
  if (id) return db.program.get(id);
  return db.program.toCollection().first();
}

export async function saveProgram(db: GymDb, program: Program, opts: { activate?: boolean } = { activate: true }): Promise<void> {
  await db.transaction('rw', db.program, db.meta, async () => {
    await db.program.put(program);
    if (opts.activate !== false) await setMeta(db, 'activeProgramId', program.id);
  });
}

// ---------------------------------------------------------------- sessions

export interface StartSessionInput {
  programSessionKey: string;
  nameSnapshot: string;
  readiness?: Readiness;
  note?: string;
  /** Logging a past session: pass its date explicitly. Otherwise the local date at `now`. */
  date?: ISODate;
  now?: Millis;
}

/** Create a session. Its date is pinned here and never derived from set times (no midnight split). */
export async function startSession(db: GymDb, input: StartSessionInput): Promise<Session> {
  const now = input.now ?? Date.now();
  const date = input.date ?? localISODate(now);
  if (!isISODate(date)) throw new Error(`Bad session date: ${date}`);
  const s: Session = {
    id: newId('ses'),
    programSessionKey: input.programSessionKey,
    nameSnapshot: input.nameSnapshot,
    date,
    startedAt: now,
    sealed: false,
    ...(input.readiness ? { readiness: input.readiness } : {}),
    ...(input.note ? { note: input.note } : {}),
  };
  await db.sessions.add(s);
  return s;
}

export async function getSession(db: GymDb, id: string): Promise<Session | undefined> {
  return db.sessions.get(id);
}

export async function sealSession(db: GymDb, id: string, now: Millis = Date.now()): Promise<Session> {
  return db.transaction('rw', db.sessions, async () => {
    const s = await db.sessions.get(id);
    if (!s) throw new NotFoundError('session', id);
    if (s.sealed) return s;
    const next = { ...s, sealed: true, endedAt: s.endedAt ?? now };
    await db.sessions.put(next);
    return next;
  });
}

export async function updateSession(
  db: GymDb, id: string, patch: Partial<Pick<Session, 'nameSnapshot' | 'note' | 'readiness'>>,
): Promise<Session> {
  return db.transaction('rw', db.sessions, async () => {
    const s = await db.sessions.get(id);
    if (!s) throw new NotFoundError('session', id);
    const next = { ...s, ...patch, ...(s.sealed ? { edited: true } : {}) };
    await db.sessions.put(next);
    return next;
  });
}

/** Move a session to another date (History → change date). Keeps its sets' denormalised date in step. */
export async function changeSessionDate(db: GymDb, id: string, date: ISODate): Promise<void> {
  if (!isISODate(date)) throw new Error(`Bad session date: ${date}`);
  await db.transaction('rw', db.sessions, db.sets, async () => {
    const s = await db.sessions.get(id);
    if (!s) throw new NotFoundError('session', id);
    await db.sessions.put({ ...s, date, ...(s.sealed ? { edited: true } : {}) });
    await db.sets.where('sessionId').equals(id).modify({ date });
  });
}

/** Delete a session with its sets and commit. */
export async function deleteSession(db: GymDb, id: string): Promise<void> {
  await db.transaction('rw', db.sessions, db.sets, db.commits, async () => {
    await db.sets.where('sessionId').equals(id).delete();
    await db.commits.delete(id);
    await db.sessions.delete(id);
  });
}

/** Sessions with from ≤ date ≤ to (inclusive ISO dates), oldest first. */
export async function listSessions(db: GymDb, range: { from?: ISODate; to?: ISODate } = {}): Promise<Session[]> {
  const from = range.from ?? '0000-01-01';
  const to = range.to ?? '9999-12-31';
  const rows = await db.sessions.where('date').between(from, to, true, true).toArray();
  return rows.sort((a, b) => (a.date === b.date ? a.startedAt - b.startedAt : a.date < b.date ? -1 : 1));
}

/** The in-progress session (unsealed), most recently started. */
export async function getOpenSession(db: GymDb): Promise<Session | undefined> {
  const open = await db.sessions.filter(s => !s.sealed).toArray();
  return open.sort((a, b) => b.startedAt - a.startedAt)[0];
}

/** Most recent session by date, then start time. */
export async function getLastSession(db: GymDb): Promise<Session | undefined> {
  const all = await listSessions(db);
  return all[all.length - 1];
}

// ---------------------------------------------------------------- commits (write-once)

/** Freeze a session's promise. A second commit for the same session throws CommitExistsError. */
export async function putCommit(db: GymDb, commit: Commit): Promise<void> {
  await db.transaction('rw', db.commits, db.sessions, async () => {
    if (!(await db.sessions.get(commit.sessionId))) throw new NotFoundError('session', commit.sessionId);
    if (await db.commits.get(commit.sessionId)) throw new CommitExistsError(commit.sessionId);
    try {
      await db.commits.add(commit);
    } catch (e) {
      if (e instanceof Dexie.ConstraintError) throw new CommitExistsError(commit.sessionId);
      throw e;
    }
  });
}

export async function getCommit(db: GymDb, sessionId: string): Promise<Commit | undefined> {
  return db.commits.get(sessionId);
}

// ---------------------------------------------------------------- sets

export type NewSet = Omit<SetEntry, 'id' | 'setOrder' | 'loggedAt'> & { loggedAt?: Millis };

/**
 * Log a set. setOrder = max(setOrder in this session's slot) + 1, computed inside
 * the write transaction so two quick taps can't collide (old COUNT(*) bug).
 */
export async function addSet(db: GymDb, input: NewSet): Promise<SetEntry> {
  return db.transaction('rw', db.sessions, db.sets, async () => {
    const s = await db.sessions.get(input.sessionId);
    if (!s) throw new NotFoundError('session', input.sessionId);
    const inSlot = await db.sets.where('[sessionId+slotOrder]').equals([input.sessionId, input.slotOrder]).toArray();
    const setOrder = inSlot.reduce((m, x) => Math.max(m, x.setOrder), 0) + 1;
    const row: StoredSet = {
      ...input,
      id: newId('set'),
      setOrder,
      loggedAt: input.loggedAt ?? Date.now(),
      date: s.date,
    };
    await db.sets.add(row);
    if (s.sealed && !s.edited) await db.sessions.put({ ...s, edited: true });
    return toSetEntry(row);
  });
}

export type SetPatch = Partial<Omit<SetEntry, 'id' | 'sessionId' | 'setOrder' | 'slotOrder'>>;

export async function updateSet(db: GymDb, id: string, patch: SetPatch): Promise<SetEntry> {
  return db.transaction('rw', db.sessions, db.sets, async () => {
    const cur = await db.sets.get(id);
    if (!cur) throw new NotFoundError('set', id);
    const next: StoredSet = {
      ...cur, ...patch,
      id: cur.id, sessionId: cur.sessionId, slotOrder: cur.slotOrder, setOrder: cur.setOrder, date: cur.date,
    };
    for (const k of Object.keys(next) as (keyof StoredSet)[]) if (next[k] === undefined) delete next[k];
    await db.sets.put(next);
    await markEdited(db, cur.sessionId);
    return toSetEntry(next);
  });
}

export async function deleteSet(db: GymDb, id: string): Promise<void> {
  await db.transaction('rw', db.sessions, db.sets, async () => {
    const cur = await db.sets.get(id);
    if (!cur) return;
    await db.sets.delete(id);
    await markEdited(db, cur.sessionId);
  });
}

async function markEdited(db: GymDb, sessionId: string) {
  const s = await db.sessions.get(sessionId);
  if (s?.sealed && !s.edited) await db.sessions.put({ ...s, edited: true });
}

export function sortSets<T extends SetEntry>(sets: T[]): T[] {
  return sets.sort((a, b) => a.slotOrder - b.slotOrder || a.setOrder - b.setOrder || a.loggedAt - b.loggedAt);
}

export async function getSessionSets(db: GymDb, sessionId: string): Promise<SetEntry[]> {
  return sortSets(await db.sets.where('sessionId').equals(sessionId).toArray()).map(toSetEntry);
}

export interface ExerciseDay { session: Session; sets: SetEntry[] }

/**
 * History of one exercise, newest session first. `before` is exclusive, so a
 * day's plan can be built only from days before it (spec §2.2).
 */
export async function getExerciseHistory(
  db: GymDb, exerciseId: string, opts: { before?: ISODate; from?: ISODate; limit?: number } = {},
): Promise<ExerciseDay[]> {
  const lo: [string, string] = [exerciseId, opts.from ?? '0000-01-01'];
  const hi: [string, string] = [exerciseId, opts.before ?? '9999-12-32'];
  const rows = await db.sets.where('[exerciseId+date]').between(lo, hi, true, false).toArray();
  const bySession = new Map<string, StoredSet[]>();
  for (const r of rows) {
    const list = bySession.get(r.sessionId);
    if (list) list.push(r); else bySession.set(r.sessionId, [r]);
  }
  const sessions = (await db.sessions.bulkGet([...bySession.keys()])).filter((s): s is Session => !!s);
  sessions.sort((a, b) => (a.date === b.date ? b.startedAt - a.startedAt : a.date < b.date ? 1 : -1));
  const days = sessions.map(session => ({ session, sets: sortSets(bySession.get(session.id)!).map(toSetEntry) }));
  return opts.limit ? days.slice(0, opts.limit) : days;
}

/** All sets in a date range (inclusive), for heatmap/volume screens. */
export async function listSetsByDate(db: GymDb, range: { from?: ISODate; to?: ISODate } = {}): Promise<StoredSet[]> {
  return db.sets.where('date').between(range.from ?? '0000-01-01', range.to ?? '9999-12-31', true, true).toArray();
}

function toSetEntry(r: StoredSet): SetEntry {
  const { date: _d, ...s } = r;
  void _d;
  return s;
}

// ---------------------------------------------------------------- bodyweight & events

export async function addBodyweight(db: GymDb, date: ISODate, kg: number): Promise<BodyweightEntry> {
  if (!isISODate(date)) throw new Error(`Bad date: ${date}`);
  const e = { id: newId('bw'), date, kg };
  await db.bodyweight.add(e);
  return e;
}

export async function listBodyweight(db: GymDb, range: { from?: ISODate; to?: ISODate } = {}): Promise<BodyweightEntry[]> {
  return db.bodyweight.where('date').between(range.from ?? '0000-01-01', range.to ?? '9999-12-31', true, true).sortBy('date');
}

export async function deleteBodyweight(db: GymDb, id: string): Promise<void> {
  await db.bodyweight.delete(id);
}

export async function logEvent(db: GymDb, date: ISODate, type: EventType, data?: unknown): Promise<AppEvent> {
  const e: AppEvent = { id: newId('evt'), date, type, ...(data !== undefined ? { data } : {}) };
  await db.events.add(e);
  return e;
}

export async function listEvents(
  db: GymDb, opts: { from?: ISODate; to?: ISODate; type?: EventType } = {},
): Promise<AppEvent[]> {
  const rows = await db.events.where('date').between(opts.from ?? '0000-01-01', opts.to ?? '9999-12-31', true, true).sortBy('date');
  return opts.type ? rows.filter(e => e.type === opts.type) : rows;
}
