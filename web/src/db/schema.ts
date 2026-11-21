// IndexedDB schema for GymBro (docs/PWA-SPEC.md §6.2), via Dexie 4.
// Explicit versioning: every schema change appends an entry to MIGRATIONS with
// the full store spec for that version and an optional upgrade function.
// Never edit a released entry; add a new one.
import Dexie, { type EntityTable, type Transaction } from 'dexie';
import type {
  AppEvent, BodyweightEntry, Commit, Exercise, ISODate, Millis, Profile, Program, Session, SetEntry,
} from '../domain/types';

export const DB_NAME = 'gymbro';

/** Profile is a single record ('me') with a dated change history. Goals live in profile.targets. */
export interface ProfileRecord extends Profile {
  id: 'me';
  history: { at: Millis; profile: Profile }[];
}

/** A set as stored: the session date is denormalised onto the row for the exerciseId+date index. */
export interface StoredSet extends SetEntry {
  date: ISODate;
}

export interface MetaRow { key: string; value: unknown }

/** Undo copy kept by restore (one row, key 'lastRestore'). Not exported, not restored. */
export interface UndoRow { key: 'lastRestore'; savedAt: Millis; snapshot: unknown }

export type GymDb = Dexie & {
  profile: EntityTable<ProfileRecord, 'id'>;
  exercises: EntityTable<Exercise, 'id'>;
  program: EntityTable<Program, 'id'>;
  sessions: EntityTable<Session, 'id'>;
  commits: EntityTable<Commit, 'sessionId'>;
  sets: EntityTable<StoredSet, 'id'>;
  bodyweight: EntityTable<BodyweightEntry, 'id'>;
  events: EntityTable<AppEvent, 'id'>;
  meta: EntityTable<MetaRow, 'key'>;
  undo: EntityTable<UndoRow, 'key'>;
};

/** Stores that make up the user's data (exported / restored). `undo` is deliberately excluded. */
export const DATA_STORES = [
  'profile', 'exercises', 'program', 'sessions', 'commits', 'sets', 'bodyweight', 'events', 'meta',
] as const;
export type DataStore = (typeof DATA_STORES)[number];

export interface Migration {
  version: number;
  stores: Record<string, string>;
  upgrade?: (tx: Transaction) => PromiseLike<unknown> | void;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    stores: {
      profile: 'id',
      exercises: 'id, name, *aliases',
      program: 'id',
      sessions: 'id, date, startedAt, importKey, sealed',
      commits: 'sessionId',
      sets: 'id, sessionId, [sessionId+slotOrder], exerciseId, [exerciseId+date], date',
      bodyweight: 'id, date',
      events: 'id, date, type',
      meta: 'key',
      undo: 'key',
    },
  },
  {
    // Gym-goer strength standards became the default benchmark (docs/DECISIONS.md).
    version: 2,
    stores: {},
    upgrade: tx => tx.table('profile').toCollection().modify((p: ProfileRecord) => {
      p.benchmarkPopulation = upgradedPopulation(p);
    }),
  },
];

/**
 * Schema 2: benchmarkPopulation gains 'gym', the new default. A 'tested' value
 * that was never changed (no saved version had anything else) is the old
 * default, so it becomes 'gym'. A choice the user made ('all', or switching
 * back to 'tested') is kept. Used by the IndexedDB upgrade and by backup migration.
 */
export function upgradedPopulation(p: { benchmarkPopulation?: string; history?: { profile?: { benchmarkPopulation?: string } }[] }): Profile['benchmarkPopulation'] {
  const cur = p.benchmarkPopulation;
  if (cur === 'gym' || cur === 'all') return cur;
  const touched = (p.history ?? []).some(h => (h.profile?.benchmarkPopulation ?? 'tested') !== 'tested');
  return cur === 'tested' && touched ? 'tested' : 'gym';
}

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

export interface OpenOptions {
  /** Inject an IndexedDB implementation (fake-indexeddb in tests). */
  indexedDB?: IDBFactory;
  IDBKeyRange?: typeof IDBKeyRange;
  /** For tests: apply only migrations up to this version. */
  upToVersion?: number;
  migrations?: Migration[];
}

export function openDb(name: string = DB_NAME, opts: OpenOptions = {}): GymDb {
  const db = new Dexie(name, {
    ...(opts.indexedDB ? { indexedDB: opts.indexedDB } : {}),
    ...(opts.IDBKeyRange ? { IDBKeyRange: opts.IDBKeyRange } : {}),
  }) as GymDb;
  const migs = (opts.migrations ?? MIGRATIONS).filter(m => m.version <= (opts.upToVersion ?? Infinity));
  for (const m of migs) {
    const v = db.version(m.version).stores(m.stores);
    if (m.upgrade) v.upgrade(m.upgrade);
  }
  return db;
}

let singleton: GymDb | null = null;
/** The app's shared database handle. */
export function getDb(): GymDb {
  return (singleton ??= openDb());
}
