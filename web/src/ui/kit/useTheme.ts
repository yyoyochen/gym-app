// Theme: 'system' | 'dark' | 'light', stored in meta ('theme'). Applies
// data-theme on <html> (CSS does the rest, including prefers-color-scheme for
// 'system') and keeps <meta name="theme-color"> on the paper colour so the
// Android status/nav bars match. A localStorage mirror lets index.html set the
// attribute before first paint; IndexedDB stays the source of truth.
import { useSyncExternalStore } from 'react';
import { getDb, getMeta, setMeta } from '../../db';
import { DEFAULT_THEME, THEME_PAPER, isThemePref, resolveTheme, type ResolvedTheme, type ThemePref } from './theme';

export const THEME_CACHE_KEY = 'gymbro.theme';

let pref: ThemePref = DEFAULT_THEME;
const subs = new Set<() => void>();
let mq: MediaQueryList | null = null;

const systemLight = () => { try { return !!mq?.matches; } catch { return false; } };

export function applyTheme(p: ThemePref): ResolvedTheme {
  pref = p;
  const resolved = resolveTheme(p, systemLight());
  const html = document.documentElement;
  html.dataset.theme = p;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
  meta.content = THEME_PAPER[resolved];
  try { localStorage.setItem(THEME_CACHE_KEY, p); } catch { /* private mode */ }
  subs.forEach(f => f());
  return resolved;
}

/** Call once at startup: cached value first (no flash), then the stored one. */
export function initTheme(): void {
  try { mq = matchMedia('(prefers-color-scheme: light)'); mq.addEventListener('change', () => applyTheme(pref)); } catch { mq = null; }
  let cached: unknown = null;
  try { cached = localStorage.getItem(THEME_CACHE_KEY); } catch { /* none */ }
  applyTheme(isThemePref(cached) ? cached : DEFAULT_THEME);
  getMeta(getDb(), 'theme').then(v => { if (isThemePref(v) && v !== pref) applyTheme(v); }, () => {});
}

export async function setThemePref(p: ThemePref): Promise<void> {
  applyTheme(p);
  await setMeta(getDb(), 'theme', p);
}

const snapshot = () => `${pref}|${resolveTheme(pref, systemLight())}`;

export function useTheme(): { theme: ThemePref; resolved: ResolvedTheme; setTheme: (p: ThemePref) => Promise<void> } {
  const s = useSyncExternalStore(fn => { subs.add(fn); return () => { subs.delete(fn); }; }, snapshot, () => `${DEFAULT_THEME}|dark`);
  const [theme, resolved] = s.split('|') as [ThemePref, ResolvedTheme];
  return { theme, resolved, setTheme: setThemePref };
}
