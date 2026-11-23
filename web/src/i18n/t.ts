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

const MINIMUM = ' (minimum)';

/** A stored name the app made (a built-in lift, a template session, "Session B",
 *  "… (minimum)") in the app's language. Anything else is a name the lifter typed
 *  and shows exactly as typed, even when it happens to be a UI word ("Back"). */
export function tn(name: string): string {
  if (getLang() !== 'zh') return name;
  const known = ZH_NAMES[name];
  if (known) return known;
  const key = /^Session (\S{1,8})$/.exec(name);
  if (key) return t('Session {key}', { key: key[1] });
  if (name.endsWith(MINIMUM)) {
    const base = name.slice(0, -MINIMUM.length);
    const inner = tn(base);
    if (inner !== base) return t('{name} (minimum)', { name: inner });
  }
  return name;
}
