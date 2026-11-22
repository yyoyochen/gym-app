// Theme resolution, pure. The preference is stored in meta ('theme'); the DOM
// side is useTheme.ts.
export type ThemePref = 'dark' | 'light';
export type ResolvedTheme = 'dark' | 'light';

/** Paper colour per theme: used for <meta name="theme-color"> (status/nav bar). */
export const THEME_PAPER: Record<ResolvedTheme, string> = { dark: '#1c1724', light: '#fcd0af' };

export const DEFAULT_THEME: ThemePref = 'dark';

export function isThemePref(v: unknown): v is ThemePref {
  return v === 'dark' || v === 'light';
}

/** Dark unless the user chose light. Anything else, including an old saved "system", is dark. */
export function resolveTheme(pref: unknown): ResolvedTheme {
  return isThemePref(pref) ? pref : DEFAULT_THEME;
}
