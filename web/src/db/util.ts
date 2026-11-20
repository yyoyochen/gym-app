// Small helpers shared by db/ and import/. No dependencies, no clock reads
// except where a caller does not pass `now`.
import type { ISODate, Millis } from '../domain/types';

/** Local calendar date of an instant as YYYY-MM-DD (the device's timezone). */
export function localISODate(ms: Millis): ISODate {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== 'string' || !ISO_DATE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Noon UTC of a calendar date — a stable instant for rows that only have a date (imports). */
export function noonUTC(date: ISODate): Millis {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d, 12);
}

let counter = 0;
/** Random-enough unique id for locally created rows. */
export function newId(prefix: string): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    : Math.random().toString(36).slice(2, 12) + (counter++).toString(36);
  return `${prefix}_${rnd}`;
}

/** cyrb53-style 53-bit string hash, hex. Deterministic across platforms; not cryptographic. */
export function hashString(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

export { slugify, nameKey } from '../domain/catalog';
