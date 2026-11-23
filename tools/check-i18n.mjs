#!/usr/bin/env node
// Fails when screen text skips t(): JSX text with English words, or a
// user-facing JSX attribute (label, title, aria-label, placeholder, …) set to an
// English string literal. Text built in plain .ts files is covered by the
// keys test and the browser sweep, not here. A line may opt out with a
// trailing `// i18n-ok` comment (data shown as is, e.g. a CSV header).
// Usage: node tools/check-i18n.mjs [srcDir]   (default: web/src)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const dir = process.argv[2] ?? 'web/src';
const ATTRS = new Set(['label', 'title', 'aria-label', 'placeholder', 'confirmLabel', 'confirmText', 'backLabel', 'alt', 'subtitle', 'caption', 'hint', 'note', 'emptyText', 'cta', 'doneLabel', 'cancelLabel', 'actionLabel', 'heading', 'description', 'unit', 'suffix', 'prefix', 'help', 'text', 'message', 'value-label']);
// Words that stay in Latin letters in both languages.
const KEEP = new Set(['kg', 'RPE', 'RIR', 'e1RM', 'PR', 'PRs', '1RM', 'EN', 'CSV', 'BW', 'x', 'OK', 'GymBro', 'gym', 'app', 'FitnessVolt', 'CC', 'BY']);
const english = s => (s.match(/[A-Za-z][A-Za-z0-9]*/g) ?? []).some(w => !KEEP.has(w) && /[A-Za-z]{2,}/.test(w));

const hits = [];
const walk = d => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) { if (!/[/\\](dev|__fixtures__|zh)$/.test(p)) walk(p); continue; }
    if (!n.endsWith('.tsx') || n.endsWith('.test.tsx')) continue;
    const text = readFileSync(p, 'utf8');
    const lines = text.split('\n');
    const sf = ts.createSourceFile(p, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const flag = (node, what) => {
      const line = sf.getLineAndCharacterOfPosition(node.getStart()).line;
      if (/\/\/\s*i18n-ok/.test(lines[line])) return;
      hits.push(`${relative(process.cwd(), p)}:${line + 1}  ${what}`);
    };
    const visit = node => {
      if (ts.isJsxText(node) && english(node.text)) flag(node, JSON.stringify(node.text.trim()));
      if (ts.isJsxAttribute(node) && ATTRS.has(node.name.getText())) {
        let init = node.initializer;
        if (init && ts.isJsxExpression(init)) init = init.expression;
        if (init && (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) && english(init.text)) flag(node, `${node.name.getText()}=${JSON.stringify(init.text)}`);
        if (init && ts.isTemplateExpression(init) && english(init.head.text + init.templateSpans.map(s => s.literal.text).join(' '))) flag(node, `${node.name.getText()}={\`…\`}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
};
walk(dir);
if (hits.length) {
  console.error(`i18n check FAILED: ${hits.length} English text(s) not wrapped in t()/tr():\n  ` + hits.join('\n  '));
  process.exit(1);
}
console.log('i18n check passed: no unwrapped English in JSX.');
