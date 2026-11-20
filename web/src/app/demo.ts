// Demo mode (spec §7): the synthetic log, shifted so it ends 2 days ago, with
// a demo profile and the default template. meta.demoMode marks it so the
// banner shows and "Start my log" can wipe it.
import type { GymDb } from '../db';
import {
  addBodyweight, defaultProfile, getMeta, saveProfile, saveProgram, seedCatalog, setMeta, wipeAll,
} from '../db';
import type { ISODate, Millis, Profile } from '../domain/types';
import { EX } from '../domain/catalog';
import { DEFAULT_TEMPLATE_ID, programFromTemplate } from '../domain/templates';
import { parseCsv } from '../import/csv';
import { importNotionCsv, parseNotionDate, type NotionImportResult } from '../import/notion';
import { addDays, daysBetween, todayISO } from './dates';

export const DEMO_GAP_DAYS = 2;

const cell = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/**
 * Move every date in a Notion-format CSV by the same number of days so the
 * latest one lands on `lastDate`. Dates are rewritten as ISO; rows whose date
 * can't be read are left as they are. Pure.
 */
export function shiftCsvDates(csv: string, lastDate: ISODate): { csv: string; shiftDays: number; firstDate?: ISODate; lastDate?: ISODate } {
  const table = parseCsv(csv);
  if (!table.length) return { csv, shiftDays: 0 };
  const dateCol = table[0].findIndex(h => h.replace(/^﻿/, '').trim().toLowerCase() === 'date');
  if (dateCol < 0) throw new Error('CSV has no Date column');
  const parsed = table.slice(1).map(r => parseNotionDate(r[dateCol] ?? ''));
  const valid = parsed.filter((d): d is ISODate => !!d).sort();
  if (!valid.length) return { csv, shiftDays: 0 };
  const shiftDays = daysBetween(valid[valid.length - 1], lastDate);
  const out = [table[0].map(cell).join(',')];
  table.slice(1).forEach((r, i) => {
    const d = parsed[i];
    const row = r.slice();
    if (d) row[dateCol] = addDays(d, shiftDays);
    out.push(row.map(cell).join(','));
  });
  return { csv: out.join('\n') + '\n', shiftDays, firstDate: addDays(valid[0], shiftDays), lastDate };
}

export function demoProfile(today: ISODate): Profile {
  return {
    ...defaultProfile(),
    sex: 'M',
    birthYear: 1993,
    heightCm: 178,
    trainingAgeYears: 6,
    primaryGoal: 'maintain',
    goals: ['maintain', 'hypertrophy'],
    targets: [
      { id: 'demo-t1', subject: EX.squat, value: 120, type: 'hold', deadline: addDays(today, 84) },
      { id: 'demo-t2', subject: EX.bench, value: 85, type: 'reach', deadline: addDays(today, 84) },
      { id: 'demo-t3', subject: 'sessions_per_week', value: 3, type: 'at_least', deadline: addDays(today, 84) },
    ],
    checkpoints: [addDays(today, 28)],
    injuries: [],
  };
}

async function demoCsv(): Promise<string> {
  // Loaded on demand so the 60 KB fixture isn't in the main bundle.
  const mod = await import('../../../tools/synthetic/fixtures/demo-log.csv?raw');
  return mod.default;
}

/** Replace everything with the demo dataset. Returns the import result. */
export async function loadDemo(db: GymDb, now: Millis = Date.now(), csvText?: string): Promise<NotionImportResult> {
  const today = todayISO(now);
  const shifted = shiftCsvDates(csvText ?? (await demoCsv()), addDays(today, -DEMO_GAP_DAYS));
  await wipeAll(db);
  await seedCatalog(db);
  const result = await importNotionCsv(db, shifted.csv);
  await saveProfile(db, demoProfile(today), now);
  await saveProgram(db, programFromTemplate(DEFAULT_TEMPLATE_ID));
  for (const [ago, kg] of [[84, 81.2], [56, 80.6], [28, 80.1], [DEMO_GAP_DAYS, 79.8]] as const) {
    await addBodyweight(db, addDays(today, -ago), kg);
  }
  await setMeta(db, 'demoMode', true);
  return result;
}

export async function isDemo(db: GymDb): Promise<boolean> {
  return (await getMeta(db, 'demoMode')) === true;
}

/** "Start my log": wipe the demo. The caller then routes to onboarding. */
export async function exitDemo(db: GymDb): Promise<void> {
  await wipeAll(db);
}
