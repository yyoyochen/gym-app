// Theme resolution, pure. The preference is stored in meta ('theme'); the DOM
// side is useTheme.ts.
export type ThemePref = 'system' | 'dark' | 'light';
export type ResolvedTheme = 'dark' | 'light';

/** Paper colour per theme: used for <meta name="theme-color"> (status/nav bar). */
export const THEME_PAPER: Record<ResolvedTheme, string> = { dark: '#0e0e0e', light: '#fcd0af' };

export const DEFAULT_THEME: ThemePref = 'dark';

export function isThemePref(v: unknown): v is ThemePref {
  return v === 'system' || v === 'dark' || v === 'light';
}

/** Dark unless the user chose light, or chose system and the OS prefers light. */
export function resolveTheme(pref: unknown, systemPrefersLight: boolean): ResolvedTheme {
  const p = isThemePref(pref) ? pref : DEFAULT_THEME;
  if (p === 'system') return systemPrefersLight ? 'light' : 'dark';
  return p;
}
