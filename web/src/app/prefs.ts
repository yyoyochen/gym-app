// Small app preferences kept in the meta store (exported with backups).
// TODO(data layer): add `plates` to MetaValues in db/repo.ts so getMeta/setMeta type it.
import type { GymDb } from '../db';

export interface PlateSettings {
  barKg: number;
  /** Plates available, kg, one pair each size at least. */
  platesKg: number[];
}

export const STANDARD_PLATES = [25, 20, 15, 10, 5, 2.5, 2, 1.25, 1, 0.5];
export const DEFAULT_PLATES: PlateSettings = { barKg: 20, platesKg: [25, 20, 15, 10, 5, 2.5, 1.25] };

export async function getPlateSettings(db: GymDb): Promise<PlateSettings> {
  const row = await db.meta.get('plates');
  const v = row?.value as Partial<PlateSettings> | undefined;
  if (!v || typeof v.barKg !== 'number' || !Array.isArray(v.platesKg)) return { ...DEFAULT_PLATES };
  return { barKg: v.barKg, platesKg: v.platesKg.filter(p => typeof p === 'number').sort((a, b) => b - a) };
}

export async function savePlateSettings(db: GymDb, s: PlateSettings): Promise<void> {
  await db.meta.put({ key: 'plates', value: { barKg: s.barKg, platesKg: [...s.platesKg].sort((a, b) => b - a) } });
}
