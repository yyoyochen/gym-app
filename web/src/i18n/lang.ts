// The app's language: 'en' or 'zh' (Traditional Chinese, Taiwan). Until the
// lifter picks one (EN / 中文 in Settings or setup), the app follows the phone:
// a Chinese first preferred language opens in Chinese, anything else in
// English, checked at every launch and when the phone's language changes. A
// pick is kept in meta ('lang', exported with backups like the theme) with a
// localStorage mirror that index.html reads before first paint. Changing the
// language re-mounts the app (main.tsx), so every t() re-reads it.
import { useSyncExternalStore } from 'react';

export type Lang = 'en' | 'zh';
/** localStorage mirror of the lifter's own pick; absent means "follow the phone". */
export const LANG_CHOICE_KEY = 'gymbro.langChoice';
export const HTML_LANG: Record<Lang, string> = { en: 'en', zh: 'zh-Hant-TW' };

export const isLang = (v: unknown): v is Lang => v === 'en' || v === 'zh';
/** Any Chinese locale reads Chinese; everything else English. */
export const langFromLocale = (locale: string | undefined): Lang => (/^zh\b/i.test(locale ?? '') ? 'zh' : 'en');
/** The lifter's pick, else the phone's first preferred language. */
export const resolveLang = (choice: unknown, languages: readonly string[]): Lang => (isLang(choice) ? choice : langFromLocale(languages[0]));

/** The phone's languages, most preferred first. */
function phoneLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

function readChoice(): unknown {
  try { return localStorage.getItem(LANG_CHOICE_KEY); } catch { return null; }
}

let lang: Lang = 'en';
const subs = new Set<() => void>();

export function getLang(): Lang { return lang; }

export function applyLang(l: Lang): void {
  if (l === lang && typeof document !== 'undefined' && document.documentElement.lang === HTML_LANG[l]) return;
  lang = l;
  if (typeof document !== 'undefined') document.documentElement.lang = HTML_LANG[l];
  subs.forEach(f => f());
}

/** Call once at startup: the pick (or the phone) first, then the stored pick. */
export function initLang(): void {
  try { localStorage.removeItem('gymbro.lang'); } catch { /* 0.1.9 kept the phone's language as if picked */ }
  applyLang(resolveLang(readChoice(), phoneLanguages()));
  if (typeof window !== 'undefined') window.addEventListener('languagechange', () => { if (!isLang(readChoice())) applyLang(resolveLang(null, phoneLanguages())); });
  void syncLangFromDb();
}

/** Apply the stored pick (after start-up, a restore or an undo), keeping the mirror in step. */
export async function syncLangFromDb(): Promise<void> {
  try {
    // db is loaded lazily: app/dates.ts imports this file, and db must not come along with it.
    const { getDb, getMeta } = await import('../db');
    const v = await getMeta(getDb(), 'lang');
    if (!isLang(v)) return;
    try { localStorage.setItem(LANG_CHOICE_KEY, v); } catch { /* private mode */ }
    applyLang(v);
  } catch { /* no database yet */ }
}

/** The lifter picks a language: it wins over the phone from now on. */
export async function setLang(l: Lang): Promise<void> {
  try { localStorage.setItem(LANG_CHOICE_KEY, l); } catch { /* private mode */ }
  applyLang(l);
  const { getDb, setMeta } = await import('../db');
  await setMeta(getDb(), 'lang', l);
}

export function useLang(): { lang: Lang; setLang: (l: Lang) => Promise<void> } {
  const l = useSyncExternalStore(fn => { subs.add(fn); return () => { subs.delete(fn); }; }, getLang, () => 'en' as Lang);
  return { lang: l, setLang };
}
