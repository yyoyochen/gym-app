#!/usr/bin/env node
// The design-system check (docs/superpowers/specs/2026-11-22-design-system-design.md).
// Fails on any style that goes around the tokens: raw fonts, letter spacing,
// spacing lengths, border/outline widths, colours, radius, shadows, and the
// same in TSX inline styles. A same-line `ds-allow: <reason>` comment moves a
// line to the allowed list; the reason is required.
//   node tools/check-styles.mjs web/src
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKIP_CSS = new Set(['tokens.css', 'type.css', 'dither.css']);
const CAPS_ROLES = /var\(--text-(label|stamp|button|micro)\)/;
const SPACE_VARS = /var\(--(space-[a-z0-9]+|gutter|section|touch-min|touch-commit|tabbar-h)\)/g;
const LENGTH = /-?\d*\.?\d+(px|rem|em|vh|vw|ch)\b/;
const COLOUR = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i;

/** `ds-allow: reason` on a line → the reason, '' when present but empty, null when absent. */
function allowReason(line) {
  const m = /ds-allow:([^*}\n]*)/.exec(line);
  return m ? m[1].trim() : null;
}

function lineAt(text, offset) {
  let n = 1;
  for (let i = 0; i < offset; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

function cssRule(prop, value) {
  const v = value.replace(/!important/i, '').trim();
  const out = [];
  if (COLOUR.test(v)) out.push('colour');
  if (/^font(-size|-weight|-family)?$/.test(prop) && !/^(var\(--(text|font)-[a-z0-9-]+\)|inherit)$/.test(v)) out.push('font');
  if (prop === 'letter-spacing' && !/^(var\(--track-[a-z0-9-]+\)|0|inherit|normal)$/.test(v)) out.push('tracking');
  if (/^(padding|margin)(-(top|right|bottom|left|inline|block)(-(start|end))?)?$|^(row-|column-)?gap$/.test(prop)) {
    const rest = v.replace(SPACE_VARS, '').replace(/env\([^)]*\)/g, '');
    if (LENGTH.test(rest) || /var\(/.test(rest)) out.push('spacing');
  }
  if (/^(border(-(top|right|bottom|left))?(-width)?|outline(-width)?)$/.test(prop)) {
    const rest = v.replace(/var\(--(hair|rule-w)\)/g, '');
    if (LENGTH.test(rest) || /\b(thin|medium|thick)\b/.test(rest)) out.push('border');
  }
  if (/radius$/.test(prop) && !/^0(px)?$/.test(v)) out.push('radius');
  if (/^(box|text)-shadow$/.test(prop) && v !== 'none') out.push('shadow');
  return out;
}

export function checkCss(text, file) {
  const lines = text.split('\n');
  // Blank out comments (keeping offsets and newlines) so they can't hold braces or semicolons.
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, ' '));
  const violations = [], allowed = [];
  const report = (offset, rule, decl) => {
    const line = lineAt(text, offset);
    const reason = allowReason(lines[line - 1]);
    if (reason) allowed.push({ file, line, rule, reason });
    else violations.push({ file, line, rule, text: decl.trim() });
  };
  // Innermost blocks only: those are the rule bodies that hold declarations.
  const block = /\{([^{}]*)\}/g;
  let b;
  while ((b = block.exec(clean))) {
    const body = b[1], start = b.index + 1;
    let capsAt = -1, capsDecl = '', upper = false;
    const decl = /([a-z-]+)\s*:\s*([^;]+)/gi;
    let d;
    while ((d = decl.exec(body))) {
      const prop = d[1].toLowerCase(), value = d[2];
      if (prop.startsWith('--')) continue;
      const at = start + d.index;
      for (const rule of cssRule(prop, value)) report(at, rule, d[0]);
      if (prop === 'font' && CAPS_ROLES.test(value)) { capsAt = at; capsDecl = d[0]; }
      if (prop === 'text-transform' && /uppercase/.test(value)) upper = true;
    }
    if (capsAt >= 0 && !upper) report(capsAt, 'caps', capsDecl);
  }
  return { violations, allowed };
}

const INLINE_KEYS = /\b(fontSize|fontWeight|fontFamily|letterSpacing|padding\w*|margin\w*|gap|rowGap|columnGap)\s*:\s*([^,}]+)/g;

export function checkTsx(text, file) {
  const lines = text.split('\n');
  const violations = [], allowed = [];
  const style = /style=\{\{([\s\S]*?)\}\}/g;
  let s;
  while ((s = style.exec(text))) {
    let k;
    INLINE_KEYS.lastIndex = 0;
    while ((k = INLINE_KEYS.exec(s[1]))) {
      const v = k[2].trim();
      const raw = /^-?\d/.test(v) || (/^['"`]/.test(v) && LENGTH.test(v.replace(/var\([^)]*\)/g, '')));
      if (!raw) continue;
      const line = lineAt(text, s.index + 8 + k.index);
      const reason = allowReason(lines[line - 1]);
      if (reason) allowed.push({ file, line, rule: 'inline', reason });
      else violations.push({ file, line, rule: 'inline', text: k[0].trim() });
    }
  }
  return { violations, allowed };
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === '__fixtures__' || name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

export function checkStyles(srcDir) {
  const violations = [], allowed = [];
  for (const p of walk(srcDir)) {
    const name = p.split('/').pop();
    let r = null;
    if (name.endsWith('.css') && !SKIP_CSS.has(name)) r = checkCss(readFileSync(p, 'utf8'), relative(srcDir, p));
    else if (name.endsWith('.tsx') && !/\.test\.tsx$/.test(name)) r = checkTsx(readFileSync(p, 'utf8'), relative(srcDir, p));
    if (r) { violations.push(...r.violations); allowed.push(...r.allowed); }
  }
  return { violations, allowed };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = process.argv[2] ?? 'web/src';
  const { violations, allowed } = checkStyles(dir);
  for (const v of violations) console.log(`✗ ${v.file}:${v.line} [${v.rule}] ${v.text}`);
  for (const a of allowed) console.log(`  allowed ${a.file}:${a.line} [${a.rule}] ${a.reason}`);
  console.log(`check-styles: ${violations.length} violations, ${allowed.length} allowed`);
  if (violations.length) process.exit(1);
}
