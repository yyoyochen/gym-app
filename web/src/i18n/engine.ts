// te(): the engine's sentences in the app's language. The engine writes
// English (pinned by the Python parity fixtures, and saved into commits), so
// sentences are translated when shown: each English template in zh/engine.ts
// becomes a pattern, values are carried across unchanged, and a value that is
// itself words ("double", a nested sentence) is translated the same way. A
// sentence no template matches is shown as it is.
import { getLang } from './lang';
import { ZH, ZH_ENGINE, ZH_NAMES } from './zh';

interface Rule { re: RegExp; keys: string[]; zh: string }
export interface Table { rules: Rule[]; words: Record<string, string> }

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Same light clean-up readable() does: "100 x 5" → "100 × 5", "[8, 8]" → "8, 8". */
export function normalize(s: string): string {
  return s
    .replace(/\[(\d+(?:\.\d+)?(?:, \d+(?:\.\d+)?)*)\]/g, '$1')
    .replace(/(\d(?:kg)?)\s?x\s?(\d)/g, '$1 × $2');
}

export function compileTable(entries: Record<string, string>, words: Record<string, string> = {}): Table {
  const rules: Rule[] = [];
  const plain: Record<string, string> = { ...words };
  for (const [en, zh] of Object.entries(entries)) {
    const keys: string[] = [];
    const body = esc(normalize(en).replace(/(\}(?:kg)?)\s?x\s?(\{)/g, '$1 × $2')).replace(/\\\{(\w+)\\\}/g, (_m, k: string) => { keys.push(k); return '(.+?)'; });
    if (!keys.length) { plain[normalize(en)] = zh; continue; }
    rules.push({ re: new RegExp(`^${body}$`), keys, zh });
  }
  // Most specific first: more literal text wins over a looser template.
  const literal = (r: Rule) => r.re.source.replace(/\(\.\+\?\)/g, '').length;
  rules.sort((a, b) => literal(b) - literal(a));
  return { rules, words: plain };
}

/** Values with no words in them (numbers, kg, ×, RPE 8) pass straight through. */
const NO_WORDS = /^[^A-Za-z]*(?:(?:kg|RPE|RIR|e1RM|PR|1RM)[^A-Za-z]*)*$/;

export function translateWith(table: Table, input: string, depth = 0): string {
  const s = normalize(input);
  if (s in table.words) return table.words[s];
  if (NO_WORDS.test(s) || depth > 6) return s;
  // The most literal template that matches wins, unless one of its values would
  // stay in English (it swallowed a piece another template owns): then the next
  // match is tried, and the first match is the fallback.
  let fallback: string | null = null;
  for (const r of table.rules) {
    const m = r.re.exec(s);
    if (!m) continue;
    let clean = true;
    const out = r.zh.replace(/\{(\w+)\}/g, (all, k: string) => {
      const i = r.keys.indexOf(k);
      if (i < 0) return all;
      const v = translateWith(table, m[i + 1], depth + 1);
      if (hasEnglish(v)) clean = false;
      return v;
    });
    if (clean) return out;
    fallback ??= out;
  }
  return fallback ?? s;
}

/** Words left in English, ignoring the ones that stay in Latin letters. */
export const hasEnglish = (s: string) => (s.match(/[A-Za-z][A-Za-z0-9]*/g) ?? []).some(w => w.length > 1 && !KEEP.has(w));
const KEEP = new Set(['kg', 'RPE', 'RIR', 'e1RM', 'PR', '1RM']);

let table: Table | null = null;
const cache = new Map<string, string>();

/** An engine sentence in the app's language. */
export function te(sentence: string): string {
  if (getLang() !== 'zh') return sentence;
  const hit = cache.get(sentence);
  if (hit !== undefined) return hit;
  table ??= compileTable(ZH_ENGINE, { ...ZH, ...ZH_NAMES });
  const out = translateWith(table, sentence);
  cache.set(sentence, out);
  return out;
}
