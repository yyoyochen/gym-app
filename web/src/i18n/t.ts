// t(): every word a lifter reads. The key is the English text itself; the
// Chinese comes from zh/*.ts. Values go in {name} placeholders. Keys must be
// literal strings (tools/check-i18n.mjs and i18n/keys.test.ts read them).
import { getLang } from './lang';
import { ZH, ZH_NAMES } from './zh';

export type Vars = Record<string, string | number>;

export function fill(s: string, vars?: Vars): string {
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

/** The text in the app's language (English when a Chinese entry is missing). */
export function t(en: string, vars?: Vars): string {
  return fill(getLang() === 'zh' ? ZH[en] ?? en : en, vars);
}

/** A stored name (a built-in lift, a template session): translated when known, else as typed. */
export function tn(name: string): string {
  if (getLang() !== 'zh') return name;
  return ZH_NAMES[name] ?? ZH[name] ?? name;
}
