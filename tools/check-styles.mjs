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
// Names only tokens.css may define: a custom property with one of these can't be made up elsewhere.
const RESERVED = /^--(text-|track-|font-|space-|touch-|tabbar-)|^--(hair|rule-w|focus-w|gutter|section|paper|ink|accent|select|mid|rule|grain|dim|on-ink|behind)$/;
const LINE_VARS = /var\(--(hair|rule-w|focus-w)\)/g;
const COLOUR_VARS = /var\(--(ink|accent|select|mid|rule|paper|on-ink|dim|behind)\)/g;

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
  if (prop === 'font' && !/^(var\(--text-[a-z0-9-]+\)|inherit)$/.test(v)) out.push('font');
  if (prop === 'font-size' && v !== 'inherit') out.push('font');
  if (prop === 'font-weight' && !/^(var\(--font-strong\)|inherit)$/.test(v)) out.push('font');
  if (prop === 'font-family' && !/^(var\(--font-(sans|mono|glyph)\)|inherit)$/.test(v)) out.push('font');
  if (prop === 'letter-spacing' && !/^(var\(--track-[a-z0-9-]+\)|0|inherit|normal)$/.test(v)) out.push('tracking');
  if (/^(padding|margin)(-(top|right|bottom|left|inline|block)(-(start|end))?)?$|^(row-|column-)?gap$/.test(prop)) {
    const rest = v.replace(SPACE_VARS, '').replace(/env\([^)]*\)/g, '');
    const scaled = [...rest.matchAll(/(-?\d*\.?\d+)\s*\*|\*\s*(-?\d*\.?\d+)|\/\s*-?\d/g)].some(m => m[0].startsWith('/') || (m[1] ?? m[2]) !== '-1');
    if (LENGTH.test(rest) || /var\(/.test(rest) || scaled) out.push('spacing');
  }
  if (/^(border(-(top|right|bottom|left))?(-width)?|outline(-width)?)$/.test(prop)) {
    const rest = v.replace(LINE_VARS, '').replace(COLOUR_VARS, '');
    if (LENGTH.test(rest) || /\b(thin|medium|thick)\b/.test(rest) || /var\(|calc\(/.test(rest)) out.push('border');
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
  // Every block, innermost first: scan its own declarations, then blank it out so
  // the block around it sees only its own (nesting, @media and @supports included).
  let work = clean;
  const block = /\{([^{}]*)\}/g;
  while (work.includes('{')) {
    const found = [...work.matchAll(block)];
    if (!found.length) break; // unbalanced braces: nothing more to scan
    for (const b of found) scanBody(b[1], b.index + 1);
    work = work.replace(block, m => ' '.repeat(m.length));
  }

  function scanBody(body, start) {
    let capsAt = -1, capsDecl = '', upper = false, lowerAt = -1, lowerDecl = '', famAt = -1, famDecl = '', roleSeen = false;
    const decl = /([a-z-]+)\s*:\s*([^;]+)/gi;
    let d;
    while ((d = decl.exec(body))) {
      const prop = d[1].toLowerCase(), value = d[2];
      const at = start + d.index;
      if (prop.startsWith('--')) {
        // A custom property can't use a reserved token name or carry a colour.
        if (RESERVED.test(prop)) report(at, 'token', d[0]);
        else if (COLOUR.test(value)) report(at, 'colour', d[0]);
        continue;
      }
      for (const rule of cssRule(prop, value)) report(at, rule, d[0]);
      if (prop === 'font' && /var\(--text-/.test(value)) roleSeen = true;
      if (prop === 'font-family') { famAt = at; famDecl = d[0]; }
      if (prop === 'font' && CAPS_ROLES.test(value)) { capsAt = at; capsDecl = d[0]; }
      if (prop === 'font' && /var\(--text-/.test(value) && !CAPS_ROLES.test(value)) { lowerAt = at; lowerDecl = d[0]; }
      if (prop === 'text-transform' && /uppercase/.test(value)) upper = true;
    }
    if (capsAt >= 0 && !upper) report(capsAt, 'caps', capsDecl);
    if (lowerAt >= 0 && upper) report(lowerAt, 'caps', lowerDecl); // roles have no case variants
    if (roleSeen && famAt >= 0) report(famAt, 'font', famDecl); // a role already fixes the family
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

/**
 * The no-dot rule (docs/DESIGN.md): a middle dot with whitespace beside it is a
 * separator, and separators are a gap, a comma, parentheses or a colon instead.
 * A lone '·' (a placeholder glyph) and the escape \u00B7 pass; comments are ignored.
 */
export function checkText(text, file) {
  const lines = text.split('\n');
  const clean = text
    .replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, ' '))
    .split('\n')
    .map(l => l.replace(/(^|\s)\/\/.*$/, '$1'));
  const violations = [], allowed = [];
  clean.forEach((l, i) => {
    if (!/\s\u00B7|\u00B7\s/.test(l)) return;
    const reason = allowReason(lines[i]);
    if (reason) allowed.push({ file, line: i + 1, rule: 'dot', reason });
    else violations.push({ file, line: i + 1, rule: 'dot', text: lines[i].trim() });
  });
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
    if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith('.d.ts')) {
      const t = checkText(readFileSync(p, 'utf8'), relative(srcDir, p));
      violations.push(...t.violations); allowed.push(...t.allowed);
    }
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
