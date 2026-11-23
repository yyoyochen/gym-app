// The app's language: 'en' or 'zh' (Traditional Chinese, Taiwan). Stored in
// meta ('lang', exported with backups like the theme) with a localStorage
// mirror that index.html reads before first paint. With nothing stored yet,
// the phone's language decides. Changing it re-mounts the app (main.tsx), so
// every t() call re-reads the language.
import { useSyncExternalStore } from 'react';

export type Lang = 'en' | 'zh';
export const LANG_CACHE_KEY = 'gymbro.lang';
export const HTML_LANG: Record<Lang, string> = { en: 'en', zh: 'zh-Hant-TW' };

export const isLang = (v: unknown): v is Lang => v === 'en' || v === 'zh';
/** Any Chinese locale reads Chinese; everything else English. */
export const langFromLocale = (locale: string | undefined): Lang => (/^zh\b/i.test(locale ?? '') ? 'zh' : 'en');

let lang: Lang = 'en';
const subs = new Set<() => void>();

export function getLang(): Lang { return lang; }

export function applyLang(l: Lang): void {
  lang = l;
  if (typeof document !== 'undefined') document.documentElement.lang = HTML_LANG[l];
  try { localStorage.setItem(LANG_CACHE_KEY, l); } catch { /* private mode or tests */ }
  subs.forEach(f => f());
}

/** Call once at startup: cached value (or the phone's language) first, then the stored one. */
export function initLang(): void {
  let cached: unknown = null;
  try { cached = localStorage.getItem(LANG_CACHE_KEY); } catch { /* none */ }
  applyLang(isLang(cached) ? cached : langFromLocale(typeof navigator === 'undefined' ? undefined : navigator.language));
  // db is loaded lazily: app/dates.ts imports this file, and db must not come along with it.
  void syncLangFromDb();
}

/** Apply the stored language (after start-up, a restore or an undo), keeping the mirror in step. */
export async function syncLangFromDb(): Promise<void> {
  try {
    const { getDb, getMeta } = await import('../db');
    const v = await getMeta(getDb(), 'lang');
    if (isLang(v) && v !== lang) applyLang(v);
  } catch { /* no database yet */ }
}

export async function setLang(l: Lang): Promise<void> {
  applyLang(l);
  const { getDb, setMeta } = await import('../db');
  await setMeta(getDb(), 'lang', l);
}

export function useLang(): { lang: Lang; setLang: (l: Lang) => Promise<void> } {
  const l = useSyncExternalStore(fn => { subs.add(fn); return () => { subs.delete(fn); }; }, getLang, () => 'en' as Lang);
  return { lang: l, setLang };
}
