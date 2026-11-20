#!/usr/bin/env node
// Blocks personal training data from entering git. Used by the pre-commit
// hook (staged files) and CI (all tracked files). See docs/PWA-SPEC.md §6.4.
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const mode = process.argv[2] === '--all' ? 'all' : 'staged';
const files = (mode === 'all'
  ? execSync('git ls-files', { encoding: 'utf8' })
  : execSync('git diff --cached --name-only --diff-filter=ACMR', { encoding: 'utf8' })
).split('\n').filter(Boolean);

// CSVs are allowed only in these folders (synthetic or public-domain fixtures).
const CSV_ALLOWED = [/^tools\/benchmarks\/fixtures\//, /^tools\/synthetic\/fixtures\//, /^web\/src\/.*\/__fixtures__\//];
// Header of the Notion training-log export followed by at least one data row
// (a row starting with a date). The header alone, e.g. quoted in docs, is fine.
const LOG_HEADER = /^[^\n]*\bExercise\b[^\n]*Weight \(kg\)[^\n]*\r?\n\s*[^\n]*?(\d{4}-\d{2}-\d{2}|[A-Z][a-z]+ \d{1,2}, \d{4})/m;
// Optional local markers (Notion IDs etc.), kept in the ignored private folder.
const markerFile = 'testdata/private/markers.txt';
const markers = existsSync(markerFile)
  ? readFileSync(markerFile, 'utf8').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'))
  : [];

const problems = [];
for (const f of files) {
  if (f.startsWith('testdata/private/')) { problems.push(`${f}: private test data`); continue; }
  if (/\.(db|sqlite|db-wal|db-shm)$/.test(f)) { problems.push(`${f}: database file`); continue; }
  if (/(^|\/)config\.yaml$/.test(f)) { problems.push(`${f}: personal program config`); continue; }
  const allowed = CSV_ALLOWED.some(re => re.test(f));
  if (/\.csv$/i.test(f) && !allowed) { problems.push(`${f}: CSV outside an allowed fixture folder`); continue; }
  if (!existsSync(f)) continue;
  let text;
  try { text = readFileSync(f, 'utf8'); } catch { continue; }
  if (!allowed && LOG_HEADER.test(text)) problems.push(`${f}: contains a training-log CSV header`);
  for (const m of markers) if (text.includes(m)) problems.push(`${f}: contains a private marker`);
}

if (problems.length) {
  console.error('Private-data check FAILED:\n  ' + problems.join('\n  '));
  console.error('\nPersonal data must stay in testdata/private/ (git-ignored).');
  process.exit(1);
}
console.log(`Private-data check passed (${files.length} ${mode} file(s)).`);
