// Test-only helpers: a fresh, isolated fake IndexedDB per test.
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { openDb, type GymDb, type Migration } from './schema';

let n = 0;
export function freshDb(opts: { upToVersion?: number; migrations?: Migration[] } = {}): GymDb {
  return openDb(`gymbro-test-${n++}`, {
    indexedDB: new IDBFactory(),
    IDBKeyRange: IDBKeyRange as unknown as typeof globalThis.IDBKeyRange,
    ...opts,
  });
}
